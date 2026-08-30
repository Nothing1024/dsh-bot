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
