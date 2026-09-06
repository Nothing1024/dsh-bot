/**
 * UF-801 extract-timeout against 运维夜班: short reply, no tools.
 * Wait for listBotSessions.working=false (does not start extract),
 * then history() with askTimeoutMs=1000.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../../../..')
const evMem = join(root, 'docs/dsh-bot-memory/evidence')
const settingsPath = join(root, 'env/settings.yaml')
const BASE = 'http://127.0.0.1:3084'
const botId = 'yunwei-yeban'

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

async function sessionWorking(sessionId) {
  const listed = await rpc('listBotSessions', { botId })
  const row = (listed.value?.sessions ?? []).find(item => item.sessionId === sessionId)
  return row?.working === true || row?.status === 'live'
}

const original = Number(/askTimeoutMs:\s*(\d+)/.exec(readFileSync(settingsPath, 'utf8'))?.[1] ?? '180000')
try {
  const created = await rpc('createBotSession', { botId, title: 'uf801-extract-timeout-3' })
  if (!created.ok) throw new Error(created.error?.message ?? 'create failed')
  const sessionId = created.value.sessionId
  const before = countMemory(await rpc('memoryList', { botId }))
  const fact = '记住：我只喝燕麦拿铁半糖。回一句「记下了」即可，不要用工具，不要查文件。'
  const prompted = await rpc('prompt', { sessionId, text: fact })
  if (!prompted.ok) throw new Error(prompted.error?.message ?? 'prompt failed')
  setAskTimeout(1000)
  await new Promise(r => setTimeout(r, 2500))
  const idleStart = Date.now()
  let working = true
  while (Date.now() - idleStart < 90000) {
    working = await sessionWorking(sessionId)
    if (!working) break
    await new Promise(r => setTimeout(r, 1000))
  }
  const hist1 = await rpc('history', { sessionId })
  await new Promise(r => setTimeout(r, 12000))
  const hist2 = await rpc('history', { sessionId })
  const after = countMemory(await rpc('memoryList', { botId }))
  const leaked = after.texts.some(text => String(text).includes('燕麦拿铁'))
  const payload = {
    sessionId,
    prompted,
    askTimeoutMs: 1000,
    idleWaitMs: Date.now() - idleStart,
    listWorkingBeforeHistory: working,
    working1: hist1?.value?.working,
    working2: hist2?.value?.working,
    before,
    after,
    leaked,
    unchanged: after.profile === before.profile && after.log === before.log && !leaked,
    lastAssistant: [...(hist1?.value?.items ?? [])].reverse().find(item => item.kind === 'message' && item.role === 'assistant')?.text,
  }
  write('phase-2/extract-timeout.log', payload)
  write('phase-2/extract-timeout.md', [
    '# UF-801 extract timeout',
    '',
    `- bot: 运维夜班; askTimeoutMs=1000 after prompt`,
    `- listBotSessions idle: ${!working} (${payload.idleWaitMs}ms)`,
    `- history.working after trigger: ${payload.working1}`,
    `- memory profile ${before.profile}→${after.profile} log ${before.log}→${after.log}`,
    `- leaked 燕麦拿铁: ${leaked}`,
    `- unchanged: ${payload.unchanged}`,
    `- last assistant: ${JSON.stringify(payload.lastAssistant ?? '')}`,
    '',
  ].join('\n'))
  console.log(`extract-timeout3 done unchanged=${payload.unchanged} leaked=${leaked} idle=${!working} histWorking=${payload.working1}`)
} finally {
  setAskTimeout(original)
  console.log(`askTimeoutMs restored ${original}`)
}
