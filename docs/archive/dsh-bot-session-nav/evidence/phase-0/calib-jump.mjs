#!/usr/bin/env node
/** ASM-401: ctx.sessions.open via persistent apply() hook, no remount between jumps. */
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
await page.goto('http://127.0.0.1:3084/', { waitUntil: 'domcontentloaded', timeout: 30000 })
await delay(1500)

const expandBottom = page.getByRole('button', { name: '展开底部面板' })
if (await expandBottom.count()) await expandBottom.first().click().catch(() => {})
await delay(300)
const plus = page.getByTitle('新建标签页')
if (await plus.count()) await plus.last().click().catch(() => {})
await delay(300)
await page.evaluate(() => {
  const nodes = [...document.querySelectorAll('button, [role="menuitem"], [role="option"], [role="tab"]')]
  const hit = nodes.find((el) => {
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim()
    if (!text.startsWith('DSH Bot')) return false
    return !(el.getAttribute('title') || '').includes('预设')
  })
  hit?.click()
})
await delay(2000)

const hook = await page.evaluate(() => ({
  hasSessions: typeof window.__dshBotNavSessions === 'object' && window.__dshBotNavSessions !== null,
  hasCalib: typeof window.__dshBotNavCalib === 'object' && window.__dshBotNavCalib !== null,
  hasOpen: typeof window.__dshBotNavSessions?.open === 'function',
}))

const jumps = {}
for (const [kind, id] of Object.entries(IDS)) {
  const result = await page.evaluate((sessionId) => {
    const s = window.__dshBotNavSessions
    const before = s?.list?.getSnapshot?.()?.current
    let error
    let jumped = false
    let used = 'none'
    try {
      const address = s?.subagentAddress?.(sessionId)
      if (typeof s?.open === 'function') {
        s.open(sessionId)
        jumped = true
        used = 'open'
      }
      return {
        jumped,
        used,
        addressType: address === undefined ? 'undefined' : typeof address,
        before,
        afterSync: s?.list?.getSnapshot?.()?.current,
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
      return { jumped, used, error, before }
    }
  }, id)
  await delay(1200)
  const after = await page.evaluate(() => window.__dshBotNavSessions?.list?.getSnapshot?.()?.current)
  const body = await page.locator('body').innerText()
  const shot = join(HERE, `asm401-${kind}-open.png`)
  await page.screenshot({ path: shot, fullPage: true })
  jumps[kind] = {
    id,
    result,
    after,
    currentIsTarget: after === id,
    bodyHasTitle: body.includes(kind === 'hidden' ? 'calib-nav-hidden' : `calib-nav-${kind}`),
    shot,
  }
}

writeFileSync(join(HERE, 'calib-jump.json'), JSON.stringify({ hook, jumps }, null, 2))
console.log(JSON.stringify({ hook, summary: Object.fromEntries(Object.entries(jumps).map(([k, v]) => [k, {
  jumped: v.result?.jumped,
  used: v.result?.used,
  error: v.result?.error,
  before: v.result?.before,
  afterSync: v.result?.afterSync,
  after: v.after,
  currentIsTarget: v.currentIsTarget,
  bodyHasTitle: v.bodyHasTitle,
}])) }, null, 2))
await browser.close()
if (!hook.hasOpen) process.exit(2)
