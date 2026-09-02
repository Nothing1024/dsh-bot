// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useGlobalKeyboard } from '../src/useGlobalKeyboard.ts'

function Harness(props: { open: boolean; onToggle: () => void; onClose: () => void }) {
  useGlobalKeyboard({
    paletteOpen: props.open,
    onTogglePalette: props.onToggle,
    onClosePalette: props.onClose,
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
})
