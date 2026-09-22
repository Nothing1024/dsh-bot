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

  it('does not broadcast an unmatched mention', () => {
    const parsed = parseMentions('@幽灵 你好', members)
    expect(parsed.unmatched).toBe(true)
    expect(parsed.responderIds).toEqual([])
  })

  it('matches names containing spaces and punctuation boundaries', () => {
    expect(parseMentions('@DSH Bot 请回答', members).responderIds).toEqual(['dsh-bot'])
    expect(parseMentions('@诗人小北，作一句诗', members).responderIds).toEqual(['shiren-xiaobei'])
  })

  it('rejects partial names, mixed invalid handles, and ambiguous names', () => {
    expect(parseMentions('@DSH Botany 你好', members).unmatched).toBe(true)
    expect(parseMentions('@诗人小北 @幽灵 你好', members).unmatched).toBe(true)
    const duplicates = [{ id: 'a', name: 'Alex' }, { id: 'b', name: 'Alex' }]
    expect(parseMentions('@Alex 你好', duplicates).responderIds).toEqual([])
    expect(parseMentions('@b 你好', duplicates).responderIds).toEqual(['b'])
  })

  it('does not interpret an email address as a recipient', () => {
    expect(parseMentions('请核对 user@example.com', members).unmatched).toBe(false)
  })
})

describe('mentionQuery', () => {
  it('finds an open @ token at the caret', () => {
    expect(mentionQuery('你好 @诗', 5)).toEqual({ start: 3, query: '诗' })
  })
})
