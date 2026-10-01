/**
 * Group discussion engine: mention parse + serial member turns, then up to
 * two more rotated rounds so peers can answer each other (reference
 * GroupChatOrchestrator). Visible 1:1 sessions are never written.
 * @module dsh-bot-host/group-engine
 */

import { resolveResponders } from 'dsh-bot-shared'
export { parseMentions } from 'dsh-bot-shared'
export type { MentionMember, MentionParse } from 'dsh-bot-shared'

import { SessionId } from '@deepseek-ai/dsh-session'
import { hasHiddenMark } from 'session-marks'
import { rowsWithMark } from './marks-cache.ts'
import type { SessionToolCaller, SessionToolService } from 'session-tool'
import { extractAssistantAnswer, resolveOverride } from './ask.ts'
import { forkChildId, readAssistant } from './fork-continuation.ts'
import type { DshBotRuntimeConfig } from './ask.ts'
import type { BotView, BotsRuntime } from './bots.ts'
import { DshBotError } from './errors.ts'
import type { GroupsRuntime, RoomMessage } from './groups.ts'
import { GROUP_ROUNDS_DEFAULT, GROUP_ROUNDS_INFINITE } from './groups.ts'
import { hideBotSession } from './session-visibility.ts'
import {
  DSH_BOT_GROUP_HIDDEN_TITLE_PREFIX,
  botMark,
  botOwnershipTags,
  groupMark,
  groupRoomMark,
  parseBotMark,
} from './marks.ts'
import { applyModelOverride } from './platform.ts'
import type { DshBotPlatform } from './platform.ts'
import { unwrapPrompt, wrapPrompt } from './session-voice.ts'

const CLI_CALLER: SessionToolCaller = { kind: 'cli' }
const ROOM_TRANSCRIPT_MAX = 24
export const GROUP_MAX_ROUNDS = 3
export const GROUP_MAX_MEMBER_TURNS = 10

export interface RoundSpeaking {
  readonly sessionId?: string
  readonly afterSeq?: number
  readonly afterSessionSeq?: number
  readonly botId: string
  readonly name: string
}

export interface RoundStatus {
  readonly working: boolean
  readonly speaking?: RoundSpeaking
  readonly round?: number
  readonly rounds?: number
}

export interface RoundTracker {
  begin(roomId: string, rounds?: number): void
  speak(roomId: string, speaking: RoundSpeaking): void
  setRound(roomId: string, round: number, rounds?: number): void
  end(roomId: string): void
  get(roomId: string): RoundStatus | undefined
}

export interface RunGroupRoundRequest {
  readonly message?: RoomMessage
  readonly signal?: AbortSignal
  readonly roomId: string
  readonly text: string
  /** Bot behind the quoted line; answers alone unless the text names someone (BR-001). */
  readonly quotedBotId?: string
  /** Continue discussion: everyone, anchored on a system line, no new user line (BR-003). */
  readonly continuation?: boolean
}

export interface RunGroupRoundResult {
  readonly roomId: string
  readonly unmatchedMentions: boolean
}

export interface RetryMemberTurnRequest {
  readonly roomId: string
  readonly botId: string
  readonly errorSeq: number
  readonly signal?: AbortSignal
}

export interface RetryMemberTurnResult {
  readonly roomId: string
  readonly botId: string
  readonly posted: boolean
}

export interface PreparedRetryMemberTurn {
  readonly roomId: string
  readonly botId: string
  readonly group: { readonly id: string; readonly name: string; readonly rounds: number }
  readonly bot: BotView
  readonly members: readonly BotView[]
  readonly names: Map<string, string>
  readonly context: RoomMessage
}

export interface GroupEngineDeps {
  readonly voiceInjected?: () => boolean
  readonly sessionTool: SessionToolService
  readonly platform: DshBotPlatform
  readonly bots: BotsRuntime
  readonly groups: GroupsRuntime
  readonly config: DshBotRuntimeConfig
  readonly tracker: RoundTracker
  readonly createCwd: () => string
  readonly voiceFor: (botId: string) => Promise<string>
  readonly sessionVoice?: (sessionId: string) => Promise<string | undefined>
  readonly freezeVoice?: (sessionId: string, botId: string) => Promise<void>
}

/**
 * In-memory "who is speaking" for history polling (BR-304).
 */
export function createRoundTracker(): RoundTracker {
  const map = new Map<string, RoundStatus>()
  return {
    begin(roomId, rounds = GROUP_ROUNDS_DEFAULT) {
      map.set(roomId, { working: true, round: 1, rounds })
    },
    speak(roomId, speaking) {
      const prev = map.get(roomId)
      map.set(roomId, {
        working: true,
        speaking,
        rounds: prev?.rounds ?? GROUP_ROUNDS_DEFAULT,
        ...prev?.round === undefined ? {} : { round: prev.round },
      })
    },
    setRound(roomId, round, rounds) {
      const prev = map.get(roomId)
      map.set(roomId, {
        working: true,
        rounds: rounds ?? prev?.rounds ?? GROUP_ROUNDS_DEFAULT,
        round,
        ...prev?.speaking === undefined ? {} : { speaking: prev.speaking },
      })
    },
    end(roomId) {
      map.delete(roomId)
    },
    get(roomId) {
      return map.get(roomId)
    },
  }
}

export function orderRoundSpeakers<T>(memberIds: readonly T[], round: number): T[] {
  if (memberIds.length === 0) return []
  const n = memberIds.length
  const offset = ((round % n) + n) % n
  return [...memberIds.slice(offset), ...memberIds.slice(0, offset)]
}

export function isSkipReply(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed === '') return true
  return /^(?:\(\s*)?pass(?:\s*\))?\s*\.?$/i.test(trimmed)
}

const LEAKED_BANNER = /^(?:【小组房间轮次】|\[SAND_HIDDEN_PROMPT\]|\[Group chat:[^\]]*\])\s*/i
const OLD_TURN_CLOSE = '按你自己的身份接一句。没有要补充的可以沉默。'

function formatRoomLine(message: RoomMessage, names: Map<string, string>): string | undefined {
  if (message.speaker.kind === 'user') return `用户: ${message.text}`
  if (message.speaker.kind === 'error') return undefined
  if (message.speaker.kind === 'system') return '主持提示：请接着刚才的讨论继续。'
  const name = names.get(message.speaker.botId) ?? message.speaker.botId
  return `${name}: ${message.text}`
}

/**
 * Room lines this member has not yet answered, oldest first.
 */
export function messagesSinceMemberLastSpoke(
  messages: readonly RoomMessage[],
  botId: string,
): readonly RoomMessage[] {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const speaker = messages[index]!.speaker
    if (speaker.kind === 'member' && speaker.botId === botId) {
      return messages.slice(index + 1).filter(row => row.cancelledAt === undefined)
    }
  }
  return messages.filter(row => row.cancelledAt === undefined)
}

/**
 * Wake text for a member's session-tool hidden session. Identity is wrapped
 * onto this prompt at write time. No host protocol tags — those leak if copied.
 */
export function buildMemberTurnPrompt(input: {
  readonly groupName: string
  readonly memberName: string
  readonly peerNames: readonly string[]
  readonly recent: readonly string[]
}): string {
  const peers = input.peerNames.length === 0 ? '' : `同组还有 ${input.peerNames.join('、')}。`
  const recent = input.recent.length === 0 ? '（房间里还没有更早的话。）' : input.recent.join('\n')
  return [
    `${input.memberName}，现在轮到你在「${input.groupName}」里说话。${peers}`,
    '房间里刚说的：',
    recent,
    '按你自己的身份接一句。没有要补充的可以沉默。',
  ].join('\n')
}

/**
 * What the DSH Bot group room may show. Hidden member sessions keep their
 * own transcript; we only copy sanitized assistant text into our room jsonl.
 * `written` is the wake we put on the hidden session.
 */
export function toRoomSpeech(answer: string, written = ''): string | undefined {
  let text = unwrapPrompt(answer.trim())
  const lines = text.split('\n')
  while (lines.length > 0) {
    const trimmed = lines[0]!.trim()
    const match = LEAKED_BANNER.exec(trimmed)
    if (match === null) break
    const rest = trimmed.slice(match[0].length)
    if (rest === '') {
      lines.shift()
      continue
    }
    lines[0] = rest
    break
  }
  text = lines.join('\n').trim()
  const prompt = unwrapPrompt(written.trim())
  if (prompt !== '' && text.startsWith(prompt)) text = text.slice(prompt.length).trim()
  const close = text.indexOf(OLD_TURN_CLOSE)
  if (close >= 0 && (text.includes('现在轮到你') || text.includes('房间里刚说的'))) {
    text = text.slice(close + OLD_TURN_CLOSE.length).trim()
  }
  if (isSkipReply(text)) return undefined
  return text
}

const roomLocks = new Map<string, Promise<void>>()

function withRoomLock<T>(roomId: string, fn: () => Promise<T>): Promise<T> {
  const previous = roomLocks.get(roomId) ?? Promise.resolve()
  const next = previous.then(fn, fn)
  roomLocks.set(roomId, next.then(() => undefined, () => undefined))
  return next
}

async function ensureMemberTurnSession(
  deps: GroupEngineDeps,
  input: {
    readonly roomId: string
    readonly groupId: string
    readonly groupName: string
    readonly bot: BotView
  },
): Promise<string> {
  const marked = await rowsWithMark(groupRoomMark(input.roomId))
  for (const row of marked) {
    if (parseBotMark(row.tags) === input.bot.id && hasHiddenMark(row.tags)) {
      // 0.2.0-rc.1 rejects pre-step on archived sessions; older builds archived these.
      await deps.platform.unarchiveSession(row.id)
      return row.id
    }
  }
  const title = `${DSH_BOT_GROUP_HIDDEN_TITLE_PREFIX}${input.groupName}/${input.bot.name}`
  const created = await deps.sessionTool.create(CLI_CALLER, {
    title,
    tags: botOwnershipTags(
      botMark(input.bot.id),
      groupMark(input.groupId),
      groupRoomMark(input.roomId),
    ),
    cwd: deps.createCwd(),
  })
  const sessionId = created.sessionId
  // Hidden mark + `~` title keep it off the rail; archiving would block every turn (rc.1 pre-step).
  await hideBotSession(deps.sessionTool, deps.platform, sessionId, CLI_CALLER, { syncToArchived: false })
  const override = input.bot.modelOverride ?? resolveOverride(deps.config)
  if (override !== undefined) {
    await applyModelOverride(deps.platform, sessionId, override)
  }
  try {
    await deps.platform.renameSession(sessionId, title)
  } catch {
    // title is best-effort; marks already isolate the session
  }
  await deps.freezeVoice?.(sessionId, input.bot.id)
  return sessionId
}

async function lastAssistantText(
  sessionTool: SessionToolService,
  sessionId: string,
  afterSeq: number,
): Promise<string | undefined> {
  const read = await sessionTool.read(CLI_CALLER, SessionId(sessionId), { maxBlocks: 500 })
  return extractAssistantAnswer(read.messages.filter(row => row.seq > afterSeq))
}

/**
 * Append the user line, then run up to {@link GROUP_MAX_ROUNDS} serial
 * rounds. Round 0 uses roster order; later rounds rotate the start member
 * and skip anyone with no new room content since they last spoke. A round
 * with no visible member line ends the discussion. Failures record an error
 * line and leave earlier replies in the room.
 */
export async function runGroupRound(
  deps: GroupEngineDeps,
  request: RunGroupRoundRequest,
): Promise<RunGroupRoundResult> {
  const roomId = request.roomId.trim()
  const text = request.text.trim()
  if (roomId === '') throw new DshBotError('invalid-input', 'sessionId is required')
  if (text === '') throw new DshBotError('empty-prompt', 'prompt requires a non-empty text')
  return await withRoomLock(roomId, async () => {
    const room = await deps.groups.peekRoom(roomId)
    if (room === undefined) throw new DshBotError('invalid-input', `room ${JSON.stringify(roomId)} does not exist`)
    const group = await deps.groups.getGroup(room.header.groupId)
    const members = await liveGroupMembers(deps, group)
    if (members.length === 0) {
      throw new DshBotError('invalid-input', `group ${JSON.stringify(group.id)} has no live members`)
    }

    const mention = request.continuation === true
      ? { responderIds: members.map(row => row.id), unmatched: false, namedAll: true, unmatchedHandles: [] }
      : resolveResponders(text, members.map(row => ({ id: row.id, name: row.name })), request.quotedBotId)
    if (mention.unmatched) throw new DshBotError('invalid-mention', `无法识别或存在重名：${mention.unmatchedHandles.join('、')}`)
    const snapshot = members.filter(row => mention.responderIds.includes(row.id))
    const responderIds = snapshot.map(row => row.id)
    const memberById = new Map(snapshot.map(row => [row.id, row]))
    const configured = group.rounds
    const unlimited = configured === GROUP_ROUNDS_INFINITE
    const maxRounds = unlimited ? Number.POSITIVE_INFINITY : configured
    deps.tracker.begin(roomId, configured)
    try {
      const message = request.message ?? await deps.groups.appendRoomMessage(roomId,
        request.continuation === true ? { kind: 'system' } : { kind: 'user' }, text)
      const names = new Map(members.map(row => [row.id, row.name]))
      let totalMessages = 0
      for (let round = 0; round < maxRounds; round += 1) {
        if (request.signal?.aborted) break
        if (!unlimited && totalMessages >= GROUP_MAX_MEMBER_TURNS) break
        deps.tracker.setRound(roomId, round + 1, configured)
        let messagesThisRound = 0
        for (const botId of orderRoundSpeakers(responderIds, round)) {
          if (request.signal?.aborted) break
          if (!unlimited && totalMessages >= GROUP_MAX_MEMBER_TURNS) break
          const bot = memberById.get(botId)
          if (bot === undefined) continue
          const latest = await deps.groups.peekRoom(roomId)
          const eligible = (latest?.messages ?? []).filter(row => row.speaker.kind !== 'user' || row.seq <= message.seq)
          const unread = messagesSinceMemberLastSpoke(eligible, bot.id).slice(-ROOM_TRANSCRIPT_MAX)
          const hasNew = unread.some(row => row.speaker.kind === 'user' || row.speaker.kind === 'member')
          // Continuation has no fresh user line: even round 0 only wakes members with something new.
          if ((round > 0 || request.continuation === true) && !hasNew) continue
          const posted = await askMemberTurn(deps, {
            roomId,
            group,
            bot,
            members,
            names,
            message,
            ...request.signal === undefined ? {} : { signal: request.signal },
          })
          if (posted) {
            totalMessages += 1
            messagesThisRound += 1
          }
        }
        if (request.signal?.aborted) break
        if (messagesThisRound === 0) break
      }
      return { roomId, unmatchedMentions: mention.unmatched }
    } finally {
      deps.tracker.end(roomId)
    }
  })
}

async function liveGroupMembers(deps: GroupEngineDeps, group: { readonly memberIds: readonly string[] }): Promise<BotView[]> {
  const members: BotView[] = []
  for (const id of group.memberIds) {
    try {
      members.push(await deps.bots.getBot(id))
    } catch (error) {
      if (error instanceof DshBotError && error.code === 'bot-not-found') continue
      throw error
    }
  }
  return members
}

/**
 * One supplemental speech for a member whose last room line is an error.
 * Does not append another user message or re-run the full round.
 */
export async function retryMemberTurn(
  deps: GroupEngineDeps,
  request: RetryMemberTurnRequest,
): Promise<RetryMemberTurnResult> {
  const roomId = request.roomId.trim()
  if (roomId === '') throw new DshBotError('invalid-input', 'roomId is required')
  const prepared = await prepareRetryMemberTurn(deps, request)
  return await executeRetryMemberTurn(deps, prepared, request.signal)
}

export async function prepareRetryMemberTurn(
  deps: GroupEngineDeps,
  request: RetryMemberTurnRequest,
): Promise<PreparedRetryMemberTurn> {
  const roomId = request.roomId.trim()
  const botId = request.botId.trim()
  if (roomId === '') throw new DshBotError('invalid-input', 'roomId is required')
  if (botId === '') throw new DshBotError('invalid-input', 'botId is required')
  if (!Number.isInteger(request.errorSeq) || request.errorSeq < 1) {
    throw new DshBotError('invalid-input', 'errorSeq is required')
  }
  if (deps.tracker.get(roomId)?.working === true) {
    throw new DshBotError('invalid-input', 'room is busy')
  }
  const room = await deps.groups.peekRoom(roomId)
  if (room === undefined) throw new DshBotError('invalid-input', `room ${JSON.stringify(roomId)} does not exist`)
  const group = await deps.groups.getGroup(room.header.groupId)
  if (!group.memberIds.includes(botId)) {
    throw new DshBotError('bot-not-found', `bot ${JSON.stringify(botId)} is not in this group`)
  }
  const errorLine = room.messages.find(row => row.seq === request.errorSeq)
  if (
    errorLine === undefined
    || errorLine.speaker.kind !== 'error'
    || errorLine.speaker.botId !== botId
  ) {
    throw new DshBotError('invalid-input', 'error line does not belong to this member')
  }
  const superseded = room.messages.some(row =>
    row.seq > errorLine.seq
    && (row.speaker.kind === 'member' || row.speaker.kind === 'error')
    && row.speaker.botId === botId,
  )
  if (superseded) throw new DshBotError('invalid-input', 'this error has already been superseded')
  let context: RoomMessage | undefined
  for (let index = room.messages.length - 1; index >= 0; index -= 1) {
    const row = room.messages[index]!
    if (row.speaker.kind === 'user' && row.seq <= errorLine.seq) {
      context = row
      break
    }
  }
  if (context === undefined) {
    throw new DshBotError('invalid-input', 'no user message to retry against')
  }
  const members = await liveGroupMembers(deps, group)
  const bot = members.find(row => row.id === botId)
  if (bot === undefined) {
    throw new DshBotError('bot-not-found', `bot ${JSON.stringify(botId)} is not in this group`)
  }
  return {
    roomId,
    botId,
    group,
    bot,
    members,
    names: new Map(members.map(row => [row.id, row.name])),
    context,
  }
}

export async function executeRetryMemberTurn(
  deps: GroupEngineDeps,
  prepared: PreparedRetryMemberTurn,
  signal: AbortSignal | undefined,
): Promise<RetryMemberTurnResult> {
  const { roomId, botId, group, bot, members, names, context } = prepared
  return await withRoomLock(roomId, async () => {
    deps.tracker.begin(roomId, 1)
    try {
      const posted = await askMemberTurn(deps, {
        roomId,
        group,
        bot,
        members,
        names,
        message: context,
        ...signal === undefined ? {} : { signal },
      })
      return { roomId, botId, posted }
    } finally {
      deps.tracker.end(roomId)
    }
  })
}


async function askMemberTurn(
  deps: GroupEngineDeps,
  input: {
    readonly roomId: string
    readonly group: { readonly id: string; readonly name: string }
    readonly bot: BotView
    readonly members: readonly BotView[]
    readonly names: Map<string, string>
    readonly message: RoomMessage
    readonly signal?: AbortSignal
  },
): Promise<boolean> {
  const { roomId, group, bot, members, names, message } = input
  if (input.signal?.aborted) return false
  deps.tracker.speak(roomId, { botId: bot.id, name: bot.name })
  try {
    const sessionId = await ensureMemberTurnSession(deps, {
      roomId,
      groupId: group.id,
      groupName: group.name,
      bot,
    })
    if (input.signal?.aborted) return false
    const latest = await deps.groups.peekRoom(roomId)
    const eligible = (latest?.messages ?? []).filter(row => row.speaker.kind !== 'user' || row.seq <= message.seq)
    const unread = messagesSinceMemberLastSpoke(eligible, bot.id).slice(-ROOM_TRANSCRIPT_MAX)
    const current = unread.some(row => row.id === message.id) ? unread : [message, ...unread]
    const recent = current
      .map(line => formatRoomLine(line, names))
      .filter((line): line is string => line !== undefined)
    if (message.replyTo !== undefined) {
      recent.push(`用户引用 ${message.replyTo.speaker} 的消息：${message.replyTo.text}`)
    }
    const peers = members.filter(row => row.id !== bot.id).map(row => row.name)
    const prompt = buildMemberTurnPrompt({
      groupName: group.name,
      memberName: bot.name,
      peerNames: peers,
      recent,
    })
    const voice = await deps.sessionVoice?.(sessionId) ?? await deps.voiceFor(bot.id)
    const before = await deps.sessionTool.read(CLI_CALLER, SessionId(sessionId), { maxBlocks: 500 })
    const afterSeq = before.messages.reduce((max, row) => Math.max(max, row.seq), -1)
    if (input.signal?.aborted) return false
    deps.tracker.speak(roomId, { botId: bot.id, name: bot.name, sessionId,
      afterSeq: (latest?.messages ?? []).reduce((max, row) => Math.max(max, row.seq), 0),
      afterSessionSeq: afterSeq,
    })
    await deps.sessionTool.write(CLI_CALLER, SessionId(sessionId), deps.voiceInjected?.() === true ? prompt : wrapPrompt(voice, prompt))
    if (input.signal?.aborted) {
      await deps.platform.cancelSession?.(sessionId)
      return false
    }
    const waited = await deps.sessionTool.wait(CLI_CALLER, SessionId(sessionId), {
      until: 'idle',
      timeoutMs: deps.config.askTimeoutMs,
    })
    if (input.signal?.aborted) return false
    if (waited.status === 'timeout') {
      throw new DshBotError(
        'wait-timeout',
        `${bot.name} timed out waiting for a reply`,
        { sessionId },
      )
    }
    if (waited.status === 'failed' || waited.status === 'aborted') {
      throw new DshBotError(
        'session-failed',
        `${bot.name} failed to reply (status ${waited.status})`,
        { sessionId },
      )
    }
    if (waited.status === 'forked') {
      const childId = await forkChildId(deps.sessionTool, CLI_CALLER, sessionId)
      const continued = childId === undefined
        ? undefined
        : await readAssistant(deps.sessionTool, CLI_CALLER, childId)
      const answer = continued === undefined ? undefined : toRoomSpeech(continued, prompt)
      if (answer === undefined) return false
      await deps.groups.appendRoomMessage(roomId, { kind: 'member', botId: bot.id }, answer)
      return true
    }
    const raw = await lastAssistantText(deps.sessionTool, sessionId, afterSeq)
    const answer = raw === undefined ? undefined : toRoomSpeech(raw, prompt)
    if (answer === undefined) return false
    await deps.groups.appendRoomMessage(roomId, { kind: 'member', botId: bot.id }, answer)
    return true
  } catch (error) {
    if (input.signal?.aborted) return false
    const code = error instanceof DshBotError ? error.code : 'internal'
    const detail = error instanceof Error ? error.message : String(error)
    await deps.groups.appendRoomMessage(
      roomId,
      { kind: 'error', botId: bot.id, code },
      `${code}: ${detail}`,
    )
    return false
  }
}
