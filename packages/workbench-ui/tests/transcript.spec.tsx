// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorkbenchHistoryItem } from '../src/api.ts'
import { Transcript } from '../src/Transcript.tsx'

const items: readonly WorkbenchHistoryItem[] = [
  { id: 'm-1', kind: 'message', seq: 1, role: 'user', text: '你是谁?' },
  { id: 't-2', kind: 'thinking', seq: 2, text: 'remember I am a poet' },
  { id: 'tool-2', kind: 'tool', seq: 2, name: 'bash', summary: 'bash' },
  { id: 'm-2', kind: 'message', seq: 2, role: 'assistant', text: '我是诗人小北' },
]

describe('Transcript', () => {
  it('preserves reading position and offers a way back to the latest reply', () => {
    const view = render(<Transcript items={items} working={false} />)
    const scroll = screen.getByTestId('transcript')
    Object.defineProperties(scroll, { scrollHeight: { value: 1000, configurable: true }, clientHeight: { value: 200, configurable: true } })
    scroll.scrollTop = 200
    fireEvent.scroll(scroll)
    view.rerender(<Transcript items={[...items, { id: 'next', kind: 'message', seq: 3, role: 'assistant', text: '新回复' }]} working />)
    expect(scroll.scrollTop).toBe(200)
    fireEvent.click(screen.getByRole('button', { name: '回到最新消息' }))
    expect(scroll.scrollTop).toBe(1000)
    expect(screen.queryByRole('button', { name: '回到最新消息' })).toBeNull()
  })

  it('keeps cancelled requests visible with an explicit cancellation label', () => {
    render(<Transcript items={[{ id: 'stopped', kind: 'message', seq: 9, role: 'user', text: '停止的请求', cancelledAt: 123 }]} working={false} groupMode />)
    expect(screen.getByTestId('transcript-msg-9').textContent).toContain('停止的请求')
    expect(screen.getByTestId('transcript-cancelled-9').textContent).toContain('已取消')
  })
  afterEach(() => {
    cleanup()
  })

  it('shows member avatar and name in group mode', () => {
    render(
      <Transcript
        items={[
          { id: 'm-1', kind: 'message', seq: 1, role: 'user', text: '你们是谁?' },
          {
            id: 'm-2',
            kind: 'message',
            seq: 2,
            role: 'assistant',
            text: '我是诗人小北',
            author: { botId: 'shiren-xiaobei', name: '诗人小北', avatar: { color: '#c9a227', emoji: '📜' } },
          },
        ]}
        working={false}
        groupMode
      />,
    )
    expect(screen.getByTestId('transcript-author-2').textContent).toBe('诗人小北')
    expect(screen.getByTestId('transcript-author-avatar-2').textContent).toBe('📜')
    expect(screen.getByTestId('transcript-msg-2').getAttribute('data-author')).toBe('shiren-xiaobei')
  })

  it('places user on the right and assistant on the left without a large avatar', () => {
    const { container } = render(<Transcript items={items} working={false} />)
    expect(screen.getByTestId('transcript-msg-1').getAttribute('data-role')).toBe('user')
    expect(screen.getByTestId('transcript-msg-2').getAttribute('data-role')).toBe('assistant')
    expect(container.querySelectorAll('.avatar').length).toBe(0)
    expect(screen.getByTestId('transcript-msg-1').className).toMatch(/user/)
    expect(screen.getByTestId('transcript-msg-2').className).toMatch(/assistant/)
  })

  it('shows only text messages through live updates and history reloads', () => {
    const { rerender } = render(<Transcript items={items} working />)
    expect(screen.queryByTestId('transcript-thinking-2')).toBeNull()
    expect(screen.queryByTestId('transcript-tool-2')).toBeNull()
    expect(screen.getByTestId('transcript').textContent).not.toMatch(/remember|bash/)
    rerender(<Transcript items={[...items, { id: 'live-tool', kind: 'tool', seq: 3, text: 'raw result' },
      { id: 'live', kind: 'message', role: 'assistant', seq: 4, text: '继续回复', streaming: true },
      { id: 'empty', kind: 'message', role: 'assistant', seq: 5, text: '' },
    ]} working={false} />)
    expect(screen.getByTestId('transcript-msg-4').textContent).toContain('继续回复')
    expect(screen.getByTestId('transcript').textContent).not.toContain('raw result')
    expect(screen.queryByTestId('transcript-msg-5')).toBeNull()
  })

  it('keeps pending actions outside text history and omits completed actions', () => {
    const onApproval = vi.fn()
    const onQuestion = vi.fn()
    render(
      <Transcript
        items={[
          { id: 'a-1', kind: 'approval', seq: 3, text: '允许 bash?', pending: true, rpcId: 'rpc-1', approvalId: 'ap-1' },
          { id: 'q-1', kind: 'question', seq: 4, text: '模型?', pending: true, rpcId: 'rpc-2' },
          { id: 'a-2', kind: 'approval', seq: 5, text: '已答过', pending: false },
        ]}
        working={false}
        onApproval={onApproval}
        onQuestion={onQuestion}
      />,
    )
    fireEvent.click(screen.getByTestId('transcript-approval-3-allow'))
    expect(onApproval).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'a-1' }),
      'allowed-once',
    )
    fireEvent.change(screen.getByTestId('transcript-question-4-input'), { target: { value: 'grok' } })
    fireEvent.click(screen.getByTestId('transcript-question-4-submit'))
    expect(onQuestion).toHaveBeenCalledWith(expect.objectContaining({ id: 'q-1' }), 'grok')
    expect(screen.queryByTestId('transcript-approval-5')).toBeNull()
    expect(screen.getByTestId('transcript').textContent).not.toMatch(/允许 bash|模型/)
    expect(screen.getByTestId('conversation-actions').contains(screen.getByTestId('transcript-approval-3'))).toBe(true)
  })

  it('shows a stream cursor on the last assistant bubble', () => {
    render(
      <Transcript
        items={[{ id: 'm-9', kind: 'message', seq: 9, role: 'assistant', text: '正在', streaming: true }]}
        working={false}
      />,
    )
    expect(screen.getByTestId('transcript-stream-9')).toBeTruthy()
  })

  it('renders assistant markdown like DSH chat prose', () => {
    render(
      <Transcript
        items={[
          { id: 'm-1', kind: 'message', seq: 1, role: 'user', text: '写两点' },
          {
            id: 'm-2',
            kind: 'message',
            seq: 2,
            role: 'assistant',
            text: '**先说结论**\n\n- 一条\n- [文档](https://example.com)\n\n`code`',
          },
        ]}
        working={false}
      />,
    )
    const bubble = screen.getByTestId('transcript-msg-2')
    expect(bubble.querySelector('strong')?.textContent).toBe('先说结论')
    expect(bubble.querySelectorAll('li')).toHaveLength(2)
    expect(bubble.querySelector('a')?.getAttribute('href')).toBe('https://example.com')
    expect(bubble.querySelector('code')?.textContent).toBe('code')
  })

  it('keeps the working indicator in the transcript', () => {
    render(<Transcript items={items} working pending={{ text: '下一句' }} />)
    expect(screen.getByTestId('transcript-working').textContent).toMatch(/工作中/)
    expect(screen.queryByTestId('transcript-pending')).toBeNull()
  })

  it('shows the speaking member on the typing bubble in group mode', () => {
    render(
      <Transcript
        items={items}
        working
        groupMode
        speaking={{
          botId: 'shiren-xiaobei',
          name: '诗人小北',
          avatar: { color: '#c9a227', emoji: '📜' },
        }}
      />,
    )
    expect(screen.getByTestId('transcript-working').textContent).toMatch(/诗人小北 正在发言/)
    expect(screen.getByTestId('transcript-typing-name').textContent).toBe('诗人小北')
    expect(screen.getByTestId('transcript-typing-avatar').textContent).toBe('📜')
    expect(screen.getByTestId('transcript-typing-avatar').getAttribute('data-mood')).toBe('working')
    expect(screen.getByTestId('transcript-working').getAttribute('data-author')).toBe('shiren-xiaobei')
  })

  it('offers a group message menu that calls onReplyTo', () => {
    const onReplyTo = vi.fn()
    render(
      <Transcript
        items={[
          { id: 'm-1', kind: 'message', seq: 1, role: 'user', text: '你们是谁?' },
          {
            id: 'm-2',
            kind: 'message',
            seq: 2,
            role: 'assistant',
            text: '我是诗人小北',
            author: { botId: 'shiren-xiaobei', name: '诗人小北', avatar: { color: '#c9a227', emoji: '📜' } },
          },
        ]}
        working={false}
        groupMode
        onReplyTo={onReplyTo}
      />,
    )
    fireEvent.click(screen.getByTestId('transcript-menu-2'))
    expect(screen.getByTestId('transcript-menu-panel-2')).toBeTruthy()
    fireEvent.click(screen.getByTestId('transcript-reply-2'))
    expect(onReplyTo).toHaveBeenCalledTimes(1)
    expect(onReplyTo.mock.calls[0]?.[0]?.seq).toBe(2)
  })

  it('renders a persisted quote even when its source is outside loaded history', () => {
    render(
      <Transcript
        items={[{ id: 'm-3', kind: 'message', seq: 3, role: 'user', text: '再来一句',
          replyTo: { seq: 2, speaker: '诗人小北', text: '我是诗人小北' },
        }]}
        working={false}
        groupMode
        onReplyTo={vi.fn()}
      />,
    )
    expect(screen.getByTestId('transcript-reply-cite-3').textContent).toBe('→ 诗人小北我是诗人小北')
  })

  it('pins an assistant row and offers member pick in a room', () => {
    const onRemember = vi.fn()
    const onPickMember = vi.fn()
    render(
      <Transcript
        items={[
          {
            id: 'm-2',
            kind: 'message',
            seq: 2,
            role: 'assistant',
            text: '我是诗人小北',
            author: { botId: 'shiren-xiaobei', name: '诗人小北', avatar: { color: '#c9a227', emoji: '📜' } },
          },
        ]}
        working={false}
        groupMode
        onRemember={onRemember}
        pinPick="m-2"
        members={[{
          id: 'shiren-xiaobei',
          name: '诗人小北',
          avatar: { color: '#c9a227', emoji: '📜' },
          presetId: 'dsh-bot--shiren-xiaobei',
          createdAt: 1,
          persona: '你是一位诗人',
          protected: false,
        }]}
        onPickMember={onPickMember}
      />,
    )
    fireEvent.click(screen.getByTestId('transcript-menu-2'))
    fireEvent.click(screen.getByTestId('transcript-pin-2'))
    expect(onRemember).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('transcript-pin-pick-2')).toBeTruthy()
    fireEvent.click(screen.getByTestId('transcript-pin-member-shiren-xiaobei'))
    expect(onPickMember.mock.calls[0]?.[0]).toBe('shiren-xiaobei')
  })


  it('renders a propose-routine card with accept and decline', () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, value: { id: 'r1' } }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    render(
      <Transcript
        botId="ops"
        items={[{
          id: 'p-1',
          kind: 'propose-routine',
          seq: 9,
          name: '校稿',
          schedule: '@daily',
          instruction: '校今天的稿',
        }]}
        working={false}
      />,
    )
    expect(screen.getByTestId('propose-p-1').textContent).toContain('设成例程：校稿')
    fireEvent.click(screen.getByTestId('propose-accept-p-1'))
    fireEvent.click(screen.getByTestId('propose-decline-p-1'))
    expect(fetchMock).toHaveBeenCalled()
  })

  it('retries a group member error row', () => {
    const onRetryMember = vi.fn()
    render(
      <Transcript
        items={[
          { id: 'm-1', kind: 'message', seq: 1, role: 'user', text: '你们是谁?' },
          {
            id: 'm-2',
            kind: 'message',
            seq: 2,
            role: 'assistant',
            text: 'session-failed: timed out',
            author: { botId: 'dsh-bot', name: 'DSH Bot', avatar: { color: '#3db88a' } },
            error: { code: 'session-failed', message: 'session-failed: timed out' },
          },
        ]}
        working={false}
        groupMode
        onRetryMember={onRetryMember}
      />,
    )
    fireEvent.click(screen.getByTestId('transcript-retry-2'))
    expect(onRetryMember).toHaveBeenCalledTimes(1)
    expect(onRetryMember.mock.calls[0]?.[0]?.seq).toBe(2)
  })

  it('disables member retry while the room is working', () => {
    render(
      <Transcript
        items={[
          {
            id: 'm-2',
            kind: 'message',
            seq: 2,
            role: 'assistant',
            text: 'wait-timeout: timed out',
            author: { botId: 'dsh-bot', name: 'DSH Bot', avatar: { color: '#3db88a' } },
            error: { code: 'wait-timeout', message: 'wait-timeout: timed out' },
          },
        ]}
        working
        groupMode
        onRetryMember={vi.fn()}
      />,
    )
    expect((screen.getByTestId('transcript-retry-2') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByTestId('transcript-retry-2').textContent).toBe('重试中')
  })


  it('labels peer text without exposing process cards', () => {
    render(
      <Transcript
        items={[
          { id: 't-1', kind: 'thinking', seq: 1, text: 'think' },
          { id: 'm-1', kind: 'message', seq: 2, role: 'user', text: '[agent] 来自 校对阿宁：封面用深蓝' },
          { id: 'm-2', kind: 'message', seq: 3, role: 'assistant', text: '[agent] 来自 诗人小北：深蓝可以' },
        ]}
        working={false}
      />,
    )
    expect(screen.queryByTestId('transcript-thinking-1')).toBeNull()
    expect(screen.getByTestId('transcript-peer-2').textContent).toBe('来自 校对阿宁')
    expect(screen.getByTestId('transcript-peer-3').textContent).toBe('来自 诗人小北')
  })
})

