// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionList } from '../src/SessionList.tsx'
import type { SessionChoice } from '../src/SessionList.tsx'
import { JUMP_ACK_MS, resetJumpInFlight } from '../src/jump.ts'

const NOW = 1_700_000_000_000

function row(overrides: Partial<SessionChoice> = {}): SessionChoice {
  return {
    sessionId: 's-visible',
    title: '可见会话',
    updatedAt: NOW,
    working: false,
    hidden: false,
    selected: true,
    ...overrides,
  }
}

describe('SessionList jump menu', () => {
  afterEach(() => {
    cleanup()
    resetJumpInFlight()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    Object.defineProperty(window, 'parent', { configurable: true, value: window })
  })

  it('renders the row menu and keeps row click for select', () => {
    const onSelect = vi.fn()
    render(
      <SessionList
        items={[row(), row({ sessionId: 's-hidden', title: '隐藏会话', hidden: true, selected: false })]}
        nowMs={NOW}
        onSelect={onSelect}
      />,
    )
    expect(screen.getByTestId('session-menu-s-visible')).toBeTruthy()
    expect(screen.getByTestId('session-menu-s-hidden')).toBeTruthy()
    fireEvent.click(screen.getByTestId('session-menu-s-hidden'))
    const jump = screen.getByTestId('session-jump-s-hidden')
    expect(jump.textContent).toBe('复制会话 ID')
    expect(jump.getAttribute('title')).toBe('在右栏页签内可直接跳转')
    expect(onSelect).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('session-option-s-hidden'))
    expect(onSelect).toHaveBeenCalledWith('s-hidden')
  })

  it('copies the session id when standalone', async () => {
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    const onToast = vi.fn()
    render(<SessionList items={[row()]} nowMs={NOW} onSelect={vi.fn()} onToast={onToast} />)
    fireEvent.click(screen.getByTestId('session-menu-s-visible'))
    fireEvent.click(screen.getByTestId('session-jump-s-visible'))
    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('s-visible')
      expect(onToast).toHaveBeenCalledWith('已复制会话 ID')
    })
  })

  it('shows 在 DSH 打开 in-tab and toasts on ack timeout', async () => {
    vi.useFakeTimers()
    const parent = { postMessage: vi.fn() }
    Object.defineProperty(window, 'parent', { configurable: true, value: parent })
    const onToast = vi.fn()
    render(<SessionList items={[row()]} nowMs={NOW} onSelect={vi.fn()} onToast={onToast} />)
    fireEvent.click(screen.getByTestId('session-menu-s-visible'))
    expect(screen.getByTestId('session-jump-s-visible').textContent).toBe('在 DSH 打开')
    fireEvent.click(screen.getByTestId('session-jump-s-visible'))
    await vi.advanceTimersByTimeAsync(JUMP_ACK_MS)
    await vi.waitFor(() => {
      expect(onToast).toHaveBeenCalledWith('跳转超时')
    })
    expect(parent.postMessage).toHaveBeenCalledWith(
      { type: 'dsh-bot:jump', sessionId: 's-visible' },
      window.location.origin,
    )
  })

  it('hides the jump menu when enableJump is false', () => {
    render(
      <SessionList
        items={[row()]}
        nowMs={NOW}
        onSelect={vi.fn()}
        enableJump={false}
      />,
    )
    expect(screen.queryByTestId('session-menu-s-visible')).toBeNull()
  })
})
