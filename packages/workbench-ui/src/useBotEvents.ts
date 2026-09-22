/**
 * One EventSource on GET /dsh-bot/events. Ready stops the three named polls.
 * Parses assistant/chunk text-delta and approval/question cards.
 */
import { useEffect, useRef, useState } from 'react'
import type { HistoryValue, WorkbenchHistoryItem, WorkbenchBot } from './api.ts'

const RECONNECT_CAP_MS = 10_000

export interface LiveStream {
  readonly sessionId: string
  readonly text: string
  readonly roomId?: string
  readonly complete?: boolean
  readonly seq?: number
}

export interface BotStatusLive {
  readonly botId: string
  readonly working: boolean
  readonly unread: number
}

export interface BotLiveState {
  readonly sseReady: boolean
  readonly stream: LiveStream | null
  readonly streams: readonly LiveStream[]
  readonly cards: readonly WorkbenchHistoryItem[]
  readonly status: readonly BotStatusLive[]
  readonly epoch: number
}

function visibleStreamText(text: string): string {
  // Control payloads become cards / readable suggestions only after persistence.
  return text.replace(/\[propose-routine\][\s\S]*?(?:\[\/propose-routine\]|$)/g, '').trimEnd()
}

export function mergeLiveItems(
  items: readonly WorkbenchHistoryItem[],
  sessionId: string | null,
  stream: LiveStream | null,
  cards: readonly WorkbenchHistoryItem[],
): WorkbenchHistoryItem[] {
  const text = visibleStreamText(stream?.text ?? '')
  const liveStream = sessionId !== null && stream !== null && stream.sessionId === sessionId && text !== ''
  const extraCards = sessionId === null
    ? []
    : cards.filter(card => (card.sessionId === sessionId || card.roomId === sessionId) && !items.some(item => item.id === card.id))
  if (!liveStream && extraCards.length === 0) return items as WorkbenchHistoryItem[]
  const out = [...items]
  if (liveStream && stream !== null) {
    let last = -1
    for (let i = out.length - 1; i >= 0; i -= 1) {
      if (out[i]!.kind === 'message' && out[i]!.role === 'user') break
      if (out[i]!.kind === 'message' && out[i]!.role === 'assistant') {
        last = i
        break
      }
    }
    if (last >= 0) {
      // A completed persisted answer is authoritative; do not animate its handoff again.
      if (stream.complete !== true) out[last] = { ...out[last]!, text, streaming: true }
    } else {
      const seq = out.reduce((max, item) => item.seq > max ? item.seq : max, 0) + 1
      out.push({
        id: `stream-${sessionId}`,
        kind: 'message',
        seq,
        role: 'assistant',
        text,
        streaming: stream.complete !== true,
        pending: true,
        sessionId,
      })
    }
  }
  if (sessionId !== null) {
    for (const card of cards) {
      if ((card.sessionId === sessionId || card.roomId === sessionId) && !out.some(item => item.id === card.id)) out.push(card)
    }
  }
  return out
}

/** Only the active hidden member session may paint into its group room. */
export function mergeGroupStream(
  items: readonly WorkbenchHistoryItem[],
  roomId: string | null,
  stream: LiveStream | null,
  speaking: HistoryValue['speaking'] | null,
  members: readonly WorkbenchBot[],
): readonly WorkbenchHistoryItem[] {
  if (!stream || !speaking?.sessionId || stream.sessionId !== speaking.sessionId
    || stream.roomId !== roomId || !stream.text.trim()) return items
  // Hidden sessions are reused. Never replay cached text from an earlier turn.
  if (speaking.afterSessionSeq === undefined || stream.seq === undefined
    || stream.seq <= speaking.afterSessionSeq) return items
  const member = members.find(row => row.id === speaking.botId)
  if (!member) return items
  const text = visibleStreamText(stream.text).trim()
  if (!text) return items
  if (/^(?:\(\s*)?pass(?:\s*\))?\s*\.?$/i.test(text)) return items
  // Echoed orchestration wrappers wait for the host's sanitized final answer.
  if (/^(?:\[|<|【小组)|现在轮到你|房间里刚说的/.test(text)) return items
  // afterSeq distinguishes a repeated reply from the same member's previous turn.
  const saved = items.some(item => item.role === 'assistant' && item.author?.botId === member.id
    && item.seq > (speaking.afterSeq ?? -1))
  if (saved) return items
  return [...items, {
    id: `stream-${stream.sessionId}`, kind: 'message', role: 'assistant',
    seq: items.reduce((max, item) => Math.max(max, item.seq), 0) + 1,
    text, streaming: stream.complete !== true, pending: true,
    author: { botId: member.id, name: member.name, avatar: member.avatar },
  }]
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
}

function chunkText(event: Record<string, unknown>): string {
  const data = asRecord(event.data)
  const chunk = asRecord(data.chunk ?? event.chunk)
  if (chunk.type !== 'text-delta') return ''
  return typeof chunk.text === 'string' ? chunk.text : ''
}

function cardFromFrame(frame: Record<string, unknown>): WorkbenchHistoryItem | null {
  const type = typeof frame.type === 'string' ? frame.type : ''
  const sessionId = typeof frame.sessionId === 'string' ? frame.sessionId : ''
  const rpcId = typeof frame.rpcId === 'string' ? frame.rpcId : ''
  const room = typeof frame.roomId === 'string' ? { roomId: frame.roomId } : {}
  if (sessionId === '') return null
  if (type === 'approval/requested') {
    const approvalId = typeof frame.approvalId === 'string' ? frame.approvalId : rpcId
    return {
      id: `approval-${rpcId || approvalId || sessionId}`,
      kind: 'approval',
      ...room,
      seq: typeof frame.seq === 'number' ? frame.seq : Date.now(),
      sessionId,
      rpcId,
      approvalId,
      pending: true,
      text: typeof frame.message === 'string' ? frame.message : '请求审批',
    }
  }
  if (type === 'question/requested') {
    return {
      id: `question-${rpcId || sessionId}`,
      kind: 'question',
      ...room,
      seq: typeof frame.seq === 'number' ? frame.seq : Date.now(),
      sessionId,
      rpcId,
      pending: true,
      text: typeof frame.prompt === 'string' ? frame.prompt : typeof frame.message === 'string' ? frame.message : '需要回答',
    }
  }
  return null
}

/**
 * Subscribe to `/dsh-bot/events`. Missing EventSource (tests) is a no-op.
 */
export function useBotEvents(): BotLiveState {
  const [sseReady, setSseReady] = useState(false)
  const [stream, setStream] = useState<LiveStream | null>(null)
  const [streamRows, setStreamRows] = useState<readonly LiveStream[]>([])
  const [cards, setCards] = useState<readonly WorkbenchHistoryItem[]>([])
  const [status, setStatus] = useState<readonly BotStatusLive[]>([])
  const [epoch, setEpoch] = useState(0)
  const streams = useRef(new Map<string, LiveStream>())

  useEffect(() => {
    if (typeof EventSource === 'undefined') return
    let closed = false
    let source: EventSource | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    let delay = 500

    const bump = (): void => { setEpoch(n => n + 1) }
    const publish = (sessionId: string, next: LiveStream | null): void => {
      if (next === null) streams.current.delete(sessionId)
      else streams.current.set(sessionId, next)
      // Keep active turns, but bound retained completed handoffs.
      if (streams.current.size > 64) {
        for (const [id, row] of streams.current) {
          if (streams.current.size <= 64) break
          if (row.complete) streams.current.delete(id)
        }
      }
      setStream(current => next ?? (current?.sessionId === sessionId ? null : current))
      setStreamRows([...streams.current.values()])
    }

    const handle = (raw: string): void => {
      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch {
        return
      }
      const frame = asRecord(parsed)
      const type = typeof frame.type === 'string' ? frame.type : ''
      if (type === 'ready') {
        setSseReady(true)
        delay = 500
        return
      }
      if (type === 'bot/status') {
        const botId = typeof frame.botId === 'string' ? frame.botId : ''
        if (botId === '') return
        const row = {
          botId,
          working: frame.working === true,
          unread: typeof frame.unread === 'number' ? frame.unread : 0,
        }
        setStatus(current => {
          const prev = current.find(item => item.botId === botId)
          if (prev !== undefined && prev.working === row.working && prev.unread === row.unread) return current
          return [...current.filter(item => item.botId !== botId), row]
        })
        return
      }
      if (type === 'session/event') {
        const sessionId = typeof frame.sessionId === 'string' ? frame.sessionId : ''
        const event = asRecord(frame.event)
        const eventType = typeof event.type === 'string' ? event.type : ''
        if (sessionId === '') return
        if (eventType === 'assistant/start' || eventType === 'assistant/attempt') {
          publish(sessionId, null)
          return
        }
        if (eventType === 'assistant/chunk') {
          const delta = chunkText(event)
          if (delta === '') return
          const previous = streams.current.get(sessionId)
          const next = `${previous?.complete ? '' : previous?.text ?? ''}${delta}`
          publish(sessionId, { sessionId, text: next,
            ...typeof event.seq === 'number' ? { seq: event.seq } : {},
            ...typeof frame.roomId === 'string' ? { roomId: frame.roomId } : {},
          })
          return
        }
        if (eventType === 'assistant/message' || eventType === 'turn/end' || eventType === 'user/message') {
          const previous = streams.current.get(sessionId)
          if (eventType === 'assistant/message' && previous) publish(sessionId, { ...previous, complete: true })
          else if (eventType === 'user/message' || previous?.complete !== true) publish(sessionId, null)
          bump()
        }
        return
      }
      if (type === 'approval/resolved' || type === 'question/resolved') {
        const sessionId = typeof frame.sessionId === 'string' ? frame.sessionId : ''
        const rpcId = typeof frame.rpcId === 'string' ? frame.rpcId : ''
        setCards(current => current.map(card => (
          card.sessionId === sessionId && (rpcId === '' || card.rpcId === rpcId)
            ? { ...card, pending: false }
            : card
        )))
        bump()
        return
      }
      const card = cardFromFrame(frame)
      if (card !== null) {
        setCards(current => current.some(item => item.id === card.id) ? current : [...current, card])
      }
    }

    const connect = (): void => {
      if (closed) return
      try {
        source = new EventSource('/dsh-bot/events')
      } catch {
        setSseReady(false)
        return
      }
      source.onmessage = event => { handle(String(event.data)) }
      source.onerror = () => {
        if (closed) return
        if (source !== undefined && source.readyState === EventSource.CONNECTING) return
        setSseReady(false)
        source?.close()
        source = undefined
        timer = setTimeout(connect, delay)
        delay = Math.min(delay * 2, RECONNECT_CAP_MS)
      }
    }

    connect()
    return () => {
      closed = true
      if (timer !== undefined) clearTimeout(timer)
      source?.close()
    }
  }, [])

  return { sseReady, stream, streams: streamRows, cards, status, epoch }
}
