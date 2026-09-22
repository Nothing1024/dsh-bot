/**
 * Browser HTTP RPC against `/dsh-bot/<method>` with `{args}` (v1 rpc.ts wire).
 */

export type {
  CreateBotArgs,
  CreateBotSessionValue,
  GroupRoomRow,
  HistoryValue,
  ListBotSessionsValue,
  ListBotsValue,
  ListGroupsValue,
  MemoryListValue,
  MemoryLogRow,
  MemoryProfileRow,
  PeerLogRow,
  RosterSection,
  RoutineRow,
  UpdateBotArgs,
  UpdateBotLayoutInput,
  WorkbenchBot,
  WorkbenchBotAvatar,
  WorkbenchBotModelInfo,
  WorkbenchGroup,
  WorkbenchHistoryAuthor,
  WorkbenchHistoryItem,
  WorkbenchModelOverride,
  WorkbenchSessionRow,
  WorkbenchWireError,
} from 'dsh-bot-shared'

import type {
  CreateBotArgs,
  CreateBotSessionValue,
  GroupRoomRow,
  HistoryValue,
  ListBotSessionsValue,
  ListBotsValue,
  ListGroupsValue,
  MemoryListValue,
  PeerLogRow,
  RosterSection,
  RoutineRow,
  UpdateBotArgs,
  WorkbenchBot,
  WorkbenchBotModelInfo,
  WorkbenchGroup,
  WorkbenchWireError,
} from 'dsh-bot-shared'

interface RpcOk<T> { ok: true; value: T }
interface RpcFail { ok: false; error: WorkbenchWireError }
export type RpcResult<T> = RpcOk<T> | RpcFail

/**
 * Upper bound for one `/dsh-bot/*` round trip. Every host handler is local and
 * answers in milliseconds; anything slower is a stalled connection, not work.
 */
const RPC_TIMEOUT_MS = 20_000

/**
 * POST `/dsh-bot/<method>` with `{args}` and unwrap `{ok,value|error}`.
 *
 * Bounded on purpose: a browser that has queued this request behind its
 * per-origin connection cap (several gateway tabs, each holding an SSE stream)
 * never rejects on its own, and the workbench would sit in its sending state
 * forever. A stale page from before a gateway restart fails the same way,
 * except the gateway answers 401 — that one names itself instead of timing out.
 */
export async function workbenchCall<T>(
  method: string,
  args: Record<string, unknown> = {},
): Promise<RpcResult<T>> {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, RPC_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(`/dsh-bot/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ args }),
      signal: controller.signal,
    })
  } catch (error) {
    return {
      ok: false,
      error: {
        code: timedOut ? 'timeout' : 'unavailable',
        message: error instanceof Error ? error.message : String(error),
      },
    }
  } finally {
    clearTimeout(timer)
  }
  if (response.status === 401 || response.status === 403) {
    return {
      ok: false,
      error: {
        code: 'unauthorized',
        message: `HTTP ${response.status}${response.statusText === undefined || response.statusText === '' ? '' : ` ${response.statusText}`}`,
      },
    }
  }
  let json: unknown
  try {
    json = await response.json()
  } catch {
    return { ok: false, error: { code: 'internal', message: `dsh-bot RPC ${method} returned non-JSON (HTTP ${response.status ?? 'unknown'})` } }
  }
  if (typeof json !== 'object' || json === null) {
    return { ok: false, error: { code: 'internal', message: `dsh-bot RPC ${method} returned an empty body` } }
  }
  const body = json as { ok?: boolean; error?: WorkbenchWireError; value?: T }
  if (body.ok === false) {
    return { ok: false, error: body.error ?? { message: `${method} failed` } }
  }
  return { ok: true, value: body.value as T }
}

export function listBots(): Promise<RpcResult<ListBotsValue>> {
  return workbenchCall<ListBotsValue>('listBots', {})
}

export function createBot(args: CreateBotArgs): Promise<RpcResult<WorkbenchBot>> {
  return workbenchCall<WorkbenchBot>('createBot', { ...args })
}

export function updateBot(args: UpdateBotArgs): Promise<RpcResult<WorkbenchBot>> {
  const body: Record<string, unknown> = { id: args.id }
  if (args.name !== undefined) body.name = args.name
  if (args.persona !== undefined) body.persona = args.persona
  if (args.avatar !== undefined) body.avatar = args.avatar
  if (args.modelOverride !== undefined) body.modelOverride = args.modelOverride
  return workbenchCall<WorkbenchBot>('updateBot', body)
}

export function deleteBot(id: string): Promise<RpcResult<{ id: string; deleted: true }>> {
  return workbenchCall('deleteBot', { id })
}

export function listSessionsModel(): Promise<RpcResult<{ botModel: WorkbenchBotModelInfo }>> {
  return workbenchCall('listSessions', {})
}

export interface PromptValue {
  readonly messageId?: string
  readonly sessionId: string
  readonly unmatchedMentions?: boolean
}

export function listBotSessions(botId: string, includeHidden = false): Promise<RpcResult<ListBotSessionsValue>> {
  return workbenchCall<ListBotSessionsValue>('listBotSessions', {
    botId,
    ...includeHidden ? { includeHidden: true } : {},
  })
}

export function createBotSession(botId: string, title?: string): Promise<RpcResult<CreateBotSessionValue>> {
  return workbenchCall<CreateBotSessionValue>('createBotSession', {
    botId,
    ...title === undefined || title.trim() === '' ? {} : { title },
  })
}

export function history(sessionId: string, sinceSeq?: number): Promise<RpcResult<HistoryValue>> {
  return workbenchCall<HistoryValue>('history', {
    sessionId,
    ...sinceSeq === undefined ? {} : { sinceSeq },
  })
}

export function prompt(
  sessionId: string,
  text: string,
  mode?: 'queue' | 'steer',
  metadata: { requestId?: string; replyToSeq?: number } = {},
): Promise<RpcResult<PromptValue>> {
  return workbenchCall<PromptValue>('prompt', {
    sessionId,
    text,
    ...metadata,
    ...mode === undefined ? {} : { mode },
  })
}

export function cancel(sessionId: string): Promise<RpcResult<{ accepted: true }>> {
  return workbenchCall('cancel', { sessionId })
}

export function updateQueue(
  sessionId: string,
  itemId: string,
  action: unknown,
): Promise<RpcResult<{ accepted: true }>> {
  return workbenchCall('updateQueue', { sessionId, itemId, action })
}

export function approvalRespond(input: {
  rpcId: string
  sessionId: string
  approvalId: string
  outcome: 'allowed-once' | 'rejected'
}): Promise<RpcResult<unknown>> {
  return workbenchCall('approvalRespond', { ...input })
}

export function questionRespond(input: {
  rpcId: string
  sessionId: string
  answer: unknown
}): Promise<RpcResult<unknown>> {
  return workbenchCall('questionRespond', { ...input })
}

export interface ReconcileAssigned {
  readonly sessionId: string
  readonly botId: string
  readonly reason: 'preset' | 'v1-legacy' | 'ensure-kind'
}

export interface ReconcileValue {
  readonly scanned: number
  readonly labeled: number
  readonly alreadyLabeled: number
  readonly skippedNonBot: number
  readonly skippedCached: number
  readonly assigned: readonly ReconcileAssigned[]
}

export function reconcile(): Promise<RpcResult<ReconcileValue>> {
  return workbenchCall<ReconcileValue>('reconcile', {})
}

export function listGroups(): Promise<RpcResult<ListGroupsValue>> {
  return workbenchCall<ListGroupsValue>('listGroups', {})
}

export function createGroup(args: {
  readonly name: string
  readonly memberIds: readonly string[]
  readonly rounds?: number
}): Promise<RpcResult<WorkbenchGroup>> {
  return workbenchCall<WorkbenchGroup>('createGroup', { ...args })
}

export function updateGroup(args: {
  readonly id: string
  readonly name?: string
  readonly memberIds?: readonly string[]
  readonly rounds?: number
}): Promise<RpcResult<WorkbenchGroup>> {
  const body: Record<string, unknown> = { id: args.id }
  if (args.name !== undefined) body.name = args.name
  if (args.memberIds !== undefined) body.memberIds = args.memberIds
  if (args.rounds !== undefined) body.rounds = args.rounds
  return workbenchCall<WorkbenchGroup>('updateGroup', body)
}

export function deleteGroup(id: string): Promise<RpcResult<{ id: string; deleted: true }>> {
  return workbenchCall('deleteGroup', { id })
}

export function createGroupSession(groupId: string): Promise<RpcResult<GroupRoomRow>> {
  return workbenchCall<GroupRoomRow>('createGroupSession', { groupId })
}

export function listGroupSessions(groupId: string): Promise<RpcResult<{ rooms: readonly GroupRoomRow[] }>> {
  return workbenchCall('listGroupSessions', { groupId })
}

export function retryMember(
  roomId: string,
  botId: string,
  errorSeq: number,
): Promise<RpcResult<{ roomId: string; botId: string; accepted: true }>> {
  return workbenchCall('retryMember', { roomId, botId, errorSeq })
}


export function draftStorageKey(botId: string): string {
  return `dsh-bot:draft:${botId}`
}

export function groupDraftStorageKey(groupId: string): string {
  return `dsh-bot:draft:group:${groupId}`
}

export function readDraft(botId: string): string {
  try {
    return localStorage.getItem(draftStorageKey(botId)) ?? ''
  } catch {
    return ''
  }
}

export function writeDraft(botId: string, text: string): void {
  try {
    const key = draftStorageKey(botId)
    if (text.trim() === '') localStorage.removeItem(key)
    else localStorage.setItem(key, text)
  } catch {
    // private-mode / blocked storage must not break sending
  }
}


export function memoryList(botId: string): Promise<RpcResult<MemoryListValue>> {
  return workbenchCall<MemoryListValue>('memoryList', { botId })
}

export function memoryRemember(
  botId: string,
  text: string,
  sessionId?: string,
): Promise<RpcResult<{ id: string }>> {
  return workbenchCall('memoryRemember', {
    botId,
    text,
    ...sessionId === undefined || sessionId === '' ? {} : { sessionId },
  })
}

export function memoryForget(botId: string, id: string): Promise<RpcResult<{ ok: true }>> {
  return workbenchCall('memoryForget', { botId, id })
}

export function memoryClear(botId: string): Promise<RpcResult<{ ok: true }>> {
  return workbenchCall('memoryClear', { botId })
}

export function memoryCount(value: MemoryListValue | undefined): number {
  if (value === undefined) return 0
  return (value.profile ?? []).length + (value.log ?? []).length
}


export function routineList(botId?: string): Promise<RpcResult<readonly RoutineRow[]>> {
  return workbenchCall('routineList', botId === undefined || botId === '' ? {} : { botId })
}

export function routinePreview(schedule: string): Promise<RpcResult<{ schedule: string; timeZone: string; nextRunAt: number }>> {
  return workbenchCall('routinePreview', { schedule })
}

export function routineCreate(input: {
  botId: string
  name: string
  schedule: string
  instruction: string
  notify?: boolean
}): Promise<RpcResult<RoutineRow>> {
  return workbenchCall('routineCreate', input)
}

export function routineUpdate(input: {
  id: string
  name?: string
  schedule?: string
  instruction?: string
  enabled?: boolean
  notify?: boolean
}): Promise<RpcResult<RoutineRow>> {
  return workbenchCall('routineUpdate', input)
}

export function routineDelete(id: string): Promise<RpcResult<{ id: string; deleted: true }>> {
  return workbenchCall('routineDelete', { id })
}

export function routineRunNow(id: string): Promise<RpcResult<{ outcome: string; ms: number }>> {
  return workbenchCall('routineRunNow', { id })
}

export function routineDecline(botId: string, topic: string): Promise<RpcResult<{ ok: true; declined: readonly string[] }>> {
  return workbenchCall('routineDecline', { botId, topic })
}

export function markRead(botId: string): Promise<RpcResult<{ ok: true; unread: number }>> {
  return workbenchCall('markRead', { botId })
}

export function peerLog(botId?: string): Promise<RpcResult<readonly PeerLogRow[]>> {
  return workbenchCall('peerLog', botId === undefined || botId === '' ? {} : { botId })
}

export function sendToPeer(input: {
  toBot: string
  text: string
  fromBot?: string
  fromSessionId?: string
}): Promise<RpcResult<{ accepted: true; sessionId: string }>> {
  return workbenchCall('sendToPeer', { ...input })
}

export function updateBotLayout(input: {
  bots?: readonly Partial<Pick<WorkbenchBot, 'id' | 'pinned' | 'section' | 'hidden' | 'order' | 'muted'>>[]
  groups?: readonly { id: string; section?: string; order?: number }[]
  sections?: readonly RosterSection[]
}): Promise<RpcResult<{ ok: true; skipped: readonly string[]; sections: readonly RosterSection[] }>> {
  return workbenchCall('updateBotLayout', { ...input })
}

export function rosterSections(): Promise<RpcResult<{ sections: readonly RosterSection[] }>> {
  return workbenchCall('updateBotLayout', {})
}
