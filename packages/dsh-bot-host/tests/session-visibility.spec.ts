import { describe, expect, it, vi } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import { hideBotSession } from '../src/session-visibility.ts'

describe('hideBotSession', () => {
  it('archives delegated sessions by default', async () => {
    const hide = vi.fn(async () => ({ hasHiddenMark: true, archived: false, isHidden: true }))
    const archiveSession = vi.fn(async () => undefined)
    await hideBotSession(
      { hide } as never,
      { archiveSession },
      'session-ask',
    )
    expect(hide).toHaveBeenCalledWith({ kind: 'cli' }, SessionId('session-ask'), { syncToArchived: true })
    expect(archiveSession).toHaveBeenCalledWith('session-ask')
  })

  it('does not archive a workbench 1:1 chat', async () => {
    const hide = vi.fn(async () => ({ hasHiddenMark: true, archived: false, isHidden: true }))
    const archiveSession = vi.fn(async () => undefined)
    await hideBotSession(
      { hide } as never,
      { archiveSession },
      'session-chat',
      { kind: 'cli' },
      { syncToArchived: false },
    )
    expect(hide).toHaveBeenCalledWith({ kind: 'cli' }, SessionId('session-chat'), { syncToArchived: false })
    expect(archiveSession).not.toHaveBeenCalled()
  })
})
