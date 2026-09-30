// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useRef, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ESCAPE_PRIORITY, useEscapeLayer } from '../src/interactions.tsx'
import { useGlobalKeyboard } from '../src/useGlobalKeyboard.ts'

function Harness(props: {
  onToggle: () => void
  onRosterIndex?: (index: number) => void
  onRosterMove?: (delta: -1 | 1) => void
  onToggleRoster?: () => void
}) {
  useGlobalKeyboard({
    onTogglePalette: props.onToggle,
    ...props.onRosterIndex === undefined ? {} : { onRosterIndex: props.onRosterIndex },
    ...props.onRosterMove === undefined ? {} : { onRosterMove: props.onRosterMove },
    ...props.onToggleRoster === undefined ? {} : { onToggleRoster: props.onToggleRoster },
  })
  return <textarea data-testid="focus" />
}

function Layer(props: { name: string; priority: number }) {
  const [open, setOpen] = useState(false)
  const inside = useRef<HTMLButtonElement>(null)
  useEscapeLayer(open, () => setOpen(false), { priority: props.priority, initialFocus: () => inside.current })
  return (
    <>
      <button type="button" data-testid={`open-${props.name}`} onClick={() => setOpen(true)}>{props.name}</button>
      {open ? <button ref={inside} type="button" data-testid={`layer-${props.name}`}>inside</button> : null}
    </>
  )
}

describe('useGlobalKeyboard', () => {
  afterEach(() => {
    cleanup()
  })

  it('toggles Cmd+K even when a textarea is focused', () => {
    const onToggle = vi.fn()
    render(<Harness onToggle={onToggle} />)
    const node = document.querySelector('textarea')
    node?.focus()
    fireEvent.keyDown(node ?? document, { key: 'k', metaKey: true })
    expect(onToggle).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true })
    expect(onToggle).toHaveBeenCalledTimes(2)
  })

  it('Escape closes only the topmost layer and returns focus to its opener', () => {
    render(<><Layer name="panel" priority={ESCAPE_PRIORITY.panel} /><Layer name="menu" priority={ESCAPE_PRIORITY.menu} /><Layer name="dialog" priority={ESCAPE_PRIORITY.dialog} /></>)
    screen.getByTestId('open-panel').focus()
    fireEvent.click(screen.getByTestId('open-panel'))
    expect(document.activeElement).toBe(screen.getByTestId('layer-panel'))
    screen.getByTestId('open-dialog').focus()
    fireEvent.click(screen.getByTestId('open-dialog'))
    screen.getByTestId('open-menu').focus()
    fireEvent.click(screen.getByTestId('open-menu'))
    // The menu opened last, but the dialog outranks it.
    // fireEvent returns false once a listener called preventDefault.
    expect(fireEvent.keyDown(document.body, { key: 'Escape' })).toBe(false)
    expect(screen.queryByTestId('layer-dialog')).toBeNull()
    expect(screen.getByTestId('layer-menu')).toBeTruthy()
    expect(screen.getByTestId('layer-panel')).toBeTruthy()
    // Focus sat inside the still-open menu, so closing the dialog must not steal it.
    expect(document.activeElement).toBe(screen.getByTestId('layer-menu'))
    // Panel outranks menu regardless of open order.
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('layer-panel')).toBeNull()
    expect(screen.getByTestId('layer-menu')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('layer-menu')).toBeNull()
    expect(document.activeElement).toBe(screen.getByTestId('open-menu'))
    expect(fireEvent.keyDown(document.body, { key: 'Escape' })).toBe(true)
  })

  it('leaves Escape to inputs that mark their own Escape step', () => {
    render(<><Layer name="menu" priority={ESCAPE_PRIORITY.menu} /><textarea data-testid="local" data-escape-local="true" /></>)
    fireEvent.click(screen.getByTestId('open-menu'))
    fireEvent.keyDown(screen.getByTestId('local'), { key: 'Escape' })
    expect(screen.getByTestId('layer-menu')).toBeTruthy()
  })

  it('handles roster shortcuts without stealing Cmd+K', () => {
    const onToggle = vi.fn()
    const onRosterIndex = vi.fn()
    const onRosterMove = vi.fn()
    const onToggleRoster = vi.fn()
    render(
      <Harness
        onToggle={onToggle}
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
  })
})
