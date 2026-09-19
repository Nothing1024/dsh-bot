// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mergeHistoryItems, POLL_IDLE_MS, POLL_WORKING_MS, useSessionPoll } from '../src/useSessionPoll.ts'
import type { HistoryValue, RpcResult, WorkbenchHistoryItem } from '../src/api.ts'

function Probe(props: {
  sessionId: string | null
  enabled: boolean
  sseReady?: boolean
  load: (sessionId: string, sinceSeq?: number) => Promise<RpcResult<HistoryValue>>
}) {
  const state = useSessionPoll(props)
  return (
    <div>
      <span data-testid="poll-working">{String(state.working)}</span>
      <span data-testid="poll-count">{state.items.length}</span>
      <span data-testid="poll-ids">{state.items.map(item => item.id).join(',')}</span>
    </div>
  )
}

describe('useSessionPoll', () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  })

  it('drops the busy flag when a poll fails, so a gone session cannot freeze the composer', async () => {
    vi.useFakeTimers()
    let failing = false
    const load = vi.fn(async (): Promise<RpcResult<HistoryValue>> => {
      if (failing) return { ok: false, error: { code: 'not-found', message: 'session missing' } }
      return { ok: true, value: { sessionId: 's1', working: true, items: [] } }
    })
    render(<Probe sessionId="s1" enabled sseReady={false} load={load} />)
    await act(async () => { await Promise.resolve() })
    expect(screen.getByTestId('poll-working').textContent).toBe('true')
    failing = true
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_IDLE_MS) })
    expect(screen.getByTestId('poll-working').textContent).toBe('false')
  })

  it('polls every 2s idle and 1s while working, and pauses when hidden', async () => {
    vi.useFakeTimers()
    let working = false
    const load = vi.fn(async (): Promise<RpcResult<HistoryValue>> => ({
      ok: true,
      value: {
        sessionId: 's1',
        working,
        items: working
          ? [{ id: 'm1', kind: 'message', seq: 1, role: 'user', text: 'q' }]
          : [],
      },
    }))
    render(<Probe sessionId="s1" enabled load={load} />)
    await act(async () => {
      await Promise.resolve()
    })
    expect(load).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_IDLE_MS)
    })
    expect(load).toHaveBeenCalledTimes(2)

    working = true
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_IDLE_MS)
    })
    expect(screen.getByTestId('poll-working').textContent).toBe('true')

    const afterWorking = load.mock.calls.length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_WORKING_MS)
    })
    expect(load.mock.calls.length).toBe(afterWorking + 1)

    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    const pausedAt = load.mock.calls.length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_WORKING_MS * 3)
    })
    expect(load.mock.calls.length).toBe(pausedAt)
  })

  it('does not schedule further polls when sseReady', async () => {
    vi.useFakeTimers()
    const load = vi.fn(async (): Promise<RpcResult<HistoryValue>> => ({
      ok: true,
      value: { sessionId: 's1', working: false, items: [] },
    }))
    render(<Probe sessionId="s1" enabled sseReady load={load} />)
    await act(async () => {
      await Promise.resolve()
    })
    expect(load).toHaveBeenCalledTimes(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_IDLE_MS * 3)
    })
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('replaces the inclusive last seq instead of duplicating thinking/assistant rows', async () => {
    vi.useFakeTimers()
    const full: WorkbenchHistoryItem[] = [
      { id: 'message-8-1', kind: 'message', seq: 8, role: 'user', text: '你是谁?' },
      { id: 'thinking-55-1', kind: 'thinking', seq: 55, text: 'think' },
      { id: 'message-55-1', kind: 'message', seq: 55, role: 'assistant', text: '我是诗人小北' },
    ]
    const overlapping: WorkbenchHistoryItem[] = [
      { id: 'thinking-55-1', kind: 'thinking', seq: 55, text: 'think' },
      { id: 'message-55-1', kind: 'message', seq: 55, role: 'assistant', text: '我是诗人小北' },
    ]
    let page = 0
    const load = vi.fn(async (_id: string, _sinceSeq?: number): Promise<RpcResult<HistoryValue>> => {
      page += 1
      return {
        ok: true,
        value: {
          sessionId: 's1',
          working: false,
          items: page === 1 ? full : overlapping,
        },
      }
    })
    render(<Probe sessionId="s1" enabled load={load} />)
    await act(async () => { await Promise.resolve() })
    expect(screen.getByTestId('poll-count').textContent).toBe('3')
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_IDLE_MS) })
    expect(load.mock.calls[1]?.[1]).toBe(55)
    expect(screen.getByTestId('poll-count').textContent).toBe('3')
    expect(screen.getByTestId('poll-ids').textContent).toBe('message-8-1,thinking-55-1,message-55-1')
  })
})

describe('mergeHistoryItems', () => {
  it('keeps prior seqs and replaces overlapping last-seq rows even when ids shift', () => {
    const current: WorkbenchHistoryItem[] = [
      { id: 'message-8-1', kind: 'message', seq: 8, role: 'user', text: '你是谁?' },
      { id: 'thinking-55-2', kind: 'thinking', seq: 55, text: 'think' },
      { id: 'message-55-3', kind: 'message', seq: 55, role: 'assistant', text: '我是诗人小北' },
    ]
    const incoming: WorkbenchHistoryItem[] = [
      { id: 'thinking-55-1', kind: 'thinking', seq: 55, text: 'think' },
      { id: 'message-55-2', kind: 'message', seq: 55, role: 'assistant', text: '我是诗人小北' },
    ]
    const merged = mergeHistoryItems(current, incoming, true)
    expect(merged.map(item => item.id)).toEqual(['message-8-1', 'thinking-55-1', 'message-55-2'])
  })

  it('keeps the current array when an incremental page is empty', () => {
    const current: WorkbenchHistoryItem[] = [
      { id: 'message-8-1', kind: 'message', seq: 8, role: 'user', text: '你是谁?' },
    ]
    expect(mergeHistoryItems(current, [], true)).toBe(current)
  })
})

