// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkbenchBot } from 'dsh-bot-shared'
import { BotRoster, previewAnchorFor } from '../src/client/BotRoster.tsx'

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

describe('previewAnchorFor (UF-610 portal anchor)', () => {
  it('places the card right of the row and flips near the viewport bottom', () => {
    const innerHeight = window.innerHeight
    const rect = (top: number, bottom: number): Element => ({
      getBoundingClientRect: () => ({ top, bottom, left: 0, right: 224, width: 224, height: bottom - top }),
    }) as unknown as Element
    const normal = previewAnchorFor(rect(100, 152))
    expect(normal).toEqual({ top: 100, left: 232, flip: false })
    const low = previewAnchorFor(rect(innerHeight - 20, innerHeight + 32))
    expect(low?.flip).toBe(true)
    expect((low?.top ?? 0) + 72).toBeLessThanOrEqual(innerHeight + 32)
    expect(previewAnchorFor(null)).toBeNull()
  })
})
