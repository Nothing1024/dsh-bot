#!/usr/bin/env node
/**
 * Review-fix for Task 18 p1: UF-203 history isolation, UF-205 GUI create +
 * workbench-open reconcile, UF-206 official rail, v1 UF-001 GUI chat screenshot.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
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
const PERSONA = '你是诗人小北。每次回答必须先写「我是诗人小北」，然后只用两句五言或七言诗作答，不要用现代口语长段落。'
const rows = []
const logLines = []
let browser
let page

function log(...a) {
  const line = `[${new Date().toISOString()}] ` + a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ')
  console.log(line)
  logLines.push(line)
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
function sh(cmd, args) {
  return spawnSync(cmd, args, {
    encoding: 'utf8', maxBuffer: 80 * 1024 * 1024,
    env: { ...process.env, DSH_HOME, PATH: process.env.PATH }, cwd: ROOT,
  })
}
function who() { return (sh(WHO, ['3084']).stdout || '').trim() }
function rpc(method, payload = {}) {
  const r = sh(RPC, ['3084', method, JSON.stringify(payload)])
  let json
  try { json = JSON.parse(r.stdout || '{}') } catch { json = { parseError: true, raw: r.stdout } }
  return { json, stdout: r.stdout || '', stderr: r.stderr || '' }
}
function rpcValue(res) { return res.json?.result?.value ?? res.json?.value }
function rpcOk(res) { return res.json?.result?.ok === true || res.json?.ok === true }
async function httpBot(method, args = {}) {
  const res = await fetch(`http://127.0.0.1:3084/dsh-bot/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ args }),
  })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = { parseError: true, text } }
  return { json, text }
}
function marksGet(id) {
  const r = sh('node', [CLI, 'marks', 'get', '--id', id])
  return { exit: r.status ?? 1, stdout: r.stdout || '', stderr: r.stderr || '' }
}
function dumpJson(obj) { return JSON.stringify(obj, null, 2) }
function row(id, pass, detail) {
  rows.push({ id, pass: Boolean(pass), detail: String(detail ?? '') })
  log(`${pass ? 'PASS' : 'FAIL'} ${id} — ${detail}`)
}
function sessionIds() {
  const v = rpcValue(rpc('session.list', { limit: 200 }))
  return (v?.items ?? []).map(i => i.sessionId)
}
function sessionRow(id) {
  const v = rpcValue(rpc('session.list', { limit: 200 }))
  return (v?.items ?? []).find(i => i.sessionId === id)
}

async function launch() {
  const w = who()
  if (!w.includes(DSH_HOME)) throw new Error(`3084 not this warehouse: ${w}`)
  log('who', w)
  browser = await chromium.launch({
    channel: 'chrome', headless: true,
    args: ['--disable-gpu', '--no-first-run', '--disable-dev-shm-usage'],
  })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  page = await ctx.newPage()
  page.setDefaultTimeout(25000)
}

async function shot(rel) {
  const path = evd(rel)
  await page.screenshot({ path, fullPage: true })
  log('shot', rel, existsSync(path) ? `${(await import('node:fs')).statSync(path).size}B` : 'MISSING')
  return path
}

async function waitHistory(sessionId, pred, { tries = 80, ms = 2000, label = 'hist' } = {}) {
  let last
  for (let i = 0; i < tries; i++) {
    last = await httpBot('history', { sessionId })
    const value = last.json?.value
    if (last.json?.ok && value && pred(value)) return last
    log(`wait ${label} ${sessionId} #${i}`)
    await delay(ms)
  }
  return last
}

function assistantText(value) {
  return (value?.items ?? []).filter(i => i.role === 'assistant').map(i => i.text || '').join('\n')
}

async function openWorkbench() {
  await page.goto('http://127.0.0.1:3084/dsh-bot/ui', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.getByTestId('workbench-roster').waitFor({ timeout: 20000 })
  await delay(600)
}

async function sendWorkbench(text) {
  await page.getByTestId('composer-input').fill(text)
  await page.getByTestId('composer-send').click()
}

async function ensurePoet() {
  const listed = await httpBot('listBots')
  const has = (listed.json?.value?.bots ?? []).some(b => b.id === 'shiren-xiaobei')
  if (has) return
  await openWorkbench()
  await page.getByTestId('roster-new').click()
  await page.getByTestId('bot-form-name').fill('诗人小北')
  await page.getByTestId('bot-form-persona').fill(PERSONA)
  await page.getByTestId('bot-form-submit').click()
  await page.getByTestId('roster-row-shiren-xiaobei').waitFor({ timeout: 20000 })
  log('created 诗人小北')
}

function rpcHas(hist, needle) {
  return JSON.stringify(hist.json ?? {}).includes(needle)
}

/** v1 UF-001 + UF-205: official GUI 新建会话, chat, then open workbench to reconcile. */
async function uf205AndV1Gui() {
  const beforeIds = new Set(sessionIds())
  await page.goto('http://127.0.0.1:3084/', { waitUntil: 'domcontentloaded', timeout: 45000 })
  await delay(2500)
  const newBtns = page.locator('button[aria-label="新建会话"]')
  log('new-session buttons', await newBtns.count())
  const newSessionBtn = newBtns.filter({ hasText: '新会话' })
  if (await newSessionBtn.count()) await newSessionBtn.first().click({ timeout: 10000 }).catch(() => {})
  await page.getByPlaceholder('描述你想要构建的内容').waitFor({ timeout: 20000 })
  const prompt = '你是谁? 请先说我是 DSH Bot。标记 t18fix-GUI'
  await page.getByPlaceholder('描述你想要构建的内容').fill(prompt)
  await page.getByRole('button', { name: '发送消息' }).click()
  log('gui sent landing composer')

  let sid
  let rpcHist
  for (let i = 0; i < 50; i++) {
    const added = sessionIds().filter(id => !beforeIds.has(id))
    const candidates = added.length ? added : (rpcValue(rpc('session.list', { limit: 20 }))?.items ?? []).slice(0, 5).map(x => x.sessionId)
    for (const id of candidates) {
      const h = rpc('session.history', { sessionId: id, maxMessages: 80 })
      if (rpcHas(h, 't18fix-GUI')) {
        sid = id
        rpcHist = h
        break
      }
    }
    if (sid) {
      rpcHist = rpc('session.history', { sessionId: sid, maxMessages: 80 })
      if (rpcHas(rpcHist, 'turn/end') && rpcHas(rpcHist, 'assistant')) break
    }
    log('wait gui-create', i, 'added', added, 'sid', sid)
    await delay(2500)
  }
  const preset = sessionRow(sid)?.agentPreset
  const beforeMarks = marksGet(sid)
  log('gui sid', sid, 'preset', preset, 'marks', (beforeMarks.stdout || beforeMarks.stderr).trim())

  for (let i = 0; i < 20 && sid; i++) {
    const body = await page.locator('body').innerText()
    if (body.includes('t18fix-GUI') && body.includes('DSH Bot') && !body.includes('探索未至之境')) break
    log('wait gui paint', i)
    await delay(1000)
  }
  const body = await page.locator('body').innerText()
  await shot('phase-4/v1-gui-chat.png')
  const guiShowsReply = body.includes('DSH Bot') && body.includes('t18fix-GUI') && !body.includes('探索未至之境')
  const replyOk = sid && rpcHas(rpcHist, 'DSH Bot') && rpcHas(rpcHist, 'assistant')
  row('v1 UF-001 gui-chat', Boolean(sid) && preset === 'dsh-bot' && replyOk && guiShowsReply,
    `sid=${sid} preset=${preset} guiShowsReply=${guiShowsReply}`)

  const marksStill = marksGet(sid)
  const unlabeled = !/bot:dsh-bot/.test(marksStill.stdout || '')

  await openWorkbench()
  let inList = false
  let listed
  for (let i = 0; i < 20; i++) {
    listed = await httpBot('listBotSessions', { botId: 'dsh-bot' })
    inList = (listed.json?.value?.sessions ?? []).some(s => s.sessionId === sid)
    if (inList) break
    log('wait reconcile into list', i)
    await delay(1000)
  }
  await page.getByTestId('roster-row-dsh-bot').click().catch(() => {})
  await delay(500)
  if (inList) {
    await page.getByTestId('session-select').selectOption(sid).catch(() => {})
    await delay(800)
  }
  await shot('UF-205/reconcile.png')
  const afterMarks = marksGet(sid)
  const labeled = /bot:dsh-bot/.test(afterMarks.stdout || '')
  write(evd('UF-205/marks-diff.txt'), `# UF-205 marks diff — official GUI 直建 + 打开工作台对账

Date: ${STAMP}
Gateway: ${who()}

## 0. Setup

官方 GUI http://127.0.0.1:3084 点击「新会话」（aria 新建会话），默认 preset=dsh-bot。
未调用 POST /dsh-bot/reconcile；未先打开工作台。
composer 发送「你是谁? … 标记 t18fix-GUI」。

sessionId=\`${sid}\` agentPreset=\`${preset}\`

## 1. Before opening workbench

marks get:

\`\`\`
${(marksStill.stdout || marksStill.stderr).trim() || '(no marks row)'}
\`\`\`

unlabeled (no bot:dsh-bot): ${unlabeled}

## 2. Open workbench \`GET /dsh-bot/ui\` (client reconcile on load)

listBotSessions includes session: ${inList}

## 3. After workbench open

\`\`\`
${(afterMarks.stdout || afterMarks.stderr).trim()}
\`\`\`

labeled bot:dsh-bot: ${labeled}

Screenshot: reconcile.png (session selected in Header 对话下拉).
v1 GUI chat screenshot: phase-4/v1-gui-chat.png
`)
  write(evd('UF-205/session-options.txt'), await page.getByTestId('session-select').innerText().catch(() => ''))
  row('UF-205 gui-reconcile', Boolean(sid) && unlabeled && labeled && inList,
    `sid=${sid} unlabeled=${unlabeled} labeled=${labeled} inList=${inList}`)
  return sid
}

async function uf203() {
  await ensurePoet()
  await openWorkbench()
  await page.getByTestId('roster-row-dsh-bot').click()
  await delay(400)
  await page.getByTestId('session-new').click()
  await delay(700)
  await sendWorkbench('你是谁? 请先说我是 DSH Bot。标记 t18fix-A')
  await delay(500)
  const sessA = await httpBot('listBotSessions', { botId: 'dsh-bot' })
  const sidA = sessA.json?.value?.sessions?.[0]?.sessionId
  const histA = await waitHistory(sidA, v => assistantText(v).includes('DSH Bot'), { label: 'iso-A' })
  const textA = assistantText(histA.json?.value)

  await page.getByTestId('roster-row-shiren-xiaobei').click()
  await delay(500)
  await page.getByTestId('session-new').click()
  await delay(700)
  await sendWorkbench('你是谁? 标记 t18fix-B')
  const workingB = await page.getByTestId('roster-working-shiren-xiaobei').count()
  const workingA = await page.getByTestId('roster-working-dsh-bot').count()
  await shot('UF-203/working-b.png')
  const sessB = await httpBot('listBotSessions', { botId: 'shiren-xiaobei' })
  const sidB = sessB.json?.value?.sessions?.[0]?.sessionId
  const histB = await waitHistory(sidB, v => assistantText(v).includes('诗人小北'), { label: 'iso-B' })
  const textB = assistantText(histB.json?.value)

  await page.getByTestId('roster-row-dsh-bot').click()
  await delay(400)
  if (sidA) await page.getByTestId('session-select').selectOption(sidA).catch(() => {})
  await delay(600)
  await page.getByTestId('composer-input').fill('草稿给DSH Bot不发送')
  await delay(300)
  await page.getByTestId('roster-row-shiren-xiaobei').click()
  await delay(500)
  const composerB = await page.getByTestId('composer-input').inputValue()
  const headerB = await page.getByTestId('conversation-name').innerText()
  await page.getByTestId('roster-row-dsh-bot').click()
  await delay(500)
  const composerA = await page.getByTestId('composer-input').inputValue()
  const headerA = await page.getByTestId('conversation-name').innerText()
  const transcriptA = await page.locator('[data-testid="transcript"]').innerText().catch(() => '')
  await shot('UF-203/isolation.png')

  mkdirSync(evd('UF-203/exports'), { recursive: true })
  const expA = await httpBot('history', { sessionId: sidA })
  const expB = await httpBot('history', { sessionId: sidB })
  write(evd('UF-203/exports/sidA.json'), dumpJson(expA.json))
  write(evd('UF-203/exports/sidB.json'), dumpJson(expB.json))
  write(evd('UF-203/exports/session-ids.json'), dumpJson({ sidA, sidB }))
  write(evd('UF-203/exports/compare.md'), `# UF-203 session export comparison

时间: ${STAMP}

| bot | session | assistant 含 DSH Bot | assistant 含 诗人小北 |
|---|---|---|---|
| DSH Bot | \`${sidA}\` | ${textA.includes('DSH Bot')} | ${textA.includes('诗人小北')} |
| 诗人小北 | \`${sidB}\` | ${textB.includes('DSH Bot')} | ${textB.includes('诗人小北')} |

A 摘录: ${JSON.stringify(textA.slice(0, 240))}

B 摘录: ${JSON.stringify(textB.slice(0, 240))}

草稿切回 A composer=${JSON.stringify(composerA)}；B composer=${JSON.stringify(composerB)}
`)
  write(evd('UF-203/four-steps.json'), dumpJson({
    sidA, sidB, composerA, composerB, headerA, headerB, workingA, workingB,
    transcriptHasDsh: transcriptA.includes('DSH Bot'),
  }))
  const aItems = expA.json?.value?.items ?? []
  const ok = aItems.some(i => i.role === 'assistant' && (i.text || '').includes('DSH Bot'))
    && textB.includes('诗人小北')
    && !textA.includes('诗人小北')
    && composerA.includes('草稿给DSH Bot不发送')
    && composerB.trim() === ''
    && headerA.includes('DSH Bot')
    && headerB.includes('诗人小北')
  row('UF-203 isolation', ok, `sidA=${sidA} sidB=${sidB} aItems=${aItems.length} draftA=${composerA}`)
  return { sidA, sidB, textB }
}

async function uf206({ sidB }) {
  const beforePresets = rpc('agentPreset.list', {})
  const keepMarks = sidB ? marksGet(sidB) : { stdout: '' }
  await openWorkbench()
  await page.getByTestId('roster-row-shiren-xiaobei').click()
  await page.getByTestId('roster-menu-shiren-xiaobei').click()
  await page.getByTestId('roster-delete-shiren-xiaobei').click()
  await page.getByTestId('roster-delete-ok').click()
  await delay(1000)
  const gone = await page.getByTestId('roster-row-shiren-xiaobei').count()
  await shot('UF-206/delete.png')
  const afterPresets = rpc('agentPreset.list', {})
  const presets = v => (rpcValue(v)?.presets ?? []).map(p => p.id)
  const stillDir = existsSync(join(DSH_HOME, '.agent-presets', 'dsh-bot--shiren-xiaobei'))
  const afterMarks = sidB ? marksGet(sidB) : { stdout: '' }

  await page.goto('http://127.0.0.1:3084/', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await delay(1500)
  const expand = page.getByText(/展开其余/)
  if (await expand.count()) await expand.first().click().catch(() => {})
  await delay(400)
  const hit = page.getByText(/t18fix-B|诗人小北/).first()
  if (await hit.count()) await hit.click({ timeout: 8000 }).catch(() => {})
  await delay(800)
  const rail = await page.locator('body').innerText()
  await shot('UF-206/official-rail.png')
  const railHas = rail.includes('t18fix-B') || /诗人/.test(rail)
  write(evd('UF-206/preset-list-diff.txt'), `BEFORE dsh-bot--*
${presets(beforePresets).filter(id => String(id).startsWith('dsh-bot')).join('\n')}

AFTER dsh-bot--*
${presets(afterPresets).filter(id => String(id).startsWith('dsh-bot')).join('\n')}

preset dir exists after delete: ${stillDir}
workbench roster-row-shiren-xiaobei count: ${gone}

session ${sidB} marks before:
${keepMarks.stdout}
session ${sidB} marks after (should remain):
${afterMarks.stdout}

official GUI rail still lists the history (t18fix-B / 诗人): ${railHas}
screenshot: official-rail.png (session remains in official session list after bot delete)
`)
  row('UF-206 delete+rail', gone === 0 && !stillDir && !presets(afterPresets).includes('dsh-bot--shiren-xiaobei') && /kind:dsh-bot/.test(afterMarks.stdout) && railHas,
    `gone=${gone} dir=${stillDir} railHas=${railHas}`)
}

async function main() {
  await launch()
  const guiSid = await uf205AndV1Gui()
  const iso = await uf203()
  await uf206(iso)
  await browser.close()
  const summary = rows.map(r => `${r.pass ? 'PASS' : 'FAIL'} ${r.id} — ${r.detail}`).join('\n')
  write(evd('phase-4/task18-review-fix.md'), `# Task 18 review-fix\n\n时间: ${STAMP}\n\n\`\`\`\n${summary}\n\`\`\`\n\nlog:\n\n\`\`\`\n${logLines.join('\n')}\n\`\`\`\n`)
  log('DONE', summary)
  if (rows.some(r => !r.pass)) process.exitCode = 1
}

main().catch(async (e) => {
  log('FATAL', String(e && e.stack || e))
  write(evd('phase-4/task18-review-fix-fatal.md'), String(e && e.stack || e))
  if (browser) await browser.close().catch(() => {})
  process.exit(1)
})
