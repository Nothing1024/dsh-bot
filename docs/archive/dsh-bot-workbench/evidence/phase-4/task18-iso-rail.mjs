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
const PERSONA = '你是诗人小北。每次回答必须先写「我是诗人小北」，然后只用两句五言或七言诗作答，不要用现代口语长段落。'

function log(...a) { console.log(`[${new Date().toISOString()}]`, ...a) }
function evd(...p) { const x = join(EVIDENCE, ...p); mkdirSync(dirname(x), { recursive: true }); return x }
function sh(c, a) { return spawnSync(c, a, { encoding: 'utf8', maxBuffer: 8e7, env: { ...process.env, DSH_HOME, PATH: process.env.PATH }, cwd: ROOT }) }
function rpc(m, p = {}) { const r = sh(RPC, ['3084', m, JSON.stringify(p)]); try { return JSON.parse(r.stdout || '{}') } catch { return {} } }
function val(d) { return d?.result?.value ?? d?.value }
async function httpBot(method, args = {}) {
  const res = await fetch(`http://127.0.0.1:3084/dsh-bot/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ args }) })
  return res.json()
}
function marksGet(id) { return (sh('node', [CLI, 'marks', 'get', '--id', id]).stdout || '').trim() }
function assistantText(v) { return (v?.items ?? []).filter(i => i.role === 'assistant').map(i => i.text || '').join('\n') }

const w = (sh(WHO, ['3084']).stdout || '').trim()
if (!w.includes(DSH_HOME)) throw new Error(w)
log('who', w)

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-gpu', '--no-first-run'] })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
page.setDefaultTimeout(20000)

async function openWb() {
  await page.goto('http://127.0.0.1:3084/dsh-bot/ui', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.getByTestId('workbench-roster').waitFor()
  await delay(500)
}
async function shot(rel) {
  const p = evd(rel)
  await page.screenshot({ path: p, fullPage: true })
  log('shot', rel, statSync(p).size)
}
async function newSid() {
  const before = await page.getByTestId('session-select').inputValue()
  await page.getByTestId('session-new').click()
  for (let i = 0; i < 20; i++) {
    const v = await page.getByTestId('session-select').inputValue()
    if (v && v !== before) return v
    await delay(250)
  }
  return await page.getByTestId('session-select').inputValue()
}
async function waitAsst(sid, needle) {
  for (let i = 0; i < 40; i++) {
    const h = await httpBot('history', { sessionId: sid })
    const t = assistantText(h?.value)
    if (t.includes(needle)) return { h, t }
    log('wait', needle, sid.slice(0, 13), i)
    await delay(2000)
  }
  const h = await httpBot('history', { sessionId: sid })
  return { h, t: assistantText(h?.value) }
}

await openWb()
const bots = await httpBot('listBots')
if (!(bots?.value?.bots ?? []).some(b => b.id === 'shiren-xiaobei')) {
  await page.getByTestId('roster-new').click()
  await page.getByTestId('bot-form-name').fill('诗人小北')
  await page.getByTestId('bot-form-persona').fill(PERSONA)
  await page.getByTestId('bot-form-submit').click()
  await page.getByTestId('roster-row-shiren-xiaobei').waitFor({ timeout: 20000 })
  log('created poet')
}

await page.getByTestId('roster-row-dsh-bot').click()
await delay(300)
const sidA = await newSid()
log('sidA', sidA)
await page.getByTestId('composer-input').fill('你是谁? 请先说我是 DSH Bot。标记 t18fix-A2')
await page.getByTestId('composer-send').click()
const A = await waitAsst(sidA, 'DSH Bot')

await page.getByTestId('roster-row-shiren-xiaobei').click()
await delay(400)
const sidB = await newSid()
log('sidB', sidB)
await page.getByTestId('composer-input').fill('你是谁? 标记 t18fix-B2')
await page.getByTestId('composer-send').click()
await delay(400)
await shot('UF-203/working-b.png')
const B = await waitAsst(sidB, '诗人小北')

await page.getByTestId('roster-row-dsh-bot').click()
await delay(300)
if (sidA) await page.getByTestId('session-select').selectOption(sidA).catch(() => {})
await delay(400)
await page.getByTestId('composer-input').fill('草稿给DSH Bot不发送')
await delay(200)
await page.getByTestId('roster-row-shiren-xiaobei').click()
await delay(400)
const composerB = await page.getByTestId('composer-input').inputValue()
await page.getByTestId('roster-row-dsh-bot').click()
await delay(400)
const composerA = await page.getByTestId('composer-input').inputValue()
await shot('UF-203/isolation.png')

mkdirSync(evd('UF-203/exports'), { recursive: true })
const expA = await httpBot('history', { sessionId: sidA })
const expB = await httpBot('history', { sessionId: sidB })
writeFileSync(evd('UF-203/exports/sidA.json'), JSON.stringify(expA, null, 2))
writeFileSync(evd('UF-203/exports/sidB.json'), JSON.stringify(expB, null, 2))
writeFileSync(evd('UF-203/exports/session-ids.json'), JSON.stringify({ sidA, sidB }, null, 2))
writeFileSync(evd('UF-203/exports/compare.md'), `# UF-203 export

| bot | sid | DSH Bot | 诗人小北 |
|---|---|---|---|
| A | ${sidA} | ${(A.t || '').includes('DSH Bot')} | ${(A.t || '').includes('诗人小北')} |
| B | ${sidB} | ${(B.t || '').includes('DSH Bot')} | ${(B.t || '').includes('诗人小北')} |

A: ${JSON.stringify((A.t || '').slice(0, 220))}
B: ${JSON.stringify((B.t || '').slice(0, 220))}
draftA=${JSON.stringify(composerA)} draftB=${JSON.stringify(composerB)}
`)
const ok203 = (expA?.value?.items ?? []).some(i => i.role === 'assistant' && (i.text || '').includes('DSH Bot'))
  && (B.t || '').includes('诗人小北')
  && composerA.includes('草稿给DSH Bot不发送')
  && composerB.trim() === ''
log(ok203 ? 'PASS' : 'FAIL', 'UF-203', sidA, sidB, 'draft', composerA)

const beforeP = (val(rpc('agentPreset.list', {}))?.presets ?? []).map(p => p.id)
const keep = marksGet(sidB)
await page.getByTestId('roster-menu-shiren-xiaobei').click()
await page.getByTestId('roster-delete-shiren-xiaobei').click()
await page.getByTestId('roster-delete-ok').click()
await delay(800)
const gone = await page.getByTestId('roster-row-shiren-xiaobei').count()
await shot('UF-206/delete.png')
const afterP = (val(rpc('agentPreset.list', {}))?.presets ?? []).map(p => p.id)
const stillDir = existsSync(join(DSH_HOME, '.agent-presets', 'dsh-bot--shiren-xiaobei'))
const afterMarks = marksGet(sidB)

await page.goto('http://127.0.0.1:3084/', { waitUntil: 'domcontentloaded', timeout: 30000 })
await delay(1500)
const expand = page.getByText(/展开其余/)
if (await expand.count()) await expand.first().click().catch(() => {})
await delay(300)
const hit = page.getByText('t18fix-B2').first()
if (await hit.count()) await hit.click()
else {
  const alt = page.getByText(/询问你是谁|诗人小北/).first()
  if (await alt.count()) await alt.click()
}
await delay(800)
const rail = await page.locator('body').innerText()
await shot('UF-206/official-rail.png')
const railHas = /t18fix-B2|诗人小北|询问你是谁/.test(rail)
writeFileSync(evd('UF-206/preset-list-diff.txt'), `BEFORE
${beforeP.filter(id => String(id).startsWith('dsh-bot')).join('\n')}

AFTER
${afterP.filter(id => String(id).startsWith('dsh-bot')).join('\n')}

preset dir exists after delete: ${stillDir}
roster-row-shiren-xiaobei: ${gone}
marks before: ${keep}
marks after: ${afterMarks}
official GUI still lists deleted-bot history: ${railHas}
see official-rail.png
`)
const ok206 = gone === 0 && !stillDir && afterMarks.includes('kind:dsh-bot') && railHas
log(ok206 ? 'PASS' : 'FAIL', 'UF-206', { gone, stillDir, railHas })

await browser.close()
writeFileSync(evd('phase-4/task18-iso-rail.md'), `UF-203 ${ok203}\nUF-206 ${ok206}\nsidA=${sidA}\nsidB=${sidB}\n`)
if (!ok203 || !ok206) process.exit(1)
