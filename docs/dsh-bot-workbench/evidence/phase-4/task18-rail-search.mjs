#!/usr/bin/env node
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { appendFileSync, statSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'

const require = createRequire(import.meta.url)
const { chromium } = require('/tmp/pw-dsh-t18/node_modules/playwright')
const EVIDENCE = join(dirname(fileURLToPath(import.meta.url)), '..')

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-gpu', '--no-first-run'] })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
await page.goto('http://127.0.0.1:3084/', { waitUntil: 'domcontentloaded', timeout: 45000 })
await delay(2000)
await page.getByRole('button', { name: '搜索会话' }).click()
await delay(600)
const search = page.locator('input:visible').last()
await search.fill('t18fix-poet-hist')
await delay(1200)
await page.screenshot({ path: join(EVIDENCE, 'UF-206/official-rail-search.png'), fullPage: true })
const hit = page.getByText('t18fix-poet-hist')
console.log('hits', await hit.count())
if (await hit.count()) {
  await hit.last().click({ force: true })
  await delay(1500)
}
const body = await page.locator('body').innerText()
console.log('body has title', body.includes('t18fix-poet-hist'), 'poet', body.includes('诗人小北'))
const p = join(EVIDENCE, 'UF-206/official-rail.png')
await page.screenshot({ path: p, fullPage: true })
console.log('shot', statSync(p).size)
appendFileSync(join(EVIDENCE, 'UF-206/preset-list-diff.txt'), `\nofficial GUI search t18fix-poet-hist visible: ${body.includes('t18fix-poet-hist')}\npoet text visible: ${body.includes('诗人小北')}\n`)
await browser.close()
if (!body.includes('t18fix-poet-hist') && !body.includes('诗人小北')) process.exit(1)
