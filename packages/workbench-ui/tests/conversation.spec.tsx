// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Conversation } from '../src/Conversation.tsx'
import type { WorkbenchBot } from '../src/api.ts'

const BOT: WorkbenchBot = {
  id: 'shiren-xiaobei',
  name: '诗人小北',
  avatar: { color: '#c9a227', emoji: '📜' },
  presetId: 'dsh-bot--shiren-xiaobei',
  createdAt: 2,
  persona: '你是一位诗人',
  protected: false,
}

function jsonOk(value: unknown): { json: () => Promise<unknown> } {
  return { json: async () => ({ ok: true, value }) }
}

function jsonErr(code: string, message: string): { json: () => Promise<unknown> } {
  return { json: async () => ({ ok: false, error: { code, message } }) }
}

describe('Conversation', () => {
  it('keeps the first outgoing message visible while the new session history is loading', async () => {
    let created = false
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/listBotSessions')) return jsonOk({ sessions: created ? [{ sessionId: 'new-session', title: '新对话', tags: [], status: 'idle', createdAt: 1, updatedAt: 1, hidden: false, working: false }] : [] })
      if (url.endsWith('/createBotSession')) { created = true; return jsonOk({ sessionId: 'new-session' }) }
      if (url.endsWith('/history')) return await new Promise(() => {})
      if (url.endsWith('/prompt')) return jsonOk({ sessionId: 'new-session' })
      return jsonOk({})
    }))
    render(<Conversation bot={BOT} />)
    const input = await screen.findByTestId('composer-input')
    fireEvent.change(input, { target: { value: '立即看到我发出的消息' } })
    await act(async () => { fireEvent.keyDown(input, { key: 'Enter' }) })
    expect(screen.getByTestId('transcript-pending').textContent).toContain('立即看到我发出的消息')
    expect(screen.queryByTestId('conversation-loading')).toBeNull()
  })

  it('shows the active group member stream before the room has a saved reply', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/listGroupSessions')) return jsonOk({ rooms: [{ roomId: 'room-live', groupId: 'g', createdAt: 1, updatedAt: 1 }] })
      if (url.endsWith('/history')) return jsonOk({ sessionId: 'room-live', working: true,
        speaking: { botId: BOT.id, name: BOT.name, sessionId: 'hidden-member', afterSeq: 1, afterSessionSeq: 0 },
        items: [{ id: 'u', kind: 'message', seq: 1, role: 'user', text: '请写长一点' }],
      })
      return jsonOk({})
    }))
    render(<Conversation group={{ id: 'g', name: '小组', memberIds: [BOT.id], createdAt: 1, rounds: 1 }} members={[BOT]}
      live={{ epoch: 0, cards: [], stream: { sessionId: 'hidden-member', roomId: 'room-live', seq: 2, text: '第一段已经开始' } }} />)
    await screen.findByTestId('composer-input')
    expect(await screen.findByText('第一段已经开始')).toBeTruthy()
    expect(screen.getByTestId('transcript-msg-2').getAttribute('data-author')).toBe(BOT.id)
    expect(screen.queryByTestId('transcript-working')).toBeNull()
  })

  it('refreshes routine outcomes while the panel stays open', async () => {
    vi.useFakeTimers()
    let ran = false
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/listBotSessions')) return jsonOk({ sessions: [] })
      if (url.endsWith('/routineList')) return jsonOk([{
        id: 'r-live', botId: BOT.id, name: '自动核查', schedule: '@every 1m',
        instruction: '检查', enabled: true, notify: false, createdAt: 1,
        ...(ran ? { lastRunAt: 1000, lastOutcome: 'spoke' } : {}),
      }])
      return jsonOk({ items: [] })
    }))
    try {
      await act(async () => { render(<Conversation bot={BOT} />) })
      await act(async () => { fireEvent.click(screen.getByTestId('routines-open')) })
      expect(screen.getByTestId('routine-row-r-live').textContent).toContain('还没有运行')
      ran = true
      await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
      expect(screen.getByTestId('routine-row-r-live').textContent).toContain('有新消息')
    } finally {
      cleanup()
      vi.useRealTimers()
    }
  })

  it('finds externally created routine sessions when opening the chooser without changing the selection', async () => {
    let created = false
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/listBotSessions')) return jsonOk({ sessions: (created ? ['routine-new', 's1'] : ['s1']).map(id => ({
        sessionId: id, title: id, tags: [], status: 'idle', createdAt: 1, updatedAt: 1, hidden: false, working: false,
      })) })
      if (url.endsWith('/history')) return jsonOk({ sessionId: 's1', items: [], working: false })
      return jsonOk({})
    }))
    render(<Conversation bot={BOT} />)
    await screen.findByTestId('composer-input')
    created = true
    fireEvent.click(screen.getByTestId('session-select'))
    expect(await screen.findByTestId('session-option-routine-new')).toBeTruthy()
    expect(screen.getByTestId('session-select').getAttribute('data-session-id')).toBe('s1')
  })

  it('keeps one header panel open at a time and closes it with Escape', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/listBotSessions')) return jsonOk({ sessions: [] })
      if (url.endsWith('/routineList')) return jsonOk([])
      if (url.endsWith('/peerLog')) return jsonOk([])
      return jsonOk({ items: [], bots: [], groups: [], profile: [], log: [] })
    }))
    render(<Conversation bot={BOT} />)
    await screen.findByTestId('composer-input')
    const memory = screen.getByTestId('memory-open')
    memory.focus()
    fireEvent.click(memory)
    expect(screen.getByTestId('memory-panel')).toBeTruthy()
    fireEvent.click(screen.getByTestId('routines-open'))
    expect(screen.queryByTestId('memory-panel')).toBeNull()
    expect(screen.getByTestId('routines-panel')).toBeTruthy()
    fireEvent.click(screen.getByTestId('peers-open'))
    expect(screen.queryByTestId('routines-panel')).toBeNull()
    expect(screen.getByTestId('peers-panel')).toBeTruthy()
    fireEvent.click(screen.getByTestId('peers-open'))
    expect(screen.queryByTestId('peers-panel')).toBeNull()
    memory.focus()
    fireEvent.click(memory)
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(screen.queryByTestId('memory-panel')).toBeNull()
    expect(document.activeElement).toBe(memory)
  })

  it('opens the session switcher as a menu with arrow-key focus', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/listBotSessions')) return jsonOk({ sessions: ['s1', 's2'].map((id, i) => ({
        sessionId: id, title: id, tags: [], status: 'idle', createdAt: 2 - i, updatedAt: 2 - i, hidden: false, working: false,
      })) })
      if (url.endsWith('/history')) return jsonOk({ sessionId: 's1', items: [], working: false })
      return jsonOk({})
    }))
    render(<Conversation bot={BOT} />)
    await screen.findByTestId('composer-input')
    const trigger = screen.getByTestId('session-select')
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu')
    trigger.focus()
    fireEvent.click(trigger)
    const first = await screen.findByTestId('session-option-s1')
    expect(first.getAttribute('role')).toBe('menuitemradio')
    expect(first.getAttribute('aria-checked')).toBe('true')
    expect(screen.getByTestId('session-option-s2').getAttribute('aria-checked')).toBe('false')
    expect(document.activeElement).toBe(first)
    fireEvent.keyDown(first, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(screen.getByTestId('session-menu-s1'))
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(first)
    fireEvent.keyDown(first, { key: 'End' })
    expect(document.activeElement).toBe(screen.getByTestId('session-tool-browse'))
    fireEvent.keyDown(document.activeElement!, { key: 'Home' })
    expect(document.activeElement).toBe(first)
    fireEvent.keyDown(first, { key: 'Escape' })
    expect(screen.queryByTestId('session-option-s1')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('keeps the selected session and its draft when a previous send completes', async () => {
    let resolve!: (value: void) => void
    const promise = new Promise<void>(done => { resolve = done })
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { body?: string }) => {
      const args = JSON.parse(init?.body ?? '{}').args ?? {}
      if (url.endsWith('/listBotSessions')) return jsonOk({ sessions: ['s1', 's2'].map((id, i) => ({
        sessionId: id, title: id, tags: [], status: 'idle', createdAt: 2 - i, updatedAt: 2 - i, hidden: false, working: false,
      })) })
      if (url.endsWith('/history')) return jsonOk({ sessionId: args.sessionId, items: [], working: false })
      if (url.endsWith('/prompt')) { await promise; return jsonOk({ sessionId: args.sessionId }) }
      return jsonOk({})
    }))
    render(<Conversation bot={BOT} />)
    const input = await screen.findByTestId('composer-input')
    fireEvent.change(input, { target: { value: 'first' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.click(screen.getByTestId('session-select'))
    fireEvent.click(screen.getByTestId('session-option-s2'))
    fireEvent.change(screen.getByTestId('composer-input'), { target: { value: 'other draft' } })
    await act(async () => { resolve(); await promise })
    expect(screen.getByTestId('session-select').getAttribute('data-session-id')).toBe('s2')
    expect((screen.getByTestId('composer-input') as HTMLTextAreaElement).value).toBe('other draft')
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    localStorage.clear()
    sessionStorage.clear()
  })


  it('initializes one group room even when mounted after an earlier refresh', async () => {
    let creates = 0
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/listGroupSessions')) {
        await new Promise(resolve => setTimeout(resolve, 30))
        return jsonOk({ rooms: [] })
      }
      if (url.endsWith('/createGroupSession')) {
        creates += 1
        return jsonOk({ roomId: 'room-one', groupId: 'g', createdAt: 1, updatedAt: 1 })
      }
      return jsonOk({ items: [] })
    }))
    render(<Conversation group={{ id: 'g', name: '小组', memberIds: [BOT.id], createdAt: 1, rounds: 3 }} members={[BOT]} refreshEpoch={3} />)
    await screen.findByTestId('composer-input')
    expect(creates).toBe(1)
    expect(screen.getByTestId('session-select').getAttribute('data-session-id')).toBe('room-one')
  })

  it('shows header identity, placeholder, and working badge while history.working', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const path = String(url)
      if (path.includes('listBotSessions')) {
        return jsonOk({
          sessions: [{
            sessionId: 's1',
            title: '对话 1',
            tags: ['kind:dsh-bot', 'bot:shiren-xiaobei'],
            status: 'idle',
            createdAt: 1,
            updatedAt: 1,
            hidden: false,
            working: true,
          }],
        })
      }
      if (path.includes('history')) {
        return jsonOk({
          sessionId: 's1',
          working: true,
          items: [
            { id: 'm1', kind: 'message', seq: 1, role: 'user', text: '你是谁?' },
            { id: 'm2', kind: 'message', seq: 2, role: 'assistant', text: '我是诗人小北' },
          ],
        })
      }
      return jsonOk({})
    }))
    render(<Conversation bot={BOT} />)
    expect(await screen.findByTestId('conversation-name')).toHaveProperty('textContent', '诗人小北')
    expect(await screen.findByTestId('conversation-working')).toBeTruthy()
    expect((await screen.findByTestId('composer-input')).getAttribute('placeholder')).toBe('给 诗人小北 发消息')
    expect(await screen.findByTestId('transcript-msg-2')).toBeTruthy()
    expect((screen.getByTestId('composer-input') as HTMLTextAreaElement).disabled).toBe(false)
    expect(screen.getByTestId('composer-send').textContent).toBe('停止')
    expect((screen.getByTestId('composer-send') as HTMLButtonElement).disabled).toBe(false)
  })

  it('creates a session then prompts, showing a pending user bubble', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { body?: string }) => {
      const path = String(url)
      calls.push(path)
      if (path.includes('listBotSessions')) return jsonOk({ sessions: [] })
      if (path.includes('createBotSession')) {
        return jsonOk({ sessionId: 's-new', title: '诗人小北', botId: BOT.id, presetId: BOT.presetId })
      }
      if (path.includes('prompt')) {
        const args = JSON.parse(String(init?.body ?? '{}')) as { args?: { text?: string } }
        expect(args.args?.text).toBe('你是谁?')
        return jsonOk({ sessionId: 's-new' })
      }
      if (path.includes('history')) {
        return jsonOk({ sessionId: 's-new', working: false, items: [] })
      }
      return jsonOk({})
    }))
    render(<Conversation bot={BOT} />)
    const input = await screen.findByTestId('composer-input')
    fireEvent.change(input, { target: { value: '你是谁?' } })
    fireEvent.click(screen.getByTestId('composer-send'))
    expect(await screen.findByTestId('transcript-pending')).toBeTruthy()
    await vi.waitFor(() => {
      expect(calls.some(path => path.includes('createBotSession'))).toBe(true)
      expect(calls.some(path => path.includes('prompt'))).toBe(true)
    })
  })

  it('keeps the composer editable after prompt and turns send into stop', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const path = String(url)
      if (path.includes('listBotSessions')) {
        return jsonOk({
          sessions: [{
            sessionId: 's1',
            title: '对话 1',
            tags: [],
            status: 'idle',
            createdAt: 1,
            updatedAt: 1,
            hidden: false,
            working: false,
          }],
        })
      }
      if (path.includes('history')) {
        return jsonOk({ sessionId: 's1', working: false, items: [] })
      }
      if (path.includes('prompt')) return jsonOk({ sessionId: 's1' })
      return jsonOk({})
    }))
    render(<Conversation bot={BOT} />)
    const input = await screen.findByTestId('composer-input')
    fireEvent.change(input, { target: { value: '你是谁?' } })
    fireEvent.click(screen.getByTestId('composer-send'))
    expect(await screen.findByTestId('transcript-pending')).toBeTruthy()
    await vi.waitFor(() => {
      expect((screen.getByTestId('composer-input') as HTMLTextAreaElement).disabled).toBe(false)
      expect(screen.getByTestId('composer-send').textContent).toBe('停止')
    })
    expect(screen.getByTestId('conversation-working')).toBeTruthy()
    expect(screen.queryByTestId('transcript')).toBeTruthy()
  })

  it('keeps the draft and surfaces the host error code when prompt fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const path = String(url)
      if (path.includes('listBotSessions')) {
        return jsonOk({
          sessions: [{
            sessionId: 's1',
            title: '对话 1',
            tags: [],
            status: 'idle',
            createdAt: 1,
            updatedAt: 1,
            hidden: false,
            working: false,
          }],
        })
      }
      if (path.includes('history')) return jsonOk({ sessionId: 's1', working: false, items: [] })
      if (path.includes('prompt')) return jsonErr('web-unreachable', 'gateway down')
      return jsonOk({})
    }))
    render(<Conversation bot={BOT} />)
    const input = await screen.findByTestId('composer-input')
    fireEvent.change(input, { target: { value: '你是谁?' } })
    fireEvent.click(screen.getByTestId('composer-send'))
    expect((await screen.findByTestId('composer-error')).textContent).toMatch(/web-unreachable/)
    expect((screen.getByTestId('composer-input') as HTMLTextAreaElement).value).toBe('你是谁?')
  })

  it('shows the empty-chat CTA when the bot has no sessions', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('listBotSessions')) return jsonOk({ sessions: [] })
      return jsonOk({})
    }))
    render(<Conversation bot={BOT} />)
    expect(await screen.findByTestId('empty-chat-cta')).toBeTruthy()
    expect((await screen.findByTestId('composer-input')).getAttribute('placeholder')).toBe('给 诗人小北 发消息')
  })

  it('keeps a loading stage instead of the empty-chat CTA until history arrives', async () => {
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const path = String(url)
      if (path.includes('listBotSessions')) {
        await gate
        return jsonOk({
          sessions: [{
            sessionId: 's1',
            title: '对话 1',
            tags: [],
            status: 'idle',
            createdAt: 1,
            updatedAt: 1,
            hidden: false,
            working: false,
          }],
        })
      }
      if (path.includes('history')) {
        return jsonOk({
          sessionId: 's1',
          working: false,
          items: [{ id: 'm1', kind: 'message', seq: 1, role: 'user', text: 'hi' }],
        })
      }
      return jsonOk({})
    }))
    render(<Conversation bot={BOT} />)
    expect(screen.getByTestId('conversation-loading')).toBeTruthy()
    expect(screen.queryByTestId('empty-chat-cta')).toBeNull()
    expect(screen.getByTestId('session-select').textContent).toMatch(/加载中/)
    release()
    expect(await screen.findByTestId('transcript-msg-1')).toBeTruthy()
    expect(screen.queryByTestId('conversation-loading')).toBeNull()
    expect(screen.getByTestId('conversation-pane').querySelector('.isReady')).toBeTruthy()
  })

  it('opens edit from the identity header', async () => {
    const onEdit = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('listBotSessions')) return jsonOk({ sessions: [] })
      return jsonOk({})
    }))
    render(<Conversation bot={BOT} onEdit={onEdit} />)
    await screen.findByTestId('conversation-identity')
    fireEvent.click(screen.getByTestId('conversation-identity'))
    expect(onEdit).toHaveBeenCalledTimes(1)
  })

  it('defaults to hiding delegated sessions and reloads when 包含隐藏 is on', async () => {
    const bodies: Array<{ botId?: string; includeHidden?: boolean }> = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { body?: string }) => {
      const path = String(url)
      if (path.includes('listBotSessions')) {
        const args = JSON.parse(String(init?.body ?? '{}')) as { args?: { botId?: string; includeHidden?: boolean } }
        bodies.push(args.args ?? {})
        if (args.args?.includeHidden === true) {
          return jsonOk({
            sessions: [{
              sessionId: 's-hidden',
              title: '~dsh-bot: q',
              tags: ['kind:dsh-bot', 'bot:shiren-xiaobei', 'kind:hidden'],
              status: 'idle',
              createdAt: 1,
              updatedAt: 1,
              hidden: true,
              working: false,
            }],
          })
        }
        return jsonOk({
          sessions: [{
            sessionId: 's-live',
            title: '可见',
            tags: ['kind:dsh-bot', 'bot:shiren-xiaobei'],
            status: 'idle',
            createdAt: 1,
            updatedAt: 1,
            hidden: false,
            working: false,
          }],
        })
      }
      return jsonOk({ sessionId: 's-live', working: false, items: [] })
    }))
    render(<Conversation bot={BOT} />)
    const trigger = await screen.findByTestId('session-select')
    expect(trigger.getAttribute('data-session-id')).toBe('s-live')
    fireEvent.click(trigger)
    const toggle = await screen.findByTestId('include-hidden') as HTMLInputElement
    expect(toggle.checked).toBe(false)
    fireEvent.click(toggle)
    await vi.waitFor(() => {
      expect(bodies.some(row => row.includeHidden === true)).toBe(true)
    })
    await vi.waitFor(() => {
      expect(screen.getByTestId('session-select').getAttribute('data-session-id')).toBe('s-hidden')
    })
    expect(screen.getByTestId('session-select').textContent).toMatch(/~/)
  })

  it('reopens the remembered session instead of always the newest', async () => {
    localStorage.setItem('dsh-bot:last-session:shiren-xiaobei', 's-old')
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const path = String(url)
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
              title: '旧稿',
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
      return jsonOk({ sessionId: 's-old', working: false, items: [] })
    }))
    render(<Conversation bot={BOT} />)
    await vi.waitFor(() => {
      expect(screen.getByTestId('session-select').getAttribute('data-session-id')).toBe('s-old')
      expect(screen.getByTestId('session-select').textContent).toMatch(/旧稿/)
    })
  })

  it('does not label every bound session with the bot name', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('listBotSessions')) {
        return jsonOk({
          sessions: [{
            sessionId: 's1',
            title: '诗人小北',
            tags: [],
            status: 'idle',
            createdAt: 1,
            updatedAt: 1,
            hidden: false,
            working: false,
          }],
        })
      }
      return jsonOk({ sessionId: 's1', working: false, items: [] })
    }))
    render(<Conversation bot={BOT} />)
    const trigger = await screen.findByTestId('session-select')
    expect(trigger.textContent).toMatch(/新对话/)
    fireEvent.click(trigger)
    expect(screen.getByTestId('session-option-s1').textContent).toMatch(/新对话/)
  })

  it('offers a current-session menu that can rename the thread', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('listBotSessions')) {
        return jsonOk({
          sessions: [{
            sessionId: 's1',
            title: '对话 1',
            tags: [],
            status: 'idle',
            createdAt: 1,
            updatedAt: 1,
            hidden: false,
            working: false,
          }],
        })
      }
      return jsonOk({ sessionId: 's1', working: false, items: [] })
    }))
    render(<Conversation bot={BOT} />)
    await screen.findByTestId('session-current-menu')
    fireEvent.click(screen.getByTestId('session-current-menu'))
    const jump = await screen.findByTestId('session-current-jump')
    expect(jump.textContent).toBe('复制会话 ID')
    const rename = await screen.findByTestId('session-current-rename')
    expect(rename.textContent).toBe('重命名')
    fireEvent.click(rename)
    expect(screen.getByLabelText('对话或房间名称')).toBeTruthy()
  })

  it('offers official jump from the group room menu', async () => {
    const group = { id: 'bianji-shi', name: '编辑室', memberIds: [BOT.id], createdAt: 1, rounds: 3 }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const path = String(url)
      if (path.includes('listGroupSessions')) {
        return jsonOk({
          rooms: [{ roomId: 'room-1', groupId: group.id, createdAt: 1, updatedAt: 1 }],
        })
      }
      if (path.includes('history')) {
        return jsonOk({ sessionId: 'room-1', working: false, items: [] })
      }
      return jsonOk({})
    }))
    render(<Conversation group={group} members={[BOT]} />)
    const trigger = await screen.findByTestId('session-select')
    expect(screen.getByTestId('session-current-menu')).toBeTruthy()
    fireEvent.click(trigger)
    expect(screen.getByTestId('session-option-room-1')).toBeTruthy()
    fireEvent.click(screen.getByTestId('session-menu-room-1'))
    expect(screen.getByTestId('session-jump-room-1').textContent).toBe('复制会话 ID')
    expect(screen.getByTestId('session-rename-room-1').textContent).toBe('重命名')
    expect(screen.getByTestId('session-tool-browse').textContent).toMatch(/会话协作/)
  })

  it('lists a member bot group official session and opens that session', async () => {
    const openOfficial = vi.fn(async () => undefined)
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const path = String(url)
      if (path.includes('listBotGroupOfficialSessions')) {
        return jsonOk({
          sessions: [{
            botId: BOT.id,
            name: BOT.name,
            sessionId: 'session-group-bei',
            roomId: 'room-1',
            groupId: 'bianji-shi',
            groupName: '编辑室',
            roomTitle: '夜谈',
            updatedAt: 1,
          }],
        })
      }
      if (path.includes('listBotSessions')) return jsonOk({ sessions: [] })
      return jsonOk({})
    }))
    render(<Conversation bot={BOT} onOpenOfficialSession={openOfficial} />)
    fireEvent.click(await screen.findByTestId('session-select'))
    const row = await screen.findByTestId('session-option-session-group-bei')
    expect(row.textContent).toContain('小组 · 编辑室 · 夜谈')
    fireEvent.click(row)
    await vi.waitFor(() => expect(openOfficial).toHaveBeenCalledWith('session-group-bei'))
  })

  it('labels untitled group rooms with the group clock, not a room id', async () => {
    const group = { id: 'bianji-shi', name: '编辑室', memberIds: [BOT.id], createdAt: 1, rounds: 3 }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const path = String(url)
      if (path.includes('listGroupSessions')) {
        return jsonOk({
          rooms: [{ roomId: 'room-abcdef12zzzz', groupId: group.id, createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_000 }],
        })
      }
      if (path.includes('history')) {
        return jsonOk({ sessionId: 'room-abcdef12zzzz', working: false, items: [] })
      }
      return jsonOk({})
    }))
    render(<Conversation group={group} members={[BOT]} />)
    const trigger = await screen.findByTestId('session-select')
    fireEvent.click(trigger)
    const option = screen.getByTestId('session-option-room-abcdef12zzzz')
    expect(option.textContent).toMatch(/编辑室 · /)
    expect(option.textContent).not.toMatch(/房间 /)
    expect(option.textContent).not.toMatch(/abcdef12/)
  })

  it('retries a member error row without sending another prompt', async () => {
    const group = { id: 'bianji-shi', name: '编辑室', memberIds: [BOT.id], createdAt: 1, rounds: 3 }
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { body?: string }) => {
      const path = String(url)
      calls.push(path)
      if (path.includes('listGroupSessions')) {
        return jsonOk({
          rooms: [{ roomId: 'room-1', groupId: group.id, createdAt: 1, updatedAt: 1 }],
        })
      }
      if (path.includes('history')) {
        return jsonOk({
          sessionId: 'room-1',
          working: false,
          items: [
            { id: 'm-1', kind: 'message', seq: 1, role: 'user', text: '你们是谁?' },
            {
              id: 'm-2',
              kind: 'message',
              seq: 2,
              role: 'assistant',
              text: 'session-failed: timed out',
              author: { botId: BOT.id, name: BOT.name, avatar: BOT.avatar },
              error: { code: 'session-failed', message: 'session-failed: timed out' },
            },
          ],
        })
      }
      if (path.includes('retryMember')) {
        const args = JSON.parse(String(init?.body ?? '{}')) as { args?: { roomId?: string; botId?: string; errorSeq?: number } }
        expect(args.args).toEqual({ roomId: 'room-1', botId: BOT.id, errorSeq: 2 })
        return jsonOk({ roomId: 'room-1', botId: BOT.id, accepted: true })
      }
      return jsonOk({})
    }))
    render(<Conversation group={group} members={[BOT]} />)
    expect(await screen.findByTestId('transcript-error-2')).toBeTruthy()
    fireEvent.click(screen.getByTestId('transcript-retry-2'))
    await vi.waitFor(() => {
      expect(calls.some(path => path.includes('retryMember'))).toBe(true)
    })
    expect(calls.some(path => path.includes('/prompt'))).toBe(false)
    expect(screen.queryByText('已开始重试该成员')).toBeNull()
    expect(screen.queryByTestId('conversation-toast')).toBeNull()
    expect(screen.getByTestId('transcript-retry-2').textContent).toBe('重试中')
    expect(screen.getByTestId('conversation-working').textContent).toContain('诗人小北')
    expect(screen.getByTestId('conversation-working').textContent).toContain('正在发言')
    expect(screen.getByTestId('transcript-working').getAttribute('data-author')).toBe(BOT.id)
    expect(screen.getByTestId('transcript-typing-name').textContent).toBe(BOT.name)
  })


  it('sets a reply card from the group message menu and clears it after send', async () => {
    const group = { id: 'bianji-shi', name: '编辑室', memberIds: [BOT.id], createdAt: 1, rounds: 3 }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const path = String(url)
      if (path.includes('listGroupSessions')) {
        return jsonOk({
          rooms: [{ roomId: 'room-1', groupId: group.id, createdAt: 1, updatedAt: 1 }],
        })
      }
      if (path.includes('history')) {
        return jsonOk({
          sessionId: 'room-1',
          working: false,
          items: [
            { id: 'm-1', kind: 'message', seq: 1, role: 'user', text: '你们是谁?' },
            {
              id: 'm-2',
              kind: 'message',
              seq: 2,
              role: 'assistant',
              text: '我是诗人小北',
              author: { botId: BOT.id, name: BOT.name, avatar: BOT.avatar },
            },
          ],
        })
      }
      if (path.includes('prompt')) return jsonOk({ sessionId: 'room-1' })
      return jsonOk({})
    }))
    render(<Conversation group={group} members={[BOT]} />)
    expect(await screen.findByTestId('transcript-msg-2')).toBeTruthy()
    fireEvent.click(screen.getByTestId('transcript-menu-2'))
    fireEvent.click(screen.getByTestId('transcript-reply-2'))
    expect(screen.getByTestId('composer-reply').textContent).toMatch(/回复: 诗人小北/)
    const input = screen.getByTestId('composer-input')
    fireEvent.change(input, { target: { value: '再来一句' } })
    fireEvent.click(screen.getByTestId('composer-send'))
    await vi.waitFor(() => {
      expect(screen.queryByTestId('composer-reply')).toBeNull()
    })
    expect(await screen.findByTestId('transcript-reply-cite-pending')).toBeTruthy()
  })

  it('shows the memory pill left of the session switcher and opens the panel', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const path = String(url)
      if (path.includes('listBotSessions')) {
        return jsonOk({
          sessions: [{
            sessionId: 's1',
            title: '对话 1',
            tags: ['kind:dsh-bot', 'bot:shiren-xiaobei'],
            status: 'idle',
            createdAt: 1,
            updatedAt: 1,
            hidden: false,
            working: false,
          }],
        })
      }
      if (path.includes('memoryList')) {
        return jsonOk({
          profile: [{ id: 'p1', text: '用户叫 Nothing', ts: 1 }],
          log: [],
        })
      }
      if (path.includes('history')) {
        return jsonOk({ sessionId: 's1', working: false, items: [] })
      }
      return jsonOk({})
    }))
    render(<Conversation bot={BOT} />)
    const pill = await screen.findByTestId('memory-open')
    expect(pill.textContent).toMatch(/🧠/)
    await vi.waitFor(() => {
      expect(pill.textContent).toMatch(/1/)
    })
    const head = screen.getByTestId('conversation-pane').querySelector('.conversationHead')
    const memory = head?.querySelector('.memorySwitch')
    const session = head?.querySelector('.sessionSwitch')
    expect(memory).toBeTruthy()
    expect(session).toBeTruthy()
    expect(memory && session ? memory.compareDocumentPosition(session) & Node.DOCUMENT_POSITION_FOLLOWING : 0).toBeTruthy()
    fireEvent.click(pill)
    expect(await screen.findByTestId('memory-panel')).toBeTruthy()
    expect(screen.getByTestId('memory-profile').textContent).toMatch(/Nothing/)
  })

  it('shows the routines pill next to memory', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const path = String(url)
      if (path.includes('listBotSessions')) return jsonOk({ sessions: [] })
      if (path.includes('routineList')) return jsonOk([])
      if (path.includes('memoryList')) return jsonOk({ profile: [], log: [] })
      return jsonOk({})
    }))
    render(<Conversation bot={BOT} />)
    expect(await screen.findByTestId('routines-open')).toBeTruthy()
    expect(screen.getByTestId('memory-open')).toBeTruthy()
  })

  it('jumps to the official session through the host opener', async () => {
    const openOfficial = vi.fn(async () => undefined)
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('listBotSessions')) {
        return jsonOk({
          sessions: [{
            sessionId: 's1',
            title: '对话 1',
            tags: [],
            status: 'idle',
            createdAt: 1,
            updatedAt: 1,
            hidden: false,
            working: false,
          }],
        })
      }
      return jsonOk({ sessionId: 's1', working: false, items: [] })
    }))
    render(<Conversation bot={BOT} onOpenOfficialSession={openOfficial} />)
    await screen.findByTestId('session-current-menu')
    fireEvent.click(screen.getByTestId('session-current-menu'))
    expect(screen.getByTestId('session-current-jump').textContent).toBe('在官方会话打开')
    fireEvent.click(screen.getByTestId('session-current-jump'))
    await vi.waitFor(() => expect(openOfficial).toHaveBeenCalledWith('s1'))
  })

  it('shows the peers pill next to routines', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const path = String(url)
      if (path.includes('listBotSessions')) return jsonOk({ sessions: [] })
      if (path.includes('routineList')) return jsonOk([])
      if (path.includes('memoryList')) return jsonOk({ profile: [], log: [] })
      if (path.includes('peerLog')) return jsonOk([{ from: 'shiren-xiaobei', to: 'xiaodui-aning', ts: 1, sessionId: 'p1' }])
      if (path.includes('listBots')) return jsonOk({ bots: [] })
      if (path.includes('listGroups')) return jsonOk({ groups: [] })
      return jsonOk({})
    }))
    render(<Conversation bot={BOT} />)
    const pill = await screen.findByTestId('peers-open')
    expect(pill.textContent).toMatch(/同事/)
    await vi.waitFor(() => {
      expect(pill.textContent).toMatch(/1/)
    })
    fireEvent.click(pill)
    expect(await screen.findByTestId('peers-panel')).toBeTruthy()
  })

  it('keeps a named and working group room in the chooser', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const path = String(url)
      if (path.includes('listGroupSessions')) {
        return jsonOk({
          rooms: [{
            roomId: 'room-named',
            groupId: 'g',
            title: '选题讨论',
            createdAt: 1,
            updatedAt: 1,
            working: true,
          }],
        })
      }
      if (path.includes('history')) return jsonOk({ sessionId: 'room-named', items: [], working: true })
      return jsonOk({})
    }))
    render(<Conversation group={{ id: 'g', name: '编辑室', memberIds: [BOT.id], createdAt: 1, rounds: 3 }} members={[BOT]} />)
    const select = await screen.findByTestId('session-select')
    expect(select.textContent).toContain('选题讨论')
    fireEvent.click(select)
    const option = await screen.findByTestId('session-option-room-named')
    expect(option.textContent).toContain('选题讨论')
    expect(option.textContent).toContain('工作中')
  })

  it('names the empty group CTA after 新开房间', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('listGroupSessions')) {
        return jsonOk({ rooms: [{ roomId: 'room-1', groupId: 'g', createdAt: 1, updatedAt: 1 }] })
      }
      if (String(url).includes('history')) return jsonOk({ sessionId: 'room-1', items: [], working: false })
      return jsonOk({})
    }))
    render(<Conversation group={{ id: 'g', name: '编辑室', memberIds: [BOT.id], createdAt: 1, rounds: 3 }} members={[BOT]} />)
    const cta = await screen.findByTestId('empty-chat-cta')
    expect(cta.textContent).toMatch(/新开房间/)
    expect(cta.textContent).not.toMatch(/新开对话/)
  })

  it('loads a preferred session that is not yet in the switcher list', async () => {
    let listed = [{
      sessionId: 's-old',
      title: '旧',
      tags: [],
      status: 'idle' as const,
      createdAt: 1,
      updatedAt: 1,
      hidden: false,
      working: false,
    }]
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('listBotSessions')) return jsonOk({ sessions: listed })
      if (String(url).includes('history')) return jsonOk({ sessionId: 'x', items: [], working: false })
      return jsonOk({})
    }))
    const view = render(<Conversation bot={BOT} preferredSessionId="s-old" />)
    await vi.waitFor(() => {
      expect(screen.getByTestId('session-select').getAttribute('data-session-id')).toBe('s-old')
    })
    listed = [
      ...listed,
      {
        sessionId: 's-new',
        title: '新',
        tags: [],
        status: 'idle',
        createdAt: 2,
        updatedAt: 2,
        hidden: false,
        working: false,
      },
    ]
    view.rerender(<Conversation bot={BOT} preferredSessionId="s-new" />)
    await vi.waitFor(() => {
      expect(screen.getByTestId('session-select').getAttribute('data-session-id')).toBe('s-new')
    })
  })
})

describe('Conversation group rounds v2', () => {
  const GROUP = { id: 'g', name: '编辑室', memberIds: [BOT.id], createdAt: 1, rounds: 3 }
  const MEMBER_LINE = { id: 'a1', kind: 'message', seq: 1, role: 'assistant', text: '秋声', author: { botId: BOT.id, name: BOT.name, avatar: BOT.avatar } }

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    localStorage.clear()
    sessionStorage.clear()
  })

  type Reply = { json: () => Promise<unknown> }
  function stubRoom(handlers: Record<string, (args: Record<string, unknown>) => Reply>, history: () => unknown) {
    const calls: Array<[string, Record<string, unknown>]> = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { body?: string }) => {
      const method = String(url).split('/').pop()!
      const body: { args?: Record<string, unknown> } = JSON.parse(init?.body ?? '{}')
      const args = body.args ?? {}
      calls.push([method, args])
      if (method === 'listGroupSessions') return jsonOk({ rooms: [{ roomId: 'room-a', groupId: 'g', title: 'A', createdAt: 2, updatedAt: 2 }, { roomId: 'room-b', groupId: 'g', title: 'B', createdAt: 1, updatedAt: 1 }] })
      if (method === 'history') return jsonOk(history())
      const handler = handlers[method]
      return handler === undefined ? jsonOk({}) : handler(args)
    }))
    return calls
  }

  it('clears the composer when a busy room queues the prompt, and keeps the draft when the queue is full', async () => {
    let queueFull = false
    stubRoom({
      prompt: () => queueFull ? jsonErr('queue-full', 'room queue is full (max 3)') : jsonOk({ sessionId: 'room-a', queued: true, queueId: 'q1' }),
    }, () => ({ sessionId: 'room-a', working: true, items: [MEMBER_LINE], queued: [] }))
    render(<Conversation group={GROUP} members={[BOT]} />)
    const input = await screen.findByTestId('composer-input') as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: '再想想标题' } })
    await act(async () => { fireEvent.keyDown(input, { key: 'Enter' }) })
    await vi.waitFor(() => expect(input.value).toBe(''))
    expect(screen.queryByTestId('transcript-pending')).toBeNull()
    queueFull = true
    fireEvent.change(input, { target: { value: '第四条' } })
    await act(async () => { fireEvent.keyDown(input, { key: 'Enter' }) })
    expect(await screen.findByText('排队已满（最多 3 条）')).toBeTruthy()
    expect(input.value).toBe('第四条')
    expect(screen.queryByTestId('transcript-pending')).toBeNull()
  })

  it('renders queued rows from history and cancels one through cancelQueued', async () => {
    let queued = [{ queueId: 'q1', text: '再想想标题', createdAt: 1 }]
    const calls = stubRoom({
      cancelQueued: () => { queued = []; return jsonOk({ queueId: 'q1', cancelled: true }) },
    }, () => ({ sessionId: 'room-a', working: true, items: [MEMBER_LINE], queued }))
    render(<Conversation group={GROUP} members={[BOT]} />)
    fireEvent.click(await screen.findByTestId('queued-cancel-q1'))
    await vi.waitFor(() => expect(screen.queryByTestId('queued-row-q1')).toBeNull())
    expect(calls).toContainEqual(['cancelQueued', { sessionId: 'room-a', queueId: 'q1' }])
  })

  it('explains a cancel that lost the race and reports dropped prompts on stop', async () => {
    stubRoom({
      cancelQueued: () => jsonErr('not-found', '这条已开始讨论，无法取消'),
      cancel: () => jsonOk({ accepted: true, dropped: 2 }),
    }, () => ({ sessionId: 'room-a', working: true, items: [MEMBER_LINE], queued: [{ queueId: 'q1', text: '再想想', createdAt: 1 }] }))
    render(<Conversation group={GROUP} members={[BOT]} />)
    fireEvent.click(await screen.findByTestId('queued-cancel-q1'))
    expect((await screen.findByTestId('composer-toast')).textContent).toBe('这条已开始讨论，无法取消')
    await act(async () => { fireEvent.click(screen.getByTestId('composer-send')) })
    await vi.waitFor(() => expect(screen.getByTestId('composer-toast').textContent).toBe('已停止，排队的 2 条未发送'))
  })

  it('enables 让他们继续聊 only when idle with a member line, and calls continueDiscussion', async () => {
    let state: { working: boolean; items: unknown[] } = { working: false, items: [{ id: 'u', kind: 'message', seq: 1, role: 'user', text: '只有我' }] }
    const calls = stubRoom({ continueDiscussion: () => jsonOk({ sessionId: 'room-a', messageId: 'm-2' }) },
      () => ({ sessionId: 'room-a', ...state, queued: [] }))
    const view = render(<Conversation group={GROUP} members={[BOT]} />)
    const button = await screen.findByTestId('group-continue') as HTMLButtonElement
    await vi.waitFor(() => expect(button.title).toBe('先发一条消息开始讨论'))
    expect(button.disabled).toBe(true)
    state = { working: true, items: [MEMBER_LINE] }
    view.rerender(<Conversation group={GROUP} members={[BOT]} live={{ epoch: 1, cards: [], stream: null }} />)
    await vi.waitFor(() => expect(button.title).toBe('讨论进行中'))
    expect(button.disabled).toBe(true)
    state = { working: false, items: [MEMBER_LINE] }
    view.rerender(<Conversation group={GROUP} members={[BOT]} live={{ epoch: 2, cards: [], stream: null }} />)
    await vi.waitFor(() => expect(button.disabled).toBe(false))
    await act(async () => { fireEvent.click(button) })
    expect(calls).toContainEqual(['continueDiscussion', { sessionId: 'room-a' }])
  })

  it('deletes a room only after confirmation, keeps busy errors in the dialog, and selects the remaining room', async () => {
    let busy = true
    const calls = stubRoom({
      deleteGroupSession: () => busy ? jsonErr('invalid-input', 'room is busy') : jsonOk({ roomId: 'room-a', deleted: true }),
    }, () => ({ sessionId: 'room-a', working: false, items: [MEMBER_LINE], queued: [] }))
    render(<Conversation group={GROUP} members={[BOT]} />)
    await vi.waitFor(() => expect(screen.getByTestId('session-select').getAttribute('data-session-id')).toBe('room-a'))
    const openDialog = async (): Promise<void> => {
      fireEvent.click(screen.getByTestId('session-select'))
      fireEvent.click(await screen.findByTestId('session-menu-room-a'))
      fireEvent.click(screen.getByTestId('session-delete-room-a'))
    }
    await openDialog()
    expect(screen.getByRole('dialog').textContent).toContain('删除房间「A」？')
    fireEvent.click(screen.getByTestId('room-delete-cancel'))
    expect(screen.queryByTestId('room-delete-confirm')).toBeNull()
    expect(calls.some(([method]) => method === 'deleteGroupSession')).toBe(false)
    await openDialog()
    await act(async () => { fireEvent.click(screen.getByTestId('room-delete-ok')) })
    expect(screen.getByTestId('room-delete-error').textContent).toBe('房间正在讨论，先停止再删除')
    expect(screen.getByTestId('room-delete-confirm')).toBeTruthy()
    busy = false
    await act(async () => { fireEvent.click(screen.getByTestId('room-delete-ok')) })
    await vi.waitFor(() => expect(screen.queryByTestId('room-delete-confirm')).toBeNull())
    expect(screen.getByTestId('composer-toast').textContent).toBe('已删除房间')
  })

  it('shows no continue button, queue rows, or room delete in a 1:1 chat (INV-001)', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).endsWith('/listBotSessions')) return jsonOk({ sessions: [{ sessionId: 's1', title: '私聊', tags: [], status: 'idle', createdAt: 1, updatedAt: 1, hidden: false, working: false }] })
      if (String(url).endsWith('/history')) return jsonOk({ sessionId: 's1', working: false, items: [{ id: 'a', kind: 'message', seq: 1, role: 'assistant', text: 'hi' }] })
      return jsonOk({})
    }))
    render(<Conversation bot={BOT} />)
    await screen.findByTestId('composer-input')
    expect(screen.queryByTestId('group-continue')).toBeNull()
    expect(screen.queryByTestId('queued-list')).toBeNull()
    fireEvent.click(screen.getByTestId('session-select'))
    fireEvent.click(await screen.findByTestId('session-menu-s1'))
    expect(screen.queryByTestId('session-delete-s1')).toBeNull()
  })
})
