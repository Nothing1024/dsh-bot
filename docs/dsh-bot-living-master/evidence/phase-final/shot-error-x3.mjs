import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import playwright from '../../../../../../dsh-genoffice/engine/node_modules/playwright/index.js'

const { chromium } = playwright
const here = dirname(fileURLToPath(import.meta.url))
const evR = join(here, '../../../dsh-bot-routines/evidence')
const UI = 'http://127.0.0.1:3084/dsh-bot/ui'
const sessionId = 'session-3a91d0f7-859b-4137-aaaa-20cdc830767d'
const botId = 'yunwei-yeban'

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage()
await page.goto(UI, { waitUntil: 'domcontentloaded', timeout: 20000 })
await page.waitForSelector('[data-testid="roster-row-dsh-bot"]', { timeout: 20000 })
await page.click(`[data-testid="roster-row-${botId}"]`)
await page.waitForSelector('[data-testid="conversation-pane"]', { timeout: 15000 })
await page.click('[data-testid="session-select"]')
const opt = page.locator(`[data-testid="session-option-${sessionId}"]`)
await opt.waitFor({ timeout: 15000 })
await opt.click()
await page.waitForTimeout(800)
const dest = join(evR, 'UF-901/error-x3.png')
await page.screenshot({ path: dest, fullPage: true })
console.log(`shot-error-x3 done exists=${existsSync(dest)}`)
await browser.close()
