/**
 * executeJump: success is uiWorkspace.openSession plus retainedBy.mainView > 0;
 * archived targets and child sessions never reach openSession.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  executeJump,
  JUMP_REASON_ARCHIVED,
  JUMP_REASON_SUBAGENT,
} from '../src/client/session-jump.ts'

describe('executeJump', () => {
  it('opens via openSession when no list face exists', () => {
    const openSession = vi.fn()
    expect(executeJump({ openSession }, 's1')).toEqual({ ok: true })
    expect(openSession).toHaveBeenCalledWith('s1')
  })

  it('refuses a catalogued subagent address without calling openSession', () => {
    const openSession = vi.fn()
    expect(executeJump({ openSession, subagentAddress: () => ({ kind: 'subagent' }) }, 's1'))
      .toEqual({ ok: false, reason: JUMP_REASON_SUBAGENT })
    expect(openSession).not.toHaveBeenCalled()
  })

  it('refuses a list row that already has a parent, before the catalog address is loaded', () => {
    const openSession = vi.fn()
    expect(executeJump({
      openSession,
      list: { getSnapshot: () => ({ byId: { s1: { parentId: 'session-parent' } } }) },
    }, 's1')).toEqual({ ok: false, reason: JUMP_REASON_SUBAGENT })
    expect(openSession).not.toHaveBeenCalled()
  })

  it('reports not-found when openSession throws', () => {
    const openSession = vi.fn(() => { throw new Error('missing') })
    expect(executeJump({ openSession }, 's1')).toEqual({ ok: false, reason: '会话不存在或已删除' })
  })

  it('reports unsupported without a sessions face', () => {
    expect(executeJump(undefined, 's1')).toEqual({ ok: false, reason: '当前页签不支持跳转' })
  })

  it('reports not-found when retainedBy.mainView does not land', () => {
    const openSession = vi.fn()
    expect(executeJump({
      openSession,
      list: { getSnapshot: () => ({ byId: { other: { retainedBy: { mainView: 1 } } } }) },
    }, 's1')).toEqual({ ok: false, reason: '会话不存在或已删除' })
    expect(openSession).toHaveBeenCalledWith('s1')
  })

  it('succeeds once mainView retention lands', () => {
    const byId: Record<string, { retainedBy: { mainView: number } }> = {}
    expect(executeJump({
      openSession: (id: string) => { byId[id] = { retainedBy: { mainView: 1 } } },
      list: { getSnapshot: () => ({ byId }) },
    }, 's1')).toEqual({ ok: true })
  })

  it('refuses an archived target and never calls openSession', () => {
    const openSession = vi.fn()
    expect(executeJump(
      { openSession },
      's1',
      { list: { getSnapshot: () => ({ archivedSessionIds: ['s1'] }) } },
    )).toEqual({ ok: false, reason: JUMP_REASON_ARCHIVED })
    expect(openSession).not.toHaveBeenCalled()
  })

  it('reports archived when retention does not land and the target is archived after openSession', () => {
    let archived: readonly string[] = []
    expect(executeJump(
      {
        openSession: (id: string) => { archived = [id] },
        list: { getSnapshot: () => ({ byId: {} }) },
      },
      's1',
      { list: { getSnapshot: () => ({ archivedSessionIds: archived }) } },
    )).toEqual({ ok: false, reason: JUMP_REASON_ARCHIVED })
  })

  it('still opens hidden (non-archived) sessions directly', () => {
    const byId: Record<string, { retainedBy: { mainView: number } }> = {}
    expect(executeJump(
      {
        openSession: (id: string) => { byId[id] = { retainedBy: { mainView: 1 } } },
        list: { getSnapshot: () => ({ byId }) },
      },
      'session-hidden',
      { list: { getSnapshot: () => ({ archivedSessionIds: ['session-archived'] }) } },
    )).toEqual({ ok: true })
  })
})
