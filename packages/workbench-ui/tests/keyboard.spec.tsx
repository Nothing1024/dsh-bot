// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useGlobalKeyboard } from '../src/useGlobalKeyboard.ts'

function Harness(props: {
  open: boolean
  onToggle: () => void
  onClose: () => void
  onRosterIndex?: (index: number) => void
  onRosterMove?: (delta: -1 | 1) => void
  onToggleRoster?: () => void
}) {
  useGlobalKeyboard({
    paletteOpen: props.open,
    onTogglePalette: props.onToggle,
    onClosePalette: props.onClose,
    onRosterIndex: props.onRosterIndex,
    onRosterMove: props.onRosterMove,
    onToggleRoster: props.onToggleRoster,
  })
  return <textarea data-testid="focus" />
}

describe('useGlobalKeyboard', () => {
  afterEach(() => {
    cleanup()
  })

  it('toggles Cmd+K even when a textarea is focused', () => {
    const onToggle = vi.fn()
    const onClose = vi.fn()
    render(<Harness open={false} onToggle={onToggle} onClose={onClose} />)
    const node = document.querySelector('textarea')
    node?.focus()
    fireEvent.keyDown(node ?? document, { key: 'k', metaKey: true })
    expect(onToggle).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true })
    expect(onToggle).toHaveBeenCalledTimes(2)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes on Escape only while the palette is open', () => {
    const onToggle = vi.fn()
    const onClose = vi.fn()
    const { rerender } = render(<Harness open={false} onToggle={onToggle} onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    rerender(<Harness open onToggle={onToggle} onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('handles roster shortcuts without stealing Cmd+K', () => {
    const onToggle = vi.fn()
    const onClose = vi.fn()
    const onRosterIndex = vi.fn()
    const onRosterMove = vi.fn()
    const onToggleRoster = vi.fn()
    render(
      <Harness
        open={false}
        onToggle={onToggle}
        onClose={onClose}
        onRosterIndex={onRosterIndex}
        onRosterMove={onRosterMove}
        onToggleRoster={onToggleRoster}
      />,
    )
    fireEvent.keyDown(document, { key: '2', metaKey: true })
    fireEvent.keyDown(document, { key: 'ArrowDown', altKey: true })
    fireEvent.keyDown(document, { key: 'b', metaKey: true })
    fireEvent.keyDown(document, { key: 'k', metaKey: true })
    expect(onRosterIndex).toHaveBeenCalledWith(1)
    expect(onRosterMove).toHaveBeenCalledWith(1)
    expect(onToggleRoster).toHaveBeenCalledTimes(1)
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
  })
})
