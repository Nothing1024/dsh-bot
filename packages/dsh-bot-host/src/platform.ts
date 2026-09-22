/**
 * In-process ASM-007 / INV-002 gates. dsh-bot-host never fetches the web
 * gateway; session create/write/wait/read go through ctx.sessionTool only.
 * selectModel / prompt / list go through ctx.sessionController; archive
 * stays on ctx.workspaceRegistry; the global default is agentDefaultModel.
 * @module dsh-bot-host/platform
 */

import type { Context } from '@deepseek-ai/cordis'
import { DshBotError } from './errors.ts'
import { muxFrameFromAssistantStream, muxFrameFromSessionEvent } from './bot-events.ts'

/** Bot-owned model selection (settings `dsh-bot.model`). */
export interface DshBotModelRef {
  readonly provider: string
  readonly model: string
  readonly reasoningEffort?: string
}

/** Args for gateway `session.create` with an explicit agent preset. */
export interface GatewayCreateSessionRequest {
  readonly agentPreset: string
  readonly cwd: string
}

/** Result of gateway `session.create`. */
export interface GatewayCreateSessionResult {
  readonly sessionId: string
  readonly agentPreset?: string
}

/** One row of gateway `session.list` (working / updatedAt enrichment). */
export interface GatewaySessionRow {
  readonly sessionId: string
  readonly running: boolean
  readonly updatedAt: number
  readonly agentPreset?: string
  readonly title?: string
}

/**
 * Platform verbs the host needs beyond sessionTool. Tests stub this object;
 * production wiring is {@link createPlatform}.
 */
export interface SessionPromptRequest {
  readonly sessionId: string
  readonly mode: 'queue' | 'steer'
  readonly text: string
}

export interface DshBotPlatform {
  archiveSession(sessionId: string, options?: { readonly stopActivity?: boolean }): Promise<void>
  unarchiveSession(sessionId: string): Promise<void>
  selectModel(sessionId: string, model: DshBotModelRef): Promise<void>
  snapshotGlobalDefault(): DshBotModelRef | undefined
  restoreGlobalDefault(model: DshBotModelRef): Promise<void>
  /** Gateway `session.create` with `agentPreset` (session-tool create cannot). */
  createSession(request: GatewayCreateSessionRequest): Promise<GatewayCreateSessionResult>
  renameSession(sessionId: string, title: string): Promise<void>
  listSessions(): Promise<readonly GatewaySessionRow[]>
  promptSession?(request: SessionPromptRequest): Promise<{ accepted: true } | { unavailable: true; message?: string }>
  cancelSession?(sessionId: string): Promise<{ accepted: true } | { unavailable: true; message?: string }>
  updateQueue?(request: { sessionId: string; itemId: string; action: unknown }): Promise<{ accepted: true } | { unavailable: true; message?: string }>
  respond?(request: { rpcId: string; value: unknown }): Promise<{ ok: true } | { ok: false; message: string }>
  subscribeMux?(signal: AbortSignal): AsyncIterable<unknown> | undefined
  subscribeHost?(signal: AbortSignal): AsyncIterable<unknown> | undefined
}

interface WorkspaceRegistryDuck {
  archiveSession(sessionId: string, options?: { readonly stopActivity?: boolean }): Promise<void>
  readonly archivedSessionIds?: readonly string[]
  enqueueOperation?(operation: () => Promise<unknown>): Promise<unknown>
  requireState?(): { readonly archivedSessionIds: readonly string[] } & Record<string, unknown>
  setState?(state: unknown): Promise<void>
}

interface AgentDefaultModelDuck {
  currentSelection(): DshBotModelRef
  saveSelection(next: DshBotModelRef): Promise<void>
}

interface SessionControllerDuck {
  create(request: {
    readonly cwd?: string
    readonly agentPreset?: string
    readonly sessionId?: string
  }): Promise<{ readonly sessionId: string; readonly agentPreset?: string }>
  rename(request: {
    readonly sessionId: string
    readonly title: string
  }): Promise<{ readonly title: string; readonly seq: number }>
  list(
    request: { readonly cursor?: string },
    signal: AbortSignal,
  ): Promise<{
    readonly items: ReadonlyArray<{
      readonly sessionId?: string
      readonly running?: boolean
      readonly updatedAt?: number
      readonly cwd?: string
      readonly projections?: { readonly values?: { readonly title?: unknown; readonly agentPreset?: unknown } }
    }>
  }>
  selectModel(request: {
    readonly sessionId: string
    readonly provider: string
    readonly model: string
    readonly reasoningEffort?: string
  }): Promise<{ readonly selected: DshBotModelRef }>
  prompt(
    request: {
      readonly requestId: string
      readonly sessionId: string
      readonly mode: 'queue' | 'steer'
      readonly content: ReadonlyArray<{ readonly type: 'text'; readonly text: string }>
    },
    signal: AbortSignal,
  ): Promise<{ readonly accepted: true }>
  cancel(request: { readonly sessionId: string }): { readonly accepted: true } | Promise<{ readonly accepted: true }>
  updateQueue(request: {
    readonly sessionId: string
    readonly itemId: string
    readonly action: unknown
  }): { readonly accepted: true } | Promise<{ readonly accepted: true }>
  control?(signal: AbortSignal): AsyncIterable<unknown>
}

interface PendingRespond {
  readonly sessionId: string
  readonly resolve: (value: unknown) => void
  readonly kind: 'approval' | 'question'
  readonly questionId?: string
}

function agentSessionId(agent: unknown): string {
  if (typeof agent !== 'object' || agent === null) return ''
  const rec = agent as { id?: unknown; session?: { id?: unknown } }
  if (typeof rec.id === 'string' && rec.id !== '') return rec.id
  return typeof rec.session?.id === 'string' ? rec.session.id : ''
}

function mintRpcId(): string {
  return crypto.randomUUID()
}

function titleOfGatewayItem(item: {
  readonly title?: string
  readonly projections?: { readonly values?: { readonly title?: unknown } }
}): string | undefined {
  if (typeof item.title === 'string' && item.title.trim() !== '') return item.title
  const projected = item.projections?.values?.title
  if (typeof projected === 'string' && projected.trim() !== '') return projected
  return undefined
}

function agentPresetOf(item: {
  readonly agentPreset?: string
  readonly projections?: { readonly values?: { readonly agentPreset?: unknown } }
}): string | undefined {
  if (typeof item.agentPreset === 'string' && item.agentPreset !== '') return item.agentPreset
  const projected = item.projections?.values?.agentPreset
  return typeof projected === 'string' && projected !== '' ? projected : undefined
}

function remoteCode(error: unknown): string {
  if (error === null || typeof error !== 'object') return ''
  if (!('code' in error) || typeof error.code !== 'string') return ''
  return error.code
}

function fail(code: DshBotError['code'], message: string, sessionId?: string, cause?: unknown): never {
  throw new DshBotError(code, message, {
    ...sessionId === undefined ? {} : { sessionId },
    ...cause === undefined ? {} : { cause },
  })
}

function sessionControllerOf(ctx: Context): SessionControllerDuck | undefined {
  return ctx.get('sessionController') as SessionControllerDuck | undefined
}

function withResolvers<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(ok => { resolve = ok })
  return { promise, resolve }
}

function listen(
  ctx: Context,
  name: string,
  listener: (...args: never[]) => unknown,
  options?: { global?: boolean; prepend?: boolean },
): () => boolean {
  return (ctx.on as unknown as (
    event: string,
    fn: (...args: never[]) => unknown,
    opts?: { global?: boolean; prepend?: boolean },
  ) => () => boolean)(name, listener, options)
}

function eventIterable(
  subscribe: (push: (item: unknown) => void) => () => boolean | void,
  signal: AbortSignal,
): AsyncIterable<unknown> {
  return {
    [Symbol.asyncIterator](): AsyncIterator<unknown> {
      const queue: unknown[] = []
      let waiting: ReturnType<typeof withResolvers<void>> | undefined
      let done = false
      const push = (item: unknown): void => {
        if (done) return
        queue.push(item)
        waiting?.resolve()
      }
      const dispose = subscribe(push)
      const onAbort = (): void => {
        if (done) return
        done = true
        dispose()
        waiting?.resolve()
      }
      if (signal.aborted) onAbort()
      else signal.addEventListener('abort', onAbort, { once: true })
      return {
        async next() {
          while (!done && queue.length === 0) {
            waiting = withResolvers<void>()
            await waiting.promise
            waiting = undefined
          }
          if (queue.length > 0) return { value: queue.shift(), done: false }
          return { value: undefined, done: true }
        },
        async return() {
          onAbort()
          return { value: undefined, done: true }
        },
      }
    },
  }
}


async function* mapControlToHost(frames: AsyncIterable<unknown>): AsyncIterable<unknown> {
  for await (const frame of frames) {
    if (typeof frame !== 'object' || frame === null) continue
    const rec = frame as {
      type?: unknown
      sessionId?: unknown
      items?: unknown
      value?: { queues?: Record<string, unknown> }
    }
    if (rec.type === 'queue') {
      yield { type: 'session/queue', sessionId: rec.sessionId, items: rec.items }
      continue
    }
    if (rec.type === 'projection') {
      yield { type: 'session/projection', ...rec }
      continue
    }
    if (rec.type === 'baseline' && rec.value?.queues !== undefined) {
      for (const sessionId of Object.keys(rec.value.queues)) {
        yield {
          type: 'session/queue',
          sessionId,
          items: rec.value.queues[sessionId],
        }
      }
    }
  }
}

function mergeIterables(streams: ReadonlyArray<AsyncIterable<unknown> | undefined>): AsyncIterable<unknown> | undefined {
  const live = streams.filter((stream): stream is AsyncIterable<unknown> => stream !== undefined)
  if (live.length === 0) return undefined
  if (live.length === 1) return live[0]
  return {
    async *[Symbol.asyncIterator]() {
      const queue: unknown[] = []
      let waiting: ReturnType<typeof withResolvers<void>> | undefined
      let pending = live.length
      const pumps = live.map(async stream => {
        try {
          for await (const item of stream) {
            queue.push(item)
            waiting?.resolve()
          }
        } finally {
          pending -= 1
          waiting?.resolve()
        }
      })
      try {
        while (pending > 0 || queue.length > 0) {
          if (queue.length === 0) {
            waiting = withResolvers<void>()
            await waiting.promise
            waiting = undefined
            continue
          }
          yield queue.shift()
        }
      } finally {
        await Promise.allSettled(pumps)
      }
    },
  }
}

/**
 * Bind ASM-007 / INV-002 verbs to the live composition. Missing peers fail
 * loud at call time — never a silent skip.
 */
export function createPlatform(ctx: Context): DshBotPlatform {
  const pending = new Map<string, PendingRespond>()
  const muxListeners = new Set<(item: unknown) => void>()
  let muxDispose: (() => boolean) | undefined

  const emitMux = (item: unknown): void => {
    for (const listener of muxListeners) listener(item)
  }

  const ensureMux = (): void => {
    if (muxDispose !== undefined) return
    muxDispose = listen(ctx, 'session/event', (session: { id?: unknown }, event: unknown) => {
      emitMux(muxFrameFromSessionEvent(session, event))
    }, { global: true })
    const disposeLive = listen(ctx, 'agent/assistant-stream', (event: {
      agent: { session: { id?: unknown; seq?: unknown } }
      frame: Parameters<typeof muxFrameFromAssistantStream>[1]
    }) => {
      const frame = muxFrameFromAssistantStream(event.agent.session, event.frame)
      if (frame !== undefined) emitMux(frame)
    }, { global: true })
    ctx.effect(() => () => {
      disposeLive()
      muxDispose?.()
      muxDispose = undefined
      muxListeners.clear()
      pending.clear()
    })
  }

  listen(ctx, 'approval/request', (req: {
    agent?: unknown
    reason?: string
    signal?: AbortSignal
  }, next: () => Promise<unknown>) => {
    const sessionId = agentSessionId(req.agent)
    if (sessionId === '') return next()
    ensureMux()
    const rpcId = mintRpcId()
    const { promise, resolve } = withResolvers<unknown>()
    pending.set(rpcId, { sessionId, resolve, kind: 'approval' })
    emitMux({
      type: 'approval/requested',
      sessionId,
      rpcId,
      approvalId: rpcId,
      message: req.reason,
    })
    const onAbort = (): void => {
      if (!pending.has(rpcId)) return
      pending.delete(rpcId)
      resolve('cancelled')
    }
    req.signal?.addEventListener('abort', onAbort, { once: true })
    return promise
  }, { prepend: true, global: true })

  listen(ctx, 'user-questions/request', (req: {
    agent?: unknown
    questions?: unknown
    signal?: AbortSignal
  }, next: () => Promise<unknown>) => {
    const sessionId = agentSessionId(req.agent)
    if (sessionId === '') return next()
    ensureMux()
    const rpcId = mintRpcId()
    const { promise, resolve } = withResolvers<unknown>()
    const first = Array.isArray(req.questions)
      ? req.questions[0] as { id?: unknown; question?: unknown } | undefined
      : undefined
    const questionId = typeof first?.id === 'string' && first.id !== '' ? first.id : 'question'
    pending.set(rpcId, { sessionId, resolve, kind: 'question', questionId })
    emitMux({
      type: 'question/requested',
      sessionId,
      rpcId,
      prompt: typeof first?.question === 'string' ? first.question : undefined,
    })
    const onAbort = (): void => {
      if (!pending.has(rpcId)) return
      pending.delete(rpcId)
      resolve({ answers: [] })
    }
    req.signal?.addEventListener('abort', onAbort, { once: true })
    return promise
  }, { prepend: true, global: true })

  return {
    async archiveSession(sessionId) {
      const registry = ctx.get('workspaceRegistry') as WorkspaceRegistryDuck | undefined
      if (registry === undefined) {
        fail('archive-unavailable', 'workspace.archiveSession is unavailable in this composition', sessionId)
      }
      try {
        await registry.archiveSession(sessionId, { stopActivity: true })
      } catch (error) {
        fail(
          'archive-failed',
          `workspace.archiveSession failed for ${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
          sessionId,
          error,
        )
      }
    },

    async unarchiveSession(sessionId) {
      const registry = ctx.get('workspaceRegistry') as WorkspaceRegistryDuck | undefined
      if (registry === undefined) {
        fail('archive-unavailable', 'workspace.unarchiveSession is unavailable in this composition', sessionId)
      }
      if (
        typeof registry.enqueueOperation !== 'function'
        || typeof registry.requireState !== 'function'
        || typeof registry.setState !== 'function'
      ) {
        fail('archive-unavailable', 'workspace.unarchiveSession is unavailable in this composition', sessionId)
      }
      const live = registry as WorkspaceRegistryDuck & {
        enqueueOperation(operation: () => Promise<unknown>): Promise<unknown>
        requireState(): { readonly archivedSessionIds: readonly string[] } & Record<string, unknown>
        setState(state: unknown): Promise<void>
      }
      if (live.archivedSessionIds !== undefined && !live.archivedSessionIds.includes(sessionId)) return
      try {
        await live.enqueueOperation(async () => {
          const state = live.requireState()
          if (!state.archivedSessionIds.includes(sessionId)) return
          await live.setState({
            ...state,
            archivedSessionIds: state.archivedSessionIds.filter(id => id !== sessionId),
          })
        })
      } catch (error) {
        fail(
          'archive-failed',
          `workspace.unarchiveSession failed for ${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
          sessionId,
          error,
        )
      }
    },

    async selectModel(sessionId, model) {
      const sessions = sessionControllerOf(ctx)
      if (sessions === undefined) {
        fail('override-unavailable', 'session.selectModel is unavailable in this composition (ASM-007)', sessionId)
      }
      try {
        await sessions.selectModel({
          sessionId,
          provider: model.provider,
          model: model.model,
          ...model.reasoningEffort === undefined ? {} : { reasoningEffort: model.reasoningEffort },
        })
      } catch (error) {
        fail(
          'override-invalid',
          `illegal dsh-bot.model override ${model.provider}/${model.model}: ${error instanceof Error ? error.message : String(error)}`,
          sessionId,
          error,
        )
      }
    },

    snapshotGlobalDefault() {
      const defaults = ctx.get('agentDefaultModel') as AgentDefaultModelDuck | undefined
      if (defaults === undefined) return undefined
      const selected = defaults.currentSelection()
      return {
        provider: selected.provider,
        model: selected.model,
        ...selected.reasoningEffort === undefined ? {} : { reasoningEffort: String(selected.reasoningEffort) },
      }
    },

    async restoreGlobalDefault(model) {
      const defaults = ctx.get('agentDefaultModel') as AgentDefaultModelDuck | undefined
      if (defaults === undefined) {
        throw new DshBotError(
          'override-restore-failed',
          'cannot restore agent-default-model after session.selectModel (BR-010)',
        )
      }
      await defaults.saveSelection({
        provider: model.provider,
        model: model.model,
        ...model.reasoningEffort === undefined ? {} : { reasoningEffort: model.reasoningEffort },
      })
    },

    async createSession(request) {
      const sessions = sessionControllerOf(ctx)
      if (sessions === undefined) {
        throw new DshBotError('internal', 'session.create is unavailable in this composition')
      }
      try {
        const value = await sessions.create({
          cwd: request.cwd,
          agentPreset: request.agentPreset,
        })
        const sessionId = typeof value?.sessionId === 'string' ? value.sessionId.trim() : ''
        if (sessionId === '') {
          throw new DshBotError('internal', 'session.create returned no sessionId')
        }
        const agentPreset = typeof value?.agentPreset === 'string' ? value.agentPreset : undefined
        return {
          sessionId,
          ...agentPreset === undefined || agentPreset === '' ? {} : { agentPreset },
        }
      } catch (error) {
        if (error instanceof DshBotError) throw error
        const wire = remoteCode(error)
        const message = error instanceof Error ? error.message : 'session.create failed'
        if (wire === 'agent-preset-not-found' || wire === 'agent-preset-invalid') {
          throw new DshBotError('preset-broken', message)
        }
        if (wire === 'web-unreachable') {
          throw new DshBotError('web-unreachable', message)
        }
        throw new DshBotError('internal', message, { cause: error })
      }
    },

    async renameSession(sessionId, title) {
      const sessions = sessionControllerOf(ctx)
      if (sessions === undefined) {
        fail('internal', `session.rename is unavailable in this composition (session ${sessionId})`, sessionId)
      }
      try {
        await sessions.rename({ sessionId, title })
      } catch (error) {
        fail(
          'internal',
          `session.rename failed for ${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
          sessionId,
          error,
        )
      }
    },

    async listSessions() {
      const sessions = sessionControllerOf(ctx)
      if (sessions === undefined) return []
      try {
        const { items } = await sessions.list({}, new AbortController().signal)
        const rows: GatewaySessionRow[] = []
        for (const item of items) {
          const sessionId = typeof item.sessionId === 'string' ? item.sessionId : ''
          if (sessionId === '') continue
          const agentPreset = agentPresetOf(item)
          const title = titleOfGatewayItem(item)
          rows.push({
            sessionId,
            running: item.running === true,
            updatedAt: typeof item.updatedAt === 'number' && Number.isFinite(item.updatedAt) ? item.updatedAt : 0,
            ...agentPreset === undefined ? {} : { agentPreset },
            ...title === undefined ? {} : { title },
          })
        }
        return rows
      } catch {
        return []
      }
    },

    async promptSession(request) {
      const sessions = sessionControllerOf(ctx)
      if (sessions === undefined) {
        return { unavailable: true as const, message: 'session.prompt is unavailable' }
      }
      try {
        await sessions.prompt({
          requestId: mintRpcId(),
          sessionId: request.sessionId,
          mode: request.mode,
          content: [{ type: 'text', text: request.text }],
        }, new AbortController().signal)
        return { accepted: true as const }
      } catch (error) {
        fail(
          'internal',
          `session.prompt failed for ${request.sessionId}: ${error instanceof Error ? error.message : String(error)}`,
          request.sessionId,
          error,
        )
      }
    },

    async cancelSession(sessionId) {
      const sessions = sessionControllerOf(ctx)
      if (sessions === undefined) {
        return { unavailable: true as const, message: 'session.cancel is unavailable' }
      }
      try {
        await sessions.cancel({ sessionId })
        return { accepted: true as const }
      } catch (error) {
        fail(
          'internal',
          `session.cancel failed for ${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
          sessionId,
          error,
        )
      }
    },

    async updateQueue(request) {
      const sessions = sessionControllerOf(ctx)
      if (sessions === undefined) {
        return { unavailable: true as const, message: 'session.updateQueue is unavailable' }
      }
      try {
        await sessions.updateQueue({
          sessionId: request.sessionId,
          itemId: request.itemId,
          action: request.action,
        })
        return { accepted: true as const }
      } catch (error) {
        fail(
          'internal',
          `session.updateQueue failed for ${request.sessionId}: ${error instanceof Error ? error.message : String(error)}`,
          request.sessionId,
          error,
        )
      }
    },

    async respond(request) {
      const waiter = pending.get(request.rpcId)
      if (waiter === undefined) {
        return { ok: false as const, message: 'no pending approval or question for this rpcId' }
      }
      const value = request.value
      const rec = typeof value === 'object' && value !== null ? value as { sessionId?: unknown; outcome?: unknown; answer?: unknown } : {}
      if (typeof rec.sessionId === 'string' && rec.sessionId !== '' && rec.sessionId !== waiter.sessionId) {
        return { ok: false as const, message: 'sessionId does not match the pending request' }
      }
      pending.delete(request.rpcId)
      ensureMux()
      emitMux({
        type: `${waiter.kind}/resolved`,
        sessionId: waiter.sessionId,
        rpcId: request.rpcId,
      })
      if ('outcome' in rec) waiter.resolve(rec.outcome)
      else if ('answer' in rec) {
        if (waiter.questionId === undefined) {
          waiter.resolve(rec.answer)
        } else {
          waiter.resolve({
            answers: [{
              id: waiter.questionId,
              selected: [],
              ...typeof rec.answer === 'string' && rec.answer !== '' ? { custom: rec.answer } : {},
            }],
          })
        }
      }
      else waiter.resolve(value)
      return { ok: true as const }
    },

    subscribeMux(signal) {
      ensureMux()
      return eventIterable(push => {
        muxListeners.add(push)
        return () => { muxListeners.delete(push) }
      }, signal)
    },

    subscribeHost(signal) {
      const status = eventIterable(push => listen(ctx, 'api-session/status', (sessionId: string, running: boolean) => {
        push({ type: 'host/session-status', sessionId, running })
      }, { global: true }), signal)
      const sessions = sessionControllerOf(ctx)
      const control = typeof sessions?.control === 'function'
        ? mapControlToHost(sessions.control(signal))
        : undefined
      return mergeIterables([status, control])
    },
  }
}

/**
 * Process-wide mutex for snapshot → selectModel → restore. Concurrent asks
 * each own a session, but `session.selectModel` also writes
 * `agent-default-model`; without this lock two overrides can snapshot each
 * other's temporary default and restore that as the deployment value
 * (BR-010 GUI-直建边界).
 */
let overrideGate: Promise<void> = Promise.resolve()

function withOverrideGate<T>(fn: () => Promise<T>): Promise<T> {
  const run = overrideGate.then(fn, fn)
  overrideGate = run.then(() => undefined, () => undefined)
  return run
}

/**
 * Pin a plugin-created session to the intended model, then restore the
 * deployment default. On 0.1.7 `selectModel` still writes that selection
 * through `agentDefaultModel.saveSelection`, so the previous snapshot is
 * written back. `override` set ⇒ BR-010 bot-owned model; omitted ⇒
 * live `agent-default-model` (UF-005 次路径). session-tool durableCreate
 * does not take a model and can miss a live settings.update, so follow-
 * global still selectModel's the snapshot. Serialized against other applies.
 */
export async function applyModelOverride(
  platform: DshBotPlatform,
  sessionId: string,
  override: DshBotModelRef | undefined,
): Promise<void> {
  await withOverrideGate(async () => {
    const snapshot = platform.snapshotGlobalDefault()
    const target = override ?? snapshot
    if (target === undefined) return
    if (snapshot === undefined) {
      throw new DshBotError(
        'override-restore-failed',
        'agentDefaultModel is missing; refuse override rather than rewrite the global default (BR-010)',
        { sessionId },
      )
    }
    try {
      await platform.selectModel(sessionId, target)
    } catch (error) {
      try {
        await platform.restoreGlobalDefault(snapshot)
      } catch {
        // Prefer the selectModel failure; restore is best-effort after a
        // loud override reject (selectModel may have written the default).
      }
      throw error
    }
    await platform.restoreGlobalDefault(snapshot)
  })
}
