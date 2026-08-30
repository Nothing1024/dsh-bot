#!/usr/bin/env node
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { mkdirSync, writeFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'

const require = createRequire(import.meta.url)
const { chromium } = require('/tmp/pw-dsh-t18/node_modules/playwright')
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..')
const OUT = join(ROOT, 'docs/dsh-bot-workbench/evidence/phase-4')
mkdirSync(OUT, { recursive: true })

const candidates = [
  { channel: 'chrome' },
  { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' },
  { executablePath: join(homedir(), 'Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing') },
]

async function launch() {
  for (const opt of candidates) {
    for (const headless of [true, false]) {
      try {
        console.log('try', JSON.stringify({ ...opt, headless }))
        const browser = await chromium.launch({
          ...opt,
          headless,
          args: ['--disable-gpu', '--no-first-run', '--disable-dev-shm-usage'],
        })
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
        const page = await ctx.newPage()
        page.setDefaultTimeout(20000)
        await page.goto('http://127.0.0.1:3084/dsh-bot/ui', { waitUntil: 'domcontentloaded', timeout: 30000 })
        await delay(1500)
        console.log('ok', opt.channel || opt.executablePath, 'headless', headless)
        return { browser, page }
      } catch (e) {
        console.log('fail', String(e).slice(0, 400))
      }
    }
  }
  throw new Error('no playwright launch')
}

const { browser, page } = await launch()
try {
  await page.screenshot({ path: join(OUT, 'probe-standalone.png'), fullPage: true })
  const wb = await page.evaluate(() => ({
    title: document.title,
    testids: [...document.querySelectorAll('[data-testid]')].map(el => el.getAttribute('data-testid')),
    text: document.body.innerText.slice(0, 1500),
  }))
  await page.goto('http://127.0.0.1:3084/', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await delay(2500)
  await page.screenshot({ path: join(OUT, 'probe-gui.png'), fullPage: true })
  const gui = await page.evaluate(() => ({
    title: document.title,
    testids: [...document.querySelectorAll('[data-testid]')].map(el => el.getAttribute('data-testid')).slice(0, 80),
    buttons: [...document.querySelectorAll('button')].map(b => ({
      text: (b.textContent || '').trim().slice(0, 40),
      title: b.getAttribute('title') || '',
      aria: b.getAttribute('aria-label') || '',
    })).filter(b => b.text || b.title || b.aria).slice(0, 80),
    text: document.body.innerText.slice(0, 2000),
  }))
  writeFileSync(join(OUT, 'probe-gui.json'), JSON.stringify({ wb, gui }, null, 2))
  console.log('wrote probe')
} finally {
  await browser.close()
}
