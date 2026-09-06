/**
 * Parse `[agent] 来自 X：` for Transcript peer tags (BR-027).
 */
export function peerLabelFromText(text: string | undefined): string | undefined {
  if (text === undefined) return undefined
  const match = text.trim().match(/^\[agent\]\s*来自\s*(.+?)：/u)
  const name = match?.[1]?.trim()
  return name === undefined || name === '' ? undefined : name
}
