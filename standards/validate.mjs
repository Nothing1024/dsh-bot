#!/usr/bin/env node
/**
 * dsh-community-standard v0.15 对齐检查器（自包含，零依赖）。
 *
 * 做四件事，全部离线、不执行任何插件代码：
 *   1. Manifest 校验：packages/*\/dsh-plugin.json 按 spec/manifest.md 的 v0.15
 *      规则做静态校验（含 JSON Schema 表达不了的两条：contributes id 去重、
 *      entry 不得越出包根目录），并做跨包 contributes id 冲突检测。
 *   2. 协商：对每份 manifest 与 standards/host-descriptor.json 跑纯函数协商
 *      （required 缺失 = incompatible 拒载；optional 缺失 = degraded 降级）。
 *   3. Fixtures 自检：standards/fixtures/valid 必须全过，invalid 必须各自
 *      报出预期错误码（"每条必须配一个违反它的 fixture"）。
 *   4. Adapter 审计：扫描 packages/*\/src 里对上游包（@deepseek-ai/*、cordis、
 *      schemastery）以及邻仓 session-tool / session-marks 的 import，比对
 *      standards/adapter-baseline.json 基线——新增触点必须显式评审
 *      （--update-baseline 更新基线）。
 *
 * 用法：node standards/validate.mjs [--update-baseline]
 * 退出码：0 = 全部通过；1 = 任一环节失败。
 *
 * 上游标准：https://github.com/oh-my-dsh/dsh-community-standard （Draft v0.15）
 * 本脚本是仓库本地纪律工具，不是标准的一致性认证。
 */

import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { dirname, join, resolve, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'

const STANDARDS_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(STANDARDS_DIR, '..')
const PACKAGES_DIR = join(REPO_ROOT, 'packages')
const DESCRIPTOR_PATH = join(STANDARDS_DIR, 'host-descriptor.json')
const BASELINE_PATH = join(STANDARDS_DIR, 'adapter-baseline.json')
const FIXTURES_DIR = join(STANDARDS_DIR, 'fixtures')

const CANONICAL_SCHEMA_ID = 'https://dsh-std.example/schemas/dsh-plugin/v0.15.json'
const ID_RE = /^[a-z][a-z0-9]*(\.[a-z0-9][a-z0-9-]*)+$/
const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/
const TOP_FIELDS = new Set(['$schema', 'id', 'name', 'version', 'manifestVersion', 'facets', 'requires', 'permissions', 'contributes', 'subscriptions'])
const UPSTREAM_RE = /^(@deepseek-ai\/|cordis$|schemastery$|session-tool$|session-marks$)/

// ---------------------------------------------------------------- manifest 校验

/**
 * 按 v0.15 规则校验一份 manifest。
 * @param {unknown} m - 解析后的 JSON。
 * @returns {{code: string, msg: string}[]} 错误列表（空 = 合法）。
 */
function validateManifest(m) {
  const errors = []
  const err = (code, msg) => errors.push({ code, msg })
  if (typeof m !== 'object' || m === null || Array.isArray(m)) {
    err('not-object', 'manifest 必须是 JSON object')
    return errors
  }
  for (const k of Object.keys(m)) {
    if (k === 'provides') err('provides-rejected', 'provides 归 RFC 0003，v0.15 必须拒绝（fail closed，不静默忽略）')
    else if (!TOP_FIELDS.has(k)) err('unknown-field', `顶层未定义字段：${k}`)
  }
  if (typeof m.$schema !== 'string' || m.$schema !== CANONICAL_SCHEMA_ID) {
    err('missing-schema', `缺 $schema 或值不可识别（要求 ${CANONICAL_SCHEMA_ID}）`)
  }
  if (m.manifestVersion !== '0.15') err('wrong-manifest-version', `manifestVersion 必须为 "0.15"，实为 ${JSON.stringify(m.manifestVersion)}`)
  if (typeof m.id !== 'string' || !ID_RE.test(m.id)) err('bad-id', `id 必须是小写反向域名（至少两段），实为 ${JSON.stringify(m.id)}`)
  if (typeof m.name !== 'string' || m.name.length === 0) err('bad-name', 'name 必须是非空字符串')
  if (typeof m.version !== 'string' || !SEMVER_RE.test(m.version)) err('bad-version', `version 必须是 SemVer，实为 ${JSON.stringify(m.version)}`)

  if (typeof m.facets !== 'object' || m.facets === null || Array.isArray(m.facets) || !('host' in m.facets)) {
    err('missing-facets', '缺 facets 或缺 host facet')
  } else {
    for (const [facetName, facet] of Object.entries(m.facets)) {
      if (facetName === 'client' || facetName === 'worker') {
        err('reserved-facet', `facet 名 ${facetName} 为保留名（归 RFC 0002），v0.15 必须拒绝`)
        continue
      }
      if (typeof facet !== 'object' || facet === null || Array.isArray(facet)) {
        err('bad-facet', `facet ${facetName} 必须是 object`)
        continue
      }
      for (const k of Object.keys(facet)) {
        if (k !== 'entry' && k !== 'apiVersion') err('bad-facet', `facet ${facetName} 出现未定义字段 ${k}`)
      }
      if (typeof facet.entry !== 'string' || facet.entry.length === 0) {
        err('bad-facet', `facet ${facetName} 缺 entry`)
      } else if (isAbsolute(facet.entry) || facet.entry.split(/[\\/]/).includes('..')) {
        err('entry-outside-root', `facet ${facetName} 的 entry 越出包根目录：${facet.entry}`)
      }
      if (typeof facet.apiVersion !== 'string' || facet.apiVersion.length === 0) err('bad-facet', `facet ${facetName} 缺 apiVersion`)
    }
  }

  if ('requires' in m) {
    if (typeof m.requires !== 'object' || m.requires === null || Array.isArray(m.requires)) {
      err('bad-requires', 'requires 必须是 object')
    } else {
      for (const k of Object.keys(m.requires)) {
        if (k === 'services') err('requires-services-rejected', 'requires.services 归 RFC 0003，v0.15 必须拒绝')
        else if (k !== 'contracts') err('bad-requires', `requires 出现未定义键 ${k}`)
      }
      if ('contracts' in m.requires) {
        if (!Array.isArray(m.requires.contracts)) {
          err('bad-requires', 'requires.contracts 必须是数组')
        } else {
          for (const c of m.requires.contracts) {
            if (typeof c !== 'object' || c === null || Array.isArray(c)) { err('bad-contract', '契约条目必须是 object'); continue }
            for (const k of Object.keys(c)) {
              if (!['apiVersion', 'kind', 'optional'].includes(k)) err('bad-contract', `契约条目出现未定义字段 ${k}`)
            }
            if (typeof c.apiVersion !== 'string' || c.apiVersion.length === 0) err('bad-contract', '契约条目缺 apiVersion')
            if (typeof c.kind !== 'string' || c.kind.length === 0) err('bad-contract', '契约条目缺 kind')
            if ('optional' in c && typeof c.optional !== 'boolean') err('bad-contract', 'optional 必须是 boolean')
          }
        }
      }
    }
  }

  if ('permissions' in m && (!Array.isArray(m.permissions) || m.permissions.some((p) => typeof p !== 'string' || p.length === 0))) {
    err('bad-permissions', 'permissions 必须是非空字符串数组')
  }

  if ('contributes' in m) {
    const c = m.contributes
    if (typeof c !== 'object' || c === null || Array.isArray(c)) {
      err('bad-contributes', 'contributes 必须是 object')
    } else {
      for (const k of Object.keys(c)) {
        if (k !== 'commands') err('bad-contributes', `v0.15 只定义 contributes.commands，出现 ${k}`)
      }
      if ('commands' in c) {
        if (!Array.isArray(c.commands)) {
          err('bad-contributes', 'contributes.commands 必须是数组')
        } else {
          const seen = new Set()
          for (const cmd of c.commands) {
            if (typeof cmd !== 'object' || cmd === null || Array.isArray(cmd)) { err('bad-contributes', 'command 条目必须是 object'); continue }
            for (const k of Object.keys(cmd)) {
              if (k !== 'id' && k !== 'title') err('bad-contributes', `command 条目出现未定义字段 ${k}`)
            }
            if (typeof cmd.id !== 'string' || cmd.id.length === 0) {
              err('bad-contributes', 'command 条目缺 id')
            } else {
              if (seen.has(cmd.id)) err('duplicate-contributes-id', `contributes.commands id 重复：${cmd.id}`)
              seen.add(cmd.id)
            }
            if (typeof cmd.title !== 'string' || cmd.title.length === 0) err('bad-contributes', 'command 条目缺 title')
          }
        }
      }
    }
  }

  if ('subscriptions' in m && (!Array.isArray(m.subscriptions) || m.subscriptions.some((s) => typeof s !== 'string' || s.length === 0))) {
    err('bad-subscriptions', 'subscriptions 必须是非空字符串数组')
  }
  return errors
}

// ---------------------------------------------------------------- 协商（纯函数）

/**
 * manifest × descriptor → 兼容判定（spec/negotiation.md 的最小实现）。
 * @param {object} manifest - 合法 manifest。
 * @param {object} descriptor - 合法 host descriptor。
 * @returns {{status: 'compatible'|'degraded'|'incompatible', missingRequired: string[], missingOptional: string[]}}
 */
function negotiate(manifest, descriptor) {
  const caps = new Set(descriptor.capabilities.map((c) => `${c.apiVersion} # ${c.kind}`))
  const missingRequired = []
  const missingOptional = []
  for (const c of manifest.requires?.contracts ?? []) {
    const key = `${c.apiVersion} # ${c.kind}`
    if (!caps.has(key)) (c.optional === true ? missingOptional : missingRequired).push(key)
  }
  const status = missingRequired.length > 0 ? 'incompatible' : missingOptional.length > 0 ? 'degraded' : 'compatible'
  return { status, missingRequired, missingOptional }
}

/**
 * 最小 descriptor 校验（结构齐全即可，语义以 spec/host-descriptor.md 为准）。
 * @param {unknown} d - 解析后的 JSON。
 * @returns {string[]} 错误消息列表。
 */
function validateDescriptor(d) {
  const errors = []
  if (typeof d !== 'object' || d === null) return ['descriptor 必须是 JSON object']
  if (d.descriptorVersion !== '0.15') errors.push('descriptorVersion 必须为 "0.15"')
  if (typeof d.id !== 'string' || !ID_RE.test(d.id)) errors.push('id 必须是反向域名语法')
  if (typeof d.execution !== 'object' || d.execution === null || d.execution.environment !== 'node' || d.execution.trustMode !== 'trusted-in-process') {
    errors.push('execution 必须为 { environment: "node", trustMode: "trusted-in-process" }（v0.15 唯一档位）')
  }
  if (!Array.isArray(d.capabilities)) {
    errors.push('capabilities 必须是数组')
  } else {
    for (const c of d.capabilities) {
      if (typeof c !== 'object' || c === null || typeof c.apiVersion !== 'string' || typeof c.kind !== 'string' || Object.keys(c).length !== 2) {
        errors.push(`capability 条目必须恰好含 apiVersion + kind：${JSON.stringify(c)}`)
      }
    }
  }
  return errors
}

// ---------------------------------------------------------------- adapter 审计

/**
 * 递归收集目录下的源码文件。
 * @param {string} dir - 目录绝对路径。
 * @returns {string[]} 文件绝对路径列表。
 */
function sourceFilesOf(dir) {
  const out = []
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    const st = statSync(p)
    if (st.isDirectory()) out.push(...sourceFilesOf(p))
    else if (/\.(ts|tsx|mts|cts|js|mjs|jsx)$/.test(entry)) out.push(p)
  }
  return out
}

/**
 * 从一份源码文本提取 import/require 说明符。
 * @param {string} source - 源码文本。
 * @returns {string[]} 说明符列表。
 */
function importSpecifiersOf(source) {
  const specs = []
  const patterns = [
    /(?:import|export)\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/g,
    /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]
  for (const re of patterns) {
    for (const match of source.matchAll(re)) specs.push(match[1])
  }
  return specs
}

/**
 * 扫描 packages/*\/src 的上游触点。
 * @returns {Record<string, string[]>} 包名 → 排序去重后的上游说明符。
 */
function scanUpstreamTouches() {
  const result = {}
  for (const pkg of readdirSync(PACKAGES_DIR)) {
    const srcDir = join(PACKAGES_DIR, pkg, 'src')
    const specs = new Set()
    for (const file of sourceFilesOf(srcDir)) {
      for (const spec of importSpecifiersOf(readFileSync(file, 'utf8'))) {
        if (UPSTREAM_RE.test(spec)) specs.add(spec)
      }
    }
    if (specs.size > 0) result[pkg] = [...specs].sort()
  }
  return result
}

// ---------------------------------------------------------------- 主流程

/** @type {Record<string, string>} invalid fixture 文件名 → 必须报出的错误码。 */
const INVALID_FIXTURE_EXPECT = {
  'missing-schema.json': 'missing-schema',
  'wrong-manifest-version.json': 'wrong-manifest-version',
  'missing-facets.json': 'missing-facets',
  'bad-id.json': 'bad-id',
  'unknown-field.json': 'unknown-field',
  'provides-rejected.json': 'provides-rejected',
  'requires-services-rejected.json': 'requires-services-rejected',
  'reserved-facet-client.json': 'reserved-facet',
  'duplicate-contributes-id.json': 'duplicate-contributes-id',
  'entry-outside-root.json': 'entry-outside-root',
}

function main() {
  const updateBaseline = process.argv.includes('--update-baseline')
  let failed = false
  const section = (title) => console.log(`\n== ${title} ==`)

  // 1. manifest 校验 + 跨包 contributes 冲突
  section('manifest 校验（packages/*/dsh-plugin.json）')
  const manifests = []
  for (const pkg of readdirSync(PACKAGES_DIR).sort()) {
    const manifestPath = join(PACKAGES_DIR, pkg, 'dsh-plugin.json')
    if (!existsSync(manifestPath)) continue
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    const errors = validateManifest(manifest)
    if (errors.length > 0) {
      failed = true
      console.log(`✗ ${pkg}`)
      for (const e of errors) console.log(`    [${e.code}] ${e.msg}`)
    } else {
      console.log(`✓ ${pkg} (${manifest.id})`)
      manifests.push({ pkg, manifest })
    }
  }
  if (manifests.length === 0) {
    console.log('✗ 未发现任何 dsh-plugin.json')
    failed = true
  }
  const commandOwners = new Map()
  for (const { pkg, manifest } of manifests) {
    for (const cmd of manifest.contributes?.commands ?? []) {
      const prior = commandOwners.get(cmd.id)
      if (prior !== undefined && prior !== pkg) {
        failed = true
        console.log(`✗ 跨包 contributes.commands id 冲突：${cmd.id}（${prior} 与 ${pkg} 不能共存）`)
      }
      commandOwners.set(cmd.id, pkg)
    }
  }

  // 2. 协商
  section('协商（manifest × host-descriptor）')
  const descriptor = JSON.parse(readFileSync(DESCRIPTOR_PATH, 'utf8'))
  const descriptorErrors = validateDescriptor(descriptor)
  if (descriptorErrors.length > 0) {
    failed = true
    for (const e of descriptorErrors) console.log(`✗ descriptor: ${e}`)
  } else {
    for (const { pkg, manifest } of manifests) {
      const report = negotiate(manifest, descriptor)
      if (report.status === 'incompatible') {
        failed = true
        console.log(`✗ ${pkg}: 拒载 —— required 契约缺失：${report.missingRequired.join('、')}`)
      } else if (report.status === 'degraded') {
        console.log(`△ ${pkg}: 降级运行 —— optional 契约缺失：${report.missingOptional.join('、')}`)
      } else {
        console.log(`✓ ${pkg}: compatible`)
      }
    }
  }

  // 3. fixtures 自检
  section('fixtures 自检')
  const validDir = join(FIXTURES_DIR, 'valid')
  const invalidDir = join(FIXTURES_DIR, 'invalid')
  for (const f of readdirSync(validDir).sort()) {
    const errors = validateManifest(JSON.parse(readFileSync(join(validDir, f), 'utf8')))
    if (errors.length > 0) {
      failed = true
      console.log(`✗ valid/${f} 应通过却报错：${errors.map((e) => e.code).join('、')}`)
    } else {
      console.log(`✓ valid/${f}`)
    }
  }
  for (const [f, expectedCode] of Object.entries(INVALID_FIXTURE_EXPECT)) {
    const path = join(invalidDir, f)
    if (!existsSync(path)) {
      failed = true
      console.log(`✗ invalid/${f} 缺失`)
      continue
    }
    const errors = validateManifest(JSON.parse(readFileSync(path, 'utf8')))
    if (errors.some((e) => e.code === expectedCode)) {
      console.log(`✓ invalid/${f} → [${expectedCode}]`)
    } else {
      failed = true
      console.log(`✗ invalid/${f} 未报出预期错误码 ${expectedCode}（实报：${errors.map((e) => e.code).join('、') || '无'}）`)
    }
  }

  // 4. adapter 审计
  section('adapter 审计（上游触点基线）')
  const current = scanUpstreamTouches()
  if (updateBaseline || !existsSync(BASELINE_PATH)) {
    writeFileSync(BASELINE_PATH, JSON.stringify({
      $comment: '上游触点基线：packages/*/src 中 import 的上游说明符（@deepseek-ai/*、cordis、schemastery）以及邻仓 session-tool / session-marks。新增触点属于耦合面扩张，须评审后用 --update-baseline 更新；目标是把触点收敛进未来的版本化 adapter 层（对齐 dsh-community-standard 原则⑤）。',
      packages: current,
    }, null, 2) + '\n')
    console.log(`✓ 基线已写入 ${BASELINE_PATH}`)
  } else {
    const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')).packages
    for (const [pkg, specs] of Object.entries(current)) {
      const known = new Set(baseline[pkg] ?? [])
      const added = specs.filter((s) => !known.has(s))
      if (added.length > 0) {
        failed = true
        console.log(`✗ ${pkg}: 新增上游触点未过评审：${added.join('、')}（评审后 --update-baseline）`)
      }
    }
    for (const [pkg, specs] of Object.entries(baseline)) {
      const now = new Set(current[pkg] ?? [])
      const removed = specs.filter((s) => !now.has(s))
      if (removed.length > 0) {
        console.log(`△ ${pkg}: 基线中的触点已消失（收敛，建议 --update-baseline 固化）：${removed.join('、')}`)
      }
    }
    if (!failed) console.log('✓ 无未评审的新增上游触点')
  }

  console.log(failed ? '\n结论：存在未通过项' : '\n结论：全部通过')
  process.exit(failed ? 1 : 0)
}

main()
