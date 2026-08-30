// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { draftStorageKey } from '../src/api.ts'
import { Composer } from '../src/Composer.tsx'

describe('Composer', () => {
  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it('isolates drafts by botId in localStorage', () => {
    localStorage.setItem(draftStorageKey('bot-a'), '草稿A')
    localStorage.setItem(draftStorageKey('bot-b'), '草稿B')
    const { rerender } = render(
      <Composer
        botId="bot-a"
        botName="甲"
        disabled={false}
        sending={false}
        error={null}
        onSend={async () => true}
      />,
    )
    const input = screen.getByTestId('composer-input') as HTMLTextAreaElement
    expect(input.value).toBe('草稿A')
    expect(input.placeholder).toBe('给 甲 发消息')
    fireEvent.change(input, { target: { value: '草稿A改' } })
    rerender(
      <Composer
        botId="bot-b"
        botName="乙"
        disabled={false}
        sending={false}
        error={null}
        onSend={async () => true}
      />,
    )
    expect((screen.getByTestId('composer-input') as HTMLTextAreaElement).value).toBe('草稿B')
    expect(localStorage.getItem(draftStorageKey('bot-a'))).toBe('草稿A改')
    expect((screen.getByTestId('composer-input') as HTMLTextAreaElement).placeholder).toBe('给 乙 发消息')
  })

  it('notifies onDraft as the composer text changes', () => {
    const onDraft = vi.fn()
    render(
      <Composer
        botId="bot-a"
        botName="甲"
        disabled={false}
        sending={false}
        error={null}
        onSend={async () => true}
        onDraft={onDraft}
      />,
    )
    fireEvent.change(screen.getByTestId('composer-input'), { target: { value: '草稿给甲' } })
    expect(onDraft).toHaveBeenCalledWith('bot-a', '草稿给甲')
  })

  it('disables send while working/sending', () => {
    render(
      <Composer
        botId="bot-a"
        botName="甲"
        disabled
        sending={false}
        error={null}
        onSend={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByTestId('composer-input'), { target: { value: 'hi' } })
    expect((screen.getByTestId('composer-send') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByTestId('composer-input') as HTMLTextAreaElement).disabled).toBe(true)
  })

  it('keeps the draft and shows the host error code on failure, then retries', async () => {
    const onSend = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
    render(
      <Composer
        botId="bot-a"
        botName="甲"
        disabled={false}
        sending={false}
        error="gateway down"
        errorCode="web-unreachable"
        onSend={onSend}
      />,
    )
    const input = screen.getByTestId('composer-input') as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: '你是谁?' } })
    expect(screen.getByTestId('composer-error').textContent).toMatch(/web-unreachable/)
    fireEvent.click(screen.getByTestId('composer-retry'))
    await vi.waitFor(() => { expect(onSend).toHaveBeenCalledTimes(1) })
    expect(input.value).toBe('你是谁?')
    expect(localStorage.getItem(draftStorageKey('bot-a'))).toBe('你是谁?')
    fireEvent.click(screen.getByTestId('composer-send'))
    await vi.waitFor(() => { expect(onSend).toHaveBeenCalledTimes(2) })
    await vi.waitFor(() => { expect(input.value).toBe('') })
  })

  it('sends on Enter and inserts a newline on Shift+Enter', async () => {
    const onSend = vi.fn(async () => true)
    render(
      <Composer
        botId="bot-a"
        botName="甲"
        disabled={false}
        sending={false}
        error={null}
        onSend={onSend}
      />,
    )
    const input = screen.getByTestId('composer-input')
    fireEvent.change(input, { target: { value: '第一行' } })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    expect(onSend).not.toHaveBeenCalled()
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false })
    await vi.waitFor(() => { expect(onSend).toHaveBeenCalledWith('第一行') })
  })
})
