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
  return standalone ? '复制会话 ID' : '在 DSH 打开'
}

export function sessionJumpTitle(standalone = isStandaloneWorkbench()): string {
  return standalone ? '在右栏页签内可直接跳转' : '在官方 conversation 视图打开此会话'
}

export function formatJumpReason(reason: string | undefined): string {
  if (reason === undefined || reason === '') return '跳转失败'
  if (reason === 'unsupported') return '当前页签不支持跳转'
  if (reason === 'not-found') return '会话不存在或已删除'
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
 * Tab: requestJump. Standalone: copy session id. Failure toasts the reason.
 */
export async function performWorkbenchJump(
  sessionId: string,
  onToast: (text: string) => void,
): Promise<void> {
  if (jumpInFlight) return
  jumpInFlight = true
  try {
    if (isStandaloneWorkbench()) {
      const copied = await copySessionId(sessionId)
      onToast(copied ? '已复制会话 ID' : '复制失败')
      return
    }
    const result = await requestJump(sessionId)
    if (!result.ok) onToast(formatJumpReason(result.reason))
  } finally {
    jumpInFlight = false
  }
}

/** Test-only: drop the in-flight lock between cases. */
export function resetJumpInFlight(): void {
  jumpInFlight = false
}
