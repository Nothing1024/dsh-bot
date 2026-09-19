/**
 * Leftover GUI sessions still store `agentPreset: dsh-bot` / `dsh-bot--<slug>`.
 * New workbench sessions are matched by marks (`listBotSessions`), not this.
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
 * Newest leftover official session for one bot (preview before listBotSessions).
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

