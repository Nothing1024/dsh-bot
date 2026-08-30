#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

const require = createRequire(import.meta.url)
const { chromium } = require('/tmp/pw-dsh-t18/node_modules/playwright')
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..')
const DSH_HOME = join(ROOT, 'env')
const EVIDENCE = join(ROOT, 'docs/dsh-bot-workbench/evidence')
const WHO = `${homedir()}/.agents/skills/dsh-plugin-debug/scripts/dsh-rpc-who.sh`
const RPC = `${homedir()}/.agents/skills/dsh-plugin-debug/scripts/dsh-rpc.sh`
const CLI = join(ROOT, '../../session-tool/plugin/packages/session-tool-cli/lib/bin.js')

function log(...a) { console.log(`[${new Date().toISOString()}]`, ...a) }
function sh(c, a) { return spawnSync(c, a, { encoding: 'utf8', maxBuffer: 8e7, env: { ...process.env, DSH_HOME, PATH: process.env.PATH }, cwd: ROOT }) }
function rpc(m, p = {}) { const r = sh(RPC, ['3084', m, JSON.stringify(p)]); try { return JSON.parse(r.stdout || '{}') } catch { return {} } }
function val(d) { return d?.result?.value ?? d?.value }
function marksGet(id) { return (sh('node', [CLI, 'marks', 'get', '--id', id]).stdout || sh('node', [CLI, 'marks', 'get', '--id', id]).stderr || '').trim() }
function ids() { return (val(rpc('session.list', { limit: 200 }))?.items ?? []).map(i => i.sessionId) }
async function httpBot(method, args = {}) {
  const res = await fetch(`http://127.0.0.1:3084/dsh-bot/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ args }) })
  return res.json()
}

log('who', sh(WHO, ['3084']).stdout.trim())
const before = new Set(ids())
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-gpu', '--no-first-run'] })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
await page.goto('http://127.0.0.1:3084/', { waitUntil: 'domcontentloaded', timeout: 45000 })
await delay(2000)
await page.locator('button[aria-label="新建会话"]').filter({ hasText: '新会话' }).first().click()
await delay(800)
const prompt = `GUI直建补标。标记 t18fix-GUI6 ${Date.now()}`
const box = page.locator('textarea').nth(0)
await box.fill(prompt)
await box.press('Enter')
log('sent', prompt)

let sid, beforeMarks = ''
for (let i = 0; i < 40; i++) {
  const added = ids().filter(id => !before.has(id))
  if (added.length) {
    sid = added[0]
    beforeMarks = marksGet(sid)
    log('added', i, sid, beforeMarks.slice(0, 100))
    break
  }
  await delay(250)
}
if (!sid) {
  for (const it of (val(rpc('session.list', { limit: 15 }))?.items ?? [])) {
    const h = rpc('session.history', { sessionId: it.sessionId, maxMessages: 20 })
    if (JSON.stringify(h).includes('t18fix-GUI6')) { sid = it.sessionId; beforeMarks = marksGet(sid); break }
  }
}
if (!sid) throw new Error('no session')
const unlabeled = !beforeMarks.includes('bot:dsh-bot')
log('unlabeled', unlabeled, beforeMarks)

// wait a bit for assistant paint, screenshot GUI
for (let i = 0; i < 25; i++) {
  const body = await page.locator('body').innerText()
  if (body.includes('t18fix-GUI6') && body.includes('DSH Bot') && !body.includes('探索未至之境')) break
  await delay(1000)
}
await page.screenshot({ path: join(EVIDENCE, 'phase-4/v1-gui-chat.png'), fullPage: true })
log('gui shot', statSync(join(EVIDENCE, 'phase-4/v1-gui-chat.png')).size)

// NOW open workbench — this is the reconcile trigger
await page.goto('http://127.0.0.1:3084/dsh-bot/ui', { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.getByTestId('workbench-roster').waitFor()
let inList = false
for (let i = 0; i < 20; i++) {
  const listed = await httpBot('listBotSessions', { botId: 'dsh-bot' })
  inList = (listed?.value?.sessions ?? []).some(s => s.sessionId === sid)
  if (inList) break
  await delay(500)
}
await page.getByTestId('roster-row-dsh-bot').click().catch(() => {})
await delay(400)
if (inList) await page.getByTestId('session-select').selectOption(sid).catch(() => {})
await delay(600)
mkdirSync(join(EVIDENCE, 'UF-205'), { recursive: true })
await page.screenshot({ path: join(EVIDENCE, 'UF-205/reconcile.png'), fullPage: true })
const afterMarks = marksGet(sid)
const labeled = afterMarks.includes('bot:dsh-bot')
writeFileSync(join(EVIDENCE, 'UF-205/marks-diff.txt'), `# UF-205 marks diff — official GUI 直建 + 打开工作台对账

Gateway: ${sh(WHO, ['3084']).stdout.trim()}

## 0. Setup

Playwright 只打开官方 GUI http://127.0.0.1:3084（未先开工作台）。
点击「新会话」，composer Enter 发送 \`${prompt}\`。
**全程未**调用 POST /dsh-bot/reconcile。

sessionId=\`${sid}\`

## 1. Before opening workbench

\`\`\`
${beforeMarks}
\`\`\`

unlabeled (no bot:dsh-bot): ${unlabeled}

## 2. Open workbench GET /dsh-bot/ui (App.tsx load → reconcile)

listBotSessions includes session: ${inList}

## 3. After workbench open

\`\`\`
${afterMarks}
\`\`\`

labeled bot:dsh-bot: ${labeled}
`)
log('UF-205', { unlabeled, labeled, inList, sid })
await browser.close()
if (!(unlabeled && labeled && inList)) process.exit(1)
