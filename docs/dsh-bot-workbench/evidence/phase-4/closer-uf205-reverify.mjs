#!/usr/bin/env node
/**
 * Closer re-verify UF-205: unlabeled session.create → GET /dsh-bot/ui
 * (page hook POSTs reconcile). Never POST /dsh-bot/reconcile from here.
 * Also probe official GUI 新会话 for a new unlabeled session id.
 */
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeFileSync, readFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'

const require = createRequire(import.meta.url)
const { chromium } = require('/tmp/pw-dsh-t18/node_modules/playwright')
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..')
const DSH_HOME = join(ROOT, 'env')
const EVIDENCE = join(ROOT, 'docs/dsh-bot-workbench/evidence')
const WHO = `${homedir()}/.agents/skills/dsh-plugin-debug/scripts/dsh-rpc-who.sh`
const RPC = `${homedir()}/.agents/skills/dsh-plugin-debug/scripts/dsh-rpc.sh`
const CLI = join(ROOT, '../../session-tool/plugin/packages/session-tool-cli/lib/bin.js')

function sh(c, a) {
  return spawnSync(c, a, {
    encoding: 'utf8', maxBuffer: 8e7,
    env: { ...process.env, DSH_HOME, PATH: process.env.PATH }, cwd: ROOT,
  })
}
function who() { return (sh(WHO, ['3084']).stdout || '').trim() }
function rpc(m, p = {}) {
  const r = sh(RPC, ['3084', m, JSON.stringify(p)])
  try { return JSON.parse(r.stdout || '{}') } catch { return {} }
}
function val(d) { return d?.result?.value ?? d?.value }
function marksGet(id) {
  const r = sh('node', [CLI, 'marks', 'get', '--id', id])
  return ((r.stdout || '') + (r.stderr || '')).trim()
}
function sessionIds() {
  return (val(rpc('session.list', { limit: 200 }))?.items ?? []).map(i => i.sessionId)
}

const w = who()
if (!w.includes(DSH_HOME)) throw new Error(w)
const sid = readFileSync('/tmp/uf205-sid.txt', 'utf8').trim()
const beforeMarks = marksGet(sid)
console.log(JSON.stringify({ who: w, sid, beforeMarks }, null, 2))

const browser = await chromium.launch({
  channel: 'chrome', headless: true,
  args: ['--disable-gpu', '--no-first-run', '--disable-dev-shm-usage'],
})
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
page.setDefaultTimeout(20000)

await page.goto('http://127.0.0.1:3084/dsh-bot/ui', { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.getByTestId('workbench-roster').waitFor({ timeout: 20000 })
let afterMarks = beforeMarks
for (let i = 0; i < 20; i++) {
  afterMarks = marksGet(sid)
  console.log('wb', i, afterMarks.slice(0, 120))
  if (afterMarks.includes('bot:dsh-bot')) break
  await delay(400)
}
await page.screenshot({ path: join(EVIDENCE, 'phase-4/closer-uf205-reverify.png'), fullPage: true })

const gui = await ctx.newPage()
const idsBefore = new Set(sessionIds())
await gui.goto('http://127.0.0.1:3084/', { waitUntil: 'domcontentloaded', timeout: 45000 })
await delay(2000)
const hero0 = (await gui.locator('body').innerText()).slice(0, 240)
const title0 = await gui.title()
await gui.locator('button[aria-label="新建会话"]').filter({ hasText: '新会话' }).first().click()
await delay(1500)
const wsNew = gui.getByRole('button', { name: /在“plugin”中新建会话/ })
const wsCount = await wsNew.count()
if (wsCount) {
  await wsNew.first().click({ force: true })
  await delay(1500)
}
const hero1 = (await gui.locator('body').innerText()).slice(0, 240)
const title1 = await gui.title()
const added = sessionIds().filter(id => !idsBefore.has(id))
await gui.screenshot({ path: join(EVIDENCE, 'phase-4/closer-gui-new.png'), fullPage: true })

const addedInfo = added.map(id => {
  const row = (val(rpc('session.list', { limit: 200 }))?.items ?? []).find(i => i.sessionId === id)
  return { id, preset: row?.agentPreset, blank: row?.blank, marks: marksGet(id).slice(0, 160) }
})

await browser.close()

const labeled = afterMarks.includes('bot:dsh-bot')
const out = {
  who: w,
  unlabeledToLabeled: {
    sid,
    beforeMarks,
    afterMarks,
    unlabeledBefore: !beforeMarks.includes('bot:dsh-bot'),
    labeledAfter: labeled,
    postedReconcileFromScript: false,
  },
  guiNewSessionProbe: {
    title0, title1, hero0, hero1, wsCount, added, addedInfo,
    reuse: added.length === 0,
  },
}
writeFileSync(join(EVIDENCE, 'phase-4/closer-uf205-reverify.json'), JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 2))
if (!(out.unlabeledToLabeled.unlabeledBefore && labeled)) process.exit(1)
