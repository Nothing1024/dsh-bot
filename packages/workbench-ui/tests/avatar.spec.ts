import { describe, expect, it } from 'vitest'
import { AVATAR_COLORS, hashAvatarColor, nameInitial, relativeTime, rowPreview } from '../src/avatar.ts'

describe('avatar helpers', () => {
  it('hashes a botId onto the 8-color board deterministically', () => {
    const color = hashAvatarColor('dsh-bot')
    expect(AVATAR_COLORS).toContain(color)
    expect(hashAvatarColor('dsh-bot')).toBe(color)
    expect(hashAvatarColor('shiren-xiaobei')).not.toBe(color)
  })

  it('uses the first character as the fallback glyph', () => {
    expect(nameInitial('诗人小北')).toBe('诗')
    expect(nameInitial('  ')).toBe('?')
  })

  it('prefers draft over lastMessage', () => {
    expect(rowPreview('  草稿  ', '旧消息')).toBe('草稿')
    expect(rowPreview('   ', '旧消息')).toBe('旧消息')
    expect(rowPreview(undefined, undefined)).toBe('')
  })

  it('formats relative time as now/Nm/Nh/Nd', () => {
    const now = 1_700_000_000_000
    expect(relativeTime(now - 10_000, now)).toBe('now')
    expect(relativeTime(now - 3 * 60_000, now)).toBe('3m')
    expect(relativeTime(now - 5 * 60 * 60_000, now)).toBe('5h')
    expect(relativeTime(now - 2 * 24 * 60 * 60_000, now)).toBe('2d')
  })
})
