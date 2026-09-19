#!/usr/bin/env node
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'

const require = createRequire(import.meta.url)
const { chromium } = require('/tmp/pw-dsh-t18/node_modules/playwright')
const OUT = dirname(fileURLToPath(import.meta.url))

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--disable-gpu', '--no-first-run', '--disable-dev-shm-usage'],
})
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
await page.goto('http://127.0.0.1:3084/', { waitUntil: 'domcontentloaded', timeout: 30000 })
await delay(2000)

const dump = await page.evaluate(() => {
  const editors = [...document.querySelectorAll('textarea, [contenteditable="true"], [role="textbox"]')].map(el => ({
    tag: el.tagName,
    role: el.getAttribute('role'),
    ph: el.getAttribute('placeholder') || el.getAttribute('aria-label') || el.getAttribute('data-placeholder') || '',
    ce: el.getAttribute('contenteditable'),
    vis: !!(el.offsetWidth || el.offsetHeight),
    text: (el.innerText || el.value || '').slice(0, 80),
  }))
  const buttons = [...document.querySelectorAll('button')].filter(b => {
    const t = `${b.getAttribute('aria-label') || ''} ${b.textContent || ''} ${b.getAttribute('title') || ''}`
    return /新建|新会话|发送/.test(t)
  }).map(b => ({
    aria: b.getAttribute('aria-label') || '',
    title: b.getAttribute('title') || '',
    text: (b.textContent || '').trim().slice(0, 40),
    vis: !!(b.offsetWidth || b.offsetHeight),
  }))
  return { editors, buttons }
})
writeFileSync(join(OUT, 'probe-composer.json'), JSON.stringify(dump, null, 2))
console.log(JSON.stringify(dump, null, 2))
await page.screenshot({ path: join(OUT, 'probe-composer.png'), fullPage: true })
await browser.close()
