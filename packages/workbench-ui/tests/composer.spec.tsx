// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { draftStorageKey } from '../src/api.ts'
import { Composer } from '../src/Composer.tsx'

describe('Composer', () => {
  it.each([true, false])('tracks the first draft into a newly created session (accepted=%s)', async accepted => {
    let resolve!: (value: boolean) => void
    const promise = new Promise<boolean>(done => { resolve = done })
    const props = { botId: 'a', botName: 'A', disabled: false, sending: false, error: null, onSend: () => promise }
    const rootKey = draftStorageKey('a')
    const { rerender } = render(<Composer {...props} storageKey={rootKey} />)
    fireEvent.change(screen.getByTestId('composer-input'), { target: { value: 'first' } })
    fireEvent.keyDown(screen.getByTestId('composer-input'), { key: 'Enter' })
    rerender(<Composer {...props} storageKey={`${rootKey}:s1`} />)
    await act(async () => { resolve(accepted); await promise })
    expect((screen.getByTestId('composer-input') as HTMLTextAreaElement).value).toBe(accepted ? '' : 'first')
    expect(localStorage.getItem(`${rootKey}:s1`)).toBe(accepted ? null : 'first')
    expect(localStorage.getItem(rootKey)).toBeNull()
  })

  it('preserves a reopened composer draft when an unmounted send finishes', async () => {
    let resolve!: (value: boolean) => void
    const promise = new Promise<boolean>(done => { resolve = done })
    const props = { botId: 'a', botName: 'A', disabled: false, sending: false, error: null, onSend: () => promise }
    const first = render(<Composer {...props} />)
    fireEvent.change(screen.getByTestId('composer-input'), { target: { value: 'first' } })
    fireEvent.keyDown(screen.getByTestId('composer-input'), { key: 'Enter' })
    first.unmount()
    render(<Composer {...props} />)
    fireEvent.change(screen.getByTestId('composer-input'), { target: { value: 'reopened draft' } })
    await act(async () => { resolve(true); await promise })
    expect(localStorage.getItem(draftStorageKey('a'))).toBe('reopened draft')
  })

  it('preserves edits made while an earlier send is completing', async () => {
    let resolve!: (value: boolean) => void
    const promise = new Promise<boolean>(done => { resolve = done })
    render(<Composer botId="a" botName="A" disabled={false} sending={false} error={null} onSend={() => promise} />)
    const input = screen.getByTestId('composer-input') as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: 'first' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.change(input, { target: { value: 'next draft' } })
    await act(async () => { resolve(true); await promise })
    expect(input.value).toBe('next draft')
    expect(localStorage.getItem(draftStorageKey('a'))).toBe('next draft')
  })

  it('does not clear another session draft when a send completes', async () => {
    let resolve!: (value: boolean) => void
    const promise = new Promise<boolean>(done => { resolve = done })
    const props = { botId: 'a', botName: 'A', disabled: false, sending: false, error: null, onSend: () => promise }
    const { rerender } = render(<Composer {...props} storageKey="a:s1" />)
    fireEvent.change(screen.getByTestId('composer-input'), { target: { value: 'first' } })
    fireEvent.keyDown(screen.getByTestId('composer-input'), { key: 'Enter' })
    rerender(<Composer {...props} storageKey="a:s2" />)
    fireEvent.change(screen.getByTestId('composer-input'), { target: { value: 'other draft' } })
    await act(async () => { resolve(true); await promise })
    expect((screen.getByTestId('composer-input') as HTMLTextAreaElement).value).toBe('other draft')
    expect(localStorage.getItem('a:s2')).toBe('other draft')
    expect(localStorage.getItem('a:s1')).toBeNull()
  })

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
    const bar = screen.getByTestId('composer-error').textContent ?? ''
    expect(bar).toMatch(/web-unreachable/)
    expect(bar).toMatch(/连不上 DSH 网关/)
    expect(bar).toMatch(/gateway down/)
    fireEvent.click(screen.getByTestId('composer-retry'))
    await vi.waitFor(() => { expect(onSend).toHaveBeenCalledTimes(1) })
    expect(input.value).toBe('你是谁?')
    expect(localStorage.getItem(draftStorageKey('bot-a'))).toBe('你是谁?')
    fireEvent.click(screen.getByTestId('composer-send'))
    await vi.waitFor(() => { expect(onSend).toHaveBeenCalledTimes(2) })
    await vi.waitFor(() => { expect(input.value).toBe('') })
  })

  it('keeps the draft, closes the popup and refocuses the input after a failed send', async () => {
    const onSend = vi.fn(async () => false)
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
    const input = screen.getByTestId('composer-input') as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: '重试我' } })
    input.focus()
    fireEvent.keyDown(input, { key: 'Enter' })
    await vi.waitFor(() => { expect(onSend).toHaveBeenCalledTimes(1) })
    expect(input.value).toBe('重试我')
    expect(document.activeElement).toBe(input)
    expect(screen.queryByTestId('mention-menu')).toBeNull()
  })

  it('reports draft edits so the owner can drop a stale send error', () => {
    const onDraftEdit = vi.fn()
    render(
      <Composer
        botId="bot-a"
        botName="甲"
        disabled={false}
        sending={false}
        error={null}
        onSend={async () => true}
        onDraftEdit={onDraftEdit}
      />,
    )
    fireEvent.change(screen.getByTestId('composer-input'), { target: { value: '改了' } })
    expect(onDraftEdit).toHaveBeenCalledTimes(1)
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

  it('names the quoted member as the only responder until an @ overrides it (BR-001)', () => {
    const members = [{ id: 'shiren-xiaobei', name: '诗人小北' }, { id: 'dsh-bot', name: 'DSH Bot' }]
    const base = { botId: 'g', botName: '编辑室', disabled: false, sending: false, error: null, members, onSend: async () => true }
    const { rerender } = render(<Composer {...base} replyTo={{ seq: 2, speaker: '诗人小北', text: '秋声', botId: 'shiren-xiaobei' }} />)
    const input = screen.getByTestId('composer-input')
    fireEvent.change(input, { target: { value: '这句改短一点' } })
    expect(screen.getByTestId('composer-recipients').textContent).toBe('本次回应：诗人小北')
    fireEvent.change(input, { target: { value: '@DSH Bot 你来改' } })
    expect(screen.getByTestId('composer-recipients').textContent).toBe('本次回应：DSH Bot')
    rerender(<Composer {...base} replyTo={{ seq: 1, speaker: '你', text: '起个标题' }} />)
    fireEvent.change(input, { target: { value: '再想想' } })
    expect(screen.getByTestId('composer-recipients').textContent).toBe('本次回应：诗人小北、DSH Bot')
  })
})
