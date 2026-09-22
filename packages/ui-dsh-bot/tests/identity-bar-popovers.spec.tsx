// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorkbenchBot, WorkbenchSessionRow } from 'dsh-bot-shared'
import { IdentityBar, resetIdentityPillCache } from '../src/client/IdentityBar.tsx'
import { observable } from '../src/client/observable.ts'
import { createOverlayStore } from '../src/client/overlay-store.ts'
import type { RosterRpc } from '../src/client/roster-rpc.ts'

const reviewer: WorkbenchBot = {
  id: 'reviewer',
  name: '代码审查官',
  avatar: { color: '#5b8def' },
  presetId: 'dsh-bot--reviewer',
  createdAt: 1,
  persona: '审代码的人设全文',
  protected: false,
}

const row: WorkbenchSessionRow = {
  sessionId: 's1',
  title: '来自 运维夜班',
  tags: [],
  status: 'idle',
  createdAt: 1,
  updatedAt: 2,
  hidden: false,
  working: false,
}

function fakeRoster(overrides: Partial<RosterRpc> = {}): RosterRpc {
  return {
    bots: observable({ status: 'idle' as const, error: null, items: [reviewer] }),
    groups: observable({ status: 'idle' as const, error: null, items: [] }),
    sessionsByBot: observable({}),
    historyBySession: observable({}),
    lastMessages: observable({}),
    refresh: vi.fn(),
    sessionsOf: vi.fn(async () => [row]),
    createBotSession: vi.fn(async () => ({ ok: true as const, value: { sessionId: 's-new', title: '新', botId: 'reviewer', presetId: 'dsh-bot--reviewer' } })),
    createGroupSession: vi.fn(),
    markRead: vi.fn(),
    updateBotLayout: vi.fn(),
    createBot: vi.fn(),
    updateBot: vi.fn(),
    deleteBot: vi.fn(),
    createGroup: vi.fn(),
    updateGroup: vi.fn(),
    deleteGroup: vi.fn(),
    memoryList: vi.fn(async () => ({ ok: true as const, value: { profile: [{ id: 'p1', text: '喜欢简洁 diff', ts: 1 }], log: [] } })),
    routineList: vi.fn(async () => ({ ok: true as const, value: [{ id: 'r1', botId: 'reviewer', name: '早间巡检', schedule: '0 6 * * *', instruction: '巡', enabled: true, notify: false }] })),
    peerLog: vi.fn(async () => ({ ok: true as const, value: [{ from: 'reviewer', to: 'poet', ts: 1, sessionId: 's1' }] })),
    historyOf: vi.fn(),
    ensurePreview: vi.fn(),
    setActive: vi.fn(),
    dispose: vi.fn(),
    ...overrides,
  } as unknown as RosterRpc
}

function sessionsFace(open = vi.fn()) {
  const snapshot = {
    byId: {
      s1: {
        agentPreset: 'dsh-bot--reviewer',
        displayTitle: '来自 运维夜班',
        retainedBy: { mainView: 1 },
      },
    },
  }
  return {
    openSession: (id: string) => {
      open(id)
    },
    list: {
      getSnapshot: () => snapshot,
      subscribe: () => () => {},
    },
  }
}

afterEach(() => {
  cleanup()
  resetIdentityPillCache()
})

describe('IdentityBar popovers', () => {
  it('prefetches three counts on mount and hides N until they arrive', async () => {
    let releaseMemory!: (value: unknown) => void
    const memoryPending = new Promise(resolve => { releaseMemory = resolve })
    const memoryList = vi.fn(() => memoryPending as Promise<{ ok: true; value: { profile: { id: string; text: string; ts: number }[]; log: never[] } }>)
    const routineList = vi.fn(async () => ({ ok: true as const, value: [] }))
    const peerLog = vi.fn(async () => ({ ok: true as const, value: [] }))
    const roster = fakeRoster({ memoryList, routineList, peerLog })
    render(<IdentityBar sessionId="s1" roster={roster} sessions={sessionsFace()} />)
    expect(memoryList).toHaveBeenCalledWith('reviewer')
    expect(routineList).toHaveBeenCalledWith('reviewer')
    expect(peerLog).toHaveBeenCalledWith('reviewer')
    expect(screen.getByTestId('dsh-bot-identity-memory').textContent).toBe('记忆')
    expect(screen.getByTestId('dsh-bot-identity-memory').textContent).not.toMatch(/\d/)
    expect(screen.getByTestId('dsh-bot-identity-routines').textContent).toBe('例程')
    expect(screen.getByTestId('dsh-bot-identity-peers').textContent).toBe('同事')
    releaseMemory({ ok: true, value: { profile: [{ id: 'p1', text: '喜欢简洁 diff', ts: 1 }], log: [] } })
    await waitFor(() => { expect(screen.getByTestId('dsh-bot-identity-memory').textContent).toBe('记忆 1') })
    await waitFor(() => { expect(screen.getByTestId('dsh-bot-identity-routines').textContent).toBe('例程 0') })
    await waitFor(() => { expect(screen.getByTestId('dsh-bot-identity-peers').textContent).toBe('同事 0') })
  })

  it('reuses prefetch for the memory panel body', async () => {
    const roster = fakeRoster()
    render(<IdentityBar sessionId="s1" roster={roster} sessions={sessionsFace()} />)
    await waitFor(() => { expect(screen.getByTestId('dsh-bot-identity-memory').textContent).toBe('记忆 1') })
    expect(roster.memoryList).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByTestId('dsh-bot-identity-memory'))
    await waitFor(() => { expect(screen.getByTestId('dsh-bot-identity-panel').textContent).toMatch(/喜欢简洁 diff/) })
    expect(roster.memoryList).toHaveBeenCalledTimes(1)
  })

  it('does not refetch counts when remounting the same bot within 30s', async () => {
    const roster = fakeRoster()
    const first = render(<IdentityBar sessionId="s1" roster={roster} sessions={sessionsFace()} />)
    await waitFor(() => { expect(roster.memoryList).toHaveBeenCalledTimes(1) })
    expect(roster.routineList).toHaveBeenCalledTimes(1)
    expect(roster.peerLog).toHaveBeenCalledTimes(1)
    first.unmount()
    render(<IdentityBar sessionId="s1" roster={roster} sessions={sessionsFace()} />)
    await waitFor(() => { expect(screen.getByTestId('dsh-bot-identity-memory').textContent).toBe('记忆 1') })
    expect(roster.memoryList).toHaveBeenCalledTimes(1)
    expect(roster.routineList).toHaveBeenCalledTimes(1)
    expect(roster.peerLog).toHaveBeenCalledTimes(1)
  })

  it('closes the panel on Escape', async () => {
    render(<IdentityBar sessionId="s1" roster={fakeRoster()} sessions={sessionsFace()} />)
    fireEvent.click(screen.getByTestId('dsh-bot-identity-persona'))
    expect(screen.getByTestId('dsh-bot-identity-panel')).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByTestId('dsh-bot-identity-panel')).toBeNull()
  })

  it('opens a listed session via jumpToSession', async () => {
    const open = vi.fn()
    render(<IdentityBar sessionId="s1" roster={fakeRoster()} sessions={sessionsFace(open)} />)
    fireEvent.click(screen.getByTestId('dsh-bot-identity-chats'))
    await waitFor(() => { expect(screen.getByTestId('dsh-bot-identity-session-s1')).toBeTruthy() })
    fireEvent.click(screen.getByTestId('dsh-bot-identity-session-s1'))
    expect(open).toHaveBeenCalledWith('s1')
  })

  it('disables new chat while createBotSession is in flight', async () => {
    let release!: (value: unknown) => void
    const pending = new Promise(resolve => { release = resolve })
    const createBotSession = vi.fn(() => pending as Promise<never>)
    const roster = fakeRoster({ createBotSession })
    render(<IdentityBar sessionId="s1" roster={roster} sessions={sessionsFace()} />)
    fireEvent.click(screen.getByTestId('dsh-bot-identity-newchat-inline'))
    fireEvent.click(screen.getByTestId('dsh-bot-identity-newchat-inline'))
    expect(createBotSession).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('dsh-bot-identity-newchat-inline').hasAttribute('disabled')).toBe(true)
    release({ ok: true, value: { sessionId: 's-new', title: '新', botId: 'reviewer', presetId: 'dsh-bot--reviewer' } })
    await waitFor(() => { expect(screen.getByTestId('dsh-bot-identity-newchat-inline').hasAttribute('disabled')).toBe(false) })
  })

  it('opens the edit overlay from the persona pill and the chip', () => {
    const overlay = createOverlayStore()
    render(<IdentityBar sessionId="s1" roster={fakeRoster()} sessions={sessionsFace()} overlay={overlay} />)
    fireEvent.click(screen.getByTestId('dsh-bot-identity-persona'))
    expect(screen.getByTestId('dsh-bot-identity-persona-text').textContent).toMatch(/审代码的人设全文/)
    fireEvent.click(screen.getByTestId('dsh-bot-identity-edit'))
    expect(overlay.getSnapshot()).toMatchObject({ kind: 'edit-bot', id: 'reviewer' })
    overlay.close()
    fireEvent.click(screen.getByTestId('dsh-bot-identity-chip'))
    expect(overlay.getSnapshot()).toMatchObject({ kind: 'edit-bot', id: 'reviewer' })
  })

  it('shows an error and retries a failed pill fetch', async () => {
    const memoryList = vi.fn()
      .mockResolvedValueOnce({ ok: false, error: { message: '网关不可达' } })
      .mockResolvedValueOnce({ ok: true, value: { profile: [{ id: 'p1', text: '已恢复', ts: 1 }], log: [] } })
    const roster = fakeRoster({ memoryList })
    render(<IdentityBar sessionId="s1" roster={roster} sessions={sessionsFace()} />)
    fireEvent.click(screen.getByTestId('dsh-bot-identity-memory'))
    await waitFor(() => { expect(screen.getByTestId('dsh-bot-identity-error').textContent).toMatch(/网关不可达/) })
    fireEvent.click(screen.getByTestId('dsh-bot-identity-retry'))
    await waitFor(() => { expect(screen.getByTestId('dsh-bot-identity-panel').textContent).toMatch(/已恢复/) })
    expect(memoryList).toHaveBeenCalledTimes(2)
  })
})
