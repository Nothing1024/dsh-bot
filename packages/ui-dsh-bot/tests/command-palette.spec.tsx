// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorkbenchBot } from 'dsh-bot-shared'
import { CommandPalette } from '../src/client/CommandPalette.tsx'
import { createOverlayStore } from '../src/client/overlay-store.ts'
import { bindPaletteHotkey, isPaletteHotkey, shouldIgnorePaletteTarget } from '../src/client/palette-hotkey.ts'

const bots: WorkbenchBot[] = [
  { id: 'reviewer', name: '代码审查官', avatar: { color: '#5b8def' }, presetId: 'a', createdAt: 1, persona: '审PR', protected: false },
  { id: 'poet', name: '诗人小北', avatar: { color: '#d4537e' }, presetId: 'b', createdAt: 2, persona: '春夜', protected: false },
]

afterEach(() => {
  cleanup()
})

describe('command palette', () => {
  it('toggles on ⌘K and ignores input focus', () => {
    const overlay = createOverlayStore()
    const stop = bindPaletteHotkey(window, overlay)
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(overlay.getSnapshot().kind).toBe('palette')
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(overlay.getSnapshot().kind).toBeNull()
    stop()
    const input = document.createElement('input')
    document.body.append(input)
    input.focus()
    expect(shouldIgnorePaletteTarget(input)).toBe(true)
    expect(isPaletteHotkey(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))).toBe(false)
    input.remove()
  })

  it('filters by name and preview, then runs the active item', () => {
    const onPick = vi.fn()
    render(<CommandPalette bots={bots} onPick={onPick} onClose={vi.fn()} />)
    fireEvent.change(screen.getByTestId('dsh-bot-palette-input'), { target: { value: '春' } })
    expect(screen.getByTestId('dsh-bot-palette-bot:poet')).toBeTruthy()
    expect(screen.queryByTestId('dsh-bot-palette-bot:reviewer')).toBeNull()
    fireEvent.keyDown(screen.getByTestId('dsh-bot-palette-input'), { key: 'Enter' })
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ targetId: 'poet', kind: 'bot' }))
  })

  it('moves the highlight with arrows', () => {
    render(<CommandPalette bots={bots} onPick={vi.fn()} onClose={vi.fn()} />)
    const box = screen.getByTestId('dsh-bot-palette-input')
    expect(screen.getByTestId('dsh-bot-palette-bot:reviewer').getAttribute('data-active')).toBe('1')
    fireEvent.keyDown(box, { key: 'ArrowDown' })
    expect(screen.getByTestId('dsh-bot-palette-bot:poet').getAttribute('data-active')).toBe('1')
  })
})
