// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorkbenchBot } from 'dsh-bot-shared'
import { IdentityBar, resetIdentityPillCache, resolveIdentityBot } from '../src/client/IdentityBar.tsx'
import { observable } from '../src/client/observable.ts'
import type { RosterRpc } from '../src/client/roster-rpc.ts'

const reviewer: WorkbenchBot = {
  id: 'reviewer',
  name: '代码审查官',
  avatar: { color: '#5b8def' },
  presetId: 'dsh-bot--reviewer',
  createdAt: 1,
  persona: '审',
  protected: false,
  unread: 2,
}

const seed: WorkbenchBot = {
  id: 'dsh-bot',
  name: 'DSH Bot',
  avatar: { color: '#111' },
  presetId: 'dsh-bot',
  createdAt: 1,
  persona: '默认',
  protected: true,
}

function fakeRoster(bots: readonly WorkbenchBot[], status: 'loading' | 'idle' | 'error' = 'idle'): RosterRpc {
  return {
    bots: observable({ status, error: null, items: bots }),
    groups: observable({ status: 'idle' as const, error: null, items: [] }),
    sessionsByBot: observable({}),
    historyBySession: observable({}),
    lastMessages: observable({}),
    refresh: vi.fn(),
    sessionsOf: vi.fn(async () => []),
    createBotSession: vi.fn(),
    createGroupSession: vi.fn(),
    markRead: vi.fn(async () => ({ ok: true as const, value: { ok: true as const, unread: 0 } })),
    updateBotLayout: vi.fn(),
    createBot: vi.fn(),
    updateBot: vi.fn(),
    deleteBot: vi.fn(),
    createGroup: vi.fn(),
    updateGroup: vi.fn(),
    deleteGroup: vi.fn(),
    memoryList: vi.fn(async () => ({ ok: true as const, value: { profile: [], log: [] } })),
    routineList: vi.fn(async () => ({ ok: true as const, value: [] })),
    peerLog: vi.fn(async () => ({ ok: true as const, value: [] })),
    historyOf: vi.fn(),
    ensurePreview: vi.fn(),
    setActive: vi.fn(),
    dispose: vi.fn(),
  } as unknown as RosterRpc
}

function sessions(byId: Record<string, { agentPreset?: string; running?: boolean }>, current = 's1') {
  const snapshot = { current, byId }
  return {
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

describe('resolveIdentityBot', () => {
  it('matches dsh-bot and dsh-bot-- presets and rejects the rest', () => {
    expect(resolveIdentityBot('s1', [reviewer], 'idle', { s1: { agentPreset: 'dsh-bot--reviewer' } })?.id).toBe('reviewer')
    expect(resolveIdentityBot('s1', [seed], 'idle', { s1: { agentPreset: 'dsh-bot' } })?.id).toBe('dsh-bot')
    expect(resolveIdentityBot('s1', [reviewer], 'idle', { s1: { agentPreset: 'standard' } })).toBeNull()
    expect(resolveIdentityBot('s1', [reviewer], 'idle', { s1: { agentPreset: 'dsh-bot--gone' } })).toBeNull()
    expect(resolveIdentityBot('s1', [], 'loading', { s1: { agentPreset: 'dsh-bot--reviewer' } })).toBeNull()
  })
})

describe('IdentityBar', () => {
  it('renders the chip for a matching bot session', () => {
    render(
      <IdentityBar
        sessionId="s1"
        roster={fakeRoster([reviewer])}
        sessions={sessions({ s1: { agentPreset: 'dsh-bot--reviewer', running: true } })}
      />,
    )
    expect(screen.getByTestId('dsh-bot-identity-chip').textContent).toMatch(/代码审查官/)
    expect(screen.getByTestId('dsh-bot-identity-working')).toBeTruthy()
  })

  it('returns null for a plain session', () => {
    const { container } = render(
      <IdentityBar
        sessionId="s1"
        roster={fakeRoster([reviewer])}
        sessions={sessions({ s1: { agentPreset: 'standard' } })}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('returns null when the preset has no roster match', () => {
    const { container } = render(
      <IdentityBar
        sessionId="s1"
        roster={fakeRoster([reviewer])}
        sessions={sessions({ s1: { agentPreset: 'dsh-bot--gone' } })}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('returns null while the roster is still loading', () => {
    const { container } = render(
      <IdentityBar
        sessionId="s1"
        roster={fakeRoster([], 'loading')}
        sessions={sessions({ s1: { agentPreset: 'dsh-bot--reviewer' } })}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('marks the bot read when the chip appears with unread', async () => {
    const roster = fakeRoster([reviewer])
    render(
      <IdentityBar
        sessionId="s1"
        roster={roster}
        sessions={sessions({ s1: { agentPreset: 'dsh-bot--reviewer' } })}
      />,
    )
    await waitFor(() => { expect(roster.markRead).toHaveBeenCalledWith('reviewer') })
  })
})
