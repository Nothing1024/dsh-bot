/**
 * Delegation chain for DSH Bot: create → marks merge → archive (hidden)
 * → ASM-007 override → write → wait(idle) → read. Never returns an empty
 * answer string (BR-007).
 * @module dsh-bot-host/ask
 */

import type { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import { isTitleHidden } from 'session-marks'
import { listByKind } from 'session-marks'
import {
  SessionToolError,
  SessionWebUnreachableError,
} from 'session-tool'
import type {
  SessionToolCaller,
  SessionToolMessageRow,
  SessionToolService,
  SessionToolWaitResult,
} from 'session-tool'
import { DshBotError } from './errors.ts'
import type { DshBotErrorCode } from './errors.ts'
import {
  DSH_BOT_HIDDEN_KIND,
  DSH_BOT_HIDDEN_TITLE_PREFIX,
  DSH_BOT_KIND,
  mergeBotMarks,
} from './marks.ts'
import { applyModelOverride } from './platform.ts'
import type { DshBotModelRef, DshBotPlatform } from './platform.ts'

/** Max graphemes kept after the `~dsh-bot: ` title prefix. */
const TITLE_SUMMARY_MAX = 48

/** Settings / entry config consumed on every call (hot). */
export interface DshBotRuntimeConfig {
  readonly webUrl: string
  readonly askTimeoutMs: number
  readonly model?: DshBotModelRef
}

/** Options for {@link askBot}. */
export interface AskBotRequest {
  readonly prompt: string
  readonly title?: string
}

/** Result of {@link askBot}. `answer` is always non-empty. */
export interface AskBotResult {
  readonly sessionId: SessionId
  readonly answer: string
}

/** Options for {@link createBotSession}. */
export interface CreateBotSessionRequest {
  readonly title?: string
  readonly cwd?: string
}

/** Result of {@link createBotSession}. */
export interface CreateBotSessionResult {
  readonly sessionId: SessionId
  readonly title: string
}

/** One row of {@link listBotSessions}. */
export interface DshBotSessionRow {
  readonly sessionId: string
  readonly title?: string
  readonly tags: readonly string[]
  readonly status: 'live' | 'idle'
  readonly createdAt: number
  readonly hidden: boolean
}

/** Options for {@link listBotSessions}. */
export interface ListBotSessionsRequest {
  readonly includeHidden?: boolean
  readonly caller?: SessionToolCaller
}

const CLI_CALLER: SessionToolCaller = { kind: 'cli' }

/**
 * Treat empty / whitespace-only `dsh-bot.model` as "follow global".
 */
export function resolveOverride(config: DshBotRuntimeConfig): DshBotModelRef | undefined {
  const model = config.model
  if (model === undefined) return undefined
  const provider = model.provider.trim()
  const id = model.model.trim()
  if (provider === '' || id === '') return undefined
  return {
    provider,
    model: id,
    ...model.reasoningEffort === undefined || model.reasoningEffort.trim() === ''
      ? {}
      : { reasoningEffort: model.reasoningEffort },
  }
}

/** Pin a hidden-session title with the required `~dsh-bot: ` prefix. */
export function hiddenBotTitle(summary: string): string {
  return `${DSH_BOT_HIDDEN_TITLE_PREFIX}${truncateSummary(summary)}`
}

/** Visible bot-session title: never a `~` prefix. */
export function visibleBotTitle(title: string | undefined): string {
  const raw = (title ?? 'DSH Bot').trim().replace(/^~+/, '').trim()
  return raw === '' ? 'DSH Bot' : raw
}

/**
 * Last assistant text-block sequence. `undefined` when the turn produced no
 * assistant text (tool-only / failure tail) — callers must fail loud.
 */
export function extractAssistantAnswer(messages: readonly SessionToolMessageRow[]): string | undefined {
  const last = [...messages].reverse().find(row => row.role === 'assistant')
  if (last === undefined) return undefined
  const text = last.blocks.map(block => {
    if (typeof block !== 'object' || block === null) return ''
    const record = block as { type?: unknown; text?: unknown }
    return record.type === 'text' && typeof record.text === 'string' ? record.text : ''
  }).join('\n').trim()
  return text === '' ? undefined : text
}

function truncateSummary(raw: string): string {
  const collapsed = raw.replace(/\s+/g, ' ').trim()
  if (collapsed.length <= TITLE_SUMMARY_MAX) return collapsed
  return `${collapsed.slice(0, TITLE_SUMMARY_MAX - 1)}…`
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

/** Wire error carried on the last `turn/end` of the in-process session log. */
interface TurnEndError {
  readonly code: string
  readonly message: string
}

/**
 * Last `turn/end.reason.error` on the live session, when this process holds
 * the store (gateway composition). sessionTool.read is message-rows only.
 */
export function readLastTurnEndError(ctx: Context, sessionId: string): TurnEndError | undefined {
  const store = ctx.get('sessions') as {
    get?: (id: string) => { events?: readonly unknown[] } | undefined
  } | undefined
  const events = store?.get?.(sessionId)?.events
  if (events === undefined) return undefined
  let found: TurnEndError | undefined
  for (const event of events) {
    if (typeof event !== 'object' || event === null) continue
    const rec = event as { type?: unknown; data?: unknown }
    if (rec.type !== 'turn/end') continue
    if (typeof rec.data !== 'object' || rec.data === null) continue
    const reason = (rec.data as { reason?: { error?: { code?: unknown; message?: unknown } } }).reason
    const err = reason?.error
    const code = typeof err?.code === 'string' ? err.code : undefined
    const message = typeof err?.message === 'string' ? err.message : undefined
    if (code === undefined && message === undefined) continue
    found = {
      code: code ?? 'session-failed',
      message: message ?? code ?? 'session failed',
    }
  }
  return found
}

function mapTurnErrorCode(wire: string | undefined, waitStatus: SessionToolWaitResult['status']): DshBotErrorCode {
  const upper = wire?.toUpperCase()
  if (upper === 'MISSING_CREDENTIAL') return 'missing-credential'
  if (waitStatus === 'failed' || waitStatus === 'aborted') return 'session-failed'
  return 'empty-answer'
}

function throwEmptyAnswer(
  ctx: Context,
  sessionId: SessionId,
  waited: SessionToolWaitResult,
): never {
  const turnError = readLastTurnEndError(ctx, sessionId)
  const code = mapTurnErrorCode(turnError?.code, waited.status)
  const reason = waited.lastTurnEndReason
  const parts = [
    turnError !== undefined
      ? `${turnError.code}: ${turnError.message}`
      : `dsh_bot_ask got no assistant text from ${sessionId} (status ${waited.status})`,
    reason === undefined ? undefined : `turn/end ${reason}`,
  ].filter((part): part is string => part !== undefined)
  throw new DshBotError(code, parts.join(' — '), { sessionId })
}

function resolveCallerCwd(ctx: Context, caller: SessionToolCaller, explicit?: string): string | undefined {
  if (explicit !== undefined && explicit !== '') return explicit
  if (caller.kind !== 'agent') return undefined
  const store = ctx.get('sessions') as {
    get?: (id: string) => { header?: { cwd?: string } } | undefined
  } | undefined
  const cwd = store?.get?.(caller.sessionId)?.header?.cwd
  return cwd !== undefined && cwd !== '' ? cwd : undefined
}

async function runOverride(
  platform: DshBotPlatform,
  sessionId: SessionId,
  config: DshBotRuntimeConfig,
): Promise<void> {
  await applyModelOverride(platform, sessionId, resolveOverride(config))
}

/**
 * Hidden delegated ask: one fresh session per call. Concurrent asks never
 * share a session (session-tool T17 boundary).
 */
export async function askBot(
  ctx: Context,
  sessionTool: SessionToolService,
  platform: DshBotPlatform,
  config: DshBotRuntimeConfig,
  caller: SessionToolCaller,
  request: AskBotRequest,
): Promise<AskBotResult> {
  const prompt = request.prompt.trim()
  if (prompt === '') {
    throw new DshBotError('empty-prompt', 'dsh_bot_ask requires a non-empty prompt')
  }
  const title = hiddenBotTitle(request.title ?? prompt)
  let sessionId: SessionId | undefined
  try {
    const cwd = resolveCallerCwd(ctx, caller)
    const created = await sessionTool.create(caller, {
      title,
      tags: [DSH_BOT_KIND, DSH_BOT_HIDDEN_KIND],
      ...caller.kind === 'agent' ? { parentSessionId: caller.sessionId } : {},
      ...cwd === undefined ? {} : { cwd },
    })
    sessionId = created.sessionId
    await mergeBotMarks(sessionId, [DSH_BOT_HIDDEN_KIND])
    await platform.archiveSession(sessionId)
    await runOverride(platform, sessionId, config)
    await sessionTool.write(caller, sessionId, prompt)
    const waited = await sessionTool.wait(caller, sessionId, {
      until: 'idle',
      timeoutMs: config.askTimeoutMs,
    })
    if (waited.status === 'timeout') {
      throw new DshBotError(
        'wait-timeout',
        `dsh_bot_ask timed out waiting for ${sessionId} (session kept)`,
        { sessionId },
      )
    }
    if (waited.status === 'failed' || waited.status === 'aborted') {
      throwEmptyAnswer(ctx, sessionId, waited)
    }
    const read = await sessionTool.read(caller, sessionId, { maxBlocks: 500 })
    const answer = extractAssistantAnswer(read.messages)
    if (answer === undefined) {
      throwEmptyAnswer(ctx, sessionId, waited)
    }
    return { sessionId, answer }
  } catch (error) {
    rethrow(error, sessionId)
  }
}

/**
 * Visible bot session for the sidebar "新建" path. No `~` prefix, tags only
 * `kind:dsh-bot`, inherit caller cwd, apply override. Not archived.
 */
export async function createBotSession(
  ctx: Context,
  sessionTool: SessionToolService,
  platform: DshBotPlatform,
  config: DshBotRuntimeConfig,
  caller: SessionToolCaller,
  request: CreateBotSessionRequest = {},
): Promise<CreateBotSessionResult> {
  const title = visibleBotTitle(request.title)
  let sessionId: SessionId | undefined
  try {
    const cwd = resolveCallerCwd(ctx, caller, request.cwd)
    const created = await sessionTool.create(caller, {
      title,
      tags: [DSH_BOT_KIND],
      ...cwd === undefined ? {} : { cwd },
    })
    sessionId = created.sessionId
    await mergeBotMarks(sessionId)
    await runOverride(platform, sessionId, config)
    return { sessionId, title }
  } catch (error) {
    rethrow(error, sessionId)
  }
}

/**
 * Intersection of marks `listByKind(kind:dsh-bot)` and sessionTool.list
 * metadata. Marks whose session is gone are dropped. Hidden rows are
 * omitted unless `includeHidden`.
 */
export async function listBotSessions(
  sessionTool: SessionToolService,
  request: ListBotSessionsRequest = {},
): Promise<readonly DshBotSessionRow[]> {
  const includeHidden = request.includeHidden === true
  const caller = request.caller ?? CLI_CALLER
  const marked = await listByKind(DSH_BOT_KIND)
  let listed
  try {
    listed = await sessionTool.list(caller, {
      scope: 'all',
      includeHidden: true,
    })
  } catch (error) {
    rethrow(error)
  }
  const byId = new Map(listed.sessions.map(row => [String(row.sessionId), row]))
  const rows: DshBotSessionRow[] = []
  for (const mark of marked) {
    const meta = byId.get(mark.id)
    if (meta === undefined) continue
    const hidden = meta.tags.includes(DSH_BOT_HIDDEN_KIND) || isTitleHidden(meta.title, ['~'])
    if (!includeHidden && hidden) continue
    rows.push({
      sessionId: String(meta.sessionId),
      ...meta.title === undefined ? {} : { title: meta.title },
      tags: [...meta.tags],
      status: meta.status,
      createdAt: meta.createdAt,
      hidden,
    })
  }
  return rows
}
