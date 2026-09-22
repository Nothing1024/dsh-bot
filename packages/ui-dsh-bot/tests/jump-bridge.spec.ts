/**
 * Jump bridge: origin + iframe source + type whitelist.
 * Success is uiWorkspace.openSession plus retainedBy.mainView > 0.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  handleJumpMessage,
  JUMP_MESSAGE_TYPE,
  JUMP_REASON_ARCHIVED,
  JUMP_REASON_SUBAGENT,
  JUMP_RESULT_TYPE,
  jumpToSession,
  sanitizeJumpSessionId,
} from '../src/client/session-jump.ts'
import type { JumpMessageEvent, SessionJumpFace } from '../src/client/session-jump.ts'

const ORIGIN = 'http://127.0.0.1:3084'

function source(): MessageEventSource {
  return {
    postMessage: vi.fn(),
  } as unknown as MessageEventSource
}

function event(
  overrides: Partial<JumpMessageEvent> & { data?: unknown; source?: MessageEventSource | null },
  iframe: MessageEventSource,
): JumpMessageEvent {
  return {
    origin: ORIGIN,
    source: iframe,
    data: { type: JUMP_MESSAGE_TYPE, sessionId: 'session-live' },
    ...overrides,
  }
}

function posted(iframe: MessageEventSource): ReturnType<typeof vi.fn> {
  return (iframe as unknown as { postMessage: ReturnType<typeof vi.fn> }).postMessage
}

describe('sanitizeJumpSessionId', () => {
  it('rejects empty, HTML, and control characters', () => {
    expect(sanitizeJumpSessionId('session-1')).toBe('session-1')
    expect(sanitizeJumpSessionId('  session-1  ')).toBe('session-1')
    expect(sanitizeJumpSessionId('')).toBeNull()
    expect(sanitizeJumpSessionId('<script>')).toBeNull()
    expect(sanitizeJumpSessionId('a\nb')).toBeNull()
    expect(sanitizeJumpSessionId(1)).toBeNull()
  })
})

describe('jumpToSession', () => {
  it('opens via openSession when no subagent address exists', () => {
    const openSession = vi.fn()
    expect(jumpToSession({ openSession }, 's1')).toBe(true)
    expect(openSession).toHaveBeenCalledWith('s1')
  })

  it('does not call openSession when a subagent address is catalogued', () => {
    const openSession = vi.fn()
    expect(jumpToSession({
      openSession,
      subagentAddress: () => ({ kind: 'subagent' }),
    }, 's1')).toBe(false)
    expect(openSession).not.toHaveBeenCalled()
  })
})

describe('handleJumpMessage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('accepts origin + iframe source + type and jumps', () => {
    const iframe = source()
    const openSession = vi.fn()
    const sessions: SessionJumpFace = { openSession }
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const accepted = handleJumpMessage(event({}, iframe), iframe, sessions, ORIGIN)
    expect(accepted).toBe(true)
    expect(openSession).toHaveBeenCalledWith('session-live')
    expect(posted(iframe)).toHaveBeenCalledWith(
      { type: JUMP_RESULT_TYPE, ok: true },
      ORIGIN,
    )
    expect(log).not.toHaveBeenCalled()
  })

  it('rejects a foreign origin', () => {
    const iframe = source()
    const openSession = vi.fn()
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const accepted = handleJumpMessage(
      event({ origin: 'https://evil.example' }, iframe),
      iframe,
      { openSession },
      ORIGIN,
    )
    expect(accepted).toBe(false)
    expect(openSession).not.toHaveBeenCalled()
    expect(posted(iframe)).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalled()
  })

  it('rejects a non-whitelist type', () => {
    const iframe = source()
    const openSession = vi.fn()
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const accepted = handleJumpMessage(
      event({ data: { type: 'dsh-bot:other', sessionId: 'session-live' } }, iframe),
      iframe,
      { openSession },
      ORIGIN,
    )
    expect(accepted).toBe(false)
    expect(openSession).not.toHaveBeenCalled()
  })

  it('rejects a source that is not the iframe contentWindow', () => {
    const iframe = source()
    const other = source()
    const openSession = vi.fn()
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const accepted = handleJumpMessage(event({ source: other }, iframe), iframe, { openSession }, ORIGIN)
    expect(accepted).toBe(false)
    expect(openSession).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalled()
  })

  it('refuses a catalogued subagent address and does not call openSession', () => {
    const iframe = source()
    const openSession = vi.fn()
    const accepted = handleJumpMessage(
      event({}, iframe),
      iframe,
      { openSession, subagentAddress: () => ({ kind: 'subagent' }) },
      ORIGIN,
    )
    expect(accepted).toBe(false)
    expect(openSession).not.toHaveBeenCalled()
    expect(posted(iframe)).toHaveBeenCalledWith(
      { type: JUMP_RESULT_TYPE, ok: false, reason: JUMP_REASON_SUBAGENT },
      ORIGIN,
    )
  })

  it('refuses a list row that already has a parent, before the catalog address is loaded', () => {
    const iframe = source()
    const openSession = vi.fn()
    const accepted = handleJumpMessage(
      event({}, iframe),
      iframe,
      {
        openSession,
        list: { getSnapshot: () => ({ byId: { 'session-live': { parentId: 'session-parent' } } }) },
      },
      ORIGIN,
    )
    expect(accepted).toBe(false)
    expect(openSession).not.toHaveBeenCalled()
    expect(posted(iframe)).toHaveBeenCalledWith(
      { type: JUMP_RESULT_TYPE, ok: false, reason: JUMP_REASON_SUBAGENT },
      ORIGIN,
    )
  })

  it('replies not-found when openSession throws', () => {
    const iframe = source()
    const openSession = vi.fn(() => {
      throw new Error('missing')
    })
    const accepted = handleJumpMessage(event({}, iframe), iframe, { openSession }, ORIGIN)
    expect(accepted).toBe(false)
    expect(openSession).toHaveBeenCalledWith('session-live')
    expect(posted(iframe)).toHaveBeenCalledWith(
      { type: JUMP_RESULT_TYPE, ok: false, reason: '会话不存在或已删除' },
      ORIGIN,
    )
  })

  it('replies unsupported when the tab has no sessions face', () => {
    const iframe = source()
    const accepted = handleJumpMessage(event({}, iframe), iframe, undefined, ORIGIN)
    expect(accepted).toBe(false)
    expect(posted(iframe)).toHaveBeenCalledWith(
      { type: JUMP_RESULT_TYPE, ok: false, reason: '当前页签不支持跳转' },
      ORIGIN,
    )
  })

  it('replies not-found when retainedBy.mainView does not land', () => {
    const iframe = source()
    const openSession = vi.fn()
    const accepted = handleJumpMessage(
      event({}, iframe),
      iframe,
      {
        openSession,
        list: { getSnapshot: () => ({ byId: { 'session-other': { retainedBy: { mainView: 1 } } } }) },
      },
      ORIGIN,
    )
    expect(accepted).toBe(false)
    expect(openSession).toHaveBeenCalledWith('session-live')
    expect(posted(iframe)).toHaveBeenCalledWith(
      { type: JUMP_RESULT_TYPE, ok: false, reason: '会话不存在或已删除', current: 'session-other' },
      ORIGIN,
    )
  })

  it('includes current in the ok result when mainView retention lands', () => {
    const iframe = source()
    const byId: Record<string, { retainedBy: { mainView: number } }> = {}
    const accepted = handleJumpMessage(
      event({}, iframe),
      iframe,
      {
        openSession: (id: string) => { byId[id] = { retainedBy: { mainView: 1 } } },
        list: { getSnapshot: () => ({ byId }) },
      },
      ORIGIN,
    )
    expect(accepted).toBe(true)
    expect(byId['session-live']?.retainedBy.mainView).toBeGreaterThan(0)
    expect(posted(iframe)).toHaveBeenCalledWith(
      { type: JUMP_RESULT_TYPE, ok: true, current: 'session-live' },
      ORIGIN,
    )
  })

  it('refuses an archived target with reason archived and never calls openSession', () => {
    const iframe = source()
    const openSession = vi.fn()
    const accepted = handleJumpMessage(
      event({}, iframe),
      iframe,
      {
        openSession,
        list: { getSnapshot: () => ({ byId: { 'session-other': { retainedBy: { mainView: 1 } } } }) },
      },
      ORIGIN,
      { list: { getSnapshot: () => ({ archivedSessionIds: ['session-live'] }) } },
    )
    expect(accepted).toBe(false)
    expect(openSession).not.toHaveBeenCalled()
    expect(posted(iframe)).toHaveBeenCalledWith(
      { type: JUMP_RESULT_TYPE, ok: false, reason: JUMP_REASON_ARCHIVED, current: 'session-other' },
      ORIGIN,
    )
  })

  it('reports archived when retention does not land and the target is archived after openSession', () => {
    const iframe = source()
    const openSession = vi.fn()
    let archived: readonly string[] = []
    const accepted = handleJumpMessage(
      event({}, iframe),
      iframe,
      {
        openSession: (id: string) => { openSession(id); archived = [id] },
        list: { getSnapshot: () => ({ byId: {} }) },
      },
      ORIGIN,
      { list: { getSnapshot: () => ({ archivedSessionIds: archived }) } },
    )
    expect(accepted).toBe(false)
    expect(openSession).toHaveBeenCalledWith('session-live')
    expect(posted(iframe)).toHaveBeenCalledWith(
      { type: JUMP_RESULT_TYPE, ok: false, reason: JUMP_REASON_ARCHIVED },
      ORIGIN,
    )
  })

  it('still opens hidden (non-archived) sessions directly', () => {
    const iframe = source()
    const byId: Record<string, { retainedBy: { mainView: number } }> = {}
    const accepted = handleJumpMessage(
      event({ data: { type: JUMP_MESSAGE_TYPE, sessionId: 'session-hidden' } }, iframe),
      iframe,
      {
        openSession: (id: string) => { byId[id] = { retainedBy: { mainView: 1 } } },
        list: { getSnapshot: () => ({ byId }) },
      },
      ORIGIN,
      { list: { getSnapshot: () => ({ archivedSessionIds: ['session-archived'] }) } },
    )
    expect(accepted).toBe(true)
    expect(byId['session-hidden']?.retainedBy.mainView).toBeGreaterThan(0)
  })

  it('replies not-found when sessionId is not a token', () => {
    const iframe = source()
    const openSession = vi.fn()
    const accepted = handleJumpMessage(
      event({ data: { type: JUMP_MESSAGE_TYPE, sessionId: '<img src=x>' } }, iframe),
      iframe,
      { openSession },
      ORIGIN,
    )
    expect(accepted).toBe(false)
    expect(openSession).not.toHaveBeenCalled()
    expect(posted(iframe)).toHaveBeenCalledWith(
      { type: JUMP_RESULT_TYPE, ok: false, reason: '会话不存在或已删除' },
      ORIGIN,
    )
  })
})
