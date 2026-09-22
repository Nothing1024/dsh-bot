/**
 * HTTP face: listSessions / createSession envelope and error mapping.
 */
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import { SessionToolError } from 'session-tool'
import { DshBotError } from '../src/errors.ts'
import { attachDshBotHttp, defaultCreateCwd } from '../src/routes.ts'
import type { DshBotHttpFace, DshBotModelInfo } from '../src/routes.ts'
import type { CreateBotSessionResult, DshBotSessionRow } from '../src/ask.ts'

function mockReq(method: string, url: string, body = ''): IncomingMessage {
  const req = Readable.from([body]) as IncomingMessage
  req.method = method
  req.url = url
  return req
}

function mockRes(): { res: ServerResponse; chunks: string[]; headers: Record<string, string> } {
  const chunks: string[] = []
  const headers: Record<string, string> = {}
  const res = new EventEmitter() as ServerResponse
  res.statusCode = 0
  res.setHeader = ((name: string, value: string | number) => {
    headers[name] = String(value)
    return res
  }) as ServerResponse['setHeader']
  res.write = ((chunk: string) => {
    chunks.push(chunk)
    return true
  }) as ServerResponse['write']
  res.end = ((chunk?: string) => {
    if (chunk !== undefined) chunks.push(chunk)
    res.emit('close')
    return res
  }) as ServerResponse['end']
  return { res, chunks, headers }
}

function attach(bot: DshBotHttpFace): {
  handler: (req: IncomingMessage, res: ServerResponse) => void
} {
  const ctx = new Context()
  let handler: ((req: IncomingMessage, res: ServerResponse) => void) | undefined
  Object.defineProperty(ctx, 'webServer', {
    value: {
      register: (route: { handler: (req: IncomingMessage, res: ServerResponse) => void }) => {
        handler = route.handler
        return () => undefined
      },
    },
  })
  attachDshBotHttp(ctx, bot)
  if (handler === undefined) throw new Error('handler not registered')
  return { handler }
}

const ROW: DshBotSessionRow = {
  sessionId: 'session-live',
  title: 'Plan',
  tags: ['kind:dsh-bot'],
  status: 'idle',
  createdAt: 1,
  hidden: false,
}

const MODEL: DshBotModelInfo = { provider: 'anthropic', model: 'grok-4.6', source: 'global-default' }

const BOT_VIEW = {
  id: 'dsh-bot',
  name: 'DSH Bot',
  avatar: { color: '#5b8def' },
  presetId: 'dsh-bot',
  createdAt: 1,
  persona: '你是 DSH Bot。',
  protected: true,
  pinned: false,
  section: 'work',
  hidden: false,
  order: 1,
  muted: false,
}

function stub(overrides: Partial<DshBotHttpFace> = {}): DshBotHttpFace {
  return {
    renameSession: async input => input,
    prepareOfficialJump: vi.fn(async input => input),
    listSessions: vi.fn(async () => [ROW]),
    createSession: vi.fn(async () => ({ sessionId: SessionId('session-new'), title: 'DSH Bot' } satisfies CreateBotSessionResult)),
    currentBotModel: () => MODEL,
    listBots: vi.fn(async () => ({ bots: [BOT_VIEW] })),
    createBot: vi.fn(async () => BOT_VIEW),
    updateBot: vi.fn(async () => BOT_VIEW),
    deleteBot: vi.fn(async () => ({ id: 'x', deleted: true as const })),
    createBotSession: vi.fn(async () => ({
      sessionId: 'session-owned-1',
      title: 'DSH Bot',
      botId: 'dsh-bot',
      presetId: 'dsh-bot',
    })),
    listBotSessions: vi.fn(async () => ({ sessions: [] })),
    history: vi.fn(async () => ({ sessionId: 'session-owned-1', items: [], working: false })),
    prompt: vi.fn(async () => ({ sessionId: 'session-owned-1' })),
    reconcile: vi.fn(async () => ({
      scanned: 0,
      labeled: 0,
      alreadyLabeled: 0,
      skippedNonBot: 0,
      skippedCached: 0,
      assigned: [],
    })),
    listGroups: vi.fn(async () => ({ groups: [] })),
    createGroup: vi.fn(async () => ({
      id: 'bianjishi',
      name: '编辑室',
      memberIds: ['dsh-bot', 'shiren-xiaobei'],
      rounds: 3,
      createdAt: 1,
      section: 'work',
      order: 1,
    })),
    updateGroup: vi.fn(async () => ({
      id: 'bianjishi',
      name: '编辑室',
      memberIds: ['dsh-bot', 'shiren-xiaobei'],
      rounds: 3,
      createdAt: 1,
      section: 'work',
      order: 1,
    })),
    deleteGroup: vi.fn(async () => ({ id: 'bianjishi', deleted: true as const })),
    createGroupSession: vi.fn(async () => ({
      roomId: 'room-1',
      groupId: 'bianjishi',
      createdAt: 1,
      updatedAt: 1,
    })),
    listGroupSessions: vi.fn(async () => ({ rooms: [] })),
    retryMember: vi.fn(async () => ({ roomId: 'room-1', botId: 'dsh-bot', accepted: true as const })),
    memoryList: vi.fn(async () => ({ profile: [], log: [] })),
    memoryRemember: vi.fn(async () => ({ id: 'm1' })),
    memoryForget: vi.fn(async () => ({ ok: true as const })),
    memoryClear: vi.fn(async () => ({ ok: true as const })),
    routineList: vi.fn(async () => []),
    routineCreate: vi.fn(async () => ({ id: 'r1' })),
    routineUpdate: vi.fn(async () => ({ id: 'r1' })),
    routineDelete: vi.fn(async () => ({ id: 'r1', deleted: true as const })),
    routineRunNow: vi.fn(async () => ({ outcome: 'spoke', ms: 1 })),
    routineDecline: vi.fn(async () => ({ ok: true as const, declined: [] })),
    markRead: vi.fn(async () => ({ ok: true as const, unread: 0 })),
    ...overrides,
  }
}

async function post(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
  path: string,
  body: unknown,
): Promise<{ status: number; json: unknown }> {
  const { res, chunks } = mockRes()
  handler(mockReq('POST', path, JSON.stringify(body)), res)
  await vi.waitFor(() => { expect(chunks.length).toBeGreaterThan(0) })
  return { status: res.statusCode, json: JSON.parse(chunks.join('')) as unknown }
}

describe('dsh-bot HTTP face', () => {
  it('skips register when webServer is absent', () => {
    const ctx = new Context()
    expect(() => attachDshBotHttp(ctx, stub())).not.toThrow()
  })

  it('lists sessions with botModel in the value object', async () => {
    const bot = stub()
    const { handler } = attach(bot)
    const { status, json } = await post(handler, '/dsh-bot/listSessions', { args: {} })
    expect(status).toBe(200)
    expect(json).toEqual({
      ok: true,
      value: { sessions: [ROW], botModel: MODEL },
    })
    expect(bot.listSessions).toHaveBeenCalledWith({ includeHidden: false })
  })

  it('forwards includeHidden', async () => {
    const bot = stub()
    const { handler } = attach(bot)
    await post(handler, '/dsh-bot/listSessions', { args: { includeHidden: true } })
    expect(bot.listSessions).toHaveBeenCalledWith({ includeHidden: true })
  })

  it('creates a visible session via CLI caller with a workspace cwd', async () => {
    const bot = stub()
    const { handler } = attach(bot)
    const { json } = await post(handler, '/dsh-bot/createSession', { args: { title: 'Plan' } })
    expect(json).toEqual({ ok: true, value: { sessionId: 'session-new', title: 'DSH Bot' } })
    const cwd = defaultCreateCwd()
    expect(bot.createSession).toHaveBeenCalledWith({ kind: 'cli' }, { title: 'Plan', cwd, workspacePath: cwd })
  })

  it('forwards an explicit cwd from args', async () => {
    const bot = stub()
    const { handler } = attach(bot)
    await post(handler, '/dsh-bot/createSession', { args: { cwd: '/work/plugin' } })
    expect(bot.createSession).toHaveBeenCalledWith(
      { kind: 'cli' },
      { cwd: '/work/plugin', workspacePath: '/work/plugin' },
    )
  })

  it('maps sessionTool error codes through', async () => {
    const bot = stub({
      listSessions: vi.fn(async () => {
        throw new SessionToolError('gateway down', 'web-unreachable')
      }),
    })
    const { handler } = attach(bot)
    const { json } = await post(handler, '/dsh-bot/listSessions', { args: {} })
    expect(json).toEqual({
      ok: false,
      error: { code: 'web-unreachable', message: 'gateway down' },
    })
  })

  it('unwraps SessionToolError carried as DshBotError cause', async () => {
    const bot = stub({
      createSession: vi.fn(async () => {
        throw new DshBotError('internal', 'unauthorized', {
          cause: new SessionToolError('nope', 'unauthorized'),
        })
      }),
    })
    const { handler } = attach(bot)
    const { json } = await post(handler, '/dsh-bot/createSession', { args: {} })
    expect(json).toEqual({
      ok: false,
      error: { code: 'unauthorized', message: 'nope' },
    })
  })

  it('maps unknown exceptions to internal', async () => {
    const bot = stub({
      listSessions: vi.fn(async () => {
        throw new Error('boom')
      }),
    })
    const { handler } = attach(bot)
    const { json } = await post(handler, '/dsh-bot/listSessions', { args: {} })
    expect(json).toEqual({
      ok: false,
      error: { code: 'internal', message: 'boom' },
    })
  })

  it('lists bots on POST /dsh-bot/listBots', async () => {
    const bot = stub()
    const { handler } = attach(bot)
    const { json } = await post(handler, '/dsh-bot/listBots', { args: {} })
    expect(json).toEqual({ ok: true, value: { bots: [BOT_VIEW] } })
  })

  it('creates a bot with the same {args} wire', async () => {
    const bot = stub()
    const { handler } = attach(bot)
    await post(handler, '/dsh-bot/createBot', {
      args: { name: '诗人小北', persona: '你是一位诗人' },
    })
    expect(bot.createBot).toHaveBeenCalledWith({ name: '诗人小北', persona: '你是一位诗人' })
  })

  it('creates an owned bot session on POST /dsh-bot/createBotSession', async () => {
    const bot = stub()
    const { handler } = attach(bot)
    const { json } = await post(handler, '/dsh-bot/createBotSession', {
      args: { botId: 'dsh-bot', title: 'Plan' },
    })
    expect(json).toEqual({
      ok: true,
      value: {
        sessionId: 'session-owned-1',
        title: 'DSH Bot',
        botId: 'dsh-bot',
        presetId: 'dsh-bot',
      },
    })
    expect(bot.createBotSession).toHaveBeenCalledWith({ botId: 'dsh-bot', title: 'Plan' })
  })

  it('lists owned sessions newest-first payload on POST /dsh-bot/listBotSessions', async () => {
    const bot = stub({
      listBotSessions: vi.fn(async () => ({
        sessions: [{
          sessionId: 'session-live',
          title: 'Plan',
          tags: ['kind:dsh-bot', 'bot:dsh-bot'],
          status: 'idle' as const,
          createdAt: 1,
          updatedAt: 2,
          hidden: false,
          working: false,
        }],
      })),
    })
    const { handler } = attach(bot)
    const { json } = await post(handler, '/dsh-bot/listBotSessions', { args: { botId: 'dsh-bot' } })
    expect(json).toEqual({
      ok: true,
      value: {
        sessions: [{
          sessionId: 'session-live',
          title: 'Plan',
          tags: ['kind:dsh-bot', 'bot:dsh-bot'],
          status: 'idle',
          createdAt: 1,
          updatedAt: 2,
          hidden: false,
          working: false,
        }],
      },
    })
  })

  it('runs POST /dsh-bot/reconcile with the {args} wire', async () => {
    const bot = stub({
      reconcile: vi.fn(async () => ({
        scanned: 2,
        labeled: 1,
        alreadyLabeled: 0,
        skippedNonBot: 1,
        skippedCached: 0,
        assigned: [{ sessionId: 'session-gui', botId: 'dsh-bot', reason: 'preset' as const }],
      })),
    })
    const { handler } = attach(bot)
    const { json } = await post(handler, '/dsh-bot/reconcile', { args: {} })
    expect(json).toEqual({
      ok: true,
      value: {
        scanned: 2,
        labeled: 1,
        alreadyLabeled: 0,
        skippedNonBot: 1,
        skippedCached: 0,
        assigned: [{ sessionId: 'session-gui', botId: 'dsh-bot', reason: 'preset' }],
      },
    })
    expect(bot.reconcile).toHaveBeenCalledTimes(1)
  })

  it('still serves v1 listSessions after workbench session methods exist', async () => {
    const bot = stub()
    const { handler } = attach(bot)
    const { json } = await post(handler, '/dsh-bot/listSessions', { args: {} })
    expect(json).toEqual({
      ok: true,
      value: { sessions: [ROW], botModel: MODEL },
    })
  })

  it('creates and lists groups on POST /dsh-bot/createGroup and listGroups', async () => {
    const bot = stub()
    const { handler } = attach(bot)
    const created = await post(handler, '/dsh-bot/createGroup', {
      args: { name: '编辑室', memberIds: ['dsh-bot', 'shiren-xiaobei'] },
    })
    expect(created.json).toEqual({
      ok: true,
      value: {
        id: 'bianjishi',
        name: '编辑室',
        memberIds: ['dsh-bot', 'shiren-xiaobei'],
        rounds: 3,
        createdAt: 1,
        section: 'work',
        order: 1,
      },
    })
    expect(bot.createGroup).toHaveBeenCalledWith({
      name: '编辑室',
      memberIds: ['dsh-bot', 'shiren-xiaobei'],
    })
    await post(handler, '/dsh-bot/listGroups', { args: {} })
    expect(bot.listGroups).toHaveBeenCalledTimes(1)
  })
})

describe('GET /dsh-bot/events', () => {
  it('returns 503 when events ducks are missing', async () => {
    const { handler } = attach(stub())
    const { res, chunks } = mockRes()
    handler(mockReq('GET', '/dsh-bot/events'), res)
    await vi.waitFor(() => { expect(chunks.length).toBeGreaterThan(0) })
    expect(res.statusCode).toBe(503)
    expect(JSON.parse(chunks.join(''))).toMatchObject({
      ok: false,
      error: { code: 'events-unavailable' },
    })
  })

  it('still rejects GET on other methods with 405', async () => {
    const { handler } = attach(stub())
    const { res, chunks } = mockRes()
    handler(mockReq('GET', '/dsh-bot/listSessions'), res)
    await vi.waitFor(() => { expect(chunks.length).toBeGreaterThan(0) })
    expect(res.statusCode).toBe(405)
  })
})
