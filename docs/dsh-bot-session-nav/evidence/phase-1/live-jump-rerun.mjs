#!/usr/bin/env node
/**
 * session-nav Phase 1 re-run (2026-09-08): in-tab jump for a visible,
 * a hidden non-archived (`~` + kind:hidden) and an archived delegated
 * (`~dsh-bot:`) session. Bridge must land current for the first two and
 * refuse the third with reason `archived`.
 */
import { createRequire } from 'node:module'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const require = createRequire(import.meta.url)
const { chromium } = require('/Users/nothing/workspace/dsh/plugin/dsh-genoffice/engine/node_modules/playwright')
const OUT = process.argv[2]
mkdirSync(OUT, { recursive: true })
const CASES = [
  { name: 'visible', id: 'session-e33be2c2-6dcc-434d-83d2-930fc8692460', expectOk: true },
  { name: 'hidden', id: 'session-974c0fc9-afa6-4a7c-a316-d0186ba7fd42', expectOk: true },
  { name: 'archived', id: 'session-de32fc13-88fa-44a0-b7bd-ded6e1694e64', expectOk: false, expectReason: 'archived' },
]
const log = { startedAt: new Date().toISOString(), cases: [] }

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-gpu', '--no-first-run'] })
let page
const consoleErrors = []
async function freshPage() {
  if (page !== undefined) await page.context().close().catch(() => {})
  page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
}

async function clickDshBotMenu() {
  await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('button, [role="menuitem"], [role="option"], [role="tab"]')]
    const hit = nodes.find((el) => {
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim()
      return text.startsWith('DSH Bot') && !(el.getAttribute('title') || '').includes('预设')
    })
    hit?.click()
  })
}

async function openDshBotTab() {
  await page.goto('http://127.0.0.1:3084/', { waitUntil: 'domcontentloaded', timeout: 45000 })
  await delay(2500)
  for (const name of ['展开底部面板', '展开侧边栏']) {
    const b = page.getByRole('button', { name })
    if (await b.count()) await b.first().click().catch(() => {})
    await delay(300)
  }
  if (await page.getByTestId('dsh-bot-iframe').count() === 0) {
    const plus = page.getByTitle('新建标签页')
    if (await plus.count()) await plus.last().click().catch(() => {})
    await delay(500)
    await clickDshBotMenu()
  }
  await page.getByTestId('dsh-bot-iframe').waitFor({ timeout: 25000 })
  await delay(1500)
}

function workbenchFrame() {
  return page.frames().find((f) => f.url().includes('/dsh-bot/ui'))
}

async function current() {
  return await page.evaluate(() => {
    const el = document.querySelector('[data-slot="conversation"]')
    const phase = el?.querySelector('[data-phase]')?.getAttribute('data-phase')
    return { phase, title: document.title }
  })
}

try {
  for (const c of CASES) {
    await freshPage()
    await openDshBotTab()
    await page.evaluate(() => { window.__dshBotJumpLast = undefined })
    const f = workbenchFrame()
    if (f === undefined) throw new Error('workbench frame missing')
    await f.evaluate((id) => {
      window.parent.postMessage({ type: 'dsh-bot:jump', sessionId: id }, location.origin)
    }, c.id)
    await delay(600)
    const result = await page.evaluate(() => window.__dshBotJumpLast ?? { error: 'no-result' })
    await delay(600)
    const shot = join(OUT, `jump-${c.name}.png`)
    await page.screenshot({ path: shot, fullPage: false })
    const chrome = await current()
    const pass = c.expectOk
      ? result.ok === true && result.current === c.id
      : result.ok === false && result.reason === c.expectReason
    log.cases.push({ ...c, result, chrome, pass, screenshot: shot })
  }
  log.consoleErrors = consoleErrors
  log.allPass = log.cases.every((c) => c.pass)
} catch (error) {
  log.error = String(error?.stack ?? error)
} finally {
  writeFileSync(join(OUT, 'live-jump-rerun.json'), JSON.stringify(log, null, 2))
  await browser.close()
}
console.log(JSON.stringify({ allPass: log.allPass, cases: log.cases.map((c) => ({ name: c.name, pass: c.pass, result: c.result })), error: log.error }, null, 2))
