/**
 * `ctx.dshBot` provider: delegated ask, visible create, and marked list.
 * Session I/O is exclusively `ctx.sessionTool` (BR-003). Bot-owned model
 * override is settings `dsh-bot.model`, applied via ASM-007
 * `session.selectModel` + restore of `agent-default-model` (BR-010).
 * @module dsh-bot-host
 */

import { dirname } from 'node:path'
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
import {
  createReconcileState,
  reconcileBotSessions,
} from './reconcile.ts'
import type { ReconcileResult } from './reconcile.ts'
import { attachWorkbenchHttp } from './workbench-routes.ts'
import {
  createOwnedSession,
  listOwnedSessions,
  projectRoomHistory,
  promptOwnedSession,
  readOwnedHistory,
} from './workbench-sessions.ts'
import type {
  CreateOwnedSessionRequest,
  HistoryRequest,
  HistoryResult,
  ListOwnedSessionsRequest,
  PromptRequest,
  PromptResult,
  WorkbenchHistoryAuthor,
} from './workbench-sessions.ts'
import { createGroupsRuntime } from './groups.ts'
import type {
  CreateGroupInput,
  GroupsRuntime,
  UpdateGroupInput,
} from './groups.ts'
import {
  createRoundTracker,
  runGroupRound,
} from './group-engine.ts'
import type { RoundTracker } from './group-engine.ts'

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
  DSH_BOT_GROUP_HIDDEN_TITLE_PREFIX,
  DSH_BOT_HIDDEN_KIND,
  DSH_BOT_HIDDEN_TITLE_PREFIX,
  DSH_BOT_KIND,
  botMark,
  groupMark,
  groupRoomMark,
  mergeBotMarks,
  parseBotMark,
  parseGroupMark,
  parseGroupRoomMark,
} from './marks.ts'
export type { DshBotModelRef, DshBotPlatform } from './platform.ts'
export { attachDshBotHttp, handleDshBotHttp } from './routes.ts'
export type { DshBotHttpFace, DshBotModelInfo, ListSessionsRpcValue } from './routes.ts'
export { attachWorkbenchHttp, handleWorkbenchStatic, dispatchWorkbenchApi } from './workbench-routes.ts'
export {
  createOwnedSession,
  listOwnedSessions,
  isPlatformInjection,
  projectRoomHistory,
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
  WorkbenchHistoryAuthor,
  WorkbenchHistoryItem,
} from './workbench-sessions.ts'
export {
  GROUP_MEMBER_MAX,
  GROUP_MEMBER_MIN,
  createGroupsRuntime,
} from './groups.ts'
export type {
  CreateGroupInput,
  DeleteGroupResult,
  GroupRegistryRow,
  GroupRoomRow,
  GroupView,
  GroupsRuntime,
  ListGroupRoomsResult,
  ListGroupsResult,
  RoomMessage,
  RoomSpeaker,
  RoomState,
  UpdateGroupInput,
} from './groups.ts'
export {
  buildMemberTurnPrompt,
  createRoundTracker,
  isSkipReply,
  parseMentions,
  runGroupRound,
} from './group-engine.ts'
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
export {
  createReconcileState,
  reconcileBotSessions,
} from './reconcile.ts'
export type {
  ReconcileAssigned,
  ReconcileReason,
  ReconcileResult,
  ReconcileState,
} from './reconcile.ts'

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
  private readonly groupsRuntime: GroupsRuntime
  private readonly roundTracker: RoundTracker
  private readonly reconcileState = createReconcileState()
  private reconcileGate: Promise<void> = Promise.resolve()

  constructor(
    ctx: Context,
    config: DshBotConfig,
    platform?: DshBotPlatform,
    botsRuntime?: BotsRuntime,
    groupsRuntime?: GroupsRuntime,
  ) {
    super(ctx, 'dshBot')
    const entry: DshBotRuntimeConfig = Object.freeze({
      webUrl: config.webUrl,
      askTimeoutMs: config.askTimeoutMs,
      ...config.model === undefined ? {} : { model: config.model },
    })
    this.source = () => entry
    this.platform = platform ?? createPlatform(ctx)
    this.botsRuntime = botsRuntime ?? createBotsRuntime({ gate: createPresetGate(ctx) })
    this.groupsRuntime = groupsRuntime ?? createGroupsRuntime({
      listBotIds: async () => {
        const listed = await this.botsRuntime.listBots()
        return listed.bots.map(row => row.id)
      },
    })
    this.roundTracker = createRoundTracker()
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

  history(input: HistoryRequest): Promise<HistoryResult> {
    return this.readHistory(input)
  }

  prompt(input: PromptRequest): Promise<PromptResult> {
    return this.promptSession(input)
  }

  listGroups() {
    return this.groupsRuntime.listGroups()
  }

  createGroup(input: CreateGroupInput) {
    return this.groupsRuntime.createGroup(input)
  }

  updateGroup(input: UpdateGroupInput) {
    return this.groupsRuntime.updateGroup(input)
  }

  deleteGroup(input: { id: string }) {
    return this.groupsRuntime.deleteGroup(input)
  }

  createGroupSession(input: { groupId: string }) {
    return this.groupsRuntime.createGroupSession(input)
  }

  listGroupSessions(input: { groupId: string }) {
    return this.groupsRuntime.listGroupSessions(input)
  }

  private async readHistory(input: HistoryRequest): Promise<HistoryResult> {
    const room = await this.groupsRuntime.peekRoom(input.sessionId)
    if (room === undefined) {
      return await readOwnedHistory(this.ctx, this.ctx.sessionTool, this.platform, input)
    }
    const group = await this.groupsRuntime.getGroup(room.header.groupId)
    const members = new Map<string, WorkbenchHistoryAuthor>()
    for (const id of group.memberIds) {
      const bot = await this.botsRuntime.getBot(id)
      members.set(id, {
        botId: bot.id,
        name: bot.name,
        avatar: bot.avatar,
      })
    }
    const items = projectRoomHistory(room, members, input.sinceSeq)
    const round = this.roundTracker.get(room.header.roomId)
    return {
      sessionId: room.header.roomId,
      items,
      working: round?.working === true,
      ...round?.speaking === undefined ? {} : { speaking: round.speaking },
    }
  }

  private async promptSession(input: PromptRequest): Promise<PromptResult> {
    const room = await this.groupsRuntime.peekRoom(input.sessionId)
    if (room === undefined) {
      return await promptOwnedSession(this.ctx.sessionTool, input)
    }
    const result = await runGroupRound({
      sessionTool: this.ctx.sessionTool,
      platform: this.platform,
      bots: this.botsRuntime,
      groups: this.groupsRuntime,
      config: this.source(),
      tracker: this.roundTracker,
      createCwd: () => {
        const home = process.env.DSH_HOME?.trim()
        if (home !== undefined && home !== '') return dirname(home)
        return process.cwd()
      },
    }, { roomId: input.sessionId, text: input.text })
    return {
      sessionId: result.roomId,
      ...result.unmatchedMentions ? { unmatchedMentions: true } : {},
    }
  }

  /**
   * Backfill GUI / v1 sessions onto registry bots (async; does not delete marks).
   */
  reconcile(): Promise<ReconcileResult> {
    const run = this.reconcileGate.then(() => (
      reconcileBotSessions(this.platform, this.botsRuntime, this.reconcileState)
    ))
    this.reconcileGate = run.then(() => undefined, () => undefined)
    return run
  }
}

export default DshBotService
export { DshBotService }
