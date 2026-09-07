// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkbenchBot } from 'dsh-bot-shared'
import { BotRoster } from '../src/client/BotRoster.tsx'

const reviewer: WorkbenchBot = {
  id: 'reviewer',
  name: '代码审查官',
  avatar: { color: '#5b8def' },
  presetId: 'dsh-bot--reviewer',
  createdAt: 1,
  persona: '审',
  protected: false,
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('roster hover preview', () => {
  it('shows after 400ms and hides 120ms after leave', () => {
    render(<BotRoster bots={[reviewer]} />)
    fireEvent.mouseEnter(screen.getByTestId('dsh-bot-row-reviewer'))
    expect(screen.queryByTestId('dsh-bot-preview-reviewer')).toBeNull()
    act(() => { vi.advanceTimersByTime(399) })
    expect(screen.queryByTestId('dsh-bot-preview-reviewer')).toBeNull()
    act(() => { vi.advanceTimersByTime(1) })
    expect(screen.getByTestId('dsh-bot-preview-reviewer')).toBeTruthy()
    fireEvent.mouseLeave(screen.getByTestId('dsh-bot-row-reviewer'))
    act(() => { vi.advanceTimersByTime(119) })
    expect(screen.getByTestId('dsh-bot-preview-reviewer')).toBeTruthy()
    act(() => { vi.advanceTimersByTime(1) })
    expect(screen.queryByTestId('dsh-bot-preview-reviewer')).toBeNull()
  })

  it('does not open on the rail', () => {
    render(<BotRoster wide={false} bots={[reviewer]} />)
    fireEvent.mouseEnter(screen.getByTestId('dsh-bot-rail-reviewer'))
    act(() => { vi.advanceTimersByTime(500) })
    expect(screen.queryByTestId('dsh-bot-preview-reviewer')).toBeNull()
  })

  it('closes the card when the menu opens', () => {
    render(<BotRoster bots={[reviewer]} />)
    fireEvent.mouseEnter(screen.getByTestId('dsh-bot-row-reviewer'))
    act(() => { vi.advanceTimersByTime(400) })
    expect(screen.getByTestId('dsh-bot-preview-reviewer')).toBeTruthy()
    fireEvent.click(screen.getByTestId('dsh-bot-menu-btn-reviewer'))
    expect(screen.queryByTestId('dsh-bot-preview-reviewer')).toBeNull()
  })
})
