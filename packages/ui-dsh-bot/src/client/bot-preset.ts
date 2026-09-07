/**
 * BR-607 preset matching: seed `dsh-bot` or `dsh-bot--<slug>`.
 */

export function isBotPreset(preset: string | undefined): boolean {
  return preset === 'dsh-bot' || (preset !== undefined && preset.startsWith('dsh-bot--'))
}

export function findBotByPreset<T extends { presetId: string }>(
  bots: readonly T[],
  preset: string | undefined,
): T | undefined {
  if (!isBotPreset(preset)) return undefined
  return bots.find(bot => bot.presetId === preset)
}

export interface SessionPresetRow {
  readonly id?: string
  readonly agentPreset?: string
  readonly updatedAt?: number
}

/**
 * Newest official session for one bot (BR-604 preview / BR-607 match).
 */
export function pickLatestBotSession(
  botPresetId: string,
  byId: Readonly<Record<string, SessionPresetRow>> | undefined,
): { sessionId: string; updatedAt: number } | undefined {
  if (byId === undefined || !isBotPreset(botPresetId)) return undefined
  let best: { sessionId: string; updatedAt: number } | undefined
  for (const [id, session] of Object.entries(byId)) {
    if (!isBotPreset(session.agentPreset) || session.agentPreset !== botPresetId) continue
    const updatedAt = session.updatedAt ?? 0
    if (best === undefined || updatedAt > best.updatedAt) {
      best = { sessionId: session.id !== undefined && session.id !== '' ? session.id : id, updatedAt }
    }
  }
  return best
}
