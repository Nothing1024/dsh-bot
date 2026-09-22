/**
 * Bot ↔ session binding helpers: last-opened thread per identity, and
 * display titles that do not collapse every chat into the bot's name.
 */

export const UNTITLED_SESSION = '新对话'
export const LAST_SESSION_KEY_PREFIX = 'dsh-bot:last-session:'
export const LAST_OWNER_KEY = 'dsh-bot:workbench:last-owner'

// Reloads restore this tab. A fresh tab can still start from the shared last choice.
function readSelection(key: string): string | null {
  try {
    const current = sessionStorage.getItem(key)?.trim()
    if (current) return current
  } catch { /* tab storage may be blocked */ }
  try { return localStorage.getItem(key)?.trim() || null } catch { return null }
}

function writeSelection(key: string, value: string): void {
  try { sessionStorage.setItem(key, value) } catch { /* tab storage may be blocked */ }
  try { localStorage.setItem(key, value) } catch { /* shared storage may be blocked */ }
}

export function readLastOwner(): string | null {
  return readSelection(LAST_OWNER_KEY)
}

export function writeLastOwner(identityId: string): void {
  if (identityId.trim() !== '') writeSelection(LAST_OWNER_KEY, identityId)
}
/** How many bound threads sit under a selected roster identity. */
export const NESTED_SESSION_LIMIT = 8

export interface NestedSession {
  readonly sessionId: string
  readonly selected: boolean
}

/**
 * Newest-first slice for the roster, always keeping the open thread visible.
 */
export function nestedSessionSlice<T extends NestedSession>(
  sessions: readonly T[],
  limit = NESTED_SESSION_LIMIT,
): { readonly visible: readonly T[]; readonly hiddenCount: number } {
  if (sessions.length <= limit) return { visible: sessions, hiddenCount: 0 }
  const selected = sessions.find(row => row.selected)
  const head = sessions.slice(0, limit)
  if (selected === undefined || head.some(row => row.sessionId === selected.sessionId)) {
    return { visible: head, hiddenCount: sessions.length - head.length }
  }
  return {
    visible: [selected, ...head.slice(0, limit - 1)],
    hiddenCount: sessions.length - limit,
  }
}

export function lastSessionStorageKey(identityId: string): string {
  return `${LAST_SESSION_KEY_PREFIX}${identityId}`
}

/**
 * Last session the workbench opened for this bot or group. Empty when unset
 * or storage is blocked.
 */
export function readLastSession(identityId: string): string | null {
  if (identityId.trim() === '') return null
  return readSelection(lastSessionStorageKey(identityId))
}

/** Persist the open thread for this identity. */
export function writeLastSession(identityId: string, sessionId: string): void {
  if (identityId.trim() === '' || sessionId.trim() === '') return
  writeSelection(lastSessionStorageKey(identityId), sessionId)
}

/**
 * Label a bound session. Untitled, identity-name clones, and blank New Session
 * rows all read as 新对话 so two chats under one bot stay distinguishable
 * once DSH writes a real first-prompt title.
 */
export function sessionDisplayTitle(
  title: string | undefined,
  identityName: string,
  options: { readonly hidden?: boolean } = {},
): string {
  const raw = (title ?? '').trim()
  const stripped = raw.replace(/^~+\s*/, '').trim()
  const untitled = stripped === ''
    || stripped === identityName
    || /^new session$/i.test(stripped)
  const core = untitled ? UNTITLED_SESSION : stripped
  return options.hidden === true ? `~ ${core}` : core
}

const ROOM_TITLE_MAX = 20

/**
 * Human-readable label for an untitled group room. Manual `title` on the
 * rooms.json row still wins at the call site.
 */
export function defaultGroupRoomTitle(groupName: string, createdAt: number): string {
  const name = groupName.trim() || '小组'
  const at = new Date(createdAt)
  if (Number.isNaN(at.getTime())) return name
  const month = at.getMonth() + 1
  const day = at.getDate()
  const hour = String(at.getHours()).padStart(2, '0')
  const minute = String(at.getMinutes()).padStart(2, '0')
  return `${name} · ${month}/${day} ${hour}:${minute}`
}

/**
 * First-user-message auto-title. Empty after trim stays untitled so the
 * display fallback can still stamp a clock label.
 */
export function firstUserRoomTitle(text: string): string | undefined {
  const first = text.trim().split(/\r?\n/, 1)[0]?.trim() ?? ''
  if (first === '') return undefined
  return first.length <= ROOM_TITLE_MAX ? first : `${first.slice(0, ROOM_TITLE_MAX).trimEnd()}…`
}

/**
 * Prefer the stored room title; otherwise a clock-stamped group label so
 * untitled rooms never fall back to a truncated room id.
 */
export function groupRoomDisplayTitle(
  title: string | undefined,
  groupName: string,
  createdAt: number,
): string {
  const raw = (title ?? '').trim()
  return raw === '' ? defaultGroupRoomTitle(groupName, createdAt) : raw
}



/**
 * Prefer an explicit id, then the remembered thread, then newest.
 */
export function pickBoundSession(
  sessionIds: readonly string[],
  prefer: string | null | undefined,
  remembered: string | null | undefined,
): string | null {
  if (sessionIds.length === 0) return null
  if (prefer !== undefined && prefer !== null && sessionIds.includes(prefer)) return prefer
  if (remembered !== undefined && remembered !== null && sessionIds.includes(remembered)) {
    return remembered
  }
  return sessionIds[0] ?? null
}
