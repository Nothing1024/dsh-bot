/**
 * Idempotent GUI-session backfill (BR-203 / UF-205). Reverse-lookup uses
 * Task 1's ASM-201 channel: `session.list.items[].agentPreset`. Never
 * deletes existing marks. Non-bot sessions are skip-cached incrementally.
 * @module dsh-bot-host/reconcile
 */

import { get } from 'session-marks'
import { SEED_BOT_ID } from './bots.ts'
import type { BotsRuntime } from './bots.ts'
import { DSH_BOT_KIND, botMark, mergeBotMarks, parseBotMark } from './marks.ts'
import type { DshBotPlatform } from './platform.ts'

/** Why a session was labeled this pass. */
export type ReconcileReason = 'preset' | 'v1-legacy' | 'ensure-kind'

/** One newly (or repaired) labeled session. */
export interface ReconcileAssigned {
  readonly sessionId: string
  readonly botId: string
  readonly reason: ReconcileReason
}

/** `POST /dsh-bot/reconcile` value. */
export interface ReconcileResult {
  readonly scanned: number
  readonly labeled: number
  readonly alreadyLabeled: number
  readonly skippedNonBot: number
  readonly skippedCached: number
  readonly assigned: readonly ReconcileAssigned[]
}

/** Process-local skip cache for sessions already judged non-bot. */
export interface ReconcileState {
  readonly skipNonBot: Set<string>
}

/** Fresh incremental cache. */
export function createReconcileState(): ReconcileState {
  return { skipNonBot: new Set() }
}

/**
 * Scan gateway sessions and merge `[kind:dsh-bot, bot:<id>]` onto unlabeled
 * registry-preset rows and v1 leftovers (`kind:dsh-bot` without `bot:`).
 */
export async function reconcileBotSessions(
  platform: DshBotPlatform,
  bots: BotsRuntime,
  state: ReconcileState,
): Promise<ReconcileResult> {
  const { bots: rows } = await bots.listBots()
  const presetToBot = new Map<string, string>()
  for (const bot of rows) {
    if (!presetToBot.has(bot.presetId)) presetToBot.set(bot.presetId, bot.id)
  }
  const listed = await platform.listSessions()
  const assigned: ReconcileAssigned[] = []
  let alreadyLabeled = 0
  let skippedNonBot = 0
  let skippedCached = 0

  for (const row of listed) {
    const sessionId = row.sessionId.trim()
    if (sessionId === '') continue
    const preset = row.agentPreset?.trim() ?? ''
    const mapped = preset === '' ? undefined : presetToBot.get(preset)

    if (state.skipNonBot.has(sessionId) && mapped === undefined) {
      skippedCached += 1
      continue
    }

    const tags = (await get(sessionId)) ?? []
    const existingBot = parseBotMark(tags)
    const hasKind = tags.includes(DSH_BOT_KIND)

    if (existingBot !== undefined) {
      state.skipNonBot.delete(sessionId)
      if (!hasKind) {
        await mergeBotMarks(sessionId, [botMark(existingBot)])
        assigned.push({ sessionId, botId: existingBot, reason: 'ensure-kind' })
      } else {
        alreadyLabeled += 1
      }
      continue
    }

    if (hasKind) {
      state.skipNonBot.delete(sessionId)
      await mergeBotMarks(sessionId, [botMark(SEED_BOT_ID)])
      assigned.push({ sessionId, botId: SEED_BOT_ID, reason: 'v1-legacy' })
      continue
    }

    if (mapped === undefined) {
      state.skipNonBot.add(sessionId)
      skippedNonBot += 1
      continue
    }

    state.skipNonBot.delete(sessionId)
    await mergeBotMarks(sessionId, [botMark(mapped)])
    assigned.push({ sessionId, botId: mapped, reason: 'preset' })
  }

  return {
    scanned: listed.length,
    labeled: assigned.length,
    alreadyLabeled,
    skippedNonBot,
    skippedCached,
    assigned,
  }
}
