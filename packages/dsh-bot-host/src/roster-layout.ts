/**
 * Roster layout defaults + roster.json section titles (BR-031/032/034).
 * @module dsh-bot-host/roster-layout
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export const DEFAULT_SECTIONS = [
  { id: 'pinned', name: '置顶', order: 0 },
  { id: 'work', name: '工作', order: 1 },
  { id: 'life', name: '生活', order: 2 },
] as const

export interface RosterSection {
  readonly id: string
  readonly name: string
  readonly order: number
}

export interface BotLayout {
  readonly pinned: boolean
  readonly section: string
  readonly hidden: boolean
  readonly order: number
  readonly muted: boolean
}

export interface GroupLayout {
  readonly section: string
  readonly order: number
}

export function botLayoutFrom(rec: Record<string, unknown>, createdAt: number): BotLayout {
  const section = typeof rec.section === 'string' && rec.section.trim() !== '' ? rec.section.trim() : 'work'
  const order = typeof rec.order === 'number' && Number.isFinite(rec.order) ? rec.order : createdAt
  return {
    pinned: rec.pinned === true,
    section,
    hidden: rec.hidden === true,
    order,
    muted: rec.muted === true,
  }
}

export function groupLayoutFrom(rec: Record<string, unknown>, createdAt: number): GroupLayout {
  const section = typeof rec.section === 'string' && rec.section.trim() !== '' ? rec.section.trim() : 'work'
  const order = typeof rec.order === 'number' && Number.isFinite(rec.order) ? rec.order : createdAt
  return { section, order }
}

export function rosterPath(home: string): string {
  return join(home, 'dsh-bot', 'roster.json')
}

export async function readRosterSections(home: string): Promise<RosterSection[]> {
  const file = rosterPath(home)
  if (!existsSync(file)) return DEFAULT_SECTIONS.map(row => ({ ...row }))
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8')) as { sections?: unknown }
    if (!Array.isArray(parsed.sections)) return DEFAULT_SECTIONS.map(row => ({ ...row }))
    const rows: RosterSection[] = []
    for (const item of parsed.sections) {
      if (typeof item !== 'object' || item === null) continue
      const rec = item as Record<string, unknown>
      const id = typeof rec.id === 'string' ? rec.id.trim() : ''
      const name = typeof rec.name === 'string' ? rec.name.trim() : ''
      const order = typeof rec.order === 'number' && Number.isFinite(rec.order) ? rec.order : rows.length
      if (id === '' || name === '') continue
      rows.push({ id, name, order })
    }
    return rows.length === 0 ? DEFAULT_SECTIONS.map(row => ({ ...row })) : rows
  } catch {
    return DEFAULT_SECTIONS.map(row => ({ ...row }))
  }
}

export async function writeRosterSections(home: string, sections: readonly RosterSection[]): Promise<void> {
  const file = rosterPath(home)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify({ version: 1, sections }, null, 2)}\n`, 'utf8')
}
