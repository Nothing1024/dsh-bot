import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import playwright from '../../../../../../dsh-genoffice/engine/node_modules/playwright/index.js'
const { chromium } = playwright

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../../../..')
const ev = join(root, 'docs/dsh-bot-routines/evidence')
const UI = 'http://127.0.0.1:3084/dsh-bot/ui'

async function shot(page, rel) {
  const dest = join(ev, rel)
  mkdirSync(dirname(dest), { recursive: true })
  await page.screenshot({ path: dest })
  console.log('wrote', dest)
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
try {
  await page.goto(UI, { waitUntil: 'networkidle' })
  const ops = page.locator('[data-testid="roster-row-yunwei-yeban"]')
  const aning = page.locator('[data-testid="roster-row-xiaodui-aning"]')
  if (await ops.count()) await ops.click()
  else await aning.click()
  await page.waitForSelector('[data-testid="routines-open"]', { timeout: 15000 })
  const pills = await page.locator('.memorySwitch button').evaluateAll(nodes => nodes.map(n => n.getAttribute('data-testid')))
  writeFileSync(join(ev, 'phase-3/pills-order.json'), JSON.stringify({ pills }, null, 2))
  await page.click('[data-testid="routines-open"]')
  await page.waitForSelector('[data-testid="routines-panel"]', { timeout: 10000 })
  await shot(page, 'UF-901/empty-or-list.png')
  const empty = page.locator('[data-testid="routines-empty"]')
  if (await empty.count()) {
    writeFileSync(join(ev, 'UF-901/empty-copy.txt'), await empty.innerText())
  }
  await page.fill('[data-testid="routine-schedule"]', '@every 0m')
  await page.click('[data-testid="routine-create"]')
  await page.waitForTimeout(400)
  await shot(page, 'UF-901/invalid-schedule.png')
  const err = page.locator('[data-testid="routines-error"]')
  writeFileSync(join(ev, 'UF-901/invalid-schedule.txt'), (await err.count()) ? await err.innerText() : 'NO_INLINE_ERROR')
  await page.fill('[data-testid="routine-schedule"]', '@every 1m')
  await page.fill('[data-testid="routine-name"]', '报时')
  await page.fill('[data-testid="routine-instruction"]', '报告当前时间，一句话')
  await page.click('[data-testid="routine-create"]')
  await page.waitForTimeout(600)
  await shot(page, 'UF-901/panel-after-create.png')
} finally {
  await browser.close()
}
