/**
 * Jump bridge: origin + iframe source + type whitelist (BR-401).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  handleJumpMessage,
  JUMP_MESSAGE_TYPE,
  JUMP_REASON_ARCHIVED,
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
  it('opens via open when no subagent address exists', () => {
    const open = vi.fn()
    expect(jumpToSession({ open }, 's1')).toBe(true)
    expect(open).toHaveBeenCalledWith('s1')
  })

  it('does not call openSubagent when an address is catalogued', () => {
    const open = vi.fn()
    const openSubagent = vi.fn()
    expect(jumpToSession({
      open,
      openSubagent,
      subagentAddress: () => ({ kind: 'subagent' }),
    }, 's1')).toBe(true)
    expect(open).toHaveBeenCalledWith('s1')
    expect(openSubagent).not.toHaveBeenCalled()
  })
})

describe('handleJumpMessage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('accepts origin + iframe source + type and jumps', () => {
    const iframe = source()
    const open = vi.fn()
    const sessions: SessionJumpFace = { open }
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const accepted = handleJumpMessage(event({}, iframe), iframe, sessions, ORIGIN)
    expect(accepted).toBe(true)
    expect(open).toHaveBeenCalledWith('session-live')
    expect((iframe as unknown as { postMessage: ReturnType<typeof vi.fn> }).postMessage).toHaveBeenCalledWith(
      { type: JUMP_RESULT_TYPE, ok: true },
      ORIGIN,
    )
    expect(log).not.toHaveBeenCalled()
  })

  it('rejects a foreign origin', () => {
    const iframe = source()
    const open = vi.fn()
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const accepted = handleJumpMessage(
      event({ origin: 'https://evil.example' }, iframe),
      iframe,
      { open },
      ORIGIN,
    )
    expect(accepted).toBe(false)
    expect(open).not.toHaveBeenCalled()
    expect((iframe as unknown as { postMessage: ReturnType<typeof vi.fn> }).postMessage).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalled()
  })

  it('rejects a non-whitelist type', () => {
    const iframe = source()
    const open = vi.fn()
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const accepted = handleJumpMessage(
      event({ data: { type: 'dsh-bot:other', sessionId: 'session-live' } }, iframe),
      iframe,
      { open },
      ORIGIN,
    )
    expect(accepted).toBe(false)
    expect(open).not.toHaveBeenCalled()
  })

  it('rejects a source that is not the iframe contentWindow', () => {
    const iframe = source()
    const other = source()
    const open = vi.fn()
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const accepted = handleJumpMessage(event({ source: other }, iframe), iframe, { open }, ORIGIN)
    expect(accepted).toBe(false)
    expect(open).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalled()
  })

  it('opens via sessions.open even when a subagent address exists', () => {
    const iframe = source()
    const open = vi.fn()
    const openSubagent = vi.fn()
    const accepted = handleJumpMessage(
      event({}, iframe),
      iframe,
      { open, openSubagent, subagentAddress: () => ({ kind: 'subagent' }) },
      ORIGIN,
    )
    expect(accepted).toBe(true)
    expect(open).toHaveBeenCalledWith('session-live')
    expect(openSubagent).not.toHaveBeenCalled()
  })

  it('replies not-found when open throws', () => {
    const iframe = source()
    const open = vi.fn(() => {
      throw new Error('missing')
    })
    const accepted = handleJumpMessage(event({}, iframe), iframe, { open }, ORIGIN)
    expect(accepted).toBe(false)
    expect(open).toHaveBeenCalledWith('session-live')
    expect((iframe as unknown as { postMessage: ReturnType<typeof vi.fn> }).postMessage).toHaveBeenCalledWith(
      { type: JUMP_RESULT_TYPE, ok: false, reason: '会话不存在或已删除' },
      ORIGIN,
    )
  })

  it('replies unsupported when the tab has no sessions face', () => {
    const iframe = source()
    const accepted = handleJumpMessage(event({}, iframe), iframe, undefined, ORIGIN)
    expect(accepted).toBe(false)
    expect((iframe as unknown as { postMessage: ReturnType<typeof vi.fn> }).postMessage).toHaveBeenCalledWith(
      { type: JUMP_RESULT_TYPE, ok: false, reason: '当前页签不支持跳转' },
      ORIGIN,
    )
  })

  it('replies not-found when list.current does not land', () => {
    const iframe = source()
    const open = vi.fn()
    const accepted = handleJumpMessage(
      event({}, iframe),
      iframe,
      { open, list: { getSnapshot: () => ({ current: 'session-other' }) } },
      ORIGIN,
    )
    expect(accepted).toBe(false)
    expect(open).toHaveBeenCalledWith('session-live')
    expect((iframe as unknown as { postMessage: ReturnType<typeof vi.fn> }).postMessage).toHaveBeenCalledWith(
      { type: JUMP_RESULT_TYPE, ok: false, reason: '会话不存在或已删除', current: 'session-other' },
      ORIGIN,
    )
  })

  it('includes current in the ok result when the snapshot lands', () => {
    let current: string | undefined
    const iframe = source()
    const accepted = handleJumpMessage(
      event({}, iframe),
      iframe,
      {
        open: (id: string) => { current = id },
        list: { getSnapshot: () => (current === undefined ? {} : { current }) },
      },
      ORIGIN,
    )
    expect(accepted).toBe(true)
    expect((iframe as unknown as { postMessage: ReturnType<typeof vi.fn> }).postMessage).toHaveBeenCalledWith(
      { type: JUMP_RESULT_TYPE, ok: true, current: 'session-live' },
      ORIGIN,
    )
  })

  it('refuses an archived target with reason archived and never calls open', () => {
    const iframe = source()
    const open = vi.fn()
    const accepted = handleJumpMessage(
      event({}, iframe),
      iframe,
      { open, list: { getSnapshot: () => ({ current: 'session-other' }) } },
      ORIGIN,
      { list: { getSnapshot: () => ({ archivedSessionIds: ['session-live'] }) } },
    )
    expect(accepted).toBe(false)
    expect(open).not.toHaveBeenCalled()
    expect((iframe as unknown as { postMessage: ReturnType<typeof vi.fn> }).postMessage).toHaveBeenCalledWith(
      { type: JUMP_RESULT_TYPE, ok: false, reason: JUMP_REASON_ARCHIVED, current: 'session-other' },
      ORIGIN,
    )
  })

  it('reports archived (not deleted) when the sweep clears current after open', () => {
    const iframe = source()
    const open = vi.fn()
    let archived: readonly string[] = []
    const accepted = handleJumpMessage(
      event({}, iframe),
      iframe,
      { open: (id: string) => { open(id); archived = [id] }, list: { getSnapshot: () => ({}) } },
      ORIGIN,
      { list: { getSnapshot: () => ({ archivedSessionIds: archived }) } },
    )
    expect(accepted).toBe(false)
    expect(open).toHaveBeenCalledWith('session-live')
    expect((iframe as unknown as { postMessage: ReturnType<typeof vi.fn> }).postMessage).toHaveBeenCalledWith(
      { type: JUMP_RESULT_TYPE, ok: false, reason: JUMP_REASON_ARCHIVED },
      ORIGIN,
    )
  })

  it('still opens hidden (non-archived) sessions directly', () => {
    const iframe = source()
    let current: string | undefined
    const accepted = handleJumpMessage(
      event({ data: { type: JUMP_MESSAGE_TYPE, sessionId: 'session-hidden' } }, iframe),
      iframe,
      { open: (id: string) => { current = id }, list: { getSnapshot: () => (current === undefined ? {} : { current }) } },
      ORIGIN,
      { list: { getSnapshot: () => ({ archivedSessionIds: ['session-archived'] }) } },
    )
    expect(accepted).toBe(true)
  })

  it('replies not-found when sessionId is not a token', () => {
    const iframe = source()
    const open = vi.fn()
    const accepted = handleJumpMessage(
      event({ data: { type: JUMP_MESSAGE_TYPE, sessionId: '<img src=x>' } }, iframe),
      iframe,
      { open },
      ORIGIN,
    )
    expect(accepted).toBe(false)
    expect(open).not.toHaveBeenCalled()
    expect((iframe as unknown as { postMessage: ReturnType<typeof vi.fn> }).postMessage).toHaveBeenCalledWith(
      { type: JUMP_RESULT_TYPE, ok: false, reason: '会话不存在或已删除' },
      ORIGIN,
    )
  })
})
