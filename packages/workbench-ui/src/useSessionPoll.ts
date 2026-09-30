/**
 * Transcript poll: 2s idle / 1s while working; pause when document.hidden.
 * Once SSE is ready it stops, or slows to `sseIntervalMs` when set.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { HistoryValue, RpcResult, WorkbenchHistoryItem, WorkbenchWireError } from './api.ts'

const IDLE_MS = 2000
const WORKING_MS = 1000

export interface SessionPollState {
  readonly items: readonly WorkbenchHistoryItem[]
  readonly working: boolean
  readonly error: WorkbenchWireError | null
  readonly ready: boolean
  readonly speaking: NonNullable<HistoryValue['speaking']> | null
  readonly round: number | null
  readonly rounds: number | null
}

export interface UseSessionPollOptions {
  readonly incremental?: boolean
  readonly sessionId: string | null
  readonly enabled: boolean
  readonly sseReady?: boolean
  /** Safety cadence while SSE is ready; omitted = no timed polls then. */
  readonly sseIntervalMs?: number
  /** `signal` aborts when a newer request supersedes this one. */
  readonly load: (sessionId: string, sinceSeq: number | undefined, signal: AbortSignal) => Promise<RpcResult<HistoryValue>>
}

function maxSeq(items: readonly WorkbenchHistoryItem[]): number | undefined {
  let max = Number.NEGATIVE_INFINITY
  for (const item of items) {
    if (item.seq > max) max = item.seq
  }
  return Number.isFinite(max) ? max : undefined
}

/**
 * Incremental pages are inclusive of `sinceSeq` (session-tool skips seq <
 * sinceSeq). Replace every item whose seq appears in `incoming` so the last
 * in-flight turn updates in place instead of duplicating.
 */
function sameHistoryItem(a: WorkbenchHistoryItem, b: WorkbenchHistoryItem): boolean {
  return a.id === b.id
    && a.kind === b.kind
    && a.seq === b.seq
    && a.role === b.role
    && a.text === b.text
    && a.pending === b.pending
    && a.cancelledAt === b.cancelledAt
    && a.streaming === b.streaming
    && a.name === b.name
    && a.summary === b.summary
}

function sameHistoryItems(
  current: readonly WorkbenchHistoryItem[],
  next: readonly WorkbenchHistoryItem[],
): boolean {
  return current.length === next.length
    && current.every((item, index) => sameHistoryItem(item, next[index]!))
}

export function mergeHistoryItems(
  current: readonly WorkbenchHistoryItem[],
  incoming: readonly WorkbenchHistoryItem[],
  incremental: boolean,
): WorkbenchHistoryItem[] {
  if (!incremental) {
    return sameHistoryItems(current, incoming) ? current as WorkbenchHistoryItem[] : [...incoming]
  }
  if (incoming.length === 0) return current as WorkbenchHistoryItem[]
  const replaced = new Set(incoming.map(item => item.seq))
  const kept = current.filter(item => !replaced.has(item.seq))
  const next = [...kept, ...incoming]
  return sameHistoryItems(current, next) ? current as WorkbenchHistoryItem[] : next
}

/**
 * Poll `history` for one session. `sinceSeq` is used after the first page.
 */
export function useSessionPoll(options: UseSessionPollOptions): SessionPollState & { refresh: () => void } {
  const { sessionId, enabled, load, sseReady = false, sseIntervalMs, incremental = true } = options
  const [items, setItems] = useState<readonly WorkbenchHistoryItem[]>([])
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<WorkbenchWireError | null>(null)
  const [speaking, setSpeaking] = useState<SessionPollState['speaking']>(null)
  const [round, setRound] = useState<number | null>(null)
  const [rounds, setRounds] = useState<number | null>(null)
  const [ready, setReady] = useState(sessionId === null || !enabled)
  const itemsRef = useRef(items)
  itemsRef.current = items
  const loadRef = useRef(load)
  loadRef.current = load
  const workingRef = useRef(working)
  workingRef.current = working
  const tick = useRef(0)
  const inFlight = useRef<AbortController | null>(null)

  const pull = useCallback(async (full: boolean): Promise<void> => {
    const id = sessionId
    if (id === null || !enabled) return
    const request = ++tick.current
    // Only the newest request matters; drop the superseded one on the wire too.
    inFlight.current?.abort()
    const controller = new AbortController()
    inFlight.current = controller
    const sinceSeq = full || !incremental ? undefined : maxSeq(itemsRef.current)
    const outcome = await loadRef.current(id, sinceSeq, controller.signal)
    if (inFlight.current === controller) inFlight.current = null
    // A superseded request (aborted or not) never reaches state, so `aborted` is never shown.
    if (request !== tick.current || controller.signal.aborted) return
    if (!outcome.ok) {
      setError(outcome.error)
      // A failing poll is not evidence a turn is still running: the last
      // snapshot may be much older than the failure. Keeping the busy flag
      // here is what freezes the composer on "停止" forever once a session is
      // gone (or the gateway restarted under an open page).
      workingRef.current = false
      setWorking(false)
      setReady(true)
      return
    }
    setError(null)
    const nextWorking = outcome.value.working === true
    workingRef.current = nextWorking
    setWorking(current => current === nextWorking ? current : nextWorking)
    const speaking = outcome.value.speaking ?? null
    setSpeaking(current => (
      current?.botId === speaking?.botId && current?.name === speaking?.name
        && current?.sessionId === speaking?.sessionId && current?.afterSeq === speaking?.afterSeq
        && current?.afterSessionSeq === speaking?.afterSessionSeq ? current : speaking
    ))
    const nextRound = typeof outcome.value.round === 'number' ? outcome.value.round : null
    const nextRounds = typeof outcome.value.rounds === 'number' ? outcome.value.rounds : null
    setRound(current => current === nextRound ? current : nextRound)
    setRounds(current => current === nextRounds ? current : nextRounds)
    const incoming = Array.isArray(outcome.value.items) ? outcome.value.items : []
    setItems(current => mergeHistoryItems(current, incoming, sinceSeq !== undefined))
    setReady(true)
  }, [enabled, sessionId, incremental])

  /** Full snapshot without clearing first (avoids an empty-transcript flash). */
  const refresh = useCallback((): void => {
    void pull(true)
  }, [pull])

  useEffect(() => {
    tick.current += 1
    setItems([])
    setWorking(false)
    setSpeaking(null)
    setRound(null)
    setRounds(null)
    setError(null)
    setReady(sessionId === null || !enabled)
    if (sessionId === null || !enabled) return
    void pull(true)
    return () => {
      tick.current += 1
      inFlight.current?.abort()
      inFlight.current = null
    }
  }, [enabled, pull, sessionId])

  useEffect(() => {
    if (sessionId === null || !enabled || (sseReady && sseIntervalMs === undefined)) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const delay = (): number => sseReady && sseIntervalMs !== undefined
      ? sseIntervalMs
      : workingRef.current ? WORKING_MS : IDLE_MS
    const schedule = (): void => {
      // One armed timer at most, even if a visibility refresh and a tick race.
      if (timer !== undefined) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = undefined
        void (async () => {
          if (cancelled) return
          // Hidden: stop; visibilitychange re-arms the loop.
          if (typeof document !== 'undefined' && document.hidden) return
          await pull(false)
          if (!cancelled) schedule()
        })()
      }, delay())
    }
    const onVis = (): void => {
      if (typeof document === 'undefined' || document.hidden || cancelled) return
      if (timer !== undefined) clearTimeout(timer)
      timer = undefined
      void (async () => {
        await pull(false)
        if (!cancelled && timer === undefined) schedule()
      })()
    }
    document.addEventListener('visibilitychange', onVis)
    schedule()
    return () => {
      cancelled = true
      if (timer !== undefined) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [enabled, pull, sessionId, sseReady, sseIntervalMs])

  return { items, working, error, ready, speaking, round, rounds, refresh }
}

export const POLL_IDLE_MS = IDLE_MS
export const POLL_WORKING_MS = WORKING_MS
