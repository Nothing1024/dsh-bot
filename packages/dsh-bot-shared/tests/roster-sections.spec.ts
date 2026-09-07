import { describe, expect, it } from 'vitest'
import { DEFAULT_ROSTER_SECTIONS, groupRosterItems } from '../src/roster-sections.ts'

describe('groupRosterItems', () => {
  it('defaults missing section to work and splits hidden', () => {
    const grouped = groupRosterItems([
      { id: 'a', updatedAt: 2, pinned: true },
      { id: 'b', updatedAt: 1 },
      { id: 'c', updatedAt: 3, section: 'life', hidden: true },
    ])
    expect(grouped.visible.map(row => row.section.id)).toEqual(DEFAULT_ROSTER_SECTIONS.map(row => row.id))
    expect(grouped.visible[0]?.items.map(row => row.id)).toEqual(['a'])
    expect(grouped.visible[1]?.items.map(row => row.id)).toEqual(['b'])
    expect(grouped.hidden.map(row => row.id)).toEqual(['c'])
  })
})
