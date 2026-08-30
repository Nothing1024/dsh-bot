/**
 * workbenchCall POSTs `{args}` like v1 rpc.ts.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { workbenchCall } from '../src/api.ts'

describe('workbenchCall', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('POSTs /dsh-bot/<method> with {args}', async () => {
    const fetchMock = vi.fn(async (url: string, init?: { body?: string; method?: string }) => {
      expect(String(url)).toBe('/dsh-bot/listSessions')
      expect(init?.method).toBe('POST')
      expect(init?.body).toBe(JSON.stringify({ args: { includeHidden: false } }))
      return { json: async () => ({ ok: true, value: { sessions: [] } }) }
    })
    vi.stubGlobal('fetch', fetchMock)
    const outcome = await workbenchCall('listSessions', { includeHidden: false })
    expect(outcome).toEqual({ ok: true, value: { sessions: [] } })
  })

  it('maps fetch failures to unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('gateway down')
    }))
    const outcome = await workbenchCall('listSessions', {})
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.error.code).toBe('unavailable')
    expect(outcome.error.message).toMatch(/gateway down/)
  })

  it('POSTs createBot with {args}', async () => {
    const { createBot } = await import('../src/api.ts')
    const fetchMock = vi.fn(async (url: string, init?: { body?: string; method?: string }) => {
      expect(String(url)).toBe('/dsh-bot/createBot')
      expect(init?.method).toBe('POST')
      expect(init?.body).toBe(JSON.stringify({ args: { name: '诗人小北', persona: '你是一位诗人' } }))
      return { json: async () => ({ ok: true, value: { id: 'shiren-xiaobei' } }) }
    })
    vi.stubGlobal('fetch', fetchMock)
    const outcome = await createBot({ name: '诗人小北', persona: '你是一位诗人' })
    expect(outcome.ok).toBe(true)
  })
})
