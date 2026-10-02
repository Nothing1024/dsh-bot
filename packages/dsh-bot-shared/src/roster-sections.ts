import type { RosterSection } from './types.ts'

export type { RosterSection } from './types.ts'

export const DEFAULT_ROSTER_SECTIONS: readonly RosterSection[] = [
  { id: 'pinned', name: '置顶', order: 0 },
  { id: 'default', name: '全部', order: 1 },
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
  return ''
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
        .filter(item => {
          const sec = sectionOf(item)
          if (section.id === 'default') return sec === '' || (sec !== 'pinned' && !sections.some(s => s.id === sec))
          return sec === section.id
        })
        .sort((a, b) => (a.order ?? a.updatedAt) - (b.order ?? b.updatedAt)),
    }))
  return { visible, hidden }
}
