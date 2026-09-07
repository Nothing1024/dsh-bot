/**
 * Group round engine: mention parse + one serial turn per responder (BR-304).
 *
 * Each member turn runs in a session-tool hidden session (`kind:hidden` +
 * `~dsh-bot-group:`). That session may hold room context so the member hears
 * peers; session-tool drops it from default lists. Visible 1:1 sessions are
 * never written. The DSH Bot room jsonl is the only multi-author transcript.
 * @module dsh-bot-host/group-engine
 */

import { SessionId } from '@deepseek-ai/dsh-session'
import { listByKind } from 'session-marks'
import type { SessionToolCaller, SessionToolService } from 'session-tool'
import { extractAssistantAnswer, resolveOverride } from './ask.ts'
import type { DshBotRuntimeConfig } from './ask.ts'
import type { BotView, BotsRuntime } from './bots.ts'
import { DshBotError } from './errors.ts'
import type { GroupsRuntime, RoomMessage } from './groups.ts'
import {
  DSH_BOT_GROUP_HIDDEN_TITLE_PREFIX,
  DSH_BOT_HIDDEN_KIND,
  botMark,
  groupMark,
  groupRoomMark,
  mergeBotMarks,
  parseBotMark,
} from './marks.ts'
import { applyModelOverride } from './platform.ts'
import type { DshBotPlatform } from './platform.ts'

const CLI_CALLER: SessionToolCaller = { kind: 'cli' }
const ROOM_TRANSCRIPT_MAX = 24
const ALL_HANDLES = new Set(['all', 'everyone'])

export interface MentionMember {
  readonly id: string
  readonly name: string
}

export interface MentionParse {
  readonly responderIds: readonly string[]
  readonly unmatched: boolean
  readonly namedAll: boolean
}

export interface RoundSpeaking {
  readonly botId: string
  readonly name: string
}

export interface RoundStatus {
  readonly working: boolean
  readonly speaking?: RoundSpeaking
}

export interface RoundTracker {
  begin(roomId: string): void
  speak(roomId: string, speaking: RoundSpeaking): void
  end(roomId: string): void
  get(roomId: string): RoundStatus | undefined
}

export interface RunGroupRoundRequest {
  readonly roomId: string
  readonly text: string
}

export interface RunGroupRoundResult {
  readonly roomId: string
  readonly unmatchedMentions: boolean
}

export interface GroupEngineDeps {
  readonly sessionTool: SessionToolService
  readonly platform: DshBotPlatform
  readonly bots: BotsRuntime
  readonly groups: GroupsRuntime
  readonly config: DshBotRuntimeConfig
  readonly tracker: RoundTracker
  readonly createCwd: () => string
}

/**
 * In-memory "who is speaking" for history polling (BR-304).
 */
export function createRoundTracker(): RoundTracker {
  const map = new Map<string, RoundStatus>()
  return {
    begin(roomId) {
      map.set(roomId, { working: true })
    },
    speak(roomId, speaking) {
      map.set(roomId, { working: true, speaking })
    },
    end(roomId) {
      map.delete(roomId)
    },
    get(roomId) {
      return map.get(roomId)
    },
  }
}

function matchMember(token: string, members: readonly MentionMember[]): MentionMember | undefined {
  const compact = token.replace(/\s+/g, '')
  if (compact === '') return undefined
  let prefixHit: MentionMember | undefined
  for (const member of members) {
    const nameCompact = member.name.replace(/\s+/g, '')
    if (member.id === token || member.name === token || nameCompact === compact) return member
    if (nameCompact !== '' && compact.startsWith(nameCompact)) {
      if (prefixHit === undefined || member.name.length > prefixHit.name.length) prefixHit = member
    }
  }
  return prefixHit
}

/**
 * Resolve @handles against current members. No mention or unmatched → all
 * members (in memberIds order). `@all` / `@everyone` = everyone.
 */
export function parseMentions(text: string, members: readonly MentionMember[]): MentionParse {
  const order = members.map(row => row.id)
  const mentions = [...text.matchAll(/@([^\s@]+)/g)].map(match => match[1] ?? '')
  if (mentions.length === 0) {
    return { responderIds: order, unmatched: false, namedAll: false }
  }
  const wanted = new Set<string>()
  let namedAll = false
  let anyMatch = false
  for (const raw of mentions) {
    const token = raw.trim()
    if (token === '') continue
    if (ALL_HANDLES.has(token.toLowerCase())) {
      namedAll = true
      anyMatch = true
      continue
    }
    const hit = matchMember(token, members)
    if (hit !== undefined) {
      wanted.add(hit.id)
      anyMatch = true
    }
  }
  if (namedAll) {
    return { responderIds: order, unmatched: false, namedAll: true }
  }
  if (!anyMatch) {
    return { responderIds: order, unmatched: true, namedAll: false }
  }
  return {
    responderIds: order.filter(id => wanted.has(id)),
    unmatched: false,
    namedAll: false,
  }
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
      return messages.slice(index + 1)
    }
  }
  return messages
}

/**
 * Wake text for a member's session-tool hidden session. Identity comes from
 * that session's agent preset. No host protocol tags — those leak if copied.
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
  let text = answer.trim()
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
  const prompt = written.trim()
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
  const marked = await listByKind(groupRoomMark(input.roomId))
  for (const row of marked) {
    if (parseBotMark(row.tags) === input.bot.id && row.tags.includes(DSH_BOT_HIDDEN_KIND)) {
      return row.id
    }
  }
  const created = await deps.platform.createSession({
    agentPreset: input.bot.presetId,
    cwd: deps.createCwd(),
  })
  const sessionId = created.sessionId
  await mergeBotMarks(sessionId, [
    DSH_BOT_HIDDEN_KIND,
    botMark(input.bot.id),
    groupMark(input.groupId),
    groupRoomMark(input.roomId),
  ])
  const override = input.bot.modelOverride ?? resolveOverride(deps.config)
  if (override !== undefined) {
    await applyModelOverride(deps.platform, sessionId, override)
  }
  const title = `${DSH_BOT_GROUP_HIDDEN_TITLE_PREFIX}${input.groupName}/${input.bot.name}`
  try {
    await deps.platform.renameSession(sessionId, title)
  } catch {
    // title is best-effort; marks already isolate the session
  }
  try {
    await deps.platform.archiveSession(sessionId)
  } catch {
    // BR-305: 尽力归档; hidden marks already keep it out of the default 1:1 list
  }
  return sessionId
}

async function lastAssistantText(
  sessionTool: SessionToolService,
  sessionId: string,
): Promise<string | undefined> {
  const read = await sessionTool.read(CLI_CALLER, SessionId(sessionId), { maxBlocks: 500 })
  return extractAssistantAnswer(read.messages)
}

/**
 * Append the user line, then serially ask each responder. Failures record an
 * error line and leave earlier member replies in the room.
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
    const members: BotView[] = []
    for (const id of group.memberIds) {
      members.push(await deps.bots.getBot(id))
    }
    const mention = parseMentions(text, members.map(row => ({ id: row.id, name: row.name })))
    const responders = members.filter(row => mention.responderIds.includes(row.id))
    const snapshot = responders
    deps.tracker.begin(roomId)
    try {
      await deps.groups.appendRoomMessage(roomId, { kind: 'user' }, text)
      const names = new Map(members.map(row => [row.id, row.name]))
      for (const bot of snapshot) {
        deps.tracker.speak(roomId, { botId: bot.id, name: bot.name })
        try {
          const sessionId = await ensureMemberTurnSession(deps, {
            roomId,
            groupId: group.id,
            groupName: group.name,
            bot,
          })
          const latest = await deps.groups.peekRoom(roomId)
          const recent = messagesSinceMemberLastSpoke(latest?.messages ?? [], bot.id)
            .slice(-ROOM_TRANSCRIPT_MAX)
            .map(line => formatRoomLine(line, names))
            .filter((line): line is string => line !== undefined)
          const peers = members.filter(row => row.id !== bot.id).map(row => row.name)
          const prompt = buildMemberTurnPrompt({
            groupName: group.name,
            memberName: bot.name,
            peerNames: peers,
            recent,
          })
          await deps.sessionTool.write(CLI_CALLER, SessionId(sessionId), prompt)
          const waited = await deps.sessionTool.wait(CLI_CALLER, SessionId(sessionId), {
            until: 'idle',
            timeoutMs: deps.config.askTimeoutMs,
          })
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
          const raw = await lastAssistantText(deps.sessionTool, sessionId)
          const answer = raw === undefined ? undefined : toRoomSpeech(raw, prompt)
          if (answer === undefined) continue
          await deps.groups.appendRoomMessage(roomId, { kind: 'member', botId: bot.id }, answer)
        } catch (error) {
          const code = error instanceof DshBotError ? error.code : 'internal'
          const message = error instanceof Error ? error.message : String(error)
          await deps.groups.appendRoomMessage(
            roomId,
            { kind: 'error', botId: bot.id, code },
            `${code}: ${message}`,
          )
        }
      }
      return { roomId, unmatchedMentions: mention.unmatched }
    } finally {
      deps.tracker.end(roomId)
    }
  })
}
