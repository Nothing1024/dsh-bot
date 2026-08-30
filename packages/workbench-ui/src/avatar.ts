/**
 * Avatar + roster preview helpers (BR-206). Emoji wins; otherwise first
 * character on a deterministic 8-color board hashed from botId.
 */

export const AVATAR_COLORS = [
  '#5b8def',
  '#7c6af7',
  '#d4537e',
  '#e08a3c',
  '#3db88a',
  '#2eb5d0',
  '#c9a227',
  '#a78bfa',
] as const

export type AvatarColor = (typeof AVATAR_COLORS)[number]

/**
 * FNV-1a → 8-color board. Matches dsh-bot-host `hashAvatarColor`.
 */
export function hashAvatarColor(botId: string): AvatarColor {
  let hash = 2166136261
  for (let i = 0; i < botId.length; i += 1) {
    hash ^= botId.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return AVATAR_COLORS[(hash >>> 0) % AVATAR_COLORS.length]!
}

/** First code point of the name, or `?`. */
export function nameInitial(name: string): string {
  const first = [...name.trim()][0]
  return first ?? '?'
}

/** Preview priority: draft, then last message (reference-ui-notes §B1, §E). */
export function rowPreview(draft: string | undefined, lastMessage: string | undefined): string {
  const fromDraft = draft?.trim()
  if (fromDraft !== undefined && fromDraft !== '') return fromDraft
  return lastMessage?.trim() ?? ''
}

/** Relative time: now / Nm / Nh / Nd. */
export function relativeTime(timestampMs: number, nowMs = Date.now()): string {
  const delta = Math.max(0, nowMs - timestampMs)
  const minutes = Math.floor(delta / 60_000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}
