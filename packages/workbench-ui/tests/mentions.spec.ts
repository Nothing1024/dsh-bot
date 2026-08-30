import { describe, expect, it } from 'vitest'
import { mentionQuery, parseMentions } from '../src/mentions.ts'

const members = [
  { id: 'shiren-xiaobei', name: '诗人小北' },
  { id: 'dsh-bot', name: 'DSH Bot' },
]

describe('parseMentions', () => {
  it('matches @诗人小北', () => {
    expect(parseMentions('@诗人小北 作一句诗', members).responderIds).toEqual(['shiren-xiaobei'])
  })

  it('falls back to everyone when unmatched', () => {
    const parsed = parseMentions('@幽灵 你好', members)
    expect(parsed.unmatched).toBe(true)
    expect(parsed.responderIds).toEqual(['shiren-xiaobei', 'dsh-bot'])
  })
})

describe('mentionQuery', () => {
  it('finds an open @ token at the caret', () => {
    expect(mentionQuery('你好 @诗', 5)).toEqual({ start: 3, query: '诗' })
  })
})
