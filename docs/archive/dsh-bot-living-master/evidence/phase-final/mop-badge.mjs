
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import playwright from '../../../../../../dsh-genoffice/engine/node_modules/playwright/index.js'
const { chromium } = playwright
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../../../..')
const evR = join(root, 'docs/dsh-bot-routines/evidence')
const evMem = join(root, 'docs/dsh-bot-memory/evidence')
const UI = 'http://127.0.0.1:3084/dsh-bot/ui'
const BASE = 'http://127.0.0.1:3084'

async function rpc(method, args = {}) {
  const res = await fetch(`${BASE}/dsh-bot/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ args }),
  })
  return res.json()
}

const listed = await rpc('listBots')
const unread = (listed.value?.bots || []).find(b => b.id === 'yunwei-yeban')?.unread
console.log('[host-unread]', unread)

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })
await context.grantPermissions(['notifications'], { origin: BASE })
await context.addInitScript(() => {
  window.__notices = []
  class StubNotice {
    static permission = 'granted'
    static requestPermission() { return Promise.resolve('granted') }
    constructor(title, opts = {}) {
      window.__notices.push({ title, body: String(opts.body ?? ''), hidden: document.hidden })
    }
  }
  window.Notification = StubNotice
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
})
const page = await context.newPage()
await page.goto(UI, { waitUntil: 'domcontentloaded', timeout: 20000 })
await page.waitForSelector('[data-testid="workbench-roster"]', { timeout: 20000 })
await page.click('[data-testid="roster-row-shiren-xiaobei"]', { force: true })
await page.waitForTimeout(800)
const selected = await page.locator('[data-testid="roster-row-shiren-xiaobei"]').getAttribute('class')
const badgeCount = await page.locator('[data-testid="roster-unread-yunwei-yeban"]').count()
const badgeText = badgeCount ? await page.locator('[data-testid="roster-unread-yunwei-yeban"]').textContent() : ''
const notices = await page.evaluate(() => window.__notices.slice())
mkdirSync(join(evR, 'UF-903'), { recursive: true })
await page.screenshot({ path: join(evR, 'UF-903/badge.png'), fullPage: true })
console.log(JSON.stringify({ selected, badgeCount, badgeText, notices, unread }))

await page.click('[data-testid="roster-row-yunwei-yeban"]', { force: true })
await page.waitForTimeout(600)
const after = await page.locator('[data-testid="roster-unread-yunwei-yeban"]').count()
const afterHost = await rpc('listBots')
const afterUnread = (afterHost.value?.bots || []).find(b => b.id === 'yunwei-yeban')?.unread
await page.screenshot({ path: join(evR, 'UF-903/cleared.png'), fullPage: true })
console.log('[cleared]', { after, afterUnread })

await page.locator('[data-testid="memory-open"]').click({ force: true })
await page.waitForTimeout(500)
mkdirSync(join(evMem, 'UF-801'), { recursive: true })
await page.screenshot({ path: join(evMem, 'UF-801/panel.png'), fullPage: true })
const panel = await page.locator('[data-testid="memory-panel"]').count()
console.log('[memory-panel]', panel)

await page.click('[data-testid="roster-row-bianji-shi"]', { force: true })
await page.waitForTimeout(1000)
const menu = page.locator('[data-testid^="transcript-menu-"]').first()
const menuCount = await menu.count()
if (menuCount) {
  await menu.click({ force: true })
  await page.waitForTimeout(200)
  const pin = page.locator('[data-testid^="transcript-pin-"]').first()
  if (await pin.count()) {
    await pin.click({ force: true })
    await page.waitForTimeout(300)
  }
}
const pick = await page.locator('[data-testid^="transcript-pin-pick-"]').count()
mkdirSync(join(evMem, 'UF-804'), { recursive: true })
await page.screenshot({ path: join(evMem, 'UF-804/room-pick.png'), fullPage: true })
console.log('[room-pick]', { menuCount, pick })

await page.click('[data-testid="roster-row-xiaodui-aning"]', { force: true })
await page.waitForTimeout(600)
const select = page.locator('[data-testid="session-select"]')
if (await select.count()) {
  const opts = await select.locator('option').allTextContents()
  console.log('[sessions]', opts)
  const hit = opts.find(t => /uf905|propose/i.test(t))
  if (hit) await select.selectOption({ label: hit }).catch(() => {})
}
mkdirSync(join(evR, 'UF-905'), { recursive: true })
await page.screenshot({ path: join(evR, 'UF-905/card.png'), fullPage: true })
const card = await page.locator('[data-testid^="propose-routine"], [data-testid="routine-propose-card"]').count()
console.log('[propose-card]', card)

await browser.close()
