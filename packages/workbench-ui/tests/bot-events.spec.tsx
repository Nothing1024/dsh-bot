// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { mergeGroupStream, useBotEvents } from '../src/useBotEvents.ts'

class Events {
  static current: Events
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  close() {}
  constructor() { Events.current = this }
  emit(sessionId: string, type: string, text = '') {
    this.onmessage?.({ data: JSON.stringify({ type: 'session/event', sessionId, roomId: 'room', event: { type, data: { chunk: { type: 'text-delta', text } } } }) })
  }
}
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('keeps the visible reply while history catches up after stream completion', () => {
  vi.stubGlobal('EventSource', Events)
  const { result } = renderHook(() => useBotEvents())
  act(() => { Events.current.emit('member-a', 'assistant/chunk', '写完的回复') })
  act(() => { Events.current.emit('member-a', 'assistant/message'); Events.current.emit('member-a', 'turn/end') })
  expect(result.current.stream).toMatchObject({ text: '写完的回复', complete: true })
})

it('keeps simultaneous session streams separate', () => {
  vi.stubGlobal('EventSource', Events)
  const { result } = renderHook(() => useBotEvents())
  act(() => { Events.current.emit('member-a', 'assistant/chunk', '甲'); Events.current.emit('member-b', 'assistant/chunk', '乙') })
  expect(result.current.streams).toEqual(expect.arrayContaining([
    expect.objectContaining({ sessionId: 'member-a', text: '甲', roomId: 'room' }),
    expect.objectContaining({ sessionId: 'member-b', text: '乙', roomId: 'room' }),
  ]))
})

const member = { id: 'bot', name: '成员', avatar: { color: '#555', emoji: '🤖' }, persona: '', presetId: 'default', protected: false, createdAt: 1, updatedAt: 1 }
const speaking = { botId: 'bot', name: '成员', sessionId: 'hidden', afterSeq: 5, afterSessionSeq: 10 }
const stream = { sessionId: 'hidden', roomId: 'room', seq: 12, text: '新回复' }
it('isolates room streams and never replays a previous member turn', () => {
  expect(mergeGroupStream([], 'other-room', stream, speaking, [member])).toEqual([])
  expect(mergeGroupStream([], 'room', { ...stream, sessionId: 'other-member' }, speaking, [member])).toEqual([])
  expect(mergeGroupStream([], 'room', { ...stream, seq: 9, complete: true }, speaking, [member])).toEqual([])
  expect(mergeGroupStream([], 'room', stream, { botId: 'bot', name: '成员' }, [member])).toEqual([])
  expect(mergeGroupStream([], 'room', stream, speaking, [member])).toHaveLength(1)
})
it('hands group streams to saved sanitized replies without duplicating them', () => {
  const earlier = { id: 'old', kind: 'message' as const, role: 'assistant' as const, seq: 4, text: '旧回复', author: { botId: 'bot', name: '成员', avatar: { color: '#555', emoji: '🤖' } } }
  expect(mergeGroupStream([earlier], 'room', stream, speaking, [member])).toHaveLength(2)
  const saved = { ...earlier, id: 'new', seq: 6, text: '保存的回复' }
  expect(mergeGroupStream([earlier, saved], 'room', { ...stream, complete: true }, speaking, [member])).toEqual([earlier, saved])
})
it('keeps hidden prompt echoes out of the visible group stream', () => {
  for (const text of ['[SAND_HIDDEN_PROMPT] instructions', '成员，现在轮到你在小组里说话', 'pass']) {
    expect(mergeGroupStream([], 'room', { ...stream, text }, speaking, [member])).toEqual([])
  }
})

it('does not concatenate text from retried or abandoned attempts', () => {
  vi.stubGlobal('EventSource', Events)
  const { result } = renderHook(() => useBotEvents())
  act(() => { Events.current.emit('member-a', 'assistant/chunk', '废弃片段'); Events.current.emit('member-a', 'assistant/start'); Events.current.emit('member-a', 'assistant/chunk', '重试正文') })
  expect(result.current.stream?.text).toBe('重试正文')
  act(() => { Events.current.emit('member-a', 'assistant/attempt') })
  expect(result.current.stream).toBeNull()
})

it('does not expose routine control payloads while a group reply is streaming', () => {
  const items = mergeGroupStream([], 'room', { ...stream, text: '正文\n[propose-routine]{"name":"计划' }, speaking, [member])
  expect(items[0]?.text).toBe('正文')
})
