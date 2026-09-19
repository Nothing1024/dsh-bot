/**
 * Roster ⋯ menu → updateBotLayout / markRead (BR-604).
 */
import type { UpdateBotLayoutInput, WorkbenchBot, WorkbenchGroup } from 'dsh-bot-shared'
import type { RosterMenuAction } from './BotRoster.tsx'
import type { RosterRpc } from './roster-rpc.ts'
import { formatWireError } from 'dsh-bot-shared'

export function firstVisibleId(
  bots: readonly WorkbenchBot[],
  groups: readonly WorkbenchGroup[],
  except?: string,
): string | null {
  const bot = bots.find(row => row.hidden !== true && row.id !== except)
  if (bot !== undefined) return bot.id
  const group = groups.find(row => row.id !== except)
  return group?.id ?? null
}

export function layoutInputForAction(action: RosterMenuAction, id: string): UpdateBotLayoutInput | null {
  switch (action) {
    case 'pin':
      return { bots: [{ id, pinned: true }] }
    case 'unpin':
      return { bots: [{ id, pinned: false }] }
    case 'move-work':
      return { bots: [{ id, section: 'work', pinned: false }] }
    case 'move-life':
      return { bots: [{ id, section: 'life', pinned: false }] }
    case 'hide':
      return { bots: [{ id, hidden: true }] }
    case 'mute':
      return { bots: [{ id, muted: true }] }
    case 'unmute':
      return { bots: [{ id, muted: false }] }
    case 'mark-read':
      return null
  }
}

export function patchBots(bots: readonly WorkbenchBot[], action: RosterMenuAction, id: string): WorkbenchBot[] {
  return bots.map(bot => {
    if (bot.id !== id) return bot
    switch (action) {
      case 'pin':
        return { ...bot, pinned: true }
      case 'unpin':
        return { ...bot, pinned: false }
      case 'move-work':
        return { ...bot, section: 'work', pinned: false }
      case 'move-life':
        return { ...bot, section: 'life', pinned: false }
      case 'hide':
        return { ...bot, hidden: true }
      case 'mute':
        return { ...bot, muted: true }
      case 'unmute':
        return { ...bot, muted: false }
      case 'mark-read':
        return { ...bot, unread: 0 }
    }
  })
}

export async function runMenuAction(input: {
  action: RosterMenuAction
  id: string
  roster: RosterRpc
}): Promise<{ ok: boolean; error?: string }> {
  const current = input.roster.bots.getSnapshot()
  input.roster.bots.set({ ...current, items: patchBots(current.items, input.action, input.id) })
  if (input.action === 'mark-read') {
    const outcome = await input.roster.markRead(input.id)
    if (!outcome.ok) return { ok: false, error: formatWireError(outcome.error) }
    return { ok: true }
  }
  const body = layoutInputForAction(input.action, input.id)
  if (body === null) return { ok: true }
  const outcome = await input.roster.updateBotLayout(body)
  if (!outcome.ok) {
    await input.roster.refresh()
    return { ok: false, error: formatWireError(outcome.error) }
  }
  return { ok: true }
}
