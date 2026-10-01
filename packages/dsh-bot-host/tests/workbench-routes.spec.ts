/**
 * Static /dsh-bot/ui: doctype html, content types, no path traversal.
 */
import { EventEmitter } from 'node:events'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { attachWorkbenchHttp, handleWorkbenchStatic, safeWorkbenchFile, dispatchWorkbenchApi } from '../src/workbench-routes.ts'

function mockReq(method: string, url: string): IncomingMessage {
  const req = Readable.from([]) as IncomingMessage
  req.method = method
  req.url = url
  return req
}

function mockRes(): { res: ServerResponse; chunks: Buffer[]; headers: Record<string, string> } {
  const chunks: Buffer[] = []
  const headers: Record<string, string> = {}
  const res = new EventEmitter() as ServerResponse
  res.statusCode = 0
  res.setHeader = ((name: string, value: string | number) => {
    headers[name] = String(value)
    return res
  }) as ServerResponse['setHeader']
  res.write = ((chunk: string | Buffer) => {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
    return true
  }) as ServerResponse['write']
  res.end = ((chunk?: string | Buffer) => {
    if (chunk !== undefined) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
    res.emit('close')
    return res
  }) as ServerResponse['end']
  return { res, chunks, headers }
}

async function get(root: string, url: string, method = 'GET'): Promise<{ status: number; body: string; headers: Record<string, string> }> {
  const { res, chunks, headers } = mockRes()
  await handleWorkbenchStatic(mockReq(method, url), res, root)
  return { status: res.statusCode, body: Buffer.concat(chunks).toString('utf8'), headers }
}

describe('workbench static', () => {
  let root = ''

  afterEach(() => {
    if (root !== '') rmSync(root, { recursive: true, force: true })
    root = ''
  })

  function seed(): string {
    root = mkdtempSync(join(tmpdir(), 'dsh-bot-ui-'))
    writeFileSync(join(root, 'index.html'), '<!doctype html>\n<html><body>ok</body></html>\n')
    writeFileSync(join(root, 'workbench.js'), 'console.log(1)\n')
    writeFileSync(join(root, 'workbench.css'), 'body{margin:0}\n')
    mkdirSync(join(root, 'nested'), { recursive: true })
    writeFileSync(join(root, 'nested', 'x.txt'), 'secret\n')
    return root
  }

  it('serves index.html at /dsh-bot/ui with html content type', async () => {
    const dir = seed()
    const { status, body, headers } = await get(dir, '/dsh-bot/ui')
    expect(status).toBe(200)
    expect(body.startsWith('<!doctype html>')).toBe(true)
    expect(headers['Content-Type']).toMatch(/text\/html/)
  })

  it('serves js and css with matching types', async () => {
    const dir = seed()
    const js = await get(dir, '/dsh-bot/ui/workbench.js')
    expect(js.status).toBe(200)
    expect(js.headers['Content-Type']).toMatch(/javascript/)
    const css = await get(dir, '/dsh-bot/ui/workbench.css')
    expect(css.status).toBe(200)
    expect(css.headers['Content-Type']).toMatch(/text\/css/)
  })

  it('rejects path traversal', async () => {
    const dir = seed()
    const slash = await get(dir, '/dsh-bot/ui/../index.html')
    expect(slash.status).toBe(403)
    const encoded = await get(dir, '/dsh-bot/ui/%2e%2e/index.html')
    expect(encoded.status).toBe(403)
    expect(safeWorkbenchFile('/dsh-bot/ui/foo/../../secret', dir)).toBeUndefined()
  })

  it('returns 404 for missing assets', async () => {
    const dir = seed()
    const { status } = await get(dir, '/dsh-bot/ui/missing.js')
    expect(status).toBe(404)
  })

  it('registers the /dsh-bot/ui prefix', () => {
    const ctx = new Context()
    const paths: string[] = []
    Object.defineProperty(ctx, 'webServer', {
      value: {
        register: (route: { path: string }) => {
          paths.push(route.path)
          return () => undefined
        },
      },
    })
    attachWorkbenchHttp(ctx, { root: seed() })
    expect(paths).toContain('/dsh-bot/ui')
  })
})


describe('memory RPC dispatch', () => {
  const calls: string[] = []
  const face = {
    async memoryList(input: { botId: string }) {
      calls.push(`list:${input.botId}`)
      return { profile: [{ id: '1', text: '用户叫 Nothing', ts: 1 }], log: [] }
    },
    async memoryRemember(input: { botId: string; text: string }) {
      calls.push(`remember:${input.botId}:${input.text}`)
      return { id: 'n1' }
    },
    async memoryForget(input: { botId: string; id: string }) {
      calls.push(`forget:${input.botId}:${input.id}`)
      return { ok: true }
    },
    async memoryClear(input: { botId: string }) {
      calls.push(`clear:${input.botId}`)
      return { ok: true }
    },
    async routineList(input: { botId?: string } = {}) {
      calls.push(`rlist:${input.botId ?? ''}`)
      return []
    },
    async routineCreate(input: { botId: string; name: string; schedule: string; instruction: string }) {
      calls.push(`rcreate:${input.botId}:${input.name}`)
      return { id: 'r1', ...input }
    },
    async routineUpdate(input: { id: string }) {
      calls.push(`rupd:${input.id}`)
      return { id: input.id }
    },
    async routineDelete(input: { id: string }) {
      calls.push(`rdel:${input.id}`)
      return { id: input.id, deleted: true as const }
    },
    async routineRunNow(input: { id: string }) {
      calls.push(`rnow:${input.id}`)
      return { outcome: 'spoke', ms: 1 }
    },
    async routineDecline(input: { botId: string; topic: string }) {
      calls.push(`rdec:${input.botId}:${input.topic}`)
      return { ok: true as const, declined: [input.topic] }
    },
    async markRead(input: { botId: string }) {
      calls.push(`read:${input.botId}`)
      return { ok: true as const, unread: 0 }
    },
  }

  it('dispatches the four memory methods', async () => {
    const { dispatchWorkbenchApi } = await import('../src/workbench-routes.ts')
    const bot = face as unknown as Parameters<typeof dispatchWorkbenchApi>[0]
    expect(await dispatchWorkbenchApi(bot, 'memoryList', { botId: 'xiaodui-aning' })).toMatchObject({
      profile: [{ text: '用户叫 Nothing' }],
    })
    expect(await dispatchWorkbenchApi(bot, 'memoryRemember', { botId: 'xiaodui-aning', text: '钉住' })).toEqual({
      id: 'n1',
    })
    expect(await dispatchWorkbenchApi(bot, 'memoryForget', { botId: 'xiaodui-aning', id: '1' })).toEqual({
      ok: true,
    })
    expect(await dispatchWorkbenchApi(bot, 'memoryClear', { botId: 'xiaodui-aning' })).toEqual({
      ok: true,
    })
    expect(calls).toEqual([
      'list:xiaodui-aning',
      'remember:xiaodui-aning:钉住',
      'forget:xiaodui-aning:1',
      'clear:xiaodui-aning',
    ])
  })
})


describe('routine RPC dispatch', () => {
  it('routes routineList and markRead', async () => {
    const { dispatchWorkbenchApi } = await import('../src/workbench-routes.ts')
    const calls: string[] = []
    const bot = {
      async routineList(input: { botId?: string } = {}) {
        calls.push(`rlist:${input.botId ?? ''}`)
        return []
      },
      async markRead(input: { botId: string }) {
        calls.push(`read:${input.botId}`)
        return { ok: true as const, unread: 0 }
      },
    }
    expect(await dispatchWorkbenchApi(bot as never, 'routineList', { botId: 'ops' })).toEqual([])
    expect(await dispatchWorkbenchApi(bot as never, 'markRead', { botId: 'ops' })).toEqual({ ok: true, unread: 0 })
    expect(calls).toEqual(['rlist:ops', 'read:ops'])
  })
})

describe('live-transcript RPC dispatch', () => {
  it('routes cancel / approvalRespond / questionRespond', async () => {
    const cancel = vi.fn(async () => ({ accepted: true }))
    const approvalRespond = vi.fn(async () => ({ ok: true }))
    const questionRespond = vi.fn(async () => ({ ok: true }))
    const bot = {
      cancel,
      approvalRespond,
      questionRespond,
    } as unknown as Parameters<typeof dispatchWorkbenchApi>[0]
    await expect(dispatchWorkbenchApi(bot, 'cancel', { sessionId: 's1' })).resolves.toEqual({ accepted: true })
    await expect(dispatchWorkbenchApi(bot, 'approvalRespond', {
      rpcId: 'rpc-1',
      sessionId: 's1',
      approvalId: 'ap-1',
      outcome: 'allowed-once',
    })).resolves.toEqual({ ok: true })
    await expect(dispatchWorkbenchApi(bot, 'questionRespond', {
      rpcId: 'rpc-2',
      sessionId: 's1',
      answer: { answers: [] },
    })).resolves.toEqual({ ok: true })
    expect(cancel).toHaveBeenCalledWith({ sessionId: 's1' })
    expect(approvalRespond).toHaveBeenCalledWith({
      rpcId: 'rpc-1',
      sessionId: 's1',
      approvalId: 'ap-1',
      outcome: 'allowed-once',
    })
  })
})

describe('peers RPC dispatch', () => {
  it('routes peerLog', async () => {
    const peerLog = vi.fn(async () => [{ from: 'a', to: 'b', ts: 1, sessionId: 's' }])
    const bot = { peerLog } as unknown as Parameters<typeof dispatchWorkbenchApi>[0]
    await expect(dispatchWorkbenchApi(bot, 'peerLog', { botId: 'a' })).resolves.toEqual([
      { from: 'a', to: 'b', ts: 1, sessionId: 's' },
    ])
    expect(peerLog).toHaveBeenCalledWith({ botId: 'a' })
  })

  it('routes sendToPeer', async () => {
    const sendToPeer = vi.fn(async () => ({ ok: true, accepted: true, sessionId: 'p1' }))
    const bot = { sendToPeer } as unknown as Parameters<typeof dispatchWorkbenchApi>[0]
    await expect(dispatchWorkbenchApi(bot, 'sendToPeer', {
      toBot: 'shiren-xiaobei',
      text: '封面用深蓝',
      fromBot: 'xiaodui-aning',
    })).resolves.toEqual({ ok: true, accepted: true, sessionId: 'p1' })
  })
})

describe('roster layout RPC', () => {
  it('routes updateBotLayout', async () => {
    const updateBotLayout = vi.fn(async () => ({ ok: true, skipped: ['x'], sections: [] }))
    const bot = { updateBotLayout } as unknown as Parameters<typeof dispatchWorkbenchApi>[0]
    await expect(dispatchWorkbenchApi(bot, 'updateBotLayout', {
      bots: [{ id: 'a', hidden: true }],
    })).resolves.toEqual({ ok: true, skipped: ['x'], sections: [] })
  })
})

describe('retryMember RPC dispatch', () => {
  it('routes retryMember with roomId and errorSeq', async () => {
    const retryMember = vi.fn(async () => ({ roomId: 'r1', botId: 'dsh-bot', accepted: true as const }))
    const bot = { retryMember } as unknown as Parameters<typeof dispatchWorkbenchApi>[0]
    await expect(dispatchWorkbenchApi(bot, 'retryMember', {
      roomId: 'r1',
      botId: 'dsh-bot',
      errorSeq: 3,
    })).resolves.toEqual({ roomId: 'r1', botId: 'dsh-bot', accepted: true })
    expect(retryMember).toHaveBeenCalledWith({ roomId: 'r1', botId: 'dsh-bot', errorSeq: 3 })
  })
})

describe('group room RPC dispatch', () => {
  it('routes continueDiscussion / cancelQueued / deleteGroupSession with trimmed ids', async () => {
    const continueDiscussion = vi.fn(async () => ({ sessionId: 'r1', messageId: 'm-9' }))
    const cancelQueued = vi.fn(async () => ({ queueId: 'q1', cancelled: true as const }))
    const deleteGroupSession = vi.fn(async () => ({ roomId: 'r1', deleted: true as const }))
    const bot = { continueDiscussion, cancelQueued, deleteGroupSession } as unknown as Parameters<typeof dispatchWorkbenchApi>[0]
    await expect(dispatchWorkbenchApi(bot, 'continueDiscussion', { sessionId: ' r1 ' })).resolves.toEqual({ sessionId: 'r1', messageId: 'm-9' })
    await expect(dispatchWorkbenchApi(bot, 'cancelQueued', { sessionId: 'r1', queueId: 'q1' })).resolves.toEqual({ queueId: 'q1', cancelled: true })
    await expect(dispatchWorkbenchApi(bot, 'deleteGroupSession', { sessionId: 'r1' })).resolves.toEqual({ roomId: 'r1', deleted: true })
    expect(continueDiscussion).toHaveBeenCalledWith({ sessionId: 'r1' })
    expect(cancelQueued).toHaveBeenCalledWith({ sessionId: 'r1', queueId: 'q1' })
    expect(deleteGroupSession).toHaveBeenCalledWith({ sessionId: 'r1' })
  })

  it('rejects missing ids before reaching the face', async () => {
    const face = vi.fn()
    const bot = { continueDiscussion: face, cancelQueued: face, deleteGroupSession: face } as unknown as Parameters<typeof dispatchWorkbenchApi>[0]
    await expect(dispatchWorkbenchApi(bot, 'continueDiscussion', {})).rejects.toMatchObject({ code: 'invalid-input' })
    await expect(dispatchWorkbenchApi(bot, 'cancelQueued', { sessionId: 'r1' })).rejects.toMatchObject({ code: 'invalid-input' })
    await expect(dispatchWorkbenchApi(bot, 'deleteGroupSession', { sessionId: '  ' })).rejects.toMatchObject({ code: 'invalid-input' })
    expect(face).not.toHaveBeenCalled()
  })
})
