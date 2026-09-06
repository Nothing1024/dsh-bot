// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Roster } from '../src/Roster.tsx'
import type { RosterItem } from '../src/Roster.tsx'

const NOW = 1_700_000_000_000

function item(overrides: Partial<RosterItem> = {}): RosterItem {
  return {
    id: 'dsh-bot',
    name: 'DSH Bot',
    avatar: { color: '#5b8def' },
    preview: '你好',
    updatedAt: NOW - 120_000,
    working: false,
    selected: true,
    protected: true,
    ...overrides,
  }
}

describe('Roster', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders avatar, name, preview, relative time, selected and working', () => {
    render(
      <Roster
        items={[
          item({ working: true }),
          item({
            id: 'shiren-xiaobei',
            name: '诗人小北',
            avatar: { emoji: '📜', color: '#c9a227' },
            preview: '未发送草稿',
            selected: false,
            protected: false,
            working: false,
            updatedAt: NOW - 3_600_000,
          }),
        ]}
        nowMs={NOW}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onRename={vi.fn()}
      />,
    )
    expect(screen.getByTestId('roster-row-dsh-bot').getAttribute('data-active')).toBe('true')
    expect(screen.getByTestId('roster-name-dsh-bot').textContent).toBe('DSH Bot')
    expect(screen.getByTestId('roster-working-dsh-bot')).toBeTruthy()
    expect(screen.getByTestId('roster-row-dsh-bot').textContent).toMatch(/你好/)
    expect(screen.getByTestId('roster-row-dsh-bot').textContent).toMatch(/2m/)
    expect(screen.getByTestId('roster-avatar-shiren-xiaobei').textContent).toBe('📜')
    expect(screen.getByTestId('roster-row-shiren-xiaobei').textContent).toMatch(/1h/)
    expect(screen.getByTestId('roster-preview-shiren-xiaobei').textContent).toBe('未发送草稿')
  })

  it('renders a group mosaic row and the new-group control', () => {
    const onCreateGroup = vi.fn()
    render(
      <Roster
        items={[
          item(),
          item({
            id: 'bianji-shi',
            name: '编辑室',
            kind: 'group',
            selected: false,
            protected: false,
            members: [
              { id: 'dsh-bot', name: 'DSH Bot', color: '#5b8def' },
              { id: 'shiren-xiaobei', name: '诗人小北', emoji: '📜', color: '#c9a227' },
            ],
          }),
        ]}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onCreateGroup={onCreateGroup}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onRename={vi.fn()}
      />,
    )
    expect(screen.getByTestId('roster-row-bianji-shi').getAttribute('data-kind')).toBe('group')
    expect(screen.getByTestId('roster-avatar-bianji-shi').className).toMatch(/mosaic/)
    fireEvent.click(screen.getByTestId('roster-new-group'))
    expect(onCreateGroup).toHaveBeenCalledTimes(1)
  })

  it('opens create from the new-bot button', () => {
    const onCreate = vi.fn()
    render(
      <Roster
        items={[item()]}
        onSelect={vi.fn()}
        onCreate={onCreate}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onRename={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByTestId('roster-new'))
    expect(onCreate).toHaveBeenCalledTimes(1)
  })

  it('disables delete on the default bot and confirms delete for others', () => {
    const onDelete = vi.fn()
    render(
      <Roster
        items={[
          item(),
          item({ id: 'shiren-xiaobei', name: '诗人小北', protected: false, selected: false }),
        ]}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onEdit={vi.fn()}
        onDelete={onDelete}
        onRename={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByTestId('roster-menu-dsh-bot'))
    expect(screen.getByTestId('roster-delete-dsh-bot')).toHaveProperty('disabled', true)
    fireEvent.click(screen.getByTestId('roster-menu-shiren-xiaobei'))
    fireEvent.click(screen.getByTestId('roster-delete-shiren-xiaobei'))
    expect(screen.getByTestId('roster-delete-confirm').textContent).toMatch(/历史对话保留/)
    fireEvent.click(screen.getByTestId('roster-delete-ok'))
    expect(onDelete).toHaveBeenCalledWith('shiren-xiaobei')
  })

  it('renames on double-click + Enter', () => {
    const onRename = vi.fn()
    render(
      <Roster
        items={[item({ id: 'shiren-xiaobei', name: '诗人小北', protected: false })]}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onRename={onRename}
      />,
    )
    fireEvent.doubleClick(screen.getByTestId('roster-row-shiren-xiaobei'))
    const input = screen.getByTestId('roster-rename-shiren-xiaobei') as HTMLInputElement
    fireEvent.change(input, { target: { value: '北北' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onRename).toHaveBeenCalledWith('shiren-xiaobei', '北北')
  })

  it('shows an unread badge for a bot with unread > 0', () => {
    render(
      <Roster
        items={[item({ id: 'ops', name: '运维夜班', unread: 2, selected: true, protected: false })]}
        onSelect={() => undefined}
        onCreate={() => undefined}
      />,
    )
    expect(screen.getByTestId('roster-unread-ops').textContent).toBe('2')
  })
})
