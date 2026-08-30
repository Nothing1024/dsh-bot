#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs'
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
const STAMP = new Date().toISOString()
const PERSONA = '你是诗人小北。每次回答必须先写「我是诗人小北」，然后只用两句五言或七言诗作答，不要用现代口语长段落。'
const rows = []
let page, browser

function log(...a) { console.log(`[${new Date().toISOString()}]`, ...a) }
function evd(...p) { const x = join(EVIDENCE, ...p); mkdirSync(dirname(x), { recursive: true }); return x }
function write(p, b) { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, b) }
function sh(cmd, args) {
  return spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 80 * 1024 * 1024, env: { ...process.env, DSH_HOME, PATH: process.env.PATH }, cwd: ROOT })
}
function who() { return (sh(WHO, ['3084']).stdout || '').trim() }
function rpc(method, payload = {}) {
  const r = sh(RPC, ['3084', method, JSON.stringify(payload)])
  try { return JSON.parse(r.stdout || '{}') } catch { return { raw: r.stdout } }
}
function rpcValue(d) { return d?.result?.value ?? d?.value }
async function httpBot(method, args = {}) {
  const res = await fetch(`http://127.0.0.1:3084/dsh-bot/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ args }),
  })
  return res.json()
}
function marksGet(id) {
  const r = sh('node', [CLI, 'marks', 'get', '--id', id])
  return (r.stdout || r.stderr || '').trim()
}
function sessionIds() {
  return (rpcValue(rpc('session.list', { limit: 200 }))?.items ?? []).map(i => i.sessionId)
}
function row(id, pass, detail) {
  rows.push({ id, pass: Boolean(pass), detail: String(detail) })
  log(pass ? 'PASS' : 'FAIL', id, '—', detail)
}
async function shot(rel) {
  const p = evd(rel)
  await page.screenshot({ path: p, fullPage: true })
  log('shot', rel, statSync(p).size)
}
function assistantText(value) {
  return (value?.items ?? []).filter(i => i.role === 'assistant').map(i => i.text || '').join('\n')
}
async function waitHist(sid, pred, label) {
  let last
  for (let i = 0; i < 40; i++) {
    last = await httpBot('history', { sessionId: sid })
    if (last?.ok && pred(last.value)) return last
    log('wait', label, i)
    await delay(2000)
  }
  return last
}

async function openWb() {
  await page.goto('http://127.0.0.1:3084/dsh-bot/ui', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.getByTestId('workbench-roster').waitFor({ timeout: 20000 })
  await delay(500)
}

function findByNeedle(needle) {
  const items = rpcValue(rpc('session.list', { limit: 30 }))?.items ?? []
  for (const it of items.slice(0, 12)) {
    const h = rpc('session.history', { sessionId: it.sessionId, maxMessages: 30 })
    if (JSON.stringify(h).includes(needle)) return it.sessionId
  }
}

async function uf205() {
  const before = new Set(sessionIds())
  await page.goto('http://127.0.0.1:3084/', { waitUntil: 'domcontentloaded', timeout: 45000 })
  await delay(2000)
  const btn = page.locator('button[aria-label="新建会话"]').filter({ hasText: '新会话' })
  await btn.first().click()
  await delay(1000)
  const prompt = `GUI直建补标 ping。标记 t18fix-GUI5 ${Date.now()}`
  const box = page.locator('textarea').nth(0)
  await box.click()
  await box.fill(prompt)
  await box.press('Enter')
  log('sent-enter', prompt)
  await shot('phase-4/uf205-after-send.png')

  let sid
  let firstMarks = ''
  for (let i = 0; i < 50; i++) {
    const added = sessionIds().filter(id => !before.has(id))
    const found = findByNeedle('t18fix-GUI5')
    sid = found || added[0]
    if (sid && !firstMarks) firstMarks = marksGet(sid)
    if (sid) {
      const raw = JSON.stringify(rpc('session.history', { sessionId: sid, maxMessages: 40 }))
      log('hit', i, sid, 'added', added, 'end', raw.includes('turn/end'), 'marks', firstMarks.slice(0, 60))
      if (raw.includes('t18fix-GUI5') && (raw.includes('turn/end') || i > 10)) break
    } else if (i % 4 === 0) log('wait sid', i)
    await delay(500)
  }
  if (!sid) throw new Error('no GUI session with t18fix-GUI5')
  const preset = (rpcValue(rpc('session.list', { limit: 200 }))?.items ?? []).find(i => i.sessionId === sid)?.agentPreset
  const beforeMarks = firstMarks || marksGet(sid)
  const unlabeled = !beforeMarks.includes('bot:dsh-bot')
  log('sid', sid, 'preset', preset, 'beforeMarks', beforeMarks, 'unlabeled', unlabeled)

  await openWb()
  let inList = false
  for (let i = 0; i < 20; i++) {
    const listed = await httpBot('listBotSessions', { botId: 'dsh-bot' })
    inList = (listed?.value?.sessions ?? []).some(s => s.sessionId === sid)
    if (inList) break
    log('wait list', i)
    await delay(1000)
  }
  await page.getByTestId('roster-row-dsh-bot').click().catch(() => {})
  await delay(400)
  if (inList) await page.getByTestId('session-select').selectOption(sid).catch(() => {})
  await delay(600)
  await shot('UF-205/reconcile.png')
  const afterMarks = marksGet(sid)
  const labeled = afterMarks.includes('bot:dsh-bot')
  write(evd('UF-205/marks-diff.txt'), `# UF-205 marks diff — official GUI 直建 + 打开工作台对账

Date: ${STAMP}
Gateway: ${who()}

## 0. Setup

官方 GUI：先点已有会话「v1 leftover t18」，再点「新会话」（aria 新建会话），composer 发送 \`${prompt}\`。
**未**调用 POST /dsh-bot/reconcile。对账触发 = 打开 \`/dsh-bot/ui\`。

sessionId=\`${sid}\` agentPreset=\`${preset}\`

## 1. Before opening workbench

\`\`\`
${beforeMarks || '(no marks row)'}
\`\`\`

unlabeled (no bot:dsh-bot): ${unlabeled}

## 2. Open workbench GET /dsh-bot/ui

listBotSessions includes session: ${inList}

## 3. After workbench open

\`\`\`
${afterMarks}
\`\`\`

labeled bot:dsh-bot: ${labeled}
`)
  row('UF-205', unlabeled && labeled && inList && preset === 'dsh-bot', `sid=${sid} unlabeled=${unlabeled} labeled=${labeled} inList=${inList}`)
}

async function uf203and206() {
  let bots = await httpBot('listBots')
  if (!(bots?.value?.bots ?? []).some(b => b.id === 'shiren-xiaobei')) {
    await openWb()
    await page.getByTestId('roster-new').click()
    await page.getByTestId('bot-form-name').fill('诗人小北')
    await page.getByTestId('bot-form-persona').fill(PERSONA)
    await page.getByTestId('bot-form-submit').click()
    await page.getByTestId('roster-row-shiren-xiaobei').waitFor({ timeout: 20000 })
  }
  await openWb()
  await page.getByTestId('roster-row-dsh-bot').click()
  await delay(300)
  await page.getByTestId('session-new').click()
  await delay(800)
  await page.getByTestId('composer-input').fill('你是谁? 请先说我是 DSH Bot。标记 t18fix-A')
  await page.getByTestId('composer-send').click()
  await delay(600)
  const sidA = await page.getByTestId('session-select').inputValue()
  log('sidA', sidA)
  const histA = await waitHist(sidA, v => assistantText(v).includes('DSH Bot'), 'A')
  const textA = assistantText(histA?.value)

  await page.getByTestId('roster-row-shiren-xiaobei').click()
  await delay(400)
  await page.getByTestId('session-new').click()
  await delay(800)
  await page.getByTestId('composer-input').fill('你是谁? 标记 t18fix-B')
  await page.getByTestId('composer-send').click()
  await delay(400)
  const workingB = await page.getByTestId('roster-working-shiren-xiaobei').count()
  const workingA = await page.getByTestId('roster-working-dsh-bot').count()
  await shot('UF-203/working-b.png')
  const sidB = await page.getByTestId('session-select').inputValue()
  log('sidB', sidB)
  const histB = await waitHist(sidB, v => assistantText(v).includes('诗人小北'), 'B')
  const textB = assistantText(histB?.value)

  await page.getByTestId('roster-row-dsh-bot').click()
  await delay(400)
  await page.getByTestId('session-select').selectOption(sidA).catch(() => {})
  await delay(500)
  await page.getByTestId('composer-input').fill('草稿给DSH Bot不发送')
  await delay(300)
  await page.getByTestId('roster-row-shiren-xiaobei').click()
  await delay(500)
  const composerB = await page.getByTestId('composer-input').inputValue()
  await page.getByTestId('roster-row-dsh-bot').click()
  await delay(500)
  const composerA = await page.getByTestId('composer-input').inputValue()
  const transcriptA = await page.locator('[data-testid="transcript"]').innerText().catch(() => '')
  await shot('UF-203/isolation.png')
  mkdirSync(evd('UF-203/exports'), { recursive: true })
  const expA = await httpBot('history', { sessionId: sidA })
  const expB = await httpBot('history', { sessionId: sidB })
  write(evd('UF-203/exports/sidA.json'), JSON.stringify(expA, null, 2))
  write(evd('UF-203/exports/sidB.json'), JSON.stringify(expB, null, 2))
  write(evd('UF-203/exports/session-ids.json'), JSON.stringify({ sidA, sidB }, null, 2))
  write(evd('UF-203/exports/compare.md'), `# UF-203 export

| bot | sid | DSH Bot 口吻 | 诗人小北 口吻 |
|---|---|---|---|
| A | ${sidA} | ${textA.includes('DSH Bot')} | ${textA.includes('诗人小北')} |
| B | ${sidB} | ${textB.includes('DSH Bot')} | ${textB.includes('诗人小北')} |

A: ${JSON.stringify(textA.slice(0, 200))}
B: ${JSON.stringify(textB.slice(0, 200))}
draftA=${JSON.stringify(composerA)} draftB=${JSON.stringify(composerB)}
transcriptA has DSH Bot: ${transcriptA.includes('DSH Bot')}
`)
  const aItems = expA?.value?.items ?? []
  row('UF-203', aItems.some(i => i.role === 'assistant' && (i.text || '').includes('DSH Bot'))
    && textB.includes('诗人小北') && !textA.includes('诗人小北')
    && composerA.includes('草稿给DSH Bot不发送') && composerB.trim() === '',
  `sidA=${sidA} sidB=${sidB} aItems=${aItems.length} draft=${composerA}`)

  const beforeP = rpcValue(rpc('agentPreset.list', {}))?.presets ?? []
  const keepMarks = marksGet(sidB)
  await page.getByTestId('roster-menu-shiren-xiaobei').click()
  await page.getByTestId('roster-delete-shiren-xiaobei').click()
  await page.getByTestId('roster-delete-ok').click()
  await delay(1000)
  const gone = await page.getByTestId('roster-row-shiren-xiaobei').count()
  await shot('UF-206/delete.png')
  const afterP = rpcValue(rpc('agentPreset.list', {}))?.presets ?? []
  const stillDir = existsSync(join(DSH_HOME, '.agent-presets', 'dsh-bot--shiren-xiaobei'))
  const afterMarks = marksGet(sidB)

  await page.goto('http://127.0.0.1:3084/', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await delay(1500)
  const expand = page.getByText(/展开其余/)
  if (await expand.count()) await expand.first().click().catch(() => {})
  await delay(400)
  const hit = page.getByText('t18fix-B').first()
  if (await hit.count()) await hit.click().catch(() => {})
  else {
    const any = page.getByText(/诗人小北/).first()
    if (await any.count()) await any.click().catch(() => {})
  }
  await delay(800)
  const rail = await page.locator('body').innerText()
  await shot('UF-206/official-rail.png')
  const railHas = rail.includes('t18fix-B') || rail.includes('诗人小北')
  write(evd('UF-206/preset-list-diff.txt'), `BEFORE
${beforeP.map(p => p.id).filter(id => String(id).startsWith('dsh-bot')).join('\n')}

AFTER
${afterP.map(p => p.id).filter(id => String(id).startsWith('dsh-bot')).join('\n')}

preset dir exists after delete: ${stillDir}
roster-row-shiren-xiaobei: ${gone}
marks before:\n${keepMarks}
marks after (should remain):\n${afterMarks}
official GUI rail still shows t18fix-B/诗人: ${railHas}
see official-rail.png
`)
  row('UF-206', gone === 0 && !stillDir && afterMarks.includes('kind:dsh-bot') && railHas,
    `gone=${gone} dir=${stillDir} railHas=${railHas}`)
}

async function main() {
  const w = who()
  if (!w.includes(DSH_HOME)) throw new Error(w)
  log('who', w)
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-gpu', '--no-first-run'] })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  page = await ctx.newPage()
  page.setDefaultTimeout(20000)
  await uf203and206()
  await uf205()
  await browser.close()
  write(evd('phase-4/task18-review-fix2.md'), rows.map(r => `${r.pass ? 'PASS' : 'FAIL'} ${r.id} — ${r.detail}`).join('\n') + '\n')
  log('DONE', rows)
  if (rows.some(r => !r.pass)) process.exit(1)
}

main().catch(async (e) => {
  log('FATAL', e.stack || e)
  write(evd('phase-4/task18-review-fix2-fatal.md'), String(e.stack || e))
  if (browser) await browser.close().catch(() => {})
  process.exit(1)
})
