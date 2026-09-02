// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/App.tsx'

const SEED = {
  id: 'dsh-bot',
  name: 'DSH Bot',
  avatar: { color: '#5b8def' },
  presetId: 'dsh-bot',
  createdAt: 1,
  persona: '你是 DSH Bot。',
  protected: true,
}

function jsonOk(value: unknown): { json: () => Promise<unknown> } {
  return { json: async () => ({ ok: true, value }) }
}

describe('App roster load', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('renders seeded bots after listBots', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('listBots')) return jsonOk({ bots: [SEED] })
      return jsonOk({ sessions: [], botModel: { provider: 'anthropic', model: 'grok-4.6', source: 'global-default' } })
    }))
    render(<App />)
    expect(await screen.findByTestId('roster-row-dsh-bot')).toBeTruthy()
    expect(screen.getByTestId('conversation-identity').textContent).toMatch(/DSH Bot/)
  })

  it('lists the selected bot\'s sessions under the roster row', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const path = String(url)
      if (path.includes('listBots')) return jsonOk({ bots: [SEED] })
      if (path.includes('listBotSessions')) {
        return jsonOk({
          sessions: [
            {
              sessionId: 's-new',
              title: '论诗',
              tags: [],
              status: 'idle',
              createdAt: 2,
              updatedAt: 2,
              hidden: false,
              working: false,
            },
            {
              sessionId: 's-old',
              title: 'DSH Bot',
              tags: [],
              status: 'idle',
              createdAt: 1,
              updatedAt: 1,
              hidden: false,
              working: false,
            },
          ],
        })
      }
      return jsonOk({ sessions: [], botModel: { provider: 'anthropic', model: 'grok-4.6', source: 'global-default' } })
    }))
    render(<App />)
    expect(await screen.findByTestId('roster-session-s-new')).toBeTruthy()
    expect(screen.getByTestId('roster-session-s-new').textContent).toMatch(/论诗/)
    expect(screen.getByTestId('roster-session-s-old').textContent).toMatch(/新对话/)
    fireEvent.click(screen.getByTestId('roster-session-s-old'))
    await vi.waitFor(() => {
      expect(screen.getByTestId('session-select').getAttribute('data-session-id')).toBe('s-old')
    })
  })

  it('sends createBot once when create is clicked twice', async () => {
    let creates = 0
    let release!: () => void
    const hold = new Promise<void>(resolve => { release = resolve })
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const path = String(url)
      if (path.includes('listBots')) return jsonOk({ bots: [SEED] })
      if (path.includes('createBot')) {
        creates += 1
        await hold
        return jsonOk({
          id: 'shiren-xiaobei',
          name: '诗人小北',
          avatar: { color: '#c9a227' },
          presetId: 'dsh-bot--shiren-xiaobei',
          createdAt: 2,
          persona: '人设',
          protected: false,
        })
      }
      return jsonOk({ sessions: [], botModel: { provider: '', model: '', source: 'global-default' } })
    }))
    render(<App />)
    await screen.findByTestId('roster-new')
    fireEvent.click(screen.getByTestId('roster-new'))
    fireEvent.change(screen.getByTestId('bot-form-name'), { target: { value: '诗人小北' } })
    fireEvent.change(screen.getByTestId('bot-form-persona'), { target: { value: '人设' } })
    fireEvent.click(screen.getByTestId('bot-form-submit'))
    fireEvent.click(screen.getByTestId('bot-form-submit'))
    expect(creates).toBe(1)
    release()
    expect(await screen.findByTestId('roster-row-shiren-xiaobei')).toBeTruthy()
  })

  it('shows an inline error bar when delete fails and keeps the row', async () => {
    const extra = {
      id: 'shiren-xiaobei',
      name: '诗人小北',
      avatar: { color: '#c9a227' },
      presetId: 'dsh-bot--shiren-xiaobei',
      createdAt: 2,
      persona: '人设',
      protected: false,
    }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const path = String(url)
      if (path.includes('listBots')) return jsonOk({ bots: [SEED, extra] })
      if (path.includes('deleteBot')) {
        return { json: async () => ({ ok: false, error: { code: 'internal', message: 'disk full' } }) }
      }
      return jsonOk({ sessions: [], botModel: { provider: '', model: '', source: 'global-default' } })
    }))
    render(<App />)
    await screen.findByTestId('roster-row-shiren-xiaobei')
    fireEvent.click(screen.getByTestId('roster-menu-shiren-xiaobei'))
    fireEvent.click(screen.getByTestId('roster-delete-shiren-xiaobei'))
    fireEvent.click(screen.getByTestId('roster-delete-ok'))
    expect((await screen.findByTestId('workbench-action-error')).textContent).toMatch(/disk full/)
    expect(screen.getByTestId('roster-row-shiren-xiaobei')).toBeTruthy()
    expect(screen.queryByTestId('workbench-error')).toBeNull()
  })

  it('lights the unselected roster working dot from listBotSessions.working', async () => {
    const extra = {
      id: 'shiren-xiaobei',
      name: '诗人小北',
      avatar: { color: '#c9a227' },
      presetId: 'dsh-bot--shiren-xiaobei',
      createdAt: 2,
      persona: '人设',
      protected: false,
    }
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { body?: string }) => {
      const path = String(url)
      if (path.includes('listBots')) return jsonOk({ bots: [SEED, extra] })
      if (path.includes('listBotSessions')) {
        const args = JSON.parse(String(init?.body ?? '{}')) as { args?: { botId?: string } }
        if (args.args?.botId === 'shiren-xiaobei') {
          return jsonOk({
            sessions: [{
              sessionId: 's-b',
              title: 'B',
              tags: [],
              status: 'live',
              createdAt: 1,
              updatedAt: 1,
              hidden: false,
              working: true,
            }],
          })
        }
        return jsonOk({ sessions: [] })
      }
      return jsonOk({ sessions: [], botModel: { provider: '', model: '', source: 'global-default' } })
    }))
    render(<App />)
    await screen.findByTestId('roster-row-dsh-bot')
    expect(await screen.findByTestId('roster-working-shiren-xiaobei')).toBeTruthy()
    expect(screen.queryByTestId('roster-working-dsh-bot')).toBeNull()
  })

  it('renders the roster before reconcile resolves', async () => {
    let release!: () => void
    const hold = new Promise<void>(resolve => { release = resolve })
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const path = String(url)
      calls.push(path)
      if (path.includes('listBots')) return jsonOk({ bots: [SEED] })
      if (path.includes('reconcile')) {
        await hold
        return jsonOk({
          scanned: 0,
          labeled: 0,
          alreadyLabeled: 0,
          skippedNonBot: 0,
          skippedCached: 0,
          assigned: [],
        })
      }
      return jsonOk({ sessions: [], botModel: { provider: '', model: '', source: 'global-default' } })
    }))
    render(<App />)
    expect(await screen.findByTestId('roster-row-dsh-bot')).toBeTruthy()
    expect(calls.some(path => path.includes('reconcile'))).toBe(true)
    expect(screen.queryByTestId('workbench-error')).toBeNull()
    release()
  })

  it('opens the edit form from the conversation identity', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('listBots')) return jsonOk({ bots: [SEED] })
      return jsonOk({ sessions: [], botModel: { provider: '', model: '', source: 'global-default' } })
    }))
    render(<App />)
    await screen.findByTestId('conversation-identity')
    fireEvent.click(screen.getByTestId('conversation-identity'))
    expect(await screen.findByTestId('bot-form')).toBeTruthy()
    expect(screen.getByTestId('bot-form').getAttribute('data-mode')).toBe('edit')
    expect(screen.getByTestId('bot-form-hint').textContent).toMatch(/新对话生效/)
  })

  it('shows an unsent composer draft on the selected roster row', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('listBots')) return jsonOk({ bots: [SEED] })
      return jsonOk({ sessions: [], botModel: { provider: '', model: '', source: 'global-default' } })
    }))
    render(<App />)
    const input = await screen.findByTestId('composer-input')
    fireEvent.change(input, { target: { value: '草稿给DSH Bot不发送' } })
    expect((await screen.findByTestId('roster-preview-dsh-bot')).textContent).toBe('草稿给DSH Bot不发送')
  })

  it('opens the create form from the roster', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('listBots')) return jsonOk({ bots: [SEED] })
      return jsonOk({ sessions: [], botModel: { provider: '', model: '', source: 'global-default' } })
    }))
    render(<App />)
    await screen.findByTestId('roster-new')
    fireEvent.click(screen.getByTestId('roster-new'))
    expect(screen.getByTestId('bot-form').getAttribute('data-mode')).toBe('create')
  })

  it('opens the command palette with Cmd+K and switches identity without confirm', async () => {
    const extra = {
      id: 'shiren-xiaobei',
      name: '诗人小北',
      avatar: { color: '#c9a227' },
      presetId: 'dsh-bot--shiren-xiaobei',
      createdAt: 2,
      persona: '人设',
      protected: false,
    }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const path = String(url)
      if (path.includes('listBots')) return jsonOk({ bots: [SEED, extra] })
      if (path.includes('listGroups')) return jsonOk({ groups: [] })
      return jsonOk({ sessions: [], botModel: { provider: '', model: '', source: 'global-default' } })
    }))
    render(<App />)
    await screen.findByTestId('roster-row-dsh-bot')
    fireEvent.keyDown(document, { key: 'k', metaKey: true })
    expect(await screen.findByTestId('command-palette')).toBeTruthy()
    expect(screen.getByTestId('command-item-action:new-bot')).toBeTruthy()
    expect(screen.getByTestId('command-item-bot:shiren-xiaobei')).toBeTruthy()
    fireEvent.click(screen.getByTestId('command-item-bot:shiren-xiaobei'))
    expect(screen.queryByTestId('command-palette')).toBeNull()
    await vi.waitFor(() => {
      expect(screen.getByTestId('conversation-name').textContent).toBe('诗人小北')
    })
  })

  it('opens the new-bot form from the palette', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('listBots')) return jsonOk({ bots: [SEED] })
      return jsonOk({ sessions: [], botModel: { provider: '', model: '', source: 'global-default' } })
    }))
    render(<App />)
    await screen.findByTestId('composer-input')
    fireEvent.keyDown(document, { key: 'k', metaKey: true })
    fireEvent.click(await screen.findByTestId('command-item-action:new-bot'))
    expect(screen.getByTestId('bot-form').getAttribute('data-mode')).toBe('create')
  })
})
