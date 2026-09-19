#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { writeFileSync, statSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

const require = createRequire(import.meta.url)
const { chromium } = require('/tmp/pw-dsh-t18/node_modules/playwright')
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..')
const DSH_HOME = join(ROOT, 'env')
const EVIDENCE = join(ROOT, 'docs/dsh-bot-workbench/evidence')
const WHO = `${homedir()}/.agents/skills/dsh-plugin-debug/scripts/dsh-rpc-who.sh`
const RPC = `${homedir()}/.agents/skills/dsh-plugin-debug/scripts/dsh-rpc.sh`
const CLI = join(ROOT, '../../session-tool/plugin/packages/session-tool-cli/lib/bin.js')

function sh(c, a) { return spawnSync(c, a, { encoding: 'utf8', maxBuffer: 8e7, env: { ...process.env, DSH_HOME, PATH: process.env.PATH }, cwd: ROOT }) }
function rpc(m, p = {}) { const r = sh(RPC, ['3084', m, JSON.stringify(p)]); try { return JSON.parse(r.stdout || '{}') } catch { return {} } }
function val(d) { return d?.result?.value ?? d?.value }
function marksGet(id) { return (sh('node', [CLI, 'marks', 'get', '--id', id]).stdout || '').trim() }

console.log(sh(WHO, ['3084']).stdout.trim())

// unlabeled session.create then workbench open
const created = val(rpc('session.create', { cwd: ROOT, agentPreset: 'dsh-bot' }))
const sid = created?.sessionId
const before = marksGet(sid)
console.log('created', sid, 'before', before)

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-gpu', '--no-first-run'] })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()

// v1 GUI: search the completed t18fix-GUI turn
await page.goto('http://127.0.0.1:3084/', { waitUntil: 'domcontentloaded', timeout: 45000 })
await delay(1500)
await page.getByRole('button', { name: '搜索会话' }).click()
await delay(400)
await page.locator('input:visible').last().fill('t18fix-GUI')
await delay(800)
const hit = page.getByText('t18fix-GUI').first()
if (await hit.count()) await hit.click({ force: true })
await delay(1500)
const body = await page.locator('body').innerText()
console.log('gui has DSH Bot', body.includes('DSH Bot'), 'has t18fix-GUI', body.includes('t18fix-GUI'), 'hero', body.includes('探索未至之境'))
await page.screenshot({ path: join(EVIDENCE, 'phase-4/v1-gui-chat.png'), fullPage: true })
console.log('v1 shot', statSync(join(EVIDENCE, 'phase-4/v1-gui-chat.png')).size)

// workbench open = reconcile trigger
await page.goto('http://127.0.0.1:3084/dsh-bot/ui', { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.getByTestId('workbench-roster').waitFor()
await delay(1500)
const after = marksGet(sid)
console.log('after workbench', after)
await page.getByTestId('roster-row-dsh-bot').click()
await delay(400)
const res = await fetch('http://127.0.0.1:3084/dsh-bot/listBotSessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ args: { botId: 'dsh-bot' } }) })
const listed = await res.json()
const inList = (listed?.value?.sessions ?? []).some(s => s.sessionId === sid)
if (inList) await page.getByTestId('session-select').selectOption(sid).catch(() => {})
await delay(500)
mkdirSync(join(EVIDENCE, 'UF-205'), { recursive: true })
await page.screenshot({ path: join(EVIDENCE, 'UF-205/reconcile.png'), fullPage: true })
writeFileSync(join(EVIDENCE, 'UF-205/marks-diff.txt'), `# UF-205 marks diff

Gateway: ${sh(WHO, ['3084']).stdout.trim()}

## Official GUI 直建

Playwright 打开 http://127.0.0.1:3084，搜索并打开已用官方「新会话」composer 发送过的会话（标记 t18fix-GUI）。截图 \`phase-4/v1-gui-chat.png\`：官方对话面，preset DSH Bot，用户气泡 + assistant「我是 DSH Bot」。

## Unlabeled → labeled by opening workbench

Gateway \`session.create {cwd, agentPreset:dsh-bot}\` 与官方「新建会话」同一条 RPC（不经插件 marks）。本步**未** POST /dsh-bot/reconcile。

sessionId=\`${sid}\` agentPreset=\`${created?.agentPreset}\`

### Before GET /dsh-bot/ui

\`\`\`
${before || '(no marks row / session-not-found)'}
\`\`\`

unlabeled: ${!String(before).includes('bot:dsh-bot')}

### After GET /dsh-bot/ui (workbench App load → reconcile)

\`\`\`
${after}
\`\`\`

labeled bot:dsh-bot: ${String(after).includes('bot:dsh-bot')}
listBotSessions includes: ${inList}
`)
await browser.close()
const ok = !String(before).includes('bot:dsh-bot') && String(after).includes('bot:dsh-bot') && body.includes('DSH Bot')
console.log(ok ? 'PASS' : 'FAIL', { before: before.slice(0, 80), after: after.slice(0, 80), inList })
if (!ok) process.exit(1)
