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

  it('stays editable while working and turns send into stop', () => {
    const onSend = vi.fn()
    const onStop = vi.fn()
    render(
      <Composer
        botId="bot-a"
        botName="甲"
        disabled={false}
        sending={false}
        working
        error={null}
        onSend={onSend}
        onStop={onStop}
      />,
    )
    const input = screen.getByTestId('composer-input') as HTMLTextAreaElement
    expect(input.disabled).toBe(false)
    fireEvent.change(input, { target: { value: 'second' } })
    expect(screen.getByTestId('composer-send').textContent).toBe('停止')
    expect((screen.getByTestId('composer-send') as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(screen.getByTestId('composer-send'))
    expect(onStop).toHaveBeenCalledTimes(1)
    expect(onSend).not.toHaveBeenCalled()
  })

  it('does not send an empty message when stopping', () => {
    const onSend = vi.fn()
    const onStop = vi.fn()
    render(
      <Composer
        botId="bot-a"
        botName="甲"
        disabled={false}
        sending={false}
        working
        error={null}
        onSend={onSend}
        onStop={onStop}
      />,
    )
    fireEvent.click(screen.getByTestId('composer-send'))
    expect(onStop).toHaveBeenCalledTimes(1)
    expect(onSend).not.toHaveBeenCalled()
  })

  it('disables send while sending but keeps the textarea editable', () => {
    render(
      <Composer
        botId="bot-a"
        botName="甲"
        disabled={false}
        sending
        error={null}
        onSend={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByTestId('composer-input'), { target: { value: 'hi' } })
    expect((screen.getByTestId('composer-send') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByTestId('composer-input') as HTMLTextAreaElement).disabled).toBe(false)
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

  it('opens the emoji picker on colon and inserts the glyph', () => {
    render(
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
    fireEvent.change(input, { target: { value: ':smile' } })
    expect(screen.getByTestId('emoji-menu')).toBeTruthy()
    fireEvent.mouseDown(screen.getByTestId('emoji-item-smile'))
    expect(input.value).toBe('😀')
    expect(screen.queryByTestId('emoji-menu')).toBeNull()
  })

  it('toggles the emoji picker from the button without sending', () => {
    render(
      <Composer
        botId="bot-a"
        botName="甲"
        disabled={false}
        sending={false}
        error={null}
        onSend={async () => true}
      />,
    )
    fireEvent.mouseDown(screen.getByTestId('composer-emoji'))
    expect(screen.getByTestId('emoji-menu')).toBeTruthy()
    fireEvent.mouseDown(screen.getByTestId('emoji-item-smile'))
    expect((screen.getByTestId('composer-input') as HTMLTextAreaElement).value).toBe('😀')
  })

  it('keeps Enter-to-send when the picker is closed and shows a reply card', async () => {
    const onSend = vi.fn(async () => true)
    const onClearReply = vi.fn()
    render(
      <Composer
        botId="bot-a"
        botName="甲"
        disabled={false}
        sending={false}
        error={null}
        replyTo={{ seq: 2, speaker: '诗人小北', text: '我是诗人小北' }}
        onClearReply={onClearReply}
        onSend={onSend}
      />,
    )
    expect(screen.getByTestId('composer-reply').textContent).toMatch(/回复: 诗人小北/)
    fireEvent.click(screen.getByTestId('composer-reply-clear'))
    expect(onClearReply).toHaveBeenCalled()
    const input = screen.getByTestId('composer-input')
    fireEvent.change(input, { target: { value: '下一句' } })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false })
    await vi.waitFor(() => { expect(onSend).toHaveBeenCalledWith('下一句') })
  })

  it('closes mention when the command palette opens', () => {
    const members = [{ id: 'shiren-xiaobei', name: '诗人小北' }]
    const { rerender } = render(
      <Composer
        botId="bot-a"
        botName="甲"
        disabled={false}
        sending={false}
        error={null}
        members={members}
        onSend={async () => true}
      />,
    )
    fireEvent.change(screen.getByTestId('composer-input'), { target: { value: '@诗' } })
    expect(screen.getByTestId('mention-menu')).toBeTruthy()
    rerender(
      <Composer
        botId="bot-a"
        botName="甲"
        disabled={false}
        sending={false}
        error={null}
        members={members}
        paletteOpen
        onSend={async () => true}
      />,
    )
    expect(screen.queryByTestId('mention-menu')).toBeNull()
  })
})
