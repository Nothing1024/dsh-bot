#!/usr/bin/env node
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeFileSync, mkdirSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'

const require = createRequire(import.meta.url)
const { chromium } = require('/tmp/pw-dsh-t18/node_modules/playwright')
const OUT = join(dirname(fileURLToPath(import.meta.url)))
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--disable-gpu', '--no-first-run', '--disable-dev-shm-usage'],
})
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
await page.goto('http://127.0.0.1:3084/', { waitUntil: 'domcontentloaded', timeout: 30000 })
await delay(2000)

async function snap(name) {
  await page.screenshot({ path: join(OUT, name), fullPage: true })
}

const dump = async () => page.evaluate(() => ({
  iframe: Boolean(document.querySelector('[data-testid="dsh-bot-iframe"]')),
  tab: Boolean(document.querySelector('[data-testid="dsh-bot-tab"]')),
  buttons: [...document.querySelectorAll('button')].map(b => ({
    text: (b.textContent || '').trim().slice(0, 40),
    title: b.getAttribute('title') || '',
    aria: b.getAttribute('aria-label') || '',
    vis: !!(b.offsetWidth || b.offsetHeight || b.getClientRects().length),
  })).filter(b => /DSH|侧边|标签|底部|插件|Bot|\+/.test(`${b.text}${b.title}${b.aria}`)),
}))

const steps = []
steps.push({ step: 'load', ...(await dump()) })
await snap('probe-tab-0.png')

for (const name of ['展开底部面板', '展开侧边栏']) {
  const loc = page.getByRole('button', { name })
  if (await loc.count()) {
    await loc.first().click({ timeout: 4000, force: true }).catch(e => console.log('click', name, e.message))
    await delay(800)
    steps.push({ step: name, ...(await dump()) })
    await snap(`probe-tab-${name}.png`)
  }
}

const newTab = page.getByTitle('新建标签页')
if (await newTab.count()) {
  await newTab.last().click({ force: true }).catch(e => console.log('newtab', e.message))
  await delay(800)
  steps.push({ step: '新建标签页', ...(await dump()) })
  await snap('probe-tab-new.png')
}

await page.evaluate(() => {
  const buttons = [...document.querySelectorAll('button')]
  const vis = buttons.find(b => (b.textContent || '').trim() === 'DSH Bot' && (b.offsetWidth || b.offsetHeight))
  const any = buttons.find(b => (b.getAttribute('title') || '') === 'DSH Bot' || (b.textContent || '').trim() === 'DSH Bot')
  ;(vis || any)?.click()
})
await delay(1500)
steps.push({ step: 'click DSH Bot', ...(await dump()) })
await snap('probe-tab-dsh.png')

writeFileSync(join(OUT, 'probe-tab.json'), JSON.stringify(steps, null, 2))
console.log(JSON.stringify(steps, null, 2))
await browser.close()
