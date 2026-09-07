// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorkbenchBot } from 'dsh-bot-shared'
import { BotRoster } from '../src/client/BotRoster.tsx'
import { firstVisibleId, layoutInputForAction, patchBots, runMenuAction } from '../src/client/menu-action.ts'
import { observable } from '../src/client/observable.ts'
import type { RosterRpc } from '../src/client/roster-rpc.ts'

const reviewer: WorkbenchBot = {
  id: 'reviewer',
  name: '代码审查官',
  avatar: { color: '#5b8def' },
  presetId: 'dsh-bot--reviewer',
  createdAt: 1,
  persona: '审',
  protected: false,
  section: 'work',
  unread: 2,
}

const poet: WorkbenchBot = {
  id: 'poet',
  name: '诗人小北',
  avatar: { color: '#d4537e' },
  presetId: 'dsh-bot--poet',
  createdAt: 2,
  persona: '诗',
  protected: false,
}

afterEach(() => {
  cleanup()
})

describe('roster menu', () => {
  it('emits pin / move / read / hide / mute actions', () => {
    const onMenuAction = vi.fn()
    render(<BotRoster bots={[reviewer]} onMenuAction={onMenuAction} />)
    fireEvent.click(screen.getByTestId('dsh-bot-menu-btn-reviewer'))
    fireEvent.click(screen.getByTestId('dsh-bot-menu-pin'))
    expect(onMenuAction).toHaveBeenCalledWith('pin', expect.objectContaining({ id: 'reviewer' }))
    expect(layoutInputForAction('move-work', 'reviewer')).toEqual({ bots: [{ id: 'reviewer', section: 'work', pinned: false }] })
    expect(layoutInputForAction('hide', 'reviewer')).toEqual({ bots: [{ id: 'reviewer', hidden: true }] })
    expect(patchBots([reviewer], 'mute', 'reviewer')[0]?.muted).toBe(true)
  })

  it('rolls back after a failed updateBotLayout', async () => {
    const bots = observable({ status: 'idle' as const, error: null, items: [reviewer] })
    const updateBotLayout = vi.fn(async () => ({ ok: false as const, error: { message: 'disk full' } }))
    const refresh = vi.fn(async () => {
      bots.set({ status: 'idle', error: null, items: [reviewer] })
    })
    const roster = {
      bots,
      refresh,
      updateBotLayout,
      markRead: vi.fn(),
    } as unknown as RosterRpc
    const result = await runMenuAction({ action: 'pin', id: 'reviewer', roster })
    expect(result.ok).toBe(false)
    expect(refresh).toHaveBeenCalled()
    expect(firstVisibleId([{ ...reviewer, hidden: true }, poet], [], 'reviewer')).toBe('poet')
  })

  it('closes on Escape', () => {
    render(<BotRoster bots={[reviewer]} />)
    fireEvent.click(screen.getByTestId('dsh-bot-menu-btn-reviewer'))
    expect(screen.getByTestId('dsh-bot-menu-reviewer')).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByTestId('dsh-bot-menu-reviewer')).toBeNull()
  })

  it('hides delete on a protected bot', () => {
    render(<BotRoster bots={[{ ...reviewer, protected: true }]} />)
    fireEvent.click(screen.getByTestId('dsh-bot-menu-btn-reviewer'))
    expect(screen.queryByTestId('dsh-bot-menu-delete')).toBeNull()
    expect(screen.getByTestId('dsh-bot-menu-edit')).toBeTruthy()
  })
})
