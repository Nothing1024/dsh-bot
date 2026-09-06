/**
 * Fill mother 5.2 named screenshots. Wait until the selected session
 * and required transcript/panel text are actually on screen.
 */
import { existsSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import playwright from '../../../../../../dsh-genoffice/engine/node_modules/playwright/index.js'

const { chromium } = playwright
const here = dirname(fileURLToPath(import.meta.url))
const ev = join(here, '..')
const UI = 'http://127.0.0.1:3084/dsh-bot/ui'

const jobs = [
  {
    name: 'wake',
    dest: join(ev, 'UF-101/wake-with-name.png'),
    botId: 'yunwei-yeban',
    sessionId: 'session-84ca2e4b-f363-4f29-9623-3a61a66543c5',
    extra: 'none',
    must: ['Nothing'],
  },
  {
    name: 'pin',
    dest: join(ev, 'UF-102/pinned.png'),
    botId: 'xiaodui-aning',
    sessionId: 'session-baccbd2d-ae78-446c-ad29-abac2b4c36b1',
    extra: 'memory',
    must: ['你标记的'],
  },
  {
    name: 'v2aning',
    dest: join(ev, 'UF-103/v2-aning.png'),
    botId: 'xiaodui-aning',
    sessionId: 'session-f7550de9-aaff-427c-b88c-73dfebd1d478',
    extra: 'none',
    must: ['你是谁'],
  },
  {
    name: 'v2xiaobei',
    dest: join(ev, 'UF-103/v2-xiaobei.png'),
    botId: 'shiren-xiaobei',
    sessionId: 'session-ba6f2de1-2d1c-4e42-a8da-a7ed35f7b1f4',
    extra: 'none',
    must: ['铜镜'],
  },
  {
    name: 'group',
    dest: join(ev, 'UF-103/group-round.png'),
    botId: 'bianji-shi',
    sessionId: 'room-cf7bc2d4-568a-41ea-88be-25bf03c20b7f',
    extra: 'group',
    must: ['不肯熄的灯'],
  },
]

async function openPage(browser) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })
  const page = await context.newPage()
  await page.goto(UI, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.waitForSelector('[data-testid="roster-row-dsh-bot"]', { timeout: 20000 })
  return page
}

async function paneText(page) {
  return page.evaluate(() => {
    const pane = document.querySelector('[data-testid="conversation-pane"]')
    const mem = document.querySelector('[data-testid="memory-panel"]')
    return `${pane?.textContent || ''}\n${mem?.textContent || ''}`
  })
}

async function selectedSession(page) {
  return page.evaluate(() => document.querySelector('[data-testid="session-select"]')?.getAttribute('data-session-id') || '')
}

async function openSession(page, botId, sessionId) {
  await page.click(`[data-testid="roster-row-${botId}"]`)
  await page.waitForSelector('[data-testid="conversation-pane"]', { timeout: 15000 })
  const current = await selectedSession(page)
  if (current === sessionId) return { opened: true, reason: 'already' }
  const rosterSession = page.locator(`[data-testid="roster-session-${sessionId}"]`)
  if (await rosterSession.count()) {
    await rosterSession.click()
  } else {
    await page.click('[data-testid="session-select"]')
    const opt = page.locator(`[data-testid="session-option-${sessionId}"]`)
    await opt.waitFor({ timeout: 12000 })
    await opt.click()
  }
  await page.waitForFunction(
    id => document.querySelector('[data-testid="session-select"]')?.getAttribute('data-session-id') === id,
    sessionId,
    { timeout: 15000 },
  )
  return { opened: true, reason: 'switched' }
}

async function capture(page, job) {
  const opened = await openSession(page, job.botId, job.sessionId)
  if (job.extra === 'memory') {
    await page.click('[data-testid="memory-open"]')
    await page.waitForSelector('[data-testid="memory-panel"]', { timeout: 8000 })
  }
  await page.waitForFunction((tokens) => {
    const pane = document.querySelector('[data-testid="conversation-pane"]')
    const mem = document.querySelector('[data-testid="memory-panel"]')
    const text = `${pane?.textContent || ''}\n${mem?.textContent || ''}`
    return tokens.every(token => text.includes(token))
  }, job.must, { timeout: 20000 })
  const text = await paneText(page)
  const sid = await selectedSession(page)
  await page.screenshot({ path: job.dest, fullPage: true })
  return {
    name: job.name,
    dest: job.dest,
    exists: existsSync(job.dest),
    opened: opened.opened,
    openReason: opened.reason,
    selected: sid,
    textOk: job.must.every(token => text.includes(token)),
    snippet: text.replace(/\s+/g, ' ').slice(0, 220),
  }
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const results = []
try {
  const page = await openPage(browser)
  for (const job of jobs) {
    try {
      const row = await capture(page, job)
      results.push(row)
      console.log(`[${row.textOk ? 'PASS' : 'FAIL'}] ${row.name} selected=${row.selected} — ${row.snippet}`)
    } catch (error) {
      const sid = await selectedSession(page).catch(() => '')
      const text = await paneText(page).catch(() => '')
      const row = {
        name: job.name,
        dest: job.dest,
        exists: existsSync(job.dest),
        opened: false,
        selected: sid,
        textOk: false,
        error: error.message,
        snippet: text.replace(/\s+/g, ' ').slice(0, 220),
      }
      results.push(row)
      console.log(`[FAIL] ${job.name} selected=${sid} error=${error.message} — ${row.snippet}`)
    }
  }
} finally {
  await browser.close()
}

writeFileSync(join(here, 'shot-mother-names.json'), `${JSON.stringify(results, null, 2)}\n`)
if (results.some(row => !row.textOk)) process.exitCode = 2
