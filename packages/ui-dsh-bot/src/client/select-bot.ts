/**
 * Point-persona open: last session → newest visible → createBotSession (BR-605).
 */
import {
  nestedSessionSlice,
  pickBoundSession,
  readLastSession,
  writeLastSession,
  formatWireError,
} from 'dsh-bot-shared'
import type { CreateBotSessionValue, WorkbenchSessionRow } from 'dsh-bot-shared'
import type { RpcResult } from './roster-rpc.ts'
import { writeLastBot } from './roster-items.ts'
import { jumpToSession } from './session-jump.ts'
import type { SessionJumpFace } from './session-jump.ts'

export type SelectPhase = 'idle' | 'resolving' | 'creating' | 'opened' | 'error'

export interface SelectBotResult {
  readonly ok: boolean
  readonly sessionId?: string
  readonly rows: readonly WorkbenchSessionRow[]
  readonly error?: string
}

export interface SelectBotDeps {
  sessionsOf(botId: string): Promise<readonly WorkbenchSessionRow[]>
  createBotSession(botId: string): Promise<RpcResult<CreateBotSessionValue>>
  markRead(botId: string): Promise<unknown>
  sessions?: SessionJumpFace
  onPhase?(phase: SelectPhase): void
}

function visibleIds(rows: readonly WorkbenchSessionRow[]): string[] {
  return [...rows]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .filter(row => !row.hidden)
    .map(row => row.sessionId)
}

export function errorMessage(error: { code?: string; message: string } | undefined, fallback: string): string {
  if (error === undefined) return fallback
  return formatWireError(error)
}

/**
 * Resolve and open the bound official session for `botId`.
 */
export async function selectBot(botId: string, deps: SelectBotDeps): Promise<SelectBotResult> {
  if (typeof deps.sessions?.openSession !== 'function') {
    return { ok: false, rows: [], error: '宿主不支持打开会话' }
  }
  deps.onPhase?.('resolving')
  let rows: readonly WorkbenchSessionRow[] = []
  try {
    rows = await deps.sessionsOf(botId)
  } catch (error) {
    return { ok: false, rows: [], error: error instanceof Error ? error.message : '网关不可达' }
  }
  const remembered = readLastSession(botId)
  const picked = pickBoundSession(visibleIds(rows), null, remembered)
  if (picked !== null) {
    if (!jumpToSession(deps.sessions, picked)) {
      return { ok: false, rows, error: '宿主不支持打开会话' }
    }
    writeLastSession(botId, picked)
    writeLastBot(botId)
    void deps.markRead(botId)
    deps.onPhase?.('opened')
    return { ok: true, sessionId: picked, rows }
  }
  deps.onPhase?.('creating')
  let created: RpcResult<CreateBotSessionValue>
  try {
    created = await deps.createBotSession(botId)
  } catch (error) {
    return { ok: false, rows, error: error instanceof Error ? error.message : '网关不可达' }
  }
  if (!created.ok) {
    return { ok: false, rows, error: errorMessage(created.error, created.error.message) }
  }
  if (!jumpToSession(deps.sessions, created.value.sessionId)) {
    return { ok: false, rows, error: '宿主不支持打开会话' }
  }
  writeLastSession(botId, created.value.sessionId)
  writeLastBot(botId)
  void deps.markRead(botId)
  const next = await deps.sessionsOf(botId)
  deps.onPhase?.('opened')
  return { ok: true, sessionId: created.value.sessionId, rows: next }
}

export function sliceNested(
  rows: readonly WorkbenchSessionRow[],
  current: string | null,
): readonly WorkbenchSessionRow[] {
  const newest = [...rows].sort((a, b) => b.updatedAt - a.updatedAt)
  const marked = newest.map(row => ({ ...row, selected: row.sessionId === current }))
  return nestedSessionSlice(marked).visible
}

export function pendingBotIds(
  bots: readonly { id: string; presetId: string }[],
  byId: Record<string, { agentPreset?: string; pendingInteraction?: string }> | undefined,
  sessionsByBot?: Readonly<Record<string, readonly { readonly sessionId: string }[]>>,
): Set<string> {
  const pending = new Set<string>()
  if (byId === undefined) return pending
  const sessions = Object.entries(byId)
  for (const bot of bots) {
    const owned = sessionsByBot?.[bot.id]
    const ownedIds = owned === undefined ? undefined : new Set(owned.map(row => row.sessionId))
    const hit = sessions.some(([id, session]) => {
      if (session.pendingInteraction === undefined || session.pendingInteraction === '') return false
      if (ownedIds !== undefined) return ownedIds.has(id)
      return session.agentPreset === bot.presetId
    })
    if (hit) pending.add(bot.id)
  }
  return pending
}
