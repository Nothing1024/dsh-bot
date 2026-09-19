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

function list() {
  const r = spawnSync(RPC, ['3084', 'session.list', JSON.stringify({ limit: 8 })], {
    encoding: 'utf8', env: { ...process.env, DSH_HOME, PATH: process.env.PATH }, cwd: ROOT,
  })
  const d = JSON.parse(r.stdout || '{}')
  const items = d?.result?.value?.items ?? []
  return items.slice(0, 6).map(i => ({ id: i.sessionId.slice(0, 13), blank: i.blank, running: i.running, u: i.updatedAt, preset: i.agentPreset }))
}

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-gpu', '--no-first-run'] })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
await page.goto('http://127.0.0.1:3084/', { waitUntil: 'domcontentloaded', timeout: 45000 })
await delay(2000)
const before = list()
await page.screenshot({ path: join(OUT, 'probe-send-0.png') })

const leftover = page.getByText('v1 leftover t18').first()
if (await leftover.count()) {
  await leftover.click()
  await delay(1000)
}
await page.screenshot({ path: join(OUT, 'probe-send-1.png') })

await page.locator('button[aria-label="新建会话"]').filter({ hasText: '新会话' }).first().click()
await delay(1500)
await page.screenshot({ path: join(OUT, 'probe-send-2.png') })

const editors = await page.evaluate(() => [...document.querySelectorAll('textarea')].map(t => ({
  ph: t.placeholder, vis: !!(t.offsetWidth && t.offsetHeight), disabled: t.disabled, val: t.value.slice(0, 40),
})))
console.log('editors', editors)

const ta = page.locator('textarea:visible').last()
await ta.click()
await ta.fill('GUI直建 probe t18fix-GUI3')
await delay(300)
await page.screenshot({ path: join(OUT, 'probe-send-3.png') })
await ta.press('Enter')
await delay(3000)
await page.screenshot({ path: join(OUT, 'probe-send-4.png') })
const after = list()
const body = (await page.locator('body').innerText()).slice(0, 500)
writeFileSync(join(OUT, 'probe-send.json'), JSON.stringify({ before, after, editors, body }, null, 2))
console.log(JSON.stringify({ before, after, body: body.slice(0, 200) }, null, 2))
await browser.close()
