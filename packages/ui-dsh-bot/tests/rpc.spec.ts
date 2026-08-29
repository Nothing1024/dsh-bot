/**
 * rpc client: `{args}` envelope, polling pause when the panel is closed.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRpcDshBot } from '../src/client/rpc.ts'
import type { DshBotListValue } from '../src/client/rpc.ts'

const VALUE: DshBotListValue = {
  sessions: [{
    sessionId: 'session-live',
    title: 'Plan',
    tags: ['kind:dsh-bot'],
    status: 'idle',
    createdAt: 1,
    hidden: false,
  }],
  botModel: { provider: 'anthropic', model: 'grok-4.6', source: 'global-default' },
}

describe('createRpcDshBot', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('POSTs /dsh-bot/listSessions with {args} and stores rows + botModel', async () => {
    const fetchMock = vi.fn(async (url: string, init?: { body?: string }) => {
      expect(String(url)).toBe('/dsh-bot/listSessions')
      expect(init?.body).toBe(JSON.stringify({ args: { includeHidden: false } }))
      return { json: async () => ({ ok: true, value: VALUE }) }
    })
    vi.stubGlobal('fetch', fetchMock)
    const client = createRpcDshBot()
    await vi.waitFor(() => { expect(client.list.getSnapshot().state).toBe('idle') })
    expect(client.list.getSnapshot().items).toHaveLength(1)
    expect(client.list.getSnapshot().botModel?.source).toBe('global-default')
    client.dispose()
  })

  it('maps fetch failures to the error state', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('gateway down')
    }))
    const client = createRpcDshBot()
    await vi.waitFor(() => { expect(client.list.getSnapshot().state).toBe('error') })
    expect(client.list.getSnapshot().error?.code).toBe('unavailable')
    client.dispose()
  })

  it('pauses polling while the panel is closed', async () => {
    vi.useFakeTimers()
    let calls = 0
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls += 1
      return { json: async () => ({ ok: true, value: VALUE }) }
    }))
    const client = createRpcDshBot()
    await vi.advanceTimersByTimeAsync(1)
    await Promise.resolve()
    const afterStart = calls
    expect(afterStart).toBeGreaterThanOrEqual(1)
    client.setPanelOpen(false)
    await vi.advanceTimersByTimeAsync(6000)
    expect(calls).toBe(afterStart)
    client.setPanelOpen(true)
    await vi.advanceTimersByTimeAsync(2500)
    expect(calls).toBeGreaterThan(afterStart)
    client.dispose()
  })

  it('POSTs createSession with cwd in {args}', async () => {
    const fetchMock = vi.fn(async (url: string, init?: { body?: string }) => {
      if (String(url).includes('listSessions')) {
        return { json: async () => ({ ok: true, value: VALUE }) }
      }
      expect(String(url)).toBe('/dsh-bot/createSession')
      expect(init?.body).toBe(JSON.stringify({ args: { cwd: '/work/plugin' } }))
      return { json: async () => ({ ok: true, value: { sessionId: 'session-new', title: 'DSH Bot' } }) }
    })
    vi.stubGlobal('fetch', fetchMock)
    const client = createRpcDshBot()
    await vi.waitFor(() => { expect(client.list.getSnapshot().state).toBe('idle') })
    const outcome = await client.createSession(undefined, '/work/plugin')
    expect(outcome.ok).toBe(true)
    client.dispose()
  })
})
