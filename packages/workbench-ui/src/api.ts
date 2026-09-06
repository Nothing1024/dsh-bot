/**
 * Browser HTTP RPC against `/dsh-bot/<method>` with `{args}` (v1 rpc.ts wire).
 */

export interface WorkbenchWireError {
  readonly code?: string
  readonly message: string
}

interface RpcOk<T> { ok: true; value: T }
interface RpcFail { ok: false; error: WorkbenchWireError }
export type RpcResult<T> = RpcOk<T> | RpcFail

/**
 * POST `/dsh-bot/<method>` with `{args}` and unwrap `{ok,value|error}`.
 */
export async function workbenchCall<T>(
  method: string,
  args: Record<string, unknown> = {},
): Promise<RpcResult<T>> {
  let response: Response
  try {
    response = await fetch(`/dsh-bot/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ args }),
    })
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'unavailable',
        message: error instanceof Error ? error.message : String(error),
      },
    }
  }
  let json: unknown
  try {
    json = await response.json()
  } catch {
    return { ok: false, error: { code: 'internal', message: `dsh-bot RPC ${method} returned non-JSON` } }
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

export interface WorkbenchBotAvatar {
  readonly color: string
  readonly emoji?: string
}

export interface WorkbenchModelOverride {
  readonly provider: string
  readonly model: string
  readonly reasoningEffort?: string
}

export interface WorkbenchBot {
  readonly unread?: number
  readonly declined?: readonly string[]
  readonly id: string
  readonly name: string
  readonly avatar: WorkbenchBotAvatar
  readonly presetId: string
  readonly modelOverride?: WorkbenchModelOverride
  readonly createdAt: number
  readonly persona: string
  readonly protected: boolean
}

export interface ListBotsValue {
  readonly bots: readonly WorkbenchBot[]
}

export interface CreateBotArgs {
  readonly name: string
  readonly persona: string
  readonly avatar?: { readonly emoji?: string; readonly color?: string }
  readonly modelOverride?: WorkbenchModelOverride
}

export interface UpdateBotArgs {
  readonly id: string
  readonly name?: string
  readonly persona?: string
  readonly avatar?: { readonly emoji?: string; readonly color?: string }
  readonly modelOverride?: WorkbenchModelOverride | null
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

export interface WorkbenchBotModelInfo {
  readonly provider: string
  readonly model: string
  readonly source: 'override' | 'global-default'
}

export function listSessionsModel(): Promise<RpcResult<{ botModel: WorkbenchBotModelInfo }>> {
  return workbenchCall('listSessions', {})
}

export interface WorkbenchSessionRow {
  readonly sessionId: string
  readonly title?: string
  readonly tags: readonly string[]
  readonly status: 'live' | 'idle'
  readonly createdAt: number
  readonly updatedAt: number
  readonly hidden: boolean
  readonly working: boolean
}

export interface ListBotSessionsValue {
  readonly sessions: readonly WorkbenchSessionRow[]
}

export interface CreateBotSessionValue {
  readonly sessionId: string
  readonly title: string
  readonly botId: string
  readonly presetId: string
}

export interface WorkbenchHistoryAuthor {
  readonly botId: string
  readonly name: string
  readonly avatar: { readonly color: string; readonly emoji?: string }
}

export interface WorkbenchHistoryItem {
  readonly id: string
  readonly kind: 'message' | 'thinking' | 'tool' | 'propose-routine'
  readonly schedule?: string
  readonly instruction?: string
  readonly origin?: 'routine'
  readonly seq: number
  readonly role?: 'user' | 'assistant'
  readonly text?: string
  readonly name?: string
  readonly summary?: string
  readonly author?: WorkbenchHistoryAuthor
  readonly error?: { readonly code: string; readonly message: string }
}

export interface HistoryValue {
  readonly sessionId: string
  readonly items: readonly WorkbenchHistoryItem[]
  readonly working: boolean
  readonly speaking?: { readonly botId: string; readonly name: string }
}

export interface PromptValue {
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

export function prompt(sessionId: string, text: string): Promise<RpcResult<PromptValue>> {
  return workbenchCall<PromptValue>('prompt', { sessionId, text })
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

export interface WorkbenchGroup {
  readonly id: string
  readonly name: string
  readonly memberIds: readonly string[]
  readonly createdAt: number
}

export interface ListGroupsValue {
  readonly groups: readonly WorkbenchGroup[]
}

export interface GroupRoomRow {
  readonly roomId: string
  readonly groupId: string
  readonly createdAt: number
  readonly updatedAt: number
}

export function listGroups(): Promise<RpcResult<ListGroupsValue>> {
  return workbenchCall<ListGroupsValue>('listGroups', {})
}

export function createGroup(args: {
  readonly name: string
  readonly memberIds: readonly string[]
}): Promise<RpcResult<WorkbenchGroup>> {
  return workbenchCall<WorkbenchGroup>('createGroup', { ...args })
}

export function updateGroup(args: {
  readonly id: string
  readonly name?: string
  readonly memberIds?: readonly string[]
}): Promise<RpcResult<WorkbenchGroup>> {
  const body: Record<string, unknown> = { id: args.id }
  if (args.name !== undefined) body.name = args.name
  if (args.memberIds !== undefined) body.memberIds = args.memberIds
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


export interface MemoryProfileRow {
  readonly id: string
  readonly text: string
  readonly ts: number
}

export interface MemoryLogRow {
  readonly id: string
  readonly kind: 'log' | 'note'
  readonly text: string
  readonly ts: number
  readonly source: 'auto' | 'explicit'
  readonly sessionId?: string
}

export interface MemoryListValue {
  readonly profile: readonly MemoryProfileRow[]
  readonly log: readonly MemoryLogRow[]
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


export interface RoutineRow {
  readonly id: string
  readonly botId: string
  readonly name: string
  readonly schedule: string
  readonly instruction: string
  readonly enabled: boolean
  readonly notify: boolean
  readonly lastRunAt?: number
  readonly lastOutcome?: 'spoke' | 'silent' | 'error'
}

export function routineList(botId?: string): Promise<RpcResult<readonly RoutineRow[]>> {
  return workbenchCall('routineList', botId === undefined || botId === '' ? {} : { botId })
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
