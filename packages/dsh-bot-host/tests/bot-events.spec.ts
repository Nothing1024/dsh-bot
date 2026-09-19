/**
 * SSE filter: unmarked sessions stay off the wire; bot: / group-room: pass.
 */
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { put } from 'session-marks'
import {
  encodeSse,
  handleBotEventsHttp,
  marksAllowForward,
  muxFrameFromSessionEvent,
  unwrapFrame,
} from '../src/bot-events.ts'

const homes: string[] = []
const previousHome = process.env.DSH_HOME

afterEach(() => {
  while (homes.length > 0) {
    const home = homes.pop()
    if (home !== undefined) rmSync(home, { recursive: true, force: true })
  }
  if (previousHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousHome
})

function home(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-bot-events-'))
  mkdirSync(join(dir, 'session-tool'), { recursive: true })
  homes.push(dir)
  process.env.DSH_HOME = dir
  return dir
}

function mockReq(): IncomingMessage {
  const req = Readable.from([]) as IncomingMessage
  req.method = 'GET'
  req.url = '/dsh-bot/events'
  return req
}

function mockRes(): { res: ServerResponse; chunks: string[]; headers: Record<string, string> } {
  const chunks: string[] = []
  const headers: Record<string, string> = {}
  const res = new EventEmitter() as ServerResponse
  res.statusCode = 0
  Object.defineProperty(res, 'writableEnded', { configurable: true, writable: true, value: false })
  res.setHeader = ((name: string, value: string | number) => {
    headers[name] = String(value)
    return res
  }) as ServerResponse['setHeader']
  res.write = ((chunk: string) => {
    chunks.push(String(chunk))
    return true
  }) as ServerResponse['write']
  res.end = ((chunk?: string) => {
    if (chunk !== undefined) chunks.push(String(chunk))
    Object.defineProperty(res, 'writableEnded', { configurable: true, writable: true, value: true })
    res.emit('close')
    return res
  }) as ServerResponse['end']
  return { res, chunks, headers }
}

async function* ofItems(items: readonly unknown[]): AsyncIterable<unknown> {
  for (const item of items) yield item
}

describe('marksAllowForward', () => {
  it('accepts bot: and group-room: and rejects unmarked', () => {
    expect(marksAllowForward(['bot:xiaodui-aning'])).toBe(true)
    expect(marksAllowForward(['group-room:room-1'])).toBe(true)
    expect(marksAllowForward(['kind:dsh-bot'])).toBe(false)
    expect(marksAllowForward(undefined)).toBe(false)
  })
})

describe('unwrapFrame', () => {
  it('lifts rpcId off the RpcRequest wrapper', () => {
    expect(unwrapFrame({
      rpcId: 'rpc-1',
      payload: { type: 'approval/requested', sessionId: 's1' },
    })).toEqual({
      rpcId: 'rpc-1',
      frame: { type: 'approval/requested', sessionId: 's1' },
    })
  })
})

describe('muxFrameFromSessionEvent', () => {
  it('maps approval/asked onto a workbench card with rpcId', () => {
    expect(muxFrameFromSessionEvent({ id: 's1' }, {
      type: 'approval/asked',
      seq: 12,
      data: { id: 'ap-9', reason: 'bash' },
    })).toEqual({
      type: 'approval/requested',
      sessionId: 's1',
      seq: 12,
      approvalId: 'ap-9',
      rpcId: 'ap-9',
      message: 'bash',
      event: {
        type: 'approval/asked',
        seq: 12,
        data: { id: 'ap-9', reason: 'bash' },
      },
    })
  })

  it('keeps assistant chunks as session/event', () => {
    expect(muxFrameFromSessionEvent({ id: 's1' }, {
      type: 'assistant/chunk',
      seq: 3,
      data: { chunk: { type: 'text-delta', text: 'hi' } },
    })).toMatchObject({
      type: 'session/event',
      sessionId: 's1',
      event: { type: 'assistant/chunk' },
    })
  })
})

describe('handleBotEventsHttp', () => {
  it('routes a hidden member approval to its room without replacing its execution session', async () => {
    home()
    await put('member-session', ['bot:member', 'group-room:room-1', 'hidden'])
    const { res, chunks } = mockRes()
    await handleBotEventsHttp({
      subscribeMux: () => ofItems([{
        rpcId: 'approval-rpc',
        payload: { type: 'approval/requested', sessionId: 'member-session', approvalId: 'approval-1' },
      }]),
    }, mockReq(), res)
    const frames = chunks.join('').split('\n').filter(row => row.startsWith('data: ')).map(row => JSON.parse(row.slice(6)))
    expect(frames).toContainEqual({ type: 'approval/requested', sessionId: 'member-session', roomId: 'room-1', approvalId: 'approval-1', rpcId: 'approval-rpc' })
  })

  it('returns 503 when mux and host ducks are missing', async () => {
    const { res, chunks } = mockRes()
    await handleBotEventsHttp({}, mockReq(), res)
    expect(res.statusCode).toBe(503)
    expect(JSON.parse(chunks.join(''))).toMatchObject({
      ok: false,
      error: { code: 'events-unavailable' },
    })
  })

  it('forwards a bot-marked mux frame and drops an unmarked one', async () => {
    home()
    await put('session-bot', ['kind:dsh-bot', 'bot:xiaodui-aning'])
    await put('session-plain', ['kind:dsh-bot'])
    const { res, chunks, headers } = mockRes()
    await handleBotEventsHttp({
      subscribeMux: () => ofItems([
        { type: 'session/event', sessionId: 'session-plain', event: { type: 'assistant/chunk' } },
        {
          rpcId: 'rpc-chunk',
          payload: {
            type: 'session/event',
            sessionId: 'session-bot',
            event: { type: 'assistant/chunk', data: { chunk: { type: 'text-delta', text: '你好' } } },
          },
        },
      ]),
      listBotStatus: () => [{ botId: 'xiaodui-aning', working: false, unread: 2 }],
    }, mockReq(), res)
    expect(headers['Content-Type']).toContain('text/event-stream')
    const body = chunks.join('')
    expect(body).toContain('"type":"ready"')
    expect(body).toContain('"type":"bot/status"')
    expect(body).toContain('"botId":"xiaodui-aning"')
    expect(body).toContain('session-bot')
    expect(body).toContain('rpc-chunk')
    expect(body).not.toContain('session-plain')
  })
})

describe('encodeSse', () => {
  it('writes a data line', () => {
    expect(encodeSse({ type: 'ready' })).toBe('data: {"type":"ready"}\n\n')
  })
})

describe('createPlatform approval waterfall', () => {
  it('unblocks approval/request when the workbench responds', async () => {
    const { createPlatform } = await import('../src/platform.ts')
    const ctx = new Context()
    const platform = createPlatform(ctx)
    const ac = new AbortController()
    const mux = platform.subscribeMux?.(ac.signal)
    if (mux === undefined) throw new Error('mux missing')
    const frames: unknown[] = []
    const pump = (async () => {
      for await (const item of mux) {
        frames.push(item)
        if (frames.length >= 1) break
      }
    })()
    const decided = (ctx.waterfall as (...args: unknown[]) => Promise<unknown>)({ agent: { id: 's1' }, reason: 'bash' } as never, 'approval/request' as never, {
      agent: { id: 's1' },
      reason: 'bash',
    }, async () => 'unavailable')
    await new Promise(resolve => setTimeout(resolve, 0))
    const frame = frames[0] as { rpcId?: string; type?: string; sessionId?: string }
    expect(frame).toMatchObject({ type: 'approval/requested', sessionId: 's1' })
    expect(typeof frame.rpcId).toBe('string')
    await expect(platform.respond?.({
      rpcId: frame.rpcId ?? '',
      value: { sessionId: 's1', outcome: 'allowed-once' },
    })).resolves.toEqual({ ok: true })
    await expect(decided).resolves.toBe('allowed-once')
    ac.abort()
    await pump
  })
})
