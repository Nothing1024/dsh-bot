import { existsSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import playwright from '../../../../../../dsh-genoffice/engine/node_modules/playwright/index.js'

const { chromium } = playwright
const here = dirname(fileURLToPath(import.meta.url))
const dest = join(here, '../UF-103/v2-aning.png')
const UI = 'http://127.0.0.1:3084/dsh-bot/ui'
const sessionId = 'session-f7550de9-aaff-427c-b88c-73dfebd1d478'

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage()
await page.goto(UI, { waitUntil: 'domcontentloaded', timeout: 20000 })
await page.waitForSelector('[data-testid="roster-row-dsh-bot"]', { timeout: 20000 })
if (await page.locator('[data-testid="memory-close"]').count()) {
  await page.click('[data-testid="memory-close"]')
  await page.waitForTimeout(300)
}
await page.click('[data-testid="roster-row-xiaodui-aning"]')
await page.waitForSelector('[data-testid="conversation-pane"]', { timeout: 15000 })
await page.click('[data-testid="session-select"]')
await page.locator(`[data-testid="session-option-${sessionId}"]`).waitFor({ timeout: 12000 })
await page.click(`[data-testid="session-option-${sessionId}"]`)
await page.waitForFunction(
  id => document.querySelector('[data-testid="session-select"]')?.getAttribute('data-session-id') === id,
  sessionId,
  { timeout: 15000 },
)
await page.waitForFunction(() => (document.querySelector('[data-testid="conversation-pane"]')?.textContent || '').includes('你是谁'), { timeout: 20000 })
await page.screenshot({ path: dest, fullPage: true })
const selected = await page.evaluate(() => document.querySelector('[data-testid="session-select"]')?.getAttribute('data-session-id') || '')
const text = await page.evaluate(() => document.querySelector('[data-testid="conversation-pane"]')?.textContent || '')
await browser.close()
const payload = {
  selected,
  exists: existsSync(dest),
  textOk: text.includes('你是谁') && text.includes('校对阿宁'),
  snippet: text.replace(/\s+/g, ' ').slice(0, 240),
}
writeFileSync(join(here, 'shot-v2-aning.json'), `${JSON.stringify(payload, null, 2)}\n`)
console.log(JSON.stringify(payload))
if (!payload.textOk) process.exit(2)
