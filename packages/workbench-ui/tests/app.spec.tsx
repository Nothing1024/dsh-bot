// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/App.tsx'
import { LAST_OWNER_KEY, LAST_SESSION_KEY_PREFIX } from 'dsh-bot-shared'

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
    sessionStorage.clear()
  })

  it('shares selection with a portalled roster and preserves independent thread drafts', async () => {
    const rows = [{ sessionId: 's-old', title: '旧对话', tags: [], status: 'idle', createdAt: 1, updatedAt: 1, hidden: false, working: false }]
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/listBots')) return jsonOk({ bots: [SEED] })
      if (url.endsWith('/listBotSessions')) return jsonOk({ sessions: [...rows] })
      if (url.endsWith('/createBotSession')) {
        rows.push({ ...rows[0]!, sessionId: 's-new', title: '新对话', createdAt: 2, updatedAt: 2 })
        return jsonOk(rows[1])
      }
      return jsonOk({ sessions: [], groups: [], items: [] })
    }))
    const target = document.createElement('div')
    document.body.append(target)
    const view = render(<App rosterTarget={target} />)
    try {
      await screen.findByTestId('roster-row-dsh-bot')
      expect(target.querySelector('[data-testid="roster-row-dsh-bot"]')).toBeTruthy()
      expect(view.container.querySelector('[data-testid="roster-row-dsh-bot"]')).toBeNull()
      await vi.waitFor(() => expect(screen.getByTestId('session-select').getAttribute('data-session-id')).toBe('s-old'))
      fireEvent.change(screen.getByTestId('composer-input'), { target: { value: '旧草稿' } })
      fireEvent.click(screen.getByTestId('session-new'))
      await vi.waitFor(() => expect(screen.getByTestId('session-select').getAttribute('data-session-id')).toBe('s-new'))
      expect((screen.getByTestId('composer-input') as HTMLTextAreaElement).value).toBe('')
      fireEvent.change(screen.getByTestId('composer-input'), { target: { value: '新草稿' } })
      fireEvent.click(screen.getByTestId('session-select'))
      fireEvent.click(screen.getByTestId('session-option-s-old'))
      await vi.waitFor(() => expect((screen.getByTestId('composer-input') as HTMLTextAreaElement).value).toBe('旧草稿'))
      fireEvent.click(screen.getByTestId('session-select'))
      fireEvent.click(screen.getByTestId('session-option-s-new'))
      await vi.waitFor(() => expect((screen.getByTestId('composer-input') as HTMLTextAreaElement).value).toBe('新草稿'))
    } finally { view.unmount(); target.remove() }
  })

  it('keeps the loading roster in the sidebar seat', async () => {
    let release: () => void = () => {}
    const pending = new Promise<void>(resolve => { release = resolve })
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('listBots')) await pending
      return jsonOk({ bots: [SEED], sessions: [], groups: [] })
    }))
    const target = document.createElement('div')
    document.body.append(target)
    const view = render(<App rosterTarget={target} />)
    try {
      expect(await screen.findByTestId('workbench-loading')).toBeTruthy()
      expect(target.querySelector('[data-testid="workbench-roster"]')).toBeTruthy()
      expect(view.container.querySelector('[data-testid="workbench-roster"]')).toBeNull()
      expect(view.container.querySelector('[data-testid="workbench-conversation"]')).toBeTruthy()
    } finally {
      release()
      view.unmount()
      target.remove()
    }
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

  it('falls back to an available bot if the saved selection was deleted', async () => {
    localStorage.setItem(LAST_OWNER_KEY, 'deleted-group')
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/listBots')) return jsonOk({ bots: [SEED] })
      return jsonOk({ groups: [], sessions: [], items: [] })
    }))
    render(<App />)
    await screen.findByTestId('roster-row-dsh-bot')
    expect(screen.getByTestId('conversation-identity').textContent).toMatch(/DSH Bot/)
    expect(localStorage.getItem(LAST_OWNER_KEY)).toBe('dsh-bot')
  })

  it.each(['unchanged', 'other-tab-room', 'other-tab-bot'])('restores this page after remount when shared selection is %s', async external => {
    const group = { id: 'editors', name: '编辑室', memberIds: ['dsh-bot'], createdAt: 3 }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/listBots')) return jsonOk({ bots: [SEED] })
      if (url.endsWith('/listGroups')) return jsonOk({ groups: [group] })
      if (url.endsWith('/listGroupSessions')) return jsonOk({ rooms: [
        { roomId: 'room-new', groupId: 'editors', createdAt: 5, updatedAt: 5 },
        { roomId: 'room-old', groupId: 'editors', createdAt: 3, updatedAt: 3 },
      ] })
      return jsonOk({ sessions: [], items: [], working: false })
    }))
    const first = render(<App />)
    fireEvent.click(await screen.findByTestId('roster-row-editors'))
    await vi.waitFor(() => expect(screen.getByTestId('session-select').getAttribute('data-session-id')).toBe('room-new'))
    fireEvent.click(screen.getByTestId('session-select'))
    fireEvent.click(screen.getByTestId('session-option-room-old'))
    await vi.waitFor(() => expect(screen.getByTestId('session-select').getAttribute('data-session-id')).toBe('room-old'))
    first.unmount()
    // Other tabs share localStorage, but cannot change this tab's sessionStorage.
    if (external !== 'unchanged') localStorage.setItem(`${LAST_SESSION_KEY_PREFIX}editors`, 'room-new')
    if (external === 'other-tab-bot') localStorage.setItem(LAST_OWNER_KEY, 'dsh-bot')
    render(<App />)
    await vi.waitFor(() => expect(screen.getByTestId('roster-row-editors').getAttribute('data-active')).toBe('true'))
    await vi.waitFor(() => expect(screen.getByTestId('session-select').getAttribute('data-session-id')).toBe('room-old'))
  })

  it('keeps bound sessions in the conversation switcher, not under the roster row', async () => {
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
    await screen.findByTestId('roster-row-dsh-bot')
    expect(screen.queryByTestId('roster-session-s-new')).toBeNull()
    expect(screen.queryByTestId('roster-sessions-dsh-bot')).toBeNull()
    expect(await screen.findByTestId('roster-session-count-dsh-bot')).toHaveProperty('textContent', '2')
    fireEvent.click(screen.getByTestId('session-select'))
    expect(await screen.findByTestId('session-option-s-new')).toBeTruthy()
    expect(screen.getByTestId('session-option-s-new').textContent).toMatch(/论诗/)
    expect(screen.getByTestId('session-option-s-old').textContent).toMatch(/新对话/)
    fireEvent.click(screen.getByTestId('session-option-s-old'))
    await vi.waitFor(() => {
      expect(screen.getByTestId('session-select').getAttribute('data-session-id')).toBe('s-old')
    })
  })

  it('forwards host session navigation callbacks through the app shell', async () => {
    const openOfficial = vi.fn(async () => undefined)
    const openTool = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const path = String(url)
      if (path.includes('listBots')) return jsonOk({ bots: [SEED] })
      if (path.includes('listBotSessions')) {
        return jsonOk({
          sessions: [{
            sessionId: 's-host',
            title: '主会话',
            tags: [],
            status: 'idle',
            createdAt: 1,
            updatedAt: 1,
            hidden: false,
            working: false,
          }],
        })
      }
      return jsonOk({ sessions: [], groups: [], items: [], botModel: { provider: '', model: '', source: 'global-default' } })
    }))
    render(<App onOpenOfficialSession={openOfficial} onOpenSessionTool={openTool} />)
    await screen.findByTestId('session-current-menu')
    fireEvent.click(screen.getByTestId('session-current-menu'))
    expect(screen.getByTestId('session-current-jump').textContent).toBe('在官方会话打开')
    fireEvent.click(screen.getByTestId('session-current-jump'))
    await vi.waitFor(() => expect(openOfficial).toHaveBeenCalledWith('s-host'))
    fireEvent.click(screen.getByTestId('session-select'))
    fireEvent.click(screen.getByTestId('session-tool-browse'))
    expect(openTool).toHaveBeenCalledTimes(1)
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
    expect(screen.getByTestId('bot-form-hint').textContent).toMatch(/人设对之后的新对话生效/)
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

  it('selects a group when it receives dsh-bot:select-group', async () => {
    const group = {
      id: 'editors',
      name: '编辑室',
      memberIds: ['dsh-bot'],
      createdAt: 3,
    }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const path = String(url)
      if (path.includes('listBots')) return jsonOk({ bots: [SEED] })
      if (path.includes('listGroups')) return jsonOk({ groups: [group] })
      if (path.includes('listGroupSessions')) {
        return jsonOk({
          rooms: [{
            roomId: 'room-9',
            groupId: 'editors',
            createdAt: 3,
            updatedAt: 3,
          }],
        })
      }
      return jsonOk({ sessions: [], botModel: { provider: 'anthropic', model: 'grok-4.6', source: 'global-default' } })
    }))
    render(<App />)
    expect(await screen.findByTestId('roster-row-editors')).toBeTruthy()
    window.dispatchEvent(new MessageEvent('message', {
      origin: window.location.origin,
      data: { type: 'dsh-bot:select-group', groupId: 'editors', roomId: 'room-9' },
    }))
    await vi.waitFor(() => {
      expect(screen.getByTestId('roster-row-editors').getAttribute('data-active')).toBe('true')
    })
  })

  it('refreshes groups after deleting a member bot', async () => {
    const extra = {
      id: 'shiren-xiaobei',
      name: '诗人小北',
      avatar: { color: '#c9a227' },
      presetId: 'dsh-bot--shiren-xiaobei',
      createdAt: 2,
      persona: '人设',
      protected: false,
    }
    const other = {
      id: 'editor',
      name: 'Editor',
      avatar: { color: '#3db88a' },
      presetId: 'dsh-bot--editor',
      createdAt: 3,
      persona: '人设',
      protected: false,
    }
    let groups = [
      { id: 'pair', name: '两人组', memberIds: ['dsh-bot', 'shiren-xiaobei'], createdAt: 4, rounds: 3 },
      { id: 'trio', name: '三人组', memberIds: ['dsh-bot', 'shiren-xiaobei', 'editor'], createdAt: 5 },
    ]
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const path = String(url)
      if (path.includes('listBots')) return jsonOk({ bots: [SEED, extra, other] })
      if (path.includes('listGroups')) return jsonOk({ groups })
      if (path.includes('deleteBot')) {
        groups = [{ id: 'trio', name: '三人组', memberIds: ['dsh-bot', 'editor'], createdAt: 5 }]
        return jsonOk({ id: 'shiren-xiaobei', deleted: true })
      }
      return jsonOk({ sessions: [], rooms: [], botModel: { provider: '', model: '', source: 'global-default' } })
    }))
    render(<App />)
    expect(await screen.findByTestId('roster-row-pair')).toBeTruthy()
    expect(screen.getByTestId('roster-row-trio')).toBeTruthy()
    fireEvent.click(screen.getByTestId('roster-menu-shiren-xiaobei'))
    fireEvent.click(screen.getByTestId('roster-delete-shiren-xiaobei'))
    fireEvent.click(screen.getByTestId('roster-delete-ok'))
    await vi.waitFor(() => {
      expect(screen.queryByTestId('roster-row-shiren-xiaobei')).toBeNull()
      expect(screen.queryByTestId('roster-row-pair')).toBeNull()
    })
    expect(screen.getByTestId('roster-row-trio')).toBeTruthy()
  })

  it('marks a bot read without unmounting the open conversation', async () => {
    const refresh = Promise.withResolvers<void>()
    let held = false
    let markedRead = false
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const path = String(url)
      if (path.includes('markRead')) {
        markedRead = true
        return jsonOk({ ok: true, unread: 0 })
      }
      if (path.includes('listBots')) {
        // Hold the refresh that follows markRead; a foreground load would show 加载中 now.
        if (markedRead) {
          held = true
          await refresh.promise
        }
        return jsonOk({ bots: [SEED] })
      }
      return jsonOk({ sessions: [], botModel: { provider: '', model: '', source: 'global-default' } })
    }))
    render(<App />)
    await screen.findByTestId('roster-row-dsh-bot')
    fireEvent.click(screen.getByTestId('roster-menu-dsh-bot'))
    fireEvent.click(screen.getByTestId('roster-read-dsh-bot'))
    await vi.waitFor(() => { expect(held).toBe(true) })
    expect(screen.queryByTestId('workbench-loading')).toBeNull()
    expect(screen.getByTestId('conversation-identity').textContent).toMatch(/DSH Bot/)
    refresh.resolve()
  })

  it('stops roster polling while the tab is hidden and refreshes once on return', async () => {
    vi.useFakeTimers()
    const calls: string[] = []
    try {
      vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        const path = String(url)
        calls.push(path.slice(path.lastIndexOf('/') + 1))
        if (path.includes('listBots')) return jsonOk({ bots: [SEED] })
        return jsonOk({ sessions: [], botModel: { provider: '', model: '', source: 'global-default' } })
      }))
      render(<App />)
      await vi.advanceTimersByTimeAsync(0)
      expect(screen.getByTestId('roster-row-dsh-bot')).toBeTruthy()
      // One listBots on start: load() only, the poller waits a full interval.
      expect(calls.filter(name => name === 'listBots')).toHaveLength(1)
      Object.defineProperty(document, 'hidden', { configurable: true, value: true })
      await vi.advanceTimersByTimeAsync(2000)
      const hiddenAt = calls.length
      await vi.advanceTimersByTimeAsync(120_000)
      // jsdom has no Notification, so nothing keeps polling for routine notices.
      expect(calls.slice(hiddenAt)).toEqual([])
      Object.defineProperty(document, 'hidden', { configurable: true, value: false })
      document.dispatchEvent(new Event('visibilitychange'))
      await vi.advanceTimersByTimeAsync(0)
      expect(calls.slice(hiddenAt)).toEqual(expect.arrayContaining(['listBots', 'reconcile', 'listBotSessions']))
    } finally {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false })
      vi.useRealTimers()
    }
  })
})
