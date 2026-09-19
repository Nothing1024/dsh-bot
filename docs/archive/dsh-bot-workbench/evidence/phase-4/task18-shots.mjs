#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, readFileSync, statSync, copyFileSync } from 'node:fs'
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
const sidB = readFileSync('/tmp/poet-sid.txt', 'utf8').trim()
const sidA = 'session-98739248-3724-45dd-a8b2-d8dc46ddf917'

function log(...a) { console.log(`[${new Date().toISOString()}]`, ...a) }
function evd(...p) { const x = join(EVIDENCE, ...p); mkdirSync(dirname(x), { recursive: true }); return x }
function sh(c, a) { return spawnSync(c, a, { encoding: 'utf8', maxBuffer: 8e7, env: { ...process.env, DSH_HOME, PATH: process.env.PATH }, cwd: ROOT }) }
async function httpBot(method, args = {}) {
  const res = await fetch(`http://127.0.0.1:3084/dsh-bot/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ args }) })
  return res.json()
}
function marksGet(id) { return (sh('node', [CLI, 'marks', 'get', '--id', id]).stdout || '').trim() }

log('who', sh(WHO, ['3084']).stdout.trim())
log('sidA', sidA, 'sidB', sidB)

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-gpu', '--no-first-run'] })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
async function shot(rel) {
  const p = evd(rel)
  await page.screenshot({ path: p, fullPage: true })
  log('shot', rel, statSync(p).size)
}

await page.goto('http://127.0.0.1:3084/dsh-bot/ui', { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.getByTestId('workbench-roster').waitFor()
await delay(800)
await page.getByTestId('roster-row-dsh-bot').click()
await delay(400)
await page.getByTestId('session-select').selectOption(sidA).catch(() => {})
await delay(600)
await page.getByTestId('composer-input').fill('草稿给DSH Bot不发送')
await delay(300)
await page.getByTestId('roster-row-shiren-xiaobei').click()
await delay(500)
await page.getByTestId('session-select').selectOption(sidB).catch(() => {})
await delay(800)
const composerB = await page.getByTestId('composer-input').inputValue()
const headerB = await page.getByTestId('conversation-name').innerText()
await shot('UF-203/poet-transcript.png')
await page.getByTestId('roster-row-dsh-bot').click()
await delay(500)
await page.getByTestId('session-select').selectOption(sidA).catch(() => {})
await delay(500)
const composerA = await page.getByTestId('composer-input').inputValue()
await shot('UF-203/isolation.png')

mkdirSync(evd('UF-203/exports'), { recursive: true })
const expA = await httpBot('history', { sessionId: sidA })
const expB = await httpBot('history', { sessionId: sidB })
writeFileSync(evd('UF-203/exports/sidA.json'), JSON.stringify(expA, null, 2))
writeFileSync(evd('UF-203/exports/sidB.json'), JSON.stringify(expB, null, 2))
writeFileSync(evd('UF-203/exports/session-ids.json'), JSON.stringify({ sidA, sidB }, null, 2))
const textA = (expA?.value?.items ?? []).filter(i => i.role === 'assistant').map(i => i.text || '').join('\n')
const textB = (expB?.value?.items ?? []).filter(i => i.role === 'assistant').map(i => i.text || '').join('\n')
writeFileSync(evd('UF-203/exports/compare.md'), `# UF-203 export

| bot | sid | DSH Bot | 诗人小北 |
|---|---|---|---|
| A DSH Bot | \`${sidA}\` | ${textA.includes('DSH Bot')} | ${textA.includes('诗人小北')} |
| B 诗人小北 | \`${sidB}\` | ${textB.includes('DSH Bot')} | ${textB.includes('诗人小北')} |

A: ${JSON.stringify(textA.slice(0, 240))}
B: ${JSON.stringify(textB.slice(0, 240))}
draftA=${JSON.stringify(composerA)} composerB=${JSON.stringify(composerB)} headerB=${headerB}
`)
log('UF-203', { headerB, composerA, composerB, aDsh: textA.includes('DSH Bot'), bPoet: textB.includes('诗人小北') })

const keep = marksGet(sidB)
await page.getByTestId('roster-menu-shiren-xiaobei').click()
await page.getByTestId('roster-delete-shiren-xiaobei').click()
await page.getByTestId('roster-delete-ok').click()
await delay(800)
const gone = await page.getByTestId('roster-row-shiren-xiaobei').count()
await shot('UF-206/delete.png')
const stillDir = existsSync(join(DSH_HOME, '.agent-presets', 'dsh-bot--shiren-xiaobei'))
const afterMarks = marksGet(sidB)

await page.goto('http://127.0.0.1:3084/', { waitUntil: 'domcontentloaded', timeout: 30000 })
await delay(1500)
const expand = page.getByText(/展开其余/)
if (await expand.count()) await expand.first().click().catch(() => {})
await delay(400)
const titled = page.getByText('t18fix-poet-hist').first()
if (await titled.count()) await titled.click()
else {
  const t2 = page.getByText('t18fix-B3').first()
  if (await t2.count()) await t2.click()
}
await delay(1000)
const rail = await page.locator('body').innerText()
await shot('UF-206/official-rail.png')
const railHas = /t18fix-poet-hist|t18fix-B3|诗人小北/.test(rail)
writeFileSync(evd('UF-206/preset-list-diff.txt'), `preset dir exists after delete: ${stillDir}
roster-row-shiren-xiaobei: ${gone}
session ${sidB} marks after delete (should remain):
${afterMarks}
official GUI still shows poet session t18fix-poet-hist: ${railHas}
see official-rail.png
`)
log('UF-206', { gone, stillDir, railHas, afterMarks })

await browser.close()
if (!(textA.includes('DSH Bot') && textB.includes('诗人小北') && composerA.includes('草稿') && gone === 0 && !stillDir && railHas)) process.exit(1)
