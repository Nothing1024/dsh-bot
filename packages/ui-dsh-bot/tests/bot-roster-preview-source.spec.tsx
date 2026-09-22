// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorkbenchBot, WorkbenchHistoryItem } from 'dsh-bot-shared'
import { BoundBotRegion } from '../src/client/BoundRoster.tsx'
import { pickLatestBotSession } from '../src/client/bot-preset.ts'
import { createOverlayStore } from '../src/client/overlay-store.ts'
import { createRosterRpc } from '../src/client/roster-rpc.ts'
import { createSidebarMode } from '../src/client/sidebar-mode.ts'

const BOT: WorkbenchBot = {
  id: 'reviewer',
  name: '代码审查官',
  avatar: { color: '#5b8def' },
  presetId: 'dsh-bot--reviewer',
  createdAt: 1,
  persona: '审代码',
  protected: false,
}

function jsonOk(value: unknown): { json: () => Promise<unknown> } {
  return { json: async () => ({ ok: true, value }) }
}

function message(seq: number, text: string): WorkbenchHistoryItem {
  return { id: `m${seq}`, kind: 'message', seq, text }
}

function historyFetch(itemsBySession: Record<string, readonly WorkbenchHistoryItem[]>, calls: string[]) {
  return vi.fn(async (url: string, init?: { body?: string }) => {
    const path = String(url)
    calls.push(path)
    if (path.includes('listBots')) return jsonOk({ bots: [BOT] })
    if (path.includes('listGroups')) return jsonOk({ groups: [] })
    if (path.includes('routineList')) return jsonOk([])
    if (path.includes('history')) {
      const sessionId = JSON.parse(String(init?.body ?? '{}')).args?.sessionId as string
      return jsonOk({ sessionId, items: itemsBySession[sessionId] ?? [], working: false })
    }
    return jsonOk({})
  })
}

afterEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
})

describe('ensurePreview', () => {
  it('does not refetch the same sessionId:updatedAt key', async () => {
    const calls: string[] = []
    const fetchMock = historyFetch({ s1: [message(1, '  first line  ')] }, calls)
    const rpc = createRosterRpc({ fetch: fetchMock as unknown as typeof fetch })
    rpc.setActive(true)
    rpc.ensurePreview('reviewer', 's1', 10)
    await waitFor(() => { expect(rpc.lastMessages.getSnapshot().reviewer).toBe('first line') })
    const historyCalls = calls.filter(url => url.includes('history')).length
    rpc.ensurePreview('reviewer', 's1', 10)
    await Promise.resolve()
    expect(calls.filter(url => url.includes('history')).length).toBe(historyCalls)
    rpc.dispose()
  })

  it('refetches when updatedAt changes', async () => {
    const calls: string[] = []
    const items: Record<string, WorkbenchHistoryItem[]> = { s1: [message(1, 'old')] }
    const fetchMock = historyFetch(items, calls)
    const rpc = createRosterRpc({ fetch: fetchMock as unknown as typeof fetch })
    rpc.setActive(true)
    rpc.ensurePreview('reviewer', 's1', 10)
    await waitFor(() => { expect(rpc.lastMessages.getSnapshot().reviewer).toBe('old') })
    items.s1 = [message(2, 'new last')]
    rpc.ensurePreview('reviewer', 's1', 20)
    await waitFor(() => { expect(rpc.lastMessages.getSnapshot().reviewer).toBe('new last') })
    expect(calls.filter(url => url.includes('history')).length).toBe(2)
    rpc.dispose()
  })

  it('leaves the preview empty when history has no message text', async () => {
    const calls: string[] = []
    const fetchMock = historyFetch({
      s1: [
        { id: 't1', kind: 'thinking', seq: 1, text: 'notes' },
        { id: 'm2', kind: 'message', seq: 2, text: '   ' },
      ],
    }, calls)
    const rpc = createRosterRpc({ fetch: fetchMock as unknown as typeof fetch })
    rpc.setActive(true)
    rpc.ensurePreview('reviewer', 's1', 10)
    await waitFor(() => { expect(Object.hasOwn(rpc.lastMessages.getSnapshot(), 'reviewer')).toBe(true) })
    expect(rpc.lastMessages.getSnapshot().reviewer).toBe('')
    rpc.dispose()
  })

  it('skips a trailing JSON dump and uses the previous message text', async () => {
    const calls: string[] = []
    const fetchMock = historyFetch({
      s1: [
        message(1, 'remember this'),
        message(2, '{"ok":true,"tool":"receipt"}'),
      ],
    }, calls)
    const rpc = createRosterRpc({ fetch: fetchMock as unknown as typeof fetch })
    rpc.setActive(true)
    rpc.ensurePreview('reviewer', 's1', 10)
    await waitFor(() => { expect(rpc.lastMessages.getSnapshot().reviewer).toBe('remember this') })
    rpc.dispose()
  })

  it('leaves the preview empty when every message is a JSON dump', async () => {
    const calls: string[] = []
    const fetchMock = historyFetch({
      s1: [
        message(1, '[1,2,3]'),
        message(2, '  {"status":"done"}  '),
      ],
    }, calls)
    const rpc = createRosterRpc({ fetch: fetchMock as unknown as typeof fetch })
    rpc.setActive(true)
    rpc.ensurePreview('reviewer', 's1', 10)
    await waitFor(() => { expect(Object.hasOwn(rpc.lastMessages.getSnapshot(), 'reviewer')).toBe(true) })
    expect(rpc.lastMessages.getSnapshot().reviewer).toBe('')
    rpc.dispose()
  })

  it('does not send history after setActive(false)', async () => {
    const calls: string[] = []
    const fetchMock = historyFetch({ s1: [message(1, 'hi')] }, calls)
    const rpc = createRosterRpc({ fetch: fetchMock as unknown as typeof fetch })
    rpc.setActive(false)
    rpc.ensurePreview('reviewer', 's1', 10)
    await Promise.resolve()
    expect(calls.filter(url => url.includes('history'))).toEqual([])
    rpc.dispose()
  })

  it('drops unsent preview jobs when deactivated mid-queue', async () => {
    const calls: string[] = []
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const fetchMock = vi.fn(async (url: string, init?: { body?: string }) => {
      const path = String(url)
      if (path.includes('history')) {
        calls.push(path)
        await gate
        const sessionId = JSON.parse(String(init?.body ?? '{}')).args?.sessionId as string
        return jsonOk({ sessionId, items: [message(1, sessionId)], working: false })
      }
      if (path.includes('routineList')) return jsonOk([])
      return jsonOk({})
    })
    const rpc = createRosterRpc({ fetch: fetchMock as unknown as typeof fetch })
    rpc.setActive(true)
    rpc.ensurePreview('a', 's1', 1)
    rpc.ensurePreview('b', 's2', 1)
    rpc.ensurePreview('c', 's3', 1)
    await waitFor(() => { expect(calls.length).toBe(2) })
    rpc.setActive(false)
    release()
    await waitFor(() => { expect(rpc.lastMessages.getSnapshot().a).toBe('s1') })
    expect(calls.length).toBe(2)
    expect(rpc.lastMessages.getSnapshot().c).toBeUndefined()
    rpc.dispose()
  })
})

describe('pickLatestBotSession', () => {
  it('picks the newest matching bot preset and ignores plain sessions', () => {
    expect(pickLatestBotSession('dsh-bot--reviewer', {
      plain: { agentPreset: 'standard', updatedAt: 99 },
      old: { agentPreset: 'dsh-bot--reviewer', updatedAt: 5 },
      fresh: { agentPreset: 'dsh-bot--reviewer', updatedAt: 15 },
      other: { agentPreset: 'dsh-bot--poet', updatedAt: 40 },
    })).toEqual({ sessionId: 'fresh', updatedAt: 15 })
    expect(pickLatestBotSession('dsh-bot', {
      seed: { agentPreset: 'dsh-bot', updatedAt: 3 },
    })).toEqual({ sessionId: 'seed', updatedAt: 3 })
  })
})

describe('BoundBotRegion preview wiring', () => {
  it('feeds history last-message into the roster row', async () => {
    const calls: string[] = []
    const fetchMock = historyFetch({ s1: [message(1, 'PR #142 有两处要你决定')] }, calls)
    const rpc = createRosterRpc({ fetch: fetchMock as unknown as typeof fetch })
    await rpc.refresh()
    rpc.setActive(true)
    const listeners = new Set<() => void>()
    const snapshot = {
      current: 's1',
      byId: {
        s1: { agentPreset: 'dsh-bot--reviewer', updatedAt: 42 },
        other: { agentPreset: 'standard', updatedAt: 90 },
      },
    }
    render(
      <BoundBotRegion
        t={(key) => key}
        mode={createSidebarMode()}
        roster={rpc}
        overlay={createOverlayStore()}
        sessions={{
          openSession: vi.fn(),
          list: {
            getSnapshot: () => snapshot,
            subscribe: (fn) => {
              listeners.add(fn)
              return () => { listeners.delete(fn) }
            },
          },
        }}
      />,
    )
    await waitFor(() => {
      expect(screen.getByTestId('dsh-bot-row-reviewer').textContent).toMatch(/PR #142 有两处要你决定/)
    })
    rpc.dispose()
  })
})
