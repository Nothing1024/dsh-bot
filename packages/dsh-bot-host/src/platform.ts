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

/**
 * Platform verbs the host needs beyond sessionTool. Tests stub this object;
 * production wiring is {@link createPlatform}.
 */
export interface DshBotPlatform {
  archiveSession(sessionId: string): Promise<void>
  selectModel(sessionId: string, model: DshBotModelRef): Promise<void>
  snapshotGlobalDefault(): DshBotModelRef | undefined
  restoreGlobalDefault(model: DshBotModelRef): Promise<void>
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
    selectModel(request: {
      rpcId: string
      payload: { sessionId: string; provider: string; model: string; reasoningEffort?: string }
    }): Promise<RpcEnvelope<{ selected: DshBotModelRef }>>
  }
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
