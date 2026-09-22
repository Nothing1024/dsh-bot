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

/** Map a live `session/event` onto the workbench mux vocabulary (BR-011). */
export function muxFrameFromSessionEvent(session: { readonly id?: unknown }, event: unknown): Record<string, unknown> {
  const rec = event as { type?: unknown; seq?: unknown; data?: { id?: unknown; reason?: unknown } }
  const type = typeof rec.type === 'string' ? rec.type : ''
  const sessionId = String(session.id ?? '')
  if (type === 'approval/asked') {
    const approvalId = rec.data?.id
    return {
      type: 'approval/requested',
      sessionId,
      seq: rec.seq,
      approvalId,
      rpcId: approvalId,
      message: rec.data?.reason,
      event,
    }
  }
  if (type === 'approval/decided') {
    return { type: 'approval/resolved', sessionId, seq: rec.seq, event }
  }
  return { type: 'session/event', sessionId, seq: rec.seq, event }
}

/** Current DSH emits transient frames separately from durable session events. */
export function muxFrameFromAssistantStream(
  session: { readonly id?: unknown; readonly seq?: unknown },
  frame: { readonly type?: unknown; readonly chunk?: unknown; readonly outcome?: { readonly kind?: unknown; readonly eventType?: unknown } },
): Record<string, unknown> | undefined {
  const type = frame.type === 'start' ? 'assistant/start'
    : frame.type === 'chunk' ? 'assistant/chunk'
      : frame.type === 'end' && (frame.outcome?.kind !== 'committed' || frame.outcome.eventType !== 'assistant/message')
        ? 'assistant/attempt' : undefined
  if (type === undefined || typeof session.id !== 'string') return undefined
  return muxFrameFromSessionEvent(session, { type, seq: session.seq,
    ...(type === 'assistant/chunk' ? { data: { chunk: frame.chunk } } : {}),
  })
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
      error: { code: 'events-unavailable', message: 'session events are not available' },
    })
    res.statusCode = 503
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Content-Length', Buffer.byteLength(payload))
    res.end(payload)
    return
  }

  const onClose = (): void => { ac.abort() }
  req.once('close', onClose)
  req.once('end', onClose)

  const holdOpen = (): boolean => (
    ac.signal.aborted === false
    && res.writableEnded === false
    && req.destroyed !== true
    && req.readableEnded !== true
    && req.socket != null
  )

  const wait = (ms: number): Promise<void> => new Promise(resolve => {
    if (ac.signal.aborted) {
      resolve()
      return
    }
    const timer = setTimeout(() => {
      ac.signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = (): void => {
      clearTimeout(timer)
      resolve()
    }
    ac.signal.addEventListener('abort', onAbort, { once: true })
  })

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
    const roomMark = tags?.find(tag => tag.startsWith('group-room:'))
    if (roomMark !== undefined) out.roomId = roomMark.slice('group-room:'.length)
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
    while (holdOpen()) {
      if (!res.write(': ping\n\n')) break
      await wait(15_000)
      if (!holdOpen()) break
      await Promise.all([
        pump(source.subscribeMux?.(ac.signal), MUX_FORWARD_TYPES),
        pump(source.subscribeHost?.(ac.signal), HOST_FORWARD_TYPES),
      ])
    }
  } finally {
    req.off('close', onClose)
    req.off('end', onClose)
    if (!res.writableEnded) res.end()
  }
}

export function botIdFromTags(tags: readonly string[] | undefined): string | undefined {
  return parseBotMark(tags ?? [])
}
