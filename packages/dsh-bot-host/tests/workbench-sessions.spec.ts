/**
 * Workbench session chain: ownership marks, hidden exclusion, history
 * projection (Task 8).
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import { get, put } from 'session-marks'
import type {
  SessionToolCaller,
  SessionToolListResult,
  SessionToolMessageRow,
  SessionToolService,
} from 'session-tool'
import DshBotService from '../src/index.ts'
import type { DshBotConfig } from '../src/index.ts'
import { DshBotError } from '../src/errors.ts'
import { botMark } from '../src/marks.ts'
import type { DshBotModelRef, DshBotPlatform } from '../src/platform.ts'
import {
  projectWorkbenchHistory,
  turnIsOpen,
} from '../src/workbench-sessions.ts'

const CLI: SessionToolCaller = { kind: 'cli' }

const BASE_CONFIG: DshBotConfig = {
  webUrl: 'http://127.0.0.1:3084',
  askTimeoutMs: 30_000,
}

class StubSessionTool implements SessionToolService {
  readonly createCalls: unknown[] = []
  readonly writeCalls: Array<{ sessionId: string; content: string }> = []
  readonly readCalls: Array<{ sessionId: string; sinceSeq?: number }> = []
  listResult: SessionToolListResult = { sessions: [] }
  private readonly replies = new Map<string, readonly SessionToolMessageRow[]>()

  setReply(sessionId: string, messages: readonly SessionToolMessageRow[]): void {
    this.replies.set(sessionId, messages)
  }

  async create(caller: SessionToolCaller, options: Parameters<SessionToolService['create']>[1]) {
    this.createCalls.push({ caller, options })
    return { sessionId: SessionId('session-tool-created') }
  }

  async write(_caller: SessionToolCaller, sessionId: SessionId, content: string) {
    this.writeCalls.push({ sessionId: String(sessionId), content })
    return { sessionId }
  }

  async wait(_caller: SessionToolCaller, sessionId: SessionId) {
    return { sessionId, status: 'idle' as const }
  }

  async read(
    _caller: SessionToolCaller,
    sessionId: SessionId,
    options: Parameters<SessionToolService['read']>[2],
  ) {
    this.readCalls.push({
      sessionId: String(sessionId),
      ...options?.sinceSeq === undefined ? {} : { sinceSeq: options.sinceSeq },
    })
    return { sessionId, messages: this.replies.get(String(sessionId)) ?? [] }
  }

  async list() {
    return this.listResult
  }

  async rename(_caller: SessionToolCaller, sessionId: SessionId) {
    return { sessionId }
  }

  async collect() {
    return { satisfied: false, sessions: [], elapsedMs: 0 }
  }

  async workspaceAdd() {
    return { workspaceId: 'ws', path: '/tmp', created: true }
  }

  async workspaceList() {
    return { workspaces: [], archivedSessionIds: [] }
  }

  async workspaceRename() {
    return { workspaceId: 'ws', title: 't' }
  }

  async workspaceDelete() {
    return { workspaceId: 'ws', deleted: true }
  }
}

class StubPlatform implements DshBotPlatform {
  readonly createCalls: Array<{ agentPreset: string; cwd: string }> = []
  readonly renameCalls: Array<{ sessionId: string; title: string }> = []
  readonly selectCalls: Array<{ sessionId: string; model: DshBotModelRef }> = []
  readonly restoreCalls: DshBotModelRef[] = []
  global: DshBotModelRef = { provider: 'anthropic', model: 'grok-4.6', reasoningEffort: 'xhigh' }
  gatewayRows: Array<{ sessionId: string; running: boolean; updatedAt: number; agentPreset?: string }> = []
  private next = 0

  async archiveSession() {}

  async selectModel(sessionId: string, model: DshBotModelRef) {
    this.selectCalls.push({ sessionId, model })
    this.global = { ...model }
  }

  snapshotGlobalDefault() {
    return { ...this.global }
  }

  async restoreGlobalDefault(model: DshBotModelRef) {
    this.restoreCalls.push(model)
    this.global = { ...model }
  }

  async createSession(request: { agentPreset: string; cwd: string }) {
    this.createCalls.push({ agentPreset: request.agentPreset, cwd: request.cwd })
    this.next += 1
    return { sessionId: `session-owned-${this.next}`, agentPreset: request.agentPreset }
  }

  async renameSession(sessionId: string, title: string) {
    this.renameCalls.push({ sessionId, title })
  }

  async listSessions() {
    return this.gatewayRows
  }
}

const homes: string[] = []
const previousHome = process.env.DSH_HOME

beforeEach(() => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-bot-wb-'))
  homes.push(home)
  process.env.DSH_HOME = home
})

afterEach(() => {
  while (homes.length > 0) {
    const home = homes.pop()
    if (home !== undefined) rmSync(home, { recursive: true, force: true })
  }
  if (previousHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousHome
})

function boot(options: {
  sessionTool?: StubSessionTool
  platform?: StubPlatform
  config?: DshBotConfig
} = {}): { bot: DshBotService; sessionTool: StubSessionTool; platform: StubPlatform; ctx: Context } {
  const sessionTool = options.sessionTool ?? new StubSessionTool()
  const platform = options.platform ?? new StubPlatform()
  const ctx = new Context()
  ctx.provide('sessionTool', sessionTool)
  const bot = new DshBotService(ctx, { ...BASE_CONFIG, ...options.config }, platform)
  return { bot, sessionTool, platform, ctx }
}

describe('botMark', () => {
  it('formats the bot:<id> token', () => {
    expect(botMark('dsh-bot')).toBe('bot:dsh-bot')
    expect(botMark('shiren-xiaobei')).toBe('bot:shiren-xiaobei')
  })
})

describe('projectWorkbenchHistory', () => {
  it('projects role/text/thinking/tool summary/seq and drops tool arguments', () => {
    const items = projectWorkbenchHistory([
      {
        seq: 1,
        role: 'user',
        blocks: [{ type: 'text', text: '你是谁?' }],
      },
      {
        seq: 2,
        role: 'assistant',
        blocks: [
          { type: 'reasoning', text: 'remember persona' },
          { type: 'text', text: '我是诗人小北' },
          { type: 'tool-call', id: 'c1', name: 'bash', arguments: '{"cmd":"secret"}' },
        ],
      },
      {
        seq: 3,
        role: 'tool',
        blocks: [{ type: 'tool-result', toolCallId: 'c1', content: [], isError: false }],
      },
    ] as SessionToolMessageRow[])
    expect(items.map(item => item.kind)).toEqual(['message', 'thinking', 'tool', 'message', 'tool'])
    expect(items.find(item => item.kind === 'thinking')).toMatchObject({ seq: 2, text: 'remember persona' })
    expect(items.find(item => item.kind === 'tool' && item.seq === 2)).toMatchObject({
      name: 'bash',
      summary: 'bash',
    })
    expect(JSON.stringify(items)).not.toMatch(/secret/)
    expect(JSON.stringify(items)).not.toMatch(/arguments/)
    expect(items.find(item => item.role === 'assistant')?.text).toBe('我是诗人小北')
    expect(items[0]).toMatchObject({ kind: 'message', role: 'user', text: '你是谁?', seq: 1 })
    expect(items.find(item => item.kind === 'thinking')?.id).toBe('thinking-2-1')
    expect(items.find(item => item.kind === 'message' && item.role === 'assistant')?.id).toBe('message-2-1')
  })

  it('mints stable ids for the same seq whether projected alone or in a full page', () => {
    const last = {
      seq: 55,
      role: 'assistant' as const,
      blocks: [
        { type: 'reasoning', text: 'think' },
        { type: 'text', text: '我是诗人小北' },
      ],
    }
    const full = projectWorkbenchHistory([
      { seq: 8, role: 'user', blocks: [{ type: 'text', text: '你是谁?' }] },
      last,
    ] as SessionToolMessageRow[])
    const tail = projectWorkbenchHistory([last] as SessionToolMessageRow[])
    expect(tail.map(item => item.id)).toEqual(
      full.filter(item => item.seq === 55).map(item => item.id),
    )
    expect(tail.map(item => item.id)).toEqual(['thinking-55-1', 'message-55-1'])
  })

  it('drops platform-injected user context from the transcript', () => {
    const items = projectWorkbenchHistory([
      { seq: 1, role: 'user', blocks: [{ type: 'text', text: '你是谁?' }] },
      { seq: 2, role: 'user', blocks: [{ type: 'text', text: 'Current runtime context. This snapshot supersedes earlier runtime-context snapshots.\n\nCurrent DSH file policy: workspace-write.' }] },
      { seq: 3, role: 'user', blocks: [{ type: 'text', text: '<system-reminder>\nA skill is a reusable set.\n<available_skills></available_skills>\n</system-reminder>' }] },
      { seq: 4, role: 'assistant', blocks: [{ type: 'text', text: '我是诗人小北' }] },
    ] as SessionToolMessageRow[])
    expect(items.filter(item => item.kind === 'message').map(item => item.text)).toEqual([
      '你是谁?',
      '我是诗人小北',
    ])
  })
})

describe('turnIsOpen', () => {
  it('is true while turn/start has no matching turn/end', () => {
    expect(turnIsOpen([
      { type: 'turn/start', data: { turn: 1 } },
      { type: 'step/start', data: { turn: 1, step: 1 } },
    ])).toBe(true)
    expect(turnIsOpen([
      { type: 'turn/start', data: { turn: 1 } },
      { type: 'turn/end', data: { turn: 1, reason: 'stop' } },
    ])).toBe(false)
  })
})

describe('createBotSession / listBotSessions / history / prompt', () => {
  it('creates via gateway session.create, marks bot:<id>, and skips sessionTool.create', async () => {
    const { bot, sessionTool, platform } = boot()
    await bot.listBots()
    const created = await bot.createBotSession({ botId: 'dsh-bot', title: 'Plan' })
    expect(created.sessionId).toBe('session-owned-1')
    expect(created.botId).toBe('dsh-bot')
    expect(created.presetId).toBe('dsh-bot')
    expect(platform.createCalls).toEqual([
      { agentPreset: 'dsh-bot', cwd: join(process.env.DSH_HOME!, '..') },
    ])
    expect(sessionTool.createCalls).toHaveLength(0)
    expect(await get('session-owned-1')).toEqual(expect.arrayContaining(['kind:dsh-bot', 'bot:dsh-bot']))
    expect(platform.renameCalls).toEqual([{ sessionId: 'session-owned-1', title: 'Plan' }])
    expect(platform.selectCalls[0]?.sessionId).toBe('session-owned-1')
  })

  it('applies the per-bot modelOverride via the v1 platform gate', async () => {
    const { bot, platform } = boot({
      config: {
        ...BASE_CONFIG,
        model: { provider: 'deepseek', model: 'deepseek-v4-flash' },
      },
    })
    await bot.listBots()
    await bot.createBotSession({ botId: 'dsh-bot' })
    expect(platform.selectCalls[0]!.model).toEqual({
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
    })
  })

  it('lists bot:<id> intersection, drops hidden by default, newest first', async () => {
    const sessionTool = new StubSessionTool()
    const platform = new StubPlatform()
    await put('session-old', ['kind:dsh-bot', 'bot:dsh-bot'])
    await put('session-new', ['kind:dsh-bot', 'bot:dsh-bot'])
    await put('session-hidden', ['kind:dsh-bot', 'bot:dsh-bot', 'kind:hidden'])
    await put('session-other', ['kind:dsh-bot', 'bot:other'])
    sessionTool.listResult = {
      sessions: [
        {
          sessionId: SessionId('session-old'),
          title: 'Old',
          tags: ['kind:dsh-bot', 'bot:dsh-bot'],
          status: 'idle',
          createdAt: 10,
        },
        {
          sessionId: SessionId('session-new'),
          title: 'New',
          tags: ['kind:dsh-bot', 'bot:dsh-bot'],
          status: 'idle',
          createdAt: 30,
        },
        {
          sessionId: SessionId('session-hidden'),
          title: '~dsh-bot: q',
          tags: ['kind:dsh-bot', 'bot:dsh-bot', 'kind:hidden'],
          status: 'idle',
          createdAt: 40,
        },
        {
          sessionId: SessionId('session-other'),
          title: 'Other',
          tags: ['kind:dsh-bot', 'bot:other'],
          status: 'idle',
          createdAt: 50,
        },
      ],
    }
    platform.gatewayRows = [
      { sessionId: 'session-old', running: false, updatedAt: 10 },
      { sessionId: 'session-new', running: true, updatedAt: 90 },
    ]
    const { bot } = boot({ sessionTool, platform })
    await bot.listBots()
    const listed = await bot.listBotSessions({ botId: 'dsh-bot' })
    expect(listed.sessions.map(row => row.sessionId)).toEqual(['session-new', 'session-old'])
    expect(listed.sessions[0]?.working).toBe(true)
    const withHidden = await bot.listBotSessions({ botId: 'dsh-bot', includeHidden: true })
    expect(withHidden.sessions.map(row => row.sessionId)).toEqual([
      'session-new',
      'session-hidden',
      'session-old',
    ])
  })

  it('reads history through sessionTool and reports working from unmatched turn/start', async () => {
    const sessionTool = new StubSessionTool()
    sessionTool.setReply('session-owned-1', [
      { seq: 4, role: 'user', blocks: [{ type: 'text', text: 'hi' }] },
      {
        seq: 5,
        role: 'assistant',
        blocks: [{ type: 'reasoning', text: 'think' }, { type: 'text', text: 'hello' }],
      },
    ] as SessionToolMessageRow[])
    const { bot, ctx } = boot({ sessionTool })
    ctx.provide('sessions', {
      get: () => ({
        events: [
          { type: 'turn/start', data: { turn: 2 } },
        ],
      }),
    })
    const history = await bot.history({ sessionId: 'session-owned-1' })
    expect(history.working).toBe(true)
    expect(history.items.some(item => item.kind === 'thinking' && item.text === 'think')).toBe(true)
    expect(history.items.some(item => item.kind === 'message' && item.role === 'assistant')).toBe(true)
    expect(sessionTool.readCalls[0]).toEqual({ sessionId: 'session-owned-1' })
  })

  it('prompts via sessionTool.write with the CLI caller', async () => {
    const { bot, sessionTool } = boot()
    const result = await bot.prompt({ sessionId: 'session-owned-1', text: '  你是谁?  ' })
    expect(result).toEqual({ sessionId: 'session-owned-1' })
    expect(sessionTool.writeCalls).toEqual([{ sessionId: 'session-owned-1', content: '你是谁?' }])
  })

  it('rejects an empty prompt loud', async () => {
    const { bot } = boot()
    await expect(bot.prompt({ sessionId: 's1', text: '   ' })).rejects.toMatchObject({
      code: 'empty-prompt',
    })
  })

  it('rejects an unknown botId', async () => {
    const { bot } = boot()
    await bot.listBots()
    await expect(bot.createBotSession({ botId: 'missing' })).rejects.toBeInstanceOf(DshBotError)
    await expect(bot.createBotSession({ botId: 'missing' })).rejects.toMatchObject({ code: 'bot-not-found' })
  })

  it('does not change v1 createSession (sessionTool.create, kind:dsh-bot only)', async () => {
    const { bot, sessionTool, platform } = boot()
    const created = await bot.createSession(CLI, { title: 'Legacy', cwd: '/work' })
    expect(created.title).toBe('Legacy')
    expect(sessionTool.createCalls).toHaveLength(1)
    expect(platform.createCalls).toHaveLength(0)
    expect(await get(created.sessionId)).toEqual(['kind:dsh-bot'])
  })
})
