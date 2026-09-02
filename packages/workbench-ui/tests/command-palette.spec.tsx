// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildCommandItems,
  CLEAR_COMMAND,
  CommandPalette,
  NEW_BOT_COMMAND,
  NEW_GROUP_COMMAND,
} from '../src/CommandPalette.tsx'

describe('buildCommandItems', () => {
  it('lists actions first then identities by updatedAt', () => {
    const items = buildCommandItems(
      [
        { id: 'old', name: '旧人设', updatedAt: 1, kind: 'bot' },
        { id: 'new', name: '新人设', updatedAt: 9, kind: 'bot' },
      ],
      [{ id: 'room', name: '编辑室', updatedAt: 5, kind: 'group' }],
    )
    expect(items.map(row => row.id)).toEqual([
      NEW_BOT_COMMAND,
      NEW_GROUP_COMMAND,
      CLEAR_COMMAND,
      'bot:new',
      'group:room',
      'bot:old',
    ])
  })
})

describe('CommandPalette', () => {
  afterEach(() => {
    cleanup()
  })

  const items = buildCommandItems(
    [{ id: 'dsh-bot', name: 'DSH Bot', updatedAt: 1, kind: 'bot' }],
    [],
  )

  it('renders nothing when closed', () => {
    render(<CommandPalette open={false} items={items} onSelect={vi.fn()} onClose={vi.fn()} />)
    expect(screen.queryByTestId('command-palette')).toBeNull()
  })

  it('selects with click and number keys', () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()
    render(<CommandPalette open items={items} onSelect={onSelect} onClose={onClose} />)
    expect(screen.getByTestId('command-palette')).toBeTruthy()
    fireEvent.click(screen.getByTestId('command-item-bot:dsh-bot'))
    expect(onSelect).toHaveBeenCalledWith('bot:dsh-bot')
    onSelect.mockClear()
    fireEvent.keyDown(document, { key: '1' })
    expect(onSelect).toHaveBeenCalledWith(NEW_BOT_COMMAND)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('does not steal Enter after the palette has closed', () => {
    const onSelect = vi.fn()
    const { rerender } = render(
      <CommandPalette open items={items} onSelect={onSelect} onClose={vi.fn()} />,
    )
    rerender(<CommandPalette open={false} items={items} onSelect={onSelect} onClose={vi.fn()} />)
    fireEvent.keyDown(document, { key: 'Enter' })
    fireEvent.keyDown(document, { key: '1' })
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('shows the empty hint when there are no identities', () => {
    render(
      <CommandPalette
        open
        items={buildCommandItems([], [])}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByTestId('command-palette-empty').textContent).toBe('还没有人设')
  })
})
