/**
 * Workbench → tab jump request. Standalone (`window.parent === window`)
 * cannot reach ctx.sessions; callers copy the session id instead.
 */

export const JUMP_MESSAGE_TYPE = 'dsh-bot:jump'
export const JUMP_RESULT_TYPE = 'dsh-bot:jump-result'
export const JUMP_ACK_MS = 1500

export type JumpOutcome =
  | { ok: true }
  | { ok: false; reason: string }

let jumpInFlight = false

export function isStandaloneWorkbench(): boolean {
  return window.parent === window
}

export function sessionJumpLabel(standalone = isStandaloneWorkbench()): string {
  return standalone ? '复制会话 ID' : '在官方会话打开'
}

export function sessionJumpTitle(standalone = isStandaloneWorkbench()): string {
  return standalone ? '复制后可到会话协作打开原来的会话' : '通过会话协作跳到官方对话'
}

export const SESSION_TOOL_BROWSE_LABEL = '在会话协作中查看全部'
export const SESSION_TOOL_BROWSE_HINT = '请在 DSH 侧栏打开「会话协作」查看原来的会话'
export const SESSION_TOOL_COPY_TOAST = '已复制会话 ID，可到会话协作打开'
export const CHILD_SESSION_JUMP_TOAST = '不能按子代理打开'

/** Bot inventory marks that mean this row is a child session, not a normal chat. */
export function isChildBotSession(tags: readonly string[]): boolean {
  return tags.includes('child') || tags.some(tag => tag.startsWith('parent:'))
}

export function formatJumpReason(reason: string | undefined): string {
  if (reason === undefined || reason === '') return '跳转失败'
  if (reason === 'unsupported') return '当前页签不支持跳转'
  if (reason === 'not-found') return '会话不存在或已删除'
  if (reason === 'archived') return '该会话已归档（委托会话默认归档），官方界面无法查看'
  if (reason === 'timeout') return '跳转超时'
  return reason
}

export async function copySessionId(sessionId: string): Promise<boolean> {
  const clipboard = navigator.clipboard
  if (clipboard === undefined || typeof clipboard.writeText !== 'function') return false
  try {
    await clipboard.writeText(sessionId)
    return true
  } catch {
    return false
  }
}

/**
 * Post `dsh-bot:jump` to the tab and wait for `dsh-bot:jump-result` (1.5s).
 */
export async function requestJump(sessionId: string): Promise<JumpOutcome> {
  if (isStandaloneWorkbench()) return { ok: false, reason: 'unsupported' }
  const parent = window.parent
  return await new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener('message', onResult)
      resolve({ ok: false, reason: 'timeout' })
    }, JUMP_ACK_MS)
    const onResult = (event: MessageEvent): void => {
      if (event.origin !== location.origin) return
      if (event.source !== parent) return
      const data = event.data
      if (typeof data !== 'object' || data === null) return
      if ((data as { type?: unknown }).type !== JUMP_RESULT_TYPE) return
      window.clearTimeout(timer)
      window.removeEventListener('message', onResult)
      if ((data as { ok?: unknown }).ok === true) {
        resolve({ ok: true })
        return
      }
      const reason = (data as { reason?: unknown }).reason
      resolve({
        ok: false,
        reason: typeof reason === 'string' && reason !== '' ? reason : 'failed',
      })
    }
    window.addEventListener('message', onResult)
    parent.postMessage({ type: JUMP_MESSAGE_TYPE, sessionId }, location.origin)
  })
}

/**
 * Host opener (embedded Bot panel) first; else iframe postMessage;
 * standalone copies the id so session-tool can open it.
 */
export async function performWorkbenchJump(
  sessionId: string,
  onToast: (text: string) => void,
  openOfficial?: (sessionId: string) => Promise<void> | void,
): Promise<void> {
  if (jumpInFlight) return
  jumpInFlight = true
  try {
    if (openOfficial !== undefined) {
      try {
        await openOfficial(sessionId)
      } catch (error) {
        const message = error instanceof Error ? error.message : ''
        onToast(message !== '' ? message : '跳转失败')
      }
      return
    }
    if (isStandaloneWorkbench()) {
      const copied = await copySessionId(sessionId)
      onToast(copied ? SESSION_TOOL_COPY_TOAST : '复制失败')
      return
    }
    const result = await requestJump(sessionId)
    if (!result.ok) onToast(formatJumpReason(result.reason))
  } finally {
    jumpInFlight = false
  }
}

export function browseSessionTool(
  onToast: (text: string) => void,
  openSessionTool?: () => void,
): void {
  if (openSessionTool !== undefined) {
    openSessionTool()
    return
  }
  onToast(SESSION_TOOL_BROWSE_HINT)
}

/** Test-only: drop the in-flight lock between cases. */
export function resetJumpInFlight(): void {
  jumpInFlight = false
}
