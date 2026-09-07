// @vitest-environment jsdom
/**
 * ModeFooterAction: click toggles mode; rail shows only the icon.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ModeFooterAction } from '../src/client/ModeFooterAction.tsx'
import { createSidebarMode } from '../src/client/sidebar-mode.ts'
import type { SidebarStorage } from '../src/client/sidebar-mode.ts'

function memory(): SidebarStorage {
  const bag = new Map<string, string>()
  return {
    getItem: (key) => bag.get(key) ?? null,
    setItem: (key, value) => { bag.set(key, value) },
  }
}

describe('ModeFooterAction', () => {
  afterEach(() => {
    cleanup()
  })

  it('toggles bot and sessions on click', () => {
    const mode = createSidebarMode(memory())
    render(<ModeFooterAction wide mode={mode} />)
    const btn = screen.getByTestId('dsh-bot-mode-footer')
    expect(btn.getAttribute('aria-pressed')).toBe('false')
    expect(btn.textContent).toMatch(/Bot/)
    fireEvent.click(btn)
    expect(mode.getSnapshot()).toBe('bot')
    expect(screen.getByTestId('dsh-bot-mode-footer').getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByTestId('dsh-bot-mode-footer'))
    expect(mode.getSnapshot()).toBe('sessions')
    expect(screen.getByTestId('dsh-bot-mode-footer').getAttribute('aria-pressed')).toBe('false')
  })

  it('renders only the icon in rail mode', () => {
    const mode = createSidebarMode(memory())
    render(<ModeFooterAction wide={false} mode={mode} />)
    const btn = screen.getByTestId('dsh-bot-mode-footer')
    expect(btn.getAttribute('data-wide')).toBe('0')
    expect(btn.querySelector('svg')).toBeTruthy()
    expect(btn.textContent?.trim()).toBe('')
    expect(screen.queryByTestId('dsh-bot-mode-dot')).toBeNull()
  })
})
