// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorkbenchHistoryItem } from 'dsh-bot-shared'
import { observable } from '../src/client/observable.ts'
import type { HistorySlice, RosterRpc } from '../src/client/roster-rpc.ts'
import { wakesFromOfficialEvents } from '../src/client/roster-rpc.ts'
import { matchRoutineTurn, RoutineTurnTail } from '../src/client/RoutineTurnTail.tsx'

function index(items: readonly WorkbenchHistoryItem[]): HistorySlice {
  const bySeq: Record<number, WorkbenchHistoryItem> = {}
  const routineBySeq: Record<number, WorkbenchHistoryItem> = {}
  for (const item of items) {
    bySeq[item.seq] = item
    if (item.origin === 'routine') routineBySeq[item.seq] = item
  }
  return { status: 'idle', error: null, items, bySeq, routineBySeq }
}

const routineItem: WorkbenchHistoryItem = {
  id: 'message-15-1',
  kind: 'message',
  seq: 15,
  role: 'assistant',
  text: '今晚值班日志看过了',
  origin: 'routine',
  name: '早间巡检',
}

function rosterWith(items: readonly WorkbenchHistoryItem[]): Pick<RosterRpc, 'historyBySession'> & RosterRpc {
  return {
    historyBySession: observable({ s1: index(items) }),
    bots: observable({ status: 'idle' as const, error: null, items: [] }),
    groups: observable({ status: 'idle' as const, error: null, items: [] }),
    sessionsByBot: observable({}),
    lastMessages: observable({}),
    refresh: vi.fn(),
    sessionsOf: vi.fn(),
    createBotSession: vi.fn(),
    createGroupSession: vi.fn(),
    markRead: vi.fn(),
    updateBotLayout: vi.fn(),
    createBot: vi.fn(),
    updateBot: vi.fn(),
    deleteBot: vi.fn(),
    createGroup: vi.fn(),
    updateGroup: vi.fn(),
    deleteGroup: vi.fn(),
    memoryList: vi.fn(),
    routineList: vi.fn(),
    peerLog: vi.fn(),
    historyOf: vi.fn(),
    ensurePreview: vi.fn(),
    setActive: vi.fn(),
    dispose: vi.fn(),
  } as unknown as RosterRpc
}

function sessions(preset: string, current = 's1') {
  const snapshot = { current, byId: { [current]: { agentPreset: preset } } }
  return {
    list: {
      getSnapshot: () => snapshot,
      subscribe: () => () => {},
    },
  }
}

const owner = { turn: { start: { seq: 10 }, end: { seq: 20 } }, seq: 15 }

afterEach(() => {
  cleanup()
})

describe('matchRoutineTurn', () => {
  it('hits a routine item whose seq is inside the official turn interval', () => {
    const roster = rosterWith([routineItem])
    expect(matchRoutineTurn(owner, roster, sessions('dsh-bot--ops'))).toEqual({ routineName: '早间巡检' })
    expect(matchRoutineTurn(owner, roster, sessions('dsh-bot'))).toEqual({ routineName: '早间巡检' })
  })

  it('misses when seq is outside the turn, history is empty, or the session is not a bot', () => {
    const roster = rosterWith([routineItem])
    expect(matchRoutineTurn({ turn: { start: { seq: 1 }, end: { seq: 5 } }, seq: 4 }, roster, sessions('dsh-bot--ops'))).toBeNull()
    expect(matchRoutineTurn(owner, rosterWith([]), sessions('dsh-bot--ops'))).toBeNull()
    expect(matchRoutineTurn(owner, roster, sessions('standard'))).toBeNull()
  })
})

describe('RoutineTurnTail', () => {
  it('renders 例程触发 · {name}', () => {
    render(<RoutineTurnTail matched={{ routineName: '早间巡检' }} />)
    expect(screen.getByTestId('dsh-bot-routine-tail').textContent).toBe('例程触发 · 早间巡检')
  })

  it('recomputes the label from the history store after inject subscriptions', () => {
    const roster = rosterWith([routineItem])
    render(<RoutineTurnTail turn={owner.turn} seq={15} roster={roster} sessions={sessions('dsh-bot--ops')} />)
    expect(screen.getByTestId('dsh-bot-routine-tail').textContent).toBe('例程触发 · 早间巡检')
  })
})

describe('wakesFromOfficialEvents', () => {
  it('indexes official [routine] user/message seqs for interval match', () => {
    const wakes = wakesFromOfficialEvents([
      { event: { type: 'turn/start', seq: 5, data: { turn: 1 } } },
      { event: { type: 'user/message', seq: 8, data: { content: [{ type: 'text', text: '[routine] 通知副线\n用户交代：只说一句' }] } } },
      { event: { type: 'assistant/message', seq: 36, data: { turn: 1 } } },
      { event: { type: 'turn/end', seq: 38, data: { turn: 1 } } },
    ])
    expect(wakes).toEqual([expect.objectContaining({ seq: 8, origin: 'routine', name: '通知副线' })])
    const roster = rosterWith([])
    roster.historyBySession.set({ s1: index(wakes) })
    expect(matchRoutineTurn({ turn: { start: { seq: 5 }, end: { seq: 38 } }, seq: 36 }, roster, sessions('dsh-bot--yunwei-yeban'))).toEqual({ routineName: '通知副线' })
  })
})
