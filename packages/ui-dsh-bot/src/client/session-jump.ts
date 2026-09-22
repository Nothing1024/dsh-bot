/**
 * Jump to a bot session from the sidebar list.
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

export const JUMP_MESSAGE_TYPE = 'dsh-bot:jump'
export const JUMP_RESULT_TYPE = 'dsh-bot:jump-result'
/** Machine reason: target is in `workspaces.list.archivedSessionIds`. */
export const JUMP_REASON_ARCHIVED = 'archived'
/** User-facing reason: catalogued subagent addresses must not be opened. */
export const JUMP_REASON_SUBAGENT = '不能按子代理打开'

export interface JumpResultPayload {
  readonly type: typeof JUMP_RESULT_TYPE
  readonly ok: boolean
  readonly reason?: string
  readonly current?: string
}

export interface JumpMessageEvent {
  readonly origin: string
  readonly source: MessageEventSource | null
  readonly data: unknown
}

type JumpExec =
  | { ok: true; current?: string }
  | { ok: false; reason: string; current?: string }

/**
 * Open `sessionId` through `uiWorkspace.openSession`. Archived targets and
 * catalogued subagent addresses are refused and never handed to openSession.
 */
export function jumpToSession(
  sessions: SessionJumpFace | undefined,
  sessionId: string,
  workspaces?: ArchiveFace,
): boolean {
  return executeJump(sessions, sessionId, workspaces).ok
}

function messageType(data: unknown): string | undefined {
  if (typeof data !== 'object' || data === null) return undefined
  const type = (data as { type?: unknown }).type
  return typeof type === 'string' ? type : undefined
}

/** Reject path/HTML payloads; session ids are opaque tokens. */
export function sanitizeJumpSessionId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const id = value.trim()
  if (id === '' || id.length > 200) return null
  if (/[\u0000-\u001F<>]/.test(id)) return null
  return id
}

function replyJumpResult(
  source: MessageEventSource | null,
  origin: string,
  result: JumpExec,
): void {
  if (source === null) return
  const target = source as Window
  if (typeof target.postMessage !== 'function') return
  const payload: JumpResultPayload = result.ok
    ? (result.current === undefined
      ? { type: JUMP_RESULT_TYPE, ok: true }
      : { type: JUMP_RESULT_TYPE, ok: true, current: result.current })
    : (result.current === undefined
      ? { type: JUMP_RESULT_TYPE, ok: false, reason: result.reason }
      : { type: JUMP_RESULT_TYPE, ok: false, reason: result.reason, current: result.current })
  target.postMessage(payload, origin)
  if (typeof window !== 'undefined') {
    (window as unknown as { __dshBotJumpLast?: JumpResultPayload }).__dshBotJumpLast = payload
  }
}

function isArchived(workspaces: ArchiveFace | undefined, sessionId: string): boolean {
  const ids = workspaces?.list?.getSnapshot().archivedSessionIds
  return ids !== undefined && ids.includes(sessionId)
}

function mainViewCount(row: object | undefined): number {
  if (row === undefined) return 0
  const retainedBy = (row as { retainedBy?: { mainView?: number } }).retainedBy
  return retainedBy?.mainView ?? 0
}

/** Session id whose `retainedBy.mainView` is greater than 0. */
export function mainViewId(sessions: SessionJumpFace | undefined): string | undefined {
  const byId = sessions?.list?.getSnapshot().byId
  if (byId === undefined) return undefined
  for (const [id, row] of Object.entries(byId)) {
    if (mainViewCount(row) > 0) return id
  }
  return undefined
}

function mainViewRetained(sessions: SessionJumpFace, sessionId: string): boolean {
  return mainViewCount(sessions.list?.getSnapshot().byId?.[sessionId]) > 0
}

function rowMarksChild(row: object | undefined): boolean {
  if (row === undefined) return false
  const record = row as { parentId?: unknown; origin?: unknown }
  if (typeof record.parentId === 'string' && record.parentId !== '') return true
  return record.origin === 'subagent'
}

function hasSubagentAddress(sessions: SessionJumpFace, sessionId: string): boolean {
  const row = sessions.list?.getSnapshot().byId?.[sessionId]
  if (rowMarksChild(row)) return true
  if (typeof sessions.subagentAddress !== 'function') return false
  const address = sessions.subagentAddress(sessionId)
  return address !== undefined && address !== null
}

/** True when this id is already a child session and must not be handed to openSession. */
export function isBlockedChildSession(sessions: SessionJumpFace, sessionId: string): boolean {
  return hasSubagentAddress(sessions, sessionId)
}

function refuse(sessions: SessionJumpFace, reason: string): JumpExec {
  const current = mainViewId(sessions)
  return current === undefined
    ? { ok: false, reason }
    : { ok: false, reason, current }
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
  if (isArchived(workspaces, sessionId)) return refuse(sessions, JUMP_REASON_ARCHIVED)
  if (hasSubagentAddress(sessions, sessionId)) return refuse(sessions, JUMP_REASON_SUBAGENT)
  try {
    sessions.openSession(sessionId)
  } catch {
    return refuse(sessions, '会话不存在或已删除')
  }
  if (sessions.list === undefined) return { ok: true }
  if (!mainViewRetained(sessions, sessionId)) {
    const reason = isArchived(workspaces, sessionId) ? JUMP_REASON_ARCHIVED : '会话不存在或已删除'
    return refuse(sessions, reason)
  }
  return { ok: true, current: sessionId }
}

/**
 * iframe → tab jump bridge. All three must hold: same origin, iframe
 * contentWindow source, type `dsh-bot:jump`. Archived sessions and sessions
 * that already have a subagent address are refused. Replies
 * `{type:'dsh-bot:jump-result', ok, reason?}`.
 */
export function handleJumpMessage(
  event: JumpMessageEvent,
  iframeSource: MessageEventSource | null | undefined,
  sessions: SessionJumpFace | undefined,
  expectedOrigin: string,
  workspaces?: ArchiveFace,
): boolean {
  const type = messageType(event.data)
  const originOk = event.origin === expectedOrigin
  const sourceOk = iframeSource !== null && iframeSource !== undefined && event.source === iframeSource
  const typeOk = type === JUMP_MESSAGE_TYPE
  if (!originOk || !sourceOk || !typeOk) {
    if (type !== undefined && type.startsWith('dsh-bot:')) {
      console.info('[dsh-bot] ignored message', { origin: event.origin, type })
    }
    return false
  }
  const sessionId = sanitizeJumpSessionId((event.data as { sessionId?: unknown }).sessionId)
  if (sessionId === null) {
    replyJumpResult(event.source, event.origin, { ok: false, reason: '会话不存在或已删除' })
    return false
  }
  const result = executeJump(sessions, sessionId, workspaces)
  replyJumpResult(event.source, event.origin, result)
  return result.ok
}
