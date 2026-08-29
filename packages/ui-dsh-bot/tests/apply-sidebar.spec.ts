/**
 * Sidebar contract: betterSidebar is never a hard inject (BR-008).
 */
import { describe, expect, it } from 'vitest'
import { inject } from '../src/client/inject.ts'
import { DSH_BOT_SESSIONS_TAB_ID } from '../src/client/tab-id.ts'

describe('ui-dsh-bot inject contract', () => {
  it('does not hard-depend on betterSidebar', () => {
    expect([...inject]).toEqual(['sessions', 'locale'])
    expect(inject).not.toContain('betterSidebar')
  })

  it('exports the stable sessions tab id', () => {
    expect(DSH_BOT_SESSIONS_TAB_ID).toBe('dsh-bot:sessions')
  })
})
