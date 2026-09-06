/**
 * Workbench session chain: ownership marks, hidden exclusion, history
 * projection (Task 8).
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import { get, put } from 'session-marks'
import type {
  SessionToolCaller,
  SessionToolListResult,
  SessionToolMessageRow,
  SessionToolService,
} from 'session-tool'
import { SessionWebUnreachableError } from 'session-tool'
import DshBotService from '../src/index.ts'
import type { DshBotConfig } from '../src/index.ts'
import { DshBotError } from '../src/errors.ts'
import { botMark } from '../src/marks.ts'
import { createBotsRuntime } from '../src/bots.ts'
import type { PresetGate, PresetListEntry } from '../src/bots.ts'
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
  listError: Error | undefined
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
    if (this.listError !== undefined) throw this.listError
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
  gatewayRows: Array<{ sessionId: string; running: boolean; updatedAt: number; agentPreset?: string; title?: string }> = []
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


const TEMPLATE = `---
- id: persona
  name: '@deepseek-ai/dsh-persona'
  config:
    text: >-
      你是 DSH Bot。

- id: tool-bash
  name: '@deepseek-ai/dsh-tool-bash'
`

function seedTemplate(home: string): void {
  const dir = join(home, '.agent-presets', 'dsh-bot')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'agent.cordis.yml'), TEMPLATE)
  writeFileSync(join(dir, 'preset.yml'), 'name: DSH Bot\ndescription: resident.\n')
}

function fsGate(home: string): PresetGate {
  return {
    async list(): Promise<PresetListEntry[]> {
      const root = join(home, '.agent-presets')
      if (!existsSync(root)) return []
      const { readdirSync } = await import('node:fs')
      const out: PresetListEntry[] = []
      for (const id of readdirSync(root)) {
        if (!existsSync(join(root, id, 'agent.cordis.yml'))) continue
        out.push({ id })
      }
      return out
    },
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
  extractAsk?: (prompt: string, botId: string) => Promise<string | null>
  botsRuntime?: import('../src/bots.ts').BotsRuntime
} = {}): { bot: DshBotService; sessionTool: StubSessionTool; platform: StubPlatform; ctx: Context } {
  const sessionTool = options.sessionTool ?? new StubSessionTool()
  const platform = options.platform ?? new StubPlatform()
  const ctx = new Context()
  ctx.provide('sessionTool', sessionTool)
  const bot = new DshBotService(
    ctx,
    { ...BASE_CONFIG, ...options.config },
    platform,
    options.botsRuntime,
    undefined,
    options.extractAsk === undefined ? undefined : { extractAsk: options.extractAsk },
  )
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
      { seq: 4, role: 'user', blocks: [{ type: 'text', text: '诗人小北，现在轮到你在「编辑室」里说话。\n房间里刚说的：\n用户: 你们是谁?\n按你自己的身份接一句。没有要补充的可以沉默。' }] },
      { seq: 5, role: 'assistant', blocks: [{ type: 'text', text: '我是诗人小北' }] },
    ] as SessionToolMessageRow[])
    expect(items.filter(item => item.kind === 'message').map(item => item.text)).toEqual([
      '你是谁?',
      '诗人小北，现在轮到你在「编辑室」里说话。\n房间里刚说的：\n用户: 你们是谁?\n按你自己的身份接一句。没有要补充的可以沉默。',
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
    await put('session-group', ['kind:dsh-bot', 'bot:dsh-bot', 'kind:hidden', 'group:edit', 'group-room:room-1'])
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
          sessionId: SessionId('session-group'),
          title: '~dsh-bot-group: 编辑室/DSH Bot',
          tags: ['kind:dsh-bot', 'bot:dsh-bot', 'kind:hidden', 'group:edit', 'group-room:room-1'],
          status: 'idle',
          createdAt: 45,
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
      'session-group',
      'session-hidden',
      'session-old',
    ])
    expect(withHidden.sessions.some(row => row.sessionId === 'session-group')).toBe(true)
  })

  it('falls back to platform.listSessions when sessionTool.list is web-unreachable', async () => {
    const sessionTool = new StubSessionTool()
    sessionTool.listError = new SessionWebUnreachableError('web gateway unreachable for workspace/follow: HTTP 401')
    const platform = new StubPlatform()
    await put('session-old', ['kind:dsh-bot', 'bot:dsh-bot'])
    await put('session-new', ['kind:dsh-bot', 'bot:dsh-bot'])
    await put('session-hidden', ['kind:dsh-bot', 'bot:dsh-bot', 'kind:hidden'])
    await put('session-gone', ['kind:dsh-bot', 'bot:dsh-bot'])
    platform.gatewayRows = [
      { sessionId: 'session-old', running: false, updatedAt: 10, title: 'Old' },
      { sessionId: 'session-new', running: true, updatedAt: 90, title: 'New' },
      { sessionId: 'session-hidden', running: false, updatedAt: 40, title: '~dsh-bot: q' },
    ]
    const { bot } = boot({ sessionTool, platform })
    await bot.listBots()
    const listed = await bot.listBotSessions({ botId: 'dsh-bot' })
    expect(listed.sessions.map(row => row.sessionId)).toEqual(['session-new', 'session-old'])
    expect(listed.sessions[0]?.title).toBe('New')
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


describe('memory inject + extract hooks', () => {
  it('injects memory into a managed preset before createOwnedSession', async () => {
    const home = process.env.DSH_HOME!
    seedTemplate(home)
    const botsRuntime = createBotsRuntime({
      gate: fsGate(home),
      home: () => home,
    })
    const created = await botsRuntime.createBot({ name: '校对阿宁', persona: '你是校对阿宁。' })
    const dir = join(home, 'dsh-bot', 'memory', created.id)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'profile.md'), '<!-- dsh-mem p1 1 -->\n- 用户叫 Nothing\n')
    const { bot } = boot({ botsRuntime })
    const session = await bot.createBotSession({ botId: created.id })
    expect(session.botId).toBe(created.id)
    const composition = readFileSync(
      join(home, '.agent-presets', created.presetId, 'agent.cordis.yml'),
      'utf8',
    )
    expect(composition).toContain('你记得的事')
    expect(composition).toContain('用户叫 Nothing')
    const registry = JSON.parse(readFileSync(join(home, 'dsh-bot', 'bots.json'), 'utf8')) as {
      bots: Array<{ id: string; persona?: string }>
    }
    expect(registry.bots.find(row => row.id === created.id)?.persona).toBe('你是校对阿宁。')
  })

  it('extracts once after a turn closes and skips a second poll', async () => {
    const ask = vi.fn(async () => '{"profile":["用户叫 Nothing"],"log":[],"remove":[]}')
    const sessionTool = new StubSessionTool()
    sessionTool.setReply('session-owned-1', [
      { seq: 1, role: 'user', blocks: [{ type: 'text', text: '我叫 Nothing，术语保留英文' }] },
      { seq: 2, role: 'assistant', blocks: [{ type: 'text', text: '记下了' }] },
    ])
    const { bot } = boot({ sessionTool, extractAsk: ask })
    await bot.listBots()
    await put('session-owned-1', ['kind:dsh-bot', 'bot:dsh-bot'])
    await bot.prompt({ sessionId: 'session-owned-1', text: '我叫 Nothing，术语保留英文' })
    await bot.history({ sessionId: 'session-owned-1' })
    await vi.waitFor(() => {
      expect(ask).toHaveBeenCalledTimes(1)
    })
    await bot.history({ sessionId: 'session-owned-1' })
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(ask).toHaveBeenCalledTimes(1)
    const listed = await bot.memoryList({ botId: 'dsh-bot' })
    expect(listed.profile.map(row => row.text)).toEqual(['用户叫 Nothing'])
  })

  it('does not extract when memory.enabled is false', async () => {
    const ask = vi.fn(async () => '{"profile":["x"],"log":[],"remove":[]}')
    const sessionTool = new StubSessionTool()
    sessionTool.setReply('session-owned-1', [
      { seq: 1, role: 'user', blocks: [{ type: 'text', text: '我叫 Nothing，术语保留英文' }] },
      { seq: 2, role: 'assistant', blocks: [{ type: 'text', text: '记下了' }] },
    ])
    const { bot } = boot({
      sessionTool,
      extractAsk: ask,
      config: { ...BASE_CONFIG, memory: { enabled: false } },
    })
    await bot.listBots()
    await put('session-owned-1', ['kind:dsh-bot', 'bot:dsh-bot'])
    await bot.prompt({ sessionId: 'session-owned-1', text: '我叫 Nothing，术语保留英文' })
    await bot.history({ sessionId: 'session-owned-1' })
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(ask).not.toHaveBeenCalled()
  })
})


describe('routine history projection', () => {
  it('drops [routine] user wakes and projects propose cards', async () => {
    const { projectWorkbenchHistory, isPlatformInjection } = await import('../src/workbench-sessions.ts')
    expect(isPlatformInjection('[routine] 报时\n没有人在等你')).toBe(true)
    expect(isPlatformInjection('[routine-system] 例程连续失败，请检查')).toBe(false)
    const items = projectWorkbenchHistory([
      {
        seq: 1,
        role: 'user',
        blocks: [{ type: 'text', text: '[routine] 报时\n没有人在等你' }],
      },
      {
        seq: 2,
        role: 'assistant',
        blocks: [{ type: 'text', text: '好的\n[propose-routine]{"name":"校稿","schedule":"@daily","instruction":"校今天的稿"}[/propose-routine]' }],
      },
    ] as never)
    expect(items.some(item => item.kind === 'message' && item.role === 'user')).toBe(false)
    expect(items.some(item => item.kind === 'propose-routine' && item.name === '校稿')).toBe(true)
  })
})
