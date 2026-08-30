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
})
