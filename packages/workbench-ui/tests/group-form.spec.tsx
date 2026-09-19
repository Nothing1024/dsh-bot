// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GroupForm } from '../src/GroupForm.tsx'
import type { WorkbenchBot } from '../src/api.ts'

const BOTS: readonly WorkbenchBot[] = [
  {
    id: 'dsh-bot',
    name: 'DSH Bot',
    avatar: { color: '#5b8def' },
    presetId: 'dsh-bot',
    createdAt: 1,
    persona: '你是 DSH Bot。',
    protected: true,
  },
  {
    id: 'shiren-xiaobei',
    name: '诗人小北',
    avatar: { color: '#c9a227', emoji: '📜' },
    presetId: 'dsh-bot--shiren-xiaobei',
    createdAt: 2,
    persona: '诗人',
    protected: false,
  },
]

describe('GroupForm', () => {
  afterEach(() => {
    cleanup()
  })

  it('blocks submit with fewer than two members', () => {
    const onSubmit = vi.fn()
    render(
      <GroupForm
        mode="create"
        bots={BOTS}
        busy={false}
        error={null}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
    )
    fireEvent.change(screen.getByTestId('group-form-name'), { target: { value: '编辑室' } })
    fireEvent.click(screen.getByTestId('group-form-member-dsh-bot'))
    fireEvent.click(screen.getByTestId('group-form-submit'))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByTestId('group-form-members-error').textContent).toMatch(/2/)
  })

  it('submits name and two members', () => {
    const onSubmit = vi.fn()
    render(
      <GroupForm
        mode="create"
        bots={BOTS}
        busy={false}
        error={null}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
    )
    fireEvent.change(screen.getByTestId('group-form-name'), { target: { value: '编辑室' } })
    fireEvent.click(screen.getByTestId('group-form-member-dsh-bot'))
    fireEvent.click(screen.getByTestId('group-form-member-shiren-xiaobei'))
    fireEvent.click(screen.getByTestId('group-form-submit'))
    expect(onSubmit).toHaveBeenCalledWith({
      name: '编辑室',
      memberIds: ['dsh-bot', 'shiren-xiaobei'],
      rounds: 3,
    })
  })

  it('submits unlimited rounds when the group is set to 无限', () => {
    const onSubmit = vi.fn()
    render(
      <GroupForm
        mode="create"
        bots={BOTS}
        busy={false}
        error={null}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
    )
    fireEvent.change(screen.getByTestId('group-form-name'), { target: { value: '无限室' } })
    fireEvent.click(screen.getByTestId('group-form-member-dsh-bot'))
    fireEvent.click(screen.getByTestId('group-form-member-shiren-xiaobei'))
    fireEvent.change(screen.getByTestId('group-form-rounds'), { target: { value: '0' } })
    fireEvent.click(screen.getByTestId('group-form-submit'))
    expect(onSubmit).toHaveBeenCalledWith({
      name: '无限室',
      memberIds: ['dsh-bot', 'shiren-xiaobei'],
      rounds: 0,
    })
  })

  it('renders as a modal and cancels on a mask click', () => {
    const onCancel = vi.fn()
    render(
      <GroupForm
        mode="edit"
        bots={BOTS}
        initial={{ id: 'bianji-shi', name: '编辑室', memberIds: ['dsh-bot', 'shiren-xiaobei'], createdAt: 1, rounds: 2 }}
        busy={false}
        error={null}
        onCancel={onCancel}
        onSubmit={vi.fn()}
      />,
    )
    expect((screen.getByTestId('group-form-rounds') as HTMLSelectElement).value).toBe('2')
    fireEvent.mouseDown(screen.getByTestId('group-form-mask'))
    expect(onCancel).toHaveBeenCalledTimes(1)
    fireEvent.mouseDown(screen.getByTestId('group-form'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
