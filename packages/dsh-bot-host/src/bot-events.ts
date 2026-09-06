/**
 * GET /dsh-bot/events: filter mux/host frames by bot: / group-room: marks
 * and emit plugin `bot/status` snapshots.
 * @module dsh-bot-host/bot-events
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { get } from 'session-marks'
import { parseBotMark } from './marks.ts'

/** Mux frame types forwarded to the workbench (BR-011). */
export const MUX_FORWARD_TYPES = new Set([
  'session/event',
  'session/queue',
  'approval/requested',
  'approval/resolved',
  'question/requested',
  'question/resolved',
  'session/projection',
])

/** Host frame types forwarded to the workbench (BR-011). */
export const HOST_FORWARD_TYPES = new Set([
  'host/session-status',
])

export interface BotStatusRow {
  readonly botId: string
  readonly working: boolean
  readonly unread: number
}

export function marksAllowForward(tags: readonly string[] | undefined): boolean {
  if (tags === undefined) return false
  return tags.some(tag => tag.startsWith('bot:') || tag.startsWith('group-room:'))
}

export function unwrapFrame(item: unknown): { rpcId?: string; frame: Record<string, unknown> } {
  if (typeof item !== 'object' || item === null) return { frame: {} }
  const rec = item as Record<string, unknown>
  if (rec.payload !== undefined && typeof rec.payload === 'object' && rec.payload !== null) {
    return {
      ...typeof rec.rpcId === 'string' && rec.rpcId !== '' ? { rpcId: rec.rpcId } : {},
      frame: rec.payload as Record<string, unknown>,
    }
  }
  return {
    ...typeof rec.rpcId === 'string' && rec.rpcId !== '' ? { rpcId: rec.rpcId } : {},
    frame: rec,
  }
}

export function encodeSse(event: unknown): string {
  return `data: ${JSON.stringify(event)}\n\n`
}

export function sessionIdOf(frame: Record<string, unknown>): string {
  return typeof frame.sessionId === 'string' ? frame.sessionId : ''
}

export interface BotEventsSource {
  subscribeMux?(signal: AbortSignal): AsyncIterable<unknown> | undefined
  subscribeHost?(signal: AbortSignal): AsyncIterable<unknown> | undefined
  listBotStatus?(): readonly BotStatusRow[]
  noteSessionRunning?(sessionId: string, running: boolean): Promise<BotStatusRow | undefined>
}

/**
 * Open an SSE response. Missing mux+host ducks → 503 so the UI keeps polling.
 */
export async function handleBotEventsHttp(
  source: BotEventsSource,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const ac = new AbortController()
  const muxStream = typeof source.subscribeMux === 'function'
    ? source.subscribeMux(ac.signal)
    : undefined
  const hostStream = typeof source.subscribeHost === 'function'
    ? source.subscribeHost(ac.signal)
    : undefined
  if (muxStream === undefined && hostStream === undefined) {
    ac.abort()
    const payload = JSON.stringify({
      ok: false,
      error: { code: 'events-unavailable', message: 'apiProxy.events is not available' },
    })
    res.statusCode = 503
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Content-Length', Buffer.byteLength(payload))
    res.end(payload)
    return
  }

  const onClose = (): void => { ac.abort() }
  req.once('close', onClose)

  res.statusCode = 200
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.write(encodeSse({ type: 'ready' }))
  for (const row of source.listBotStatus?.() ?? []) {
    res.write(encodeSse({ type: 'bot/status', ...row }))
  }

  const handleItem = async (item: unknown, allowed: Set<string>): Promise<void> => {
    if (res.writableEnded || ac.signal.aborted) return
    const { rpcId, frame } = unwrapFrame(item)
    const type = typeof frame.type === 'string' ? frame.type : ''
    if (!allowed.has(type)) return
    const sessionId = sessionIdOf(frame)
    if (sessionId === '') return
    const tags = await get(sessionId)
    if (!marksAllowForward(tags)) return
    if (type === 'host/session-status' && source.noteSessionRunning !== undefined) {
      const status = await source.noteSessionRunning(sessionId, frame.running === true)
      if (status !== undefined && !res.writableEnded) {
        res.write(encodeSse({ type: 'bot/status', ...status }))
      }
    }
    const out: Record<string, unknown> = { ...frame }
    if (rpcId !== undefined) out.rpcId = rpcId
    if (!res.writableEnded) res.write(encodeSse(out))
  }

  const pump = async (
    stream: AsyncIterable<unknown> | undefined,
    allowed: Set<string>,
  ): Promise<void> => {
    if (stream === undefined) return
    try {
      for await (const item of stream) {
        if (ac.signal.aborted) return
        await handleItem(item, allowed)
      }
    } catch {
      if (ac.signal.aborted) return
    }
  }

  try {
    await Promise.all([
      pump(muxStream, MUX_FORWARD_TYPES),
      pump(hostStream, HOST_FORWARD_TYPES),
    ])
  } finally {
    req.off('close', onClose)
    if (!res.writableEnded) res.end()
  }
}

export function botIdFromTags(tags: readonly string[] | undefined): string | undefined {
  return parseBotMark(tags ?? [])
}
