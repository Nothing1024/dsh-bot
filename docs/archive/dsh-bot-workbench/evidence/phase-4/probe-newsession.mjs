#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'

const require = createRequire(import.meta.url)
const { chromium } = require('/tmp/pw-dsh-t18/node_modules/playwright')
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..')
const DSH_HOME = join(ROOT, 'env')
const RPC = `${homedir()}/.agents/skills/dsh-plugin-debug/scripts/dsh-rpc.sh`
const OUT = dirname(fileURLToPath(import.meta.url))

function rpc(method, payload = {}) {
  const r = spawnSync(RPC, ['3084', method, JSON.stringify(payload)], {
    encoding: 'utf8', env: { ...process.env, DSH_HOME, PATH: process.env.PATH }, cwd: ROOT,
  })
  return JSON.parse(r.stdout || '{}')
}
function ids() {
  const d = rpc('session.list', { limit: 20 })
  const items = d?.result?.value?.items ?? d?.value?.items ?? []
  return items.slice(0, 8).map(i => ({ id: i.sessionId, blank: i.blank, running: i.running, u: i.updatedAt }))
}

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-gpu', '--no-first-run'] })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
await page.goto('http://127.0.0.1:3084/', { waitUntil: 'domcontentloaded', timeout: 45000 })
await delay(2500)
const before = ids()
await page.screenshot({ path: join(OUT, 'probe-ns-0.png'), fullPage: true })
const snap = async (label) => ({
  label,
  title: await page.title(),
  hero: await page.locator('body').innerText().then(t => t.slice(0, 400)),
  ids: ids(),
})
const steps = [await snap('load')]

const btn = page.locator('button[aria-label="新建会话"]').filter({ hasText: '新会话' })
console.log('btn', await btn.count())
await btn.first().click()
await delay(2000)
steps.push(await snap('after-click'))
await page.screenshot({ path: join(OUT, 'probe-ns-1.png'), fullPage: true })

const wsNew = page.getByRole('button', { name: /在“plugin”中新建会话/ })
console.log('wsNew vis', await wsNew.count())
if (await wsNew.count()) {
  await wsNew.first().click({ force: true })
  await delay(2000)
  steps.push(await snap('after-ws-new'))
  await page.screenshot({ path: join(OUT, 'probe-ns-2.png'), fullPage: true })
}

writeFileSync(join(OUT, 'probe-ns.json'), JSON.stringify({ before, steps }, null, 2))
console.log(JSON.stringify({ before: before.map(x => x.id.slice(0, 13)), steps: steps.map(s => ({ label: s.label, title: s.title, n: s.ids.length, first: s.ids[0], hero: s.hero.slice(0, 120) })) }, null, 2))
await browser.close()
