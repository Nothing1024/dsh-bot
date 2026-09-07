// @vitest-environment jsdom
/**
 * BotRegion: wide tri-state, sessions click, rail hides the segment bar.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { BotRegion } from '../src/client/BotRegion.tsx'
import { createSidebarMode } from '../src/client/sidebar-mode.ts'
import type { SidebarStorage } from '../src/client/sidebar-mode.ts'

function memory(): SidebarStorage {
  const bag = new Map<string, string>()
  return {
    getItem: (key) => bag.get(key) ?? null,
    setItem: (key, value) => { bag.set(key, value) },
  }
}

describe('BotRegion', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders wide loading / error / empty states', () => {
    const { rerender } = render(<BotRegion wide rosterState="loading" />)
    expect(screen.getByTestId('dsh-bot-region-loading').textContent).toMatch(/加载名册/)
    expect(screen.getByTestId('dsh-bot-seg').textContent).toMatch(/会话/)
    expect(screen.getByRole('button', { name: 'Bot' }).getAttribute('aria-pressed')).toBe('true')

    rerender(<BotRegion wide rosterState="error" />)
    expect(screen.getByTestId('dsh-bot-region-error').textContent).toMatch(/名册加载失败/)
    expect(screen.getByTestId('dsh-bot-region-retry').textContent).toMatch(/重试/)

    rerender(<BotRegion wide rosterState="empty" />)
    expect(screen.getByTestId('dsh-bot-region-empty').textContent).toMatch(/还没有人设/)
    expect(screen.queryByRole('button', { name: /DSH Bot 页签/ })).toBeNull()

    const activateTab = vi.fn()
    rerender(<BotRegion wide rosterState="empty" activateTab={activateTab} />)
    fireEvent.click(screen.getByRole('button', { name: /DSH Bot 页签/ }))
    expect(activateTab).toHaveBeenCalledTimes(1)
  })

  it('calls mode.set(sessions) from the segment bar', () => {
    const mode = createSidebarMode(memory())
    mode.set('bot')
    render(<BotRegion wide rosterState="loading" mode={mode} />)
    fireEvent.click(screen.getByRole('button', { name: '会话' }))
    expect(mode.getSnapshot()).toBe('sessions')
  })

  it('rail + error shows one warning glyph titled 名册加载失败 that expands and retries (UF-604 失败分支)', () => {
    const expandSidebar = vi.fn()
    const onRetry = vi.fn()
    render(<BotRegion wide={false} rosterState="error" expandSidebar={expandSidebar} onRetry={onRetry} />)
    expect(screen.queryByTestId('dsh-bot-seg')).toBeNull()
    expect(screen.queryByTestId('dsh-bot-rail')).toBeNull()
    const warn = screen.getByTestId('dsh-bot-rail-error')
    expect(warn.getAttribute('title')).toBe('名册加载失败')
    fireEvent.click(warn)
    expect(expandSidebar).toHaveBeenCalledTimes(1)
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('does not render the segment bar in rail mode', () => {
    render(<BotRegion wide={false} rosterState="loading" />)
    expect(screen.queryByTestId('dsh-bot-seg')).toBeNull()
    expect(screen.getByTestId('dsh-bot-rail')).toBeTruthy()
    expect(screen.getByTestId('dsh-bot-region').getAttribute('data-wide')).toBe('0')
  })
})
