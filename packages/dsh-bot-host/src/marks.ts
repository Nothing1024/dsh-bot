/**
 * Bot session marks. Inventory is `app:dsh-bot` (plus transitional
 * `kind:dsh-bot`); instance keys stay `bot:` / `group:` / `peer:` / `routine:`.
 * Hide/child writes go through sessionTool.hide / parentSessionId — this
 * module does not get+put the mark table.
 * @module dsh-bot-host/marks
 */

import { hasHiddenMark, isTitleHidden, listByMark } from 'session-marks'
import type { SessionMarksRow } from 'session-marks'

/** Product inventory axis. New writes always include this. */
export const DSH_BOT_APP = 'app:dsh-bot'
/** Transitional inventory alias so old `listByKind('kind:dsh-bot')` still hits. */
export const DSH_BOT_KIND = 'kind:dsh-bot'
/** Plugin-created sessions. Not a product instance key. */
export const DSH_BOT_FORM = 'form:plugin'
/**
 * Product chat token (1:1 workbench rows). Not a platform `form:` value;
 * keep as an exact mark.
 */
export const DSH_BOT_CHAT_KIND = 'kind:dsh-bot-chat'

/** Historical hidden spelling. Prefer `hasHiddenMark` / `hide()`. */
export const DSH_BOT_HIDDEN_KIND = 'kind:hidden'
/** Title prefix for delegated auxiliary sessions (session-tool hiddenPrefixes). */
export const DSH_BOT_HIDDEN_TITLE_PREFIX = '~dsh-bot: '
/** Title prefix for group member-turn hidden sessions (BR-305). */
export const DSH_BOT_GROUP_HIDDEN_TITLE_PREFIX = '~dsh-bot-group: '
/** Title prefix for memory-extract hidden sessions (INV-802). */
export const DSH_BOT_MEMORY_HIDDEN_TITLE_PREFIX = '~dsh-bot-memory: '

/**
 * Create-time ownership set. Extra tokens are instance keys (`bot:`, `group:`)
 * or the product chat token — never `hidden` / `delegated` (platform writes those).
 */
export function botOwnershipTags(...extra: readonly string[]): string[] {
  return [DSH_BOT_APP, DSH_BOT_KIND, DSH_BOT_FORM, ...extra]
}

export function hasBotInventoryMark(tags: readonly string[] | undefined): boolean {
  return tags?.includes(DSH_BOT_APP) === true || tags?.includes(DSH_BOT_KIND) === true
}

/**
 * Transition inventory: union of `app:dsh-bot` and `kind:dsh-bot`.
 * Do not pass both tokens to `sessionTool.list({ tags })` — that is an intersection.
 */
export async function listBotInventory(): Promise<SessionMarksRow[]> {
  const [byApp, byKind] = await Promise.all([
    listByMark(DSH_BOT_APP),
    listByMark(DSH_BOT_KIND),
  ])
  const byId = new Map<string, SessionMarksRow>()
  for (const row of byApp) byId.set(row.id, row)
  for (const row of byKind) {
    if (!byId.has(row.id)) byId.set(row.id, row)
  }
  return [...byId.values()]
}

export function isAuxiliaryBotSession(tags: readonly string[], title?: string): boolean {
  return isTitleHidden(title, ['~'])
    || (hasHiddenMark(tags) && !tags.includes(DSH_BOT_CHAT_KIND))
}

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
