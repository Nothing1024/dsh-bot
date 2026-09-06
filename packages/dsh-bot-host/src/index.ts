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
import { get } from 'session-marks'
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
import {
  MANAGED_PRESET_PREFIX,
  createBotsRuntime,
  createPresetGate,
} from './bots.ts'
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
import { botMark, mergeBotMarks, parseBotMark, peerMark, routineMark } from './marks.ts'
import {
  acceptPeerSend,
  appendPeerLog,
  createPeerRateLimiter,
  finishPeerSend,
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
  runGroupRound,
} from './group-engine.ts'
import type { RoundTracker } from './group-engine.ts'

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
export {
  DSH_BOT_GROUP_HIDDEN_TITLE_PREFIX,
  DSH_BOT_HIDDEN_KIND,
  DSH_BOT_HIDDEN_TITLE_PREFIX,
  DSH_BOT_MEMORY_HIDDEN_TITLE_PREFIX,
  DSH_BOT_KIND,
  botMark,
  groupMark,
  groupRoomMark,
  mergeBotMarks,
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
  parseMentions,
  runGroupRound,
  toRoomSpeech,
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
  /** Memory extract + inject. Default enabled. */
  readonly memory?: { readonly enabled?: boolean }
  readonly routines?: { readonly enabled?: boolean }
}

export interface DshBotServiceExtras {
  readonly memory?: MemoryStore
  readonly extractAsk?: ExtractAsk
  readonly behaviorSection?: (bot: BotView) => string
  readonly routines?: RoutineStore
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
    memory: z.object({
      enabled: z.boolean().default(true),
    }),
    routines: z.object({
      enabled: z.boolean().default(true),
    }),
  })

  private source: () => DshBotRuntimeConfig
  private readonly platform: DshBotPlatform
  private readonly botsRuntime: BotsRuntime
  private readonly groupsRuntime: GroupsRuntime
  private readonly roundTracker: RoundTracker
  private readonly memoryStore: MemoryStore
  private readonly extractAsk: ExtractAsk
  private readonly behaviorSection?: (bot: BotView) => string
  private readonly routineStore: RoutineStore
  private readonly scheduler: RoutineScheduler
  private readonly unread = new Map<string, number>()
  private readonly peerLimiter = createPeerRateLimiter()
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
  private reconcileGate: Promise<void> = Promise.resolve()

  constructor(
    ctx: Context,
    config: DshBotConfig,
    platform?: DshBotPlatform,
    botsRuntime?: BotsRuntime,
    groupsRuntime?: GroupsRuntime,
    extras?: DshBotServiceExtras,
  ) {
    super(ctx, 'dshBot')
    const entry: DshBotRuntimeConfig = Object.freeze({
      webUrl: config.webUrl,
      askTimeoutMs: config.askTimeoutMs,
      ...config.model === undefined ? {} : { model: config.model },
      memoryEnabled: config.memory?.enabled !== false,
      routinesEnabled: config.routines?.enabled !== false,
    })
    this.source = () => entry
    this.platform = platform ?? createPlatform(ctx)
    this.botsRuntime = botsRuntime ?? createBotsRuntime({ gate: createPresetGate(ctx) })
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
    ctx.effect(() => () => {
      this.scheduler.disarmAll()
    })
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
      onChange: () => { void this.scheduler.rearmAll() },
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
    return listMarkedBotSessions(this.ctx.sessionTool, request, this.platform)
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
    return this.botsRuntime.createBot(input).then(async view => {
      await this.injectMemory(view.id)
      return this.botsRuntime.getBot(view.id)
    })
  }

  updateBot(input: UpdateBotInput) {
    return this.botsRuntime.updateBot(input).then(async view => {
      await this.injectMemory(view.id)
      return this.botsRuntime.getBot(view.id)
    })
  }

  deleteBot(input: { id: string }) {
    return this.botsRuntime.deleteBot(input).then(async result => {
      await this.memoryStore.remove(input.id)
      const rows = await this.routineStore.list(input.id)
      for (const row of rows) {
        this.scheduler.disarm(row.id)
        await this.routineStore.update({ id: row.id, enabled: false })
      }
      this.unread.delete(input.id)
      return result
    })
  }

  /**
   * Workbench: gateway session.create {agentPreset,cwd} + marks bot:<id>.
   */
  async createBotSession(input: CreateOwnedSessionRequest) {
    await this.injectMemory(input.botId)
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
      const result = await readOwnedHistory(this.ctx, this.ctx.sessionTool, this.platform, input)
      this.lastHistorySeq.set(input.sessionId, maxItemSeq(result.items))
      this.queueExtract(input.sessionId, result)
      return result
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
      const result = await promptOwnedSession(this.ctx.sessionTool, input, this.platform)
      await this.notePrompt(input.sessionId, input.text)
      return result
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

  memoryList(input: { botId: string }) {
    return this.botsRuntime.getBot(input.botId).then(async () => {
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
    return this.botsRuntime.getBot(input.botId).then(async () => {
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
    return this.botsRuntime.getBot(input.botId).then(async () => {
      await this.memoryStore.tombstone(input.botId, input.id)
      await this.injectMemory(input.botId)
      return { ok: true as const }
    })
  }

  memoryClear(input: { botId: string }) {
    return this.botsRuntime.getBot(input.botId).then(async () => {
      await this.memoryStore.clear(input.botId)
      await this.injectMemory(input.botId)
      return { ok: true as const }
    })
  }


  routineList(input: { botId?: string } = {}) {
    return this.routineStore.list(input.botId)
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
    await this.injectMemory(view.id)
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
          await this.injectMemory(current.botId)
          const created = await createOwnedSession(this.ctx.sessionTool, this.platform, this.botsRuntime, this.source(), {
            botId: current.botId,
            title: `例程 · ${current.name}`,
          })
          await mergeBotMarks(created.sessionId, [botMark(current.botId), routineMark(current.id)])
          return created.sessionId
        },
        writeWaitRead: async (sessionId, text) => {
          return await withPromptLock(sessionId, async () => {
            await this.ctx.sessionTool.write({ kind: 'cli' }, SessionId(sessionId), text)
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
          await this.ctx.sessionTool.write({ kind: 'cli' }, SessionId(sessionId), text)
        },
      },
    }, routine)
  }

  async injectMemory(botId: string): Promise<void> {
    const bot = await this.botsRuntime.getBot(botId)
    if (!bot.presetId.startsWith(MANAGED_PRESET_PREFIX)) return
    const listed = await this.memoryStore.list(bot.id)
    const memory = renderMemorySection(listed.profile, listed.log)
    const behavior = this.behaviorSection?.(bot)
    const full = composePersona(stripMemorySection(bot.persona), {
      ...memory === '' ? {} : { memory },
      ...behavior === undefined || behavior.trim() === '' ? {} : { behavior },
    })
    await this.botsRuntime.rewritePresetPersona(bot.id, full)
  }

  private memoryOn(): boolean {
    return this.source().memoryEnabled !== false
  }

  private async notePrompt(sessionId: string, text: string): Promise<void> {
    if (!this.memoryOn()) return
    try {
      const tags = await get(sessionId)
      const botId = parseBotMark(tags ?? [])
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

  cancel(input: { sessionId: string }) {
    if (this.platform.cancelSession === undefined) {
      throw new DshBotError('cancel-unavailable', 'sessions.cancel is unavailable')
    }
    return this.platform.cancelSession(input.sessionId)
  }

  updateQueue(input: { sessionId: string; itemId: string; action: unknown }) {
    if (this.platform.updateQueue === undefined) {
      throw new DshBotError('update-queue-unavailable', 'sessions.updateQueue is unavailable')
    }
    return this.platform.updateQueue(input)
  }

  approvalRespond(input: {
    rpcId: string
    sessionId: string
    approvalId: string
    outcome: 'allowed-once' | 'rejected'
  }) {
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

  questionRespond(input: { rpcId: string; sessionId: string; answer: unknown }) {
    if (this.platform.respond === undefined) {
      throw new DshBotError('respond-unavailable', 'apiProxy.respond is unavailable')
    }
    return this.platform.respond({
      rpcId: input.rpcId,
      value: { sessionId: input.sessionId, answer: input.answer },
    })
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
        const listed = await listOwnedSessions(this.ctx.sessionTool, this.platform, this.botsRuntime, { botId: toBot })
        const mark = peerMark(fromBot)
        const hit = listed.sessions.find(row => row.hidden !== true && row.tags.includes(mark))
        return hit?.sessionId
      },
      createPeerSession: async (toBot, fromBot, title) => {
        await this.injectMemory(toBot)
        const created = await createOwnedSession(
          this.ctx.sessionTool,
          this.platform,
          this.botsRuntime,
          this.source(),
          { botId: toBot, title },
        )
        await mergeBotMarks(created.sessionId, [botMark(toBot), peerMark(fromBot)])
        return created.sessionId
      },
      write: async (sessionId, text) => {
        await withPromptLock(sessionId, async () => {
          await this.ctx.sessionTool.write({ kind: 'cli' }, SessionId(sessionId), text)
        })
      },
      waitRead: async sessionId => {
        const waited = await this.ctx.sessionTool.wait({ kind: 'cli' }, SessionId(sessionId), {
          until: 'idle',
          timeoutMs: this.source().askTimeoutMs,
        })
        if (wakeWaitFailed(waited.status)) return undefined
        return await withPromptLock(sessionId, async () => {
          const read = await this.ctx.sessionTool.read({ kind: 'cli' }, SessionId(sessionId), { maxBlocks: 500 })
          return extractAssistantAnswer(read.messages)
        })
      },
      resolveFromSession: async (fromBot, hint) => {
        const listed = await listOwnedSessions(this.ctx.sessionTool, this.platform, this.botsRuntime, { botId: fromBot })
        if (hint !== undefined && hint !== '') {
          const exact = listed.sessions.find(row => row.sessionId === hint && row.hidden !== true)
          if (exact !== undefined) return exact.sessionId
        }
        const newest = listed.sessions.find(row => row.hidden !== true)
        if (newest !== undefined) return newest.sessionId
        await this.injectMemory(fromBot)
        const created = await createOwnedSession(
          this.ctx.sessionTool,
          this.platform,
          this.botsRuntime,
          this.source(),
          { botId: fromBot },
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
      const accepted = await acceptPeerSend(io, payload)
      if (accepted.ok) {
        void finishPeerSend(io, payload, accepted.sessionId).catch(error => {
          console.warn('[dsh-bot-peers] echo failed', error)
        })
      }
      return accepted
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

  async noteSessionRunning(sessionId: string, running: boolean) {
    const tags = await get(sessionId)
    const botId = parseBotMark(tags ?? [])
    if (botId === undefined) return undefined
    if (running) this.sessionWorking.set(sessionId, botId)
    else this.sessionWorking.delete(sessionId)
    return {
      botId,
      working: [...this.sessionWorking.values()].includes(botId),
      unread: this.unread.get(botId) ?? 0,
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


function maxItemSeq(items: readonly { readonly seq: number }[]): number {
  return items.reduce((max, item) => item.seq > max ? item.seq : max, 0)
}

