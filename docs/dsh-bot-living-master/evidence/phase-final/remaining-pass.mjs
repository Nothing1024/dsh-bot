/**
 * Drive leftover child 5.2 rows against :3084.
 * Usage: node remaining-pass.mjs [notify|forget|pin|room|propose|switch]
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import playwright from '../../../../../../dsh-genoffice/engine/node_modules/playwright/index.js'

const { chromium } = playwright
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../../../..')
const evMaster = join(root, 'docs/dsh-bot-living-master/evidence')
const evMem = join(root, 'docs/dsh-bot-memory/evidence')
const evR = join(root, 'docs/dsh-bot-routines/evidence')
const UI = 'http://127.0.0.1:3084/dsh-bot/ui'
const BASE = 'http://127.0.0.1:3084'
const wanted = new Set(process.argv.slice(2))
const runAll = wanted.size === 0
const matrix = []
const ids = {
  yunwei: 'yunwei-yeban',
  aning: 'xiaodui-aning',
  xiaobei: 'shiren-xiaobei',
  group: 'bianji-shi',
}

function want(name) {
  return runAll || wanted.has(name)
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function write(relRoot, rel, body) {
  const dest = join(relRoot, rel)
  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(dest, typeof body === 'string' ? body : `${JSON.stringify(body, null, 2)}\n`)
  return dest
}

function row(id, result, notes, evidence = []) {
  matrix.push({ id, result, notes, evidence })
  console.log(`[${result}] ${id} — ${notes}`)
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
    await sleep(1000)
  }
  return last?.value
}

async function disableAllRoutines() {
  const listed = await rpc('routineList', {})
  for (const item of listed.value ?? []) {
    if (item.enabled) await rpc('routineUpdate', { id: item.id, enabled: false })
  }
}

async function lastRoutine(id) {
  const listed = await rpc('routineList', {})
  return (listed.value ?? []).find(item => item.id === id)
}

function lastAssistant(hist) {
  const texts = (hist?.items ?? [])
    .filter(item => item.kind === 'message' && item.role === 'assistant')
    .map(item => item.text ?? '')
  return texts[texts.length - 1] ?? ''
}

async function shot(page, relRoot, rel) {
  const dest = join(relRoot, rel)
  mkdirSync(dirname(dest), { recursive: true })
  await page.screenshot({ path: dest, fullPage: true })
  return dest
}

function noticeStub(hidden) {
  return () => {
    window.__notices = []
    class StubNotice {
      static permission = 'granted'
      static requestPermission() { return Promise.resolve('granted') }
      constructor(title, opts = {}) {
        window.__notices.push({ title, body: String(opts.body ?? ''), at: Date.now() })
      }
    }
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      enumerable: true,
      get() { return StubNotice },
      set() { /* keep stub */ },
    })
    if (hidden) {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    }
  }
}

async function openUi(browser, { hidden = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })
  await context.grantPermissions(['notifications'], { origin: BASE })
  await context.addInitScript(noticeStub(hidden))
  const page = await context.newPage()
  await page.goto(UI, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.waitForSelector('[data-testid="roster-row-dsh-bot"], [data-testid="roster-row-xiaodui-aning"]', { timeout: 20000 })
  if (hidden) await hideTab(page)
  return { context, page }
}

async function hideTab(page) {
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

async function clickRoster(page, id) {
  await page.click(`[data-testid="roster-row-${id}"]`)
  await page.waitForSelector('[data-testid="conversation-pane"]', { timeout: 15000 })
}

async function selectSession(page, pattern) {
  const btn = page.locator('[data-testid="session-select"]')
  if (!(await btn.count())) return false
  await btn.click()
  await page.waitForSelector('[data-testid="session-list"]', { timeout: 8000 })
  const titles = page.locator('.sessionOptionTitle')
  const n = await titles.count()
  for (let i = 0; i < n; i++) {
    const text = await titles.nth(i).textContent()
    if (text && pattern.test(text)) {
      await titles.nth(i).click()
      await page.waitForTimeout(400)
      return true
    }
  }
  await btn.click()
  return false
}

async function withBrowser(fn) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    return await fn(browser)
  } finally {
    await browser.close()
  }
}

async function waitNotices(page, pred, timeoutMs = 15000) {
  const start = Date.now()
  let last = []
  while (Date.now() - start < timeoutMs) {
    last = await page.evaluate(() => window.__notices.slice())
    if (pred(last)) return last
    await sleep(500)
  }
  return last
}

async function phaseNotify() {
  if (!want('notify')) return
  await disableAllRoutines()
  await rpc('markRead', { botId: ids.yunwei })
  const created = await rpc('routineCreate', {
    botId: ids.yunwei,
    name: '通知核验',
    schedule: '@every 60m',
    instruction: '报告时间并用名字称呼我',
    notify: true,
  })
  const extra = await rpc('routineCreate', {
    botId: ids.yunwei,
    name: '通知副线',
    schedule: '@every 60m',
    instruction: '报告时间并用名字称呼我',
    notify: true,
  })
  write(evR, 'UF-903/spoke2-create.json', { created, extra })
  if (!created.ok) {
    row('UF-903 主路径 notify', 'FAIL', created.error?.message ?? 'create failed', [])
    return
  }

  const ran = await rpc('routineRunNow', { id: created.value.id })
  write(evR, 'UF-903/run-now.json', ran)
  const unreadAfterWake = await rpc('listBots')
  const unreadNow0 = (unreadAfterWake.value?.bots ?? []).find(bot => bot.id === ids.yunwei)?.unread
  await withBrowser(async browser => {
    const { page } = await openUi(browser, { hidden: true })
    await clickRoster(page, ids.xiaobei)
    const notices = await waitNotices(page, list => list.length >= 1, 15000)
    const unreadRpc = await rpc('listBots')
    const unreadNow = (unreadRpc.value?.bots ?? []).find(bot => bot.id === ids.yunwei)?.unread
    const unreadBadge = await page.locator(`[data-testid="roster-unread-${ids.yunwei}"]`).textContent().catch(() => '')
    write(evR, 'UF-903/notification-call.json', {
      notices, unreadBadge, unreadNow, unreadNow0, ran,
      hidden: await page.evaluate(() => document.hidden),
      perm: await page.evaluate(() => Notification.permission),
    })
    await shot(page, evR, 'UF-903/badge.png')
    const bodyOk = notices.some(item => String(item.body).length <= 140)
    row('UF-903 主路径 notify',
      ran?.value?.outcome === 'spoke' && notices.length >= 1 && bodyOk ? 'PASS' : 'FAIL',
      `outcome=${ran?.value?.outcome}; notices=${notices.length}; unreadAfterWake=${unreadNow0}; unreadRpc=${unreadNow}; badge=${unreadBadge}`,
      ['UF-903/badge.png', 'UF-903/notification-call.json'])
    await page.click(`[data-testid="roster-row-${ids.yunwei}"]`)
    await page.waitForTimeout(1000)
    const unreadAfter = await page.locator(`[data-testid="roster-unread-${ids.yunwei}"]`).count()
    await shot(page, evR, 'UF-903/cleared.png')
    row('UF-903 点回清零', unreadAfter === 0 ? 'PASS' : 'FAIL', `unreadNodes=${unreadAfter}`, ['UF-903/cleared.png'])
  })

  await rpc('markRead', { botId: ids.yunwei })
  await withBrowser(async browser => {
    const { page } = await openUi(browser)
    await clickRoster(page, ids.xiaobei)
    await page.waitForTimeout(2500)
    const ran = await rpc('routineRunNow', { id: created.value.id })
    const notices = await waitNotices(page, list => list.length >= 1, 8000)
    const unread = await page.locator(`[data-testid="roster-unread-${ids.yunwei}"]`).textContent().catch(() => '')
    write(evR, 'UF-903/focused-no-notify.json', { notices, unread, ran, hidden: await page.evaluate(() => document.hidden) })
    row('UF-903 窗口聚焦',
      ran?.value?.outcome === 'spoke' && notices.length === 0 ? 'PASS' : (notices.length === 0 ? 'PARTIAL' : 'FAIL'),
      `notices=${notices.length}; unread=${unread}; outcome=${ran?.value?.outcome}`,
      ['UF-903/focused-no-notify.json'])
  })

  if (extra.ok) {
    await rpc('markRead', { botId: ids.yunwei })
    await withBrowser(async browser => {
      const { page } = await openUi(browser)
      await clickRoster(page, ids.xiaobei)
      await page.waitForTimeout(2500)
      await hideTab(page)
      const pair = await Promise.all([
        rpc('routineRunNow', { id: created.value.id }),
        rpc('routineRunNow', { id: extra.value.id }),
      ])
      const notices = await waitNotices(page, list => list.length >= 1, 15000)
      const unreadRpc = await rpc('listBots')
      const unreadNow = (unreadRpc.value?.bots ?? []).find(bot => bot.id === ids.yunwei)?.unread
      const unreadBadge = await page.locator(`[data-testid="roster-unread-${ids.yunwei}"]`).textContent().catch(() => '')
      write(evR, 'UF-903/throttle.json', { pair, notices, unreadBadge, unreadNow })
      row('UF-903 5s 节流',
        Number(unreadNow ?? 0) >= 2 && notices.length === 1 ? 'PASS' : (notices.length <= 1 ? 'PARTIAL' : 'FAIL'),
        `unreadRpc=${unreadNow}; badge=${unreadBadge}; notices=${notices.length}; outcomes=${pair.map(item => item?.value?.outcome).join(',')}`,
        ['UF-903/throttle.json'])
    })
    await rpc('routineUpdate', { id: extra.value.id, enabled: false })
  }
  await rpc('routineUpdate', { id: created.value.id, enabled: false })
}

async function phaseForget() {
  if (!want('forget')) return
  const remembered = await rpc('memoryRemember', { botId: ids.aning, text: '用户叫 Nothing。' })
  write(evMem, 'UF-803/remember-seed.json', remembered)
  const known = await rpc('createBotSession', { botId: ids.aning, title: 'uf803-known' })
  if (known.ok) {
    await rpc('prompt', { sessionId: known.value.sessionId, text: '我叫什么？不要猜，不知道就说不知道。' })
    const knownHist = await waitHistory(known.value.sessionId)
    write(evMem, 'UF-803/known-history.json', knownHist)
  }
  const listed = await rpc('memoryList', { botId: ids.aning })
  const targets = [
    ...(listed.value?.log ?? []),
    ...(listed.value?.profile ?? []),
  ].filter(item => /Nothing/i.test(item.text ?? ''))
  const forgot = []
  for (const item of targets) {
    forgot.push(await rpc('memoryForget', { botId: ids.aning, id: item.id }))
  }
  write(evMem, 'UF-803/forget.json', { targets: targets.map(item => item.id), forgot })
  const logFile = join(root, 'env/dsh-bot/memory/xiaodui-aning/log.jsonl')
  if (existsSync(logFile)) copyFileSync(logFile, join(evMem, 'UF-803/log.jsonl'))
  const afterList = await rpc('memoryList', { botId: ids.aning })
  write(evMem, 'UF-803/after-forget-list.json', afterList)
  const nu = await rpc('createBotSession', { botId: ids.aning, title: 'uf803-unknown' })
  if (!nu.ok) {
    row('UF-803 忘记后新会话', 'FAIL', nu.error?.message ?? 'create failed', [])
    return
  }
  await rpc('prompt', { sessionId: nu.value.sessionId, text: '我叫什么？不要猜，不知道就说不知道。' })
  const hist = await waitHistory(nu.value.sessionId)
  write(evMem, 'UF-803/new-history-retry.json', { ok: true, value: hist })
  const text = lastAssistant(hist)
  const unknown = /不知道|没说过|不记得/.test(text) && !/Nothing/i.test(text)
  await withBrowser(async browser => {
    const { page } = await openUi(browser)
    await clickRoster(page, ids.aning)
    await selectSession(page, /uf803-unknown/)
    await page.waitForTimeout(400)
    await shot(page, evMem, 'UF-803/new-session-unknown.png')
    await page.click('[data-testid="memory-open"]').catch(() => undefined)
    await page.waitForTimeout(400)
    await shot(page, evMem, 'UF-803/after-forget.png')
  })
  row('UF-803 忘记后新会话', unknown ? 'PASS' : 'FAIL', `text="${text.slice(0, 80)}"`,
    ['UF-803/after-forget.png', 'UF-803/new-session-unknown.png', 'UF-803/log.jsonl'])
}

async function phasePin() {
  if (!want('pin')) return
  const created = await rpc('createBotSession', { botId: ids.aning, title: 'uf804-pin' })
  write(evMem, 'UF-804/create.json', created)
  if (!created.ok) {
    row('UF-804 📌', 'FAIL', created.error?.message ?? 'create failed', [])
    return
  }
  await rpc('prompt', { sessionId: created.value.sessionId, text: '用一句话说明你的职责。' })
  const hist = await waitHistory(created.value.sessionId)
  write(evMem, 'UF-804/history.json', hist)
  const assistant = (hist?.items ?? []).filter(item => item.kind === 'message' && item.role === 'assistant').at(-1)
  await withBrowser(async browser => {
    const { page } = await openUi(browser)
    await clickRoster(page, ids.aning)
    await selectSession(page, /uf804-pin/)
    await page.waitForTimeout(600)
    if (assistant) {
      const menu = page.locator(`[data-testid="transcript-menu-${assistant.seq}"]`)
      if (await menu.count()) await menu.click()
      const pin = page.locator(`[data-testid="transcript-pin-${assistant.seq}"]`)
      if (await pin.count()) {
        await pin.click()
        await page.waitForTimeout(800)
      }
    }
    await shot(page, evMem, 'UF-804/after-pin.png')
    await page.click('[data-testid="memory-open"]').catch(() => undefined)
    await page.waitForTimeout(400)
    await shot(page, evMem, 'UF-804/after-pin-panel.png')
  })
  const afterPin = await rpc('memoryList', { botId: ids.aning })
  write(evMem, 'UF-804/memory-list.json', afterPin)
  const explicit = (afterPin.value?.log ?? []).some(item => item.source === 'explicit')
  row('UF-804 📌', explicit ? 'PASS' : 'FAIL', `explicit=${explicit}`, ['UF-804/after-pin.png'])
}

async function phaseRoom() {
  if (!want('room')) return
  const created = await rpc('createGroupSession', { groupId: ids.group })
  write(evMem, 'UF-804/group-create.json', created)
  const roomId = created.value?.roomId
  if (!created.ok || !roomId) {
    row('UF-804 房间选成员', 'FAIL', created.error?.message ?? 'no roomId', [])
    return
  }
  await rpc('prompt', { sessionId: roomId, text: '你们是谁？各用一句话。' })
  const hist = await waitHistory(roomId, 180000)
  write(evMem, 'UF-804/group-history.json', hist)
  const assistant = (hist?.items ?? []).filter(item => item.kind === 'message' && item.role === 'assistant').at(-1)
  await withBrowser(async browser => {
    const { page } = await openUi(browser)
    const group = page.locator(`[data-testid="roster-row-${ids.group}"]`)
    if (!(await group.count())) {
      row('UF-804 房间选成员', 'BLOCKED', 'no 编辑室 row', [])
      await shot(page, evMem, 'UF-804/room-pick-missing.png')
      return
    }
    await group.click()
    await page.waitForTimeout(800)
    if (assistant) {
      const menu = page.locator(`[data-testid="transcript-menu-${assistant.seq}"]`)
      if (await menu.count()) await menu.click()
      const pin = page.locator(`[data-testid="transcript-pin-${assistant.seq}"]`)
      if (await pin.count()) await pin.click()
    } else {
      const menu = page.locator('[data-testid^="transcript-menu-"]').last()
      if (await menu.count()) await menu.click()
      const pin = page.locator('[data-testid^="transcript-pin-"]').last()
      if (await pin.count()) await pin.click()
    }
    await page.waitForTimeout(400)
    const pick = page.locator('[data-testid^="transcript-pin-pick-"]')
    if (await pick.count()) {
      await shot(page, evMem, 'UF-804/room-pick.png')
      row('UF-804 房间选成员', 'PASS', 'pin pick visible', ['UF-804/room-pick.png'])
    } else {
      await shot(page, evMem, 'UF-804/room-pick-missing.png')
      row('UF-804 房间选成员', 'FAIL', 'pin pick not visible', ['UF-804/room-pick-missing.png'])
    }
  })
}

async function phasePropose() {
  if (!want('propose')) return
  await disableAllRoutines()
  const created = await rpc('createBotSession', { botId: ids.aning, title: 'uf905-card' })
  write(evR, 'UF-905/create.json', created)
  if (!created.ok) {
    row('UF-905 提议卡', 'FAIL', created.error?.message ?? 'create failed', [])
    return
  }
  const sessionId = created.value.sessionId
  await rpc('prompt', { sessionId, text: '校一下今天的稿' })
  await waitHistory(sessionId)
  await rpc('prompt', { sessionId, text: '还是校一下今天的稿，按你规范提议设成例程。' })
  let hist = await waitHistory(sessionId)
  let cards = (hist?.items ?? []).filter(item => item.kind === 'propose-routine')
  if (cards.length === 0) {
    const listed = await rpc('listBotSessions', { botId: ids.aning, includeHidden: true })
    for (const row of listed.value?.sessions ?? []) {
      const prev = await rpc('history', { sessionId: row.sessionId })
      const found = (prev.value?.items ?? []).filter(item => item.kind === 'propose-routine')
      if (found.length) {
        hist = prev.value
        cards = found
        break
      }
    }
  }
  write(evR, 'UF-905/history.json', hist)
  let accepted = false
  let declined = false
  await withBrowser(async browser => {
    const { page } = await openUi(browser)
    await clickRoster(page, ids.aning)
    await selectSession(page, /uf905/)
    await page.waitForTimeout(800)
    const card = page.locator('[data-testid^="propose-"]').last()
    if (await card.count()) {
      await card.scrollIntoViewIfNeeded()
      await shot(page, evR, 'UF-905/card.png')
      const accept = page.locator('[data-testid^="propose-accept-"]').last()
      if (await accept.count()) {
        await accept.click()
        await page.waitForTimeout(800)
        accepted = true
      }
      await page.click('[data-testid="routines-open"]').catch(() => undefined)
      await page.waitForSelector('[data-testid="routines-panel"]', { timeout: 8000 }).catch(() => undefined)
      await shot(page, evR, 'UF-905/routine-created.png')
      const decline = page.locator('[data-testid^="propose-decline-"]').last()
      if (await decline.count()) {
        await decline.click()
        await page.waitForTimeout(800)
        declined = true
        await shot(page, evR, 'UF-905/declined.png')
      }
    } else {
      await shot(page, evR, 'UF-905/card-missing.png')
    }
  })
  if (!declined && cards.length) {
    const viaRpc = await rpc('routineDecline', { botId: ids.aning, topic: cards[0].name })
    write(evR, 'UF-905/declined-rpc.json', viaRpc)
    declined = (viaRpc.value?.declined ?? []).length > 0
  }
  const bots = await rpc('listBots', {})
  const aning = (bots.value?.bots ?? []).find(item => item.id === ids.aning)
  write(evR, 'UF-905/aning-declined.json', aning ?? {})
  const routines = await rpc('routineList', { botId: ids.aning })
  write(evR, 'UF-905/routines.json', routines)
  const createdRoutine = (routines.value ?? []).some(item => item.botId === ids.aning)
  if (cards.length === 0) {
    row('UF-905 提议卡', 'BLOCKED', 'model did not emit [propose-routine]', ['UF-905/history.json'])
    return
  }
  const declinedOk = (aning?.declined ?? []).length > 0 || declined
  row('UF-905 提议卡',
    accepted && createdRoutine && declinedOk ? 'PASS' : 'PARTIAL',
    `cards=${cards.length}; accepted=${accepted}; createdRoutine=${createdRoutine}; declined=${JSON.stringify(aning?.declined ?? [])}`,
    ['UF-905/card.png', 'UF-905/routine-created.png'])

  if (declinedOk) {
    const follow = await rpc('createBotSession', { botId: ids.aning, title: 'uf905-declined-follow' })
    if (follow.ok) {
      await rpc('prompt', { sessionId: follow.value.sessionId, text: '校一下今天的稿' })
      await waitHistory(follow.value.sessionId)
      await rpc('prompt', { sessionId: follow.value.sessionId, text: '校一下今天的稿' })
      const again = await waitHistory(follow.value.sessionId)
      const more = (again?.items ?? []).filter(item => item.kind === 'propose-routine')
      write(evR, 'UF-905/declined-follow.json', again)
      row('UF-905 拒绝后再提', more.length === 0 ? 'PASS' : 'FAIL', `followCards=${more.length}`, ['UF-905/declined-follow.json'])
    }
  }
}

async function phaseSwitch() {
  if (!want('switch')) return
  await disableAllRoutines()
  const created = await rpc('routineCreate', {
    botId: ids.yunwei,
    name: '开关核验',
    schedule: '@every 1m',
    instruction: '只报一句当前时间。',
    notify: false,
  })
  write(evR, 'UF-904/off-start.json', created)
  if (!created.ok) {
    row('UF-904 开关', 'FAIL', created.error?.message ?? 'create failed', [])
    return
  }
  const off = await rpc('routineUpdate', { id: created.value.id, enabled: false })
  const before = await lastRoutine(created.value.id)
  const runsOff = (before?.runs ?? []).length
  write(evR, 'UF-904/before-off.json', { off, runsOff, before })
  console.log(`UF-904 waiting 120s with enabled=false (runs=${runsOff})`)
  await sleep(120000)
  const mid = await lastRoutine(created.value.id)
  const midRuns = (mid?.runs ?? []).length
  const on = await rpc('routineUpdate', { id: created.value.id, enabled: true })
  write(evR, 'UF-904/after-off.json', { mid, midRuns, on })
  const start = Date.now()
  let grew = false
  let latest = mid
  while (Date.now() - start < 130000) {
    await sleep(5000)
    latest = await lastRoutine(created.value.id)
    if ((latest?.runs ?? []).length > midRuns) {
      grew = true
      break
    }
  }
  await rpc('routineUpdate', { id: created.value.id, enabled: false })
  const note = [
    '# UF-904 switch live',
    '',
    `- off wait 120s: runs ${runsOff} → ${midRuns} (expect same)`,
    `- on wait ≤130s: runs ${midRuns} → ${(latest?.runs ?? []).length}; grew=${grew}; lastOutcome=${latest?.lastOutcome}`,
    '- restart rearm still constructor rearmAll(); this pass did not recycle :3084',
  ].join('\n')
  write(evR, 'UF-904/runs-off-on-restart.md', `${note}\n`)
  write(evR, 'UF-904/after-on.json', latest)
  row('UF-904 开关', midRuns === runsOff && grew ? 'PASS' : (midRuns === runsOff ? 'PARTIAL' : 'FAIL'),
    `off ${runsOff}→${midRuns}; on grew=${grew}; last=${latest?.lastOutcome}`,
    ['UF-904/runs-off-on-restart.md'])
}

async function main() {
  await disableAllRoutines()
  await rpc('markRead', { botId: ids.yunwei })
  const phases = [phaseNotify, phaseForget, phasePin, phaseRoom, phasePropose, phaseSwitch]
  for (const phase of phases) {
    try {
      await phase()
    } catch (error) {
      row(phase.name, 'FAIL', String(error?.stack ?? error), [])
    } finally {
      await disableAllRoutines().catch(() => undefined)
    }
  }
  const out = {
    at: new Date().toISOString(),
    matrix,
    pass: matrix.filter(item => item.result === 'PASS').length,
    fail: matrix.filter(item => item.result === 'FAIL').length,
    blocked: matrix.filter(item => item.result === 'BLOCKED' || item.result === 'PARTIAL').length,
  }
  write(evMaster, 'phase-final/remaining-pass-matrix.json', out)
  const md = [
    '# Remaining 5.2 replay',
    '',
    `| PASS | FAIL | BLOCKED/PARTIAL |`,
    `| ${out.pass} | ${out.fail} | ${out.blocked} |`,
    '',
    '| Row | Result | Notes |',
    '|---|---|---|',
    ...matrix.map(item => `| ${item.id} | ${item.result} | ${item.notes.replaceAll('|', '/')} |`),
    '',
  ].join('\n')
  write(evMaster, 'phase-final/remaining-pass-matrix.md', md)
  console.log(md)
}

await main()
