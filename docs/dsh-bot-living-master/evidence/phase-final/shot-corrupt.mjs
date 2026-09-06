import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import playwright from '../../../../../../dsh-genoffice/engine/node_modules/playwright/index.js'

const { chromium } = playwright
const here = dirname(fileURLToPath(import.meta.url))
const evR = join(here, '../../../dsh-bot-routines/evidence')
const UI = 'http://127.0.0.1:3084/dsh-bot/ui'

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage()
await page.goto(UI, { waitUntil: 'domcontentloaded', timeout: 20000 })
await page.waitForSelector('[data-testid="roster-row-yunwei-yeban"]', { timeout: 20000 })
await page.click('[data-testid="roster-row-yunwei-yeban"]')
await page.waitForSelector('[data-testid="conversation-pane"]', { timeout: 15000 })
if (await page.locator('[data-testid="routines-open"]').count()) {
  await page.click('[data-testid="routines-open"]')
  await page.waitForTimeout(500)
}
const dest = join(evR, 'UF-904/corrupt-bak.png')
await page.screenshot({ path: dest, fullPage: true })
const empty = await page.locator('[data-testid="routines-empty"]').count()
console.log(`shot-corrupt done exists=${existsSync(dest)} empty=${empty}`)
await browser.close()
