/**
 * UF-801 extract-timeout: finish the user turn, drop askTimeoutMs to 1000,
 * then let history start extract so the hidden wait times out.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../../../..')
const evMem = join(root, 'docs/dsh-bot-memory/evidence')
const settingsPath = join(root, 'env/settings.yaml')
const BASE = 'http://127.0.0.1:3084'
const botId = 'xiaodui-aning'

function write(rel, body) {
  const dest = join(evMem, rel)
  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(dest, typeof body === 'string' ? body : `${JSON.stringify(body, null, 2)}\n`)
}

function setAskTimeout(ms) {
  const raw = readFileSync(settingsPath, 'utf8')
  writeFileSync(settingsPath, raw.replace(/askTimeoutMs:\s*\d+/, `askTimeoutMs: ${ms}`))
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

function countMemory(listed) {
  const value = listed?.value ?? listed
  return {
    profile: (value?.profile ?? []).length,
    log: (value?.log ?? []).length,
    texts: [...(value?.profile ?? []), ...(value?.log ?? [])].map(x => x.text),
  }
}

const original = Number(/askTimeoutMs:\s*(\d+)/.exec(readFileSync(settingsPath, 'utf8'))?.[1] ?? '180000')
try {
  const created = await rpc('createBotSession', { botId, title: 'uf801-extract-timeout-2' })
  if (!created.ok) throw new Error(created.error?.message ?? 'create failed')
  const sessionId = created.value.sessionId
  const before = countMemory(await rpc('memoryList', { botId }))
  const fact = '请记住：我的工位在南楼 12 层靠窗，这个位置写进长期记忆，之后找我就按这个说。'
  const prompted = await rpc('prompt', { sessionId, text: fact })
  if (!prompted.ok) throw new Error(prompted.error?.message ?? 'prompt failed')
  setAskTimeout(1000)
  await new Promise(r => setTimeout(r, 2500))
  let hist
  const idleStart = Date.now()
  while (Date.now() - idleStart < 60000) {
    hist = await rpc('history', { sessionId })
    if (hist?.ok && hist.value?.working === false) break
    await new Promise(r => setTimeout(r, 1000))
  }
  const extractStart = Date.now()
  // first idle history already queued extract; wait for timeout + retry poll
  await new Promise(r => setTimeout(r, 15000))
  const hist2 = await rpc('history', { sessionId })
  const after = countMemory(await rpc('memoryList', { botId }))
  const leaked = after.texts.some(text => String(text).includes('南楼 12 层'))
  const payload = {
    sessionId,
    prompted,
    askTimeoutMs: 1000,
    idleWaitMs: Date.now() - idleStart,
    extractWaitMs: Date.now() - extractStart,
    working1: hist?.value?.working,
    working2: hist2?.value?.working,
    before,
    after,
    leaked,
    unchanged: after.profile === before.profile && after.log === before.log && !leaked,
  }
  write('phase-2/extract-timeout.log', payload)
  write('phase-2/extract-timeout.md', [
    '# UF-801 extract timeout',
    '',
    `- askTimeoutMs=1000 after prompt, before history-triggered extract`,
    `- working after idle wait: ${payload.working1}`,
    `- memory profile ${before.profile}→${after.profile} log ${before.log}→${after.log}`,
    `- leaked 南楼 fact: ${leaked}`,
    `- unchanged: ${payload.unchanged}`,
    '',
  ].join('\n'))
  console.log(`extract-timeout2 done unchanged=${payload.unchanged} leaked=${leaked} working=${payload.working1}`)
} finally {
  setAskTimeout(original)
  console.log(`askTimeoutMs restored ${original}`)
}
