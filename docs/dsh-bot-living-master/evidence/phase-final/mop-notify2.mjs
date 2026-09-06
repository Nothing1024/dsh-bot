
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import playwright from '../../../../../../dsh-genoffice/engine/node_modules/playwright/index.js'
const { chromium } = playwright
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../../../..')
const evR = join(root, 'docs/dsh-bot-routines/evidence')
const UI = 'http://127.0.0.1:3084/dsh-bot/ui'
const BASE = 'http://127.0.0.1:3084'

function write(rel, body) {
  const dest = join(evR, rel)
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
await page.click('[data-testid="roster-row-shiren-xiaobei"]')
await page.waitForTimeout(1500)
const hidden = await page.evaluate(() => document.hidden)
const perm = await page.evaluate(() => Notification.permission)
await rpc('markRead', { botId: 'yunwei-yeban' })
const before = await rpc('listBots')
const listed = await rpc('routineList', {})
const baoshi = (listed.value || []).find(r => r.name === '报时' && r.botId === 'yunwei-yeban')
const ran = await rpc('routineRunNow', { id: baoshi.id })
const after = await rpc('listBots')
const unreadNow = (after.value?.bots || []).find(b => b.id === 'yunwei-yeban')?.unread
await page.waitForTimeout(2500)
const unreadBadge = await page.locator('[data-testid="roster-unread-yunwei-yeban"]').textContent().catch(() => '')
const notices = await page.evaluate(() => window.__notices.slice())
const dest = join(evR, 'UF-903/badge.png')
mkdirSync(dirname(dest), { recursive: true })
await page.screenshot({ path: dest, fullPage: true })
write('UF-903/host-unread-immediate.json', {
  hidden, perm, ran, unreadNow,
  beforeUnread: (before.value?.bots || []).find(b => b.id === 'yunwei-yeban')?.unread,
  unreadBadge, notices,
})
console.log(JSON.stringify({ hidden, perm, outcome: ran?.value?.outcome, unreadNow, unreadBadge, notices }, null, 2))
await browser.close()
