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

function stub(overrides: Partial<DshBotHttpFace> = {}): DshBotHttpFace {
  return {
    listSessions: vi.fn(async () => [ROW]),
    createSession: vi.fn(async () => ({ sessionId: SessionId('session-new'), title: 'DSH Bot' } satisfies CreateBotSessionResult)),
    currentBotModel: () => MODEL,
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
})
