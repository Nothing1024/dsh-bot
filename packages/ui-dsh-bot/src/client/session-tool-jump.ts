/**
 * Jump a bound bot session into the official conversation.
 *
 * Child rows and sessions still in the archive set are refused before
 * `prepareOfficialJump`, so an archived target is not unarchived and not
 * opened. A session that is not archived still goes through the existing
 * prepare step, then the same `executeJump` path as the iframe bridge.
 * Never fall back to the removed `sessions.open`.
 */
import { executeJump, isBlockedChildSession, JUMP_REASON_ARCHIVED, JUMP_REASON_SUBAGENT } from './session-jump.ts'
import type { SessionJumpFace } from './session-jump.ts'

export const SESSION_TOOL_PANEL_ID = 'session-tool'

export const OFFICIAL_ARCHIVED_MESSAGE = '该会话已归档（委托会话默认归档），官方界面无法查看'

export interface SessionToolJumpHost {
  uiWorkspace?: {
    openSession?(id: string): void
  }
  sessions: {
    subagentAddress?(id: string): unknown
    list?: SessionJumpFace['list']
    refresh?(): Promise<unknown> | unknown
  }
  layout: {
    selectPanel(id: string | null): void
    beginNavigation?(): AbortSignal
  }
  workspaces?: {
    list?: {
      getSnapshot(): { archivedSessionIds?: readonly string[] }
      subscribe?(listener: () => void): () => void
    }
  } | undefined
}

function isArchived(host: SessionToolJumpHost, sessionId: string): boolean {
  const ids = host.workspaces?.list?.getSnapshot()?.archivedSessionIds
  return ids !== undefined && ids.includes(sessionId)
}

export async function waitWhileArchived(
  host: SessionToolJumpHost,
  sessionId: string,
  timeoutMs = 2000,
): Promise<void> {
  if (!isArchived(host, sessionId)) return
  await new Promise<void>((resolve, reject) => {
    let settled = false
    const finish = (ok: boolean): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      clearInterval(poll)
      unsub?.()
      if (ok) resolve()
      else reject(new Error(OFFICIAL_ARCHIVED_MESSAGE))
    }
    const timer = setTimeout(() => finish(false), timeoutMs)
    const poll = setInterval(() => {
      if (!isArchived(host, sessionId)) finish(true)
    }, 40)
    const unsub = host.workspaces?.list?.subscribe?.(() => {
      if (!isArchived(host, sessionId)) finish(true)
    })
  })
}

export async function requestPrepareOfficialJump(sessionId: string): Promise<void> {
  let response: Response
  try {
    response = await fetch('/dsh-bot/prepareOfficialJump', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ args: { sessionId } }),
    })
  } catch {
    throw new Error('无法打开官方会话')
  }
  let json: unknown
  try {
    json = await response.json()
  } catch {
    throw new Error('无法打开官方会话')
  }
  if (typeof json !== 'object' || json === null) throw new Error('无法打开官方会话')
  const body = json as { ok?: boolean; error?: { message?: string } }
  if (body.ok === false) throw new Error(body.error?.message || '无法打开官方会话')
}

export async function openOfficialSession(
  host: SessionToolJumpHost,
  sessionId: string,
  options: { archivedWaitMs?: number } = {},
): Promise<void> {
  if (isBlockedChildSession({
    ...typeof host.sessions.subagentAddress === 'function'
      ? { subagentAddress: (id: string) => host.sessions.subagentAddress?.(id) }
      : {},
    ...host.sessions.list !== undefined ? { list: host.sessions.list } : {},
  }, sessionId)) throw new Error(JUMP_REASON_SUBAGENT)
  if (isArchived(host, sessionId)) throw new Error(OFFICIAL_ARCHIVED_MESSAGE)
  await requestPrepareOfficialJump(sessionId)
  if (typeof host.uiWorkspace?.openSession !== 'function') throw new Error('宿主不支持打开会话')
  if (typeof host.layout.selectPanel !== 'function') throw new Error('宿主不支持切换面板')
  await waitWhileArchived(host, sessionId, options.archivedWaitMs ?? 2000)
  const face: SessionJumpFace = {
    openSession: (id: string) => { host.uiWorkspace?.openSession?.(id) },
    ...typeof host.sessions.subagentAddress === 'function'
      ? { subagentAddress: (id: string) => host.sessions.subagentAddress?.(id) }
      : {},
    ...host.sessions.list !== undefined ? { list: host.sessions.list } : {},
  }
  const result = executeJump(face, sessionId, host.workspaces)
  if (!result.ok) {
    throw new Error(result.reason === JUMP_REASON_ARCHIVED ? OFFICIAL_ARCHIVED_MESSAGE : result.reason)
  }
  host.layout.selectPanel(null)
}

export function openSessionToolPanel(host: SessionToolJumpHost): void {
  host.layout.selectPanel(SESSION_TOOL_PANEL_ID)
}
