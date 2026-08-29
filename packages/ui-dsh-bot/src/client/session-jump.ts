/**
 * Jump to a bot session from the sidebar list (vibee jumpToSession shape).
 * Duck-typed so this client half does not import platform runtime packages.
 */

export interface SessionJumpFace {
  open?(id: string): void
  openSubagent?(address: unknown): void
  subagentAddress?(id: string): unknown
}

/**
 * Open `sessionId` as a subagent when catalogued, otherwise as a session.
 * @returns true when a jump call was issued.
 */
export function jumpToSession(sessions: SessionJumpFace | undefined, sessionId: string): boolean {
  if (sessions === undefined) return false
  const address = sessions.subagentAddress?.(sessionId)
  if (address !== undefined && sessions.openSubagent !== undefined) {
    sessions.openSubagent(address)
    return true
  }
  if (sessions.open === undefined) return false
  sessions.open(sessionId)
  return true
}
