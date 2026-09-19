import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import { expandRemoveAliases, expandWriteAliases, get, patch, put } from 'session-marks'
import {
  SessionToolError,
  SessionWebUnreachableError,
} from 'session-tool'
import type {
  SessionToolCaller,
  SessionToolListResult,
  SessionToolMessageRow,
  SessionToolService,
  SessionToolWaitStatus,
} from 'session-tool'
import DshBotService from '../src/index.ts'
import type { DshBotConfig } from '../src/index.ts'
import { extractAssistantAnswer, hiddenBotTitle, resolveOverride, visibleBotTitle } from '../src/ask.ts'
import { DshBotError } from '../src/errors.ts'
import { applyModelOverride } from '../src/platform.ts'
import type { DshBotModelRef, DshBotPlatform } from '../src/platform.ts'

const CLI: SessionToolCaller = { kind: 'cli' }
const AGENT: SessionToolCaller = { kind: 'agent', sessionId: SessionId('session-caller'), delegationDepth: 0 }

const BASE_CONFIG: DshBotConfig = {
  webUrl: 'http://127.0.0.1:3084',
  askTimeoutMs: 30_000,
}

interface StubMessage {
  readonly seq: number
  readonly role: 'user' | 'assistant' | 'tool'
  readonly blocks: ReadonlyArray<{ type: string; text?: string }>
}

class StubSessionTool implements SessionToolService {
  async readMarks(_caller: Parameters<SessionToolService['readMarks']>[0], sessionId: SessionId) {
    return { sessionId, tags: [], hiddenPrefixes: ['~'] }
  }

  readonly createCalls: Array<{ caller: SessionToolCaller; options: Parameters<SessionToolService['create']>[1] }> = []
  readonly writeCalls: Array<{ sessionId: string; content: string }> = []
  readonly waitCalls: Array<{ sessionId: string; options: Parameters<SessionToolService['wait']>[2] }> = []
  readonly readCalls: Array<{ sessionId: string }> = []
  readonly listCalls: Array<{ filter: Parameters<SessionToolService['list']>[1] }> = []
  waitStatus: SessionToolWaitStatus = 'idle'
  waitReason?: string
  createError?: Error
  listResult: SessionToolListResult = { sessions: [] }
  listError?: Error
  private next = 0
  private readonly replies = new Map<string, readonly StubMessage[]>()

  setReply(sessionId: string, messages: readonly StubMessage[]): void {
    this.replies.set(sessionId, messages)
  }

  async create(caller: SessionToolCaller, options: Parameters<SessionToolService['create']>[1]) {
    if (this.createError !== undefined) throw this.createError
    this.createCalls.push({ caller, options })
    this.next += 1
    const sessionId = SessionId(`session-bot-${this.next}`)
    if (options.tags !== undefined && options.tags.length > 0) {
      await patch(sessionId, { add: expandWriteAliases(options.tags) })
    }
    return { sessionId }
  }

  async write(_caller: SessionToolCaller, sessionId: SessionId, content: string) {
    this.writeCalls.push({ sessionId: String(sessionId), content })
    return { sessionId }
  }

  async wait(_caller: SessionToolCaller, sessionId: SessionId, options: Parameters<SessionToolService['wait']>[2]) {
    this.waitCalls.push({ sessionId: String(sessionId), options })
    return {
      sessionId,
      status: this.waitStatus,
      ...this.waitReason === undefined ? {} : { lastTurnEndReason: this.waitReason },
    }
  }

  async read(_caller: SessionToolCaller, sessionId: SessionId, _options: Parameters<SessionToolService['read']>[2]) {
    this.readCalls.push({ sessionId: String(sessionId) })
    const messages = (this.replies.get(String(sessionId)) ?? [
      { seq: 1, role: 'assistant' as const, blocks: [{ type: 'text', text: 'bot says hi' }] },
    ]) as SessionToolMessageRow[]
    return { sessionId, messages }
  }

  async list(_caller: SessionToolCaller, filter: Parameters<SessionToolService['list']>[1]) {
    this.listCalls.push({ filter })
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
  async hide(_caller: SessionToolCaller, sessionId: SessionId) {
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
  readonly archiveCalls: string[] = []
  readonly unarchiveCalls: string[] = []
  readonly selectCalls: Array<{ sessionId: string; model: DshBotModelRef }> = []
  readonly restoreCalls: DshBotModelRef[] = []
  readonly createCalls: Array<{ agentPreset: string; cwd: string }> = []
  readonly renameCalls: Array<{ sessionId: string; title: string }> = []
  global: DshBotModelRef = { provider: 'anthropic', model: 'grok-4.6', reasoningEffort: 'xhigh' }
  selectError?: Error
  archiveError?: Error
  selectHold?: Promise<void>
  private nextCreate = 0
  gatewayRows: Array<{ sessionId: string; running: boolean; updatedAt: number; agentPreset?: string; title?: string }> = []

  async archiveSession(sessionId: string) {
    if (this.archiveError !== undefined) throw this.archiveError
    this.archiveCalls.push(sessionId)
  }

  async unarchiveSession(sessionId: string) {
    this.unarchiveCalls.push(sessionId)
  }

  async selectModel(sessionId: string, model: DshBotModelRef) {
    if (this.selectError !== undefined) throw this.selectError
    this.selectCalls.push({ sessionId, model })
    this.global = { ...model }
    if (this.selectHold !== undefined) await this.selectHold
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
    this.nextCreate += 1
    return { sessionId: `session-owned-${this.nextCreate}`, agentPreset: request.agentPreset }
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
  const home = mkdtempSync(join(tmpdir(), 'dsh-bot-host-'))
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
  config?: DshBotConfig
  sessionTool?: StubSessionTool
  platform?: StubPlatform
} = {}): { ctx: Context; bot: DshBotService; sessionTool: StubSessionTool; platform: StubPlatform } {
  const sessionTool = options.sessionTool ?? new StubSessionTool()
  const platform = options.platform ?? new StubPlatform()
  const ctx = new Context()
  ctx.provide('sessionTool', sessionTool)
  const bot = new DshBotService(ctx, { ...BASE_CONFIG, ...options.config }, platform)
  return { ctx, bot, sessionTool, platform }
}

describe('title helpers', () => {
  it('prefixes hidden titles and strips ~ from visible titles', () => {
    expect(hiddenBotTitle('量子纠缠是什么')).toBe('~dsh-bot: 量子纠缠是什么')
    expect(visibleBotTitle('~secret')).toBe('secret')
    expect(visibleBotTitle(undefined)).toBe('DSH Bot')
  })

  it('treats empty model as follow-global', () => {
    expect(resolveOverride({ webUrl: 'x', askTimeoutMs: 1 })).toBeUndefined()
    expect(resolveOverride({ webUrl: 'x', askTimeoutMs: 1, model: { provider: ' ', model: 'm' } })).toBeUndefined()
  })
})

describe('extractAssistantAnswer', () => {
  it('aggregates the last assistant text blocks and rejects empty tails', () => {
    expect(extractAssistantAnswer([
      { seq: 0, role: 'user', blocks: [{ type: 'text', text: 'q' }] },
      { seq: 1, role: 'assistant', blocks: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] },
    ])).toBe('a\nb')
    expect(extractAssistantAnswer([
      { seq: 1, role: 'assistant', blocks: [{ type: 'tool-call' }] },
    ] as unknown as SessionToolMessageRow[])).toBeUndefined()
  })
})

describe('DshBotService.askBot', () => {
  it('runs create → marks merge → archive → write → wait idle → read', async () => {
    const { bot, sessionTool, platform } = boot()
    const result = await bot.askBot(AGENT, { prompt: '  量子纠缠是什么  ' })
    expect(result.answer).toBe('bot says hi')
    expect(result.sessionId).toBe('session-bot-1')
    expect(sessionTool.createCalls).toHaveLength(1)
    const created = sessionTool.createCalls[0]!
    expect(created.caller).toEqual(AGENT)
    expect(created.options.parentSessionId).toBe('session-caller')
    expect(created.options.title).toBe('~dsh-bot: 量子纠缠是什么')
    expect(created.options.tags).toEqual(['app:dsh-bot', 'kind:dsh-bot', 'form:plugin', 'bot:dsh-bot'])
    const written = sessionTool.writeCalls[0]?.content ?? ''
    expect(written).toContain('<system-reminder>')
    expect(written).toContain('量子纠缠是什么')
    expect(written).toContain('grok-4.6')
    expect(written).not.toContain('{{model}}')
    expect(written).not.toContain('{{cwd}}')
    expect(written).toContain('行为规范')
    expect(sessionTool.waitCalls[0]!.options).toEqual({ until: 'idle', timeoutMs: 30_000 })
    expect(platform.archiveCalls).toEqual(['session-bot-1'])
    expect(platform.selectCalls).toEqual([{
      sessionId: 'session-bot-1',
      model: { provider: 'anthropic', model: 'grok-4.6', reasoningEffort: 'xhigh' },
    }])
    expect(platform.restoreCalls).toEqual([
      { provider: 'anthropic', model: 'grok-4.6', reasoningEffort: 'xhigh' },
    ])
    const tags = await get('session-bot-1')
    expect(tags).toEqual(expect.arrayContaining(['app:dsh-bot', 'kind:dsh-bot', 'form:plugin', 'bot:dsh-bot', 'hidden', 'kind:hidden']))
  })

  it('writes ownership tags on create and lets hide() dual-write hidden marks', async () => {
    const { bot, sessionTool } = boot()
    await bot.askBot(CLI, { prompt: 'hello', title: 'hi' })
    expect(sessionTool.createCalls[0]!.options.tags).toEqual([
      'app:dsh-bot',
      'kind:dsh-bot',
      'form:plugin',
      'bot:dsh-bot',
    ])
    expect(await get('session-bot-1')).toEqual(expect.arrayContaining([
      'app:dsh-bot',
      'kind:dsh-bot',
      'form:plugin',
      'bot:dsh-bot',
      'hidden',
      'kind:hidden',
    ]))
  })

  it('applies override via selectModel and restores the global default', async () => {
    const platform = new StubPlatform()
    const { bot } = boot({
      platform,
      config: {
        ...BASE_CONFIG,
        model: { provider: 'deepseek', model: 'deepseek-v4-flash', reasoningEffort: 'high' },
      },
    })
    await bot.askBot(CLI, { prompt: 'ping' })
    expect(platform.selectCalls).toHaveLength(1)
    expect(platform.selectCalls[0]!.model).toEqual({
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      reasoningEffort: 'high',
    })
    expect(platform.restoreCalls).toEqual([
      { provider: 'anthropic', model: 'grok-4.6', reasoningEffort: 'xhigh' },
    ])
    expect(platform.global).toEqual({ provider: 'anthropic', model: 'grok-4.6', reasoningEffort: 'xhigh' })
  })

  it('fails loud on an illegal override and never writes the prompt', async () => {
    const platform = new StubPlatform()
    platform.selectError = new DshBotError(
      'override-invalid',
      'illegal dsh-bot.model override nope/missing: model-unavailable',
    )
    const { bot, sessionTool } = boot({
      platform,
      config: { ...BASE_CONFIG, model: { provider: 'nope', model: 'missing' } },
    })
    await expect(bot.askBot(CLI, { prompt: 'ping' })).rejects.toMatchObject({
      code: 'override-invalid',
      sessionId: 'session-bot-1',
    })
    expect(sessionTool.writeCalls).toHaveLength(0)
  })

  it('surfaces web-unreachable from sessionTool.create', async () => {
    const sessionTool = new StubSessionTool()
    sessionTool.createError = new SessionWebUnreachableError('gateway down')
    const { bot } = boot({ sessionTool })
    await expect(bot.askBot(CLI, { prompt: 'ping' })).rejects.toMatchObject({
      code: 'web-unreachable',
    })
  })

  it('turns wait timeout into a loud error that keeps the session id', async () => {
    const sessionTool = new StubSessionTool()
    sessionTool.waitStatus = 'timeout'
    const { bot } = boot({ sessionTool })
    await expect(bot.askBot(CLI, { prompt: 'ping' })).rejects.toMatchObject({
      code: 'wait-timeout',
      sessionId: 'session-bot-1',
    })
    expect(sessionTool.readCalls).toHaveLength(0)
  })

  it('rejects an empty assistant tail instead of returning an empty string', async () => {
    const sessionTool = new StubSessionTool()
    sessionTool.setReply('session-bot-1', [
      { seq: 0, role: 'user', blocks: [{ type: 'text', text: 'q' }] },
      { seq: 1, role: 'assistant', blocks: [{ type: 'tool-call' }] },
    ])
    const { bot } = boot({ sessionTool })
    await expect(bot.askBot(CLI, { prompt: 'ping' })).rejects.toMatchObject({
      code: 'empty-answer',
      sessionId: 'session-bot-1',
    })
  })

  it('mints a new session per ask (no reuse)', async () => {
    const { bot, sessionTool } = boot()
    const a = await bot.askBot(CLI, { prompt: 'one' })
    const b = await bot.askBot(CLI, { prompt: 'two' })
    expect(a.sessionId).toBe('session-bot-1')
    expect(b.sessionId).toBe('session-bot-2')
    expect(sessionTool.createCalls).toHaveLength(2)
  })

  it('maps a generic SessionToolError without swallowing it', async () => {
    const sessionTool = new StubSessionTool()
    sessionTool.createError = new SessionToolError('nope', 'unauthorized')
    const { bot } = boot({ sessionTool })
    await expect(bot.askBot(CLI, { prompt: 'ping' })).rejects.toBeInstanceOf(DshBotError)
  })

  it('names MISSING_CREDENTIAL from the bot turn/end when wait fails', async () => {
    const sessionTool = new StubSessionTool()
    sessionTool.waitStatus = 'failed'
    sessionTool.waitReason = 'error'
    sessionTool.setReply('session-bot-1', [])
    const ctx = new Context()
    ctx.provide('sessionTool', sessionTool)
    ctx.provide('sessions', {
      get: () => ({
        events: [{
          type: 'turn/end',
          data: {
            reason: {
              kind: 'error',
              error: {
                code: 'MISSING_CREDENTIAL',
                message: 'llm-pi-ai: no credential for provider route "nokey"; its profile resolves BOT_MISSING_KEY, which is not set',
              },
            },
          },
        }],
      }),
    })
    const bot = new DshBotService(ctx, BASE_CONFIG, new StubPlatform())
    const error = await bot.askBot(CLI, { prompt: 'ping' }).then(
      () => { throw new Error('expected askBot to fail') },
      (caught: unknown) => caught,
    )
    expect(error).toMatchObject({ code: 'missing-credential', sessionId: 'session-bot-1' })
    expect(String(error)).toMatch(/MISSING_CREDENTIAL/)
    expect(String(error)).toMatch(/BOT_MISSING_KEY/)
  })

  it('includes wait lastTurnEndReason when the session log is unavailable', async () => {
    const sessionTool = new StubSessionTool()
    sessionTool.waitStatus = 'failed'
    sessionTool.waitReason = 'error'
    sessionTool.setReply('session-bot-1', [])
    const { bot } = boot({ sessionTool })
    const error = await bot.askBot(CLI, { prompt: 'ping' }).then(
      () => { throw new Error('expected askBot to fail') },
      (caught: unknown) => caught,
    )
    expect(error).toMatchObject({ code: 'session-failed', sessionId: 'session-bot-1' })
    expect(String(error)).toMatch(/turn\/end error/)
  })
})

describe('applyModelOverride mutex', () => {
  it('restores the original global after concurrent overrides', async () => {
    const platform = new StubPlatform()
    let release!: () => void
    const hold = new Promise<void>((resolve) => { release = resolve })
    let started = 0
    platform.selectModel = async (sessionId, model) => {
      started += 1
      platform.selectCalls.push({ sessionId, model })
      platform.global = { ...model }
      if (started === 1) await hold
    }
    const original = { provider: 'anthropic', model: 'grok-4.6', reasoningEffort: 'xhigh' as const }
    platform.global = { ...original }
    const first = applyModelOverride(platform, 's1', { provider: 'deepseek', model: 'flash' })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(started).toBe(1)
    const second = applyModelOverride(platform, 's2', { provider: 'deepseek', model: 'pro' })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(started).toBe(1)
    release()
    await Promise.all([first, second])
    expect(platform.global).toEqual(original)
    expect(platform.selectCalls.map(call => call.model.model).sort()).toEqual(['flash', 'pro'])
    expect(platform.restoreCalls).toHaveLength(2)
    expect(platform.restoreCalls.every(call => call.model === original.model)).toBe(true)
  })

  it('pins follow-global sessions to the live snapshot (UF-005 default switch)', async () => {
    const platform = new StubPlatform()
    platform.global = { provider: 'deepseek', model: 'deepseek-v4-flash', reasoningEffort: 'max' }
    await applyModelOverride(platform, 's-follow', undefined)
    expect(platform.selectCalls).toEqual([{
      sessionId: 's-follow',
      model: { provider: 'deepseek', model: 'deepseek-v4-flash', reasoningEffort: 'max' },
    }])
    expect(platform.global).toEqual({
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      reasoningEffort: 'max',
    })
  })
})

describe('DshBotService.createSession / listSessions', () => {
  it('creates a Bot-visible chat hidden from Harness', async () => {
    const { bot, sessionTool, platform } = boot()
    const created = await bot.createSession(AGENT, { title: 'Plan', cwd: '/work' })
    expect(created.title).toBe('Plan')
    expect(sessionTool.createCalls[0]!.options).toEqual({
      title: 'Plan',
      tags: ['app:dsh-bot', 'kind:dsh-bot', 'form:plugin', 'kind:dsh-bot-chat', 'bot:dsh-bot'],
      cwd: '/work',
    })
    expect(platform.archiveCalls).toHaveLength(0)
    expect(await get(created.sessionId)).toEqual(expect.arrayContaining(['app:dsh-bot', 'kind:dsh-bot', 'form:plugin', 'kind:dsh-bot-chat', 'bot:dsh-bot', 'hidden', 'kind:hidden']))
  })

  it('passes workspacePath through to sessionTool.create', async () => {
    const { bot, sessionTool, platform } = boot()
    await bot.createSession(CLI, { title: 'Bound', workspacePath: '/work/plugin' })
    expect(sessionTool.createCalls[0]!.options).toEqual({
      title: 'Bound',
      tags: ['app:dsh-bot', 'kind:dsh-bot', 'form:plugin', 'kind:dsh-bot-chat', 'bot:dsh-bot'],
      workspacePath: '/work/plugin',
    })
    expect(platform.archiveCalls).toHaveLength(0)
  })

  it('lists by kind intersection and drops marks whose session is gone', async () => {
    const sessionTool = new StubSessionTool()
    await put('session-live', ['kind:dsh-bot'])
    await put('session-hidden', ['kind:dsh-bot', 'kind:hidden'])
    await put('session-gone', ['kind:dsh-bot'])
    sessionTool.listResult = {
      sessions: [
        {
          sessionId: SessionId('session-live'),
          title: 'Plan',
          tags: ['kind:dsh-bot'],
          status: 'idle',
          createdAt: 1,
        },
        {
          sessionId: SessionId('session-hidden'),
          title: '~dsh-bot: q',
          tags: ['kind:dsh-bot', 'kind:hidden'],
          status: 'idle',
          createdAt: 2,
        },
      ],
    }
    const { bot } = boot({ sessionTool })
    const hiddenOff = await bot.listSessions()
    expect(hiddenOff.map(row => row.sessionId)).toEqual(['session-live'])
    const hiddenOn = await bot.listSessions({ includeHidden: true })
    expect(hiddenOn.map(row => row.sessionId).sort()).toEqual(['session-hidden', 'session-live'])
    expect(hiddenOn.find(row => row.sessionId === 'session-gone')).toBeUndefined()
  })

  it('lists transition inventory as the union of app:dsh-bot and kind:dsh-bot', async () => {
    const sessionTool = new StubSessionTool()
    await put('session-legacy', ['kind:dsh-bot'])
    await put('session-new', ['app:dsh-bot', 'form:plugin'])
    sessionTool.listResult = {
      sessions: [
        { sessionId: SessionId('session-legacy'), title: 'Legacy', tags: ['kind:dsh-bot'], status: 'idle', createdAt: 1 },
        { sessionId: SessionId('session-new'), title: 'New', tags: ['app:dsh-bot', 'form:plugin'], status: 'idle', createdAt: 2 },
      ],
    }
    const { bot } = boot({ sessionTool })
    expect((await bot.listSessions()).map(row => row.sessionId).sort()).toEqual(['session-legacy', 'session-new'])
  })

  it('falls back to platform.listSessions when sessionTool.list is web-unreachable', async () => {
    const sessionTool = new StubSessionTool()
    sessionTool.listError = new SessionWebUnreachableError('web gateway unreachable for workspace/follow: HTTP 401')
    const platform = new StubPlatform()
    await put('session-live', ['kind:dsh-bot'])
    await put('session-hidden', ['kind:dsh-bot', 'kind:hidden'])
    await put('session-gone', ['kind:dsh-bot'])
    platform.gatewayRows = [
      { sessionId: 'session-live', running: true, updatedAt: 90, title: 'Plan' },
      { sessionId: 'session-hidden', running: false, updatedAt: 40, title: '~dsh-bot: q' },
    ]
    const { bot } = boot({ sessionTool, platform })
    const hiddenOff = await bot.listSessions()
    expect(hiddenOff.map(row => row.sessionId)).toEqual(['session-live'])
    expect(hiddenOff[0]?.title).toBe('Plan')
    const hiddenOn = await bot.listSessions({ includeHidden: true })
    expect(hiddenOn.map(row => row.sessionId).sort()).toEqual(['session-hidden', 'session-live'])
  })


  it('reports override vs global-default as botModel source', () => {
    const { bot } = boot()
    expect(bot.currentBotModel()).toEqual({
      provider: 'anthropic',
      model: 'grok-4.6',
      source: 'global-default',
    })
    const override = boot({
      config: { ...BASE_CONFIG, model: { provider: 'deepseek', model: 'deepseek-v4-flash' } },
    })
    expect(override.bot.currentBotModel()).toEqual({
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      source: 'override',
    })
  })
})
