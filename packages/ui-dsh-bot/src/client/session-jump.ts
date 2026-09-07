/**
 * Jump to a bot session from the sidebar list (vibee jumpToSession shape).
 * Duck-typed so this client half does not import platform runtime packages.
 */

export interface SessionJumpFace {
  open?(id: string): void
  openSubagent?(address: unknown): void
  subagentAddress?(id: string): unknown
  list?: {
    getSnapshot(): { current?: string }
  }
}

/**
 * Archive membership face (`ctx.workspaces.list`). rc.2 keeps archived
 * sessions out of every viewing surface and has no unarchive: opening one
 * sets `current` and the projection sweep clears it again, so the bridge
 * must refuse up front with a precise reason.
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

/**
 * Open `sessionId` via `sessions.open` (ASM-401). Catalogued subagent
 * addresses must not win: `openSubagent` lands an empty workspace for
 * `~dsh-bot:` hidden rows.
 */
export function jumpToSession(sessions: SessionJumpFace | undefined, sessionId: string): boolean {
  if (sessions === undefined || sessions.open === undefined) return false
  sessions.open(sessionId)
  return true
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

type JumpExec =
  | { ok: true; current?: string }
  | { ok: false; reason: string; current?: string }

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

function readCurrent(sessions: SessionJumpFace): string | undefined {
  return sessions.list?.getSnapshot().current
}

function isArchived(workspaces: ArchiveFace | undefined, sessionId: string): boolean {
  const ids = workspaces?.list?.getSnapshot().archivedSessionIds
  return ids !== undefined && ids.includes(sessionId)
}

/**
 * Refuse archived targets (reason `archived`), else `sessions.open` and
 * require `list.getSnapshot().current === sessionId` when the list face
 * exists (deleted ids do not land).
 */
function executeJump(
  sessions: SessionJumpFace | undefined,
  sessionId: string,
  workspaces?: ArchiveFace,
): JumpExec {
  if (sessions === undefined || sessions.open === undefined) {
    return { ok: false, reason: '当前页签不支持跳转' }
  }
  if (isArchived(workspaces, sessionId)) {
    const current = readCurrent(sessions)
    return current === undefined
      ? { ok: false, reason: JUMP_REASON_ARCHIVED }
      : { ok: false, reason: JUMP_REASON_ARCHIVED, current }
  }
  try {
    sessions.open(sessionId)
  } catch {
    return { ok: false, reason: '会话不存在或已删除' }
  }
  if (sessions.list === undefined) return { ok: true }
  const current = readCurrent(sessions)
  if (current !== sessionId) {
    // The projection sweep may have cleared an archived id that arrived
    // after our snapshot; report it as archived rather than "deleted".
    const reason = isArchived(workspaces, sessionId) ? JUMP_REASON_ARCHIVED : '会话不存在或已删除'
    return current === undefined
      ? { ok: false, reason }
      : { ok: false, reason, current }
  }
  return { ok: true, current }
}

/**
 * iframe → tab jump bridge. All three must hold: same origin, iframe
 * contentWindow source, type `dsh-bot:jump`. Hidden (`~` / kind:hidden)
 * sessions open directly (ASM-401); archived ones are refused with reason
 * `archived`. Replies `{type:'dsh-bot:jump-result', ok, reason?}`.
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
