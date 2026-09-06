/**
 * Workbench session chain: gateway session.create {agentPreset,cwd} +
 * marks [kind:dsh-bot, bot:<id>] + v1 model override; history/prompt stay
 * on sessionTool (BR-203 / Task 8).
 * @module dsh-bot-host/workbench-sessions
 */

import { dirname } from 'node:path'
import { SessionId } from '@deepseek-ai/dsh-session'
import { isTitleHidden, listByKind } from 'session-marks'
import {
  SessionToolError,
  SessionWebUnreachableError,
} from 'session-tool'
import type {
  SessionToolCaller,
  SessionToolListResult,
  SessionToolMessageRow,
  SessionToolService,
} from 'session-tool'
import { resolveOverride, visibleBotTitle } from './ask.ts'
import type { DshBotRuntimeConfig } from './ask.ts'
import type { BotsRuntime } from './bots.ts'
import { DshBotError } from './errors.ts'
import {
  DSH_BOT_HIDDEN_KIND,
  DSH_BOT_MEMORY_HIDDEN_TITLE_PREFIX,
  botMark,
  mergeBotMarks,
  parseRoutineMark,
} from './marks.ts'
import type { RoomState } from './groups.ts'
import { applyModelOverride } from './platform.ts'
import { isRoutineInjection } from './routine-wake.ts'
import { parseProposeRoutine } from './routine-behavior.ts'
import type { DshBotPlatform } from './platform.ts'

function defaultCreateCwd(): string {
  const home = process.env.DSH_HOME?.trim()
  if (home !== undefined && home !== '') return dirname(home)
  return process.cwd()
}

const CLI_CALLER: SessionToolCaller = { kind: 'cli' }

const promptLocks = new Map<string, Promise<void>>()

export function withPromptLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
  const previous = promptLocks.get(sessionId) ?? Promise.resolve()
  const next = previous.then(fn, fn)
  promptLocks.set(sessionId, next.then(() => undefined, () => undefined))
  return next
}

/** Create-owned-session args (`POST /dsh-bot/createBotSession`). */
export interface CreateOwnedSessionRequest {
  readonly botId: string
  readonly title?: string
  readonly cwd?: string
}

/** Create-owned-session result. */
export interface CreateOwnedSessionResult {
  readonly sessionId: string
  readonly title: string
  readonly botId: string
  readonly presetId: string
}

/** One workbench session row (`POST /dsh-bot/listBotSessions`). */
export interface OwnedSessionRow {
  readonly sessionId: string
  readonly title?: string
  readonly tags: readonly string[]
  readonly status: 'live' | 'idle'
  readonly createdAt: number
  readonly updatedAt: number
  readonly hidden: boolean
  readonly working: boolean
  readonly routine?: string
}

export interface ListOwnedSessionsRequest {
  readonly botId: string
  readonly includeHidden?: boolean
}

export interface ListOwnedSessionsResult {
  readonly sessions: readonly OwnedSessionRow[]
}

export interface HistoryRequest {
  readonly sessionId: string
  readonly sinceSeq?: number
}

export interface WorkbenchHistoryAuthor {
  readonly botId: string
  readonly name: string
  readonly avatar: { readonly color: string; readonly emoji?: string }
}

export interface WorkbenchHistoryItem {
  readonly id: string
  readonly kind: 'message' | 'thinking' | 'tool' | 'propose-routine'
  readonly seq: number
  readonly role?: 'user' | 'assistant'
  readonly text?: string
  readonly name?: string
  readonly summary?: string
  readonly author?: WorkbenchHistoryAuthor
  readonly error?: { readonly code: string; readonly message: string }
  readonly schedule?: string
  readonly instruction?: string
  readonly origin?: 'routine'
}

export interface HistoryResult {
  readonly sessionId: string
  readonly items: readonly WorkbenchHistoryItem[]
  readonly working: boolean
  readonly speaking?: { readonly botId: string; readonly name: string }
}

export interface PromptRequest {
  readonly sessionId: string
  readonly text: string
}

export interface PromptResult {
  readonly sessionId: string
  readonly unmatchedMentions?: boolean
}

function isWebUnreachable(error: unknown): boolean {
  return error instanceof SessionWebUnreachableError
    || (error instanceof SessionToolError && error.code === 'web-unreachable')
}

async function listViaPlatform(
  platform: DshBotPlatform,
  marked: readonly { readonly id: string; readonly tags: readonly string[] }[],
): Promise<SessionToolListResult> {
  const gateway = await platform.listSessions()
  const byId = new Map(gateway.map(row => [row.sessionId, row]))
  const sessions = []
  for (const mark of marked) {
    const gate = byId.get(mark.id)
    if (gate === undefined) continue
    sessions.push({
      sessionId: SessionId(mark.id),
      ...gate.title === undefined || gate.title === '' ? {} : { title: gate.title },
      tags: [...mark.tags],
      status: gate.running ? 'live' as const : 'idle' as const,
      createdAt: gate.updatedAt > 0 ? gate.updatedAt : 0,
    })
  }
  return { sessions }
}

function rethrow(error: unknown, sessionId?: string): never {
  const extra = {
    ...sessionId === undefined ? {} : { sessionId },
    cause: error,
  }
  if (error instanceof DshBotError) {
    if (sessionId !== undefined && error.sessionId === undefined) {
      throw new DshBotError(error.code, error.message, extra)
    }
    throw error
  }
  if (error instanceof SessionWebUnreachableError || (error instanceof SessionToolError && error.code === 'web-unreachable')) {
    throw new DshBotError('web-unreachable', error.message, extra)
  }
  if (error instanceof SessionToolError) {
    throw new DshBotError('internal', error.message, extra)
  }
  throw new DshBotError(
    'internal',
    error instanceof Error ? error.message : String(error),
    extra,
  )
}

function asBlock(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  return value as Record<string, unknown>
}

function blockText(block: Record<string, unknown>): string {
  return typeof block.text === 'string' ? block.text : ''
}

/** Drop platform-injected user context (runtime snapshot / skill catalog). */
export function isPlatformInjection(text: string): boolean {
  const t = text.trim()
  if (t.startsWith('Current runtime context')) return true
  if (t.includes('<system-reminder>')) return true
  if (t.includes('<available_skills>')) return true
  if (isRoutineInjection(t)) return true
  return false
}

/**
 * Project sessionTool.read rows to the workbench transcript shape.
 * Thinking and tool-call become one-line entries; tool arguments are dropped
 * (no unsanitized debug fields).
 */
export function projectWorkbenchHistory(
  messages: readonly SessionToolMessageRow[],
): WorkbenchHistoryItem[] {
  const items: WorkbenchHistoryItem[] = []
  for (const row of messages) {
    const seq = row.seq
    let thinkN = 0
    let toolN = 0
    let messageN = 0
    const texts: string[] = []
    const thinkings: string[] = []
    const tools: Array<{ name: string; summary: string }> = []
    for (const raw of row.blocks) {
      const block = asBlock(raw)
      if (block === undefined) continue
      const type = typeof block.type === 'string' ? block.type : ''
      if (type === 'text') {
        const text = blockText(block)
        if (text !== '') texts.push(text)
        continue
      }
      if (type === 'reasoning') {
        const text = blockText(block)
        if (text !== '') thinkings.push(text)
        continue
      }
      if (type === 'tool-call') {
        const name = typeof block.name === 'string' && block.name.trim() !== '' ? block.name.trim() : 'tool'
        tools.push({ name, summary: name })
        continue
      }
      if (type === 'tool-result') {
        const failed = block.isError === true
        tools.push({
          name: 'tool',
          summary: failed ? '工具失败' : '工具完成',
        })
      }
    }
    for (const text of thinkings) {
      thinkN += 1
      items.push({
        id: `thinking-${seq}-${thinkN}`,
        kind: 'thinking',
        seq,
        text,
      })
    }
    for (const tool of tools) {
      toolN += 1
      items.push({
        id: `tool-${seq}-${toolN}`,
        kind: 'tool',
        seq,
        name: tool.name,
        summary: tool.summary,
      })
    }
    const text = texts.join('\n').trim()
    if (text !== '' && (row.role === 'user' || row.role === 'assistant')) {
      if (row.role === 'user' && isPlatformInjection(text)) continue
      const parsed = row.role === 'assistant' ? parseProposeRoutine(text) : { text, proposals: [] as const }
      if (parsed.text !== '') {
        messageN += 1
        items.push({
          id: `message-${seq}-${messageN}`,
          kind: 'message',
          seq,
          role: row.role,
          text: parsed.text,
          ...row.role === 'assistant' && isRoutineInjection(text) ? { origin: 'routine' as const } : {},
        })
      }
      parsed.proposals.forEach((proposal, index) => {
        items.push({
          id: `propose-${seq}-${index + 1}`,
          kind: 'propose-routine',
          seq,
          name: proposal.name,
          schedule: proposal.schedule,
          instruction: proposal.instruction,
        })
      })
    }
  }
  return items
}

/**
 * Project a group room jsonl onto workbench history items. 1:1 callers never
 * go through this path, so they keep omitting `author`.
 */
export function projectRoomHistory(
  room: RoomState,
  members: ReadonlyMap<string, WorkbenchHistoryAuthor>,
  sinceSeq?: number,
): WorkbenchHistoryItem[] {
  const items: WorkbenchHistoryItem[] = []
  for (const line of room.messages) {
    if (sinceSeq !== undefined && line.seq < sinceSeq) continue
    if (line.speaker.kind === 'user') {
      items.push({
        id: line.id,
        kind: 'message',
        seq: line.seq,
        role: 'user',
        text: line.text,
      })
      continue
    }
    const stored = members.get(line.speaker.botId)
    const author: WorkbenchHistoryAuthor = stored ?? {
      botId: line.speaker.botId,
      name: line.speaker.botId,
      avatar: { color: '#5b8def' },
    }
    if (line.speaker.kind === 'error') {
      items.push({
        id: line.id,
        kind: 'message',
        seq: line.seq,
        role: 'assistant',
        text: line.text,
        author,
        error: { code: line.speaker.code, message: line.text },
      })
      continue
    }
    items.push({
      id: line.id,
      kind: 'message',
      seq: line.seq,
      role: 'assistant',
      text: line.text,
      author,
    })
  }
  return items
}

/**
 * Working = unmatched `turn/start` (`data.turn`) vs `turn/end` (Task 1).
 */
export function turnIsOpen(events: readonly unknown[]): boolean {
  const open = new Set<number>()
  for (const event of events) {
    if (typeof event !== 'object' || event === null) continue
    const rec = event as { type?: unknown; data?: unknown }
    if (rec.type !== 'turn/start' && rec.type !== 'turn/end') continue
    const data = rec.data
    if (typeof data !== 'object' || data === null) continue
    const turn = (data as { turn?: unknown }).turn
    if (typeof turn !== 'number' || !Number.isFinite(turn)) continue
    if (rec.type === 'turn/start') open.add(turn)
    else open.delete(turn)
  }
  return open.size > 0
}

function sessionEvents(ctx: { get(name: string): unknown }, sessionId: string): readonly unknown[] | undefined {
  const store = ctx.get('sessions') as {
    get?: (id: string) => { events?: readonly unknown[] } | undefined
  } | undefined
  return store?.get?.(sessionId)?.events
}

async function resolveWorking(
  ctx: { get(name: string): unknown },
  platform: DshBotPlatform,
  sessionId: string,
): Promise<boolean> {
  const events = sessionEvents(ctx, sessionId)
  if (events !== undefined) return turnIsOpen(events)
  try {
    const rows = await platform.listSessions()
    return rows.find(row => row.sessionId === sessionId)?.running === true
  } catch {
    return false
  }
}

/**
 * Create a workbench-owned session bound to one bot preset + `bot:<id>` mark.
 */
export async function createOwnedSession(
  sessionTool: SessionToolService,
  platform: DshBotPlatform,
  bots: BotsRuntime,
  config: DshBotRuntimeConfig,
  request: CreateOwnedSessionRequest,
): Promise<CreateOwnedSessionResult> {
  const botId = request.botId.trim()
  if (botId === '') throw new DshBotError('invalid-input', 'botId is required')
  const bot = await bots.getBot(botId)
  const cwd = request.cwd !== undefined && request.cwd.trim() !== '' ? request.cwd.trim() : defaultCreateCwd()
  const title = request.title !== undefined && request.title.trim() !== ''
    ? visibleBotTitle(request.title)
    : visibleBotTitle(bot.name)
  let sessionId: string | undefined
  try {
    const created = await platform.createSession({
      agentPreset: bot.presetId,
      cwd,
    })
    sessionId = created.sessionId
    await mergeBotMarks(sessionId, [botMark(botId)])
    await applyModelOverride(platform, sessionId, bot.modelOverride ?? resolveOverride(config))
    try {
      await platform.renameSession(sessionId, title)
    } catch (error) {
      try {
        await sessionTool.rename(CLI_CALLER, SessionId(sessionId), { title })
      } catch {
        throw error
      }
    }
    return {
      sessionId,
      title,
      botId: bot.id,
      presetId: bot.presetId,
    }
  } catch (error) {
    rethrow(error, sessionId)
  }
}

/**
 * Marks `bot:<id>` ∩ sessionTool.list, newest first; `kind:hidden` omitted
 * unless includeHidden.
 */
export async function listOwnedSessions(
  sessionTool: SessionToolService,
  platform: DshBotPlatform,
  bots: BotsRuntime,
  request: ListOwnedSessionsRequest,
): Promise<ListOwnedSessionsResult> {
  const botId = request.botId.trim()
  if (botId === '') throw new DshBotError('invalid-input', 'botId is required')
  await bots.getBot(botId)
  const includeHidden = request.includeHidden === true
  const marked = await listByKind(botMark(botId))
  let listed
  try {
    listed = await sessionTool.list(CLI_CALLER, {
      scope: 'all',
      includeHidden: true,
    })
  } catch (error) {
    if (!isWebUnreachable(error)) rethrow(error)
    listed = await listViaPlatform(platform, marked)
  }
  const byId = new Map(listed.sessions.map(row => [String(row.sessionId), row]))
  let runningById = new Map<string, { running: boolean; updatedAt: number }>()
  try {
    const gateway = await platform.listSessions()
    runningById = new Map(gateway.map(row => [row.sessionId, { running: row.running, updatedAt: row.updatedAt }]))
  } catch {
    runningById = new Map()
  }
  const sessions: OwnedSessionRow[] = []
  for (const mark of marked) {
    const meta = byId.get(mark.id)
    if (meta === undefined) continue
    const tags = [...meta.tags]
    const hidden = tags.includes(DSH_BOT_HIDDEN_KIND)
      || isTitleHidden(meta.title, ['~'])
      || (meta.title ?? '').startsWith(DSH_BOT_MEMORY_HIDDEN_TITLE_PREFIX)
    if (!includeHidden && hidden) continue
    const gate = runningById.get(mark.id)
    const routineId = parseRoutineMark(tags) ?? parseRoutineMark(mark.tags)
    sessions.push({
      sessionId: String(meta.sessionId),
      ...meta.title === undefined ? {} : { title: meta.title },
      tags,
      status: meta.status,
      createdAt: meta.createdAt,
      updatedAt: gate !== undefined && gate.updatedAt > 0 ? gate.updatedAt : meta.createdAt,
      hidden,
      working: gate?.running === true,
      ...routineId === undefined ? {} : { routine: routineId },
    })
  }
  sessions.sort((a, b) => {
    if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt
    if (b.createdAt !== a.createdAt) return b.createdAt - a.createdAt
    return a.sessionId < b.sessionId ? 1 : a.sessionId > b.sessionId ? -1 : 0
  })
  return { sessions }
}

/**
 * sessionTool.read projected to workbench items; working uses Task 1 field.
 */
export async function readOwnedHistory(
  ctx: { get(name: string): unknown },
  sessionTool: SessionToolService,
  platform: DshBotPlatform,
  request: HistoryRequest,
): Promise<HistoryResult> {
  const sessionId = request.sessionId.trim()
  if (sessionId === '') throw new DshBotError('invalid-input', 'sessionId is required')
  try {
    const read = await sessionTool.read(CLI_CALLER, SessionId(sessionId), {
      ...request.sinceSeq === undefined ? {} : { sinceSeq: request.sinceSeq },
      maxBlocks: 500,
    })
    const items = projectWorkbenchHistory(read.messages)
    const working = await resolveWorking(ctx, platform, sessionId)
    return { sessionId, items, working }
  } catch (error) {
    rethrow(error, sessionId)
  }
}

/**
 * sessionTool.write of one user prompt (CLI caller, same as v1 HTTP face).
 */
export async function promptOwnedSession(
  sessionTool: SessionToolService,
  request: PromptRequest,
): Promise<PromptResult> {
  const sessionId = request.sessionId.trim()
  if (sessionId === '') throw new DshBotError('invalid-input', 'sessionId is required')
  const text = request.text.trim()
  if (text === '') throw new DshBotError('empty-prompt', 'prompt requires a non-empty text')
  return await withPromptLock(sessionId, async () => {
    try {
      await sessionTool.write(CLI_CALLER, SessionId(sessionId), text)
      return { sessionId }
    } catch (error) {
      rethrow(error, sessionId)
    }
  })
}
