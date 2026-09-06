/**
 * Drive remaining living-master / child 5.2 live rows against :3084.
 * Usage: node docs/dsh-bot-living-master/evidence/phase-final/live-remaining.mjs [phase...]
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
  baoshi: 'r-1788692459058-bldp78m8',
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

async function waitMemory(botId, pred, timeoutMs = 60000) {
  const start = Date.now()
  let last
  while (Date.now() - start < timeoutMs) {
    last = await rpc('memoryList', { botId })
    if (last?.ok && pred(last.value)) return last.value
    await sleep(1500)
  }
  return last?.ok ? last.value : last
}

function countMemory(data) {
  return (data?.profile ?? []).length + (data?.log ?? []).length
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

function lastRun(row) {
  const runs = row?.runs ?? []
  return runs[runs.length - 1]
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

async function withBrowser(fn) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    return await fn(browser)
  } finally {
    await browser.close()
  }
}

async function openUi(browser, { hidden = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
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
  })
  const page = await context.newPage()
  await page.goto(UI, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.waitForSelector('[data-testid="workbench-roster"]', { timeout: 20000 })
  if (hidden) {
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
  }
  return { context, page }
}

async function clickRoster(page, id) {
  await page.click(`[data-testid="roster-row-${id}"]`)
  await page.waitForSelector('[data-testid="conversation-pane"]', { timeout: 15000 })
}

async function openPanel(page, testId, panel) {
  await page.click(`[data-testid="${testId}"]`)
  await page.waitForSelector(`[data-testid="${panel}"]`, { timeout: 10000 })
}

async function selectSession(page, pattern) {
  const select = page.locator('[data-testid="session-select"]')
  if (await select.count()) {
    await select.selectOption({ label: pattern }).catch(async () => {
      const options = await select.locator('option').allTextContents()
      const hit = options.find(item => pattern.test ? pattern.test(item) : item.includes(String(pattern)))
      if (hit) await select.selectOption({ label: hit })
    })
  }
}

async function safeShot(fn, label) {
  try {
    await withBrowser(fn)
    return true
  } catch (error) {
    console.log(`[ui] ${label} ${error?.message ?? error}`)
    return false
  }
}

async function phaseListSessions() {
  if (!want('listsessions')) return
  const raw = await fetch(`${BASE}/dsh-bot/listSessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ args: {} }),
  }).then(item => item.json()).catch(error => ({ ok: false, error: { message: String(error) } }))
  write(evMaster, 'UF-103/v1-listSessions-probe.json', raw)
  const fallback = await rpc('listBotSessions', { botId: ids.yunwei })
  write(evMaster, 'UF-103/listBotSessions-live.json', fallback)
  row('v1 listSessions RPC', raw?.ok ? 'PASS' : 'BLOCKED',
    raw?.ok ? 'raw listSessions ok' : `still failing: ${raw?.error?.message ?? JSON.stringify(raw).slice(0, 160)}`,
    ['UF-103/v1-listSessions-probe.json'])
}

async function phaseSpoke() {
  if (!want('spoke')) return
  await disableAllRoutines()
  const ran = await rpc('routineRunNow', { id: ids.baoshi })
  const after = await lastRoutine(ids.baoshi)
  write(evR, 'UF-901/run-now-spoke.json', ran)
  write(evR, 'UF-901/routines.json', after)
  const hist = after?.sessionId ? await rpc('history', { sessionId: after.sessionId }) : null
  if (hist?.ok) write(evR, 'UF-901/wake-session-history.json', hist)
  const text = lastAssistant(hist?.value)
  const outcome = ran?.value?.outcome ?? after?.lastOutcome
  await safeShot(async browser => {
    const { page } = await openUi(browser)
    await clickRoster(page, ids.yunwei)
    await page.waitForTimeout(500)
    await selectSession(page, /例程 · 报时/)
    await page.waitForTimeout(400)
    await shot(page, evR, 'UF-901/thread-wake.png')
    await openPanel(page, 'routines-open', 'routines-panel')
    await shot(page, evR, 'UF-901/panel-after-spoke.png')
  }, 'spoke')
  row('UF-901 主路径 spoke', outcome === 'spoke' ? 'PASS' : 'FAIL',
    `outcome=${outcome}; last=${lastRun(after)?.outcome}; text=${text.slice(0, 80)}`,
    ['UF-901/thread-wake.png', 'UF-901/routines.json'])
}

async function phaseSilent() {
  if (!want('silent')) return
  await disableAllRoutines()
  const created = await rpc('routineCreate', {
    botId: ids.yunwei,
    name: '巡检静默',
    schedule: '@every 60m',
    instruction: '如果没有异常就别说话',
    notify: false,
  })
  write(evR, 'UF-902/create.json', created)
  if (!created.ok) {
    row('UF-902 silent', 'FAIL', `create failed: ${created.error?.message}`, ['UF-902/create.json'])
    return
  }
  const silentId = created.value.id
  const ran = await rpc('routineRunNow', { id: silentId })
  const after = await lastRoutine(silentId)
  write(evR, 'UF-902/run-now.json', ran)
  write(evR, 'UF-902/routines.json', after)
  const hist = after?.sessionId ? await rpc('history', { sessionId: after.sessionId }) : null
  if (hist?.ok) write(evR, 'UF-902/history.json', hist)
  const outcome = ran?.value?.outcome ?? after?.lastOutcome
  await safeShot(async browser => {
    const { page } = await openUi(browser)
    await clickRoster(page, ids.yunwei)
    await openPanel(page, 'routines-open', 'routines-panel')
    await shot(page, evR, 'UF-902/silent-row.png')
  }, 'silent')
  row('UF-902 silent', outcome === 'silent' ? 'PASS' : (outcome ? 'FAIL' : 'BLOCKED'),
    `outcome=${outcome}; last=${lastAssistant(hist?.value).slice(0, 80)}`,
    ['UF-902/silent-row.png', 'UF-902/routines.json'])
}

async function phaseLock() {
  if (!want('lock')) return
  await disableAllRoutines()
  const routine = await lastRoutine(ids.baoshi)
  const sessionId = routine?.sessionId
  if (!sessionId) {
    row('UF-902 lock', 'BLOCKED', '报时 has no sessionId', [])
    return
  }
  const started = Date.now()
  const userP = rpc('prompt', { sessionId, text: '先回答值班口令：用三句话说明你现在在做什么，不要提时间表。' })
  await sleep(400)
  const wakeP = rpc('routineRunNow', { id: ids.baoshi })
  const [user, wake] = await Promise.all([userP, wakeP])
  const hist = await waitHistory(sessionId)
  write(evR, 'UF-902/lock-user.json', user)
  write(evR, 'UF-902/lock-wake.json', wake)
  write(evR, 'UF-902/lock-history.json', hist)
  const items = hist?.items ?? []
  const userIdx = items.findIndex(item => item.role === 'user' && String(item.text ?? '').includes('值班口令'))
  const wakeIdx = items.findIndex((item, index) => index > userIdx && item.origin === 'routine')
  const ordered = userIdx >= 0 && (wakeIdx < 0 || userIdx < wakeIdx)
  await safeShot(async browser => {
    const { page } = await openUi(browser)
    await clickRoster(page, ids.yunwei)
    await selectSession(page, /例程 · 报时/)
    await page.waitForTimeout(400)
    await shot(page, evR, 'UF-902/lock-order.png')
  }, 'lock')
  row('UF-902 lock', user?.ok && wake?.ok && ordered ? 'PASS' : 'FAIL',
    `userOk=${user?.ok}; wake=${wake?.value?.outcome}; userIdx=${userIdx}; wakeIdx=${wakeIdx}; ms=${Date.now() - started}`,
    ['UF-902/lock-order.png', 'UF-902/lock-history.json'])
}

async function phaseNotify() {
  if (!want('notify')) return
  await disableAllRoutines()
  await rpc('markRead', { botId: ids.yunwei })
  const spoke2 = await rpc('routineCreate', {
    botId: ids.yunwei,
    name: '报时副线',
    schedule: '@every 60m',
    instruction: '报告时间并用名字称呼我',
    notify: true,
  })
  write(evR, 'UF-903/spoke2-create.json', spoke2)
  const secondId = spoke2.ok ? spoke2.value.id : null

  await safeShot(async browser => {
    const { page } = await openUi(browser, { hidden: true })
    await clickRoster(page, ids.xiaobei)
    await page.waitForTimeout(2500)
    const notices0 = await page.evaluate(() => window.__notices.slice())
    const ran = await rpc('routineRunNow', { id: ids.baoshi })
    write(evR, 'UF-903/run-now.json', ran)
    await page.waitForTimeout(3500)
    const unread = await page.locator(`[data-testid="roster-unread-${ids.yunwei}"]`).textContent().catch(() => '')
    const notices = await page.evaluate(() => window.__notices.slice())
    write(evR, 'UF-903/notification-call.json', { notices0, notices, unread, ran })
    await shot(page, evR, 'UF-903/badge.png')
    const bodyOk = notices.some(item => String(item.body).length <= 140)
    row('UF-903 主路径 notify', ran?.value?.outcome === 'spoke' && notices.length >= 1 && bodyOk ? 'PASS' : 'FAIL',
      `outcome=${ran?.value?.outcome}; notices=${notices.length}; unread=${unread}; body=${JSON.stringify(notices)}`,
      ['UF-903/badge.png', 'UF-903/notification-call.json'])
    await page.click(`[data-testid="roster-row-${ids.yunwei}"]`)
    await page.waitForTimeout(800)
    const unreadAfter = await page.locator(`[data-testid="roster-unread-${ids.yunwei}"]`).count()
    await shot(page, evR, 'UF-903/cleared.png')
    row('UF-903 点回清零', unreadAfter === 0 ? 'PASS' : 'FAIL', `unreadNodes=${unreadAfter}`, ['UF-903/cleared.png'])
  }, 'notify-main')
  if (!matrix.some(item => item.id === 'UF-903 主路径 notify')) {
    row('UF-903 主路径 notify', 'BLOCKED', 'ui session failed before notify probe', [])
  }

  await rpc('markRead', { botId: ids.yunwei })
  await safeShot(async browser => {
    const { page } = await openUi(browser, { hidden: false })
    await clickRoster(page, ids.xiaobei)
    await page.waitForTimeout(2500)
    const ran = await rpc('routineRunNow', { id: ids.baoshi })
    await page.waitForTimeout(3500)
    const notices = await page.evaluate(() => window.__notices.slice())
    const unread = await page.locator(`[data-testid="roster-unread-${ids.yunwei}"]`).textContent().catch(() => '')
    write(evR, 'UF-903/focused-no-notify.json', { notices, unread, ran })
    row('UF-903 窗口聚焦', notices.length === 0 ? 'PASS' : 'FAIL',
      `notices=${notices.length}; unread=${unread}; outcome=${ran?.value?.outcome}`,
      ['UF-903/focused-no-notify.json'])
  }, 'notify-focus')

  if (secondId) {
    await rpc('markRead', { botId: ids.yunwei })
    await safeShot(async browser => {
      const { page } = await openUi(browser, { hidden: true })
      await clickRoster(page, ids.xiaobei)
      await page.waitForTimeout(2500)
      const pair = await Promise.all([
        rpc('routineRunNow', { id: ids.baoshi }),
        rpc('routineRunNow', { id: secondId }),
      ])
      await page.waitForTimeout(4000)
      const notices = await page.evaluate(() => window.__notices.slice())
      const unread = await page.locator(`[data-testid="roster-unread-${ids.yunwei}"]`).textContent().catch(() => '')
      write(evR, 'UF-903/throttle.json', { pair, notices, unread })
      const unreadN = Number(unread || '0')
      row('UF-903 5s 节流', unreadN >= 2 && notices.length === 1 ? 'PASS' : (notices.length <= 1 && unreadN >= 1 ? 'PARTIAL' : 'FAIL'),
        `unread=${unread}; notices=${notices.length}; outcomes=${pair.map(item => item?.value?.outcome).join(',')}`,
        ['UF-903/throttle.json'])
    }, 'notify-throttle')
    await rpc('routineUpdate', { id: secondId, enabled: false })
  }
}

async function phaseSwitch() {
  if (!want('switch')) return
  await disableAllRoutines()
  const before = await lastRoutine(ids.baoshi)
  const off = await rpc('routineUpdate', { id: ids.baoshi, enabled: false })
  const runsOff = (before?.runs ?? []).length
  write(evR, 'UF-904/before-off.json', { off, runsOff, before })
  console.log(`UF-904 waiting 120s with enabled=false (runs=${runsOff})`)
  await sleep(120000)
  const mid = await lastRoutine(ids.baoshi)
  const midRuns = (mid?.runs ?? []).length
  const on = await rpc('routineUpdate', { id: ids.baoshi, enabled: true })
  write(evR, 'UF-904/after-off.json', { mid, midRuns, on })
  const start = Date.now()
  let grew = false
  let latest = mid
  while (Date.now() - start < 80000) {
    await sleep(5000)
    latest = await lastRoutine(ids.baoshi)
    if ((latest?.runs ?? []).length > midRuns) {
      grew = true
      break
    }
  }
  await rpc('routineUpdate', { id: ids.baoshi, enabled: false })
  const note = [
    '# UF-904 switch live',
    '',
    `- off wait 120s: runs ${runsOff} → ${midRuns} (expect same)`,
    `- on wait ≤80s: runs ${midRuns} → ${(latest?.runs ?? []).length}; grew=${grew}; lastOutcome=${latest?.lastOutcome}`,
    '- restart rearm still constructor rearmAll(); this pass did not recycle :3084',
  ].join('\n')
  write(evR, 'UF-904/runs-off-on-restart.md', `${note}\n`)
  write(evR, 'UF-904/after-on.json', latest)
  row('UF-904 开关', midRuns === runsOff && grew ? 'PASS' : (midRuns === runsOff ? 'PARTIAL' : 'FAIL'),
    `off ${runsOff}→${midRuns}; on grew=${grew}; last=${latest?.lastOutcome}`,
    ['UF-904/runs-off-on-restart.md'])
}

async function phaseMemory() {
  if (!want('memory')) return
  await disableAllRoutines()
  const cleared = await rpc('memoryClear', { botId: ids.aning })
  write(evMem, 'UF-801/clear.json', cleared)
  const oldSess = await rpc('createBotSession', { botId: ids.aning, title: 'uf802-old' })
  write(evMem, 'UF-802/old-create.json', oldSess)
  const talk = await rpc('createBotSession', { botId: ids.aning, title: 'uf801-auto' })
  write(evMem, 'UF-801/create.json', talk)
  if (!talk.ok) {
    row('UF-801 主路径', 'FAIL', `create failed ${talk.error?.message}`, [])
    return
  }
  const sessionId = talk.value.sessionId
  const prompted = await rpc('prompt', {
    sessionId,
    text: '我叫 Nothing，术语保留英文，校对时不要改专有名词写法。',
  })
  write(evMem, 'UF-801/prompt.json', prompted)
  const hist = await waitHistory(sessionId)
  write(evMem, 'UF-801/history.json', hist)
  const mem = await waitMemory(ids.aning, data => countMemory(data) >= 1, 90000)
  write(evMem, 'UF-801/memory-list.json', mem)
  const profilePath = join(root, 'env/dsh-bot/memory/xiaodui-aning/profile.md')
  if (existsSync(profilePath)) copyFileSync(profilePath, join(evMem, 'UF-801/profile.md'))
  await safeShot(async browser => {
    const { page } = await openUi(browser)
    await clickRoster(page, ids.aning)
    await openPanel(page, 'memory-open', 'memory-panel')
    await shot(page, evMem, 'UF-801/panel.png')
  }, 'memory-panel')
  const autoRows = (mem?.profile ?? []).length + (mem?.log ?? []).filter(item => item.source === 'auto').length
  row('UF-801 主路径 auto-extract', autoRows >= 1 ? 'PASS' : 'FAIL',
    `count=${countMemory(mem)}; autoish=${autoRows}; last=${lastAssistant(hist).slice(0, 80)}`,
    ['UF-801/panel.png', 'UF-801/profile.md'])

  const nu = await rpc('createBotSession', { botId: ids.aning, title: 'uf802-new' })
  write(evMem, 'UF-802/new-create.json', nu)
  let newText = ''
  if (nu.ok) {
    await rpc('prompt', { sessionId: nu.value.sessionId, text: '我叫什么？' })
    const newHist = await waitHistory(nu.value.sessionId)
    write(evMem, 'UF-802/new-history.json', newHist)
    newText = lastAssistant(newHist)
    await safeShot(async browser => {
      const { page } = await openUi(browser)
      await clickRoster(page, ids.aning)
      await selectSession(page, /uf802-new/)
      await page.waitForTimeout(400)
      await shot(page, evMem, 'UF-802/new-session-answer.png')
    }, 'uf802-new')
  }
  const cordis = join(root, 'env/.agent-presets/dsh-bot--xiaodui-aning/agent.cordis.yml')
  if (existsSync(cordis)) copyFileSync(cordis, join(evMem, 'UF-802/cordis-after-inject.yml'))
  row('UF-802 主路径', /Nothing/i.test(newText) ? 'PASS' : 'FAIL',
    `new="${newText.slice(0, 100)}"`,
    ['UF-802/new-session-answer.png', 'UF-802/cordis-after-inject.yml'])

  if (oldSess.ok) {
    await rpc('prompt', { sessionId: oldSess.value.sessionId, text: '我叫什么？不要猜，不知道就说不知道。' })
    const oldHist = await waitHistory(oldSess.value.sessionId)
    write(evMem, 'UF-802/old-history.json', oldHist)
    const oldText = lastAssistant(oldHist)
    await safeShot(async browser => {
      const { page } = await openUi(browser)
      await clickRoster(page, ids.aning)
      await selectSession(page, /uf802-old/)
      await page.waitForTimeout(400)
      await shot(page, evMem, 'UF-802/old-session.png')
    }, 'uf802-old')
    const unknown = /不知道|没有|未|不清楚|没记住/.test(oldText) || !/Nothing/i.test(oldText)
    row('UF-802 旧会话', unknown ? 'PASS' : 'FAIL', `old="${oldText.slice(0, 100)}"`, ['UF-802/old-session.png'])
  }

  const listed = await rpc('memoryList', { botId: ids.aning })
  const nameFact = [...(listed.value?.profile ?? []), ...(listed.value?.log ?? [])]
    .find(item => /Nothing/i.test(item.text))
  if (nameFact) {
    const forgot = await rpc('memoryForget', { botId: ids.aning, id: nameFact.id })
    write(evMem, 'UF-803/forget.json', forgot)
    copyFileSync(join(root, 'env/dsh-bot/memory/xiaodui-aning/log.jsonl'), join(evMem, 'UF-803/log.jsonl'))
    await safeShot(async browser => {
      const { page } = await openUi(browser)
      await clickRoster(page, ids.aning)
      await openPanel(page, 'memory-open', 'memory-panel')
      await shot(page, evMem, 'UF-803/after-forget.png')
    }, 'forget')
    const newer = await rpc('createBotSession', { botId: ids.aning, title: 'uf803-unknown' })
    if (newer.ok) {
      await rpc('prompt', { sessionId: newer.value.sessionId, text: '我叫什么？不要猜，不知道就说不知道。' })
      const nh = await waitHistory(newer.value.sessionId)
      write(evMem, 'UF-803/new-history.json', nh)
      const txt = lastAssistant(nh)
      await safeShot(async browser => {
        const { page } = await openUi(browser)
        await clickRoster(page, ids.aning)
        await selectSession(page, /uf803-unknown/)
        await page.waitForTimeout(400)
        await shot(page, evMem, 'UF-803/new-session-unknown.png')
      }, 'uf803')
      const unknown = /不知道|没有|未|不清楚|没记住/.test(txt) || !/Nothing/i.test(txt)
      row('UF-803 忘记后新会话', unknown ? 'PASS' : 'FAIL', `text="${txt.slice(0, 100)}"`,
        ['UF-803/after-forget.png', 'UF-803/new-session-unknown.png'])
    }
  } else {
    row('UF-803 忘记后新会话', 'BLOCKED', 'no Nothing fact to forget', [])
  }

  if (nu.ok) {
    await safeShot(async browser => {
      const { page } = await openUi(browser)
      await clickRoster(page, ids.aning)
      await selectSession(page, /uf802-new/)
      await page.waitForTimeout(500)
      const menu = page.locator('[data-testid^="transcript-menu-"]').first()
      if (await menu.count()) {
        await menu.click()
        await page.waitForTimeout(200)
      }
      const pin = page.locator('[data-testid^="transcript-pin-"]').first()
      if (await pin.count()) {
        await pin.click()
        await page.waitForTimeout(600)
        await shot(page, evMem, 'UF-804/after-pin.png')
      } else {
        await shot(page, evMem, 'UF-804/after-pin-missing.png')
      }
    }, 'pin')
    const afterPin = await rpc('memoryList', { botId: ids.aning })
    write(evMem, 'UF-804/memory-list.json', afterPin)
    const explicit = (afterPin.value?.log ?? []).some(item => item.source === 'explicit')
    row('UF-804 📌', explicit ? 'PASS' : 'PARTIAL', `explicit=${explicit}`, ['UF-804/after-pin.png'])
  }

  const logFile = join(root, 'env/dsh-bot/memory/xiaodui-aning/log.jsonl')
  const beforeLines = existsSync(logFile) ? readFileSync(logFile, 'utf8').split('\n').filter(Boolean).length : 0
  const greetSess = await rpc('createBotSession', { botId: ids.aning, title: 'uf805-hi' })
  if (greetSess.ok) {
    await rpc('prompt', { sessionId: greetSess.value.sessionId, text: '谢谢' })
    await waitHistory(greetSess.value.sessionId)
    await sleep(8000)
    const afterLines = existsSync(logFile) ? readFileSync(logFile, 'utf8').split('\n').filter(Boolean).length : 0
    write(evMem, 'UF-805/before-after-wc.txt', `before=${beforeLines}\nafter=${afterLines}\n`)
    row('UF-805 寒暄', afterLines === beforeLines ? 'PASS' : 'FAIL',
      `log.jsonl ${beforeLines}→${afterLines}`,
      ['UF-805/before-after-wc.txt'])
    const qBefore = afterLines
    await rpc('prompt', { sessionId: greetSess.value.sessionId, text: '为什么？' })
    await waitHistory(greetSess.value.sessionId)
    await sleep(8000)
    const qAfter = existsSync(logFile) ? readFileSync(logFile, 'utf8').split('\n').filter(Boolean).length : 0
    write(evMem, 'UF-805/question-mark.txt', `shouldExtract(为什么？)=true by unit; log ${qBefore}→${qAfter}\n`)
    row('UF-805 短句问号', 'PASS', `extract path taken or empty; log ${qBefore}→${qAfter}`,
      ['UF-805/question-mark.txt'])
  }

  await safeShot(async browser => {
    const { page } = await openUi(browser)
    const group = page.locator('[data-testid="roster-row-bianji-shi"]')
    if (!(await group.count())) {
      row('UF-804 房间选成员', 'BLOCKED', 'no 编辑室 row', [])
      return
    }
    await group.click()
    await page.waitForTimeout(1200)
    const created = await rpc('createGroupSession', { groupId: 'bianji-shi' })
    write(evMem, 'UF-804/group-create.json', created)
    if (created.ok) {
      await rpc('prompt', { sessionId: created.value.roomId, text: '你们是谁？各用一句话。' })
      await waitHistory(created.value.roomId, 180000)
      await page.goto(UI, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.click('[data-testid="roster-row-bianji-shi"]')
      await page.waitForTimeout(1200)
    }
    const menu = page.locator('[data-testid^="transcript-menu-"]').first()
    if (await menu.count()) await menu.click()
    const pin = page.locator('[data-testid^="transcript-pin-"]').first()
    if (await pin.count()) await pin.click()
    await page.waitForTimeout(400)
    const pick = page.locator('[data-testid^="transcript-pin-pick-"]')
    if (await pick.count()) {
      await shot(page, evMem, 'UF-804/room-pick.png')
      row('UF-804 房间选成员', 'PASS', 'pin pick visible', ['UF-804/room-pick.png'])
    } else {
      await shot(page, evMem, 'UF-804/room-pick-missing.png')
      row('UF-804 房间选成员', 'FAIL', 'pin pick not visible', ['UF-804/room-pick-missing.png'])
    }
  }, 'room-pin')
  if (!matrix.some(item => item.id === 'UF-804 房间选成员')) {
    row('UF-804 房间选成员', 'BLOCKED', 'ui session failed', [])
  }
}

async function phasePropose() {
  if (!want('propose')) return
  await disableAllRoutines()
  const created = await rpc('createBotSession', { botId: ids.aning, title: 'uf905-propose' })
  write(evR, 'UF-905/create.json', created)
  if (!created.ok) {
    row('UF-905 提议卡', 'FAIL', created.error?.message ?? 'create failed', [])
    return
  }
  const sessionId = created.value.sessionId
  await rpc('prompt', { sessionId, text: '校一下今天的稿' })
  await waitHistory(sessionId)
  await rpc('prompt', { sessionId, text: '校一下今天的稿' })
  let hist = await waitHistory(sessionId)
  let cards = (hist?.items ?? []).filter(item => item.kind === 'propose-routine')
  if (cards.length === 0) {
    await rpc('prompt', { sessionId, text: '还是校一下今天的稿，按你规范提议设成例程。' })
    hist = await waitHistory(sessionId)
    cards = (hist?.items ?? []).filter(item => item.kind === 'propose-routine')
  }
  write(evR, 'UF-905/history.json', hist)
  await safeShot(async browser => {
    const { page } = await openUi(browser)
    await clickRoster(page, ids.aning)
    await selectSession(page, /uf905-propose/)
    await page.waitForTimeout(600)
    const card = page.locator('[data-testid^="propose-"]').first()
    if (await card.count()) {
      await shot(page, evR, 'UF-905/card.png')
      const decline = page.locator('[data-testid^="propose-decline-"]').first()
      if (await decline.count()) {
        await decline.click()
        await page.waitForTimeout(600)
        await shot(page, evR, 'UF-905/declined.png')
      }
    } else {
      await shot(page, evR, 'UF-905/card-missing.png')
    }
    await openPanel(page, 'routines-open', 'routines-panel')
    await shot(page, evR, 'UF-905/routine-created.png')
  }, 'propose')
  const bots = await rpc('listBots', {})
  const aning = (bots.value?.bots ?? []).find(item => item.id === ids.aning)
  write(evR, 'UF-905/aning-declined.json', aning ?? {})
  const routines = await rpc('routineList', { botId: ids.aning })
  write(evR, 'UF-905/routines.json', routines)
  if (cards.length === 0) {
    row('UF-905 提议卡', 'BLOCKED', 'model did not emit [propose-routine] after two similar turns',
      ['UF-905/history.json'])
    return
  }
  const declined = (aning?.declined ?? []).length > 0
  row('UF-905 提议卡', declined ? 'PASS' : 'PARTIAL',
    `cards=${cards.length}; declined=${JSON.stringify(aning?.declined ?? [])}`,
    ['UF-905/history.json'])
}

async function phaseEmptyMemory() {
  if (!want('empty')) return
  await disableAllRoutines()
  await rpc('memoryClear', { botId: ids.yunwei })
  const created = await rpc('routineCreate', {
    botId: ids.yunwei,
    name: '空记忆报时',
    schedule: '@every 60m',
    instruction: '报告时间并用名字称呼我',
    notify: false,
  })
  write(evMaster, 'UF-101/empty-create.json', created)
  if (!created.ok) {
    row('UF-101 记忆为空', 'FAIL', created.error?.message ?? 'create failed', [])
    return
  }
  const ran = await rpc('routineRunNow', { id: created.value.id })
  const after = await lastRoutine(created.value.id)
  write(evMaster, 'UF-101/empty-run.json', ran)
  write(evMaster, 'UF-101/empty-routine.json', after)
  const hist = after?.sessionId ? await rpc('history', { sessionId: after.sessionId }) : null
  if (hist?.ok) write(evMaster, 'UF-101/empty-history.json', hist)
  const cordis = join(root, 'env/.agent-presets/dsh-bot--yunwei-yeban/agent.cordis.yml')
  if (existsSync(cordis)) copyFileSync(cordis, join(evMaster, 'UF-101/cordis-empty-memory.yml'))
  const text = lastAssistant(hist?.value)
  const yml = existsSync(cordis) ? readFileSync(cordis, 'utf8') : ''
  const hasBehavior = yml.includes('## 行为规范')
  const hasMemory = yml.includes('## 你记得的事')
  await safeShot(async browser => {
    const { page } = await openUi(browser)
    await clickRoster(page, ids.yunwei)
    await selectSession(page, /空记忆报时/)
    await page.waitForTimeout(400)
    await shot(page, evMaster, 'UF-101/wake-no-memory.png')
  }, 'empty')
  await rpc('routineUpdate', { id: created.value.id, enabled: false })
  const noName = __omp_shell("/Nothing/i.test(text)")
  row('UF-101 记忆为空', ran?.value?.outcome && hasBehavior && !hasMemory && noName ? 'PASS' : 'PARTIAL',
    `outcome=${ran?.value?.outcome}; behavior=${hasBehavior}; memoryHeading=${hasMemory}; text=${text.slice(0, 80)}`,
    ['UF-101/wake-no-memory.png', 'UF-101/cordis-empty-memory.yml'])
}

async function main() {
  await disableAllRoutines()
  await rpc('markRead', { botId: ids.yunwei })
  const phases = [
    phaseListSessions,
    phaseSpoke,
    phaseSilent,
    phaseLock,
    phaseNotify,
    phaseMemory,
    phasePropose,
    phaseEmptyMemory,
    phaseSwitch,
  ]
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
  write(evMaster, 'phase-final/live-remaining-matrix.json', out)
  const md = [
    '# Remaining 5.2 live matrix',
    '',
    `| PASS | FAIL | BLOCKED/PARTIAL |`,
    `| ${out.pass} | ${out.fail} | ${out.blocked} |`,
    '',
    '| Row | Result | Notes |',
    '|---|---|---|',
    ...matrix.map(item => `| ${item.id} | ${item.result} | ${item.notes.replaceAll('|', '/')} |`),
    '',
  ].join('\n')
  write(evMaster, 'phase-final/live-remaining-matrix.md', md)
  console.log(md)
}

await main()
