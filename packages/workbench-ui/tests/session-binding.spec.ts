// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import {
  LAST_SESSION_KEY_PREFIX,
  nestedSessionSlice,
  pickBoundSession,
  readLastSession,
  sessionDisplayTitle,
  writeLastSession,
} from '../src/session-binding.ts'

describe('sessionDisplayTitle', () => {
  it('collapses the bot name, blanks, and New Session into 新对话', () => {
    expect(sessionDisplayTitle(undefined, '诗人小北')).toBe('新对话')
    expect(sessionDisplayTitle('', '诗人小北')).toBe('新对话')
    expect(sessionDisplayTitle('诗人小北', '诗人小北')).toBe('新对话')
    expect(sessionDisplayTitle('New Session', '诗人小北')).toBe('新对话')
    expect(sessionDisplayTitle('~诗人小北', '诗人小北')).toBe('新对话')
  })

  it('keeps a real first-prompt title and marks hidden threads', () => {
    expect(sessionDisplayTitle('论诗与酒', '诗人小北')).toBe('论诗与酒')
    expect(sessionDisplayTitle('~dsh-bot: q', 'DSH Bot', { hidden: true })).toBe('~ dsh-bot: q')
  })
})

describe('pickBoundSession', () => {
  it('prefers an explicit id, then the remembered thread, then newest', () => {
    expect(pickBoundSession(['a', 'b'], 'b', 'a')).toBe('b')
    expect(pickBoundSession(['a', 'b'], null, 'a')).toBe('a')
    expect(pickBoundSession(['a', 'b'], 'missing', 'a')).toBe('a')
    expect(pickBoundSession(['a', 'b'], null, 'gone')).toBe('a')
    expect(pickBoundSession([], 'a', 'a')).toBe(null)
  })
})

describe('nestedSessionSlice', () => {
  it('keeps the open thread visible when it falls outside the newest window', () => {
    const rows = Array.from({ length: 10 }, (_, index) => ({
      sessionId: `s-${index}`,
      selected: index === 9,
    }))
    const sliced = nestedSessionSlice(rows, 3)
    expect(sliced.visible.map(row => row.sessionId)).toEqual(['s-9', 's-0', 's-1'])
    expect(sliced.hiddenCount).toBe(7)
  })
})

describe('last session storage', () => {
  afterEach(() => {
    localStorage.clear()
  })

  it('round-trips the last session id per identity', () => {
    expect(readLastSession('shiren-xiaobei')).toBe(null)
    writeLastSession('shiren-xiaobei', 's-old')
    expect(localStorage.getItem(`${LAST_SESSION_KEY_PREFIX}shiren-xiaobei`)).toBe('s-old')
    expect(readLastSession('shiren-xiaobei')).toBe('s-old')
    expect(readLastSession('dsh-bot')).toBe(null)
  })
})
