/**
 * Open a bound session in the official conversation. Embedded in the
 * official GUI the host passes an opener; the standalone page
 * (`/dsh-bot/ui`) cannot reach ctx.sessions and copies the session id.
 */

let jumpInFlight = false

export const SESSION_TOOL_BROWSE_LABEL = '在会话协作中查看全部'
export const SESSION_TOOL_BROWSE_HINT = '请在 DSH 侧栏打开「会话协作」查看原来的会话'
export const SESSION_TOOL_COPY_TOAST = '已复制会话 ID，可到会话协作打开'
export const CHILD_SESSION_JUMP_TOAST = '不能按子代理打开'

/** Bot inventory marks that mean this row is a child session, not a normal chat. */
export function isChildBotSession(tags: readonly string[]): boolean {
  return tags.includes('child') || tags.some(tag => tag.startsWith('parent:'))
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
 * Host opener (embedded Bot panel) when present; standalone copies the id so
 * session-tool can open it.
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
    const copied = await copySessionId(sessionId)
    onToast(copied ? SESSION_TOOL_COPY_TOAST : '复制失败')
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
