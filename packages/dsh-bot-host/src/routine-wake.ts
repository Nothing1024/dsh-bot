/**
 * Routine wake: visible session + sessionTool.write, never promptOwnedSession (BR-103/BR-903).
 * @module dsh-bot-host/routine-wake
 */
import type { RoutineRow, RoutineStore, RoutineOutcome } from './routines.ts'

export const ROUTINE_SILENT_TOKEN = '(silent)'
export const ROUTINE_SYSTEM_PREFIX = '[routine-system] '

export function buildWakePrompt(routine: Pick<RoutineRow, 'name' | 'instruction'>): string {
  return [
    `[routine] ${routine.name}`,
    `用户交代：${routine.instruction}`,
    '没有人在等你；没有要说的就只输出 (silent)；有要说的就像随口提一句，不要复述计划表。',
  ].join('\n')
}

export function isSilentReply(text: string | undefined): boolean {
  if (text === undefined) return false
  return text.trim() === ROUTINE_SILENT_TOKEN
}

export function isRoutineInjection(text: string): boolean {
  const t = text.trim()
  // Hide wake cues only. [routine-system] is a visible thread notice (UF-901).
  return t.startsWith('[routine]') && !t.startsWith(ROUTINE_SYSTEM_PREFIX)
}

/** session-tool `until:'idle'` settles as `completed` on a finished turn. */
export function wakeWaitFailed(status: string): boolean {
  return status === 'timeout' || status === 'failed' || status === 'aborted'
}

export interface WakeIO {
  ensureSession(routine: RoutineRow): Promise<string>
  writeWaitRead(sessionId: string, text: string): Promise<string | undefined>
  writeSystem?(sessionId: string, text: string): Promise<void>
}

export interface WakeContext {
  readonly io: WakeIO
  readonly store: Pick<RoutineStore, 'update'>
  readonly unread: Map<string, number>
  readonly errors: Map<string, number>
  readonly now?: () => number
}

export async function wakeRoutine(
  ctx: WakeContext,
  routine: RoutineRow,
): Promise<{ readonly outcome: RoutineOutcome; readonly ms: number; readonly sessionId: string }> {
  const started = ctx.now?.() ?? Date.now()
  const sessionId = await ctx.io.ensureSession(routine)
  if (routine.sessionId !== sessionId) {
    await ctx.store.update({ id: routine.id, sessionId })
  }
  try {
    const answer = await ctx.io.writeWaitRead(sessionId, buildWakePrompt(routine))
    const ms = Math.max(0, (ctx.now?.() ?? Date.now()) - started)
    if (isSilentReply(answer)) {
      ctx.errors.delete(routine.id)
      return { outcome: 'silent', ms, sessionId }
    }
    if (answer === undefined || answer.trim() === '') {
      throw new Error('empty routine reply')
    }
    ctx.errors.delete(routine.id)
    ctx.unread.set(routine.botId, (ctx.unread.get(routine.botId) ?? 0) + 1)
    return { outcome: 'spoke', ms, sessionId }
  } catch {
    const ms = Math.max(0, (ctx.now?.() ?? Date.now()) - started)
    const count = (ctx.errors.get(routine.id) ?? 0) + 1
    ctx.errors.set(routine.id, count)
    if (count >= 3 && ctx.io.writeSystem !== undefined) {
      await ctx.io.writeSystem(
        sessionId,
        `${ROUTINE_SYSTEM_PREFIX}例程「${routine.name}」连续失败 3 次，先不自动开口。`,
      )
    }
    return { outcome: 'error', ms, sessionId }
  }
}
