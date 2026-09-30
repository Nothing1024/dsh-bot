/**
 * Open a bot session in the official main view.
 * Duck-typed so this client half does not import platform runtime packages.
 */

export interface SessionJumpFace {
  openSession?(id: string): void
  subagentAddress?(id: string): unknown
  list?: {
    getSnapshot(): { byId?: Readonly<Record<string, object>> }
  }
}

/**
 * Archive membership face (`ctx.workspaces.list`). Archived sessions stay
 * out of the main view: opening one is refused before `openSession`.
 */
export interface ArchiveFace {
  list?: {
    getSnapshot(): { archivedSessionIds?: readonly string[] }
  }
}

/** Machine reason: target is in `workspaces.list.archivedSessionIds`. */
export const JUMP_REASON_ARCHIVED = 'archived'
/** User-facing reason: catalogued subagent addresses must not be opened. */
export const JUMP_REASON_SUBAGENT = '不能按子代理打开'

type JumpExec =
  | { ok: true }
  | { ok: false; reason: string }

function isArchived(workspaces: ArchiveFace | undefined, sessionId: string): boolean {
  const ids = workspaces?.list?.getSnapshot().archivedSessionIds
  return ids !== undefined && ids.includes(sessionId)
}

/** True when this id is already a child session and must not be handed to openSession. */
export function isBlockedChildSession(sessions: SessionJumpFace, sessionId: string): boolean {
  const row = sessions.list?.getSnapshot().byId?.[sessionId] as { parentId?: unknown; origin?: unknown } | undefined
  if (row !== undefined && ((typeof row.parentId === 'string' && row.parentId !== '') || row.origin === 'subagent')) return true
  if (typeof sessions.subagentAddress !== 'function') return false
  const address = sessions.subagentAddress(sessionId)
  return address !== undefined && address !== null
}

/**
 * Refuse archived targets (reason `archived`) and catalogued subagent
 * addresses. Otherwise `uiWorkspace.openSession` and require
 * `retainedBy.mainView > 0` when the list face exists.
 */
export function executeJump(
  sessions: SessionJumpFace | undefined,
  sessionId: string,
  workspaces?: ArchiveFace,
): JumpExec {
  if (sessions === undefined || typeof sessions.openSession !== 'function') {
    return { ok: false, reason: '当前页签不支持跳转' }
  }
  if (isArchived(workspaces, sessionId)) return { ok: false, reason: JUMP_REASON_ARCHIVED }
  if (isBlockedChildSession(sessions, sessionId)) return { ok: false, reason: JUMP_REASON_SUBAGENT }
  try {
    sessions.openSession(sessionId)
  } catch {
    return { ok: false, reason: '会话不存在或已删除' }
  }
  if (sessions.list === undefined) return { ok: true }
  const row = sessions.list.getSnapshot().byId?.[sessionId] as { retainedBy?: { mainView?: number } } | undefined
  if ((row?.retainedBy?.mainView ?? 0) <= 0) {
    return { ok: false, reason: isArchived(workspaces, sessionId) ? JUMP_REASON_ARCHIVED : '会话不存在或已删除' }
  }
  return { ok: true }
}
