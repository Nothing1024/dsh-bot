import type { RosterSection } from './types.ts'

export type { RosterSection } from './types.ts'

export const DEFAULT_ROSTER_SECTIONS: readonly RosterSection[] = [
  { id: 'pinned', name: '置顶', order: 0 },
  { id: 'work', name: '工作', order: 1 },
  { id: 'life', name: '生活', order: 2 },
]

export interface Layoutish {
  readonly id: string
  readonly pinned?: boolean
  readonly section?: string
  readonly hidden?: boolean
  readonly order?: number
  readonly updatedAt: number
}

export function sectionOf(item: Layoutish): string {
  if (item.pinned === true) return 'pinned'
  const section = item.section?.trim()
  return section === undefined || section === '' ? 'work' : section
}

export function groupRosterItems<T extends Layoutish>(
  items: readonly T[],
  sections: readonly RosterSection[] = DEFAULT_ROSTER_SECTIONS,
): { visible: { section: RosterSection; items: T[] }[]; hidden: T[] } {
  const hidden = items.filter(item => item.hidden === true)
  const vis = items.filter(item => item.hidden !== true)
  const visible = [...sections]
    .sort((a, b) => a.order - b.order)
    .map(section => ({
      section,
      items: vis
        .filter(item => sectionOf(item) === section.id)
        .sort((a, b) => (a.order ?? a.updatedAt) - (b.order ?? b.updatedAt)),
    }))
  return { visible, hidden }
}
