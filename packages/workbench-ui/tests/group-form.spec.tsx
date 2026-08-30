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
    })
  })
})
