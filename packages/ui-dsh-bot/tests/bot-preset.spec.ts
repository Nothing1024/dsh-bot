import { describe, expect, it } from 'vitest'
import { pickLatestBotSession } from '../src/client/bot-preset.ts'

const byId = {
  a: { id: 'a', agentPreset: 'dsh-bot--poet', updatedAt: 10 },
  b: { id: 'b', agentPreset: 'dsh-bot--poet', updatedAt: 30 },
  c: { id: 'c', agentPreset: 'dsh-bot', updatedAt: 20 },
  d: { id: 'd', agentPreset: 'standard', updatedAt: 40 },
  e: { id: 'e', agentPreset: 'dsh-bot--poet-2', updatedAt: 50 },
}

describe('pickLatestBotSession', () => {
  it('returns the newest leftover exact-preset session', () => {
    expect(pickLatestBotSession('dsh-bot--poet', byId)).toEqual({ sessionId: 'b', updatedAt: 30 })
    expect(pickLatestBotSession('standard', byId)).toBeUndefined()
  })
})
