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

  it('POSTs createBotSession / listBotSessions / history / prompt with {args}', async () => {
    const { createBotSession, listBotSessions, history, prompt } = await import('../src/api.ts')
    const fetchMock = vi.fn(async (url: string, init?: { body?: string }) => {
      const method = String(url).replace('/dsh-bot/', '')
      const args = JSON.parse(String(init?.body ?? '{}')) as { args?: unknown }
      if (method === 'createBotSession') {
        expect(args.args).toEqual({ botId: 'dsh-bot', title: 'Plan' })
        return { json: async () => ({ ok: true, value: { sessionId: 's1', title: 'Plan', botId: 'dsh-bot', presetId: 'dsh-bot' } }) }
      }
      if (method === 'listBotSessions') {
        expect(args.args).toEqual({ botId: 'dsh-bot' })
        return { json: async () => ({ ok: true, value: { sessions: [] } }) }
      }
      if (method === 'history') {
        expect(args.args).toEqual({ sessionId: 's1', sinceSeq: 3 })
        return { json: async () => ({ ok: true, value: { sessionId: 's1', items: [], working: false } }) }
      }
      expect(method).toBe('prompt')
      expect(args.args).toEqual({ sessionId: 's1', text: 'hi' })
      return { json: async () => ({ ok: true, value: { sessionId: 's1' } }) }
    })
    vi.stubGlobal('fetch', fetchMock)
    expect((await createBotSession('dsh-bot', 'Plan')).ok).toBe(true)
    expect((await listBotSessions('dsh-bot')).ok).toBe(true)
    expect((await history('s1', 3)).ok).toBe(true)
    expect((await prompt('s1', 'hi')).ok).toBe(true)
  })

  it('POSTs reconcile with {args}', async () => {
    const { reconcile } = await import('../src/api.ts')
    const fetchMock = vi.fn(async (url: string, init?: { body?: string; method?: string }) => {
      expect(String(url)).toBe('/dsh-bot/reconcile')
      expect(init?.method).toBe('POST')
      expect(init?.body).toBe(JSON.stringify({ args: {} }))
      return { json: async () => ({ ok: true, value: { scanned: 0, labeled: 0, alreadyLabeled: 0, skippedNonBot: 0, skippedCached: 0, assigned: [] } }) }
    })
    vi.stubGlobal('fetch', fetchMock)
    expect((await reconcile()).ok).toBe(true)
  })
})
