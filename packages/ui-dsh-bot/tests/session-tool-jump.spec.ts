import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  OFFICIAL_ARCHIVED_MESSAGE,
  openOfficialSession,
  openSessionToolPanel,
  SESSION_TOOL_PANEL_ID,
} from '../src/client/session-tool-jump.ts'

function okFetch() {
  return vi.fn(async () => ({
    json: async () => ({ ok: true, value: { sessionId: 's-old' } }),
  }))
}

describe('session-tool jump host', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', okFetch())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('prepares, opens the session, then returns to the official conversation', async () => {
    const open = vi.fn()
    const refresh = vi.fn(async () => undefined)
    const selectPanel = vi.fn()
    await openOfficialSession({
      sessions: { open, refresh },
      layout: { selectPanel },
    }, 's-old')
    expect(fetch).toHaveBeenCalledWith('/dsh-bot/prepareOfficialJump', expect.objectContaining({
      method: 'POST',
    }))
    expect(refresh).not.toHaveBeenCalled()
    expect(open).toHaveBeenCalledWith('s-old')
    expect(selectPanel).toHaveBeenCalledWith(null)
    expect(open.mock.invocationCallOrder[0]!).toBeLessThan(selectPanel.mock.invocationCallOrder[0]!)
  })

  it('still opens when a stale navigation signal is already aborted', async () => {
    const open = vi.fn()
    const selectPanel = vi.fn()
    await openOfficialSession({
      sessions: { open, refresh: async () => undefined },
      layout: { selectPanel, beginNavigation: () => ({ aborted: true }) as AbortSignal },
    }, 's-old')
    expect(open).toHaveBeenCalledWith('s-old')
    expect(selectPanel).toHaveBeenCalledWith(null)
  })

  it('waits for the archive echo before opening', async () => {
    let archived: readonly string[] = ['s-old']
    const open = vi.fn()
    const selectPanel = vi.fn()
    const pending = openOfficialSession({
      sessions: { open },
      layout: { selectPanel },
      workspaces: { list: { getSnapshot: () => ({ archivedSessionIds: archived }) } },
    }, 's-old', { archivedWaitMs: 400 })
    expect(open).not.toHaveBeenCalled()
    await new Promise(resolve => setTimeout(resolve, 50))
    archived = []
    await pending
    expect(open).toHaveBeenCalledWith('s-old')
    expect(selectPanel).toHaveBeenCalledWith(null)
  })

  it('throws when the session stays archived', async () => {
    await expect(openOfficialSession({
      sessions: { open: vi.fn() },
      layout: { selectPanel: vi.fn() },
      workspaces: { list: { getSnapshot: () => ({ archivedSessionIds: ['s-old'] }) } },
    }, 's-old', { archivedWaitMs: 80 })).rejects.toThrow(OFFICIAL_ARCHIVED_MESSAGE)
  })

  it('does not open when prepareOfficialJump fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      json: async () => ({ ok: false, error: { message: '只能打开 Bot 对话' } }),
    })))
    const open = vi.fn()
    await expect(openOfficialSession({
      sessions: { open },
      layout: { selectPanel: vi.fn() },
    }, 's-old')).rejects.toThrow('只能打开 Bot 对话')
    expect(open).not.toHaveBeenCalled()
  })

  it('throws when the host cannot open a session', async () => {
    await expect(openOfficialSession({
      sessions: {},
      layout: { selectPanel: vi.fn() },
    }, 's-old')).rejects.toThrow('宿主不支持打开会话')
  })

  it('selects the session-tool panel', () => {
    const selectPanel = vi.fn()
    openSessionToolPanel({
      sessions: {},
      layout: { selectPanel },
    })
    expect(selectPanel).toHaveBeenCalledWith(SESSION_TOOL_PANEL_ID)
  })
})
