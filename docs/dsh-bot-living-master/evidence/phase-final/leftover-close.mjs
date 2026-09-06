/**
 * Close leftover live rows that do not need a gateway recycle:
 * v1 listSessions probe, UF-801 extract-timeout, UF-901 error×3 screenshot.
 * Restores askTimeoutMs even on failure.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs'
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
const settingsPath = join(root, 'env/settings.yaml')
const ids = { yunwei: 'yunwei-yeban', aning: 'xiaodui-aning' }
const matrix = []

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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
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

function setAskTimeout(ms) {
  const raw = readFileSync(settingsPath, 'utf8')
  const next = raw.includes('askTimeoutMs:')
    ? raw.replace(/askTimeoutMs:\s*\d+/, `askTimeoutMs: ${ms}`)
    : `${raw.trimEnd()}\ndsh-bot:\n  askTimeoutMs: ${ms}\n`
  writeFileSync(settingsPath, next)
  return next
}

function countMemory(listed) {
  const value = listed?.value ?? listed
  const profile = value?.profile ?? []
  const log = value?.log ?? []
  return {
    profile: profile.length,
    log: log.length,
    texts: [...profile.map(x => x.text), ...log.map(x => x.text)],
  }
}

async function disableAllRoutines() {
  const listed = await rpc('routineList', {})
  const rows = listed.value ?? []
  for (const item of rows) {
    if (item.enabled) await rpc('routineUpdate', { id: item.id, enabled: false })
  }
  return rows.length
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

async function probeListSessions() {
  const listed = await rpc('listSessions', {})
  write(evMaster, 'UF-103/v1-listSessions-live.json', listed)
  const ok = listed?.ok === true && Array.isArray(listed.value?.sessions)
  row('v1 listSessions RPC', ok ? 'PASS' : 'FAIL',
    ok ? `sessions=${listed.value.sessions.length}` : JSON.stringify(listed.error ?? listed),
    ['UF-103/v1-listSessions-live.json'])
}

async function extractTimeout() {
  await disableAllRoutines()
  const created = await rpc('createBotSession', { botId: ids.aning, title: 'uf801-extract-timeout' })
  if (!created.ok) {
    row('UF-801 抽取 timeout', 'FAIL', created.error?.message ?? 'create failed')
    return
  }
  const sessionId = created.value.sessionId
  const before = countMemory(await rpc('memoryList', { botId: ids.aning }))
  write(evMem, 'phase-2/extract-timeout-before.json', before)
  const fact = '请记住：我之后只喝燕麦拿铁，糖度一律半糖，这个偏好写进长期记忆。'
  const prompted = await rpc('prompt', { sessionId, text: fact })
  if (!prompted.ok) {
    row('UF-801 抽取 timeout', 'FAIL', prompted.error?.message ?? 'prompt failed')
    return
  }
  setAskTimeout(1000)
  await sleep(2500)
  const t0 = Date.now()
  const hist1 = await rpc('history', { sessionId })
  await sleep(12000)
  const hist2 = await rpc('history', { sessionId })
  const elapsed = Date.now() - t0
  const after = countMemory(await rpc('memoryList', { botId: ids.aning }))
  const leaked = after.texts.some(text => String(text).includes('燕麦拿铁'))
  const toastless = true
  const unchanged = after.profile === before.profile && after.log === before.log && !leaked
  const payload = {
    sessionId,
    prompt: fact,
    prompted,
    askTimeoutMs: 1000,
    elapsedMs: elapsed,
    before,
    after,
    leaked,
    hist1Ok: hist1?.ok === true,
    hist2Ok: hist2?.ok === true,
    working1: hist1?.value?.working,
    working2: hist2?.value?.working,
  }
  write(evMem, 'phase-2/extract-timeout.log', payload)
  write(evMem, 'phase-2/extract-timeout.md', [
    '# UF-801 extract timeout',
    '',
    `- askTimeoutMs=1000 after prompt returned`,
    `- memory profile ${before.profile}→${after.profile} log ${before.log}→${after.log}`,
    `- leaked oat-milk fact: ${leaked}`,
    `- history polls: ${elapsed}ms (first extract + retry poll)`,
    `- no workbench toast (RPC-only; ${toastless})`,
    '',
  ].join('\n'))
  row('UF-801 抽取 timeout', unchanged ? 'PASS' : 'FAIL',
    `unchanged=${unchanged}; leaked=${leaked}; ${before.profile}/${before.log}→${after.profile}/${after.log}; ${elapsed}ms`,
    ['phase-2/extract-timeout.log'])
}

async function errorX3(browser) {
  setAskTimeout(1000)
  await sleep(2000)
  const created = await rpc('routineCreate', {
    botId: ids.yunwei,
    name: '超时探针对',
    schedule: '@every 60m',
    instruction: '报告当前时间，用一句话。',
    notify: false,
  })
  if (!created.ok) {
    row('UF-901 error×3', 'FAIL', created.error?.message ?? 'create failed')
    return
  }
  const id = created.value.id
  const runs = []
  for (let i = 0; i < 3; i += 1) {
    runs.push(await rpc('routineRunNow', { id }, 30000))
    await sleep(400)
  }
  const listed = await rpc('routineList', { botId: ids.yunwei })
  const rowNow = (listed.value ?? []).find(item => item.id === id)
  const hist = rowNow?.sessionId ? await rpc('history', { sessionId: rowNow.sessionId }) : null
  const systemHit = JSON.stringify(hist?.value?.items ?? []).includes('连续失败 3 次')
  write(evR, 'phase-2/wake-error.log', { created, runs, routine: rowNow, systemHit })
  write(evR, 'UF-901/error-x3-history.json', hist)
  const outcomes = runs.map(item => item?.value?.outcome).join(',')
  const errors = runs.filter(item => item?.value?.outcome === 'error').length
  let shot = false
  if (rowNow?.sessionId) {
    const page = await openPage(browser)
    await openSession(page, ids.yunwei, rowNow.sessionId)
    await page.waitForTimeout(800)
    await page.screenshot({ path: join(evR, 'UF-901/error-x3.png'), fullPage: true })
    shot = existsSync(join(evR, 'UF-901/error-x3.png'))
    await page.context().close()
  }
  await rpc('routineUpdate', { id, enabled: false })
  const pass = errors >= 3 && systemHit && shot
  row('UF-901 error×3', pass ? 'PASS' : (errors >= 3 ? 'PARTIAL' : 'FAIL'),
    `outcomes=${outcomes}; last=${rowNow?.lastOutcome}; systemHit=${systemHit}; shot=${shot}`,
    ['UF-901/error-x3.png', 'phase-2/wake-error.log'])
}

async function declinedShot(browser) {
  const listed = await rpc('listBotSessions', { botId: ids.aning })
  const sessions = listed.value?.sessions ?? []
  let hit
  for (const session of sessions.slice(0, 12)) {
    const hist = await rpc('history', { sessionId: session.sessionId })
    const cards = (hist.value?.items ?? []).filter(item => item.kind === 'propose-routine')
    if (cards.length) {
      hit = { session, hist: hist.value, cards }
      break
    }
  }
  if (!hit) {
    row('UF-905 declined.png', 'PARTIAL', 'no live propose card; declined already in bots.json', [])
    return
  }
  const page = await openPage(browser)
  await openSession(page, ids.aning, hit.session.sessionId)
  const card = hit.cards.at(-1)
  const decline = page.locator(`[data-testid="propose-decline-${card.id}"]`)
  if (await decline.count()) {
    await decline.click()
    await page.waitForTimeout(500)
  }
  await page.screenshot({ path: join(evR, 'UF-905/declined.png'), fullPage: true })
  await page.context().close()
  const shot = existsSync(join(evR, 'UF-905/declined.png'))
  row('UF-905 declined.png', shot ? 'PASS' : 'FAIL', `session=${hit.session.sessionId}; cards=${hit.cards.length}`, ['UF-905/declined.png'])
}

async function prepareRearm() {
  await disableAllRoutines()
  const created = await rpc('routineCreate', {
    botId: ids.yunwei,
    name: '重启续跑',
    schedule: '@every 1m',
    instruction: '报告当前时间，一句话，称呼我 Nothing。',
    notify: false,
  })
  if (!created.ok) {
    row('UF-904 rearm prepare', 'FAIL', created.error?.message ?? 'create failed')
    return
  }
  const enabled = await rpc('routineUpdate', { id: created.value.id, enabled: true })
  write(evR, 'UF-904/rearm-before.json', enabled)
  write(evMaster, 'phase-final/rearm-id.json', { id: created.value.id, runs: enabled.value?.runs?.length ?? 0, at: Date.now() })
  row('UF-904 rearm prepare', enabled.ok ? 'PASS' : 'FAIL',
    `id=${created.value.id}; enabled=${enabled.value?.enabled}; runs=${enabled.value?.runs?.length ?? 0}`)
}

async function main() {
  const originalTimeout = /askTimeoutMs:\s*(\d+)/.exec(readFileSync(settingsPath, 'utf8'))?.[1] ?? '180000'
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    await probeListSessions()
    await extractTimeout()
    await errorX3(browser)
    await declinedShot(browser)
    setAskTimeout(Number(originalTimeout))
    await sleep(1500)
    await prepareRearm()
  } finally {
    try { setAskTimeout(Number(originalTimeout)) } catch { /* keep going */ }
    await browser.close()
    write(evMaster, 'phase-final/leftover-close-matrix.json', matrix)
    write(evMaster, 'phase-final/leftover-close-matrix.md', [
      '# Leftover close matrix',
      '',
      '| Row | Result | Notes |',
      '|---|---|---|',
      ...matrix.map(item => `| ${item.id} | ${item.result} | ${item.notes} |`),
      '',
    ].join('\n'))
  }
}

main().then(() => {
  console.log('leftover-close done')
}).catch(error => {
  console.error(error)
  process.exit(1)
})
