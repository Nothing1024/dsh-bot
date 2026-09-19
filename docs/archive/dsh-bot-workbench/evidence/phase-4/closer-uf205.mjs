#!/usr/bin/env node
/**
 * Closer: UF-205 GUI 新会话 (new id) unlabeled, then open workbench to label
 * and appear in listBotSessions. Never POST /dsh-bot/reconcile.
 */
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
function sh(c, a) {
  return spawnSync(c, a, { encoding: 'utf8', maxBuffer: 8e7, env: { ...process.env, DSH_HOME, PATH: process.env.PATH }, cwd: ROOT })
}
function who() { return (sh(WHO, ['3084']).stdout || '').trim() }
function rpc(m, p = {}) {
  const r = sh(RPC, ['3084', m, JSON.stringify(p)])
  try { return JSON.parse(r.stdout || '{}') } catch { return {} }
}
function val(d) { return d?.result?.value ?? d?.value }
function sessionIds() { return (val(rpc('session.list', { limit: 200 }))?.items ?? []).map(i => i.sessionId) }
function marksGet(id) {
  const r = sh('node', [CLI, 'marks', 'get', '--id', id])
  return ((r.stdout || '') + (r.stderr || '')).trim()
}
async function httpBot(method, args = {}) {
  const res = await fetch(`http://127.0.0.1:3084/dsh-bot/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ args }),
  })
  return res.json()
}

const w = who()
if (!w.includes(DSH_HOME)) throw new Error(w)
log('who', w)

const before = new Set(sessionIds())
const bait = val(rpc('session.create', { cwd: ROOT, agentPreset: 'dsh-bot' }))
const baitId = bait?.sessionId
const baitMarks0 = baitId ? marksGet(baitId) : ''
log('bait blank', baitId, 'preset', bait?.agentPreset, 'marks', baitMarks0.slice(0, 80))
const marker = `t18fix-GUI8 ${Date.now()}`
const prompt = `你是谁? 请先说我是 DSH Bot。标记 ${marker}`

const browser = await chromium.launch({
  channel: 'chrome', headless: true,
  args: ['--disable-gpu', '--no-first-run', '--disable-dev-shm-usage'],
})
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
page.setDefaultTimeout(20000)

await page.goto('http://127.0.0.1:3084/', { waitUntil: 'domcontentloaded', timeout: 45000 })
await delay(2000)

const leftover = page.getByText('v1 leftover t18').first()
if (await leftover.count()) {
  await leftover.click()
  await delay(1000)
  log('clicked leftover')
}
const ph = async () => page.locator('textarea:visible').last().getAttribute('placeholder')
log('ph leftover', await ph())
await page.locator('button[aria-label="新建会话"]').filter({ hasText: '新会话' }).first().click()
await delay(800)
const wsNew = page.getByRole('button', { name: /在“plugin”中新建会话/ })
log('wsNew', await wsNew.count(), 'ph after 新会话', await ph())
if (await wsNew.count()) {
  await wsNew.first().click({ force: true })
  await delay(1500)
  log('clicked workspace 新建会话', 'ph', await ph())
}
for (let i = 0; i < 10; i++) {
  const p = await ph()
  const hero = await page.locator('body').innerText()
  log('wait landing', i, p, hero.includes('探索未至之境'))
  if (p && p.includes('描述你想要构建的内容')) break
  if (hero.includes('探索未至之境')) break
  await delay(400)
}
const ta = page.locator('textarea:visible').last()
await ta.click()
await ta.fill(prompt)
await ta.press('Enter')
log('enter', marker, 'ph', await ph())

let sid = ''
let firstMarks = baitMarks0
for (let i = 0; i < 50; i++) {
  const added = sessionIds().filter(id => !before.has(id) && id !== baitId)
  const candidates = [...added, baitId].filter(Boolean)
  for (const id of candidates) {
    const h = JSON.stringify(rpc('session.history', { sessionId: id, maxMessages: 40 }))
    if (h.includes(marker)) {
      sid = id
      if (id === baitId) firstMarks = baitMarks0
      else if (!firstMarks || firstMarks === baitMarks0) firstMarks = marksGet(id)
      log('hit', i, id, 'added', added, 'isBait', id === baitId)
      break
    }
  }
  if (sid) break
  if (i % 4 === 0) log('wait marker', i, 'added', added)
  await delay(400)
}
if (!sid) {
  await page.screenshot({ path: join(EVIDENCE, 'phase-4/closer-uf205-fail.png'), fullPage: true })
  await browser.close()
  throw new Error('GUI send did not land on bait or new session')
}
const unlabeled = !firstMarks.includes('bot:dsh-bot')
const preset = (val(rpc('session.list', { limit: 200 }))?.items ?? []).find(i => i.sessionId === sid)?.agentPreset
log('unlabeled', unlabeled, 'preset', preset)

mkdirSync(join(EVIDENCE, 'UF-205'), { recursive: true })
await page.screenshot({ path: join(EVIDENCE, 'UF-205/gui-create.png'), fullPage: true })

// Open workbench — the reconcile trigger
await page.goto('http://127.0.0.1:3084/dsh-bot/ui', { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.getByTestId('workbench-roster').waitFor({ timeout: 20000 })
let inList = false
let afterMarks = firstMarks
for (let i = 0; i < 25; i++) {
  afterMarks = marksGet(sid)
  const listed = await httpBot('listBotSessions', { botId: 'dsh-bot' })
  inList = (listed?.value?.sessions ?? []).some(s => s.sessionId === sid)
  log('wb', i, 'labeled', afterMarks.includes('bot:dsh-bot'), 'inList', inList)
  if (afterMarks.includes('bot:dsh-bot') && inList) break
  await delay(400)
}
await page.getByTestId('roster-row-dsh-bot').click().catch(() => {})
await delay(400)
if (inList) await page.getByTestId('session-select').selectOption(sid).catch(() => {})
await delay(800)
await page.screenshot({ path: join(EVIDENCE, 'UF-205/reconcile.png'), fullPage: true })
log('reconcile.png', statSync(join(EVIDENCE, 'UF-205/reconcile.png')).size)

writeFileSync(join(EVIDENCE, 'UF-205/marks-diff.txt'), `# UF-205 marks diff — official GUI 新会话 + 打开工作台

Gateway: ${who()}

## 0. GUI 直建（不是 RPC session.create）

Playwright 官方 GUI http://127.0.0.1:3084：
1. 点已有会话「v1 leftover t18」
2. 点「新会话」（aria 新建会话）
3. composer Enter 发送 \`${prompt}\`

新 sessionId=\`${sid}\` agentPreset=\`${preset}\`
**未**调用 POST /dsh-bot/reconcile。工作台在本步之前未打开（本 Playwright 上下文）。

GUI 截图: \`gui-create.png\`

## 1. Marks before GET /dsh-bot/ui

\`\`\`
${firstMarks || '(no marks row / session-not-found)'}
\`\`\`

unlabeled (no bot:dsh-bot): ${unlabeled}

## 2. Open workbench GET /dsh-bot/ui

App.tsx load → POST /dsh-bot/reconcile（页面自己的对账钩子）。

listBotSessions {botId:dsh-bot} includes \`${sid}\`: ${inList}

## 3. Marks after workbench open

\`\`\`
${afterMarks}
\`\`\`

labeled bot:dsh-bot: ${afterMarks.includes('bot:dsh-bot')}
`)

await browser.close()
const ok = Boolean(sid) && unlabeled && afterMarks.includes('bot:dsh-bot') && inList && preset === 'dsh-bot'
log(ok ? 'PASS UF-205' : 'FAIL UF-205', { sid, unlabeled, inList, labeled: afterMarks.includes('bot:dsh-bot') })
if (!ok) process.exit(1)
