/**
 * Peer send: rate limit, peers.jsonl, accept-then-echo (BR-021~025).
 * Wait happens after accepted; never via promptOwnedSession.
 * @module dsh-bot-host/peers
 */

import { existsSync } from 'node:fs'
import { mkdir, readFile, appendFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { isSilentReply } from './routine-wake.ts'

export const PEER_RATE_LIMIT = 3
export const PEER_WINDOW_MS = 60_000
export const AGENT_PREFIX = '[agent]'

export interface PeerLogRow {
  readonly from: string
  readonly to: string
  readonly ts: number
  readonly sessionId: string
}

export interface PeerRateLimiter {
  tryConsume(fromBot: string): boolean
}

export function createPeerRateLimiter(now: () => number = Date.now): PeerRateLimiter {
  const stamps = new Map<string, number[]>()
  return {
    tryConsume(fromBot: string): boolean {
      const t = now()
      const keep = (stamps.get(fromBot) ?? []).filter(x => t - x < PEER_WINDOW_MS)
      if (keep.length >= PEER_RATE_LIMIT) {
        stamps.set(fromBot, keep)
        return false
      }
      keep.push(t)
      stamps.set(fromBot, keep)
      return true
    },
  }
}

export function peersLogPath(home: string): string {
  return join(home, 'dsh-bot', 'peers.jsonl')
}

export async function appendPeerLog(home: string, row: PeerLogRow): Promise<void> {
  const file = peersLogPath(home)
  await mkdir(dirname(file), { recursive: true })
  await appendFile(file, `${JSON.stringify(row)}\n`, 'utf8')
}

export async function readPeerLog(home: string, botId?: string): Promise<PeerLogRow[]> {
  const file = peersLogPath(home)
  if (!existsSync(file)) return []
  const raw = await readFile(file, 'utf8')
  const rows: PeerLogRow[] = []
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>
      const from = typeof parsed.from === 'string' ? parsed.from : ''
      const to = typeof parsed.to === 'string' ? parsed.to : ''
      const sessionId = typeof parsed.sessionId === 'string' ? parsed.sessionId : ''
      const ts = typeof parsed.ts === 'number' && Number.isFinite(parsed.ts) ? parsed.ts : 0
      if (from === '' || to === '' || sessionId === '') continue
      if (botId !== undefined && botId !== '' && from !== botId && to !== botId) continue
      rows.push({ from, to, ts, sessionId })
    } catch {
      // skip corrupt line
    }
  }
  return rows
}

export function buildPeerWake(fromName: string, text: string): string {
  return `${AGENT_PREFIX} 来自 ${fromName}：${text}`
}

export function parseAgentLine(text: string): { fromName: string; body: string } | undefined {
  const m = text.trim().match(/^\[agent\]\s*来自\s*(.+?)：([\s\S]*)$/u)
  if (m === null) return undefined
  return { fromName: m[1]!.trim(), body: m[2] ?? '' }
}

export interface PeerSendInput {
  readonly fromBot: string
  readonly toBot: string
  readonly text: string
  readonly fromSessionId?: string
}

export type PeerSendResult =
  | { readonly ok: true; readonly accepted: true; readonly sessionId: string }
  | { readonly ok: false; readonly error: string }

export interface PeerSendIO {
  readonly limiter: PeerRateLimiter
  now(): number
  getBot(id: string): Promise<{ readonly id: string; readonly name: string }>
  findPeerSession(toBot: string, fromBot: string): Promise<string | undefined>
  createPeerSession(toBot: string, fromBot: string, title: string): Promise<string>
  write(sessionId: string, text: string): Promise<void>
  waitRead(sessionId: string): Promise<string | undefined>
  resolveFromSession(fromBot: string, hint?: string): Promise<string>
  incrementUnread(botId: string): void
  appendLog(row: PeerLogRow): Promise<void>
}

export async function acceptPeerSend(io: PeerSendIO, input: PeerSendInput): Promise<PeerSendResult> {
  const fromBot = input.fromBot.trim()
  const toBot = input.toBot.trim()
  const text = input.text.trim()
  if (fromBot === '' || toBot === '' || text === '') return { ok: false, error: 'invalid-input' }
  if (fromBot === toBot) return { ok: false, error: 'cannot-send-to-self' }
  await io.getBot(toBot)
  await io.getBot(fromBot)
  if (!io.limiter.tryConsume(fromBot)) return { ok: false, error: 'rate-limited' }
  const from = await io.getBot(fromBot)
  let sessionId = await io.findPeerSession(toBot, fromBot)
  if (sessionId === undefined) {
    sessionId = await io.createPeerSession(toBot, fromBot, `来自 ${from.name}`)
  }
  await io.write(sessionId, buildPeerWake(from.name, text))
  io.incrementUnread(toBot)
  await io.appendLog({ from: fromBot, to: toBot, ts: io.now(), sessionId })
  return { ok: true, accepted: true, sessionId }
}

export async function finishPeerSend(io: PeerSendIO, input: PeerSendInput, peerSessionId: string): Promise<void> {
  const to = await io.getBot(input.toBot)
  const answer = await io.waitRead(peerSessionId)
  if (answer === undefined || isSilentReply(answer)) return
  const target = await io.resolveFromSession(input.fromBot, input.fromSessionId)
  await io.write(target, buildPeerWake(to.name, answer.trim()))
  io.incrementUnread(input.fromBot)
}
