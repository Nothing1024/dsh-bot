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

  it('hides thinking and tool process from the chat', () => {
    render(<Transcript items={items} working={false} />)
    expect(screen.queryByTestId('transcript-thinking-2')).toBeNull()
    expect(screen.queryByTestId('transcript-tool-2')).toBeNull()
    expect(screen.getByTestId('transcript-msg-2').textContent).toMatch(/我是诗人小北/)
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

  it('shows a working indicator and pending user bubble', () => {
    render(
      <Transcript
        items={items}
        working
        pending={{ text: '下一句' }}
      />,
    )
    expect(screen.getByTestId('transcript-working').textContent).toMatch(/工作中/)
    expect(screen.getByTestId('transcript-pending').textContent).toMatch(/下一句/)
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

  it('renders a reply cite on the user row and a missing-source fallback', () => {
    render(
      <Transcript
        items={[{ id: 'm-3', kind: 'message', seq: 3, role: 'user', text: '再来一句' }]}
        working={false}
        groupMode
        replyMarks={[{
          text: '再来一句',
          replyTo: { seq: 2, speaker: '诗人小北', text: '我是诗人小北' },
        }]}
        onReplyTo={vi.fn()}
      />,
    )
    expect(screen.getByTestId('transcript-reply-cite-3').textContent).toBe('原消息已删除')
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
})
