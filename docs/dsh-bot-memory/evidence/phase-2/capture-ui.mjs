import { chmodSync, copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import playwright from '../../../../../../dsh-genoffice/engine/node_modules/playwright/index.js'
const { chromium } = playwright


const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../../../..')
const ev = join(root, 'docs/dsh-bot-memory/evidence')
const memDir = join(root, 'env/dsh-bot/memory')
const logFile = join(memDir, 'xiaodui-aning/log.jsonl')

const UI = 'http://127.0.0.1:3084/dsh-bot/ui'

async function shot(page, rel, extra = {}) {
  const dest = join(ev, rel)
  mkdirSync(dirname(dest), { recursive: true })
  await page.screenshot({ path: dest, ...extra })
  console.log('wrote', dest)
}

async function openAning(page) {
  await page.goto(UI, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="roster-row-xiaodui-aning"]', { timeout: 15000 })
  await page.click('[data-testid="roster-row-xiaodui-aning"]')
  await page.waitForSelector('[data-testid="memory-open"]', { timeout: 15000 })
}

async function openPanel(page) {
  await page.click('[data-testid="memory-open"]')
  await page.waitForSelector('[data-testid="memory-panel"]', { timeout: 10000 })
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

try {
  await openAning(page)
  await openPanel(page)
  await page.waitForSelector('[data-testid="memory-profile"]')
  await shot(page, 'UF-801/panel.png')

  const forgetName = page.locator('[data-testid="memory-forget-p-uf801-name"]')
  await forgetName.click()
  await page.waitForTimeout(800)
  await shot(page, 'UF-803/after-forget.png')
  mkdirSync(join(ev, 'UF-803'), { recursive: true })
  copyFileSync(logFile, join(ev, 'UF-803/log.jsonl'))
  console.log('copied log.jsonl')

  await page.route('**/dsh-bot/memoryForget', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, error: { message: 'forced' } }),
    })
  })
  const forgetTerm = page.locator('[data-testid="memory-forget-p-uf801-term"]')
  await forgetTerm.click()
  await page.waitForSelector('[data-testid="memory-toast"]')
  await shot(page, 'UF-803/forget-fail.png')
  await page.unroute('**/dsh-bot/memoryForget')

  chmodSync(memDir, 0o000)
  try {
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForSelector('[data-testid="roster-row-xiaodui-aning"]', { timeout: 15000 })
    await page.click('[data-testid="roster-row-xiaodui-aning"]')
    await page.waitForSelector('[data-testid="memory-open"]', { timeout: 15000 })
    await openPanel(page)
    await page.waitForSelector('[data-testid="memory-unavailable"]', { timeout: 10000 })
    await shot(page, 'UF-801/unwritable.png')
  } finally {
    chmodSync(memDir, 0o755)
  }

  // pin / room-pick: best-effort if assistant or group messages exist
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="roster-row-xiaodui-aning"]', { timeout: 15000 })
  const group = page.locator('[data-testid="roster-row-bianji-shi"]')
  if (await group.count()) {
    await group.click()
    await page.waitForTimeout(1200)
    const pin = page.locator('[data-testid^="transcript-pin-"]').first()
    if (await pin.count()) {
      const menu = page.locator('[data-testid^="transcript-menu-"]').first()
      if (await menu.count()) await menu.click()
      await pin.click()
      const pick = page.locator('[data-testid^="transcript-pin-pick-"]')
      if (await pick.count()) {
        await shot(page, 'UF-804/room-pick.png')
      }
    }
  }
} catch (error) {
  try { chmodSync(memDir, 0o755) } catch { /* restore */ }
  await shot(page, 'phase-2/capture-fail.png')
  throw error
} finally {
  await browser.close()
}
