/**
 * Jump a bound bot session into the official conversation.
 *
 * Unarchive first (official UI clears archived current), wait for the
 * workspace archive echo, then `sessions.open` + `selectPanel(null)`.
 * Do not pair `beginNavigation` with `refresh` — `selectPanel` aborts that
 * signal and the old path returned without opening.
 */
export const SESSION_TOOL_PANEL_ID = 'session-tool'

export const OFFICIAL_ARCHIVED_MESSAGE = '该会话已归档（委托会话默认归档），官方界面无法查看'

export interface SessionToolJumpHost {
  sessions: {
    open?(id: string): void
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
  await requestPrepareOfficialJump(sessionId)
  if (typeof host.sessions.open !== 'function') throw new Error('宿主不支持打开会话')
  if (typeof host.layout.selectPanel !== 'function') throw new Error('宿主不支持切换面板')
  await waitWhileArchived(host, sessionId, options.archivedWaitMs ?? 2000)
  host.sessions.open(sessionId)
  host.layout.selectPanel(null)
}

export function openSessionToolPanel(host: SessionToolJumpHost): void {
  host.layout.selectPanel(SESSION_TOOL_PANEL_ID)
}
