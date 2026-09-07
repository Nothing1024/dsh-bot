import { describe, expect, it } from 'vitest'
import type { WorkbenchHistoryItem } from '../src/api.ts'
import { mergeLiveItems } from '../src/useBotEvents.ts'

const user: WorkbenchHistoryItem = { id: 'u1', kind: 'message', seq: 1, role: 'user', text: 'hi' }
const assistant: WorkbenchHistoryItem = { id: 'a1', kind: 'message', seq: 2, role: 'assistant', text: 'old' }

describe('mergeLiveItems', () => {
  it('appends a streaming assistant bubble when none exists', () => {
    const next = mergeLiveItems([user], 's1', { sessionId: 's1', text: 'hello' }, [])
    expect(next.at(-1)).toMatchObject({ role: 'assistant', text: 'hello', streaming: true })
  })

  it('updates the last assistant bubble for the current session only', () => {
    const next = mergeLiveItems([user, assistant], 's1', { sessionId: 's1', text: 'new' }, [])
    expect(next[1]).toMatchObject({ id: 'a1', text: 'new', streaming: true })
    const other = mergeLiveItems([user, assistant], 's1', { sessionId: 's2', text: 'leak' }, [])
    expect(other[1]?.text).toBe('old')
  })

  it('merges approval cards for the current session', () => {
    const card: WorkbenchHistoryItem = {
      id: 'ap-1',
      kind: 'approval',
      seq: 9,
      sessionId: 's1',
      pending: true,
      text: 'allow?',
    }
    const next = mergeLiveItems([user], 's1', null, [card])
    expect(next.some(item => item.id === 'ap-1')).toBe(true)
    const other = mergeLiveItems([user], 's2', null, [card])
    expect(other.some(item => item.id === 'ap-1')).toBe(false)
  })

  it('returns the same array when nothing live applies', () => {
    const items = [user, assistant]
    expect(mergeLiveItems(items, 's1', null, [])).toBe(items)
    expect(mergeLiveItems(items, 's1', { sessionId: 's2', text: 'leak' }, [])).toBe(items)
  })
})
