import { describe, expect, it } from 'vitest'
import { mentionQuery, parseMentions, resolveResponders } from '../src/mentions.ts'

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

describe('resolveResponders', () => {
  it('answers with only the quoted member when there is no @', () => {
    expect(resolveResponders('这句改短一点', members, 'shiren-xiaobei').responderIds).toEqual(['shiren-xiaobei'])
  })

  it('lets an explicit @ override the quoted member', () => {
    expect(resolveResponders('@DSH Bot 你来改', members, 'shiren-xiaobei').responderIds).toEqual(['dsh-bot'])
  })

  it('keeps @all as everyone even with a quote', () => {
    expect(resolveResponders('@all 都看看', members, 'shiren-xiaobei').responderIds).toEqual(['shiren-xiaobei', 'dsh-bot'])
  })

  it('falls back to everyone when quoting yourself or a member who left', () => {
    expect(resolveResponders('再想想', members).responderIds).toEqual(['shiren-xiaobei', 'dsh-bot'])
    expect(resolveResponders('再想想', members, 'gone').responderIds).toEqual(['shiren-xiaobei', 'dsh-bot'])
  })

  it('still rejects an unmatched mention with a quote', () => {
    const parsed = resolveResponders('@幽灵 你好', members, 'shiren-xiaobei')
    expect(parsed.unmatched).toBe(true)
    expect(parsed.responderIds).toEqual([])
  })
})

describe('mentionQuery', () => {
  it('finds an open @ token at the caret', () => {
    expect(mentionQuery('你好 @诗', 5)).toEqual({ start: 3, query: '诗' })
  })
})
