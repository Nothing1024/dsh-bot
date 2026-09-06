/**
 * In-process ASM-007 / INV-002 gates. dsh-bot-host never fetches the web
 * gateway; session create/write/wait/read go through ctx.sessionTool only.
 * selectModel and archiveSession are official in-process ctx services
 * (apiProxy / workspaceRegistry / agentDefaultModel).
 * @module dsh-bot-host/platform
 */

import type { Context } from '@deepseek-ai/cordis'
import { DshBotError } from './errors.ts'

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
  archiveSession(sessionId: string): Promise<void>
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

/** Duck-typed `ctx.apiProxy` unary result. */
interface RpcResult<T> {
  readonly ok: boolean
  readonly value?: T
  readonly error?: { readonly code: string; readonly message: string }
}

interface RpcEnvelope<T> {
  readonly result: RpcResult<T>
}

interface ApiProxyDuck {
  readonly sessions?: {
    create(request: {
      rpcId: string
      payload: { cwd?: string; agentPreset?: string; sessionId?: string }
    }): Promise<RpcEnvelope<{ sessionId: string; agentPreset?: string }>>
    rename(request: {
      rpcId: string
      payload: { sessionId: string; title: string }
    }): Promise<RpcEnvelope<{ title: string; seq: number }>>
    list(request: {
      rpcId: string
      payload: { cursor?: string }
    }): Promise<RpcEnvelope<{
      items?: ReadonlyArray<{
        sessionId?: string
        running?: boolean
        updatedAt?: number
        agentPreset?: string
        title?: string
        projections?: { readonly values?: { readonly title?: unknown } }
      }>
    }>>
    selectModel(request: {
      rpcId: string
      payload: { sessionId: string; provider: string; model: string; reasoningEffort?: string }
    }): Promise<RpcEnvelope<{ selected: DshBotModelRef }>>
    prompt?(request: {
      rpcId: string
      payload: { sessionId: string; mode: 'queue' | 'steer'; content: ReadonlyArray<{ type: 'text'; text: string }> }
    }): Promise<RpcEnvelope<{ accepted: true }>>
    cancel?(request: {
      rpcId: string
      payload: { sessionId: string }
    }): Promise<RpcEnvelope<{ accepted: true }>>
    updateQueue?(request: {
      rpcId: string
      payload: { sessionId: string; itemId: string; action: unknown }
    }): Promise<RpcEnvelope<{ accepted: true }>>
  }
  readonly events?: {
    mux?(request: { rpcId: string; payload: Record<string, unknown> }, signal: AbortSignal): AsyncIterable<unknown>
    host?(request: { rpcId: string; payload: Record<string, unknown> }, signal: AbortSignal): AsyncIterable<unknown>
  }
  respond?(message: {
    type: 'client-response'
    rpcId: string
    result: { ok: true; value: unknown }
  }): Promise<unknown>
  readonly workspace?: {
    archiveSession(request: {
      rpcId: string
      payload: { sessionId: string }
    }): Promise<RpcEnvelope<{ archivedSessionIds: readonly string[] }>>
  }
}

interface WorkspaceRegistryDuck {
  archiveSession(sessionId: string): Promise<void>
}

interface AgentDefaultModelDuck {
  currentSelection(): DshBotModelRef
  saveSelection(next: DshBotModelRef): Promise<void>
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

/**
 * Bind ASM-007 / INV-002 verbs to the live composition. Missing peers fail
 * loud at call time — never a silent skip.
 */
export function createPlatform(ctx: Context): DshBotPlatform {
  return {
    async archiveSession(sessionId) {
      const registry = ctx.get('workspaceRegistry') as WorkspaceRegistryDuck | undefined
      if (registry !== undefined) {
        try {
          await registry.archiveSession(sessionId)
          return
        } catch (error) {
          throw new DshBotError(
            'archive-failed',
            `workspace.archiveSession failed for ${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
            { sessionId, cause: error },
          )
        }
      }
      const api = ctx.get('apiProxy') as ApiProxyDuck | undefined
      if (api?.workspace?.archiveSession === undefined) {
        throw new DshBotError(
          'archive-unavailable',
          'workspace.archiveSession is unavailable in this composition',
          { sessionId },
        )
      }
      const response = await api.workspace.archiveSession({
        rpcId: mintRpcId(),
        payload: { sessionId },
      })
      if (response.result.ok === false) {
        throw new DshBotError(
          'archive-failed',
          `workspace.archiveSession failed for ${sessionId}: ${response.result.error?.message ?? 'unknown error'}`,
          { sessionId },
        )
      }
    },

    async selectModel(sessionId, model) {
      const api = ctx.get('apiProxy') as ApiProxyDuck | undefined
      if (api?.sessions?.selectModel === undefined) {
        throw new DshBotError(
          'override-unavailable',
          'session.selectModel is unavailable in this composition (ASM-007)',
          { sessionId },
        )
      }
      const response = await api.sessions.selectModel({
        rpcId: mintRpcId(),
        payload: {
          sessionId,
          provider: model.provider,
          model: model.model,
          ...model.reasoningEffort === undefined ? {} : { reasoningEffort: model.reasoningEffort },
        },
      })
      if (response.result.ok === false) {
        const message = response.result.error?.message ?? 'model-unavailable'
        throw new DshBotError(
          'override-invalid',
          `illegal dsh-bot.model override ${model.provider}/${model.model}: ${message}`,
          { sessionId },
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
      const api = ctx.get('apiProxy') as ApiProxyDuck | undefined
      if (api?.sessions?.create === undefined) {
        throw new DshBotError(
          'internal',
          'session.create is unavailable in this composition',
        )
      }
      const response = await api.sessions.create({
        rpcId: mintRpcId(),
        payload: {
          cwd: request.cwd,
          agentPreset: request.agentPreset,
        },
      })
      if (response.result.ok === false) {
        const wire = response.result.error?.code ?? ''
        const message = response.result.error?.message ?? 'session.create failed'
        if (wire === 'agent-preset-not-found' || wire === 'agent-preset-invalid') {
          throw new DshBotError('preset-broken', message)
        }
        if (wire === 'web-unreachable') {
          throw new DshBotError('web-unreachable', message)
        }
        throw new DshBotError('internal', message)
      }
      const value = response.result.value
      const sessionId = typeof value?.sessionId === 'string' ? value.sessionId.trim() : ''
      if (sessionId === '') {
        throw new DshBotError('internal', 'session.create returned no sessionId')
      }
      const agentPreset = typeof value?.agentPreset === 'string' ? value.agentPreset : undefined
      return {
        sessionId,
        ...agentPreset === undefined || agentPreset === '' ? {} : { agentPreset },
      }
    },

    async renameSession(sessionId, title) {
      const api = ctx.get('apiProxy') as ApiProxyDuck | undefined
      if (api?.sessions?.rename === undefined) {
        throw new DshBotError(
          'internal',
          `session.rename is unavailable in this composition (session ${sessionId})`,
          { sessionId },
        )
      }
      const response = await api.sessions.rename({
        rpcId: mintRpcId(),
        payload: { sessionId, title },
      })
      if (response.result.ok === false) {
        throw new DshBotError(
          'internal',
          `session.rename failed for ${sessionId}: ${response.result.error?.message ?? 'unknown error'}`,
          { sessionId },
        )
      }
    },

    async listSessions() {
      const api = ctx.get('apiProxy') as ApiProxyDuck | undefined
      if (api?.sessions?.list === undefined) return []
      const response = await api.sessions.list({
        rpcId: mintRpcId(),
        payload: {},
      })
      if (response.result.ok === false) return []
      const items = response.result.value?.items ?? []
      const rows: GatewaySessionRow[] = []
      for (const item of items) {
        const sessionId = typeof item.sessionId === 'string' ? item.sessionId : ''
        if (sessionId === '') continue
        const agentPreset = typeof item.agentPreset === 'string' ? item.agentPreset : undefined
        const title = titleOfGatewayItem(item)
        rows.push({
          sessionId,
          running: item.running === true,
          updatedAt: typeof item.updatedAt === 'number' && Number.isFinite(item.updatedAt) ? item.updatedAt : 0,
          ...agentPreset === undefined || agentPreset === '' ? {} : { agentPreset },
          ...title === undefined ? {} : { title },
        })
      }
      return rows
    },

    async promptSession(request) {
      const api = ctx.get('apiProxy') as ApiProxyDuck | undefined
      if (api?.sessions?.prompt === undefined) {
        return { unavailable: true as const, message: 'sessions.prompt is unavailable' }
      }
      const response = await api.sessions.prompt({
        rpcId: mintRpcId(),
        payload: {
          sessionId: request.sessionId,
          mode: request.mode,
          content: [{ type: 'text', text: request.text }],
        },
      })
      if (response.result.ok === false) {
        throw new DshBotError(
          'internal',
          `sessions.prompt failed for ${request.sessionId}: ${response.result.error?.message ?? 'unknown error'}`,
          { sessionId: request.sessionId },
        )
      }
      return { accepted: true as const }
    },

    async cancelSession(sessionId) {
      const api = ctx.get('apiProxy') as ApiProxyDuck | undefined
      if (api?.sessions?.cancel === undefined) {
        return { unavailable: true as const, message: 'sessions.cancel is unavailable' }
      }
      const response = await api.sessions.cancel({
        rpcId: mintRpcId(),
        payload: { sessionId },
      })
      if (response.result.ok === false) {
        throw new DshBotError(
          'internal',
          `sessions.cancel failed for ${sessionId}: ${response.result.error?.message ?? 'unknown error'}`,
          { sessionId },
        )
      }
      return { accepted: true as const }
    },

    async updateQueue(request) {
      const api = ctx.get('apiProxy') as ApiProxyDuck | undefined
      if (api?.sessions?.updateQueue === undefined) {
        return { unavailable: true as const, message: 'sessions.updateQueue is unavailable' }
      }
      const response = await api.sessions.updateQueue({
        rpcId: mintRpcId(),
        payload: {
          sessionId: request.sessionId,
          itemId: request.itemId,
          action: request.action,
        },
      })
      if (response.result.ok === false) {
        throw new DshBotError(
          'internal',
          `sessions.updateQueue failed for ${request.sessionId}: ${response.result.error?.message ?? 'unknown error'}`,
          { sessionId: request.sessionId },
        )
      }
      return { accepted: true as const }
    },

    async respond(request) {
      const api = ctx.get('apiProxy') as ApiProxyDuck | undefined
      if (typeof api?.respond !== 'function') {
        return { ok: false as const, message: 'apiProxy.respond is unavailable' }
      }
      await api.respond({
        type: 'client-response',
        rpcId: request.rpcId,
        result: { ok: true, value: request.value },
      })
      return { ok: true as const }
    },

    subscribeMux(signal) {
      const api = ctx.get('apiProxy') as ApiProxyDuck | undefined
      if (typeof api?.events?.mux !== 'function') return undefined
      return api.events.mux({ rpcId: mintRpcId(), payload: {} }, signal)
    },

    subscribeHost(signal) {
      const api = ctx.get('apiProxy') as ApiProxyDuck | undefined
      if (typeof api?.events?.host !== 'function') return undefined
      return api.events.host({ rpcId: mintRpcId(), payload: {} }, signal)
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
 * deployment default that `session.selectModel` would otherwise rewrite
 * (Task 4 ASM-007). `override` set ⇒ BR-010 bot-owned model; omitted ⇒
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
