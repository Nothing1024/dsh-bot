/**
 * `ctx.dshBot` provider: delegated ask, visible create, and marked list.
 * Session I/O is exclusively `ctx.sessionTool` (BR-003). Persona is plugin
 * config: frozen per session, injected as plugin-source context when agents
 * exist, otherwise wrapped onto session-tool writes. Not a DSH agentPreset.
 * Bot-owned model override is settings `dsh-bot.model` via `session.selectModel`.
 * @module dsh-bot-host
 */

import { dirname } from 'node:path'
import { Context, Service } from '@deepseek-ai/cordis'
import type { Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { type SessionToolCaller } from 'session-tool'
import { get } from 'session-marks'
import { marksOf } from './marks-cache.ts'
import { marksAllowForward } from './bot-events.ts'
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
import { DshBotError } from './errors.ts'
import { readRosterSections, writeRosterSections, type RosterSection } from './roster-layout.ts'
import { createPlatform } from './platform.ts'
import type { DshBotModelRef, DshBotPlatform } from './platform.ts'
import { createBotsRuntime, SEED_BOT_ID } from './bots.ts'
import type {
  BotView,
  BotsRuntime,
  CreateBotInput,
  UpdateBotInput,
} from './bots.ts'
import { composePersona, createMemoryStore, renderMemorySection, shouldExtract, stripMemorySection } from './memory.ts'
import type { MemoryStore } from './memory.ts'
import { createExtractAsk, extractMemory } from './memory-extract.ts'
import type { ExtractAsk } from './memory-extract.ts'
import { hasBotInventoryMark, parseBotMark, peerMark, routineMark } from './marks.ts'
import { resolvePersonaPlaceholders, wrapPrompt } from './session-voice.ts'
import { createSessionVoiceStore } from './session-voice-store.ts'
import type { SessionVoiceStore } from './session-voice-store.ts'
import { installVoicePreStep } from './session-voice-inject.ts'
import type { VoicePreStep } from './session-voice-inject.ts'
import {
  appendPeerLog,
  createPeerRateLimiter,
  PeerInbox,
  PEER_RECEIVE_GUIDANCE,
  readPeerLog,
  type PeerSendIO,
} from './peers.ts'
import { createRoutineStore, parseSchedule } from './routines.ts'
import type { RoutineRow, RoutineStore } from './routines.ts'
import { createScheduler } from './routine-scheduler.ts'
import type { RoutineScheduler } from './routine-scheduler.ts'
import { wakeRoutine, wakeWaitFailed } from './routine-wake.ts'
import { renderBehaviorSection } from './routine-behavior.ts'
import { extractAssistantAnswer } from './ask.ts'
import { SessionId } from '@deepseek-ai/dsh-session'

import { attachDshBotHttp } from './routes.ts'
import type { DshBotModelInfo } from './routes.ts'
import {
  createReconcileState,
  reconcileBotSessions,
} from './reconcile.ts'
import type { ReconcileResult } from './reconcile.ts'
import { attachWorkbenchHttp } from './workbench-routes.ts'
import {
  archiveOwnedSessions,
  createOwnedSession,
  listOwnedSessions,
  projectRoomHistory,
  promptOwnedSession,
  withPromptLock,
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
} from './group-engine.ts'
import type { RoundTracker } from './group-engine.ts'
import { GroupInbox } from './group-inbox.ts'

export { composePersona, createMemoryStore, renderMemorySection, shouldExtract } from './memory.ts'
export type { MemoryLogEntry, MemoryProfileEntry, MemoryStore } from './memory.ts'
export { applyExtract, buildExtractPrompt, parseExtractJson } from './memory-extract.ts'
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
export { isVoiceInjection, unwrapPrompt, wrapPrompt, resolvePersonaPlaceholders } from './session-voice.ts'
export {
  DSH_BOT_GROUP_HIDDEN_TITLE_PREFIX,
  DSH_BOT_HIDDEN_KIND,
  DSH_BOT_HIDDEN_TITLE_PREFIX,
  DSH_BOT_MEMORY_HIDDEN_TITLE_PREFIX,
  DSH_BOT_KIND,
  botMark,
  groupMark,
  groupRoomMark,
  parseBotMark,
  parseGroupMark,
  parseGroupRoomMark,
  parsePeerMark,
  peerMark,
} from './marks.ts'
export {
  acceptPeerSend,
  appendPeerLog,
  buildPeerWake,
  createPeerRateLimiter,
  finishPeerSend,
  parseAgentLine,
  readPeerLog,
} from './peers.ts'
export { readRosterSections, writeRosterSections } from './roster-layout.ts'
export type { DshBotModelRef, DshBotPlatform } from './platform.ts'
export { attachDshBotHttp, handleDshBotHttp } from './routes.ts'
export type { DshBotHttpFace, DshBotModelInfo, ListSessionsRpcValue } from './routes.ts'
export { attachWorkbenchHttp, handleWorkbenchStatic, dispatchWorkbenchApi } from './workbench-routes.ts'
export {
  archiveOwnedSessions,
  createOwnedSession,
  listOwnedSessions,
  isPlatformInjection,
  projectRoomHistory,
  projectWorkbenchHistory,
  promptOwnedSession,
  withPromptLock,
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
  orderRoundSpeakers,
  parseMentions,
  retryMemberTurn,
  runGroupRound,
  toRoomSpeech,
} from './group-engine.ts'
export {
  AVATAR_COLORS,
  MANAGED_PRESET_PREFIX,
  SEED_BOT_ID,
  SEED_PRESET_ID,
  createBotsRuntime,
  hashAvatarColor,
  slugifyName,
} from './bots.ts'
export type {
  BotAvatar,
  BotRegistryRow,
  BotView,
  BotsRuntime,
  CreateBotInput,
  DeleteBotResult,
  ListBotsResult,
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

/** Cordis entry id. Legacy `settings.yaml` section `dsh-bot` imports onto this id. */
export const DSH_BOT_SETTINGS_NAMESPACE = 'dsh-bot'

/** Plugin / settings section for {@link DshBotService}. */
export interface DshBotConfig {
  /** Documented gateway URL (sessionTool owns the actual transport). */
  readonly webUrl: string
  /** `wait until idle` deadline for {@link DshBotService.askBot}. */
  readonly askTimeoutMs: number
  /** Bot-owned model; omit/empty ⇒ follow `agent-default-model`. */
  readonly model?: DshBotModelRef | Volatile<DshBotModelRef | undefined>
  /** Memory extract + inject. Default enabled. */
  readonly memory?: { readonly enabled?: boolean } | Volatile<{ readonly enabled?: boolean } | undefined>
  readonly routines?: { readonly enabled?: boolean } | Volatile<{ readonly enabled?: boolean } | undefined>
}

function currentOf<T>(value: T | Volatile<T | undefined> | undefined): T | undefined {
  if (value !== undefined && typeof value === 'object' && value !== null && 'get' in value && typeof value.get === 'function') {
    return value.get() as T | undefined
  }
  return value as T | undefined
}

function liveConfig(config: DshBotConfig): DshBotRuntimeConfig {
  const model = currentOf(config.model)
  const memory = currentOf(config.memory)
  const routines = currentOf(config.routines)
  return {
    webUrl: config.webUrl,
    askTimeoutMs: config.askTimeoutMs,
    ...model === undefined || model.model === '' ? {} : { model },
    memoryEnabled: memory?.enabled !== false,
    routinesEnabled: routines?.enabled !== false,
  }
}

export interface DshBotServiceExtras {
  readonly memory?: MemoryStore
  readonly extractAsk?: ExtractAsk
  readonly behaviorSection?: (bot: BotView) => string
  readonly routines?: RoutineStore
  readonly voices?: SessionVoiceStore
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    dshBot: DshBotService
  }
}

/**
 * The DSH Bot host service (`ctx.dshBot`). Required inject is sessionTool;
 * settings / webServer / workspaceRegistry / sessionController / agentDefaultModel
 * are optional and resolved per call.
 */
class DshBotService extends Service {
  static inject = ['sessionTool']

  static Config: z<DshBotConfig> = z.object({
    webUrl: z.string().default('http://127.0.0.1:3084'),
    askTimeoutMs: z.number().step(1).min(1).default(180_000),
    model: z.object({
      provider: z.string().default(''),
      model: z.string().default(''),
      reasoningEffort: z.string(),
    }).volatile(),
    memory: z.object({
      enabled: z.boolean().default(true),
    }).volatile(),
    routines: z.object({
      enabled: z.boolean().default(true),
    }).volatile(),
  })

  private source: () => DshBotRuntimeConfig
  private readonly platform: DshBotPlatform
  private readonly botsRuntime: BotsRuntime
  private readonly groupsRuntime: GroupsRuntime
  private readonly roundTracker: RoundTracker
  private readonly groupInbox: GroupInbox
  private readonly memoryStore: MemoryStore
  private readonly extractAsk: ExtractAsk
  private readonly behaviorSection?: (bot: BotView) => string
  private readonly voices: SessionVoiceStore
  private readonly voicePreStep: VoicePreStep
  private readonly routineStore: RoutineStore
  private readonly scheduler: RoutineScheduler
  private readonly unread = new Map<string, number>()
  private readonly peerLimiter = createPeerRateLimiter()
  private readonly peerInbox = new PeerInbox(() => { console.warn('[dsh-bot-peers] delivery failed') })
  private readonly sessionWorking = new Map<string, string>()
  private botIds: string[] = []
  private readonly routineErrors = new Map<string, number>()
  private readonly pendingExtract = new Map<string, {
    readonly botId: string
    readonly sinceSeq: number
    readonly userText: string
    retries: number
  }>()
  private readonly lastExtractedSeq = new Map<string, number>()
  private readonly lastHistorySeq = new Map<string, number>()
  private readonly extracting = new Set<string>()
  private readonly reconcileState = createReconcileState()
  private reconcileRun: Promise<ReconcileResult> | undefined

  constructor(
    ctx: Context,
    config: DshBotConfig,
    platform?: DshBotPlatform,
    botsRuntime?: BotsRuntime,
    groupsRuntime?: GroupsRuntime,
    extras?: DshBotServiceExtras,
  ) {
    super(ctx, 'dshBot')
    this.source = () => liveConfig(config)
    this.platform = platform ?? createPlatform(ctx)
    this.botsRuntime = botsRuntime ?? createBotsRuntime()
    this.memoryStore = extras?.memory ?? createMemoryStore(() => {
      const home = process.env.DSH_HOME?.trim()
      if (home === undefined || home === '') {
        throw new Error('DSH_HOME is not set')
      }
      return home
    })
    this.extractAsk = extras?.extractAsk ?? createExtractAsk({
      ctx,
      sessionTool: ctx.sessionTool,
      platform: this.platform,
      config: () => this.source(),
    })
    this.behaviorSection = extras?.behaviorSection ?? (bot => renderBehaviorSection(bot.declined ?? []))
    this.voices = extras?.voices ?? createSessionVoiceStore(() => this.home())
    this.routineStore = extras?.routines ?? createRoutineStore(() => {
      const home = process.env.DSH_HOME?.trim()
      if (home === undefined || home === '') throw new Error('DSH_HOME is not set')
      return home
    })
    this.scheduler = createScheduler({
      store: this.routineStore,
      enabled: () => this.source().routinesEnabled !== false,
      wake: routine => this.performWake(routine),
    })
    if (this.source().routinesEnabled !== false) void this.scheduler.rearmAll()
    this.voicePreStep = installVoicePreStep(ctx, sessionId => this.sessionVoice(sessionId))
    ctx.effect(() => () => {
      this.scheduler.disarmAll()
      this.voicePreStep.dispose()
    })
    this.groupsRuntime = groupsRuntime ?? createGroupsRuntime({
      listBotIds: async () => {
        const listed = await this.botsRuntime.listBots()
        return listed.bots.map(row => row.id)
      },
    })
    this.roundTracker = createRoundTracker()
    this.groupInbox = new GroupInbox(() => this.groupDependencies())
    const reload = ctx as unknown as { on(name: string, listener: () => void): () => void }
    reload.on('app-boot/config-reload', () => { void this.scheduler.rearmAll() })
    ctx.inject(['webServer'], (webCtx) => {
      attachDshBotHttp(webCtx, this)
      attachWorkbenchHttp(webCtx)
    })
  }

  currentConfig(): DshBotRuntimeConfig {
    return this.source()
  }

  async askBot(caller: SessionToolCaller, request: AskBotRequest): Promise<AskBotResult> {
    return askBot(this.ctx, this.ctx.sessionTool, this.platform, this.source(), caller, {
      ...request,
      voice: this.voicePreStep.active() ? '' : request.voice ?? await this.voiceFor(SEED_BOT_ID),
      onCreated: async sessionId => {
        await this.freezeVoice(String(sessionId), SEED_BOT_ID)
        await request.onCreated?.(sessionId)
      },
    })
  }

  createSession(caller: SessionToolCaller, request: CreateBotSessionRequest = {}): Promise<CreateBotSessionResult> {
    return createVisibleBotSession(this.ctx, this.ctx.sessionTool, this.platform, this.source(), caller, request)
  }

  listSessions(request: ListBotSessionsRequest = {}): Promise<readonly DshBotSessionRow[]> {
    return listMarkedBotSessions(this.ctx, this.ctx.sessionTool, this.platform, request)
  }

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
    return this.botsRuntime.listBots().then(listed => {
      this.botIds = listed.bots.map(bot => bot.id)
      return {
        bots: listed.bots.map(bot => ({
          ...bot,
          unread: this.unread.get(bot.id) ?? 0,
        })),
      }
    })
  }

  createBot(input: CreateBotInput) {
    return this.botsRuntime.createBot(input)
  }

  updateBot(input: UpdateBotInput) {
    return this.botsRuntime.updateBot(input)
  }

  async deleteBot(input: { id: string }) {
    const result = await this.botsRuntime.deleteBot(input)
    let groups: { updated: readonly string[]; deleted: readonly string[] } = { updated: [], deleted: [] }
    try {
      groups = await this.groupsRuntime.removeBotFromGroups(input.id)
    } catch {
      // registry already dropped the bot
    }
    try {
      await this.memoryStore.remove(input.id)
    } catch {
      // leftover memory cannot be opened from the roster
    }
    try {
      const rows = await this.routineStore.list(input.id)
      for (const row of rows) {
        this.scheduler.disarm(row.id)
        try {
          await this.routineStore.update({ id: row.id, enabled: false })
        } catch {
          // disable is best-effort once the owner is gone
        }
      }
    } catch {
      // leftover routines stay unreachable without a live bot
    }
    try {
      await archiveOwnedSessions(this.ctx.sessionTool, this.platform, input.id)
    } catch {
      // marked sessions are inert without a live bot
    }
    this.unread.delete(input.id)
    return { ...result, groups }
  }

  async createBotSession(input: CreateOwnedSessionRequest) {
    return createOwnedSession(
      this.ctx.sessionTool,
      this.platform,
      this.botsRuntime,
      this.source(),
      input,
      (sessionId, botId) => this.freezeVoice(sessionId, botId),
    )
  }

  listBotSessions(input: ListOwnedSessionsRequest) {
    return listOwnedSessions(this.ctx, this.ctx.sessionTool, this.platform, this.botsRuntime, input)
  }

  async renameSession(input: { sessionId: string; title: string }): Promise<{ sessionId: string; title: string }> {
    const sessionId = input.sessionId.trim()
    const title = input.title.trim()
    if (sessionId === '' || title === '' || title.length > 60) throw new DshBotError('invalid-input', '名称须为 1–60 个字符')
    const room = await this.groupsRuntime.peekRoom(sessionId)
    if (room) await this.groupsRuntime.renameGroupSession({ sessionId, title })
    else {
      const tags = await get(sessionId)
      if (!hasBotInventoryMark(tags ?? [])) {
        throw new DshBotError('not-found', '只能重命名 Bot 对话', { sessionId })
      }
      await this.ctx.sessionTool.rename({ kind: 'cli' }, SessionId(sessionId), { title })
    }
    return { sessionId, title }
  }

  async prepareOfficialJump(input: { sessionId: string }): Promise<{ sessionId: string }> {
    const sessionId = input.sessionId.trim()
    if (sessionId === '') throw new DshBotError('invalid-input', 'sessionId is required')
    const tags = await get(sessionId)
    if (!hasBotInventoryMark(tags ?? [])) {
      throw new DshBotError('not-found', '只能打开 Bot 对话', { sessionId })
    }
    await this.platform.unarchiveSession(sessionId)
    return { sessionId }
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

  async listGroupSessions(input: { groupId: string }) {
    const result = await this.groupsRuntime.listGroupSessions(input)
    return {
      rooms: result.rooms.map(room => ({
        ...room,
        working: this.roundTracker.get(room.roomId)?.working === true || this.groupInbox.working(room.roomId),
      })),
    }
  }

  retryMember(input: { roomId: string; botId: string; errorSeq: number }) {
    return this.groupInbox.retryMember(input)
  }

  async continueDiscussion(input: { sessionId: string }) {
    await this.requireRoom(input.sessionId)
    return this.groupInbox.continueDiscussion(input.sessionId)
  }

  async cancelQueued(input: { sessionId: string; queueId: string }) {
    await this.requireRoom(input.sessionId)
    return this.groupInbox.cancelQueued(input.sessionId, input.queueId)
  }

  /** BR-004: only the room jsonl and its index row; member hidden sessions stay. */
  deleteGroupSession(input: { sessionId: string }) {
    if (this.groupInbox.busy(input.sessionId)) throw new DshBotError('invalid-input', 'room is busy')
    return this.groupsRuntime.deleteGroupSession({ roomId: input.sessionId })
  }

  /** INV-001: group-only RPCs never act on a 1:1 session id. */
  private async requireRoom(sessionId: string): Promise<void> {
    if (await this.groupsRuntime.peekRoom(sessionId) === undefined) throw new DshBotError('not-found', '房间不存在')
  }

  private async readHistory(input: HistoryRequest): Promise<HistoryResult> {
    const room = await this.groupsRuntime.peekRoom(input.sessionId)
    if (room === undefined) {
      await this.requireBotSession(input.sessionId)
      const result = await readOwnedHistory(this.ctx, this.ctx.sessionTool, this.platform, input)
      this.lastHistorySeq.set(input.sessionId, maxItemSeq(result.items))
      this.queueExtract(input.sessionId, result)
      return result
    }
    const group = await this.groupsRuntime.getGroup(room.header.groupId)
    const members = new Map<string, WorkbenchHistoryAuthor>()
    for (const id of group.memberIds) {
      try {
        const bot = await this.botsRuntime.getBot(id)
        members.set(id, {
          botId: bot.id,
          name: bot.name,
          avatar: bot.avatar,
        })
      } catch (error) {
        if (error instanceof DshBotError && error.code === 'bot-not-found') continue
        throw error
      }
    }
    const items = projectRoomHistory(room, members, input.sinceSeq)
    const round = this.roundTracker.get(room.header.roomId)
    return {
      sessionId: room.header.roomId,
      items,
      working: round?.working === true || this.groupInbox.working(room.header.roomId),
      ...round?.speaking === undefined ? {} : { speaking: round.speaking },
      ...round?.round === undefined ? {} : { round: round.round },
      ...round?.rounds === undefined ? {} : { rounds: round.rounds },
      queued: this.groupInbox.queued(room.header.roomId),
    }
  }

  private async promptSession(input: PromptRequest): Promise<PromptResult> {
    const room = await this.groupsRuntime.peekRoom(input.sessionId)
    if (room === undefined) {
      await this.requireBotSession(input.sessionId)
      // Before wrapping: the voice envelope would make a blank prompt non-empty.
      if (input.text.trim() === '') throw new DshBotError('empty-prompt', 'prompt requires a non-empty text')
      const text = await this.wrapForSession(input.sessionId, input.text)
      const result = await promptOwnedSession(this.ctx.sessionTool, { ...input, text }, this.platform)
      await this.notePrompt(input.sessionId, input.text)
      return result
    }
    return this.groupInbox.submit(input)
  }

  private groupDependencies() {
    return {
      sessionTool: this.ctx.sessionTool,
      platform: this.platform,
      bots: this.botsRuntime,
      groups: this.groupsRuntime,
      config: this.source(),
      tracker: this.roundTracker,
      voiceInjected: () => this.voicePreStep.active(),
      createCwd: () => {
        const home = process.env.DSH_HOME?.trim()
        if (home !== undefined && home !== '') return dirname(home)
        return process.cwd()
      },
      voiceFor: (botId: string) => this.voiceFor(botId),
      sessionVoice: (sessionId: string) => this.sessionVoice(sessionId),
      freezeVoice: (sessionId: string, botId: string) => this.freezeVoice(sessionId, botId),
    }
  }

  memoryList(input: { botId: string }) {
    return this.requireBot(input.botId).then(async () => {
      const listed = await this.memoryStore.list(input.botId)
      return {
        profile: listed.profile.map(row => ({ id: row.id, text: row.text, ts: row.ts })),
        log: listed.log.map(row => ({
          id: row.id,
          kind: row.kind,
          text: row.text,
          ts: row.ts,
          source: row.source,
          ...row.sessionId === undefined ? {} : { sessionId: row.sessionId },
        })),
      }
    })
  }

  memoryRemember(input: { botId: string; text: string; sessionId?: string }) {
    return this.requireBot(input.botId).then(async () => {
      const row = await this.memoryStore.appendLog(input.botId, {
        kind: 'log',
        text: input.text.slice(0, 200),
        source: 'explicit',
        ...input.sessionId === undefined || input.sessionId.trim() === ''
          ? {}
          : { sessionId: input.sessionId.trim() },
      })
      return { id: row.id }
    })
  }

  memoryForget(input: { botId: string; id: string }) {
    return this.requireBot(input.botId).then(async () => {
      await this.memoryStore.tombstone(input.botId, input.id)
      return { ok: true as const }
    })
  }

  memoryClear(input: { botId: string }) {
    return this.requireBot(input.botId).then(async () => {
      await this.memoryStore.clear(input.botId)
      return { ok: true as const }
    })
  }

  async routineList(input: { botId?: string } = {}) {
    const rows = await this.routineStore.list(input.botId)
    return rows.map(row => {
      const nextRunAt = this.scheduler.nextRunAt(row.id)
      return { ...row, ...nextRunAt === undefined ? {} : { nextRunAt } }
    })
  }

  async routineCreate(input: { botId: string; name: string; schedule: string; instruction: string; notify?: boolean }) {
    parseSchedule(input.schedule)
    const row = await this.routineStore.create(input)
    await this.scheduler.arm(row.id)
    return row
  }

  async routineUpdate(input: { id: string; name?: string; schedule?: string; instruction?: string; enabled?: boolean; notify?: boolean }) {
    if (input.schedule !== undefined) parseSchedule(input.schedule)
    const row = await this.routineStore.update(input)
    if (row.enabled) await this.scheduler.arm(row.id)
    else this.scheduler.disarm(row.id)
    return row
  }

  async routineDelete(input: { id: string }) {
    this.scheduler.disarm(input.id)
    return this.routineStore.remove(input.id)
  }

  routineRunNow(input: { id: string }) {
    return this.scheduler.runNow(input.id)
  }

  async routineDecline(input: { botId: string; topic: string }) {
    const view = await this.botsRuntime.declineTopic(input.botId, input.topic)
    return { ok: true as const, declined: view.declined ?? [] }
  }

  async markRead(input: { botId: string }) {
    this.unread.set(input.botId, 0)
    return { ok: true as const, unread: 0 }
  }

  private async performWake(routine: RoutineRow) {
    return wakeRoutine({
      store: this.routineStore,
      unread: this.unread,
      errors: this.routineErrors,
      io: {
        ensureSession: async current => {
          if (current.sessionId !== undefined && current.sessionId !== '') return current.sessionId
          const created = await createOwnedSession(this.ctx.sessionTool, this.platform, this.botsRuntime, this.source(), {
            botId: current.botId,
            title: `例程 · ${current.name}`,
            extraTags: [routineMark(current.id)],
          }, (sessionId, botId) => this.freezeVoice(sessionId, botId))
          return created.sessionId
        },
        writeWaitRead: async (sessionId, text) => {
          return await withPromptLock(sessionId, async () => {
            await this.ctx.sessionTool.write({ kind: 'cli' }, SessionId(sessionId), await this.wrapForSession(sessionId, text))
            const waited = await this.ctx.sessionTool.wait({ kind: 'cli' }, SessionId(sessionId), {
              until: 'idle',
              timeoutMs: this.source().askTimeoutMs,
            })
            if (wakeWaitFailed(waited.status)) throw new Error(`routine wait ${waited.status}`)
            const read = await this.ctx.sessionTool.read({ kind: 'cli' }, SessionId(sessionId), { maxBlocks: 500 })
            return extractAssistantAnswer(read.messages)
          })
        },
        writeSystem: async (sessionId, text) => {
          await this.ctx.sessionTool.write({ kind: 'cli' }, SessionId(sessionId), await this.wrapForSession(sessionId, text))
        },
      },
    }, routine)
  }

  private async requireBot(botId: string): Promise<BotView> {
    return this.botsRuntime.getBot(botId)
  }

  private memoryOn(): boolean {
    return this.source().memoryEnabled !== false
  }

  private async voiceFor(botId: string, sessionId?: string): Promise<string> {
    const bot = await this.requireBot(botId)
    const listed = this.memoryOn() ? await this.memoryStore.list(bot.id) : { profile: [] as const, log: [] as const }
    const memory = renderMemorySection(listed.profile, listed.log)
    const behavior = [this.behaviorSection?.(bot), PEER_RECEIVE_GUIDANCE].filter(Boolean).join('\n\n')
    const vars = await this.sessionModelCwd(sessionId, bot)
    let frozen = sessionId === undefined ? undefined : await this.voices.read(sessionId)
    if (sessionId !== undefined && frozen === undefined) {
      await this.voices.snapshot(sessionId, resolvePersonaPlaceholders(stripMemorySection(bot.persona), vars))
      frozen = await this.voices.read(sessionId)
    }
    const base = frozen ?? resolvePersonaPlaceholders(stripMemorySection(bot.persona), vars)
    return composePersona(base, {
      ...memory === '' ? {} : { memory },
      ...behavior === undefined || behavior.trim() === '' ? {} : { behavior },
    })
  }

  private async freezeVoice(sessionId: string, botId: string): Promise<void> {
    const bot = await this.requireBot(botId)
    const vars = await this.sessionModelCwd(sessionId, bot)
    await this.voices.snapshot(sessionId, resolvePersonaPlaceholders(stripMemorySection(bot.persona), vars))
  }

  private async sessionVoice(sessionId: string): Promise<string | undefined> {
    try {
      const botId = parseBotMark(await marksOf(sessionId) ?? [])
      if (botId === undefined) return undefined
      return await this.voiceFor(botId, sessionId)
    } catch (error) {
      if (error instanceof DshBotError && error.code === 'bot-not-found') return undefined
      throw error
    }
  }

  private async sessionModelCwd(
    sessionId: string | undefined,
    bot: BotView,
  ): Promise<{ model?: string; cwd?: string }> {
    const override = bot.modelOverride ?? resolveOverride(this.source())
    const model = override !== undefined
      ? `${override.provider}/${override.model}`
      : (() => {
        const global = this.platform.snapshotGlobalDefault()
        const provider = global?.provider ?? ''
        const name = global?.model ?? ''
        return provider === '' && name === '' ? '' : `${provider}/${name}`
      })()
    let cwd = ''
    if (sessionId !== undefined && sessionId !== '') {
      const store = this.ctx.get('sessions') as {
        get?(id: string): { header?: { cwd?: string } } | undefined
      } | undefined
      cwd = store?.get?.(sessionId)?.header?.cwd?.trim() ?? ''
    }
    return {
      ...model === '' ? {} : { model },
      ...cwd === '' ? {} : { cwd },
    }
  }

  private async wrapForSession(sessionId: string, text: string): Promise<string> {
    if (this.voicePreStep.active()) return text
    try {
      const botId = parseBotMark(await marksOf(sessionId) ?? [])
      if (botId === undefined) return text
      return wrapPrompt(await this.voiceFor(botId, sessionId), text)
    } catch (error) {
      if (error instanceof DshBotError && error.code === 'bot-not-found') return text
      throw error
    }
  }

  private async notePrompt(sessionId: string, text: string): Promise<void> {
    if (!this.memoryOn()) return
    try {
      const botId = parseBotMark(await marksOf(sessionId) ?? [])
      if (botId === undefined) return
      this.pendingExtract.set(sessionId, {
        botId,
        sinceSeq: this.lastHistorySeq.get(sessionId) ?? 0,
        userText: text,
        retries: 0,
      })
    } catch {
      // marks missing: skip; next prompt can register
    }
  }

  private queueExtract(sessionId: string, result: HistoryResult): void {
    if (!this.memoryOn() || result.working) return
    if (this.extracting.has(sessionId)) return
    this.extracting.add(sessionId)
    void this.maybeExtract(sessionId, result).finally(() => {
      this.extracting.delete(sessionId)
    })
  }

  private async maybeExtract(sessionId: string, result: HistoryResult): Promise<void> {
    const pending = this.pendingExtract.get(sessionId)
    if (pending === undefined) return
    const assistant = result.items.some(item => (
      item.kind === 'message'
      && item.role === 'assistant'
      && item.seq > pending.sinceSeq
    ))
    if (!assistant) return
    const lastSeq = maxItemSeq(result.items)
    if (this.lastExtractedSeq.get(sessionId) === lastSeq) {
      this.pendingExtract.delete(sessionId)
      return
    }
    if (!shouldExtract(pending.userText)) {
      this.pendingExtract.delete(sessionId)
      return
    }
    const turnText = result.items
      .filter(item => item.kind === 'message' && item.seq > pending.sinceSeq && item.text)
      .map(item => `${item.role ?? 'user'}: ${item.text}`)
      .join('\n')
    this.lastExtractedSeq.set(sessionId, lastSeq)
    try {
      const extracted = await extractMemory(
        { memory: this.memoryStore, ask: this.extractAsk },
        { botId: pending.botId, sessionId, turnText },
      )
      if (extracted === null && pending.retries < 1) {
        pending.retries += 1
        this.lastExtractedSeq.delete(sessionId)
        console.warn('[dsh-bot-memory] extract returned empty; will retry once')
        return
      }
      this.pendingExtract.delete(sessionId)
    } catch (error) {
      console.warn('[dsh-bot-memory] extract failed', error)
      if (pending.retries < 1) {
        pending.retries += 1
        this.lastExtractedSeq.delete(sessionId)
        return
      }
      this.pendingExtract.delete(sessionId)
    }
  }

  async cancel(input: { sessionId: string }) {
    if (await this.groupsRuntime.peekRoom(input.sessionId) !== undefined) {
      return this.groupInbox.cancel(input.sessionId)
    }
    await this.requireBotSession(input.sessionId)
    if (this.platform.cancelSession === undefined) {
      throw new DshBotError('cancel-unavailable', 'sessions.cancel is unavailable')
    }
    return this.platform.cancelSession(input.sessionId)
  }

  async updateQueue(input: { sessionId: string; itemId: string; action: unknown }) {
    await this.requireBotSession(input.sessionId)
    if (this.platform.updateQueue === undefined) {
      throw new DshBotError('update-queue-unavailable', 'sessions.updateQueue is unavailable')
    }
    return this.platform.updateQueue(input)
  }

  async approvalRespond(input: {
    rpcId: string
    sessionId: string
    approvalId: string
    outcome: 'allowed-once' | 'rejected'
  }) {
    await this.requireBotSession(input.sessionId)
    if (this.platform.respond === undefined) {
      throw new DshBotError('respond-unavailable', 'apiProxy.respond is unavailable')
    }
    return this.platform.respond({
      rpcId: input.rpcId,
      value: {
        sessionId: input.sessionId,
        approvalId: input.approvalId,
        outcome: input.outcome,
      },
    })
  }

  async questionRespond(input: { rpcId: string; sessionId: string; answer: unknown }) {
    await this.requireBotSession(input.sessionId)
    if (this.platform.respond === undefined) {
      throw new DshBotError('respond-unavailable', 'apiProxy.respond is unavailable')
    }
    return this.platform.respond({
      rpcId: input.rpcId,
      value: { sessionId: input.sessionId, answer: input.answer },
    })
  }

  /**
   * The workbench HTTP face may only read or drive sessions this plugin owns
   * (1:1 bot chats, delegations, group member turns), never an arbitrary
   * Harness coding session reachable by id.
   */
  private async requireBotSession(sessionId: string): Promise<void> {
    const tags = await marksOf(sessionId)
    if (!hasBotInventoryMark(tags) && !marksAllowForward(tags)) {
      throw new DshBotError('not-found', '只能访问 Bot 对话', { sessionId })
    }
  }

  listBotStatus() {
    const ids = new Set<string>([...this.botIds, ...this.unread.keys(), ...this.sessionWorking.values()])
    return [...ids].map(botId => ({
      botId,
      working: [...this.sessionWorking.values()].includes(botId),
      unread: this.unread.get(botId) ?? 0,
    }))
  }

  subscribeMux(signal: AbortSignal) {
    return this.platform.subscribeMux?.(signal)
  }

  subscribeHost(signal: AbortSignal) {
    return this.platform.subscribeHost?.(signal)
  }

  private home(): string {
    const home = process.env.DSH_HOME?.trim()
    if (home === undefined || home === '') throw new Error('DSH_HOME is not set')
    return home
  }

  private peerIO(): PeerSendIO {
    return {
      limiter: this.peerLimiter,
      now: () => Date.now(),
      getBot: id => this.botsRuntime.getBot(id),
      findPeerSession: async (toBot, fromBot) => {
        const listed = await listOwnedSessions(this.ctx, this.ctx.sessionTool, this.platform, this.botsRuntime, { botId: toBot })
        const mark = peerMark(fromBot)
        const hit = listed.sessions.find(row => row.hidden !== true && row.tags.includes(mark))
        return hit?.sessionId
      },
      createPeerSession: async (toBot, fromBot, title) => {
        const created = await createOwnedSession(
          this.ctx.sessionTool,
          this.platform,
          this.botsRuntime,
          this.source(),
          { botId: toBot, title, extraTags: [peerMark(fromBot)] },
          (sessionId, botId) => this.freezeVoice(sessionId, botId),
        )
        return created.sessionId
      },
      write: async (sessionId, text) => {
        await withPromptLock(sessionId, async () => {
          await this.ctx.sessionTool.write({ kind: 'cli' }, SessionId(sessionId), await this.wrapForSession(sessionId, text))
        })
      },
      readCursor: async sessionId => {
        const read = await this.ctx.sessionTool.read({ kind: 'cli' }, SessionId(sessionId), { maxBlocks: 500 })
        return read.messages.reduce((max, row) => Math.max(max, row.seq), -1)
      },
      exchange: async (sessionId, text) => withPromptLock(sessionId, async () => {
        const before = await this.ctx.sessionTool.read({ kind: 'cli' }, SessionId(sessionId), { maxBlocks: 500 })
        const cursor = before.messages.reduce((max, row) => Math.max(max, row.seq), -1)
        await this.ctx.sessionTool.write({ kind: 'cli' }, SessionId(sessionId), await this.wrapForSession(sessionId, text))
        const waited = await this.ctx.sessionTool.wait({ kind: 'cli' }, SessionId(sessionId), {
          until: 'idle', timeoutMs: this.source().askTimeoutMs,
        })
        if (wakeWaitFailed(waited.status)) return undefined
        const read = await this.ctx.sessionTool.read({ kind: 'cli' }, SessionId(sessionId), { maxBlocks: 500 })
        return extractAssistantAnswer(read.messages.filter(row => row.seq > cursor))
      }),
      waitRead: async (sessionId, afterSeq) => {
        const waited = await this.ctx.sessionTool.wait({ kind: 'cli' }, SessionId(sessionId), {
          until: 'idle',
          timeoutMs: this.source().askTimeoutMs,
        })
        if (wakeWaitFailed(waited.status)) return undefined
        return await withPromptLock(sessionId, async () => {
          const read = await this.ctx.sessionTool.read({ kind: 'cli' }, SessionId(sessionId), { maxBlocks: 500 })
          return extractAssistantAnswer(afterSeq === undefined ? read.messages : read.messages.filter(row => row.seq > afterSeq))
        })
      },
      resolveFromSession: async (fromBot, hint) => {
        const listed = await listOwnedSessions(this.ctx, this.ctx.sessionTool, this.platform, this.botsRuntime, { botId: fromBot })
        if (hint !== undefined && hint !== '') {
          const tags = await get(hint)
          if (parseBotMark(tags ?? []) !== fromBot) throw new DshBotError('invalid-input', 'reply target does not belong to the sender')
          return hint
        }
        const newest = listed.sessions.find(row => row.hidden !== true)
        if (newest !== undefined) return newest.sessionId
        const created = await createOwnedSession(
          this.ctx.sessionTool,
          this.platform,
          this.botsRuntime,
          this.source(),
          { botId: fromBot },
          (sessionId, botId) => this.freezeVoice(sessionId, botId),
        )
        return created.sessionId
      },
      incrementUnread: botId => {
        this.unread.set(botId, (this.unread.get(botId) ?? 0) + 1)
      },
      appendLog: row => appendPeerLog(this.home(), row),
    }
  }

  async sendToPeer(input: { toBot: string; text: string; fromSessionId?: string; fromBot?: string }) {
    let fromBot = input.fromBot?.trim() ?? ''
    if (fromBot === '' && input.fromSessionId !== undefined && input.fromSessionId !== '') {
      const tags = await get(input.fromSessionId)
      fromBot = parseBotMark(tags ?? []) ?? ''
    }
    if (fromBot === '') return { ok: false as const, error: 'invalid-input' }
    const payload = {
      fromBot,
      toBot: input.toBot,
      text: input.text,
      ...input.fromSessionId === undefined || input.fromSessionId === '' ? {} : { fromSessionId: input.fromSessionId },
    }
    const io = this.peerIO()
    try {
      return await this.peerInbox.send(io, payload)
    } catch (error) {
      if (error instanceof DshBotError && error.code === 'bot-not-found') {
        return { ok: false as const, error: 'bot-not-found' }
      }
      throw error
    }
  }

  peerLog(input: { botId?: string } = {}) {
    return readPeerLog(this.home(), input.botId)
  }

  async updateBotLayout(input: {
    bots?: readonly { id: string; pinned?: boolean; section?: string; hidden?: boolean; order?: number; muted?: boolean }[]
    groups?: readonly { id: string; section?: string; order?: number }[]
    sections?: readonly RosterSection[]
  } = {}) {
    const skipped: string[] = []
    if (input.bots !== undefined && input.bots.length > 0) {
      const result = await this.botsRuntime.updateLayout(input.bots)
      skipped.push(...result.skipped)
    }
    if (input.groups !== undefined && input.groups.length > 0) {
      const result = await this.groupsRuntime.updateLayout(input.groups)
      skipped.push(...result.skipped)
    }
    if (input.sections !== undefined) {
      await writeRosterSections(this.home(), input.sections)
    }
    const sections = await readRosterSections(this.home())
    return { ok: true as const, skipped, sections }
  }

  noteSessionRunning(sessionId: string, running: boolean, tags: readonly string[]) {
    const botId = parseBotMark(tags)
    if (botId === undefined) return undefined
    if (running) this.sessionWorking.set(sessionId, botId)
    else this.sessionWorking.delete(sessionId)
    return {
      botId,
      working: [...this.sessionWorking.values()].includes(botId),
      unread: this.unread.get(botId) ?? 0,
    }
  }

  reconcile(): Promise<ReconcileResult> {
    if (this.reconcileRun !== undefined) return this.reconcileRun
    const run = reconcileBotSessions(this.platform, this.botsRuntime, this.reconcileState, this.ctx.sessionTool)
      .finally(() => { this.reconcileRun = undefined })
    this.reconcileRun = run
    return run
  }
}

export default DshBotService
export { DshBotService }

function maxItemSeq(items: readonly { readonly seq: number }[]): number {
  return items.reduce((max, item) => item.seq > max ? item.seq : max, 0)
}
