// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  LAST_SESSION_KEY_PREFIX,
  defaultGroupRoomTitle,
  firstUserRoomTitle,
  groupRoomDisplayTitle,
  LAST_OWNER_KEY,
  readLastOwner,
  writeLastOwner,
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

describe('defaultGroupRoomTitle', () => {
  it('stamps group name and local clock without a room-id slug', () => {
    expect(defaultGroupRoomTitle('编辑室', Date.UTC(2026, 8, 21, 6, 4))).toMatch(/^编辑室 · \d+\/\d+ \d{2}:\d{2}$/)
    expect(defaultGroupRoomTitle('编辑室', Date.UTC(2026, 8, 21, 6, 4))).not.toMatch(/房间 /)
  })

  it('falls back to 小组 when the name is blank', () => {
    expect(defaultGroupRoomTitle('  ', 1_700_000_000_000)).toMatch(/^小组 · /)
  })
})

describe('firstUserRoomTitle', () => {
  it('takes the first line and caps at 20 characters', () => {
    expect(firstUserRoomTitle('  你们是谁?\n第二行  ')).toBe('你们是谁?')
    expect(firstUserRoomTitle('一二三四五六七八九十一二三四五六七八九十超出')).toBe('一二三四五六七八九十一二三四五六七八九十…')
    expect(firstUserRoomTitle('   \n')).toBeUndefined()
  })
})

describe('groupRoomDisplayTitle', () => {
  it('keeps a stored title and otherwise stamps the group clock', () => {
    expect(groupRoomDisplayTitle('选题讨论', '编辑室', 1)).toBe('选题讨论')
    expect(groupRoomDisplayTitle('  ', '编辑室', 1_700_000_000_000)).toMatch(/^编辑室 · /)
    expect(groupRoomDisplayTitle(undefined, '编辑室', 1_700_000_000_000)).not.toMatch(/房间 /)
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
    vi.unstubAllGlobals()
    localStorage.clear()
    sessionStorage.clear()
  })

  it('uses the shared selection as the initial choice of a fresh tab', () => {
    localStorage.setItem(LAST_OWNER_KEY, 'editors')
    localStorage.setItem(`${LAST_SESSION_KEY_PREFIX}editors`, 'room-old')
    expect(readLastOwner()).toBe('editors')
    expect(readLastSession('editors')).toBe('room-old')
  })

  it('remembers this tab when shared storage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
    })
    writeLastOwner('editors')
    writeLastSession('editors', 'room-old')
    expect(readLastOwner()).toBe('editors')
    expect(readLastSession('editors')).toBe('room-old')
  })

  it('falls back to shared storage when tab storage is unavailable', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
    })
    writeLastOwner('editors')
    writeLastSession('editors', 'room-old')
    expect(readLastOwner()).toBe('editors')
    expect(readLastSession('editors')).toBe('room-old')
  })

  it('round-trips the last session id per identity', () => {
    expect(readLastSession('shiren-xiaobei')).toBe(null)
    writeLastSession('shiren-xiaobei', 's-old')
    expect(localStorage.getItem(`${LAST_SESSION_KEY_PREFIX}shiren-xiaobei`)).toBe('s-old')
    expect(readLastSession('shiren-xiaobei')).toBe('s-old')
    expect(readLastSession('dsh-bot')).toBe(null)
  })
})
