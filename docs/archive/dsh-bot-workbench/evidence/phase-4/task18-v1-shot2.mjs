#!/usr/bin/env node
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { statSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'

const require = createRequire(import.meta.url)
const { chromium } = require('/tmp/pw-dsh-t18/node_modules/playwright')
const EVIDENCE = join(dirname(fileURLToPath(import.meta.url)), '..')

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-gpu', '--no-first-run'] })
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
await page.goto('http://127.0.0.1:3084/', { waitUntil: 'domcontentloaded', timeout: 45000 })
await delay(2000)
await page.getByRole('button', { name: '搜索会话' }).click()
await delay(400)
const q = page.locator('input:visible').last()
for (const term of ['UF-003 jump t19', 'gui-reconcile-ok', 'dsh-bot-manual']) {
  await q.fill('')
  await q.fill(term)
  await delay(900)
  const n = await page.getByText(term).count()
  console.log('term', term, 'n', n)
  if (n > 0) {
    await page.getByText(term).first().click({ force: true })
    await delay(1800)
    const body = await page.locator('body').innerText()
    console.log('hero', body.includes('探索未至之境'), 'DSH Bot', body.includes('DSH Bot'), 't18', body.includes('t18fix'))
    if (!body.includes('探索未至之境') && body.includes('DSH Bot')) break
  }
}
const body = await page.locator('body').innerText()
const p = join(EVIDENCE, 'phase-4/v1-gui-chat.png')
await page.screenshot({ path: p, fullPage: true })
console.log('shot', statSync(p).size, 'hero', body.includes('探索未至之境'))
await browser.close()
if (body.includes('探索未至之境')) process.exit(1)
