/**
 * `ctx.dshBot` provider: delegated ask, visible create, and marked list.
 * Session I/O is exclusively `ctx.sessionTool` (BR-003). Bot-owned model
 * override is settings `dsh-bot.model`, applied via ASM-007
 * `session.selectModel` + restore of `agent-default-model` (BR-010).
 * @module dsh-bot-host
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import type { SessionToolCaller } from 'session-tool'
import {
  askBot,
  createBotSession,
  listBotSessions,
  resolveOverride,
} from './ask.ts'
import type {
  AskBotRequest,
  AskBotResult,
  CreateBotSessionRequest,
  CreateBotSessionResult,
  DshBotRuntimeConfig,
  DshBotSessionRow,
  ListBotSessionsRequest,
} from './ask.ts'
import { createPlatform } from './platform.ts'
import type { DshBotModelRef, DshBotPlatform } from './platform.ts'
import { attachDshBotHttp } from './routes.ts'
import type { DshBotModelInfo } from './routes.ts'

export { DshBotError } from './errors.ts'
export type { DshBotErrorCode } from './errors.ts'
export {
  askBot,
  createBotSession,
  extractAssistantAnswer,
  hiddenBotTitle,
  listBotSessions,
  resolveOverride,
  visibleBotTitle,
} from './ask.ts'
export type {
  AskBotRequest,
  AskBotResult,
  CreateBotSessionRequest,
  CreateBotSessionResult,
  DshBotRuntimeConfig,
  DshBotSessionRow,
  ListBotSessionsRequest,
} from './ask.ts'
export {
  DSH_BOT_HIDDEN_KIND,
  DSH_BOT_HIDDEN_TITLE_PREFIX,
  DSH_BOT_KIND,
  mergeBotMarks,
} from './marks.ts'
export type { DshBotModelRef, DshBotPlatform } from './platform.ts'
export { attachDshBotHttp, handleDshBotHttp } from './routes.ts'
export type { DshBotHttpFace, DshBotModelInfo, ListSessionsRpcValue } from './routes.ts'

/** Settings namespace for bot-owned defaults (hot, live). */
export const DSH_BOT_SETTINGS_NAMESPACE = settingsNamespace('dsh-bot')

/** Plugin / settings section for {@link DshBotService}. */
export interface DshBotConfig {
  /** Documented gateway URL (sessionTool owns the actual transport). */
  readonly webUrl: string
  /** `wait until idle` deadline for {@link DshBotService.askBot}. */
  readonly askTimeoutMs: number
  /** Bot-owned model; omit/empty ⇒ follow `agent-default-model`. */
  readonly model?: DshBotModelRef
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    dshBot: DshBotService
  }
}

/**
 * The DSH Bot host service (`ctx.dshBot`). Required inject is sessionTool;
 * settings / webServer / workspaceRegistry / apiProxy / agentDefaultModel
 * are optional and resolved per call.
 */
class DshBotService extends Service {
  static inject = ['sessionTool']

  static Config: z<DshBotConfig> = z.object({
    webUrl: z.string().default('http://127.0.0.1:3084'),
    askTimeoutMs: z.number().step(1).min(1).default(180_000),
    // Optional override (BR-010): empty/omitted provider+model ⇒ follow global.
    // Inner fields must not be .required() — bundle config omits `model` entirely
    // and cordis still materializes the object.
    model: z.object({
      provider: z.string().default(''),
      model: z.string().default(''),
      reasoningEffort: z.string(),
    }),
  })

  private source: () => DshBotRuntimeConfig
  private readonly platform: DshBotPlatform

  constructor(ctx: Context, config: DshBotConfig, platform?: DshBotPlatform) {
    super(ctx, 'dshBot')
    const entry: DshBotRuntimeConfig = Object.freeze({
      webUrl: config.webUrl,
      askTimeoutMs: config.askTimeoutMs,
      ...config.model === undefined ? {} : { model: config.model },
    })
    this.source = () => entry
    this.platform = platform ?? createPlatform(ctx)
    installSettingsSection(ctx, DSH_BOT_SETTINGS_NAMESPACE, DshBotService.Config, entry, {
      setSource: (current) => {
        this.source = current
      },
      onChange: () => {},
    })
    ctx.inject(['webServer'], (webCtx) => {
      attachDshBotHttp(webCtx, this)
    })
  }

  /** Current resolved config (settings overlay, read on every call). */
  currentConfig(): DshBotRuntimeConfig {
    return this.source()
  }

  /**
   * Hidden delegated Q&A. Each call mints its own session.
   */
  askBot(caller: SessionToolCaller, request: AskBotRequest): Promise<AskBotResult> {
    return askBot(this.ctx, this.ctx.sessionTool, this.platform, this.source(), caller, request)
  }

  /**
   * Visible bot session (sidebar create). Title has no `~` prefix.
   */
  createSession(caller: SessionToolCaller, request: CreateBotSessionRequest = {}): Promise<CreateBotSessionResult> {
    return createBotSession(this.ctx, this.ctx.sessionTool, this.platform, this.source(), caller, request)
  }

  /**
   * Marked bot sessions intersected with live session-tool metadata.
   */
  listSessions(request: ListBotSessionsRequest = {}): Promise<readonly DshBotSessionRow[]> {
    return listBotSessions(this.ctx.sessionTool, request)
  }

  /**
   * Current bot model + source for the sidebar footer (UF-006).
   */
  currentBotModel(): DshBotModelInfo {
    const override = resolveOverride(this.source())
    if (override !== undefined) {
      return { provider: override.provider, model: override.model, source: 'override' }
    }
    const global = this.platform.snapshotGlobalDefault()
    return {
      provider: global?.provider ?? '',
      model: global?.model ?? '',
      source: 'global-default',
    }
  }
}

export default DshBotService
export { DshBotService }
