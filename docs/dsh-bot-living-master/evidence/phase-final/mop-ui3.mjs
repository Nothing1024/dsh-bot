import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import playwright from '../../../../../../dsh-genoffice/engine/node_modules/playwright/index.js'

const { chromium } = playwright
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../../../..')
const evMem = join(root, 'docs/dsh-bot-memory/evidence')
const evR = join(root, 'docs/dsh-bot-routines/evidence')
const UI = 'http://127.0.0.1:3084/dsh-bot/ui'
const BASE = 'http://127.0.0.1:3084'
const ids = { yunwei: 'yunwei-yeban', aning: 'xiaodui-aning', xiaobei: 'shiren-xiaobei' }

function write(relRoot, rel, body) {
  const dest = join(relRoot, rel)
  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(dest, typeof body === 'string' ? body : `${JSON.stringify(body, null, 2)}\n`)
}

async function rpc(method, args = {}, timeoutMs = 180000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`${BASE}/dsh-bot/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ args }),
      signal: ctrl.signal,
    })
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

async function waitHistory(sessionId, timeoutMs = 180000) {
  const start = Date.now()
  let last
  while (Date.now() - start < timeoutMs) {
    last = await rpc('history', { sessionId })
    if (last?.ok && last.value?.working === false) return last.value
    await new Promise(r => setTimeout(r, 1000))
  }
  return last?.value
}

const matrix = []
function row(id, result, notes) {
  matrix.push({ id, result, notes })
  console.log(`[${result}] ${id} — ${notes}`)
}

async function openPage(browser) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })
  const page = await context.newPage()
  await page.goto(UI, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.waitForSelector('[data-testid="roster-row-dsh-bot"]', { timeout: 20000 })
  return page
}

async function openSession(page, botId, sessionId) {
  await page.click(`[data-testid="roster-row-${botId}"]`)
  await page.waitForSelector('[data-testid="conversation-pane"]', { timeout: 15000 })
  await page.click('[data-testid="session-select"]')
  const opt = page.locator(`[data-testid="session-option-${sessionId}"]`)
  await opt.waitFor({ timeout: 15000 })
  await opt.click()
  await page.waitForTimeout(400)
}

async function clearPhase(browser) {
  await rpc('markRead', { botId: ids.yunwei })
  const created = await rpc('routineCreate', {
    botId: ids.yunwei,
    name: '点回清零',
    schedule: '@every 60m',
    instruction: '报告时间并用名字称呼我',
    notify: true,
  })
  const ran = await rpc('routineRunNow', { id: created.value.id })
  const page = await openPage(browser)
  await page.click(`[data-testid="roster-row-${ids.xiaobei}"]`)
  await page.waitForSelector(`[data-testid="roster-unread-${ids.yunwei}"]`, { timeout: 8000 })
  await page.screenshot({ path: join(evR, 'UF-903/badge.png'), fullPage: true })
  await page.click(`[data-testid="roster-row-${ids.yunwei}"]`)
  await page.waitForTimeout(300)
  const unreadAfter = await page.locator(`[data-testid="roster-unread-${ids.yunwei}"]`).count()
  await page.screenshot({ path: join(evR, 'UF-903/cleared.png'), fullPage: true })
  row('UF-903 点回清零', ran?.value?.outcome === 'spoke' && unreadAfter === 0 ? 'PASS' : 'FAIL',
    `outcome=${ran?.value?.outcome}; unreadNodes=${unreadAfter}`)
  await rpc('routineUpdate', { id: created.value.id, enabled: false })
  await page.context().close()
}

async function pinPhase(browser) {
  const created = await rpc('createBotSession', { botId: ids.aning, title: 'uf804-pin3' })
  if (!created.ok) {
    row('UF-804 📌', 'FAIL', created.error?.message ?? 'create failed')
    return
  }
  await rpc('prompt', { sessionId: created.value.sessionId, text: '用一句话说明你的职责。' })
  const hist = await waitHistory(created.value.sessionId)
  write(evMem, 'UF-804/history.json', hist)
  const assistant = (hist?.items ?? []).filter(item => item.kind === 'message' && item.role === 'assistant').at(-1)
  const page = await openPage(browser)
  await openSession(page, ids.aning, created.value.sessionId)
  if (assistant) {
    await page.waitForSelector(`[data-testid="transcript-msg-${assistant.seq}"]`, { timeout: 15000 })
    await page.hover(`[data-testid="transcript-msg-${assistant.seq}"]`)
    await page.click(`[data-testid="transcript-menu-${assistant.seq}"]`)
    await page.waitForSelector(`[data-testid="transcript-pin-${assistant.seq}"]`, { timeout: 5000 })
    await page.click(`[data-testid="transcript-pin-${assistant.seq}"]`)
    await page.waitForTimeout(800)
  }
  await page.screenshot({ path: join(evMem, 'UF-804/after-pin.png'), fullPage: true })
  if (await page.locator('[data-testid="memory-open"]').count()) {
    await page.click('[data-testid="memory-open"]')
    await page.waitForTimeout(400)
    await page.screenshot({ path: join(evMem, 'UF-804/after-pin-panel.png'), fullPage: true })
  }
  const after = await rpc('memoryList', { botId: ids.aning })
  write(evMem, 'UF-804/memory-list.json', after)
  const explicit = (after.value?.log ?? []).some(item => item.source === 'explicit')
  row('UF-804 📌', explicit ? 'PASS' : 'FAIL', `explicit=${explicit}; seq=${assistant?.seq}; session=${created.value.sessionId}`)
  await page.context().close()
}

async function proposePhase(browser) {
  const listed = await rpc('listBotSessions', { botId: ids.aning, includeHidden: true })
  let sessionId
  let cards = []
  for (const rowS of listed.value?.sessions ?? []) {
    const hist = await rpc('history', { sessionId: rowS.sessionId })
    const found = (hist.value?.items ?? []).filter(item => item.kind === 'propose-routine')
    if (found.length) {
      sessionId = rowS.sessionId
      cards = found
      write(evR, 'UF-905/history.json', hist.value)
      break
    }
  }
  if (!sessionId) {
    row('UF-905 提议卡接受', 'BLOCKED', 'no existing propose card')
    return
  }
  const page = await openPage(browser)
  await openSession(page, ids.aning, sessionId)
  const acceptSel = `[data-testid="propose-accept-${cards[0].id}"]`
  await page.waitForSelector(acceptSel, { timeout: 15000 })
  await page.locator(acceptSel).scrollIntoViewIfNeeded()
  await page.screenshot({ path: join(evR, 'UF-905/card.png'), fullPage: true })
  await page.click(acceptSel)
  await page.waitForTimeout(1000)
  if (await page.locator('[data-testid="routines-open"]').count()) {
    await page.click('[data-testid="routines-open"]')
    await page.waitForSelector('[data-testid="routines-panel"]', { timeout: 8000 }).catch(() => undefined)
    await page.screenshot({ path: join(evR, 'UF-905/routine-created.png'), fullPage: true })
  }
  const routines = await rpc('routineList', { botId: ids.aning })
  write(evR, 'UF-905/routines.json', routines)
  const createdRoutine = (routines.value ?? []).some(item => item.botId === ids.aning)
  row('UF-905 提议卡接受', createdRoutine ? 'PASS' : 'FAIL',
    `cards=${cards.length}; createdRoutine=${createdRoutine}; names=${(routines.value ?? []).map(x => x.name).join(',')}`)
  await page.context().close()
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  await clearPhase(browser)
  await pinPhase(browser)
  await proposePhase(browser)
} catch (error) {
  row('mop-ui3', 'FAIL', String(error?.stack ?? error))
} finally {
  await browser.close()
}
write(join(root, 'docs/dsh-bot-living-master/evidence'), 'phase-final/mop-ui3-matrix.json', {
  at: new Date().toISOString(),
  matrix,
})
console.log(JSON.stringify(matrix, null, 2))
