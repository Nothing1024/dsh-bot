// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BotForm } from '../src/BotForm.tsx'

describe('BotForm', () => {
  afterEach(() => {
    cleanup()
  })

  it('validates name and persona inline without submitting', () => {
    const onSubmit = vi.fn()
    render(
      <BotForm
        mode="create"
        busy={false}
        error={null}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
    )
    fireEvent.click(screen.getByTestId('bot-form-submit'))
    expect(screen.getByTestId('bot-form-name-error').textContent).toMatch(/请填写名字/)
    expect(screen.getByTestId('bot-form-persona-error').textContent).toMatch(/请填写人设/)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('locks submit while busy and shows the error bar', () => {
    const onSubmit = vi.fn()
    render(
      <BotForm
        mode="create"
        busy
        error="preset dsh-bot--x is broken"
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
    )
    const submit = screen.getByTestId('bot-form-submit') as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    expect(submit.textContent).toMatch(/创建中/)
    expect(screen.getByTestId('bot-form-error').textContent).toMatch(/broken/)
    fireEvent.click(submit)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('ignores a second submit from idle before busy flips', () => {
    const onSubmit = vi.fn()
    render(
      <BotForm
        mode="create"
        busy={false}
        error={null}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
    )
    fireEvent.change(screen.getByTestId('bot-form-name'), { target: { value: '诗人小北' } })
    fireEvent.change(screen.getByTestId('bot-form-persona'), { target: { value: '人设' } })
    fireEvent.click(screen.getByTestId('bot-form-submit'))
    fireEvent.click(screen.getByTestId('bot-form-submit'))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('submits filled values once', () => {
    const onSubmit = vi.fn()
    render(
      <BotForm
        mode="edit"
        busy={false}
        error={null}
        hint="人设对之后的新对话生效"
        initial={{
          id: 'shiren-xiaobei',
          name: '诗人小北',
          avatar: { color: '#c9a227', emoji: '📜' },
          presetId: 'dsh-bot--shiren-xiaobei',
          createdAt: 1,
          persona: '你是一位诗人',
          protected: false,
        }}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
    )
    expect(screen.getByTestId('bot-form-hint').textContent).toMatch(/新对话生效/)
    fireEvent.click(screen.getByTestId('bot-form-submit'))
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      name: '诗人小北',
      persona: '你是一位诗人',
      emoji: '📜',
    })
  })
})
