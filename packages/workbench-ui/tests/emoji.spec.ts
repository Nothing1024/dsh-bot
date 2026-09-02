import { describe, expect, it } from 'vitest'
import { emojiQuery, filterEmoji } from '../src/emoji.ts'

describe('emojiQuery', () => {
  it('opens on a leading colon token', () => {
    expect(emojiQuery(':sm', 3)).toEqual({ start: 0, query: 'sm' })
  })

  it('opens after whitespace and ignores URLs', () => {
    expect(emojiQuery('hi :sm', 6)).toEqual({ start: 3, query: 'sm' })
    expect(emojiQuery('http://x', 7)).toBeNull()
    expect(emojiQuery('http:', 5)).toBeNull()
  })
})

describe('filterEmoji', () => {
  it('matches id and aliases', () => {
    const rows = filterEmoji('smile')
    expect(rows.some(row => row.glyph === '😀')).toBe(true)
    expect(filterEmoji('no-such-emoji')).toEqual([])
  })
})
