import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRosterRpc } from '../src/client/roster-rpc.ts'
import type { WorkbenchBot } from 'dsh-bot-shared'

class FakeEventSource {
  static instances: FakeEventSource[] = []
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  url: string
  closed = false
  constructor(url: string) {
    this.url = url
    FakeEventSource.instances.push(this)
  }
  close(): void {
    this.closed = true
  }
  emit(data = '{"type":"ready"}'): void {
    this.onmessage?.({ data })
  }
  fail(): void {
    this.onerror?.()
  }
}

const BOT: WorkbenchBot = {
  id: 'reviewer',
  name: '代码审查官',
  avatar: { color: '#5b8def' },
  presetId: 'dsh-bot--reviewer',
  createdAt: 1,
  persona: '审代码',
  protected: false,
  unread: 2,
}

function jsonOk(value: unknown): { json: () => Promise<unknown> } {
  return { json: async () => ({ ok: true, value }) }
}

afterEach(() => {
  FakeEventSource.instances = []
  vi.useRealTimers()
})

describe('createRosterRpc path B', () => {
  it('refresh POSTs listBots and listGroups with {args}', async () => {
    const calls: { url: string; body: string }[] = []
    const fetchMock = vi.fn(async (url: string, init?: { body?: string }) => {
      calls.push({ url: String(url), body: String(init?.body) })
      if (String(url).includes('listBots')) return jsonOk({ bots: [BOT] })
      if (String(url).includes('listGroups')) return jsonOk({ groups: [] })
      return jsonOk({})
    })
    const rpc = createRosterRpc({ fetch: fetchMock as unknown as typeof fetch })
    await rpc.refresh()
    expect(calls.map(row => row.url)).toEqual(['/dsh-bot/listBots', '/dsh-bot/listGroups'])
    expect(calls.every(row => row.body === JSON.stringify({ args: {} }))).toBe(true)
    expect(rpc.bots.getSnapshot().items.map(row => row.id)).toEqual(['reviewer'])
    rpc.dispose()
  })

  it('SSE events debounce a refresh', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('listBots')) return jsonOk({ bots: [BOT] })
      if (String(url).includes('listGroups')) return jsonOk({ groups: [] })
      return jsonOk({})
    })
    const rpc = createRosterRpc({
      fetch: fetchMock as unknown as typeof fetch,
      EventSource: FakeEventSource as unknown as typeof EventSource,
    })
    rpc.setActive(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(FakeEventSource.instances[0]?.url).toBe('/dsh-bot/events')
    const afterStart = fetchMock.mock.calls.length
    FakeEventSource.instances[0]?.emit('{"type":"session/event"}')
    FakeEventSource.instances[0]?.emit('{"type":"session/event"}')
    await vi.advanceTimersByTimeAsync(299)
    expect(fetchMock.mock.calls.length).toBe(afterStart)
    await vi.advanceTimersByTimeAsync(2)
    expect(fetchMock.mock.calls.length).toBeGreaterThan(afterStart)
    rpc.dispose()
  })

  it('SSE error falls back to 2s polling', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('listBots')) return jsonOk({ bots: [BOT] })
      if (String(url).includes('listGroups')) return jsonOk({ groups: [] })
      return jsonOk({})
    })
    const rpc = createRosterRpc({
      fetch: fetchMock as unknown as typeof fetch,
      EventSource: FakeEventSource as unknown as typeof EventSource,
    })
    rpc.setActive(true)
    await vi.advanceTimersByTimeAsync(0)
    const afterStart = fetchMock.mock.calls.length
    FakeEventSource.instances[0]?.fail()
    await vi.advanceTimersByTimeAsync(2000)
    expect(fetchMock.mock.calls.length).toBeGreaterThan(afterStart)
    rpc.dispose()
  })

  it('markRead zeros unread immediately (optimistic)', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('listBots')) return jsonOk({ bots: [BOT] })
      if (String(url).includes('listGroups')) return jsonOk({ groups: [] })
      if (String(url).includes('markRead')) return jsonOk({ ok: true, unread: 0 })
      return jsonOk({})
    })
    const rpc = createRosterRpc({ fetch: fetchMock as unknown as typeof fetch })
    await rpc.refresh()
    expect(rpc.bots.getSnapshot().items[0]?.unread).toBe(2)
    const pending = rpc.markRead('reviewer')
    expect(rpc.bots.getSnapshot().items[0]?.unread).toBe(0)
    await pending
    expect(rpc.bots.getSnapshot().items[0]?.unread).toBe(0)
    rpc.dispose()
  })
})
