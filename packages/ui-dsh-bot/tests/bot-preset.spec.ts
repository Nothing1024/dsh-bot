import { describe, expect, it } from 'vitest'
import { countBotSessions, pickLatestBotSession } from '../src/client/bot-preset.ts'

const byId = {
  a: { id: 'a', agentPreset: 'dsh-bot--poet', updatedAt: 10 },
  b: { id: 'b', agentPreset: 'dsh-bot--poet', updatedAt: 30 },
  c: { id: 'c', agentPreset: 'dsh-bot', updatedAt: 20 },
  d: { id: 'd', agentPreset: 'standard', updatedAt: 40 },
  e: { id: 'e', agentPreset: 'dsh-bot--poet-2', updatedAt: 50 },
}

describe('countBotSessions (BR-604 会话数 on path B)', () => {
  it('counts only sessions whose preset equals the bot preset', () => {
    expect(countBotSessions('dsh-bot--poet', byId)).toBe(2)
    expect(countBotSessions('dsh-bot', byId)).toBe(1)
    expect(countBotSessions('dsh-bot--poet-2', byId)).toBe(1)
  })

  it('is 0 for non-bot presets, unknown bots, or no list', () => {
    expect(countBotSessions('standard', byId)).toBe(0)
    expect(countBotSessions('dsh-bot--nobody', byId)).toBe(0)
    expect(countBotSessions('dsh-bot--poet', undefined)).toBe(0)
  })
})

describe('pickLatestBotSession', () => {
  it('returns the newest exact-preset session', () => {
    expect(pickLatestBotSession('dsh-bot--poet', byId)).toEqual({ sessionId: 'b', updatedAt: 30 })
    expect(pickLatestBotSession('standard', byId)).toBeUndefined()
  })
})
