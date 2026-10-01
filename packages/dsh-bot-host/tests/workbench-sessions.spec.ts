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
import { expandRemoveAliases, expandWriteAliases, get, patch, put } from 'session-marks'
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
import { createBotsRuntime } from '../src/bots.ts'
import type { BotsRuntime } from '../src/bots.ts'
import type { DshBotModelRef, DshBotPlatform } from '../src/platform.ts'
import {
  projectRoomHistory,
  projectWorkbenchHistory,
  turnIsOpen,
} from '../src/workbench-sessions.ts'

const CLI: SessionToolCaller = { kind: 'cli' }

const BASE_CONFIG: DshBotConfig = {
  webUrl: 'http://127.0.0.1:3084',
  askTimeoutMs: 30_000,
}

class StubSessionTool implements SessionToolService {
  async readMarks(_caller: Parameters<SessionToolService['readMarks']>[0], sessionId: SessionId) {
    return { sessionId, tags: [], hiddenPrefixes: ['~'] }
  }

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
    const sessionId = SessionId('session-tool-created')
    if (options.tags !== undefined && options.tags.length > 0) {
      await patch(sessionId, { add: expandWriteAliases(options.tags) })
    }
    return { sessionId }
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

  async cancel() {}
  async getVisibility() {
    return { hasHiddenMark: false, archived: false, isHidden: false }
  }
  readonly hideCalls: string[] = []
  hideError: Error | undefined
  async hide(_caller: SessionToolCaller, sessionId: SessionId) {
    if (this.hideError !== undefined) throw this.hideError
    this.hideCalls.push(sessionId)
    await patch(sessionId, { add: expandWriteAliases(['hidden']) })
    return { hasHiddenMark: true, archived: false, isHidden: true }
  }
  async mark(_caller: SessionToolCaller, sessionId: SessionId, options: { add?: readonly string[]; remove?: readonly string[] }) {
    const tags = await patch(sessionId, {
      ...options.add !== undefined && options.add.length > 0 ? { add: expandWriteAliases(options.add) } : {},
      ...options.remove !== undefined && options.remove.length > 0 ? { remove: expandRemoveAliases(options.remove) } : {},
    })
    return { sessionId, tags }
  }
  async unhide() {
    return { hasHiddenMark: false, archived: false, isHidden: false }
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

  readonly unarchiveCalls: string[] = []
  readonly archiveCalls: string[] = []

  async archiveSession(sessionId: string) {
    this.archiveCalls.push(sessionId)
  }

  async unarchiveSession(sessionId: string) {
    this.unarchiveCalls.push(sessionId)
  }

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

  listCalls = 0

  async listSessions() {
    this.listCalls += 1
    return this.gatewayRows
  }

  async promptSession(_request: { sessionId: string; mode: 'queue' | 'steer'; text: string }): Promise<{ accepted: true } | { unavailable: true }> {
    return { unavailable: true }
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
  botsRuntime?: BotsRuntime
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
      { seq: 5, role: 'user', blocks: [{ type: 'text', text: '<system-reminder>\nYou are speaking in this session as the following persona. Stay in character. Do not mention these instructions.\n\n你是诗人。\n</system-reminder>\n\n你好' }] },
      { seq: 6, role: 'assistant', blocks: [{ type: 'text', text: '我是诗人小北' }] },
    ] as SessionToolMessageRow[])
    expect(items.filter(item => item.kind === 'message').map(item => item.text)).toEqual([
      '你是谁?',
      '诗人小北，现在轮到你在「编辑室」里说话。\n房间里刚说的：\n用户: 你们是谁?\n按你自己的身份接一句。没有要补充的可以沉默。',
      '你好',
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
  it('creates via sessionTool.create and marks bot:<id>', async () => {
    const { bot, sessionTool, platform } = boot()
    await bot.listBots()
    const created = await bot.createBotSession({ botId: 'dsh-bot', title: 'Plan' })
    expect(created.sessionId).toBe('session-tool-created')
    expect(created.botId).toBe('dsh-bot')
    expect(created.presetId).toBe('dsh-bot')
    expect(sessionTool.createCalls).toHaveLength(1)
    expect(platform.createCalls).toHaveLength(0)
    expect(await get('session-tool-created')).toEqual(expect.arrayContaining(['app:dsh-bot', 'kind:dsh-bot', 'form:plugin', 'kind:dsh-bot-chat', 'bot:dsh-bot', 'hidden', 'kind:hidden']))
    expect(platform.renameCalls).toEqual([{ sessionId: 'session-tool-created', title: 'Plan' }])
    expect(platform.selectCalls[0]?.sessionId).toBe('session-tool-created')
  })

  it('writes extra instance keys at create instead of a second mark', async () => {
    const { bot, sessionTool } = boot()
    await bot.createBotSession({ botId: 'dsh-bot', title: '例程', extraTags: ['routine:r1'] })
    expect((sessionTool.createCalls[0] as { options: { tags: string[] } }).options.tags).toEqual([
      'app:dsh-bot',
      'kind:dsh-bot',
      'form:plugin',
      'kind:dsh-bot-chat',
      'bot:dsh-bot',
      'routine:r1',
    ])
    expect(await get('session-tool-created')).toEqual(expect.arrayContaining(['routine:r1', 'bot:dsh-bot', 'app:dsh-bot']))
  })

  it('keeps a newly hidden chat in the Bot history list and remains writable', async () => {
    const { bot, sessionTool } = boot()
    const created = await bot.createBotSession({ botId: 'dsh-bot', title: '私聊' })
    expect(sessionTool.hideCalls).toEqual([created.sessionId])
    sessionTool.listResult = { sessions: [{ sessionId: SessionId(created.sessionId), title: '私聊',
      tags: (await get(created.sessionId))!, status: 'idle', createdAt: 1 }] }
    const listed = await bot.listBotSessions({ botId: 'dsh-bot' })
    expect(listed.sessions).toHaveLength(1)
    expect(listed.sessions[0]).toMatchObject({ sessionId: created.sessionId, hidden: false })
    await bot.prompt({ sessionId: created.sessionId, text: '你好' })
    expect(sessionTool.writeCalls[0]?.sessionId).toBe(created.sessionId)
  })

  it('reports a hide failure instead of returning a visible chat as success', async () => {
    const { bot, sessionTool } = boot()
    sessionTool.hideError = new Error('visibility unavailable')
    await expect(bot.createBotSession({ botId: 'dsh-bot' })).rejects.toThrow('visibility unavailable')
    expect(sessionTool.writeCalls).toHaveLength(0)
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

  it('lists bot:<id> intersection from one gateway listing, drops hidden by default, newest first', async () => {
    const sessionTool = new StubSessionTool()
    const platform = new StubPlatform()
    await put('session-old', ['kind:dsh-bot', 'bot:dsh-bot'])
    await put('session-new', ['kind:dsh-bot', 'bot:dsh-bot'])
    await put('session-hidden', ['kind:dsh-bot', 'bot:dsh-bot', 'kind:hidden'])
    await put('session-group', ['kind:dsh-bot', 'bot:dsh-bot', 'kind:hidden', 'group:edit', 'group-room:room-1'])
    await put('session-other', ['kind:dsh-bot', 'bot:other'])
    sessionTool.listError = new Error('sessionTool.list must not be called when the gateway lists sessions')
    platform.gatewayRows = [
      { sessionId: 'session-old', running: false, updatedAt: 10, title: 'Old' },
      { sessionId: 'session-new', running: true, updatedAt: 90, title: 'New' },
      { sessionId: 'session-hidden', running: false, updatedAt: 40, title: '~dsh-bot: q' },
      { sessionId: 'session-group', running: false, updatedAt: 45, title: '~dsh-bot-group: 编辑室/DSH Bot' },
      { sessionId: 'session-other', running: false, updatedAt: 50, title: 'Other' },
    ]
    const { bot, ctx } = boot({ sessionTool, platform })
    ctx.provide('sessions', { get: (id: string) => id === 'session-old' ? { header: { createdAt: 3 } } : undefined })
    await bot.listBots()
    const listed = await bot.listBotSessions({ botId: 'dsh-bot' })
    expect(platform.listCalls).toBe(1)
    expect(listed.sessions.map(row => row.sessionId)).toEqual(['session-new', 'session-old'])
    expect(listed.sessions[0]?.working).toBe(true)
    expect(listed.sessions[1]).toMatchObject({ title: 'Old', createdAt: 3, updatedAt: 10, status: 'idle' })
    const withHidden = await bot.listBotSessions({ botId: 'dsh-bot', includeHidden: true })
    expect(withHidden.sessions.map(row => row.sessionId)).toEqual([
      'session-new',
      'session-group',
      'session-hidden',
      'session-old',
    ])
  })

  it('falls back to sessionTool.list when the gateway has no session controller', async () => {
    const sessionTool = new StubSessionTool()
    const platform = new StubPlatform()
    await put('session-old', ['kind:dsh-bot', 'bot:dsh-bot'])
    await put('session-new', ['kind:dsh-bot', 'bot:dsh-bot'])
    await put('session-hidden', ['kind:dsh-bot', 'bot:dsh-bot', 'kind:hidden'])
    await put('session-gone', ['kind:dsh-bot', 'bot:dsh-bot'])
    sessionTool.listResult = {
      sessions: [
        { sessionId: SessionId('session-old'), title: 'Old', tags: ['kind:dsh-bot', 'bot:dsh-bot'], status: 'idle', createdAt: 10 },
        { sessionId: SessionId('session-new'), title: 'New', tags: ['kind:dsh-bot', 'bot:dsh-bot'], status: 'live', createdAt: 30 },
        { sessionId: SessionId('session-hidden'), title: '~dsh-bot: q', tags: ['kind:dsh-bot', 'bot:dsh-bot', 'kind:hidden'], status: 'idle', createdAt: 20 },
      ],
    }
    const { bot } = boot({ sessionTool, platform })
    await bot.listBots()
    const listed = await bot.listBotSessions({ botId: 'dsh-bot' })
    expect(listed.sessions.map(row => row.sessionId)).toEqual(['session-new', 'session-old'])
    expect(listed.sessions[0]).toMatchObject({ title: 'New', status: 'live', createdAt: 30, updatedAt: 30 })
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
    await put('session-owned-1', ['kind:dsh-bot', 'bot:dsh-bot'])
    const history = await bot.history({ sessionId: 'session-owned-1' })
    expect(history.working).toBe(true)
    expect(history.items.some(item => item.kind === 'thinking' && item.text === 'think')).toBe(true)
    expect(history.items.some(item => item.kind === 'message' && item.role === 'assistant')).toBe(true)
    expect(sessionTool.readCalls[0]).toEqual({ sessionId: 'session-owned-1' })
  })

  it('prompts via sessionTool.write with the CLI caller', async () => {
    const { bot, sessionTool } = boot()
    await put('session-owned-1', ['app:dsh-bot'])
    const result = await bot.prompt({ sessionId: 'session-owned-1', text: '  你是谁?  ' })
    expect(result).toEqual({ sessionId: 'session-owned-1' })
    expect(sessionTool.writeCalls).toEqual([{ sessionId: 'session-owned-1', content: '你是谁?' }])
  })

  it('prefers platform.promptSession when the duck accepts', async () => {
    const { bot, sessionTool, platform } = boot()
    await put('session-owned-1', ['app:dsh-bot'])
    const calls: Array<{ sessionId: string; mode: string; text: string }> = []
    platform.promptSession = async (request) => {
      calls.push(request)
      return { accepted: true as const }
    }
    const result = await bot.prompt({ sessionId: 'session-owned-1', text: '排队一句', mode: 'queue' })
    expect(result).toEqual({ sessionId: 'session-owned-1' })
    expect(calls).toEqual([{ sessionId: 'session-owned-1', mode: 'queue', text: '排队一句' }])
    expect(sessionTool.writeCalls).toEqual([])
  })

  it('falls back to sessionTool.write when promptSession is unavailable', async () => {
    const { bot, sessionTool, platform } = boot()
    await put('session-owned-1', ['app:dsh-bot'])
    platform.promptSession = async () => ({ unavailable: true as const })
    await bot.prompt({ sessionId: 'session-owned-1', text: '回退写' })
    expect(sessionTool.writeCalls).toEqual([{ sessionId: 'session-owned-1', content: '回退写' }])
  })

  it('rejects an empty prompt loud', async () => {
    const { bot } = boot()
    await put('s1', ['kind:dsh-bot', 'bot:dsh-bot'])
    await expect(bot.prompt({ sessionId: 's1', text: '   ' })).rejects.toMatchObject({
      code: 'empty-prompt',
    })
  })

  it('refuses to read or drive a session this plugin does not own', async () => {
    const { bot, sessionTool, platform: stub } = boot()
    const platform = stub as StubPlatform & { cancelSession?: DshBotPlatform['cancelSession'] }
    const cancelled: string[] = []
    platform.cancelSession = async (sessionId: string) => {
      cancelled.push(sessionId)
      return { accepted: true as const }
    }
    await put('session-coding', ['app:session-tool'])
    for (const call of [
      () => bot.history({ sessionId: 'session-coding' }),
      () => bot.prompt({ sessionId: 'session-coding', text: 'rm -rf' }),
      () => bot.cancel({ sessionId: 'session-unmarked' }),
    ]) {
      await expect(call()).rejects.toMatchObject({ code: 'not-found' })
    }
    expect(sessionTool.readCalls).toEqual([])
    expect(sessionTool.writeCalls).toEqual([])
    expect(cancelled).toEqual([])
  })

  it('rejects an unknown botId', async () => {
    const { bot } = boot()
    await bot.listBots()
    await expect(bot.createBotSession({ botId: 'missing' })).rejects.toBeInstanceOf(DshBotError)
    await expect(bot.createBotSession({ botId: 'missing' })).rejects.toMatchObject({ code: 'bot-not-found' })
  })

  it('also hides legacy createSession from Harness', async () => {
    const { bot, sessionTool, platform } = boot()
    const created = await bot.createSession(CLI, { title: 'Legacy', cwd: '/work' })
    expect(created.title).toBe('Legacy')
    expect(sessionTool.createCalls).toHaveLength(1)
    expect(platform.createCalls).toHaveLength(0)
    expect(await get(created.sessionId)).toEqual(expect.arrayContaining(['app:dsh-bot', 'kind:dsh-bot', 'form:plugin', 'kind:dsh-bot-chat', 'bot:dsh-bot', 'hidden', 'kind:hidden']))
  })

  it('prepareOfficialJump unarchives a bot-owned session', async () => {
    const { bot, platform } = boot()
    const created = await bot.createBotSession({ botId: 'dsh-bot' })
    await bot.prepareOfficialJump({ sessionId: created.sessionId })
    expect(platform.unarchiveCalls).toEqual([created.sessionId])
  })

  it('prepareOfficialJump rejects a session Bot does not own', async () => {
    const { bot } = boot()
    await expect(bot.prepareOfficialJump({ sessionId: 'session-other' })).rejects.toMatchObject({ code: 'not-found' })
  })
})

describe('memory inject + extract hooks', () => {
  it('wraps memory onto the next prompt instead of writing a DSH preset', async () => {
    const home = process.env.DSH_HOME!
    const botsRuntime = createBotsRuntime({
      home: () => home,
    })
    const created = await botsRuntime.createBot({ name: '校对阿宁', persona: '你是校对阿宁。' })
    const dir = join(home, 'dsh-bot', 'memory', created.id)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'profile.md'), '<!-- dsh-mem p1 1 -->\n- 用户叫 Nothing\n')
    const { bot, sessionTool } = boot({ botsRuntime })
    const session = await bot.createBotSession({ botId: created.id })
    expect(session.botId).toBe(created.id)
    await bot.prompt({ sessionId: session.sessionId, text: '你好' })
    const written = sessionTool.writeCalls[0]?.content ?? ''
    expect(written).toContain('<system-reminder>')
    expect(written).toContain('你是校对阿宁。')
    expect(written).toContain('你记得的事')
    expect(written).toContain('用户叫 Nothing')
    expect(written).toContain('你好')
    expect(existsSync(join(home, 'dsh-bot', 'session-voice', `${session.sessionId}.txt`))).toBe(true)
    const registry = JSON.parse(readFileSync(join(home, 'dsh-bot', 'bots.json'), 'utf8')) as {
      bots: Array<{ id: string; persona?: string }>
    }
    expect(registry.bots.find(row => row.id === created.id)?.persona).toBe('你是校对阿宁。')
  })

  it('keeps the create-time persona after the registry is edited', async () => {
    const home = process.env.DSH_HOME!
    const botsRuntime = createBotsRuntime({ home: () => home })
    const created = await botsRuntime.createBot({ name: '校对阿宁', persona: '你是校对阿宁。' })
    const sessionTool = new StubSessionTool()
    let n = 0
    sessionTool.create = async (caller, options) => {
      sessionTool.createCalls.push({ caller, options })
      n += 1
      const sessionId = SessionId(`session-tool-created-${n}`)
      if (options.tags !== undefined && options.tags.length > 0) {
        await patch(sessionId, { add: expandWriteAliases(options.tags) })
      }
      return { sessionId }
    }
    const { bot } = boot({ botsRuntime, sessionTool })
    const session = await bot.createBotSession({ botId: created.id })
    await botsRuntime.updateBot({ id: created.id, persona: '你是新校对。' })
    await bot.prompt({ sessionId: session.sessionId, text: '你好' })
    const written = sessionTool.writeCalls[0]?.content ?? ''
    expect(written).toContain('你是校对阿宁。')
    expect(written).not.toContain('你是新校对。')
    const next = await bot.createBotSession({ botId: created.id, title: '新对话' })
    await bot.prompt({ sessionId: next.sessionId, text: '你好' })
    const later = sessionTool.writeCalls[1]?.content ?? ''
    expect(later).toContain('你是新校对。')
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

describe('group room projection', () => {
  it('projects a system line as a system item without an author', () => {
    const items = projectRoomHistory({
      header: { type: 'header', roomId: 'r', groupId: 'g', createdAt: 1 },
      messages: [
        { type: 'message', id: 'a', seq: 1, createdAt: 1, speaker: { kind: 'member', botId: 'b' }, text: '先说' },
        { type: 'message', id: 's', seq: 2, createdAt: 2, speaker: { kind: 'system' }, text: '继续讨论' },
      ],
    }, new Map())
    expect(items[1]).toEqual({ id: 's', kind: 'system', seq: 2, text: '继续讨论' })
  })
})

describe('deleteBot cascade', () => {
  it('archives owned sessions and drops a two-member group', async () => {
    const { bot, sessionTool, platform } = boot()
    const poet = await bot.createBot({ name: '诗人小北', persona: '人设' })
    const editor = await bot.createBot({ name: 'Editor', persona: '人设' })
    const pair = await bot.createGroup({ name: '两人组', memberIds: [poet.id, editor.id] })
    const trio = await bot.createGroup({ name: '三人组', memberIds: [poet.id, editor.id, 'dsh-bot'] })
    const created = await bot.createBotSession({ botId: poet.id, title: '私聊' })
    sessionTool.hideCalls.length = 0
    platform.archiveCalls.length = 0
    const result = await bot.deleteBot({ id: poet.id })
    expect(result).toMatchObject({ id: poet.id, deleted: true })
    expect(result.groups.deleted).toEqual([pair.id])
    expect(result.groups.updated).toEqual([trio.id])
    const groups = await bot.listGroups()
    expect(groups.groups.map(row => row.name)).toEqual(['三人组'])
    expect(groups.groups[0]?.memberIds).toEqual(expect.arrayContaining([editor.id, 'dsh-bot']))
    expect(groups.groups[0]?.memberIds).not.toContain(poet.id)
    expect(sessionTool.hideCalls).toContain(created.sessionId)
    expect(platform.archiveCalls).toContain(created.sessionId)
    await expect(bot.listBots()).resolves.toMatchObject({
      bots: expect.arrayContaining([expect.objectContaining({ id: 'dsh-bot' })]),
    })
    expect((await bot.listBots()).bots.map(row => row.id)).not.toContain(poet.id)
  })

  it('still deletes the bot when session hide fails', async () => {
    const { bot, sessionTool } = boot()
    const poet = await bot.createBot({ name: '诗人小北', persona: '人设' })
    await bot.createBotSession({ botId: poet.id, title: '私聊' })
    sessionTool.hideError = new Error('visibility unavailable')
    await expect(bot.deleteBot({ id: poet.id })).resolves.toMatchObject({
      id: poet.id,
      deleted: true,
    })
    expect((await bot.listBots()).bots.map(row => row.id)).not.toContain(poet.id)
  })
})

describe('group room face (INV-001 / BR-004)', () => {
  it('refuses group-only RPCs on a 1:1 session id', async () => {
    const { bot } = boot()
    await bot.listBots()
    const chat = await bot.createBotSession({ botId: 'dsh-bot', title: '私聊' })
    await expect(bot.continueDiscussion({ sessionId: chat.sessionId })).rejects.toMatchObject({ code: 'not-found' })
    await expect(bot.cancelQueued({ sessionId: chat.sessionId, queueId: 'q' })).rejects.toMatchObject({ code: 'not-found' })
    await expect(bot.deleteGroupSession({ sessionId: chat.sessionId })).rejects.toMatchObject({ code: 'group-not-found' })
    expect((await bot.history({ sessionId: chat.sessionId })).queued).toBeUndefined()
  })

  it('history of a room carries an empty queue; delete removes only that room', async () => {
    const { bot } = boot()
    const poet = await bot.createBot({ name: '诗人小北', persona: '人设' })
    const group = await bot.createGroup({ name: '编辑室', memberIds: [poet.id, 'dsh-bot'] })
    const keep = await bot.createGroupSession({ groupId: group.id })
    const gone = await bot.createGroupSession({ groupId: group.id })
    expect((await bot.history({ sessionId: gone.roomId })).queued).toEqual([])
    await expect(bot.deleteGroupSession({ sessionId: gone.roomId })).resolves.toEqual({ roomId: gone.roomId, deleted: true })
    expect((await bot.listGroupSessions({ groupId: group.id })).rooms.map(row => row.roomId)).toEqual([keep.roomId])
    expect((await bot.listBots()).bots.map(row => row.id)).toContain(poet.id)
    await expect(bot.deleteGroupSession({ sessionId: gone.roomId })).rejects.toMatchObject({ code: 'group-not-found', message: '房间不存在' })
  })
})
