#!/usr/bin/env node
/** Replay v1 spec 5.2 GUI chat + dsh_bot_ask + tab iframe after Task 18 locator fix. */
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
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
const ASK = 'Call dsh_bot_ask exactly once with prompt "Reply with exactly: dsh bot pong t18" and title "t18-ask". After the tool returns, quote the tool output verbatim and stop.'

function sh(cmd, args) {
  return spawnSync(cmd, args, {
    encoding: 'utf8',
    maxBuffer: 80 * 1024 * 1024,
    env: { ...process.env, DSH_HOME, PATH: process.env.PATH },
    cwd: ROOT,
  })
}
function who() { return (sh(WHO, ['3084']).stdout || '').trim() }
function rpc(method, payload = {}) {
  const r = sh(RPC, ['3084', method, JSON.stringify(payload)])
  let json
  try { json = JSON.parse(r.stdout || '{}') } catch { json = { parseError: true, raw: r.stdout } }
  return { json, stdout: r.stdout || '' }
}
function rpcValue(res) { return res.json?.result?.value ?? res.json?.value }
function rpcOk(res) { return res.json?.result?.ok === true || res.json?.ok === true }
function has(obj, n) { return JSON.stringify(obj ?? {}).includes(n) }
async function httpBot(method, args = {}) {
  const res = await fetch(`http://127.0.0.1:3084/dsh-bot/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ args }),
  })
  return { json: await res.json() }
}
function marksList() {
  const r = sh('node', [CLI, 'marks', 'list', '--kind', 'kind:dsh-bot'])
  return r.stdout || ''
}

const w = who()
if (!w.includes(DSH_HOME)) throw new Error(`not warehouse: ${w}`)
console.log('who', w)

const leftover = await httpBot('listBots')
for (const b of leftover.json?.value?.bots ?? []) {
  if (b.protected) continue
  if (/^n+$/i.test(b.id) || /^n+$/i.test(b.name) || b.id.startsWith('yaml')) {
    console.log('cleanup', b.id)
    await httpBot('deleteBot', { id: b.id })
  }
}

const created = rpc('session.create', { cwd: ROOT })
const sid = rpcValue(created)?.sessionId
const preset = rpcValue(created)?.agentPreset
console.log('gui session', sid, preset)
rpc('session.prompt', { sessionId: sid, mode: 'queue', content: [{ type: 'text', text: '你是谁? 用一句话回答，先说我是 DSH Bot。' }] })
let hist
for (let i = 0; i < 80; i++) {
  hist = rpc('session.history', { sessionId: sid, maxMessages: 80 })
  if (rpcOk(hist) && (has(hist.json, 'DSH Bot') && has(hist.json, 'assistant'))) break
  console.log('wait gui', i)
  await delay(2500)
}

const askCreated = rpc('session.create', { cwd: ROOT })
const askSid = rpcValue(askCreated)?.sessionId
console.log('ask session', askSid)
rpc('session.prompt', { sessionId: askSid, mode: 'queue', content: [{ type: 'text', text: ASK }] })
let askHist
for (let i = 0; i < 100; i++) {
  askHist = rpc('session.history', { sessionId: askSid, maxMessages: 200 })
  if (rpcOk(askHist) && has(askHist.json, 'dsh_bot_ask') && (has(askHist.json, 'dsh bot pong') || has(askHist.json, 'tool'))) break
  console.log('wait ask', i)
  await delay(2500)
}
const marks = marksList()

const browser = await chromium.launch({
  channel: 'chrome', headless: true,
  args: ['--disable-gpu', '--no-first-run', '--disable-dev-shm-usage'],
})
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
await page.goto('http://127.0.0.1:3084/', { waitUntil: 'domcontentloaded', timeout: 30000 })
await delay(1500)
mkdirSync(join(EVIDENCE, 'phase-4'), { recursive: true })
await page.screenshot({ path: join(EVIDENCE, 'phase-4/v1-gui-chat.png'), fullPage: true })

const expandBottom = page.getByRole('button', { name: '展开底部面板' })
if (await expandBottom.count()) await expandBottom.first().click().catch(() => {})
await delay(400)
const plus = page.getByTitle('新建标签页')
if (await plus.count()) await plus.last().click()
await delay(400)
await page.evaluate(() => {
  const nodes = [...document.querySelectorAll('button, [role="menuitem"], [role="option"]')]
  const hit = nodes.find((el) => {
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim()
    if (!text.startsWith('DSH Bot')) return false
    const title = el.getAttribute('title') || ''
    return !title.includes('预设')
  })
  hit?.click()
})
await page.getByTestId('dsh-bot-iframe').waitFor({ timeout: 20000 })
const frame = page.frameLocator('[data-testid="dsh-bot-iframe"]')
await frame.getByTestId('workbench-roster').waitFor({ timeout: 20000 })
await delay(800)
await page.screenshot({ path: join(EVIDENCE, 'phase-4/v1-tab-iframe.png'), fullPage: true })
const iframeOk = await frame.getByTestId('roster-row-dsh-bot').count()
const listSessions = await httpBot('listSessions', {})
await browser.close()

const md = `# v1 回归抽验 (workbench Task 18/19)

时间: ${STAMP}
网关: \`${who()}\`

抽验 v1 spec 5.2 三条主路径各一行。

## GUI 对话（UF-001 主路径）

\`session.create\` → \`${sid}\` agentPreset=\`${preset}\`（期望 dsh-bot）

prompt「你是谁?」history 含 DSH Bot: ${has(hist.json, 'DSH Bot')}；含 assistant: ${has(hist.json, 'assistant')}

截图 \`v1-gui-chat.png\`（官方 GUI；preset 选择器显示 DSH Bot）。

## 委托 dsh_bot_ask（UF-002 主路径）

主会话 \`${askSid}\` 要求恰好调用一次工具。

- history 含 dsh_bot_ask: ${has(askHist.json, 'dsh_bot_ask')}
- history 含 dsh bot pong t18: ${has(askHist.json, 'dsh bot pong t18')}

marks --kind kind:dsh-bot 非空: ${marks.includes('kind:dsh-bot')}

\`\`\`
${marks.split('\n').slice(0, 15).join('\n')}
\`\`\`

## 页签 iframe（UF-003 内容已换 iframe，id 仍 dsh-bot:sessions）

iframe roster 可见: ${iframeOk >= 1}
v1 \`POST /dsh-bot/listSessions\` ok=${listSessions.json?.ok} n=${(listSessions.json?.value?.sessions ?? []).length}

截图 \`v1-tab-iframe.png\`。
`
writeFileSync(join(EVIDENCE, 'phase-4/v1-regression.md'), md)
const ok = preset === 'dsh-bot' && has(hist.json, 'assistant') && has(askHist.json, 'dsh_bot_ask') && iframeOk >= 1 && listSessions.json?.ok === true
console.log(ok ? 'PASS v1 regression' : 'FAIL v1 regression', { preset, ask: has(askHist.json, 'dsh_bot_ask'), pong: has(askHist.json, 'dsh bot pong t18'), iframeOk, listOk: listSessions.json?.ok })
if (!ok) process.exit(1)
console.log('files', {
  md: existsSync(join(EVIDENCE, 'phase-4/v1-regression.md')),
  gui: existsSync(join(EVIDENCE, 'phase-4/v1-gui-chat.png')),
  tab: existsSync(join(EVIDENCE, 'phase-4/v1-tab-iframe.png')),
})
