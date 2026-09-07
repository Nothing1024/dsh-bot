/**
 * Transcript poll: 2s idle / 1s while working; pause when document.hidden.
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
  readonly speaking: { readonly botId: string; readonly name: string } | null
}

export interface UseSessionPollOptions {
  readonly sessionId: string | null
  readonly enabled: boolean
  readonly sseReady?: boolean
  readonly load: (sessionId: string, sinceSeq?: number) => Promise<RpcResult<HistoryValue>>
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
  const { sessionId, enabled, load, sseReady = false } = options
  const [items, setItems] = useState<readonly WorkbenchHistoryItem[]>([])
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<WorkbenchWireError | null>(null)
  const [speaking, setSpeaking] = useState<{ readonly botId: string; readonly name: string } | null>(null)
  const [ready, setReady] = useState(sessionId === null || !enabled)
  const itemsRef = useRef(items)
  itemsRef.current = items
  const loadRef = useRef(load)
  loadRef.current = load
  const workingRef = useRef(working)
  workingRef.current = working
  const tick = useRef(0)

  const pull = useCallback(async (full: boolean): Promise<void> => {
    const id = sessionId
    if (id === null || !enabled) return
    const sinceSeq = full ? undefined : maxSeq(itemsRef.current)
    const outcome = await loadRef.current(id, sinceSeq)
    if (!outcome.ok) {
      setError(outcome.error)
      setReady(true)
      return
    }
    setError(null)
    const nextWorking = outcome.value.working === true
    workingRef.current = nextWorking
    setWorking(current => current === nextWorking ? current : nextWorking)
    const speaking = outcome.value.speaking ?? null
    setSpeaking(current => (
      current?.botId === speaking?.botId && current?.name === speaking?.name ? current : speaking
    ))
    const incoming = Array.isArray(outcome.value.items) ? outcome.value.items : []
    setItems(current => mergeHistoryItems(current, incoming, sinceSeq !== undefined))
    setReady(true)
  }, [enabled, sessionId])

  /** Full snapshot without clearing first (avoids an empty-transcript flash). */
  const refresh = useCallback((): void => {
    tick.current += 1
    void pull(true)
  }, [pull])

  useEffect(() => {
    tick.current += 1
    setItems([])
    setWorking(false)
    setSpeaking(null)
    setError(null)
    setReady(sessionId === null || !enabled)
    if (sessionId === null || !enabled) return
    void pull(true)
  }, [enabled, pull, sessionId])

  useEffect(() => {
    if (sessionId === null || !enabled || sseReady) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const delay = (): number => (workingRef.current ? WORKING_MS : IDLE_MS)
    const schedule = (): void => {
      timer = setTimeout(() => {
        void (async () => {
          if (cancelled) return
          if (typeof document !== 'undefined' && document.hidden) {
            schedule()
            return
          }
          await pull(false)
          if (!cancelled) schedule()
        })()
      }, delay())
    }
    const onVis = (): void => {
      if (typeof document !== 'undefined' && !document.hidden) void pull(false)
    }
    document.addEventListener('visibilitychange', onVis)
    schedule()
    return () => {
      cancelled = true
      if (timer !== undefined) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [enabled, pull, sessionId, sseReady])

  return { items, working, error, ready, speaking, refresh }
}

export const POLL_IDLE_MS = IDLE_MS
export const POLL_WORKING_MS = WORKING_MS
