#!/usr/bin/env node
/** Task 1 GUI probe: ASM-401 sessions.open ×3, ASM-402 iframe postMessage. Temp tab face __dshBotNavCalib. */
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

const require = createRequire(import.meta.url)
const { chromium } = require('/tmp/pw-dsh-nav/node_modules/playwright')
const HERE = dirname(fileURLToPath(import.meta.url))
const IDS = {
  visible: 'session-17bec9cb-14db-469e-9517-8a03ae4ac1d5',
  hidden: 'session-974c0fc9-afa6-4a7c-a316-d0186ba7fd42',
  archived: 'session-f3d91875-899a-4411-835c-4356c952d32c',
}

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--disable-gpu', '--no-first-run', '--disable-dev-shm-usage'],
})
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
const log = []

async function snap(name) {
  const path = join(HERE, name)
  await page.screenshot({ path, fullPage: true })
  return path
}

function dumpButtons() {
  return page.evaluate(() => [...document.querySelectorAll('button, [role="menuitem"], [role="tab"], [role="option"]')].map((el) => ({
    tag: el.tagName,
    text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
    title: el.getAttribute('title') || '',
    aria: el.getAttribute('aria-label') || '',
    testid: el.getAttribute('data-testid') || '',
    vis: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
  })).filter((b) => /DSH|侧边|标签|底部|Bot|会话/.test(`${b.text}${b.title}${b.aria}`)))
}

await page.goto('http://127.0.0.1:3084/', { waitUntil: 'domcontentloaded', timeout: 45000 })
await delay(2000)
log.push({ step: 'load', buttons: await dumpButtons() })
await snap('asm401-load.png')

const expandBottom = page.getByRole('button', { name: '展开底部面板' })
if (await expandBottom.count()) await expandBottom.first().click().catch(() => {})
await delay(400)
const expandSide = page.getByRole('button', { name: '展开侧边栏' })
if (await expandSide.count()) await expandSide.first().click().catch(() => {})
await delay(400)
const plus = page.getByTitle('新建标签页')
if (await plus.count()) await plus.last().click().catch(() => {})
await delay(500)
await page.evaluate(() => {
  const nodes = [...document.querySelectorAll('button, [role="menuitem"], [role="option"], [role="tab"]')]
  const hit = nodes.find((el) => {
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim()
    if (!text.startsWith('DSH Bot')) return false
    const title = el.getAttribute('title') || ''
    return !title.includes('预设')
  })
  hit?.click()
})
await delay(800)
log.push({ step: 'clicked-dsh-bot', buttons: await dumpButtons() })

let iframeOk = false
try {
  await page.getByTestId('dsh-bot-iframe').waitFor({ timeout: 20000 })
  iframeOk = true
} catch (error) {
  log.push({ step: 'iframe-wait-failed', message: String(error) })
}
await snap('asm402-tab.png')

const calibReady = await page.evaluate(() => typeof window.__dshBotNavCalib === 'object' && window.__dshBotNavCalib !== null)
log.push({ step: 'calib-face', iframeOk, calibReady })

if (iframeOk) {
  const posted = await page.evaluate(() => {
    const iframe = document.querySelector('[data-testid="dsh-bot-iframe"]')
    if (!(iframe instanceof HTMLIFrameElement) || iframe.contentWindow === null) {
      return { ok: false, reason: 'no-iframe-window' }
    }
    const origin = location.origin
    try {
      const fn = iframe.contentWindow.Function
      fn(`window.parent.postMessage({type:'dsh-bot:calib-402',from:'iframe-fn',t:Date.now()}, ${JSON.stringify(origin)})`)()
      return { ok: true, via: 'iframe-Function', iframeOrigin: iframe.contentWindow.location.origin }
    } catch (error) {
      return { ok: false, reason: String(error) }
    }
  })
  await delay(400)
  const afterFn = await page.evaluate(() => {
    const face = window.__dshBotNavCalib
    return {
      ready: typeof face === 'object' && face !== null,
      messages: face?.messages ?? [],
    }
  })
  log.push({ step: 'asm402-iframe-fn', posted, afterFn })

  if (!afterFn.messages.some((m) => m.type === 'dsh-bot:calib-402')) {
    await page.evaluate(() => {
      const iframe = document.querySelector('[data-testid="dsh-bot-iframe"]')
      if (iframe instanceof HTMLIFrameElement) iframe.src = '/dsh-bot/calib-nav'
    })
    await delay(1200)
    const afterSrc = await page.evaluate(() => ({
      iframeSrc: document.querySelector('[data-testid="dsh-bot-iframe"]')?.getAttribute('src'),
      messages: window.__dshBotNavCalib?.messages ?? [],
    }))
    log.push({ step: 'asm402-iframe-src-calib-nav', afterSrc })
    await snap('asm402-calib-nav.png')
  }
}

async function remountTab() {
  const plus = page.getByTitle('新建标签页')
  if (await plus.count()) await plus.last().click().catch(() => {})
  await delay(300)
  await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('button, [role="menuitem"], [role="option"], [role="tab"]')]
    const hit = nodes.find((el) => {
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim()
      if (!text.startsWith('DSH Bot')) return false
      const title = el.getAttribute('title') || ''
      return !title.includes('预设')
    })
    hit?.click()
  })
  await page.getByTestId('dsh-bot-iframe').waitFor({ timeout: 15000 }).catch(() => {})
  await delay(600)
  return page.evaluate(() => typeof window.__dshBotNavCalib === 'object' && window.__dshBotNavCalib !== null)
}

const jumps = {}
for (const [kind, id] of Object.entries(IDS)) {
  const remounted = await remountTab()
  const result = await page.evaluate((sessionId) => {
    const s = window.__dshBotNavSessions
    const face = window.__dshBotNavCalib
    const snap = () => {
      const list = s?.list?.getSnapshot?.()
      return { current: list?.current, hasId: list?.byId !== undefined && sessionId in list.byId }
    }
    const before = snap()
    let jump
    let openOnly
    let liveOpen
    let error
    try {
      if (face !== undefined) {
        jump = face.jump(sessionId)
        openOnly = face.openOnly(sessionId)
      } else if (s?.open !== undefined) {
        s.open(sessionId)
        liveOpen = { ok: true }
      } else {
        error = 'no-sessions-open'
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    }
    return { before, jump, openOnly, liveOpen, error, mid: snap() }
  }, id)
  await delay(1800)
  for (const name of ['展开其余']) {
    const loc = page.getByText(name, { exact: false })
    if (await loc.count()) {
      const n = await loc.count()
      for (let i = 0; i < n; i++) await loc.nth(i).click().catch(() => {})
    }
  }
  await delay(400)
  const after = await page.evaluate((sessionId) => {
    const list = window.__dshBotNavSessions?.list?.getSnapshot?.()
    return { current: list?.current, hasId: list?.byId !== undefined && sessionId in list.byId }
  }, id)
  const body = await page.locator('body').innerText()
  const shot = await snap(`asm401-${kind}.png`)
  jumps[kind] = {
    id,
    remounted,
    result,
    after,
    currentIsTarget: after?.current === id,
    bodyHasVisible: body.includes('calib-nav-visible'),
    bodyHasHidden: body.includes('calib-nav-hidden') || body.includes('~ calib-nav-hidden'),
    bodyHasArchived: body.includes('calib-nav-archived'),
    bodySnippet: body.replace(/\s+/g, ' ').slice(0, 800),
    shot,
  }
  log.push({ step: `jump-${kind}`, ...jumps[kind] })
}

writeFileSync(join(HERE, 'calib-browser.json'), JSON.stringify({ iframeOk, calibReady, jumps, log }, null, 2))
console.log(JSON.stringify({ iframeOk, calibReady, jumps: Object.fromEntries(Object.entries(jumps).map(([k, v]) => [k, {
  remounted: v.remounted,
  used: v.result?.jump?.used,
  jumped: v.result?.jump?.jumped,
  openOnly: v.result?.openOnly,
  error: v.result?.error,
  before: v.result?.before,
  mid: v.result?.mid,
  after: v.after,
  currentIsTarget: v.currentIsTarget,
  bodyHasVisible: v.bodyHasVisible,
  bodyHasHidden: v.bodyHasHidden,
  bodyHasArchived: v.bodyHasArchived,
}])), messages: log.filter((x) => x.step?.startsWith('asm402')) }, null, 2))
await browser.close()
if (!iframeOk || !calibReady) process.exit(2)
