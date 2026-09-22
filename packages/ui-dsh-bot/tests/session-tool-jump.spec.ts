import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  OFFICIAL_ARCHIVED_MESSAGE,
  openOfficialSession,
  openSessionToolPanel,
  SESSION_TOOL_PANEL_ID,
} from '../src/client/session-tool-jump.ts'
import { JUMP_REASON_SUBAGENT } from '../src/client/session-jump.ts'

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
    const byId: Record<string, { retainedBy?: { mainView?: number } }> = {}
    const openSession = vi.fn((id: string) => {
      byId[id] = { retainedBy: { mainView: 1 } }
    })
    const refresh = vi.fn(async () => undefined)
    const selectPanel = vi.fn()
    await openOfficialSession({
      uiWorkspace: { openSession },
      sessions: { refresh, list: { getSnapshot: () => ({ byId }) } },
      layout: { selectPanel },
    }, 's-old')
    expect(fetch).toHaveBeenCalledWith('/dsh-bot/prepareOfficialJump', expect.objectContaining({
      method: 'POST',
    }))
    expect(refresh).not.toHaveBeenCalled()
    expect(openSession).toHaveBeenCalledWith('s-old')
    expect(byId['s-old']?.retainedBy?.mainView).toBeGreaterThan(0)
    expect(selectPanel).toHaveBeenCalledWith(null)
    expect(openSession.mock.invocationCallOrder[0]!).toBeLessThan(selectPanel.mock.invocationCallOrder[0]!)
  })

  it('still opens when a stale navigation signal is already aborted', async () => {
    const openSession = vi.fn()
    const selectPanel = vi.fn()
    await openOfficialSession({
      uiWorkspace: { openSession },
      sessions: { refresh: async () => undefined },
      layout: { selectPanel, beginNavigation: () => ({ aborted: true }) as AbortSignal },
    }, 's-old')
    expect(openSession).toHaveBeenCalledWith('s-old')
    expect(selectPanel).toHaveBeenCalledWith(null)
  })

  it('refuses an archived session before unarchiving or opening', async () => {
    const openSession = vi.fn()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(openOfficialSession({
      uiWorkspace: { openSession },
      sessions: {},
      layout: { selectPanel: vi.fn() },
      workspaces: { list: { getSnapshot: () => ({ archivedSessionIds: ['s-old'] }) } },
    }, 's-old')).rejects.toThrow(OFFICIAL_ARCHIVED_MESSAGE)
    expect(openSession).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('throws when the session stays archived and does not call openSession', async () => {
    const openSession = vi.fn()
    await expect(openOfficialSession({
      uiWorkspace: { openSession },
      sessions: {},
      layout: { selectPanel: vi.fn() },
      workspaces: { list: { getSnapshot: () => ({ archivedSessionIds: ['s-old'] }) } },
    }, 's-old', { archivedWaitMs: 80 })).rejects.toThrow(OFFICIAL_ARCHIVED_MESSAGE)
    expect(openSession).not.toHaveBeenCalled()
  })

  it('does not open when prepareOfficialJump fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      json: async () => ({ ok: false, error: { message: '只能打开 Bot 对话' } }),
    })))
    const openSession = vi.fn()
    await expect(openOfficialSession({
      uiWorkspace: { openSession },
      sessions: {},
      layout: { selectPanel: vi.fn() },
    }, 's-old')).rejects.toThrow('只能打开 Bot 对话')
    expect(openSession).not.toHaveBeenCalled()
  })

  it('throws when the host cannot open a session', async () => {
    await expect(openOfficialSession({
      sessions: {},
      layout: { selectPanel: vi.fn() },
    }, 's-old')).rejects.toThrow('宿主不支持打开会话')
  })

  it('refuses a catalogued subagent address without calling openSession', async () => {
    const openSession = vi.fn()
    await expect(openOfficialSession({
      uiWorkspace: { openSession },
      sessions: { subagentAddress: () => ({ kind: 'subagent' }) },
      layout: { selectPanel: vi.fn() },
    }, 's-old')).rejects.toThrow(JUMP_REASON_SUBAGENT)
    expect(openSession).not.toHaveBeenCalled()
  })

  it('refuses a parented list row before unarchiving or opening', async () => {
    const openSession = vi.fn()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(openOfficialSession({
      uiWorkspace: { openSession },
      sessions: { list: { getSnapshot: () => ({ byId: { 's-old': { parentId: 's-parent' } } }) } },
      layout: { selectPanel: vi.fn() },
    }, 's-old')).rejects.toThrow(JUMP_REASON_SUBAGENT)
    expect(openSession).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
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
