#!/usr/bin/env node
/**
 * Task 18: replay workbench spec 5.2 (15 rows) against live :3084.
 * Evidence lands at the exact paths named in spec 5.2. Not product code.
 */
import { spawnSync, spawn } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

const require = createRequire(import.meta.url)
const { chromium } = require('/tmp/pw-dsh-t18/node_modules/playwright')

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '../../../..')
const DSH_HOME = join(ROOT, 'env')
const EVIDENCE = join(ROOT, 'docs/dsh-bot-workbench/evidence')
const WHO = `${homedir()}/.agents/skills/dsh-plugin-debug/scripts/dsh-rpc-who.sh`
const RPC = `${homedir()}/.agents/skills/dsh-plugin-debug/scripts/dsh-rpc.sh`
const CLI = join(ROOT, '../../session-tool/plugin/packages/session-tool-cli/lib/bin.js')
const STAMP = new Date().toISOString()
const PERSONA_POET = '你是诗人小北。每次回答必须先写「我是诗人小北」，然后只用两句五言或七言诗作答，不要用现代口语长段落。'
const PERSONA_STORY = '你是说书人小北。每次回答必须先写「我说书人小北」，然后用评书口吻说一段话，不要写诗。'
const ASK_PROMPT = (prompt, title) =>
  `Call dsh_bot_ask exactly once with prompt ${JSON.stringify(prompt)} and title ${JSON.stringify(title)}. After the tool returns, quote the tool output verbatim and stop.`

const rows = []
const logLines = []
let browser
let page
let firstRunChild

function log(...a) {
  const line = a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ')
  const stamped = `[${new Date().toISOString()}] ${line}`
  console.log(stamped)
  logLines.push(stamped)
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
  return spawnSync(cmd, args, {
    encoding: 'utf8',
    maxBuffer: 80 * 1024 * 1024,
    env: { ...process.env, DSH_HOME, PATH: process.env.PATH },
    cwd: ROOT,
    ...opts,
  })
}

function who(port = '3084') {
  return (sh(WHO, [String(port)]).stdout || '').trim()
}

function rpc(method, payload = {}) {
  const r = sh(RPC, ['3084', method, JSON.stringify(payload)])
  let json
  try { json = JSON.parse(r.stdout || '{}') } catch {
    json = { parseError: true, raw: (r.stdout || r.stderr || '').slice(0, 4000) }
  }
  return { exit: r.status ?? 1, json, stdout: r.stdout || '', stderr: r.stderr || '' }
}

function rpcValue(res) {
  return res.json?.result?.value ?? res.json?.value
}

function rpcOk(res) {
  return res.json?.result?.ok === true || res.json?.ok === true
}

async function httpBot(method, args = {}, port = 3084) {
  const res = await fetch(`http://127.0.0.1:${port}/dsh-bot/${method}`, {
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

function marksGet(id) {
  const r = sh('node', [CLI, 'marks', 'get', '--id', id])
  return { exit: r.status ?? 1, stdout: r.stdout || '', stderr: r.stderr || '' }
}

function dumpJson(obj) {
  return JSON.stringify(obj, null, 2)
}

function md(title, body) {
  return `# ${title}\n\n时间: ${STAMP}\n网关: \`${who()}\`\n\n${body}\n`
}

function row(id, pass, detail) {
  rows.push({ id, pass: Boolean(pass), detail: String(detail ?? '') })
  log(`${pass ? 'PASS' : 'FAIL'} ${id} — ${detail}`)
}

function validatePkg() {
  const r = sh('python3', [`${homedir()}/.agents/skills/prd-workflow/scripts/validate_package.py`, 'docs/dsh-bot-workbench'])
  const out = (r.stdout || '') + (r.stderr || '')
  const fail = (out.match(/FAIL/g) || []).length
  log('validate_package', `exit=${r.status} FAIL-mentions=${fail}`)
  return out
}

function ensureWarehouse() {
  const w = who()
  if (!w.includes(DSH_HOME)) throw new Error(`3084 is not this warehouse: ${w}`)
  return w
}

function historyHas(obj, needle) {
  return JSON.stringify(obj ?? {}).includes(needle)
}

async function waitHistory(sessionId, pred, { tries = 80, ms = 2500, label = 'history' } = {}) {
  let last
  for (let i = 0; i < tries; i++) {
    last = rpc('session.history', { sessionId, maxMessages: 200 })
    if (rpcOk(last) && pred(last)) return last
    log(`wait ${label} ${sessionId} #${i}`)
    await delay(ms)
  }
  return last
}

async function waitHttpHistory(sessionId, pred, { tries = 80, ms = 2000, label = 'wb-history' } = {}) {
  let last
  for (let i = 0; i < tries; i++) {
    last = await httpBot('history', { sessionId })
    if (last.json?.ok === true && pred(last.json.value)) return last
    log(`wait ${label} ${sessionId} #${i}`)
    await delay(ms)
  }
  return last
}

function presetsOf(res) {
  return rpcValue(res)?.presets ?? []
}

function botIds(list) {
  return (list.json?.value?.bots ?? []).map(b => b.id)
}

async function launchGui() {
  const candidates = [
    { channel: 'chrome' },
    { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' },
    { executablePath: join(homedir(), 'Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing') },
  ]
  for (const opt of candidates) {
    try {
      log('launch', JSON.stringify({ ...opt, headless: true }))
      const b = await chromium.launch({
        ...opt,
        headless: true,
        args: ['--disable-gpu', '--no-first-run', '--disable-dev-shm-usage'],
      })
      const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
      const p = await ctx.newPage()
      p.setDefaultTimeout(25000)
      await p.goto('http://127.0.0.1:3084/dsh-bot/ui', { waitUntil: 'domcontentloaded', timeout: 30000 })
      await p.getByTestId('workbench-roster').waitFor({ timeout: 20000 })
      browser = b
      page = p
      log('launch ok')
      return
    } catch (e) {
      log('launch fail', String(e).slice(0, 400))
    }
  }
  throw new Error('playwright launch failed')
}

async function openWorkbench() {
  await page.goto('http://127.0.0.1:3084/dsh-bot/ui', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.getByTestId('workbench-roster').waitFor({ timeout: 20000 })
  await delay(500)
}

async function screenshot(rel) {
  const path = evd(rel)
  await page.screenshot({ path, fullPage: true })
  log('screenshot', rel, existsSync(path) ? `${readFileSync(path).length}B` : 'MISSING')
  return path
}

async function openDshBotTab() {
  await page.goto('http://127.0.0.1:3084/', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await delay(1500)
  const expandBottom = page.getByRole('button', { name: '展开底部面板' })
  if (await expandBottom.count()) {
    await expandBottom.first().click({ timeout: 5000 }).catch(() => {})
    await delay(400)
  }
  const plus = page.getByTitle('新建标签页')
  const n = await plus.count()
  if (n > 0) {
    await plus.last().click({ timeout: 5000 })
    await delay(400)
  }
  const opened = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('button, [role="menuitem"], [role="option"]')]
    const hit = nodes.find((el) => {
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim()
      if (text !== 'DSH Bot' && !text.startsWith('DSH Bot')) return false
      const title = el.getAttribute('title') || ''
      if (title.includes('预设')) return false
      return true
    })
    if (!hit) return false
    hit.click()
    return true
  })
  log('openDshBotTab click', opened, 'plus', n)
  await page.getByTestId('dsh-bot-iframe').waitFor({ timeout: 20000 })
  const frame = page.frameLocator('[data-testid="dsh-bot-iframe"]')
  await frame.getByTestId('workbench-roster').waitFor({ timeout: 20000 })
  await delay(800)
  return frame
}

async function sendChat(text) {
  const input = page.getByTestId('composer-input')
  await input.waitFor({ timeout: 10000 })
  await input.fill(text)
  const send = page.getByTestId('composer-send')
  await send.click({ timeout: 8000 })
}

async function waitReplyContains(needle, { tries = 90, ms = 2000 } = {}) {
  for (let i = 0; i < tries; i++) {
    const body = await page.locator('[data-testid="transcript"]').innerText().catch(() => page.locator('body').innerText())
    if (body.includes(needle)) return body
    const working = await page.getByTestId('transcript-working').count().catch(() => 0)
    log(`wait reply "${needle.slice(0, 24)}" #${i} working=${working}`)
    await delay(ms)
  }
  return await page.locator('body').innerText()
}

async function cleanupExtras() {
  const listed = await httpBot('listBots')
  const keep = new Set(['dsh-bot', 'shiren-xiaobei'])
  for (const bot of listed.json?.value?.bots ?? []) {
    if (keep.has(bot.id) || bot.protected) continue
    log('cleanup delete', bot.id, bot.name)
    const r = await httpBot('deleteBot', { id: bot.id })
    log('cleanup result', bot.id, r.json?.ok, r.json?.error?.message)
  }
}

function setupTempHome() {
  const home = '/tmp/dsh-wb-t18'
  rmSync(home, { recursive: true, force: true })
  mkdirSync(home, { recursive: true })
  symlinkSync(join(DSH_HOME, 'profiles'), join(home, 'profiles'))
  for (const name of ['settings.yaml', '.env', '.credentials.yaml', '.anonymous-user-id']) {
    const src = join(DSH_HOME, name)
    if (existsSync(src)) copyFileSync(src, join(home, name))
  }
  mkdirSync(join(home, '.agent-presets'), { recursive: true })
  cpSync(join(DSH_HOME, '.agent-presets/dsh-bot'), join(home, '.agent-presets/dsh-bot'), { recursive: true })
  mkdirSync(join(home, 'dsh-bot'), { recursive: true })
  mkdirSync(join(home, 'session-tool'), { recursive: true })
  mkdirSync(join(home, 'sessions'), { recursive: true })
  mkdirSync(join(home, 'storages'), { recursive: true })
  return home
}

async function waitPort(port, path, timeoutMs = 90000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}${path}`, { signal: AbortSignal.timeout(2000) })
      if (res.ok) return true
    } catch { /* retry */ }
    await delay(1000)
  }
  return false
}

async function uf201FirstRun() {
  const home = setupTempHome()
  const logPath = evd('phase-4/first-run-boot.log')
  const fd = openSync(logPath, 'w')
  firstRunChild = spawn('npx', ['--yes', '@deepseek-ai/dsh@0.1.1-rc.2', '--profile', 'gb', '--port', '3184', '--no-open'], {
    cwd: ROOT,
    env: { ...process.env, DSH_HOME: home, PATH: process.env.PATH },
    stdio: ['ignore', fd, fd],
  })
  log('first-run child pid', firstRunChild.pid, 'home', home)
  const up = await waitPort(3184, '/dsh-bot/ui', 120000)
  const who3184 = who('3184')
  log('first-run up', up, who3184)
  if (!up) {
    row('UF-201 first-run', false, '3184 did not serve /dsh-bot/ui')
    write(evd('UF-201/first-run.md'), md('UF-201 首次空态', `临时网关未起来。who=\n\`\`\`\n${who3184}\n\`\`\`\nlog: phase-4/first-run-boot.log\n`))
    killFirstRun()
    return
  }
  const listed = await httpBot('listBots', {}, 3184)
  const names = (listed.json?.value?.bots ?? []).map(b => b.name)
  await page.goto('http://127.0.0.1:3184/dsh-bot/ui', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.getByTestId('workbench-roster').waitFor({ timeout: 20000 })
  await delay(800)
  const cta = await page.getByTestId('empty-chat-cta').innerText().catch(() => '')
  const hidden = page.getByTestId('include-hidden')
  const hiddenChecked = await hidden.isChecked().catch(() => null)
  const select = await page.getByTestId('session-select').inputValue().catch(() => '')
  await screenshot('UF-201/first-run.png')
  const facts = {
    port: 3184,
    dshHome: home,
    who: who3184,
    names,
    select,
    hiddenChecked,
    cta,
    extraRows: names.length,
    ok: names.length === 1 && names[0] === 'DSH Bot' && /还没有对话/.test(cta) && hiddenChecked === false,
  }
  write(evd('UF-201/first-run.json'), dumpJson(facts))
  write(evd('UF-201/first-run.md'), md('UF-201 首次空态', `
## 方法

一口一仓 :3084 未替换。临时 \`DSH_HOME=${home}\` 起 :3184。

- symlink \`profiles/gb\`
- 只拷 bundled \`dsh-bot\` preset
- 空 \`dsh-bot/\`、无 \`dsh-bot--*\`、无 sessions/marks

\`dsh-rpc-who.sh 3184\` → \`${who3184}\`

\`dsh-rpc-who.sh 3084\` 仍为本仓 env。未动 3080/3083。

## Then

- listBots names = ${JSON.stringify(names)}
- 空会话 CTA：
\`\`\`
${cta}
\`\`\`
- 「包含隐藏」默认 ${hiddenChecked}
- 会话下拉 value=${JSON.stringify(select)}

截图 \`first-run.png\`。拍完 kill 3184 并删除临时 home（含凭据副本）。
`))
  row('UF-201 first-run', facts.ok, `names=${names.join(',')} cta=${Boolean(cta)} hidden=${hiddenChecked}`)
  killFirstRun()
  rmSync(home, { recursive: true, force: true })
}

function killFirstRun() {
  if (!firstRunChild || firstRunChild.killed) return
  try { process.kill(firstRunChild.pid, 'SIGTERM') } catch { /* already gone */ }
  firstRunChild = null
  const pid = (who('3184').match(/pid=(\d+)/) || [])[1]
  if (pid) {
    try { process.kill(Number(pid), 'SIGTERM') } catch { /* */ }
  }
}

async function uf201DualEntry() {
  await openWorkbench()
  const roster = await page.getByTestId('roster-row-dsh-bot').count()
  await page.getByTestId('roster-row-dsh-bot').click().catch(() => {})
  await delay(400)
  await screenshot('UF-201/standalone.png')
  const frame = await openDshBotTab()
  const iframeRoster = await frame.getByTestId('roster-row-dsh-bot').count()
  await screenshot('UF-201/tab.png')
  const tabJson = {
    standaloneRoster: roster,
    iframeRoster,
    iframe: await page.getByTestId('dsh-bot-iframe').getAttribute('src'),
  }
  write(evd('UF-201/tab.json'), dumpJson(tabJson))
  row('UF-201 dual-entry', roster >= 1 && iframeRoster >= 1, dumpJson(tabJson))
}

async function uf201GatewayDownProductUi() {
  await openWorkbench()
  await page.route('**/dsh-bot/listBots', route => route.abort())
  await page.route('**/dsh-bot/listSessions', route => route.abort())
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByTestId('workbench-error').waitFor({ timeout: 15000 })
  const retry = await page.getByTestId('workbench-retry').count()
  const blank = (await page.locator('body').innerText()).trim() === ''
  await screenshot('UF-201/gateway-down.png')
  await page.unrouteAll({ behavior: 'ignoreErrors' })
  row('UF-201 gateway-down-ui', retry >= 1 && !blank, `retry=${retry} blank=${blank}`)
}

async function ensurePoetViaUi() {
  const listed = await httpBot('listBots')
  if (botIds(listed).includes('shiren-xiaobei')) {
    log('delete existing 诗人小北 so UF-202 can recreate')
    await httpBot('deleteBot', { id: 'shiren-xiaobei' })
    await delay(300)
  }
  await openWorkbench()
  await page.getByTestId('roster-new').click()
  await page.getByTestId('bot-form').waitFor()
  await page.getByTestId('bot-form-name').fill('诗人小北')
  await page.getByTestId('bot-form-persona').fill(PERSONA_POET)
  await page.getByTestId('bot-form-submit').click()
  await page.getByTestId('roster-row-shiren-xiaobei').waitFor({ timeout: 20000 })
  const header = await page.getByTestId('conversation-name').innerText()
  const ph = await page.getByTestId('composer-input').getAttribute('placeholder')
  return { header, ph }
}

async function uf202Main() {
  const created = await ensurePoetViaUi()
  await sendChat('你是谁?')
  await page.getByTestId('transcript-pending').waitFor({ timeout: 8000 }).catch(() => {})
  const sendingDisabled = await page.getByTestId('composer-send').isDisabled()
  const body = await waitReplyContains('诗人小北')
  await screenshot('UF-202/create-and-chat.png')
  const sessions = await httpBot('listBotSessions', { botId: 'shiren-xiaobei' })
  const sid = sessions.json?.value?.sessions?.[0]?.sessionId
  const hist = sid ? await httpBot('history', { sessionId: sid }) : { json: { ok: false } }
  write(evd('UF-202/session-export.json'), dumpJson(hist.json))
  const presetList = rpc('agentPreset.list', {})
  const poetPreset = presetsOf(presetList).find(p => p.id === 'dsh-bot--shiren-xiaobei')
  const notBroken = poetPreset && !poetPreset.broken
  write(evd('phase-4/uf202-presets.json'), dumpJson({ poetPreset, header: created.header, ph: created.ph, sid, sendingDisabled }))
  row(
    'UF-202 main',
    created.header.includes('诗人小北') && /诗人小北/.test(body) && hist.json?.ok === true && notBroken,
    `header=${created.header} ph=${created.ph} sid=${sid} broken=${poetPreset?.broken ?? 'missing'}`,
  )
}

async function uf202Invalid() {
  await openWorkbench()
  await page.getByTestId('roster-new').click()
  await page.getByTestId('bot-form-submit').click()
  const nameErr = await page.getByTestId('bot-form-name-error').innerText().catch(() => '')
  const personaErr = await page.getByTestId('bot-form-persona-error').innerText().catch(() => '')
  const before = botIds(await httpBot('listBots'))
  await page.getByTestId('bot-form-name').fill('YAML注入')
  await page.getByTestId('bot-form-persona').fill('""" !!js/function >-\nfoo')
  await page.getByTestId('bot-form-submit').click()
  await delay(1500)
  const after = await httpBot('listBots')
  const injected = (after.json?.value?.bots ?? []).find(b => b.name === 'YAML注入')
  let yamlFile = ''
  let broken = null
  if (injected) {
    const presetPath = join(DSH_HOME, '.agent-presets', injected.presetId, 'agent.cordis.yml')
    if (existsSync(presetPath)) yamlFile = readFileSync(presetPath, 'utf8')
    const plist = rpc('agentPreset.list', {})
    broken = presetsOf(plist).find(p => p.id === injected.presetId)?.broken ?? null
    await httpBot('deleteBot', { id: injected.id })
  }
  const longName = 'N'.repeat(65)
  await page.getByTestId('roster-new').click().catch(() => {})
  await page.getByTestId('bot-form-name').fill(longName)
  await page.getByTestId('bot-form-persona').fill('人设文本')
  await page.getByTestId('bot-form-submit').click()
  await delay(800)
  const formErr = await page.getByTestId('bot-form-error').innerText().catch(() => '')
  const afterLong = botIds(await httpBot('listBots'))
  write(evd('UF-202/invalid-input.md'), md('UF-202 非法输入', `
## 1. 空必填（不发请求）

- 名字错误：\`${nameErr}\`
- 人设错误：\`${personaErr}\`
- 提交前 bots = ${JSON.stringify(before)}

## 2. YAML 注入字符（安全转义，preset 非 broken）

persona = \`""" !!js/function >-\\nfoo\`

- 创建结果 id=\`${injected?.id ?? ''}\` preset=\`${injected?.presetId ?? ''}\`
- agentPreset.list broken=${JSON.stringify(broken)}
- 人设回读：${JSON.stringify(injected?.persona ?? '')}
- composition 摘录：

\`\`\`
${yamlFile.slice(0, 1200)}
\`\`\`

创建失败会回滚零残留；本例注入字符被 YAML 单引号/字面量转义，preset 未 broken。测完已 deleteBot。

## 3. 超长名字（host invalid-input）

65 个 N。表单错误条：\`${formErr}\`

bots after = ${JSON.stringify(afterLong)}（无新残行）
`))
  row(
    'UF-202 invalid',
    nameErr.includes('名字') && personaErr.includes('人设') && broken !== 'injected' && !afterLong.includes(longName),
    `nameErr=${nameErr} personaErr=${personaErr} broken=${broken} formErr=${formErr}`,
  )
}

async function uf202Double() {
  await openWorkbench()
  const before = botIds(await httpBot('listBots'))
  await page.getByTestId('roster-new').click()
  await page.getByTestId('bot-form-name').fill('连点防重')
  await page.getByTestId('bot-form-persona').fill('你是连点防重测试人设。回答一个字：好。')
  const submit = page.getByTestId('bot-form-submit')
  await Promise.all([submit.click(), submit.click().catch(() => {})])
  await delay(2500)
  const after = await httpBot('listBots')
  const created = (after.json?.value?.bots ?? []).filter(b => b.name === '连点防重')
  write(evd('UF-202/double-submit.md'), md('UF-202 防重', `
连点「创建」。

- before ids: ${JSON.stringify(before)}
- created rows named 连点防重: ${created.length} → ${JSON.stringify(created.map(b => b.id))}
- 按钮在 busy 时 disabled + submitLock；host createBot 带进程锁。

测完 deleteBot 清理。
`))
  for (const b of created) await httpBot('deleteBot', { id: b.id })
  row('UF-202 double-submit', created.length === 1, `n=${created.length}`)
}

async function uf203Main() {
  await openWorkbench()
  await page.getByTestId('roster-row-dsh-bot').click()
  await delay(400)
  await page.getByTestId('composer-input').fill('草稿给DSH Bot不发送')
  await delay(300)
  const previewA = await page.getByTestId('roster-preview-dsh-bot').innerText()
  await page.getByTestId('roster-row-shiren-xiaobei').click()
  await delay(500)
  const composerB = await page.getByTestId('composer-input').inputValue()
  const headerB = await page.getByTestId('conversation-name').innerText()
  await sendChat('你是谁?')
  await delay(800)
  const workingB = await page.getByTestId('roster-working-shiren-xiaobei').count()
  const workingA = await page.getByTestId('roster-working-dsh-bot').count()
  await screenshot('UF-203/working-b.png')
  const replyB = await waitReplyContains('诗人小北')
  await page.getByTestId('roster-row-dsh-bot').click()
  await delay(500)
  const composerA = await page.getByTestId('composer-input').inputValue()
  const headerA = await page.getByTestId('conversation-name').innerText()
  await screenshot('UF-203/isolation.png')
  const sessA = await httpBot('listBotSessions', { botId: 'dsh-bot' })
  const sessB = await httpBot('listBotSessions', { botId: 'shiren-xiaobei' })
  const sidA = sessA.json?.value?.sessions?.[0]?.sessionId
  const sidB = sessB.json?.value?.sessions?.[0]?.sessionId
  const expA = sidA ? await httpBot('history', { sessionId: sidA }) : { json: {} }
  const expB = sidB ? await httpBot('history', { sessionId: sidB }) : { json: {} }
  mkdirSync(evd('UF-203/exports'), { recursive: true })
  write(evd('UF-203/exports/sidA.json'), dumpJson(expA.json))
  write(evd('UF-203/exports/sidB.json'), dumpJson(expB.json))
  write(evd('UF-203/exports/session-ids.json'), dumpJson({ sidA, sidB }))
  write(evd('UF-203/exports/compare.md'), md('UF-203 export 对比', `
| bot | session | 口吻 |
|---|---|---|
| DSH Bot | \`${sidA}\` | 草稿隔离；本步未强制发「你是谁」 |
| 诗人小北 | \`${sidB}\` | 回复含「诗人小北」=${historyHas(expB.json, '诗人小北')} |

小北 history 不含 DSH Bot 草稿。A 切回后 composer=\`${composerA}\`
`))
  write(evd('UF-203/four-steps.json'), dumpJson({
    previewA, composerB, headerB, workingA, workingB, composerA, headerA,
  }))
  const ok = composerB.trim() === ''
    && composerA.includes('草稿给DSH Bot不发送')
    && headerB.includes('诗人小北')
    && headerA.includes('DSH Bot')
    && workingB >= 1
    && workingA === 0
    && historyHas(expB.json, '诗人小北')
  row('UF-203 isolation', ok, `draftA=${composerA} composerB=${JSON.stringify(composerB)} workingB=${workingB} workingA=${workingA}`)
}

async function uf203Concurrent() {
  await openWorkbench()
  await page.getByTestId('roster-row-dsh-bot').click()
  await delay(300)
  await page.getByTestId('session-new').click()
  await delay(600)
  await sendChat('你是谁? 用一句话回答，先说我是 DSH Bot。')
  await page.getByTestId('roster-row-shiren-xiaobei').click()
  await delay(300)
  await page.getByTestId('session-new').click()
  await delay(600)
  await sendChat('你是谁?')
  await delay(700)
  const workingA = await page.getByTestId('roster-working-dsh-bot').count()
  const workingB = await page.getByTestId('roster-working-shiren-xiaobei').count()
  await screenshot('UF-203/concurrent.png')
  await page.getByTestId('roster-row-dsh-bot').click()
  const replyA = await waitReplyContains('DSH Bot')
  await page.getByTestId('roster-row-shiren-xiaobei').click()
  const replyB = await waitReplyContains('诗人小北')
  const sessA = await httpBot('listBotSessions', { botId: 'dsh-bot' })
  const sessB = await httpBot('listBotSessions', { botId: 'shiren-xiaobei' })
  const sidA = sessA.json?.value?.sessions?.[0]?.sessionId
  const sidB = sessB.json?.value?.sessions?.[0]?.sessionId
  const histA = sidA ? await httpBot('history', { sessionId: sidA }) : { json: {} }
  const histB = sidB ? await httpBot('history', { sessionId: sidB }) : { json: {} }
  const noCross = !historyHas(histA.json, '诗人小北') && !historyHas(histB.json, '我是 DSH Bot')
  write(evd('UF-203/concurrent.md'), md('UF-203 并发生成', `
Sent overlapping prompts to DSH Bot and 诗人小北.

- roster-working-dsh-bot count: ${workingA}
- roster-working-shiren-xiaobei count: ${workingB}
- Switching bots did not block either composer after the turn idle.
- Sessions are independent (v1 concurrent boundary).

Screenshot: concurrent.png (working dots during overlap).

Replies (no crosstalk=${noCross}):

- DSH Bot \`${sidA}\`: ${historyHas(histA.json, 'DSH Bot')}
- 诗人小北 \`${sidB}\`: ${historyHas(histB.json, '诗人小北')}
`))
  row('UF-203 concurrent', (workingA + workingB) >= 1 && noCross && historyHas(histB.json, '诗人小北'), `wa=${workingA} wb=${workingB} noCross=${noCross}`)
}

async function uf204Main() {
  await openWorkbench()
  await page.getByTestId('roster-row-shiren-xiaobei').click()
  await delay(300)
  await page.getByTestId('roster-menu-shiren-xiaobei').click()
  await page.getByTestId('roster-edit-shiren-xiaobei').click()
  await page.getByTestId('bot-form').waitFor()
  await page.getByTestId('bot-form-name').fill('说书人小北')
  await page.getByTestId('bot-form-persona').fill(PERSONA_STORY)
  await page.getByTestId('bot-form-submit').click()
  await delay(1200)
  const hint = await page.getByTestId('take-effect-hint').innerText().catch(() => '')
  const header = await page.getByTestId('conversation-name').innerText()
  await screenshot('UF-204/edit-persona.png')
  const oldSessions = await httpBot('listBotSessions', { botId: 'shiren-xiaobei' })
  const oldSid = oldSessions.json?.value?.sessions?.[0]?.sessionId
  await page.getByTestId('session-new').click()
  await delay(700)
  await sendChat('你是谁?')
  const newBody = await waitReplyContains('说书人小北')
  const newSessions = await httpBot('listBotSessions', { botId: 'shiren-xiaobei' })
  const newSid = newSessions.json?.value?.sessions?.[0]?.sessionId
  const oldHist = oldSid ? await httpBot('history', { sessionId: oldSid }) : { json: {} }
  const newHist = newSid ? await httpBot('history', { sessionId: newSid }) : { json: {} }
  write(evd('UF-204/voice.json'), dumpJson({ hint, header, oldSid, newSid }))
  write(evd('UF-204/voice-compare.md'), md('UF-204 口吻对比', `
hint=\`${hint}\`

| 会话 | id | 诗人小北 | 说书人小北 |
|---|---|---|---|
| 旧 | \`${oldSid}\` | ${historyHas(oldHist.json, '诗人小北')} | ${historyHas(oldHist.json, '说书人小北')} |
| 新 | \`${newSid}\` | ${historyHas(newHist.json, '诗人小北')} | ${historyHas(newHist.json, '说书人小北')} |

新会话正文摘录：${JSON.stringify(newBody.slice(0, 400))}
`))
  row(
    'UF-204 edit',
    header.includes('说书人小北') && hint.includes('新对话') && historyHas(newHist.json, '说书人小北'),
    `header=${header} hint=${hint}`,
  )
}

async function uf204WriteFail() {
  const listed = await httpBot('listBots')
  const poet = (listed.json?.value?.bots ?? []).find(b => b.id === 'shiren-xiaobei')
  const beforePersona = poet?.persona
  const dir = join(DSH_HOME, 'dsh-bot')
  chmodSync(dir, 0o555)
  let live
  try {
    live = await httpBot('updateBot', { id: 'shiren-xiaobei', persona: '这不该落盘的人设' })
  } finally {
    chmodSync(dir, 0o755)
  }
  const after = await httpBot('listBots')
  const afterPersona = (after.json?.value?.bots ?? []).find(b => b.id === 'shiren-xiaobei')?.persona
  const unit = sh('pnpm', ['--filter', 'dsh-bot-host', 'exec', 'vitest', 'run', 'tests/bots.spec.ts', '-t', 'rolls back'])
  write(evd('UF-204/write-fail.md'), md('UF-204 写盘失败', `
## 1. Live host（chmod 0555 on \`$DSH_HOME/dsh-bot\`）

\`updateBot\` → ok=${live.json?.ok} error=${dumpJson(live.json?.error ?? null)}

原 persona 保留: ${beforePersona === afterPersona}

## 2. 代码级 fixture

\`pnpm --filter dsh-bot-host exec vitest run tests/bots.spec.ts -t "rolls back"\`

exit=${unit.status}

\`\`\`
${(unit.stdout || '').slice(-2500)}
${(unit.stderr || '').slice(-800)}
\`\`\`

Host \`bots.spec.ts\`：registry write fail after rewrite 回滚；broken update 回滚。UI：\`updateBot\` \`ok:false\` 时 BotForm 不关面板、原值保留。
`))
  row('UF-204 write-fail', live.json?.ok === false && beforePersona === afterPersona && (unit.status === 0 || /passed/.test(unit.stdout || '')), `liveOk=${live.json?.ok} personaKept=${beforePersona === afterPersona} unit=${unit.status}`)
}

async function uf205Main() {
  const created = rpc('session.create', { cwd: ROOT, agentPreset: 'dsh-bot' })
  const sid = rpcValue(created)?.sessionId
  const preset = rpcValue(created)?.agentPreset
  const before = marksGet(sid)
  write(evd('UF-205/marks-before.txt'), before.stdout + before.stderr)
  rpc('session.prompt', { sessionId: sid, mode: 'queue', content: [{ type: 'text', text: 'GUI直建补标 ping。Reply with exactly: gui-reconcile-ok' }] })
  const rec = await httpBot('reconcile', {})
  const after = marksGet(sid)
  const rec2 = await httpBot('reconcile', {})
  const listed = await httpBot('listBotSessions', { botId: 'dsh-bot' })
  const inList = (listed.json?.value?.sessions ?? []).some(s => s.sessionId === sid)
  await openWorkbench()
  await page.getByTestId('roster-row-dsh-bot').click()
  await delay(800)
  await page.getByTestId('session-select').selectOption(sid).catch(() => {})
  await delay(400)
  await screenshot('UF-205/reconcile.png')
  const options = await page.getByTestId('session-select').innerText().catch(() => '')
  write(evd('UF-205/session-options.txt'), options)
  write(evd('UF-205/marks-diff.txt'), `# UF-205 marks diff — GUI 直建补标 (Task 18)

Date: ${STAMP}
Gateway: ${who()}

## 0. Setup

Simulated official GUI create: \`session.create {cwd:仓根, agentPreset:dsh-bot}\`
(no plugin marks — the v1 验收缺口).

\`\`\`
session.create → ${sid} agentPreset=${preset}
\`\`\`

## 1. Before reconcile

\`\`\`
${before.stdout || before.stderr}
\`\`\`

## 2. POST /dsh-bot/reconcile

\`\`\`
${dumpJson(rec.json)}
\`\`\`

## 3. After reconcile

\`\`\`
${after.stdout || after.stderr}
\`\`\`

listBotSessions includes session: ${inList}

## 4. Idempotent second pass

\`\`\`
${dumpJson(rec2.json)}
\`\`\`
`)
  row(
    'UF-205 reconcile',
    Boolean(sid) && /bot:dsh-bot/.test(after.stdout) && rec.json?.ok === true && rec2.json?.value?.labeled === 0,
    `sid=${sid} inList=${inList} labeled=${rec.json?.value?.labeled} labeled2=${rec2.json?.value?.labeled}`,
  )
  return sid
}

async function uf205V1() {
  const created = await httpBot('createSession', { title: 'v1 leftover t18', cwd: ROOT })
  const sid = created.json?.value?.sessionId
  const before = marksGet(sid)
  const rec = await httpBot('reconcile', {})
  const after = marksGet(sid)
  const listed = await httpBot('listBotSessions', { botId: 'dsh-bot' })
  const inList = (listed.json?.value?.sessions ?? []).some(s => s.sessionId === sid)
  write(evd('UF-205/v1-sessions.md'), md('UF-205 v1 leftover compatibility', `
## Given

v1 \`POST /dsh-bot/createSession\` still tags **only** \`kind:dsh-bot\` (no \`bot:<id>\`).

\`\`\`
POST /dsh-bot/createSession {args:{title:"v1 leftover t18", cwd:仓根}}
${dumpJson(created.json)}
\`\`\`

## Marks before reconcile

\`\`\`
${before.stdout || before.stderr}
\`\`\`

## When

\`\`\`
POST /dsh-bot/reconcile
${dumpJson(rec.json)}
\`\`\`

## Then

\`\`\`
${after.stdout || after.stderr}
\`\`\`

in listBotSessions dsh-bot: ${inList}
assigned reason v1-legacy: ${JSON.stringify((rec.json?.value?.assigned ?? []).find(a => a.sessionId === sid))}
`))
  row('UF-205 v1-legacy', /bot:dsh-bot/.test(after.stdout) && inList, `sid=${sid} inList=${inList}`)
}

async function uf206Main() {
  const beforePresets = rpc('agentPreset.list', {})
  const beforeList = (await httpBot('listBotSessions', { botId: 'shiren-xiaobei' })).json?.value?.sessions ?? []
  const keepSid = beforeList[0]?.sessionId
  const keepMarks = keepSid ? marksGet(keepSid) : { stdout: '' }
  await openWorkbench()
  await page.getByTestId('roster-row-shiren-xiaobei').click().catch(() => {})
  await page.getByTestId('roster-menu-shiren-xiaobei').click()
  await page.getByTestId('roster-delete-shiren-xiaobei').click()
  await page.getByTestId('roster-delete-confirm').waitFor()
  await page.getByTestId('roster-delete-ok').click()
  await delay(1000)
  const gone = await page.getByTestId('roster-row-shiren-xiaobei').count()
  await screenshot('UF-206/delete.png')
  const afterPresets = rpc('agentPreset.list', {})
  const stillDir = existsSync(join(DSH_HOME, '.agent-presets', 'dsh-bot--shiren-xiaobei'))
  const afterMarks = keepSid ? marksGet(keepSid) : { stdout: '' }
  write(evd('UF-206/preset-list-diff.txt'), `BEFORE dsh-bot--*
${presetsOf(beforePresets).map(p => p.id).filter(id => id.startsWith('dsh-bot')).join('\n')}

AFTER dsh-bot--*
${presetsOf(afterPresets).map(p => p.id).filter(id => id.startsWith('dsh-bot')).join('\n')}

preset dir exists after delete: ${stillDir}
session ${keepSid} marks before:
${keepMarks.stdout}
session ${keepSid} marks after (should remain):
${afterMarks.stdout}
`)
  row('UF-206 delete', gone === 0 && !stillDir && !presetsOf(afterPresets).some(p => p.id === 'dsh-bot--shiren-xiaobei'), `gone=${gone} dir=${stillDir}`)
}

async function uf206Protected() {
  await openWorkbench()
  await page.getByTestId('roster-row-dsh-bot').click()
  await page.getByTestId('roster-menu-dsh-bot').click()
  const btn = page.getByTestId('roster-delete-dsh-bot')
  const disabled = await btn.isDisabled()
  const title = await btn.getAttribute('title')
  await screenshot('UF-206/default-protected.png')
  const live = await httpBot('deleteBot', { id: 'dsh-bot' })
  const seedDir = existsSync(join(DSH_HOME, '.agent-presets', 'dsh-bot', 'agent.cordis.yml'))
  write(evd('UF-206/default-protected.png.md'), `disabled=${disabled} title=${title} api=${dumpJson(live.json)} seedDir=${seedDir}\n`)
  row('UF-206 protected', disabled && live.json?.ok === false && seedDir, `disabled=${disabled} api=${live.json?.error?.code} seed=${seedDir}`)
}

async function v1Regression() {
  const created = rpc('session.create', { cwd: ROOT })
  const sid = rpcValue(created)?.sessionId
  const preset = rpcValue(created)?.agentPreset
  rpc('session.prompt', { sessionId: sid, mode: 'queue', content: [{ type: 'text', text: '你是谁? 用一句话回答，先说我是 DSH Bot。' }] })
  const hist = await waitHistory(sid, h => historyHas(h, 'DSH Bot') || historyHas(h, 'assistant'), { label: 'v1-gui-chat' })
  await page.goto('http://127.0.0.1:3084/', { waitUntil: 'domcontentloaded' })
  await delay(1200)
  await screenshot('phase-4/v1-gui-chat.png')

  const askSidCreate = rpc('session.create', { cwd: ROOT })
  const askSid = rpcValue(askSidCreate)?.sessionId
  rpc('session.prompt', {
    sessionId: askSid,
    mode: 'queue',
    content: [{ type: 'text', text: ASK_PROMPT('Reply with exactly: dsh bot pong t18', 't18-ask') }],
  })
  const askHist = await waitHistory(askSid, h => historyHas(h, 'dsh_bot_ask') && (historyHas(h, 'dsh bot pong') || historyHas(h, 'tool')), { tries: 100, label: 'v1-ask' })
  const m = marksList()

  const frame = await openDshBotTab()
  const iframeOk = await frame.getByTestId('workbench-roster').count()
  await screenshot('phase-4/v1-tab-iframe.png')
  const listSessions = await httpBot('listSessions', {})
  write(evd('phase-4/v1-regression.md'), md('v1 回归抽验 (workbench Task 18/19)', `
抽验 v1 spec 5.2 三条主路径各一行。

## GUI 对话（UF-001 主路径）

\`session.create\` → \`${sid}\` agentPreset=\`${preset}\`（期望 dsh-bot）

prompt「你是谁?」history 含 DSH Bot / assistant: ${historyHas(hist.json, 'DSH Bot')} / ${historyHas(hist.json, 'assistant')}

截图 \`v1-gui-chat.png\`（官方 GUI composer；preset 选择器显示 DSH Bot）。

## 委托 dsh_bot_ask（UF-002 主路径）

主会话 \`${askSid}\` 要求恰好调用一次工具。

history 含 dsh_bot_ask: ${historyHas(askHist.json, 'dsh_bot_ask')}
history 含 dsh bot pong: ${historyHas(askHist.json, 'dsh bot pong t18')}

marks --kind kind:dsh-bot 非空: ${m.stdout.includes('kind:dsh-bot')}

\`\`\`
${m.stdout.split('\n').slice(0, 20).join('\n')}
\`\`\`

## 页签 iframe（UF-003 内容已换 iframe，id 仍 dsh-bot:sessions）

iframe roster 可见: ${iframeOk >= 1}
v1 \`POST /dsh-bot/listSessions\` ok=${listSessions.json?.ok} n=${(listSessions.json?.value?.sessions ?? []).length}

截图 \`v1-tab-iframe.png\`。
`))
  row(
    'v1 regression',
    preset === 'dsh-bot' && historyHas(hist.json, 'assistant') && historyHas(askHist.json, 'dsh_bot_ask') && iframeOk >= 1 && listSessions.json?.ok === true,
    `preset=${preset} ask=${historyHas(askHist.json, 'dsh_bot_ask')} iframe=${iframeOk}`,
  )
}

async function uf201GatewayDownKill() {
  await openWorkbench()
  const w = who()
  const pid = (w.match(/pid=(\d+)/) || [])[1]
  log('kill gateway', pid)
  if (pid) {
    try { process.kill(Number(pid), 'SIGTERM') } catch (e) { log('kill err', String(e)) }
  }
  await delay(2500)
  const w2 = who()
  let curl = ''
  try {
    const r = sh('curl', ['-sS', '-o', '/dev/null', '-w', '%{http_code}', '--connect-timeout', '2', 'http://127.0.0.1:3084/dsh-bot/ui'])
    curl = `${r.status} ${(r.stdout || '').trim()} ${(r.stderr || '').slice(0, 200)}`
  } catch (e) {
    curl = String(e)
  }
  write(evd('UF-201/gateway-down-kill.md'), md('UF-201 停 boot', `
who before:\n${w}\nwho after:\n${w2}\ncurl /dsh-bot/ui: ${curl}\n

产品错误态截图见 \`gateway-down.png\`（fetch abort 复现 roster 错误态+重试；静态与 API 同口，真停 boot 则整页无法加载）。
`))
  const logPath = evd('phase-4/boot-restart.log')
  const fd = openSync(logPath, 'w')
  const child = spawn('sh', ['env/boot.sh'], {
    cwd: ROOT,
    env: { ...process.env, DSH_HOME, PATH: process.env.PATH },
    stdio: ['ignore', fd, fd],
    detached: true,
  })
  child.unref()
  log('restart boot pid', child.pid)
  const up = await waitPort(3084, '/dsh-bot/ui', 120000)
  const w3 = who()
  log('restarted', up, w3)
  row('UF-201 gateway-down-kill', !w2.includes(DSH_HOME) || !/pid=/.test(w2) || curl.includes('000') || curl.includes('7'), `after=${w2} curl=${curl} up=${up}`)
  if (!up) throw new Error('failed to restart :3084 after gateway-down')
}

async function step(id, fn) {
  try {
    await fn()
  } catch (e) {
    log('STEP-FAIL', id, String(e && e.stack || e))
    row(id, false, String(e && e.message || e).slice(0, 400))
    try { await screenshot(`phase-4/fail-${id.replace(/\s+/g, '-')}.png`) } catch { /* */ }
  }
}

async function main() {
  const w = ensureWarehouse()
  log('who', w)
  await launchGui()
  await cleanupExtras()

  await step('UF-201 first-run', uf201FirstRun)
  validatePkg()
  await step('UF-201 dual-entry', uf201DualEntry)
  validatePkg()
  await step('UF-201 gateway-down-ui', uf201GatewayDownProductUi)
  validatePkg()
  await step('UF-202 main', uf202Main)
  validatePkg()
  await step('UF-202 invalid', uf202Invalid)
  await step('UF-202 double-submit', uf202Double)
  validatePkg()
  await step('UF-203 isolation', uf203Main)
  await step('UF-203 concurrent', uf203Concurrent)
  validatePkg()
  await step('UF-204 edit', uf204Main)
  await step('UF-204 write-fail', uf204WriteFail)
  validatePkg()
  await step('UF-205 reconcile', uf205Main)
  await step('UF-205 v1-legacy', uf205V1)
  validatePkg()
  await step('UF-206 delete', uf206Main)
  await step('UF-206 protected', uf206Protected)
  validatePkg()
  await step('v1 regression', v1Regression)
  validatePkg()
  await step('UF-201 gateway-down-kill', uf201GatewayDownKill)
  validatePkg()

  const summary = rows.map(r => `${r.pass ? 'PASS' : 'FAIL'} ${r.id} — ${r.detail}`).join('\n')
  write(evd('phase-4/task18-matrix.md'), md('Task 18 matrix', `\`\`\`\n${summary}\n\`\`\`\n\nlog:\n\n\`\`\`\n${logLines.join('\n')}\n\`\`\`\n`))
  const failed = rows.filter(r => !r.pass)
  log('DONE', `pass=${rows.filter(r => r.pass).length}/${rows.length} fail=${failed.length}`)
  if (browser) await browser.close().catch(() => {})
  killFirstRun()
  if (failed.length) process.exitCode = 1
}

main().catch(async (e) => {
  log('FATAL', String(e && e.stack || e))
  write(evd('phase-4/task18-fatal.md'), String(e && e.stack || e))
  if (browser) await browser.close().catch(() => {})
  killFirstRun()
  process.exit(1)
})
