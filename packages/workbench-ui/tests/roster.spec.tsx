// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
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

  it('pins groups and offers explicit category destinations without changing on open', () => {
    const onLayout = vi.fn()
    render(<Roster items={[item({ id: 'group', kind: 'group', section: 'work' })]} onSelect={vi.fn()} onCreate={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} onRename={vi.fn()} onLayout={onLayout} />)
    fireEvent.click(screen.getByTestId('roster-menu-group'))
    fireEvent.click(screen.getByTestId('roster-pin-group'))
    expect(onLayout).toHaveBeenCalledWith({ groups: [{ id: 'group', section: 'pinned' }] })
    onLayout.mockClear()
    fireEvent.click(screen.getByTestId('roster-menu-group'))
    fireEvent.click(screen.getByTestId('roster-move-group'))
    expect(onLayout).toHaveBeenCalledWith({ groups: [{ id: 'group', section: 'life' }] })
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
        onEdit={() => undefined}
        onDelete={() => undefined}
        onRename={() => undefined}
      />,
    )
    expect(screen.getByTestId('roster-unread-ops').textContent).toBe('2')
  })


  it('keeps the relationship graph control and shows default sections', () => {
    const onOpenGraph = vi.fn()
    render(
      <Roster
        items={[item()]}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onRename={vi.fn()}
        onOpenGraph={onOpenGraph}
      />,
    )
    fireEvent.click(screen.getByTestId('roster-graph'))
    expect(onOpenGraph).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('roster-section-pinned')).toBeTruthy()
    expect(screen.getByTestId('roster-section-work')).toBeTruthy()
    expect(screen.getByTestId('roster-section-life')).toBeTruthy()
  })

  it('selects rows from the keyboard and folds categories with aria state while empty ones say so', () => {
    const onSelect = vi.fn()
    render(
      <Roster
        items={[item(), item({ id: 'other', name: '别人', selected: false })]}
        onSelect={onSelect}
        onCreate={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onRename={vi.fn()}
      />,
    )
    const row = screen.getByTestId('roster-row-other')
    expect(row.tabIndex).toBe(0)
    expect(row.getAttribute('aria-current')).toBeNull()
    expect(screen.getByTestId('roster-row-dsh-bot').getAttribute('aria-current')).toBe('page')
    fireEvent.keyDown(row, { key: 'Enter' })
    fireEvent.keyDown(row, { key: ' ' })
    expect(onSelect).toHaveBeenCalledTimes(2)
    // Keys on the nested menu button stay with the button.
    fireEvent.keyDown(screen.getByTestId('roster-menu-other'), { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledTimes(2)
    expect(screen.getByTestId('roster-section-empty-life').textContent).toBe('暂无')
    const toggle = screen.getByTestId('roster-section-toggle-work')
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    const list = document.getElementById(toggle.getAttribute('aria-controls') ?? '')
    expect(list?.contains(row)).toBe(true)
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByTestId('roster-row-other')).toBeNull()
  })

  it('hides a bot into the footer and unhides it', () => {
    const onLayout = vi.fn()
    const { rerender } = render(
      <Roster
        items={[item({ id: 'shiren-xiaobei', name: '诗人小北', protected: false, selected: false })]}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onRename={vi.fn()}
        onLayout={onLayout}
      />,
    )
    fireEvent.click(screen.getByTestId('roster-menu-shiren-xiaobei'))
    fireEvent.click(screen.getByTestId('roster-hide-shiren-xiaobei'))
    expect(onLayout).toHaveBeenCalledWith({ bots: [{ id: 'shiren-xiaobei', hidden: true }] })
    rerender(
      <Roster
        items={[item({ id: 'shiren-xiaobei', name: '诗人小北', protected: false, selected: false, hidden: true, unread: 2 })]}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onRename={vi.fn()}
        onLayout={onLayout}
      />,
    )
    expect(screen.queryByTestId('roster-row-shiren-xiaobei')).toBeNull()
    expect(screen.getByTestId('roster-hidden').textContent).toMatch(/已隐藏 1 个/)
    fireEvent.click(screen.getByTestId('roster-hidden-toggle'))
    fireEvent.click(screen.getByTestId('roster-unhide-shiren-xiaobei'))
    expect(onLayout).toHaveBeenCalledWith({ bots: [{ id: 'shiren-xiaobei', hidden: false }] })
  })

  it('shows the hover preview after 500ms and closes it on dragstart', () => {
    vi.useFakeTimers()
    render(
      <Roster
        items={[item({ id: 'xiaodui-aning', name: '校对阿宁', selected: false, modelLabel: 'grok', routineCount: 1 })]}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onRename={vi.fn()}
      />,
    )
    fireEvent.mouseEnter(screen.getByTestId('roster-row-xiaodui-aning'))
    act(() => { vi.advanceTimersByTime(499) })
    expect(screen.queryByTestId('roster-hover-xiaodui-aning')).toBeNull()
    act(() => { vi.advanceTimersByTime(1) })
    expect(screen.getByTestId('roster-hover-xiaodui-aning').textContent).toMatch(/grok/)
    fireEvent.dragStart(screen.getByTestId('roster-row-xiaodui-aning'), {
      dataTransfer: { setData: () => undefined, getData: () => 'xiaodui-aning' },
    })
    expect(screen.queryByTestId('roster-hover-xiaodui-aning')).toBeNull()
    vi.useRealTimers()
  })

  it('does not list sessions under a selected bot', () => {
    render(
      <Roster
        items={[item({
          sessionCount: 2,
          sessions: [
            { sessionId: 's-new', title: '论诗', updatedAt: NOW, working: false, hidden: false, selected: true },
            { sessionId: 's-old', title: '新对话', updatedAt: NOW - 1000, working: false, hidden: false, selected: false },
          ],
        })]}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onRename={vi.fn()}
        onSelectSession={vi.fn()}
        onNewSession={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('roster-session-s-new')).toBeNull()
    expect(screen.queryByTestId('roster-session-new-dsh-bot')).toBeNull()
    expect(screen.getByTestId('roster-session-count-dsh-bot').textContent).toBe('2')
  })

})
