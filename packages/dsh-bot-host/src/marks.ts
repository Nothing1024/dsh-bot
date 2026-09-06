/**
 * Last-wins merge of `kind:dsh-bot` (and optional `kind:hidden`) into the
 * plugin mark table. session-tool create already puts the create-time set;
 * this get+put pair is the兜底 merge so a concurrent writer cannot drop
 * kind:delegated / parent tags (vibee markVibeeSession shape).
 * @module dsh-bot-host/marks
 */

import { get, put } from 'session-marks'

/** Plugin mark for every bot-owned session. */
export const DSH_BOT_KIND = 'kind:dsh-bot'
/** Plugin mark for delegated auxiliary (hidden) sessions. */
export const DSH_BOT_HIDDEN_KIND = 'kind:hidden'
/** Title prefix for delegated auxiliary sessions (session-tool hiddenPrefixes). */
export const DSH_BOT_HIDDEN_TITLE_PREFIX = '~dsh-bot: '
/** Title prefix for group member-turn hidden sessions (BR-305). */
export const DSH_BOT_GROUP_HIDDEN_TITLE_PREFIX = '~dsh-bot-group: '
/** Title prefix for memory-extract hidden sessions (INV-802). */
export const DSH_BOT_MEMORY_HIDDEN_TITLE_PREFIX = '~dsh-bot-memory: '

/**
 * Workbench ownership token `bot:<id>` (BR-203). Ordinary marks token; not a
 * reserved name.
 */
export function botMark(botId: string): string {
  const id = botId.trim()
  if (id === '') {
    throw new Error('bot:<id> mark requires a non-empty bot id')
  }
  return `bot:${id}`
}

const BOT_MARK_PREFIX = 'bot:'
const PEER_MARK_PREFIX = 'peer:'
const ROUTINE_MARK_PREFIX = 'routine:'
const GROUP_MARK_PREFIX = 'group:'
const GROUP_ROOM_MARK_PREFIX = 'group-room:'

/** Example: `peer:<fromBotId>` on the recipient colleague session (BR-022). */
export function peerMark(fromBot: string): string {
  const id = fromBot.trim()
  if (id === '') {
    throw new Error('peer:<id> mark requires a non-empty bot id')
  }
  return `${PEER_MARK_PREFIX}${id}`
}

export function parsePeerMark(tags: readonly string[]): string | undefined {
  for (const tag of tags) {
    if (!tag.startsWith(PEER_MARK_PREFIX)) continue
    const id = tag.slice(PEER_MARK_PREFIX.length).trim()
    if (id !== '') return id
  }
  return undefined
}

/** Example: `routine:<routineId>` on the visible routine thread (INV-902). */
export function routineMark(routineId: string): string {
  const id = routineId.trim()
  if (id === '') {
    throw new Error('routine:<id> mark requires a non-empty routine id')
  }
  return `${ROUTINE_MARK_PREFIX}${id}`
}

export function parseRoutineMark(tags: readonly string[]): string | undefined {
  for (const tag of tags) {
    if (!tag.startsWith(ROUTINE_MARK_PREFIX)) continue
    const id = tag.slice(ROUTINE_MARK_PREFIX.length).trim()
    if (id !== '') return id
  }
  return undefined
}

/**
 * First `bot:<id>` token in a mark set, if any.
 */
export function parseBotMark(tags: readonly string[]): string | undefined {
  for (const tag of tags) {
    if (!tag.startsWith(BOT_MARK_PREFIX)) continue
    const id = tag.slice(BOT_MARK_PREFIX.length).trim()
    if (id !== '') return id
  }
  return undefined
}

/**
 * Workbench group ownership token `group:<id>` (BR-305). Ordinary marks token.
 */
export function groupMark(groupId: string): string {
  const id = groupId.trim()
  if (id === '') {
    throw new Error('group:<id> mark requires a non-empty group id')
  }
  return `${GROUP_MARK_PREFIX}${id}`
}

/**
 * Room token `group-room:<roomId>` so (room, member) hidden sessions can be reused.
 */
export function groupRoomMark(roomId: string): string {
  const id = roomId.trim()
  if (id === '') {
    throw new Error('group-room:<id> mark requires a non-empty room id')
  }
  return `${GROUP_ROOM_MARK_PREFIX}${id}`
}

/**
 * First `group:<id>` token that is not a `group-room:` token.
 */
export function parseGroupMark(tags: readonly string[]): string | undefined {
  for (const tag of tags) {
    if (tag.startsWith(GROUP_ROOM_MARK_PREFIX)) continue
    if (!tag.startsWith(GROUP_MARK_PREFIX)) continue
    const id = tag.slice(GROUP_MARK_PREFIX.length).trim()
    if (id !== '') return id
  }
  return undefined
}

/**
 * First `group-room:<id>` token in a mark set, if any.
 */
export function parseGroupRoomMark(tags: readonly string[]): string | undefined {
  for (const tag of tags) {
    if (!tag.startsWith(GROUP_ROOM_MARK_PREFIX)) continue
    const id = tag.slice(GROUP_ROOM_MARK_PREFIX.length).trim()
    if (id !== '') return id
  }
  return undefined
}

const sessionLocks = new Map<string, Promise<void>>()

function withSessionLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
  const previous = sessionLocks.get(sessionId) ?? Promise.resolve()
  const next = previous.then(fn, fn)
  sessionLocks.set(sessionId, next.then(() => undefined, () => undefined))
  return next
}

/**
 * Merge reserved bot marks into the session's current set.
 * @param sessionId - the created session.
 * @param extra - additional tokens to merge (typically `kind:hidden` for askBot).
 */
export async function mergeBotMarks(sessionId: string, extra: readonly string[] = []): Promise<string[]> {
  return await withSessionLock(sessionId, async () => {
    const existing = await get(sessionId)
    const merged = [...(existing ?? []), DSH_BOT_KIND, ...extra]
    return await put(sessionId, merged)
  })
}
