/**
 * Idempotent GUI-session backfill (BR-203 / UF-205). Reverse-lookup uses
 * Task 1's ASM-201 channel: `session.list.items[].agentPreset`. Never
 * deletes existing marks. Non-bot sessions are skip-cached incrementally.
 * @module dsh-bot-host/reconcile
 */

import type { SessionToolService } from 'session-tool'
import { hideBotSession } from './session-visibility.ts'
import { patch } from 'session-marks'
import { invalidateMarks, marksTable } from './marks-cache.ts'
import { SEED_BOT_ID } from './bots.ts'
import type { BotsRuntime } from './bots.ts'
import {
  DSH_BOT_APP,
  DSH_BOT_CHAT_KIND,
  DSH_BOT_FORM,
  DSH_BOT_KIND,
  botMark,
  botOwnershipTags,
  expandWriteAliases,
  hasBotInventoryMark,
  hasHiddenMark,
  isAuxiliaryBotSession,
  parseBotMark,
} from './marks.ts'
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

function missingOwnership(tags: readonly string[]): string[] {
  const add: string[] = []
  if (!tags.includes(DSH_BOT_APP)) add.push(DSH_BOT_APP)
  if (!tags.includes(DSH_BOT_KIND)) add.push(DSH_BOT_KIND)
  if (!tags.includes(DSH_BOT_FORM)) add.push(DSH_BOT_FORM)
  return add
}

async function markAdd(sessionId: string, add: readonly string[]): Promise<void> {
  if (add.length === 0) return
  try {
    await patch(sessionId, { add: expandWriteAliases(add) })
  } finally {
    invalidateMarks()
  }
}

/**
 * Scan gateway sessions and merge ownership + `bot:<id>` onto unlabeled
 * registry-preset rows and v1 leftovers (inventory mark without `bot:`).
 */
export async function reconcileBotSessions(
  platform: DshBotPlatform,
  bots: BotsRuntime,
  state: ReconcileState,
  sessionTool: SessionToolService,
): Promise<ReconcileResult> {
  const { bots: rows } = await bots.listBots()
  const presetToBot = new Map<string, string>()
  for (const bot of rows) {
    if (!presetToBot.has(bot.presetId)) presetToBot.set(bot.presetId, bot.id)
  }
  const listed = await platform.listSessions()
  const archived = new Set((await sessionTool.workspaceList({ kind: 'cli' })).archivedSessionIds)
  const marks = await marksTable()
  const present = new Set(listed.map(row => row.sessionId.trim()))
  for (const sessionId of state.skipNonBot) {
    if (!present.has(sessionId)) state.skipNonBot.delete(sessionId)
  }
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

    const tags = marks.get(sessionId) ?? []
    const existingBot = parseBotMark(tags)
    const hasInventory = hasBotInventoryMark(tags)

    if (existingBot !== undefined || hasInventory || mapped !== undefined) {
      const add = missingOwnership(tags)
      if (!isAuxiliaryBotSession(tags, row.title) && !tags.includes(DSH_BOT_CHAT_KIND)) {
        add.push(DSH_BOT_CHAT_KIND)
      }
      await markAdd(sessionId, add)
      const auxiliary = isAuxiliaryBotSession(tags, row.title)
      if (!hasHiddenMark(tags) || (auxiliary && !archived.has(sessionId))) {
        await hideBotSession(sessionTool, platform, sessionId, { kind: 'cli' }, {
          syncToArchived: auxiliary,
        })
      }
    }

    if (existingBot !== undefined) {
      state.skipNonBot.delete(sessionId)
      if (!hasInventory) {
        await markAdd(sessionId, [...botOwnershipTags(), botMark(existingBot)])
        assigned.push({ sessionId, botId: existingBot, reason: 'ensure-kind' })
      } else {
        alreadyLabeled += 1
      }
      continue
    }

    if (hasInventory) {
      state.skipNonBot.delete(sessionId)
      await markAdd(sessionId, [...botOwnershipTags(), botMark(SEED_BOT_ID)])
      assigned.push({ sessionId, botId: SEED_BOT_ID, reason: 'v1-legacy' })
      continue
    }

    if (mapped === undefined) {
      state.skipNonBot.add(sessionId)
      skippedNonBot += 1
      continue
    }

    state.skipNonBot.delete(sessionId)
    await markAdd(sessionId, [...botOwnershipTags(), botMark(mapped)])
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
