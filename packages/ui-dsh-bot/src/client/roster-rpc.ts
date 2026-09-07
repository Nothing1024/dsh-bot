/**
 * Left-rail roster data: listBots + listGroups + lazy listBotSessions (path B).
 * SSE `/dsh-bot/events` debounces refresh; disconnect falls back to 2s polling.
 */
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
  RoutineRow,
  UpdateBotArgs,
  UpdateBotLayoutInput,
  UpdateBotLayoutValue,
  WorkbenchBot,
  WorkbenchGroup,
  WorkbenchHistoryItem,
  WorkbenchSessionRow,
  WorkbenchWireError,
} from 'dsh-bot-shared'
import { observable } from './observable.ts'
import type { ObservableHandle } from './observable.ts'

export interface RpcOk<T> { ok: true; value: T }
export interface RpcFail { ok: false; error: WorkbenchWireError }
export type RpcResult<T> = RpcOk<T> | RpcFail

export interface RosterSlice<T> {
  readonly status: 'loading' | 'idle' | 'error'
  readonly error: WorkbenchWireError | null
  readonly items: T
}

export interface HistorySlice {
  readonly status: 'loading' | 'idle' | 'error'
  readonly error: WorkbenchWireError | null
  readonly items: readonly WorkbenchHistoryItem[]
  readonly bySeq: Readonly<Record<number, WorkbenchHistoryItem>>
}

export interface RosterRpc {
  readonly bots: ObservableHandle<RosterSlice<readonly WorkbenchBot[]>>
  readonly groups: ObservableHandle<RosterSlice<readonly WorkbenchGroup[]>>
  readonly sessionsByBot: ObservableHandle<Readonly<Record<string, readonly WorkbenchSessionRow[]>>>
  readonly historyBySession: ObservableHandle<Readonly<Record<string, HistorySlice>>>
  refresh(): Promise<void>
  sessionsOf(botId: string): Promise<readonly WorkbenchSessionRow[]>
  createBotSession(botId: string, title?: string): Promise<RpcResult<CreateBotSessionValue>>
  createGroupSession(groupId: string): Promise<RpcResult<GroupRoomRow>>
  markRead(botId: string): Promise<RpcResult<{ ok: true; unread: number }>>
  updateBotLayout(input: UpdateBotLayoutInput): Promise<RpcResult<UpdateBotLayoutValue>>
  createBot(args: CreateBotArgs): Promise<RpcResult<WorkbenchBot>>
  updateBot(args: UpdateBotArgs): Promise<RpcResult<WorkbenchBot>>
  deleteBot(id: string): Promise<RpcResult<{ id: string; deleted: true }>>
  createGroup(args: { name: string; memberIds: readonly string[] }): Promise<RpcResult<WorkbenchGroup>>
  updateGroup(args: { id: string; name?: string; memberIds?: readonly string[] }): Promise<RpcResult<WorkbenchGroup>>
  deleteGroup(id: string): Promise<RpcResult<{ id: string; deleted: true }>>
  memoryList(botId: string): Promise<RpcResult<MemoryListValue>>
  routineList(botId?: string): Promise<RpcResult<readonly RoutineRow[]>>
  peerLog(botId?: string): Promise<RpcResult<readonly PeerLogRow[]>>
  historyOf(sessionId: string): Promise<HistorySlice>
  setActive(active: boolean): void
  dispose(): void
}

export interface RosterRpcDeps {
  fetch?: typeof fetch
  EventSource?: typeof EventSource
}

const POLL_MS = 2000
const DEBOUNCE_MS = 300
const EMPTY_BOTS: RosterSlice<readonly WorkbenchBot[]> = { status: 'loading', error: null, items: [] }
const EMPTY_GROUPS: RosterSlice<readonly WorkbenchGroup[]> = { status: 'loading', error: null, items: [] }

type FetchLike = (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ json(): Promise<unknown> }>

export async function rosterCall<T>(
  method: string,
  args: Record<string, unknown> = {},
  fetchImpl: FetchLike = fetch,
): Promise<RpcResult<T>> {
  let response: { json(): Promise<unknown> }
  try {
    response = await fetchImpl(`/dsh-bot/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ args }),
    })
  } catch (error) {
    return {
      ok: false,
      error: { code: 'unavailable', message: error instanceof Error ? error.message : String(error) },
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

function indexHistory(items: readonly WorkbenchHistoryItem[]): HistorySlice {
  const bySeq: Record<number, WorkbenchHistoryItem> = {}
  for (const item of items) bySeq[item.seq] = item
  return { status: 'idle', error: null, items, bySeq }
}

/**
 * Path-B roster client (listBots + listGroups; sessions/history lazy).
 * @param deps - injectable fetch / EventSource for tests.
 */
export function createRosterRpc(deps: RosterRpcDeps = {}): RosterRpc {
  const fetchImpl = deps.fetch ?? fetch
  const EventSourceImpl = deps.EventSource ?? (typeof EventSource === 'undefined' ? undefined : EventSource)
  const bots = observable<RosterSlice<readonly WorkbenchBot[]>>({ ...EMPTY_BOTS })
  const groups = observable<RosterSlice<readonly WorkbenchGroup[]>>({ ...EMPTY_GROUPS })
  const sessionsByBot = observable<Readonly<Record<string, readonly WorkbenchSessionRow[]>>>({})
  const historyBySession = observable<Readonly<Record<string, HistorySlice>>>({})

  let disposed = false
  let active = false
  let inflight: Promise<void> | undefined
  let pollTimer: ReturnType<typeof setInterval> | undefined
  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  let sse: EventSource | undefined
  let sseReady = false
  let reconnectMs = 500
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined

  const stopPoll = (): void => {
    if (pollTimer !== undefined) {
      clearInterval(pollTimer)
      pollTimer = undefined
    }
  }

  const startPoll = (): void => {
    if (pollTimer !== undefined || disposed || !active || sseReady) return
    pollTimer = setInterval(() => { void pull() }, POLL_MS)
  }

  const stopSse = (): void => {
    if (reconnectTimer !== undefined) {
      clearTimeout(reconnectTimer)
      reconnectTimer = undefined
    }
    sse?.close()
    sse = undefined
  }

  const scheduleRefresh = (): void => {
    if (disposed || !active) return
    if (debounceTimer !== undefined) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = undefined
      void pull()
    }, DEBOUNCE_MS)
  }

  const startSse = (): void => {
    if (disposed || !active || EventSourceImpl === undefined || sse !== undefined) return
    try {
      sse = new EventSourceImpl('/dsh-bot/events')
    } catch {
      startPoll()
      return
    }
    sse.onmessage = () => {
      sseReady = true
      reconnectMs = 500
      stopPoll()
      scheduleRefresh()
    }
    sse.onerror = () => {
      sseReady = false
      sse?.close()
      sse = undefined
      if (disposed || !active) return
      console.info('[ui-dsh-bot] roster SSE disconnected; falling back to 2s poll')
      startPoll()
      reconnectTimer = setTimeout(() => {
        reconnectTimer = undefined
        startSse()
      }, reconnectMs)
      reconnectMs = Math.min(reconnectMs * 2, 10_000)
    }
  }

  const pull = async (): Promise<void> => {
    if (disposed) return
    if (inflight !== undefined) {
      await inflight
      return
    }
    inflight = (async () => {
      const [botsOutcome, groupsOutcome] = await Promise.all([
        rosterCall<ListBotsValue>('listBots', {}, fetchImpl),
        rosterCall<ListGroupsValue>('listGroups', {}, fetchImpl),
      ])
      if (disposed) return
      if (!botsOutcome.ok) {
        bots.set({
          status: 'error',
          error: botsOutcome.error,
          items: bots.getSnapshot().items,
        })
      } else {
        bots.set({ status: 'idle', error: null, items: botsOutcome.value.bots })
      }
      if (!groupsOutcome.ok) {
        groups.set({
          status: groupsOutcome.error.code === 'unavailable' && groups.getSnapshot().items.length === 0
            ? 'error'
            : groups.getSnapshot().status === 'loading' ? 'idle' : groups.getSnapshot().status,
          error: groupsOutcome.error,
          items: groups.getSnapshot().items,
        })
      } else {
        groups.set({ status: 'idle', error: null, items: groupsOutcome.value.groups ?? [] })
      }
    })()
    try {
      await inflight
    } finally {
      inflight = undefined
    }
  }

  const sessionsOf = async (botId: string): Promise<readonly WorkbenchSessionRow[]> => {
    const outcome = await rosterCall<ListBotSessionsValue>('listBotSessions', { botId }, fetchImpl)
    if (!outcome.ok) return sessionsByBot.getSnapshot()[botId] ?? []
    const rows = outcome.value.sessions
    sessionsByBot.set({ ...sessionsByBot.getSnapshot(), [botId]: rows })
    return rows
  }

  const historyOf = async (sessionId: string): Promise<HistorySlice> => {
    const outcome = await rosterCall<HistoryValue>('history', { sessionId }, fetchImpl)
    if (!outcome.ok) {
      const failed: HistorySlice = {
        status: 'error',
        error: outcome.error,
        items: historyBySession.getSnapshot()[sessionId]?.items ?? [],
        bySeq: historyBySession.getSnapshot()[sessionId]?.bySeq ?? {},
      }
      historyBySession.set({ ...historyBySession.getSnapshot(), [sessionId]: failed })
      return failed
    }
    const slice = indexHistory(outcome.value.items ?? [])
    historyBySession.set({ ...historyBySession.getSnapshot(), [sessionId]: slice })
    return slice
  }

  const afterMutate = async (): Promise<void> => {
    await pull()
  }

  return {
    bots,
    groups,
    sessionsByBot,
    historyBySession,
    refresh: pull,
    sessionsOf,
    createBotSession: async (botId, title) => {
      const args: Record<string, unknown> = { botId }
      if (title !== undefined && title.trim() !== '') args.title = title
      const outcome = await rosterCall<CreateBotSessionValue>('createBotSession', args, fetchImpl)
      if (outcome.ok) await sessionsOf(botId)
      return outcome
    },
    createGroupSession: async (groupId) => rosterCall<GroupRoomRow>('createGroupSession', { groupId }, fetchImpl),
    markRead: async (botId) => {
      const current = bots.getSnapshot()
      bots.set({
        ...current,
        items: current.items.map(bot => bot.id === botId ? { ...bot, unread: 0 } : bot),
      })
      const outcome = await rosterCall<{ ok: true; unread: number }>('markRead', { botId }, fetchImpl)
      if (!outcome.ok) await pull()
      else {
        const after = bots.getSnapshot()
        bots.set({
          ...after,
          items: after.items.map(bot => bot.id === botId ? { ...bot, unread: outcome.value.unread } : bot),
        })
      }
      return outcome
    },
    updateBotLayout: async (input) => {
      const outcome = await rosterCall<UpdateBotLayoutValue>('updateBotLayout', { ...input }, fetchImpl)
      if (outcome.ok) await afterMutate()
      return outcome
    },
    createBot: async (args) => {
      const outcome = await rosterCall<WorkbenchBot>('createBot', { ...args }, fetchImpl)
      if (outcome.ok) await afterMutate()
      return outcome
    },
    updateBot: async (args) => {
      const body: Record<string, unknown> = { id: args.id }
      if (args.name !== undefined) body.name = args.name
      if (args.persona !== undefined) body.persona = args.persona
      if (args.avatar !== undefined) body.avatar = args.avatar
      if (args.modelOverride !== undefined) body.modelOverride = args.modelOverride
      const outcome = await rosterCall<WorkbenchBot>('updateBot', body, fetchImpl)
      if (outcome.ok) await afterMutate()
      return outcome
    },
    deleteBot: async (id) => {
      const outcome = await rosterCall<{ id: string; deleted: true }>('deleteBot', { id }, fetchImpl)
      if (outcome.ok) await afterMutate()
      return outcome
    },
    createGroup: async (args) => {
      const outcome = await rosterCall<WorkbenchGroup>('createGroup', { ...args }, fetchImpl)
      if (outcome.ok) await afterMutate()
      return outcome
    },
    updateGroup: async (args) => {
      const body: Record<string, unknown> = { id: args.id }
      if (args.name !== undefined) body.name = args.name
      if (args.memberIds !== undefined) body.memberIds = args.memberIds
      const outcome = await rosterCall<WorkbenchGroup>('updateGroup', body, fetchImpl)
      if (outcome.ok) await afterMutate()
      return outcome
    },
    deleteGroup: async (id) => {
      const outcome = await rosterCall<{ id: string; deleted: true }>('deleteGroup', { id }, fetchImpl)
      if (outcome.ok) await afterMutate()
      return outcome
    },
    memoryList: (botId) => rosterCall<MemoryListValue>('memoryList', { botId }, fetchImpl),
    routineList: (botId) => rosterCall<readonly RoutineRow[]>(
      'routineList',
      botId === undefined || botId === '' ? {} : { botId },
      fetchImpl,
    ),
    peerLog: (botId) => rosterCall<readonly PeerLogRow[]>(
      'peerLog',
      botId === undefined || botId === '' ? {} : { botId },
      fetchImpl,
    ),
    historyOf,
    setActive: (next) => {
      active = next
      if (next) {
        void pull()
        startSse()
        startPoll()
        return
      }
      stopSse()
      sseReady = false
      stopPoll()
    },
    dispose: () => {
      disposed = true
      active = false
      if (debounceTimer !== undefined) clearTimeout(debounceTimer)
      stopSse()
      stopPoll()
    },
  }
}
