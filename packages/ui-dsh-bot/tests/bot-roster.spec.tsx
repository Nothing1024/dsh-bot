// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { BotRoster } from '../src/client/BotRoster.tsx'
import type { WorkbenchBot, WorkbenchGroup } from 'dsh-bot-shared'

const reviewer: WorkbenchBot = {
  id: 'reviewer',
  name: '代码审查官',
  avatar: { color: '#5b8def' },
  presetId: 'dsh-bot--reviewer',
  createdAt: 2,
  persona: '审',
  protected: false,
  section: 'work',
  unread: 1,
}

const poet: WorkbenchBot = {
  id: 'poet',
  name: '诗人小北',
  avatar: { color: '#d4537e', emoji: '北' },
  presetId: 'dsh-bot--poet',
  createdAt: 1,
  persona: '诗',
  protected: false,
  pinned: true,
}

const hidden: WorkbenchBot = {
  id: 'old',
  name: '旧助手',
  avatar: { color: '#3db88a' },
  presetId: 'dsh-bot--old',
  createdAt: 3,
  persona: '旧',
  protected: false,
  hidden: true,
  section: 'life',
}

const room: WorkbenchGroup = {
  id: 'editors',
  name: '编辑室',
  memberIds: ['reviewer', 'poet'],
  createdAt: 4,
  section: 'work',
}

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('BotRoster', () => {
  it('renders pinned / work / life and keeps hidden in the footer bucket', () => {
    render(<BotRoster bots={[reviewer, poet, hidden]} groups={[room]} />)
    const pinned = screen.getByTestId('dsh-bot-section-pinned')
    const work = screen.getByTestId('dsh-bot-section-work')
    expect(pinned.textContent).toMatch(/诗人小北/)
    expect(work.textContent).toMatch(/代码审查官/)
    expect(work.textContent).toMatch(/编辑室/)
    expect(screen.queryByTestId('dsh-bot-row-old')).toBeNull()
    expect(screen.getByTestId('dsh-bot-hidden').textContent).toMatch(/已隐藏 1/)
    fireEvent.click(screen.getByText(/已隐藏 1/))
    expect(screen.getByTestId('dsh-bot-row-old')).toBeTruthy()
  })

  it('filters by name and preview', () => {
    render(
      <BotRoster
        bots={[reviewer, poet]}
        lastMessages={{ reviewer: 'PR #142', poet: '春夜' }}
      />,
    )
    fireEvent.change(screen.getByTestId('dsh-bot-roster-search'), { target: { value: '审' } })
    expect(screen.getByTestId('dsh-bot-row-reviewer')).toBeTruthy()
    expect(screen.queryByTestId('dsh-bot-row-poet')).toBeNull()
    fireEvent.change(screen.getByTestId('dsh-bot-roster-search'), { target: { value: '春' } })
    expect(screen.getByTestId('dsh-bot-row-poet')).toBeTruthy()
    expect(screen.queryByTestId('dsh-bot-row-reviewer')).toBeNull()
  })

  it('rail mode only paints visible bot avatars', () => {
    render(<BotRoster wide={false} bots={[reviewer, hidden]} groups={[room]} />)
    expect(screen.getByTestId('dsh-bot-rail')).toBeTruthy()
    expect(screen.getByTestId('dsh-bot-rail-reviewer')).toBeTruthy()
    expect(screen.queryByTestId('dsh-bot-rail-old')).toBeNull()
    expect(screen.queryByTestId('dsh-bot-row-reviewer')).toBeNull()
    expect(screen.queryByTestId('dsh-bot-seg')).toBeNull()
  })

  it('shows a red @ badge when the bot is pending', () => {
    render(<BotRoster bots={[reviewer]} pendingBotIds={new Set(['reviewer'])} />)
    expect(screen.getByTestId('dsh-bot-badge-reviewer').textContent).toBe('@')
  })
})
