// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    localStorage.clear()
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
    expect((screen.getByTestId('composer-send') as HTMLButtonElement).disabled).toBe(true)
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

  it('keeps send disabled after prompt until history reports the turn idle', async () => {
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
      expect((screen.getByTestId('composer-input') as HTMLTextAreaElement).disabled).toBe(true)
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
    })
    expect(screen.getByTestId('session-select').textContent).toMatch(/旧稿/)
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

  it('offers a current-session menu that copies the id when standalone', async () => {
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
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
    expect(jump.getAttribute('title')).toBe('在右栏页签内可直接跳转')
    fireEvent.click(jump)
    expect(await screen.findByTestId('conversation-toast')).toHaveProperty('textContent', '已复制会话 ID')
    expect(writeText).toHaveBeenCalledWith('s1')
  })

  it('does not offer DSH jump on group rooms', async () => {
    const group = { id: 'bianji-shi', name: '编辑室', memberIds: [BOT.id], createdAt: 1 }
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
    expect(screen.queryByTestId('session-current-menu')).toBeNull()
    fireEvent.click(trigger)
    expect(screen.getByTestId('session-option-room-1')).toBeTruthy()
    expect(screen.queryByTestId('session-menu-room-1')).toBeNull()
  })

  it('sets a reply card from the group message menu and clears it after send', async () => {
    const group = { id: 'bianji-shi', name: '编辑室', memberIds: [BOT.id], createdAt: 1 }
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
    const head = screen.getByTestId('conversation-pane').querySelector('.headActions')
    const children = [...(head?.children ?? [])]
    expect(children[0]?.className).toMatch(/memorySwitch/)
    expect(children[1]?.className).toMatch(/sessionSwitch/)
    fireEvent.click(pill)
    expect(await screen.findByTestId('memory-panel')).toBeTruthy()
    expect(screen.getByTestId('memory-profile').textContent).toMatch(/Nothing/)
  })
})
