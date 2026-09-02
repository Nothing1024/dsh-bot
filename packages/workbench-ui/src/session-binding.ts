/**
 * Bot ↔ session binding helpers: last-opened thread per identity, and
 * display titles that do not collapse every chat into the bot's name.
 */

export const UNTITLED_SESSION = '新对话'
export const LAST_SESSION_KEY_PREFIX = 'dsh-bot:last-session:'
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
  try {
    const value = localStorage.getItem(lastSessionStorageKey(identityId))
    return value !== null && value.trim() !== '' ? value : null
  } catch {
    return null
  }
}

/** Persist the open thread for this identity. */
export function writeLastSession(identityId: string, sessionId: string): void {
  if (identityId.trim() === '' || sessionId.trim() === '') return
  try {
    localStorage.setItem(lastSessionStorageKey(identityId), sessionId)
  } catch {
    // private-mode / blocked storage must not break switching
  }
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
