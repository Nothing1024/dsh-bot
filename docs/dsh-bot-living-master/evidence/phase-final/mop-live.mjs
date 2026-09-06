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
const wanted = new Set(process.argv.slice(2))

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

async function unreadOf(botId) {
  const listed = await rpc('listBots')
  return (listed.value?.bots ?? []).find(bot => bot.id === botId)?.unread ?? 0
}

async function disableAll() {
  const listed = await rpc('routineList', {})
  for (const item of listed.value ?? []) {
    if (item.enabled) await rpc('routineUpdate', { id: item.id, enabled: false })
  }
}

const matrix = []
function row(id, result, notes) {
  matrix.push({ id, result, notes })
  console.log(`[${result}] ${id} — ${notes}`)
}

function bootScript(hidden) {
  return hidden
    ? `window.__notices=[];
Object.defineProperty(Document.prototype,'hidden',{configurable:true,get:()=>true});
Object.defineProperty(Document.prototype,'visibilityState',{configurable:true,get:()=>'hidden'});
class StubNotice{static permission='granted';static requestPermission(){return Promise.resolve('granted')}constructor(title,opts={}){window.__notices.push({title,body:String(opts.body??''),at:Date.now()})}}
Object.defineProperty(window,'Notification',{configurable:true,get:()=>StubNotice,set(){}})`
    : `window.__notices=[];
class StubNotice{static permission='granted';static requestPermission(){return Promise.resolve('granted')}constructor(title,opts={}){window.__notices.push({title,body:String(opts.body??''),at:Date.now()})}}
Object.defineProperty(window,'Notification',{configurable:true,get:()=>StubNotice,set(){}})`
}

async function openPage(browser, hidden) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })
  await context.addInitScript({ content: bootScript(hidden) })
  const page = await context.newPage()
  await page.goto(UI, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.waitForSelector('[data-testid="roster-row-dsh-bot"]', { timeout: 20000 })
  return { context, page }
}

async function notifyPhase(browser) {
  await disableAll()
  await rpc('markRead', { botId: ids.yunwei })
  const created = await rpc('routineCreate', {
    botId: ids.yunwei,
    name: '通知终核2',
    schedule: '@every 60m',
    instruction: '报告时间并用名字称呼我',
    notify: true,
  })
  const extra = await rpc('routineCreate', {
    botId: ids.yunwei,
    name: '通知终核2副线',
    schedule: '@every 60m',
    instruction: '报告时间并用名字称呼我',
    notify: true,
  })
  const { page } = await openPage(browser, true)
  await page.click(`[data-testid="roster-row-${ids.xiaobei}"]`)
  await page.waitForTimeout(2500)
  const notices0 = await page.evaluate(() => window.__notices.slice())
  const ran = await rpc('routineRunNow', { id: created.value.id })
  const trail = []
  let notices = notices0
  let unreadN = 0
  for (let i = 0; i < 24; i++) {
    await page.waitForTimeout(500)
    unreadN = await unreadOf(ids.yunwei)
    notices = await page.evaluate(() => window.__notices.slice())
    trail.push({ i, unread: unreadN, notices: notices.length })
    if (notices.length > notices0.length && unreadN >= 1) break
  }
  const badge = await page.locator(`[data-testid="roster-unread-${ids.yunwei}"]`).textContent().catch(() => '')
  write(evR, 'UF-903/notification-call.json', {
    ran, trail, notices, badge,
    hidden: await page.evaluate(() => document.hidden),
    perm: await page.evaluate(() => Notification.permission),
  })
  await page.screenshot({ path: join(evR, 'UF-903/badge.png'), fullPage: true })
  const bodyOk = notices.some(item => String(item.body).length <= 140)
  row('UF-903 主路径 notify',
    ran?.value?.outcome === 'spoke' && notices.length > notices0.length && bodyOk ? 'PASS' : 'FAIL',
    `outcome=${ran?.value?.outcome}; notices=${notices.length}; unread=${unreadN}; badge=${badge}`)
  await page.click(`[data-testid="roster-row-${ids.yunwei}"]`)
  await page.waitForTimeout(800)
  const unreadAfter = await page.locator(`[data-testid="roster-unread-${ids.yunwei}"]`).count()
  await page.screenshot({ path: join(evR, 'UF-903/cleared.png'), fullPage: true })
  row('UF-903 点回清零', unreadAfter === 0 ? 'PASS' : 'FAIL', `unreadNodes=${unreadAfter}`)
  await page.context().close()

  await rpc('markRead', { botId: ids.yunwei })
  const focused = await openPage(browser, false)
  await focused.page.click(`[data-testid="roster-row-${ids.xiaobei}"]`)
  await focused.page.waitForTimeout(2500)
  const ran2 = await rpc('routineRunNow', { id: created.value.id })
  await focused.page.waitForTimeout(4000)
  const notices2 = await focused.page.evaluate(() => window.__notices.slice())
  write(evR, 'UF-903/focused-no-notify.json', {
    ran: ran2, notices: notices2, hidden: await focused.page.evaluate(() => document.hidden),
  })
  row('UF-903 窗口聚焦', ran2?.value?.outcome === 'spoke' && notices2.length === 0 ? 'PASS' : 'FAIL',
    `notices=${notices2.length}; outcome=${ran2?.value?.outcome}`)
  await focused.page.context().close()

  if (extra.ok) {
    await rpc('markRead', { botId: ids.yunwei })
    const hidden = await openPage(browser, true)
    await hidden.page.click(`[data-testid="roster-row-${ids.xiaobei}"]`)
    await hidden.page.waitForTimeout(2500)
    const first = await rpc('routineRunNow', { id: created.value.id })
    const second = await rpc('routineRunNow', { id: extra.value.id })
    let notices3 = []
    let unreadT = 0
    for (let i = 0; i < 16; i++) {
      await hidden.page.waitForTimeout(400)
      unreadT = await unreadOf(ids.yunwei)
      notices3 = await hidden.page.evaluate(() => window.__notices.slice())
      if (unreadT >= 2) break
    }
    write(evR, 'UF-903/throttle.json', { first, second, notices: notices3, unreadT })
    row('UF-903 5s 节流',
      unreadT >= 2 && notices3.length === 1 ? 'PASS' : (notices3.length <= 1 ? 'PARTIAL' : 'FAIL'),
      `unread=${unreadT}; notices=${notices3.length}; outcomes=${first?.value?.outcome},${second?.value?.outcome}`)
    await hidden.page.context().close()
    await rpc('routineUpdate', { id: extra.value.id, enabled: false })
  }
  await rpc('routineUpdate', { id: created.value.id, enabled: false })
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
  const { page } = await openPage(browser, false)
  await page.click(`[data-testid="roster-row-${ids.aning}"]`)
  await page.waitForSelector('[data-testid="conversation-pane"]', { timeout: 15000 })
  await page.click('[data-testid="session-select"]')
  await page.waitForSelector('[data-testid="session-list"]', { timeout: 8000 })
  const option = page.locator(`[data-testid="session-option-${created.value.sessionId}"]`)
  if (await option.count()) await option.click()
  await page.waitForTimeout(800)
  if (assistant) {
    await page.evaluate(seq => {
      document.querySelector(`[data-testid="transcript-menu-${seq}"]`)?.click()
    }, assistant.seq)
    await page.waitForTimeout(200)
    await page.evaluate(seq => {
      document.querySelector(`[data-testid="transcript-pin-${seq}"]`)?.click()
    }, assistant.seq)
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
  row('UF-804 📌', explicit ? 'PASS' : 'FAIL', `explicit=${explicit}; seq=${assistant?.seq}`)
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
    row('UF-905 提议卡', 'BLOCKED', 'no existing propose card')
    return
  }
  const { page } = await openPage(browser, false)
  await page.click(`[data-testid="roster-row-${ids.aning}"]`)
  await page.waitForSelector('[data-testid="conversation-pane"]', { timeout: 15000 })
  await page.click('[data-testid="session-select"]')
  await page.waitForSelector('[data-testid="session-list"]', { timeout: 8000 })
  const option = page.locator(`[data-testid="session-option-${sessionId}"]`)
  if (await option.count()) await option.click()
  await page.waitForTimeout(800)
  const clicked = await page.evaluate(() => {
    const btn = document.querySelector('[data-testid^="propose-accept-"]')
    if (!btn) return false
    btn.scrollIntoView()
    btn.click()
    return true
  })
  await page.waitForTimeout(1000)
  await page.screenshot({ path: join(evR, clicked ? 'UF-905/card.png' : 'UF-905/card-missing.png'), fullPage: true })
  if (await page.locator('[data-testid="routines-open"]').count()) {
    await page.click('[data-testid="routines-open"]')
    await page.waitForSelector('[data-testid="routines-panel"]', { timeout: 8000 }).catch(() => undefined)
    await page.screenshot({ path: join(evR, 'UF-905/routine-created.png'), fullPage: true })
  }
  const routines = await rpc('routineList', { botId: ids.aning })
  write(evR, 'UF-905/routines.json', routines)
  const createdRoutine = (routines.value ?? []).some(item => item.botId === ids.aning)
  row('UF-905 提议卡接受', createdRoutine && clicked ? 'PASS' : 'PARTIAL',
    `cards=${cards.length}; clicked=${clicked}; createdRoutine=${createdRoutine}`)
  await page.context().close()
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  if (wanted.size === 0 || wanted.has('notify')) await notifyPhase(browser)
  if (wanted.size === 0 || wanted.has('pin')) await pinPhase(browser)
  if (wanted.size === 0 || wanted.has('propose')) await proposePhase(browser)
} catch (error) {
  row('mop-live', 'FAIL', String(error?.stack ?? error))
} finally {
  await disableAll().catch(() => undefined)
  await browser.close()
}
write(join(root, 'docs/dsh-bot-living-master/evidence'), 'phase-final/mop-live-matrix.json', {
  at: new Date().toISOString(),
  matrix,
})
console.log(JSON.stringify(matrix, null, 2))
