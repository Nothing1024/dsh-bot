#!/usr/bin/env node
/** Phase 1 live: in-tab jump visible + hidden, standalone copy-id fallback. */
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

const require = createRequire(import.meta.url)
const { chromium } = require('/tmp/pw-dsh-nav/node_modules/playwright')
const HERE = dirname(fileURLToPath(import.meta.url))
const VISIBLE = 'session-91293f51-624b-4826-9144-b82cd32c3f67'
const HIDDEN = 'session-5384934e-28ca-4585-a6fb-31ee0ff078d3'
const VISIBLE_TITLE = 'dsh-bot-manual-20260829-231307-override-on'
const HIDDEN_TITLE = '委托成功四字回复'
const log = []

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--disable-gpu', '--no-first-run', '--disable-dev-shm-usage'],
})
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  permissions: ['clipboard-read', 'clipboard-write'],
})
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:3084' })
const page = await ctx.newPage()

async function snap(name) {
  const path = join(HERE, name)
  await page.screenshot({ path, fullPage: true })
  return path
}

async function officialTitle() {
  return await page.evaluate(() => {
    const iframe = document.querySelector('[data-testid="dsh-bot-iframe"]')
    const bits = []
    const walk = (node) => {
      if (node === iframe) return
      if (node.nodeType === 1) {
        const el = node
        const label = (el.getAttribute('title') || el.textContent || '').replace(/\s+/g, ' ').trim()
        if (label.length > 8 && label.length < 80) bits.push(label)
        for (const child of el.childNodes) walk(child)
      }
    }
    walk(document.body)
    return bits.filter((t) => /dsh-bot-manual|委托成功|nav-p1|override/.test(t)).slice(0, 12)
  })
}

async function clickDshBotMenu() {
  await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('button, [role="menuitem"], [role="option"], [role="tab"]')]
    const hit = nodes.find((el) => {
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim()
      if (!text.startsWith('DSH Bot')) return false
      return !(el.getAttribute('title') || '').includes('预设')
    })
    hit?.click()
  })
}

async function workbenchFrame() {
  return page.frames().find((item) => item.url().includes('/dsh-bot/ui'))
}

async function revealDshBotTab() {
  const expandBottom = page.getByRole('button', { name: '展开底部面板' })
  if (await expandBottom.count()) {
    const vis = await expandBottom.first().isVisible().catch(() => false)
    if (vis) await expandBottom.first().click().catch(() => {})
  }
  await delay(300)
  if (await page.getByTestId('dsh-bot-iframe').count() === 0) {
    const plus = page.getByTitle('新建标签页')
    if (await plus.count()) await plus.last().click().catch(() => {})
    await delay(400)
    await clickDshBotMenu()
  } else {
    await page.locator('[data-testid="dsh-bot-iframe"]').click({ force: true }).catch(() => {})
  }
  await page.getByTestId('dsh-bot-iframe').waitFor({ timeout: 25000 })
  await frame().getByTestId('session-select').waitFor({ timeout: 20000 })
}

async function openDshBotTab() {
  await page.goto('http://127.0.0.1:3084/', { waitUntil: 'domcontentloaded', timeout: 45000 })
  await delay(2000)
  const expandBottom = page.getByRole('button', { name: '展开底部面板' })
  if (await expandBottom.count()) await expandBottom.first().click().catch(() => {})
  await delay(400)
  const expandSide = page.getByRole('button', { name: '展开侧边栏' })
  if (await expandSide.count()) await expandSide.first().click().catch(() => {})
  await delay(400)
  const plus = page.getByTitle('新建标签页')
  if (await plus.count()) await plus.last().click().catch(() => {})
  await delay(500)
  await clickDshBotMenu()
  await page.getByTestId('dsh-bot-iframe').waitFor({ timeout: 25000 })
  await frame().getByTestId('session-select').waitFor({ timeout: 20000 })
}

function frame() {
  return page.frameLocator('[data-testid="dsh-bot-iframe"]')
}

async function mainTextHas(needle) {
  return await page.evaluate((text) => {
    const iframe = document.querySelector('[data-testid="dsh-bot-iframe"]')
    const walk = (node, acc) => {
      if (node === iframe) return acc
      if (node.nodeType === 3) return acc + (node.textContent || '')
      for (const child of node.childNodes) walk(child, acc)
      return acc
    }
    let acc = ''
    for (const child of document.body.childNodes) {
      if (child === iframe) continue
      acc += child.innerText || child.textContent || ''
    }
    return acc.includes(text)
  }, needle)
}

async function jumpViaMenu(sessionId, includeHidden) {
  const f = frame()
  await f.getByTestId('roster-row-dsh-bot').click({ timeout: 15000 }).catch(() => {})
  await delay(400)
  await f.getByTestId('session-select').click()
  await delay(300)
  if (includeHidden) {
    const toggle = f.getByTestId('include-hidden')
    if (await toggle.count()) {
      const checked = await toggle.isChecked()
      if (!checked) await toggle.click()
      await delay(800)
    }
  }
  await f.getByTestId(`session-menu-${sessionId}`).click({ timeout: 15000 })
  await delay(200)
  const jump = f.getByTestId(`session-jump-${sessionId}`)
  const label = await jump.textContent()
  const title = await jump.getAttribute('title')
  await page.evaluate(() => {
    window.__jumpSeen = []
    window.__dshBotJumpLast = undefined
    window.addEventListener('message', (event) => {
      if (event?.data?.type === 'dsh-bot:jump') window.__jumpSeen.push(event.data)
    })
  })
  await jump.click()
  await delay(300)
  const result = await page.evaluate(() => window.__dshBotJumpLast ?? { error: 'no-result' })
  await delay(800)
  const seen = await page.evaluate(() => window.__jumpSeen ?? [])
  return { label, title, result, seen }
}

try {
  await openDshBotTab()
  log.push({ step: 'tab-open', iframe: await page.getByTestId('dsh-bot-iframe').count() })
  await snap('jump-tab-open.png')

  const f = frame()
  await f.getByTestId('roster-row-dsh-bot').click({ timeout: 15000 }).catch(() => {})
  await delay(2000)
  await f.getByTestId('roster-sessions-dsh-bot').waitFor({ timeout: 20000 }).catch(() => {})
  await delay(500)
  const rosterMenu = f.locator('[data-testid^="roster-session-menu-"]').first()
  const rosterMenuCount = await f.locator('[data-testid^="roster-session-menu-"]').count()
  let rosterJumpLabel = null
  if (rosterMenuCount > 0) {
    await rosterMenu.click()
    const rosterJump = f.locator('[data-testid^="roster-session-jump-"]').first()
    rosterJumpLabel = await rosterJump.textContent()
    await snap('roster-jump-menu.png')
  }
  log.push({ step: 'roster-nested-menu', count: rosterMenuCount, label: rosterJumpLabel })

  await page.evaluate(() => { window.__dshBotJumpLast = undefined })
  const child = await workbenchFrame()
  if (child !== undefined) {
    await child.evaluate(() => {
      window.parent.postMessage({ type: 'dsh-bot:jump', sessionId: 'session-missing-nav-p1' }, location.origin)
    })
  }
  await delay(400)
  const deletedResult = await page.evaluate(() => window.__dshBotJumpLast ?? { error: 'no-result' })
  writeFileSync(join(HERE, 'deleted-jump.json'), JSON.stringify(deletedResult, null, 2))
  log.push({ step: 'deleted-jump', result: deletedResult })

  const beforeVisible = await officialTitle()
  const visibleJump = await jumpViaMenu(VISIBLE, false)
  await delay(800)
  const visibleShot = await snap('jump-visible.png')
  const afterVisible = await officialTitle()
  const visibleOfficial = await mainTextHas(VISIBLE_TITLE)
  log.push({
    step: 'jump-visible',
    sessionId: VISIBLE,
    before: beforeVisible,
    after: afterVisible,
    ...visibleJump,
    officialHasTitle: visibleOfficial,
    shot: visibleShot,
  })

  await revealDshBotTab()
  const beforeHidden = await officialTitle()
  const hiddenJump = await jumpViaMenu(HIDDEN, true)
  await delay(2000)
  const hiddenShot = await snap('jump-hidden.png')
  const afterHidden = await officialTitle()
  const hiddenOfficial = await mainTextHas(HIDDEN_TITLE)
  const emptyWorkspace = await page.evaluate(() => (document.body.innerText || '').includes('选择一个工作区开始'))
  log.push({
    step: 'jump-hidden',
    sessionId: HIDDEN,
    before: beforeHidden,
    after: afterHidden,
    ...hiddenJump,
    officialHasTitle: hiddenOfficial,
    emptyWorkspace,
    shot: hiddenShot,
  })

  const stand = await ctx.newPage()
  await stand.goto('http://127.0.0.1:3084/dsh-bot/ui', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await delay(1500)
  await stand.getByTestId('roster-row-dsh-bot').click().catch(() => {})
  await delay(400)
  await stand.getByTestId('session-select').click()
  await delay(300)
  await stand.getByTestId(`session-menu-${VISIBLE}`).click({ timeout: 15000 })
  const standJump = stand.getByTestId(`session-jump-${VISIBLE}`)
  const standLabel = await standJump.textContent()
  const standTitle = await standJump.getAttribute('title')
  await standJump.click()
  const toast = await stand.getByTestId('conversation-toast').textContent({ timeout: 3000 }).catch(() => null)
  let clipboard = null
  try {
    clipboard = await stand.evaluate(async () => navigator.clipboard.readText())
  } catch (error) {
    clipboard = String(error)
  }
  const standShot = join(HERE, 'standalone-fallback.png')
  await stand.screenshot({ path: standShot, fullPage: true })
  log.push({
    step: 'standalone',
    label: standLabel,
    title: standTitle,
    toast,
    clipboard,
    shot: standShot,
  })

  const visibleCurrent = visibleJump.result?.ok === true && visibleJump.result?.current === VISIBLE
  const hiddenCurrent = hiddenJump.result?.ok === true && hiddenJump.result?.current === HIDDEN
  const deletedOk = deletedResult?.ok === false && deletedResult?.reason === '会话不存在或已删除'
  const summary = {
    visibleOk: visibleOfficial === true && visibleCurrent,
    hiddenOk: hiddenCurrent,
    standaloneCopy: standLabel === '复制会话 ID' && (toast === '已复制会话 ID' || clipboard === VISIBLE),
    rosterMenu: rosterJumpLabel === '在 DSH 打开',
    visibleLanded: visibleOfficial === true && visibleCurrent,
    hiddenLanded: hiddenCurrent,
    deletedOk,
    hiddenOfficialTitle: hiddenOfficial,
    emptyWorkspace,
  }
  writeFileSync(join(HERE, 'live-jump.json'), JSON.stringify({ summary, log }, null, 2))
  console.log(JSON.stringify({ summary, log }, null, 2))
  await browser.close()
  if (!summary.visibleLanded || !summary.hiddenLanded || !summary.standaloneCopy || summary.rosterMenu !== true || summary.deletedOk !== true) process.exit(2)
} catch (error) {
  writeFileSync(join(HERE, 'live-jump.json'), JSON.stringify({ error: String(error), log }, null, 2))
  await snap('jump-error.png').catch(() => '')
  console.error(error)
  await browser.close()
  process.exit(1)
}
