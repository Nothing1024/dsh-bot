#!/usr/bin/env node
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { statSync } from 'node:fs'

const require = createRequire(import.meta.url)
const { chromium } = require('/tmp/pw-dsh-t18/node_modules/playwright')
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..')
const EVIDENCE = join(ROOT, 'docs/dsh-bot-workbench/evidence')

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-gpu', '--no-first-run'] })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
await page.goto('http://127.0.0.1:3084/', { waitUntil: 'domcontentloaded', timeout: 45000 })
await delay(2000)
for (let i = 0; i < 5; i++) {
  const exp = page.getByText(/展开其余/)
  if (await exp.count()) await exp.first().click().catch(() => {})
  await delay(400)
}
const loc = page.getByText('t18fix-poet-hist')
console.log('title count', await loc.count())
if (await loc.count()) {
  await loc.first().click({ force: true })
  await delay(1500)
} else {
  await page.evaluate(() => {
    const n = [...document.querySelectorAll('button,div,span,a')].find(e => (e.textContent || '').includes('t18fix-poet-hist'))
    n?.click()
  })
  await delay(1500)
}
const body = await page.locator('body').innerText()
console.log('has title', body.includes('t18fix-poet-hist'), 'has poet', body.includes('诗人小北'))
const p = join(EVIDENCE, 'UF-206/official-rail.png')
await page.screenshot({ path: p, fullPage: true })
console.log('shot', statSync(p).size)
await browser.close()
if (!body.includes('t18fix-poet-hist') && !body.includes('诗人小北')) process.exit(1)
