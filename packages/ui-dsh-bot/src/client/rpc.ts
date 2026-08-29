/**
 * Browser-side HTTP RPC against `/dsh-bot/<method>` with `{args}` plus a
 * polling observable. No SSE (MVP). Polling pauses when the sidebar panel
 * is closed.
 */

export interface DshBotSessionRow {
  readonly sessionId: string
  readonly title?: string
  readonly tags: readonly string[]
  readonly status: 'live' | 'idle'
  readonly createdAt: number
  readonly hidden: boolean
}

export interface DshBotModelInfo {
  readonly provider: string
  readonly model: string
  readonly source: 'override' | 'global-default'
}

export interface DshBotListValue {
  readonly sessions: readonly DshBotSessionRow[]
  readonly botModel: DshBotModelInfo
}

export interface DshBotWireError {
  readonly code?: string
  readonly message: string
}

export interface DshBotListState {
  readonly items: readonly DshBotSessionRow[]
  readonly botModel: DshBotModelInfo | null
  readonly state: 'loading' | 'idle' | 'error'
  readonly error: DshBotWireError | null
  readonly includeHidden: boolean
}

export interface DshBotCreateResult {
  readonly sessionId: string
  readonly title: string
}

interface RpcOk<T> { ok: true; value: T }
interface RpcFail { ok: false; error: DshBotWireError }
export type RpcResult<T> = RpcOk<T> | RpcFail

const EMPTY_MODEL: DshBotModelInfo = { provider: '', model: '', source: 'global-default' }

const EMPTY: DshBotListState = {
  items: [],
  botModel: null,
  state: 'loading',
  error: null,
  includeHidden: false,
}

const POLL_MS = 2000

interface ObservableHandle<T> {
  getSnapshot(): T
  subscribe(fn: () => void): () => void
  set(next: T): void
}

function observable<T>(initial: T): ObservableHandle<T> {
  let snap = initial
  const subs = new Set<() => void>()
  return {
    getSnapshot: () => snap,
    subscribe: (fn) => {
      subs.add(fn)
      return () => { subs.delete(fn) }
    },
    set: (next) => {
      snap = next
      for (const sub of subs) sub()
    },
  }
}

async function dshBotCall<T>(method: string, args: Record<string, unknown>): Promise<RpcResult<T>> {
  let response: Response
  try {
    response = await fetch(`/dsh-bot/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ args }),
    })
  } catch (error) {
    return { ok: false, error: { code: 'unavailable', message: error instanceof Error ? error.message : String(error) } }
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
  const body = json as { ok?: boolean; error?: DshBotWireError; value?: T }
  if (body.ok === false) {
    return { ok: false, error: body.error ?? { message: `${method} failed` } }
  }
  return { ok: true, value: body.value as T }
}

function parseListValue(value: DshBotListValue | undefined): { sessions: readonly DshBotSessionRow[]; botModel: DshBotModelInfo } {
  const sessions = value?.sessions ?? []
  const botModel = value?.botModel ?? EMPTY_MODEL
  return { sessions, botModel }
}

/** Client face used by the tab (stubbed in tests). */
export interface IDshBotClient {
  readonly list: { getSnapshot(): DshBotListState; subscribe(fn: () => void): () => void }
  refresh(): Promise<void>
  setIncludeHidden(includeHidden: boolean): void
  setPanelOpen(open: boolean): void
  createSession(title?: string, cwd?: string): Promise<RpcResult<DshBotCreateResult>>
  dispose(): void
}

/**
 * Create the RPC-backed list client. Tests that pass a stub skip this.
 */
export function createRpcDshBot(): IDshBotClient {
  const list = observable<DshBotListState>({ ...EMPTY })
  let timer: ReturnType<typeof setInterval> | undefined
  let disposed = false
  let panelOpen = false
  let inflight: Promise<void> | undefined

  const stopPoll = (): void => {
    if (timer !== undefined) {
      clearInterval(timer)
      timer = undefined
    }
  }

  const startPoll = (): void => {
    if (timer !== undefined || disposed || !panelOpen) return
    timer = setInterval(() => { void pull() }, POLL_MS)
  }

  const pull = async (): Promise<void> => {
    if (disposed) return
    if (inflight !== undefined) {
      await inflight
      return
    }
    const includeHidden = list.getSnapshot().includeHidden
    inflight = (async () => {
      const outcome = await dshBotCall<DshBotListValue>('listSessions', { includeHidden })
      if (disposed) return
      if (!outcome.ok) {
        const current = list.getSnapshot()
        list.set({
          items: current.items,
          botModel: current.botModel,
          state: 'error',
          error: {
            ...outcome.error.code !== undefined ? { code: outcome.error.code } : {},
            message: outcome.error.message ?? 'listSessions failed',
          },
          includeHidden: current.includeHidden,
        })
        return
      }
      const parsed = parseListValue(outcome.value)
      list.set({
        items: parsed.sessions,
        botModel: parsed.botModel,
        state: 'idle',
        error: null,
        includeHidden,
      })
    })()
    try {
      await inflight
    } finally {
      inflight = undefined
    }
  }

  void pull()

  return {
    list,
    refresh: async () => { await pull() },
    setIncludeHidden: (includeHidden) => {
      const current = list.getSnapshot()
      if (current.includeHidden === includeHidden) return
      list.set({ ...current, includeHidden, state: 'loading' })
      void pull()
    },
    setPanelOpen: (open) => {
      panelOpen = open
      if (open) {
        void pull()
        startPoll()
        return
      }
      stopPoll()
    },
    createSession: async (title, cwd) => {
      const args: Record<string, unknown> = {}
      if (title !== undefined && title.trim() !== '') args.title = title
      if (cwd !== undefined && cwd.trim() !== '') args.cwd = cwd
      const outcome = await dshBotCall<DshBotCreateResult>('createSession', args)
      if (outcome.ok) void pull()
      return outcome
    },
    dispose: () => {
      disposed = true
      stopPoll()
    },
  }
}
