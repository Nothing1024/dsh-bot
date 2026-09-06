/**
 * One EventSource on GET /dsh-bot/events. Ready stops the three named polls.
 * Parses assistant/chunk text-delta and approval/question cards.
 */
import { useEffect, useRef, useState } from 'react'
import type { WorkbenchHistoryItem } from './api.ts'

const RECONNECT_CAP_MS = 10_000

export interface LiveStream {
  readonly sessionId: string
  readonly text: string
}

export interface BotStatusLive {
  readonly botId: string
  readonly working: boolean
  readonly unread: number
}

export interface BotLiveState {
  readonly sseReady: boolean
  readonly stream: LiveStream | null
  readonly cards: readonly WorkbenchHistoryItem[]
  readonly status: readonly BotStatusLive[]
  readonly epoch: number
}

export function mergeLiveItems(
  items: readonly WorkbenchHistoryItem[],
  sessionId: string | null,
  stream: LiveStream | null,
  cards: readonly WorkbenchHistoryItem[],
): WorkbenchHistoryItem[] {
  const out = [...items]
  if (sessionId !== null && stream !== null && stream.sessionId === sessionId && stream.text !== '') {
    let last = -1
    for (let i = out.length - 1; i >= 0; i -= 1) {
      if (out[i]!.kind === 'message' && out[i]!.role === 'assistant') {
        last = i
        break
      }
    }
    if (last >= 0) {
      out[last] = { ...out[last]!, text: stream.text, streaming: true }
    } else {
      const seq = out.reduce((max, item) => item.seq > max ? item.seq : max, 0) + 1
      out.push({
        id: `stream-${sessionId}`,
        kind: 'message',
        seq,
        role: 'assistant',
        text: stream.text,
        streaming: true,
        sessionId,
      })
    }
  }
  if (sessionId !== null) {
    for (const card of cards) {
      if (card.sessionId === sessionId && !out.some(item => item.id === card.id)) out.push(card)
    }
  }
  return out
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
  if (sessionId === '') return null
  if (type === 'approval/requested') {
    const approvalId = typeof frame.approvalId === 'string' ? frame.approvalId : rpcId
    return {
      id: `approval-${rpcId || approvalId || sessionId}`,
      kind: 'approval',
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
  const [cards, setCards] = useState<readonly WorkbenchHistoryItem[]>([])
  const [status, setStatus] = useState<readonly BotStatusLive[]>([])
  const [epoch, setEpoch] = useState(0)
  const streams = useRef(new Map<string, string>())

  useEffect(() => {
    if (typeof EventSource === 'undefined') return
    let closed = false
    let source: EventSource | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    let delay = 500

    const bump = (): void => { setEpoch(n => n + 1) }

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
          const next = current.filter(item => item.botId !== botId)
          next.push(row)
          return next
        })
        return
      }
      if (type === 'session/event') {
        const sessionId = typeof frame.sessionId === 'string' ? frame.sessionId : ''
        const event = asRecord(frame.event)
        const eventType = typeof event.type === 'string' ? event.type : ''
        if (sessionId === '') return
        if (eventType === 'assistant/chunk') {
          const delta = chunkText(event)
          if (delta === '') return
          const next = `${streams.current.get(sessionId) ?? ''}${delta}`
          streams.current.set(sessionId, next)
          setStream({ sessionId, text: next })
          return
        }
        if (eventType === 'assistant/message') {
          streams.current.delete(sessionId)
          setStream(current => current?.sessionId === sessionId ? null : current)
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
        setSseReady(false)
        source?.close()
        source = undefined
        if (closed) return
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

  return { sseReady, stream, cards, status, epoch }
}
