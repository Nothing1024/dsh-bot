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
  createBotSession as createVisibleBotSession,
  listBotSessions as listMarkedBotSessions,
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
import {
  createBotsRuntime,
  createPresetGate,
} from './bots.ts'
import type {
  BotsRuntime,
  CreateBotInput,
  UpdateBotInput,
} from './bots.ts'
import { attachDshBotHttp } from './routes.ts'
import type { DshBotModelInfo } from './routes.ts'
import { attachWorkbenchHttp } from './workbench-routes.ts'
import {
  createOwnedSession,
  listOwnedSessions,
  promptOwnedSession,
  readOwnedHistory,
} from './workbench-sessions.ts'
import type {
  CreateOwnedSessionRequest,
  HistoryRequest,
  ListOwnedSessionsRequest,
  PromptRequest,
} from './workbench-sessions.ts'

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
  botMark,
  mergeBotMarks,
} from './marks.ts'
export type { DshBotModelRef, DshBotPlatform } from './platform.ts'
export { attachDshBotHttp, handleDshBotHttp } from './routes.ts'
export type { DshBotHttpFace, DshBotModelInfo, ListSessionsRpcValue } from './routes.ts'
export { attachWorkbenchHttp, handleWorkbenchStatic, dispatchWorkbenchApi } from './workbench-routes.ts'
export {
  createOwnedSession,
  listOwnedSessions,
  isPlatformInjection,
  projectWorkbenchHistory,
  promptOwnedSession,
  readOwnedHistory,
  turnIsOpen,
} from './workbench-sessions.ts'
export type {
  CreateOwnedSessionRequest,
  CreateOwnedSessionResult,
  HistoryRequest,
  HistoryResult,
  ListOwnedSessionsRequest,
  ListOwnedSessionsResult,
  OwnedSessionRow,
  PromptRequest,
  PromptResult,
  WorkbenchHistoryItem,
} from './workbench-sessions.ts'
export {
  AVATAR_COLORS,
  MANAGED_PRESET_PREFIX,
  SEED_BOT_ID,
  SEED_PRESET_ID,
  createBotsRuntime,
  createPresetGate,
  hashAvatarColor,
  readPersonaText,
  replacePersonaText,
  slugifyName,
  yamlPersonaScalar,
  yamlSingleQuote,
} from './bots.ts'
export type {
  BotAvatar,
  BotRegistryRow,
  BotView,
  BotsRuntime,
  CreateBotInput,
  DeleteBotResult,
  ListBotsResult,
  PresetGate,
  UpdateBotInput,
} from './bots.ts'

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
  private readonly botsRuntime: BotsRuntime

  constructor(ctx: Context, config: DshBotConfig, platform?: DshBotPlatform, botsRuntime?: BotsRuntime) {
    super(ctx, 'dshBot')
    const entry: DshBotRuntimeConfig = Object.freeze({
      webUrl: config.webUrl,
      askTimeoutMs: config.askTimeoutMs,
      ...config.model === undefined ? {} : { model: config.model },
    })
    this.source = () => entry
    this.platform = platform ?? createPlatform(ctx)
    this.botsRuntime = botsRuntime ?? createBotsRuntime({ gate: createPresetGate(ctx) })
    installSettingsSection(ctx, DSH_BOT_SETTINGS_NAMESPACE, DshBotService.Config, entry, {
      setSource: (current) => {
        this.source = current
      },
      onChange: () => {},
    })
    ctx.inject(['webServer'], (webCtx) => {
      attachDshBotHttp(webCtx, this)
      attachWorkbenchHttp(webCtx)
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
    return createVisibleBotSession(this.ctx, this.ctx.sessionTool, this.platform, this.source(), caller, request)
  }

  /**
   * Marked bot sessions intersected with live session-tool metadata.
   */
  listSessions(request: ListBotSessionsRequest = {}): Promise<readonly DshBotSessionRow[]> {
    return listMarkedBotSessions(this.ctx.sessionTool, request)
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

  listBots() {
    return this.botsRuntime.listBots()
  }

  createBot(input: CreateBotInput) {
    return this.botsRuntime.createBot(input)
  }

  updateBot(input: UpdateBotInput) {
    return this.botsRuntime.updateBot(input)
  }

  deleteBot(input: { id: string }) {
    return this.botsRuntime.deleteBot(input)
  }

  /**
   * Workbench: gateway session.create {agentPreset,cwd} + marks bot:<id>.
   */
  createBotSession(input: CreateOwnedSessionRequest) {
    return createOwnedSession(
      this.ctx.sessionTool,
      this.platform,
      this.botsRuntime,
      this.source(),
      input,
    )
  }

  /**
   * Workbench: marks `bot:<id>` ∩ session metadata, newest first.
   */
  listBotSessions(input: ListOwnedSessionsRequest) {
    return listOwnedSessions(this.ctx.sessionTool, this.platform, this.botsRuntime, input)
  }

  history(input: HistoryRequest) {
    return readOwnedHistory(this.ctx, this.ctx.sessionTool, this.platform, input)
  }

  prompt(input: PromptRequest) {
    return promptOwnedSession(this.ctx.sessionTool, input)
  }
}

export default DshBotService
export { DshBotService }
