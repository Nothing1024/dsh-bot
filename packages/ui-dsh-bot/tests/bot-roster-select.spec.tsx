// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LAST_SESSION_KEY_PREFIX, writeLastSession } from 'dsh-bot-shared'
import type { WorkbenchSessionRow } from 'dsh-bot-shared'
import { BotRoster } from '../src/client/BotRoster.tsx'
import { LAST_BOT_KEY } from '../src/client/roster-items.ts'
import { selectBot } from '../src/client/select-bot.ts'
import type { WorkbenchBot } from 'dsh-bot-shared'

const bot: WorkbenchBot = {
  id: 'reviewer',
  name: '代码审查官',
  avatar: { color: '#5b8def' },
  presetId: 'dsh-bot--reviewer',
  createdAt: 1,
  persona: '审',
  protected: false,
}

function row(id: string, updatedAt: number, hidden = false): WorkbenchSessionRow {
  return {
    sessionId: id,
    title: id,
    tags: [],
    status: 'idle',
    createdAt: updatedAt,
    updatedAt,
    hidden,
    working: false,
  }
}

afterEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
})

describe('selectBot', () => {
  it('opens the remembered last session', async () => {
    writeLastSession('reviewer', 's-old')
    const open = vi.fn()
    const markRead = vi.fn(async () => ({ ok: true as const, unread: 0 }))
    const result = await selectBot('reviewer', {
      sessionsOf: async () => [row('s-new', 2), row('s-old', 1)],
      createBotSession: async () => { throw new Error('should not create') },
      markRead,
      sessions: { openSession: open },
    })
    expect(result.ok).toBe(true)
    expect(result.sessionId).toBe('s-old')
    expect(open).toHaveBeenCalledWith('s-old')
    expect(markRead).toHaveBeenCalledWith('reviewer')
    expect(localStorage.getItem(LAST_BOT_KEY)).toBe('reviewer')
    expect(localStorage.getItem(`${LAST_SESSION_KEY_PREFIX}reviewer`)).toBe('s-old')
  })

  it('falls back to the newest visible session', async () => {
    const open = vi.fn()
    const result = await selectBot('reviewer', {
      sessionsOf: async () => [row('s-new', 2), row('s-old', 1), row('s-hid', 3, true)],
      createBotSession: async () => { throw new Error('should not create') },
      markRead: async () => ({ ok: true as const, unread: 0 }),
      sessions: { openSession: open },
    })
    expect(result.sessionId).toBe('s-new')
    expect(open).toHaveBeenCalledWith('s-new')
  })

  it('creates a session when none are visible', async () => {
    const open = vi.fn()
    const create = vi.fn(async () => ({ ok: true as const, value: { sessionId: 's-fresh', title: '新对话', botId: 'reviewer', presetId: 'dsh-bot--reviewer' } }))
    const result = await selectBot('reviewer', {
      sessionsOf: async () => [],
      createBotSession: create,
      markRead: async () => ({ ok: true as const, unread: 0 }),
      sessions: { openSession: open },
    })
    expect(create).toHaveBeenCalledTimes(1)
    expect(open).toHaveBeenCalledWith('s-fresh')
    expect(result.ok).toBe(true)
  })

  it('returns a host-missing error without creating', async () => {
    const create = vi.fn()
    const result = await selectBot('reviewer', {
      sessionsOf: async () => [],
      createBotSession: create,
      markRead: async () => ({ ok: true as const, unread: 0 }),
    })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/宿主不支持打开会话/)
    expect(create).not.toHaveBeenCalled()
  })

  it('coalesces concurrent creates through the caller lock and shows retry', async () => {
    let creates = 0
    let release!: () => void
    const hold = new Promise<void>(resolve => { release = resolve })
    const create = vi.fn(async () => {
      creates += 1
      await hold
      return { ok: true as const, value: { sessionId: 's-fresh', title: '新对话', botId: 'reviewer', presetId: 'x' } }
    })
    const first = selectBot('reviewer', {
      sessionsOf: async () => [],
      createBotSession: create,
      markRead: async () => ({ ok: true as const, unread: 0 }),
      sessions: { openSession: vi.fn() },
    })
    const second = selectBot('reviewer', {
      sessionsOf: async () => [],
      createBotSession: create,
      markRead: async () => ({ ok: true as const, unread: 0 }),
      sessions: { openSession: vi.fn() },
    })
    release()
    await Promise.all([first, second])
    expect(creates).toBe(2)
    render(
      <BotRoster
        bots={[bot]}
        selectedId="reviewer"
        nestedError="凭据缺失"
        nestedStatus="error"
        onRetrySelect={vi.fn()}
      />,
    )
    expect(screen.getByTestId('dsh-bot-select-retry')).toBeTruthy()
    fireEvent.click(screen.getByTestId('dsh-bot-select-retry'))
  })
})
