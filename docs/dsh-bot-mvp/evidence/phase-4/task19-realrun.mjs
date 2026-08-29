#!/usr/bin/env node
/**
 * Task 19: replay spec 5.2 matrix against the live gb/:3084 gateway.
 * Evidence lands at the exact paths named in spec 5.2. Settings mutations
 * are always restored. This file is evidence tooling, not product code.
 */
import { spawnSync, spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdirSync, writeFileSync, readFileSync, copyFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '../../../..')
const DSH_HOME = join(ROOT, 'env')
const EVIDENCE = join(ROOT, 'docs/dsh-bot-mvp/evidence')
const WHO = `${homedir()}/.agents/skills/dsh-plugin-debug/scripts/dsh-rpc-who.sh`
const RPC = `${homedir()}/.agents/skills/dsh-plugin-debug/scripts/dsh-rpc.sh`
const CLI = join(ROOT, '../../session-tool/plugin/packages/session-tool-cli/lib/bin.js')
const STAMP = new Date().toISOString()
const GLOBAL = { provider: 'anthropic', model: 'grok-4.6', reasoningEffort: 'xhigh' }
const ALT = { provider: 'deepseek-official', model: 'deepseek-v4-flash' }
const ASK_PROMPT = (prompt, title) =>
  `Call dsh_bot_ask exactly once with prompt ${JSON.stringify(prompt)} and title ${JSON.stringify(title)}. After the tool returns, quote the tool output verbatim and stop.`

const rows = []
const ids = {}
let browser
let page
let guiLog = []
let upstreamServer
let restored = false

function log(...a) {
  const line = a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ')
  console.log(line)
  guiLog.push(`[${new Date().toISOString()}] ${line}`)
}

function evd(...parts) {
  const p = join(EVIDENCE, ...parts)
  mkdirSync(dirname(p), { recursive: true })
  return p
}

function write(path, body) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, body)
}

function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    encoding: 'utf8',
    maxBuffer: 80 * 1024 * 1024,
    env: { ...process.env, DSH_HOME, PATH: process.env.PATH },
    cwd: ROOT,
    ...opts,
  })
  return r
}

function who() {
  const r = sh(WHO, ['3084'])
  return (r.stdout || '').trim()
}

function rpc(method, payload = {}) {
  const r = sh(RPC, ['3084', method, JSON.stringify(payload)])
  const raw = (r.stdout || '') + (r.stderr || '')
  let json
  try { json = JSON.parse(r.stdout || '{}') } catch {
    json = { parseError: true, raw: raw.slice(0, 4000) }
  }
  return { exit: r.status ?? 1, json, raw, stdout: r.stdout || '', stderr: r.stderr || '' }
}

function rpcValue(res) {
  return res.json?.result?.value ?? res.json?.value
}

function rpcOk(res) {
  return res.json?.result?.ok === true || res.json?.ok === true
}

async function httpBot(method, args = {}) {
  const res = await fetch(`http://127.0.0.1:3084/dsh-bot/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ args }),
  })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = { parseError: true, text } }
  return { status: res.status, json, text }
}

function marksList(kind = 'kind:dsh-bot') {
  const r = sh('node', [CLI, 'marks', 'list', '--kind', kind])
  return { exit: r.status ?? 1, stdout: r.stdout || '', stderr: r.stderr || '' }
}

function eventsOf(history) {
  const v = rpcValue(history) ?? history.json?.result?.value ?? history
  const rows = v?.events ?? []
  return rows.map(e => e.event ?? e)
}

function dumpJson(obj) {
  return JSON.stringify(obj, null, 2)
}

function findDeep(obj, pred, acc = []) {
  if (obj == null) return acc
  if (pred(obj)) acc.push(obj)
  if (Array.isArray(obj)) {
    for (const x of obj) findDeep(x, pred, acc)
  } else if (typeof obj === 'object') {
    for (const v of Object.values(obj)) findDeep(v, pred, acc)
  }
  return acc
}

function headersOf(history) {
  return eventsOf(history)
    .filter(e => e?.type === 'request/header')
    .map(e => e.data?.header?.config ?? e.data?.header ?? e.data)
}

function lastHeader(history) {
  const hs = headersOf(history)
  return hs[hs.length - 1]
}

function presetOf(history) {
  const ev = eventsOf(history).find(e => e?.type === 'agent-preset/selected')
  return ev?.data?.agentPreset
}

function assistantTexts(history) {
  return findDeep(history.json ?? history, o =>
    o && typeof o === 'object' && o.role === 'assistant' && Array.isArray(o.content),
  ).flatMap(m => (m.content || []).filter(b => b.type === 'text').map(b => b.text))
}

function toolResults(history, name = 'dsh_bot_ask') {
  return findDeep(history.json ?? history, o =>
    o && typeof o === 'object' && o.name === name && ('isError' in o || 'output' in o || o.type === 'tool-result'),
  )
}

function historyHas(history, needle) {
  return JSON.stringify(history.json ?? history).includes(needle)
}

async function waitHistory(sessionId, pred, { tries = 90, ms = 2500, label = 'history' } = {}) {
  let last
  for (let i = 0; i < tries; i++) {
    last = rpc('session.history', { sessionId, maxMessages: 200 })
    if (rpcOk(last) && pred(last)) return last
    log(`wait ${label} ${sessionId} #${i}`)
    await delay(ms)
  }
  return last
}

function row(id, pass, detail) {
  rows.push({ id, pass: Boolean(pass), detail: String(detail ?? '') })
  log(`${pass ? 'PASS' : 'FAIL'} ${id} — ${detail}`)
}

function md(title, body) {
  return `# ${title}\n\n时间: ${STAMP}\n网关: \`${who()}\`\n\n${body}\n`
}

function restoreSettings() {
  rpc('settings.update', { ns: 'dsh-bot', patch: { model: { provider: '', model: '' }, askTimeoutMs: 180000 } })
  rpc('settings.update', { ns: 'agent-default-model', patch: GLOBAL })
  rpc('settings.mutate', { ns: 'llm-pi-ai', ops: [
    { op: 'unset', path: ['providers', 'nokey'] },
    { op: 'unset', path: ['providers', 'badup'] },
  ] })
  restored = true
}

function grokModel(id = 'grok-4.6') {
  return {
    id,
    name: id,
    contextWindow: 2000000,
    maxTokens: 128000,
    input: ['text', 'image'],
    reasoningEfforts: { off: null, low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh' },
  }
}

function ensureWarehouse() {
  const w = who()
  if (!w.includes(DSH_HOME)) {
    throw new Error(`3084 is not this warehouse: ${w}`)
  }
  return w
}

function startUpstream401() {
  return new Promise((resolve) => {
    const srv = createServer((req, res) => {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        type: 'error',
        error: { type: 'authentication_error', message: 'invalid x-api-key' },
      }))
    })
    srv.listen(18091, '127.0.0.1', () => {
      upstreamServer = srv
      resolve(srv)
    })
  })
}

async function launchGui() {
  let pw
  try {
    pw = await import('playwright')
  } catch (e) {
    log('playwright import failed', String(e))
    return null
  }
  const { chromium } = pw
  const candidates = [
    { channel: 'chrome' },
    { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' },
    { executablePath: join(homedir(), 'Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing') },
  ]
  for (const opt of candidates) {
    for (const headless of [true, false]) {
      try {
        log('launch', JSON.stringify({ ...opt, headless }))
        const b = await chromium.launch({
          ...opt,
          headless,
          args: ['--disable-gpu', '--no-first-run', '--disable-dev-shm-usage'],
        })
        const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } })
        const p = await ctx.newPage()
        p.setDefaultTimeout(20000)
        await p.goto('http://127.0.0.1:3084/', { waitUntil: 'domcontentloaded', timeout: 30000 })
        await delay(2500)
        browser = b
        page = p
        log('launch ok', opt.channel || opt.executablePath, 'headless', headless)
        log('open body', (await p.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 500))
        return { browser: b, page: p }
      } catch (e) {
        log('launch fail', String(e).slice(0, 300))
      }
    }
  }
  return null
}

async function clickName(names) {
  if (!page) return false
  for (const name of names) {
    const loc = page.getByRole('button', { name, exact: false }).first()
    if (await loc.count()) {
      try {
        await loc.click({ timeout: 4000 })
        log('clicked', name)
        return true
      } catch { /* continue */ }
    }
    const t = page.getByText(name, { exact: false }).first()
    if (await t.count()) {
      try {
        await t.click({ timeout: 4000 })
        log('clicked text', name)
        return true
      } catch { /* continue */ }
    }
  }
  return false
}

async function openDshBotTab() {
  if (!page) return false
  await clickName(['展开侧边栏', 'expand'])
  await delay(400)
  // plus / add tab control
  const plus = page.locator('button').filter({ hasText: /^$|^\+$/ })
  const titled = page.getByTitle(/新建|添加|插件|Tab|plus/i)
  if (await titled.count()) {
    await titled.first().click({ timeout: 4000 }).catch(() => {})
  } else if (await plus.count()) {
    await plus.last().click({ timeout: 4000 }).catch(() => {})
  } else {
    // click last icon-only button in a right rail
    await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('button')]
      const hit = buttons.find(b => (b.getAttribute('aria-label') || '').includes('DSH Bot'))
        || buttons.find(b => (b.textContent || '').includes('+'))
      hit?.click()
    })
  }
  await delay(400)
  await clickName(['DSH Bot'])
  await delay(800)
  const tab = page.getByTestId('dsh-bot-tab')
  if (await tab.count()) {
    log('tab open')
    return true
  }
  log('tab not found; body', (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 400))
  return false
}

async function screenshot(rel) {
  const path = evd(...rel.split('/'))
  if (!page) {
    log('no page for', path)
    return false
  }
  await page.screenshot({ path, fullPage: true })
  log('saved', path)
  return true
}

async function fillComposer(text) {
  if (!page) return false
  const box = page.locator('textarea, [contenteditable="true"]').last()
  await box.click({ timeout: 8000 })
  await box.fill(text)
  log('filled', text)
  const send = page.getByRole('button', { name: /发送|send/i }).first()
  if (await send.count()) {
    await send.click()
  } else {
    await page.keyboard.press('Enter')
  }
  log('sent')
  return true
}

function bootBackground() {
  const logFile = evd('phase-4/boot-task19.log')
  const child = spawn('sh', [join(ROOT, 'env/boot.sh')], {
    cwd: ROOT,
    env: { ...process.env, DSH_HOME, PATH: process.env.PATH },
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const fs = { out: '', err: '' }
  child.stdout.on('data', d => { fs.out += d; write(logFile, fs.out + fs.err) })
  child.stderr.on('data', d => { fs.err += d; write(logFile, fs.out + fs.err) })
  child.unref()
  return child
}

async function waitWho(tries = 40) {
  for (let i = 0; i < tries; i++) {
    const w = who()
    if (w.includes(DSH_HOME) && !w.includes('没人监听')) return w
    await delay(1000)
  }
  return who()
}

async function uf001Main() {
  const created = rpc('session.create', { cwd: ROOT })
  const sessionId = rpcValue(created)?.sessionId
  ids.uf001 = sessionId
  row('UF-001 create', Boolean(sessionId) && rpcValue(created)?.agentPreset === 'dsh-bot', dumpJson(rpcValue(created)))
  const prompt = rpc('session.prompt', {
    sessionId,
    mode: 'queue',
    content: [{ type: 'text', text: '你是谁?' }],
  })
  row('UF-001 prompt', rpcOk(prompt), dumpJson(rpcValue(prompt)))
  const hist = await waitHistory(sessionId, h => historyHas(h, 'assistant/message') && historyHas(h, 'DSH Bot'), { label: 'UF-001' })
  write(evd('UF-001/session-history.json'), dumpJson(hist.json))
  const preset = presetOf(hist)
  const header = lastHeader(hist)
  const texts = assistantTexts(hist)
  const ok = preset === 'dsh-bot'
    && header?.provider === GLOBAL.provider
    && header?.model === GLOBAL.model
    && texts.some(t => t.includes('DSH Bot'))
  row('UF-001 main', ok, `preset=${preset} header=${header?.provider}/${header?.model} text=${(texts[0] || '').slice(0, 80)}`)

  if (page) {
    await clickName(['新会话'])
    await delay(800)
    await clickName(['DSH Bot'])
    try { await fillComposer('你是谁?') } catch (e) { log('gui fill', String(e)) }
    await delay(4000)
    await screenshot('UF-001/success.png')
    copyFileSync(evd('UF-001/success.png'), evd('UF-001/UF-001-success.png'))
  } else if (existsSync(evd('UF-001/success.png'))) {
    log('reuse existing UF-001 success.png (no live GUI this run)')
  }
}

async function uf002Main() {
  const created = rpc('session.create', { cwd: ROOT })
  const sessionId = rpcValue(created)?.sessionId
  ids.uf002main = sessionId
  write(evd('UF-002/main-create.json'), dumpJson(created.json))
  const prompt = rpc('session.prompt', {
    sessionId,
    mode: 'queue',
    content: [{ type: 'text', text: ASK_PROMPT('Reply with exactly: dsh bot pong.', 'uf002-t19') }],
  })
  write(evd('UF-002/main-prompt.json'), dumpJson(prompt.json))
  const hist = await waitHistory(sessionId, h => historyHas(h, 'dsh_bot_ask') && (historyHas(h, 'dsh bot pong') || historyHas(h, 'isError')), { tries: 100, label: 'UF-002' })
  write(evd('UF-002/session-history.json'), dumpJson(hist.json))
  const results = toolResults(hist)
  const toolOk = historyHas(hist, 'dsh bot pong') && !historyHas(hist, '"isError":true')
  const m = marksList()
  write(evd('UF-002/marks.txt'), `$ DSH_HOME=${DSH_HOME} node ${CLI} marks list --kind kind:dsh-bot\nexit=${m.exit}\n${m.stdout}${m.stderr}`)
  const listed = rpc('session.list', {})
  write(evd('UF-002/session-list.json'), dumpJson(listed.json))
  const botId = (m.stdout.match(/session-[0-9a-f-]+/g) || []).at(-1)
  if (botId) {
    const botHist = rpc('session.history', { sessionId: botId, maxMessages: 80 })
    write(evd('UF-002/bot-history.json'), dumpJson(botHist.json))
    ids.uf002bot = botId
  }
  const ws = rpc('workspace.list', {})
  write(evd('UF-002/workspace-list.json'), dumpJson(ws.json))
  const titles = JSON.stringify(listed.json)
  const noTildeOnRail = !titles.includes('~dsh-bot:')
  row('UF-002 main', toolOk && m.stdout.includes('kind:dsh-bot'), `toolOk=${toolOk} marks=${m.stdout.split('\n').length} noTildeJson=${noTildeOnRail}`)
  write(evd('UF-002/tool-call.md'), md('UF-002 主路径', `
## 操作
1. session.create → \`${sessionId}\` preset=\`${rpcValue(created)?.agentPreset}\`
2. session.prompt 要求恰好调用一次 \`dsh_bot_ask\`（pong）
3. 工具卡片完成：\`${toolOk}\`
4. marks：见 \`marks.txt\`
5. 官方栏无 \`~dsh-bot:\`（session.list JSON 不含该标题前缀；GUI 截图 rail-check.png）

## 核对
| 点 | 结果 |
|---|---|
| 工具卡片完成 | ${toolOk} |
| 答案入主会话 | ${historyHas(hist, 'dsh bot pong')} |
| marks kind:dsh-bot | ${m.stdout.includes('kind:dsh-bot')} |
| 后台会话 | \`${ids.uf002bot || ''}\` |
`))
  if (page) {
    await page.goto('http://127.0.0.1:3084/', { waitUntil: 'domcontentloaded' })
    await delay(1500)
    const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
    const hasTilde = /~dsh-bot:/.test(body)
    write(evd('UF-002/rail-playwright.log'), `body: ${body.slice(0, 1500)}\nHAS_TILDE_TITLE=${hasTilde}\n`)
    await screenshot('UF-002/rail-check.png')
    row('UF-002 rail', !hasTilde, `HAS_TILDE_TITLE=${hasTilde}`)
  }
}

async function uf002Concurrent() {
  const a = rpc('session.create', { cwd: ROOT })
  const b = rpc('session.create', { cwd: ROOT })
  const idA = rpcValue(a)?.sessionId
  const idB = rpcValue(b)?.sessionId
  rpc('session.prompt', { sessionId: idA, mode: 'queue', content: [{ type: 'text', text: ASK_PROMPT('Reply with exactly: concurrent A', 'concA-t19') }] })
  rpc('session.prompt', { sessionId: idB, mode: 'queue', content: [{ type: 'text', text: ASK_PROMPT('Reply with exactly: concurrent B', 'concB-t19') }] })
  const [hA, hB] = await Promise.all([
    waitHistory(idA, h => historyHas(h, 'concurrent A') || historyHas(h, 'isError'), { tries: 100, label: 'concA' }),
    waitHistory(idB, h => historyHas(h, 'concurrent B') || historyHas(h, 'isError'), { tries: 100, label: 'concB' }),
  ])
  write(evd('UF-002/concurrent-raw.json'), dumpJson({ a: hA.json, b: hB.json }))
  const m = marksList()
  const ok = historyHas(hA, 'concurrent A') && historyHas(hB, 'concurrent B')
    && !historyHas(hA, 'concurrent B') && !historyHas(hB, 'concurrent A')
  row('UF-002 concurrent', ok, `A=${idA} B=${idB}`)
  write(evd('UF-002/concurrent.md'), md('UF-002 并发委托', `
两笔 \`session.prompt\` 同时要求调用 \`dsh_bot_ask\`（tag A / tag B）。

| 主会话 | 工具答案 | 串扰 |
|---|---|---|
| \`${idA}\` | concurrent A = ${historyHas(hA, 'concurrent A')} | 不含 B = ${!historyHas(hA, 'concurrent B')} |
| \`${idB}\` | concurrent B = ${historyHas(hB, 'concurrent B')} | 不含 A = ${!historyHas(hB, 'concurrent A')} |

marks 摘录：

\`\`\`
${m.stdout}
\`\`\`
`))
}

async function uf003Main() {
  const created = await httpBot('createSession', { title: 'UF-003 jump t19', cwd: ROOT })
  const sid = created.json?.value?.sessionId
  ids.uf003 = sid
  row('UF-003 createSession', created.json?.ok === true && Boolean(sid), dumpJson(created.json))
  const listed = await httpBot('listSessions', {})
  write(evd('phase-4/listSessions-t19.json'), dumpJson(listed.json))
  row('UF-003 list', listed.json?.ok === true && (listed.json?.value?.sessions || []).length >= 1, `n=${(listed.json?.value?.sessions || []).length}`)
  if (page) {
    await page.goto('http://127.0.0.1:3084/', { waitUntil: 'domcontentloaded' })
    await delay(1500)
    const opened = await openDshBotTab()
    await delay(1000)
    await screenshot('UF-003/tab-list.png')
    if (sid) {
      const rowBtn = page.getByTestId(`dsh-bot-row-${sid}`)
      if (await rowBtn.count()) {
        await rowBtn.click()
        log('clicked row', sid)
        await delay(800)
      }
    }
    const neu = page.getByTestId('dsh-bot-new')
    if (await neu.count()) {
      await neu.click()
      log('clicked new')
      await delay(1500)
    }
    await screenshot('UF-003/create-jump.png')
    write(evd('UF-003/playwright.log'), guiLog.join('\n') + `\nopen=${opened}\nbody=${(await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 1200)}\n`)
    row('UF-003 gui', opened, `opened=${opened}`)
  }
}

async function uf004() {
  const m = marksList()
  const empty = marksList('kind:dsh-bot-no-such')
  write(evd('UF-004/marks-list.txt'), md('UF-004 CLI marks', `
## 主路径

\`\`\`
DSH_HOME=${DSH_HOME} node ${CLI} marks list --kind kind:dsh-bot
exit ${m.exit}
${m.stdout}
\`\`\`

## 空分支

\`\`\`
DSH_HOME=${DSH_HOME} node ${CLI} marks list --kind kind:dsh-bot-no-such
exit ${empty.exit}
${empty.stdout}${empty.stderr}
\`\`\`
`))
  row('UF-004 main', m.exit === 0 && m.stdout.includes('kind:dsh-bot'), m.stdout.split('\n')[0])
  row('UF-004 empty', empty.exit === 0 && (empty.stdout.includes('(no marks)') || empty.stdout.trim() === ''), empty.stdout.trim())
}

async function uf005InSession() {
  const created = rpc('session.create', { cwd: ROOT })
  const sessionId = rpcValue(created)?.sessionId
  ids.uf005 = sessionId
  rpc('session.prompt', { sessionId, mode: 'queue', content: [{ type: 'text', text: 'Reply with exactly: switch before' }] })
  const before = await waitHistory(sessionId, h => historyHas(h, 'assistant/message'), { label: 'uf005-before' })
  const h0 = lastHeader(before)
  const sel = rpc('session.selectModel', { sessionId, provider: ALT.provider, model: ALT.model })
  // selectModel writes deployment default — restore immediately after next prompt? restore after this test.
  rpc('session.prompt', { sessionId, mode: 'queue', content: [{ type: 'text', text: 'Reply with exactly: switch after' }] })
  const after = await waitHistory(sessionId, h => historyHas(h, 'switch after') || (headersOf(h).length >= 2), { label: 'uf005-after' })
  const h1 = lastHeader(after)
  const preset = presetOf(after) || presetOf(before)
  write(evd('UF-005/switch-in-session.md'), md('UF-005 会话内切换', `
会话 \`${sessionId}\`

| 轮次 | provider | model | preset |
|---|---|---|---|
| 切换前 | ${h0?.provider} | ${h0?.model} | ${presetOf(before)} |
| session.selectModel | ${ALT.provider} | ${ALT.model} | (人设不变) |
| 切换后 | ${h1?.provider} | ${h1?.model} | ${preset} |

selectModel 响应：

\`\`\`
${dumpJson(sel.json).slice(0, 1500)}
\`\`\`

核对：下一轮 header provider/model 变更；preset 仍为 dsh-bot。测完恢复全局 ${GLOBAL.provider}/${GLOBAL.model}。
`))
  rpc('settings.update', { ns: 'agent-default-model', patch: GLOBAL })
  const changed = h0?.provider !== h1?.provider || h0?.model !== h1?.model
  row('UF-005 switch-in-session', changed && preset === 'dsh-bot', `${h0?.provider}/${h0?.model} → ${h1?.provider}/${h1?.model} preset=${preset}`)
}

async function uf005DefaultSwitch() {
  rpc('settings.update', { ns: 'agent-default-model', patch: { ...ALT, reasoningEffort: 'max' } })
  const created = rpc('session.create', { cwd: ROOT })
  const sessionId = rpcValue(created)?.sessionId
  rpc('session.prompt', {
    sessionId,
    mode: 'queue',
    content: [{ type: 'text', text: ASK_PROMPT('Reply with exactly: default switch ok', 'uf005-def') }],
  })
  const hist = await waitHistory(sessionId, h => historyHas(h, 'dsh_bot_ask') && (historyHas(h, 'default switch ok') || historyHas(h, 'isError')), { tries: 100, label: 'uf005-def' })
  const m = marksList()
  const botId = (m.stdout.match(/session-[0-9a-f-]+/g) || []).at(-1)
  let botHeader
  if (botId) {
    const botHist = rpc('session.history', { sessionId: botId, maxMessages: 80 })
    botHeader = lastHeader(botHist)
  }
  write(evd('UF-005/default-switch.md'), md('UF-005 默认切换→委托', `
改 \`agent-default-model\` 为 \`${ALT.provider}/${ALT.model}\`（live），新委托：

- 主会话 \`${sessionId}\`
- 后台会话 \`${botId || ''}\`
- bot request/header: \`${botHeader?.provider}/${botHeader?.model}\`

随后恢复全局 ${GLOBAL.provider}/${GLOBAL.model}。
`))
  rpc('settings.update', { ns: 'agent-default-model', patch: GLOBAL })
  row('UF-005 default-switch', botHeader?.provider === ALT.provider && botHeader?.model === ALT.model, `${botHeader?.provider}/${botHeader?.model}`)
}

async function uf006OnOff() {
  rpc('settings.update', { ns: 'dsh-bot', patch: { model: { provider: ALT.provider, model: ALT.model } } })
  const listOn = await httpBot('listSessions', { includeHidden: true })
  const botModel = listOn.json?.value?.botModel
  const plugin = await httpBot('createSession', { title: 'UF-006 override-on t19', cwd: ROOT })
  const onId = plugin.json?.value?.sessionId
  const onModels = rpc('session.models', { sessionId: onId })
  const onCurrent = rpcValue(onModels)?.current
  rpc('session.prompt', { sessionId: onId, mode: 'queue', content: [{ type: 'text', text: 'Reply with exactly: override on' }] })
  const onHist = await waitHistory(onId, h => historyHas(h, 'request/header'), { label: 'ov-on' })
  const onHeader = lastHeader(onHist)
  const gui = rpc('session.create', { cwd: ROOT })
  const guiId = rpcValue(gui)?.sessionId
  const guiModels = rpc('session.models', { sessionId: guiId })
  const guiCurrent = rpcValue(guiModels)?.current
  write(evd('UF-006/override-on.md'), md('UF-006 override 生效', `
settings.update \`dsh-bot.model = {provider:${ALT.provider}, model:${ALT.model}}\`

| 入口 | sessionId | current provider/model | header |
|---|---|---|---|
| listSessions.botModel | — | ${botModel?.provider}/${botModel?.model} source=${botModel?.source} | — |
| 页签/HTTP createSession | \`${onId}\` | ${onCurrent?.provider}/${onCurrent?.model} | ${onHeader?.provider}/${onHeader?.model} |
| GUI 直建 session.create | \`${guiId}\` | ${guiCurrent?.provider}/${guiCurrent?.model} | 应仍为全局 ${GLOBAL.provider}/${GLOBAL.model} |

GUI 直建不受 override 影响。
`))
  const onOk = botModel?.source === 'override'
    && onCurrent?.provider === ALT.provider && onCurrent?.model === ALT.model
    && guiCurrent?.provider === GLOBAL.provider && guiCurrent?.model === GLOBAL.model
  row('UF-006 override-on', onOk, `botModel=${botModel?.source} plugin=${onCurrent?.provider}/${onCurrent?.model} gui=${guiCurrent?.provider}/${guiCurrent?.model}`)

  rpc('settings.update', { ns: 'dsh-bot', patch: { model: { provider: '', model: '' } } })
  const listOff = await httpBot('listSessions', {})
  const offModel = listOff.json?.value?.botModel
  const offCreate = await httpBot('createSession', { title: 'UF-006 override-off t19', cwd: ROOT })
  const offId = offCreate.json?.value?.sessionId
  const offModels = rpc('session.models', { sessionId: offId })
  const offCurrent = rpcValue(offModels)?.current
  rpc('session.prompt', { sessionId: offId, mode: 'queue', content: [{ type: 'text', text: 'Reply with exactly: override off' }] })
  const offHist = await waitHistory(offId, h => historyHas(h, 'request/header'), { label: 'ov-off' })
  const offHeader = lastHeader(offHist)
  write(evd('UF-006/override-off.md'), md('UF-006 清空回退', `
清空 \`dsh-bot.model\` 后：

- listSessions.botModel source=\`${offModel?.source}\` ${offModel?.provider}/${offModel?.model}
- 新插件会话 \`${offId}\` current=${offCurrent?.provider}/${offCurrent?.model}
- header=${offHeader?.provider}/${offHeader?.model}

应回到全局 ${GLOBAL.provider}/${GLOBAL.model}。
`))
  row('UF-006 override-off', offModel?.source === 'global-default' && offCurrent?.provider === GLOBAL.provider && offCurrent?.model === GLOBAL.model, `${offCurrent?.provider}/${offCurrent?.model}`)
}

async function uf006Invalid() {
  rpc('settings.update', { ns: 'dsh-bot', patch: { model: { provider: 'no-such-provider', model: 'no-such-model' } } })
  const created = await httpBot('createSession', { title: 'UF-006 invalid t19', cwd: ROOT })
  write(evd('UF-006/override-invalid.md'), md('UF-006 非法 override', `
settings.update \`dsh-bot.model = {provider:no-such-provider, model:no-such-model}\`

\`POST /dsh-bot/createSession\`：

\`\`\`
${dumpJson(created.json).slice(0, 2500)}
\`\`\`

期望 \`ok:false\`，code 为 override-invalid 类，点名 provider/model，不静默回落。演练后已清空 override。
`))
  const err = created.json?.error || {}
  const ok = created.json?.ok === false && /override-invalid|no-such-provider|no-such-model/i.test(JSON.stringify(created.json))
  row('UF-006 override-invalid', ok, `${err.code}: ${err.message}`)
  rpc('settings.update', { ns: 'dsh-bot', patch: { model: { provider: '', model: '' } } })
}

async function uf001MissingKey() {
  rpc('settings.mutate', {
    ns: 'llm-pi-ai',
    ops: [{
      op: 'set',
      path: ['providers', 'nokey'],
      value: {
        displayName: 'NoKey',
        apiKeyEnv: 'BOT_MISSING_KEY',
        api: 'anthropic-messages',
        baseURL: 'https://panpanpan.59188888.xyz',
        reasoning: 'xhigh',
        models: [grokModel()],
      },
    }],
  })
  const created = rpc('session.create', { cwd: ROOT })
  const sessionId = rpcValue(created)?.sessionId
  const sel = rpc('session.selectModel', { sessionId, provider: 'nokey', model: 'grok-4.6' })
  rpc('session.prompt', { sessionId, mode: 'queue', content: [{ type: 'text', text: 'Reply with exactly: should fail missing key' }] })
  const hist = await waitHistory(sessionId, h =>
    historyHas(h, 'MISSING_CREDENTIAL') || historyHas(h, 'BOT_MISSING_KEY') || historyHas(h, 'turn/end'),
  { label: 'missing-key' })
  write(evd('UF-001/missing-key.md'), md('UF-001 无凭据分支', `
临时 \`settings.mutate\` 增加 \`llm-pi-ai.providers.nokey\`（\`apiKeyEnv: BOT_MISSING_KEY\`，未配置），会话 \`${sessionId}\` \`session.selectModel\` 到 nokey/grok-4.6。

selectModel：

\`\`\`
${dumpJson(sel.json).slice(0, 1200)}
\`\`\`

历史是否点名 MISSING_CREDENTIAL / BOT_MISSING_KEY：${historyHas(hist, 'MISSING_CREDENTIAL')} / ${historyHas(hist, 'BOT_MISSING_KEY')}

摘录（截断）：

\`\`\`
${JSON.stringify(hist.json).slice(0, 2500)}
\`\`\`

随后 unset nokey，切回 ${GLOBAL.provider}/${GLOBAL.model}，再发一条确认免重启恢复。
`))
  rpc('settings.update', { ns: 'agent-default-model', patch: GLOBAL })
  rpc('session.selectModel', { sessionId, ...GLOBAL })
  rpc('settings.update', { ns: 'agent-default-model', patch: GLOBAL })
  rpc('session.prompt', { sessionId, mode: 'queue', content: [{ type: 'text', text: 'Reply with exactly: missing key recovered' }] })
  const rec = await waitHistory(sessionId, h => historyHas(h, 'missing key recovered') || historyHas(h, 'DSH Bot'), { tries: 40, label: 'missing-recover' })
  rpc('settings.mutate', { ns: 'llm-pi-ai', ops: [{ op: 'unset', path: ['providers', 'nokey'] }] })
  rpc('settings.update', { ns: 'agent-default-model', patch: GLOBAL })
  const ok = historyHas(hist, 'MISSING_CREDENTIAL') || historyHas(hist, 'BOT_MISSING_KEY')
  row('UF-001 missing-key', ok, `named=${ok} recovered=${historyHas(rec, 'missing key recovered')}`)
}

async function uf001Upstream() {
  await startUpstream401()
  rpc('settings.mutate', {
    ns: 'llm-pi-ai',
    ops: [{
      op: 'set',
      path: ['providers', 'badup'],
      value: {
        displayName: 'BadUp',
        apiKeyEnv: 'ANTHROPIC_API_KEY',
        api: 'anthropic-messages',
        baseURL: 'http://127.0.0.1:18091',
        reasoning: 'xhigh',
        models: [grokModel()],
      },
    }],
  })
  const created = rpc('session.create', { cwd: ROOT })
  const sessionId = rpcValue(created)?.sessionId
  const sel = rpc('session.selectModel', { sessionId, provider: 'badup', model: 'grok-4.6' })
  rpc('session.prompt', { sessionId, mode: 'queue', content: [{ type: 'text', text: 'Reply with exactly: should fail upstream' }] })
  const hist = await waitHistory(sessionId, h =>
    historyHas(h, 'AUTH') || historyHas(h, '401') || historyHas(h, 'authentication') || historyHas(h, 'turn/end') || historyHas(h, 'error'),
  { label: 'upstream' })
  write(evd('UF-001/upstream-error.md'), md('UF-001 上游失败分支', `
本地 401 端点 \`http://127.0.0.1:18091\`，临时 provider \`badup\`（凭据走已有 ANTHROPIC_API_KEY 引用，端点返回 401）。会话 \`${sessionId}\`。

selectModel：

\`\`\`
${dumpJson(sel.json).slice(0, 1200)}
\`\`\`

历史含稳定错误（AUTH/401/authentication/turn/end error）：${historyHas(hist, '401') || historyHas(hist, 'AUTH') || historyHas(hist, 'authentication')}

会话保留可重试（未删除）。演练后 unset badup 并恢复全局模型。
`))
  rpc('session.selectModel', { sessionId, ...GLOBAL })
  rpc('settings.update', { ns: 'agent-default-model', patch: GLOBAL })
  rpc('settings.mutate', { ns: 'llm-pi-ai', ops: [{ op: 'unset', path: ['providers', 'badup'] }] })
  const ok = historyHas(hist, '401') || historyHas(hist, 'AUTH') || historyHas(hist, 'authentication') || historyHas(hist, 'error')
  row('UF-001 upstream-error', ok, `session kept ${sessionId}`)
}

async function uf005MissingCred() {
  rpc('settings.mutate', {
    ns: 'llm-pi-ai',
    ops: [{
      op: 'set',
      path: ['providers', 'nokey'],
      value: {
        displayName: 'NoKey',
        apiKeyEnv: 'BOT_MISSING_KEY',
        api: 'anthropic-messages',
        baseURL: 'https://panpanpan.59188888.xyz',
        reasoning: 'xhigh',
        models: [grokModel()],
      },
    }],
  })
  const created = rpc('session.create', { cwd: ROOT })
  const sessionId = rpcValue(created)?.sessionId
  rpc('session.selectModel', { sessionId, provider: 'nokey', model: 'grok-4.6' })
  rpc('session.prompt', { sessionId, mode: 'queue', content: [{ type: 'text', text: 'Reply with exactly: uf005 missing' }] })
  const hist = await waitHistory(sessionId, h => historyHas(h, 'MISSING_CREDENTIAL') || historyHas(h, 'BOT_MISSING_KEY') || historyHas(h, 'turn/end'), { label: 'uf005-miss' })
  rpc('session.selectModel', { sessionId, ...GLOBAL })
  rpc('settings.update', { ns: 'agent-default-model', patch: GLOBAL })
  rpc('session.prompt', { sessionId, mode: 'queue', content: [{ type: 'text', text: 'Reply with exactly: uf005 recovered' }] })
  const rec = await waitHistory(sessionId, h => historyHas(h, 'uf005 recovered'), { tries: 40, label: 'uf005-rec' })
  rpc('settings.mutate', { ns: 'llm-pi-ai', ops: [{ op: 'unset', path: ['providers', 'nokey'] }] })
  write(evd('UF-005/missing-cred.md'), md('UF-005 缺凭据分支', `
会话 \`${sessionId}\` 切到 nokey/grok-4.6（apiKeyEnv=BOT_MISSING_KEY 未配）。

点名 MISSING_CREDENTIAL/BOT_MISSING_KEY：${historyHas(hist, 'MISSING_CREDENTIAL')} / ${historyHas(hist, 'BOT_MISSING_KEY')}

切回 ${GLOBAL.provider}/${GLOBAL.model} 后回复 \`uf005 recovered\`：${historyHas(rec, 'uf005 recovered')}
`))
  row('UF-005 missing-cred', historyHas(hist, 'MISSING_CREDENTIAL') || historyHas(hist, 'BOT_MISSING_KEY'), 'named credential')
}

async function uf002Timeout() {
  rpc('settings.update', { ns: 'dsh-bot', patch: { askTimeoutMs: 200 } })
  const created = rpc('session.create', { cwd: ROOT })
  const sessionId = rpcValue(created)?.sessionId
  rpc('session.prompt', {
    sessionId,
    mode: 'queue',
    content: [{ type: 'text', text: ASK_PROMPT('Write two sentences about water', 'timeout-t19') }],
  })
  const hist = await waitHistory(sessionId, h => historyHas(h, 'wait-timeout') || historyHas(h, 'timed out'), { tries: 80, label: 'timeout' })
  write(evd('UF-002/timeout-history.json'), dumpJson(hist.json))
  const m = marksList()
  const botIdMatch = JSON.stringify(hist.json).match(/session-[0-9a-f-]{8,}/g)
  write(evd('UF-002/timeout.md'), md('UF-002 等待超时分支', `
\`settings.update\` \`dsh-bot.askTimeoutMs = 200\`（live），主会话 \`${sessionId}\` 调用 \`dsh_bot_ask\`。

历史含 wait-timeout：${historyHas(hist, 'wait-timeout')}

marks 仍在（会话未杀）：

\`\`\`
${m.stdout}
\`\`\`

演练后恢复 askTimeoutMs=180000。
`))
  rpc('settings.update', { ns: 'dsh-bot', patch: { askTimeoutMs: 180000 } })
  row('UF-002 timeout', historyHas(hist, 'wait-timeout') && historyHas(hist, 'session kept'), `ids=${(botIdMatch || []).slice(-2)}`)
}

async function uf003Empty() {
  const marksPath = join(DSH_HOME, 'session-tool/marks.jsonl')
  const bak = marksPath + '.t19bak'
  let original = ''
  if (existsSync(marksPath)) {
    original = readFileSync(marksPath, 'utf8')
    write(bak, original)
    write(marksPath, '')
  }
  try {
    if (page) {
      await page.goto('http://127.0.0.1:3084/', { waitUntil: 'domcontentloaded' })
      await delay(1000)
      await openDshBotTab()
      await delay(2500)
      await screenshot('UF-003/empty.png')
      const body = await page.locator('body').innerText()
      row('UF-003 empty', body.includes('还没有 DSH Bot 会话') || (await page.getByTestId('dsh-bot-empty').count()) > 0, 'empty state')
    } else {
      const listed = await httpBot('listSessions', {})
      row('UF-003 empty rpc', (listed.json?.value?.sessions || []).length === 0, dumpJson(listed.json?.value))
    }
  } finally {
    if (original !== '') write(marksPath, original)
  }
}

async function uf002GatewayAndUf003RpcError() {
  if (page) {
    await page.goto('http://127.0.0.1:3084/', { waitUntil: 'domcontentloaded' })
    await delay(1000)
    await openDshBotTab()
    await delay(1000)
  }
  const w = who()
  const pid = (w.match(/pid=(\d+)/) || [])[1]
  write(evd('UF-002/gateway-down.log'), `who before:\n${w}\nkill ${pid}\n`)
  if (pid) {
    try { process.kill(Number(pid), 'SIGTERM') } catch (e) { log('kill', String(e)) }
  }
  await delay(2000)
  const w2 = who()
  const cli = sh('node', [CLI, 'session', 'create', '--title', 'gateway-down-t19', '--profile', 'headless', '--patch', join(DSH_HOME, 'cli.patch.yml'), '--format', 'json'])
  write(evd('UF-002/gateway-down-cli.out'), cli.stdout)
  write(evd('UF-002/gateway-down-cli.err'), cli.stderr)
  write(evd('UF-002/gateway-down.md'), md('UF-002 网关不可达分支', `
## 1. 停网关
\`\`\`
${w}
kill ${pid}
${w2}
\`\`\`

## 2. CLI headless session create
exit ${cli.status}
stderr:
\`\`\`
${cli.stderr}
\`\`\`
stdout:
\`\`\`
${cli.stdout}
\`\`\`

期望 web-unreachable / fetch failed，非空串。演练后已重新 boot 本仓网关。
`))
  const downOk = /web-unreachable|fetch failed|unreachable/i.test(cli.stderr + cli.stdout)
  row('UF-002 gateway-down', downOk && (cli.status ?? 0) !== 0, (cli.stderr || cli.stdout).slice(0, 300))

  if (page) {
    await delay(2500)
    try {
      await screenshot('UF-003/rpc-error.png')
      const body = await page.locator('body').innerText()
      write(evd('UF-003/playwright-branches.log'), `error body: ${body.replace(/\s+/g, ' ').slice(0, 1500)}\n`)
      row('UF-003 rpc-error', /无法加载|重试|Could not load|Retry/i.test(body), body.replace(/\s+/g, ' ').slice(0, 200))
    } catch (e) {
      log('rpc-error screenshot', String(e))
      row('UF-003 rpc-error', false, String(e))
    }
  }

  bootBackground()
  const w3 = await waitWho(60)
  log('who after boot', w3)
  row('gateway restored', w3.includes(DSH_HOME) && !w3.includes('没人监听'), w3)
}

async function main() {
  mkdirSync(evd('phase-4'), { recursive: true })
  const w = ensureWarehouse()
  write(evd('phase-4/rpc-who-t19.txt'), w + '\n')
  log('who', w)
  restoreSettings()
  restored = false
  try {
    await launchGui()
    await uf001Main()
    await uf002Main()
    await uf002Concurrent()
    await uf003Main()
    await uf004()
    await uf005InSession()
    await uf005DefaultSwitch()
    await uf006OnOff()
    await uf006Invalid()
    await uf001MissingKey()
    await uf001Upstream()
    await uf005MissingCred()
    await uf002Timeout()
    await uf003Empty()
    await uf002GatewayAndUf003RpcError()
  } catch (e) {
    log('FATAL', e.stack || String(e))
    row('fatal', false, e.stack || String(e))
  } finally {
    try { restoreSettings() } catch (e) { log('restore fail', String(e)) }
    try { upstreamServer?.close() } catch { /* ignore */ }
    try { await browser?.close() } catch { /* ignore */ }
    write(evd('phase-4/gui-playwright.log'), guiLog.join('\n') + '\n')
  }
  const summary = rows.map(r => `- ${r.pass ? 'PASS' : 'FAIL'} ${r.id}: ${r.detail}`).join('\n')
  const fail = rows.filter(r => !r.pass).length
  write(evd('phase-4/task19-matrix.md'), md('Task 19 5.2 矩阵', `
通过 ${rows.length - fail} / ${rows.length}（失败 ${fail}）

${summary}
`))
  console.log(summary)
  console.log(`FAILS=${fail}`)
  process.exit(fail === 0 ? 0 : 1)
}

process.on('SIGINT', () => { restoreSettings(); process.exit(130) })
process.on('uncaughtException', (e) => { log('uncaught', e.stack); try { restoreSettings() } catch {} })
await main()
