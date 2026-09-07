import {
  DEFAULT_ROSTER_SECTIONS,
  groupRosterItems,
  hashAvatarColor,
  rowPreview,
} from 'dsh-bot-shared'
import type { RosterSection, WorkbenchBot, WorkbenchGroup } from 'dsh-bot-shared'

export interface RosterMemberModel {
  readonly id: string
  readonly name: string
  readonly color: string
  readonly emoji?: string
}

export interface RosterRowModel {
  readonly kind: 'bot' | 'group'
  readonly id: string
  readonly name: string
  readonly color: string
  readonly emoji?: string
  readonly preview: string
  readonly unread: number
  readonly muted: boolean
  readonly hidden: boolean
  readonly pinned: boolean
  readonly section?: string
  readonly order?: number
  readonly updatedAt: number
  readonly sessionCount: number
  readonly protected: boolean
  readonly memberIds: readonly string[]
  readonly members: readonly RosterMemberModel[]
  readonly modelLabel?: string
  readonly pending: boolean
}

export interface BuildRosterRowsInput {
  readonly bots: readonly WorkbenchBot[]
  readonly groups: readonly WorkbenchGroup[]
  readonly pendingBotIds?: ReadonlySet<string>
  readonly lastMessages?: Readonly<Record<string, string>>
  readonly sessionCounts?: Readonly<Record<string, number>>
}

export function botColor(bot: WorkbenchBot): string {
  return bot.avatar.color !== '' ? bot.avatar.color : hashAvatarColor(bot.id)
}

export function buildRosterRows(input: BuildRosterRowsInput): RosterRowModel[] {
  const pending = input.pendingBotIds ?? new Set<string>()
  const last = input.lastMessages ?? {}
  const counts = input.sessionCounts ?? {}
  const botsById = new Map(input.bots.map(bot => [bot.id, bot]))
  const botRows: RosterRowModel[] = input.bots.map(bot => {
    const row: RosterRowModel = {
      kind: 'bot',
      id: bot.id,
      name: bot.name,
      color: botColor(bot),
      preview: rowPreview(undefined, last[bot.id]),
      unread: bot.unread ?? 0,
      muted: bot.muted === true,
      hidden: bot.hidden === true,
      pinned: bot.pinned === true,
      updatedAt: bot.createdAt,
      sessionCount: counts[bot.id] ?? 0,
      protected: bot.protected,
      memberIds: [],
      members: [],
      pending: pending.has(bot.id),
    }
    return {
      ...row,
      ...bot.avatar.emoji !== undefined ? { emoji: bot.avatar.emoji } : {},
      ...bot.section !== undefined ? { section: bot.section } : {},
      ...bot.order !== undefined ? { order: bot.order } : {},
      ...bot.modelOverride?.model !== undefined && bot.modelOverride.model !== ''
        ? { modelLabel: bot.modelOverride.model }
        : {},
    }
  })
  const groupRows: RosterRowModel[] = input.groups.map(group => {
    const members = group.memberIds.map(id => {
      const bot = botsById.get(id)
      if (bot === undefined) return { id, name: id, color: hashAvatarColor(id) }
      return {
        id,
        name: bot.name,
        color: botColor(bot),
        ...bot.avatar.emoji !== undefined ? { emoji: bot.avatar.emoji } : {},
      }
    })
    return {
      kind: 'group' as const,
      id: group.id,
      name: group.name,
      color: hashAvatarColor(group.id),
      preview: rowPreview(undefined, last[group.id]),
      unread: 0,
      muted: false,
      hidden: false,
      pinned: false,
      updatedAt: group.createdAt,
      sessionCount: 0,
      protected: false,
      memberIds: group.memberIds,
      members,
      pending: false,
      ...group.section !== undefined ? { section: group.section } : {},
      ...group.order !== undefined ? { order: group.order } : {},
    }
  })
  return [...botRows, ...groupRows]
}

export function groupRosterRows(
  rows: readonly RosterRowModel[],
  sections: readonly RosterSection[] = DEFAULT_ROSTER_SECTIONS,
): { visible: { section: RosterSection; items: RosterRowModel[] }[]; hidden: RosterRowModel[] } {
  return groupRosterItems(rows, sections)
}

export function filterRosterRows(rows: readonly RosterRowModel[], query: string): RosterRowModel[] {
  const q = query.trim().toLowerCase()
  if (q === '') return [...rows]
  return rows.filter(row => row.name.toLowerCase().includes(q) || row.preview.toLowerCase().includes(q))
}

export const ROSTER_FOLDED_KEY = 'dsh-bot:roster-folded'
export const LAST_BOT_KEY = 'dsh-bot:last-bot'

export function readFoldedSections(): Set<string> {
  try {
    const raw = localStorage.getItem(ROSTER_FOLDED_KEY)
    if (raw === null || raw.trim() === '') return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((item): item is string => typeof item === 'string'))
  } catch {
    return new Set()
  }
}

export function writeFoldedSections(ids: ReadonlySet<string>): void {
  try {
    localStorage.setItem(ROSTER_FOLDED_KEY, JSON.stringify([...ids]))
  } catch {
    // private mode
  }
}

export function readLastBot(): string | null {
  try {
    const value = localStorage.getItem(LAST_BOT_KEY)
    return value !== null && value.trim() !== '' ? value : null
  } catch {
    return null
  }
}

export function writeLastBot(botId: string): void {
  if (botId.trim() === '') return
  try {
    localStorage.setItem(LAST_BOT_KEY, botId)
  } catch {
    // private mode
  }
}
