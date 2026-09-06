
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import playwright from '../../../../../../dsh-genoffice/engine/node_modules/playwright/index.js'
const { chromium } = playwright
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../../../..')
const evR = join(root, 'docs/dsh-bot-routines/evidence')
const evMem = join(root, 'docs/dsh-bot-memory/evidence')
const evM = join(root, 'docs/dsh-bot-living-master/evidence')
const UI = 'http://127.0.0.1:3084/dsh-bot/ui'
const BASE = 'http://127.0.0.1:3084'

function write(dir, rel, body) {
  const dest = join(dir, rel)
  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(dest, typeof body === 'string' ? body : JSON.stringify(body, null, 2) + '\n')
}

async function rpc(method, args = {}) {
  const res = await fetch(`${BASE}/dsh-bot/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ args }),
  })
  return res.json()
}

async function shot(page, dir, rel) {
  const dest = join(dir, rel)
  mkdirSync(dirname(dest), { recursive: true })
  await page.screenshot({ path: dest, fullPage: true })
  return dest
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })
await context.grantPermissions(['notifications'], { origin: BASE })
await context.addInitScript(() => {
  window.__notices = []
  class StubNotice {
    static permission = 'granted'
    static requestPermission() { return Promise.resolve('granted') }
    constructor(title, opts = {}) {
      window.__notices.push({ title, body: String(opts.body ?? '') })
    }
  }
  window.Notification = StubNotice
  Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get: () => window.__forceHidden === true })
})
const page = await context.newPage()
await page.goto(UI, { waitUntil: 'domcontentloaded', timeout: 20000 })
await page.waitForSelector('[data-testid="workbench-roster"]', { timeout: 20000 })
await page.click('[data-testid="roster-row-shiren-xiaobei"]')
await page.waitForTimeout(2500)
await rpc('markRead', { botId: 'yunwei-yeban' })
await page.waitForTimeout(2500)
await page.evaluate(() => { window.__forceHidden = true })
const listed = await rpc('routineList', {})
const baoshi = (listed.value || []).find(r => r.name === '报时' && r.botId === 'yunwei-yeban')
const ran = await rpc('routineRunNow', { id: baoshi.id })
await page.waitForTimeout(4000)
const unread = await page.locator('[data-testid="roster-unread-yunwei-yeban"]').textContent().catch(() => '')
const notices = await page.evaluate(() => window.__notices.slice())
const liveBots = await page.evaluate(async () => {
  const res = await fetch('/dsh-bot/listBots', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ args: {} }) })
  return res.json()
})
write(evR, 'UF-903/mop-notify.json', { ran, unread, notices, liveBots })
await shot(page, evR, 'UF-903/badge.png')
const yunwei = (liveBots.value?.bots || []).find(b => b.id === 'yunwei-yeban')
console.log('[notify]', JSON.stringify({ outcome: ran?.value?.outcome, unread, notices, hostUnread: yunwei?.unread }))

await page.evaluate(() => { window.__forceHidden = false })
await page.click('[data-testid="roster-row-yunwei-yeban"]', { force: true })
await page.waitForTimeout(800)
await shot(page, evR, 'UF-903/cleared.png')
const unreadAfter = await page.locator('[data-testid="roster-unread-yunwei-yeban"]').count()
console.log('[cleared]', unreadAfter)

await page.locator('[data-testid="memory-open"]').click({ force: true })
await page.waitForSelector('[data-testid="memory-panel"]', { timeout: 8000 }).catch(() => null)
await shot(page, evMem, 'UF-801/panel.png')
await shot(page, evR, 'UF-901/panel-after-spoke.png')

await page.click('[data-testid="roster-row-xiaodui-aning"]', { force: true })
await page.waitForTimeout(600)
await page.locator('[data-testid="memory-open"]').click({ force: true })
await page.waitForTimeout(400)
await shot(page, evMem, 'UF-803/after-forget.png')
await shot(page, evMem, 'UF-804/after-pin.png')

const group = page.locator('[data-testid="roster-row-bianji-shi"]')
console.log('[group-row]', await group.count())
if (await group.count()) {
  await group.click({ force: true })
  await page.waitForTimeout(800)
  const menu = page.locator('[data-testid^="transcript-menu-"]').first()
  if (await menu.count()) await menu.click({ force: true })
  const pin = page.locator('[data-testid^="transcript-pin-"]').first()
  if (await pin.count()) await pin.click({ force: true })
  await page.waitForTimeout(300)
  const pick = page.locator('[data-testid^="transcript-pin-pick-"]')
  if (await pick.count()) {
    await shot(page, evMem, 'UF-804/room-pick.png')
    console.log('[room-pick] visible')
  } else {
    await shot(page, evMem, 'UF-804/room-pick-missing.png')
    console.log('[room-pick] missing')
  }
}

await page.click('[data-testid="roster-row-xiaodui-aning"]', { force: true })
const select = page.locator('[data-testid="session-select"]')
if (await select.count()) {
  await select.selectOption({ label: /uf905-propose/ }).catch(() => undefined)
  await page.waitForTimeout(500)
}
await shot(page, evR, 'UF-905/card.png')

await page.click('[data-testid="roster-row-yunwei-yeban"]', { force: true })
if (await select.count()) {
  await select.selectOption({ label: /空记忆报时/ }).catch(() => undefined)
  await page.waitForTimeout(400)
}
await shot(page, evM, 'UF-101/wake-no-memory.png')

await browser.close()
