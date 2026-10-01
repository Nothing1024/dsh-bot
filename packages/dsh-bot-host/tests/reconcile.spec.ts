/**
 * GUI / v1 session backfill: preset reverse-lookup, v1 leftovers, skip
 * cache, idempotence, never delete existing marks (Task 12).
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { get, patch, put } from 'session-marks'
import { expandRemoveAliases, expandWriteAliases } from '../src/marks.ts'
import type {
  SessionToolCaller,
  SessionToolListResult,
  SessionToolMessageRow,
  SessionToolService,
} from 'session-tool'
import { SessionId } from '@deepseek-ai/dsh-session'
import DshBotService from '../src/index.ts'
import type { DshBotConfig } from '../src/index.ts'
import { createBotsRuntime } from '../src/bots.ts'
import { parseBotMark } from '../src/marks.ts'
import type { DshBotModelRef, DshBotPlatform } from '../src/platform.ts'

const BASE_CONFIG: DshBotConfig = {
  webUrl: 'http://127.0.0.1:3084',
  askTimeoutMs: 30_000,
}

class StubSessionTool implements SessionToolService {
  async readMarks(_caller: Parameters<SessionToolService['readMarks']>[0], sessionId: SessionId) {
    return { sessionId, tags: [], hiddenPrefixes: ['~'] }
  }

  listResult: SessionToolListResult = { sessions: [] }

  async create() {
    return { sessionId: SessionId('session-tool-created') }
  }
  async write(_caller: SessionToolCaller, sessionId: SessionId) {
    return { sessionId }
  }
  async wait(_caller: SessionToolCaller, sessionId: SessionId) {
    return { sessionId, status: 'idle' as const }
  }
  async read(_caller: SessionToolCaller, sessionId: SessionId) {
    return { sessionId, messages: [] as SessionToolMessageRow[] }
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
  readonly archived: string[] = []
  readonly hideCalls: string[] = []
  readonly hideSync: boolean[] = []
  async workspaceList() {
    return { workspaces: [], archivedSessionIds: this.archived }
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
  async hide(_caller: SessionToolCaller, sessionId: SessionId, options?: { syncToArchived?: boolean }) {
    this.hideCalls.push(sessionId)
    this.hideSync.push(options?.syncToArchived !== false)
    if (options?.syncToArchived !== false) this.archived.push(sessionId)
    await patch(sessionId, { add: expandWriteAliases(['hidden']) })
    return { hasHiddenMark: true, archived: true, isHidden: true }
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
  gatewayRows: Array<{ sessionId: string; running: boolean; updatedAt: number; agentPreset?: string }> = []
  listCalls = 0

  async archiveSession() {}
  async unarchiveSession() {}
  async selectModel() {}
  snapshotGlobalDefault(): DshBotModelRef {
    return { provider: 'anthropic', model: 'grok-4.6' }
  }
  async restoreGlobalDefault() {}
  async createSession() {
    return { sessionId: 'session-owned-1' }
  }
  async renameSession() {}
  async listSessions() {
    this.listCalls += 1
    return this.gatewayRows
  }
}

const homes: string[] = []
const previousHome = process.env.DSH_HOME

beforeEach(() => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-bot-rec-'))
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

function boot(platform?: StubPlatform): { bot: DshBotService; platform: StubPlatform; sessionTool: StubSessionTool } {
  const home = process.env.DSH_HOME!
  const botsRuntime = createBotsRuntime({ home: () => home, now: () => 1 })
  const plat = platform ?? new StubPlatform()
  const ctx = new Context()
  const sessionTool = new StubSessionTool()
  ctx.provide('sessionTool', sessionTool)
  const bot = new DshBotService(ctx, BASE_CONFIG, plat, botsRuntime)
  return { bot, platform: plat, sessionTool }
}

describe('parseBotMark', () => {
  it('reads the first bot:<id> token', () => {
    expect(parseBotMark(['kind:dsh-bot', 'bot:shiren-xiaobei'])).toBe('shiren-xiaobei')
    expect(parseBotMark(['kind:dsh-bot'])).toBeUndefined()
    expect(parseBotMark(['bot:'])).toBeUndefined()
  })
})

describe('reconcileBotSessions', () => {
  it('migrates old chats without surfacing auxiliary sessions or touching coding sessions', async () => {
    const { bot, platform, sessionTool } = boot()
    for (const id of ['chat', 'aux']) await put(id, ['kind:dsh-bot', 'bot:dsh-bot', ...(id === 'aux' ? ['kind:hidden'] : [])])
    platform.gatewayRows = ['chat', 'aux', 'coding'].map(sessionId => ({ sessionId, running: false, updatedAt: 1 }))
    await bot.reconcile()
    expect(sessionTool.hideCalls).toEqual(['chat', 'aux'])
    expect(await get('chat')).toEqual(expect.arrayContaining(['app:dsh-bot', 'kind:dsh-bot', 'form:plugin', 'kind:dsh-bot-chat', 'hidden', 'kind:hidden']))
    expect(await get('aux')).not.toContain('kind:dsh-bot-chat')
    expect(await get('coding')).toBeUndefined()
    await bot.reconcile()
    expect(sessionTool.hideCalls).toEqual(['chat', 'aux'])
  })

  it('hides a group member turn session without archiving it', async () => {
    const { bot, platform, sessionTool } = boot()
    await put('member', ['app:dsh-bot', 'bot:dsh-bot', 'group:g', 'group-room:room-1'])
    platform.gatewayRows = [{ sessionId: 'member', running: false, updatedAt: 1 }]
    await bot.reconcile()
    expect(sessionTool.hideCalls).toEqual(['member'])
    expect(sessionTool.hideSync).toEqual([false])
    await bot.reconcile()
    expect(sessionTool.hideCalls).toEqual(['member'])
  })

  it('labels an unlabeled GUI session whose agentPreset is a registry bot', async () => {
    const platform = new StubPlatform()
    platform.gatewayRows = [
      { sessionId: 'session-gui', running: false, updatedAt: 10, agentPreset: 'dsh-bot' },
    ]
    const { bot } = boot(platform)
    const result = await bot.reconcile()
    expect(result.labeled).toBe(1)
    expect(result.assigned).toEqual([
      { sessionId: 'session-gui', botId: 'dsh-bot', reason: 'preset' },
    ])
    expect(await get('session-gui')).toEqual(expect.arrayContaining(['app:dsh-bot', 'kind:dsh-bot', 'form:plugin', 'bot:dsh-bot']))
  })

  it('assigns v1 leftovers (kind:dsh-bot without bot:) to the seed bot', async () => {
    const platform = new StubPlatform()
    platform.gatewayRows = [
      { sessionId: 'session-v1', running: false, updatedAt: 10, agentPreset: 'standard' },
    ]
    await put('session-v1', ['kind:dsh-bot'])
    const { bot } = boot(platform)
    const result = await bot.reconcile()
    expect(result.assigned).toEqual([
      { sessionId: 'session-v1', botId: 'dsh-bot', reason: 'v1-legacy' },
    ])
    expect(await get('session-v1')).toEqual(expect.arrayContaining(['app:dsh-bot', 'kind:dsh-bot', 'form:plugin', 'bot:dsh-bot']))
  })

  it('labels a managed-preset GUI session onto that bot', async () => {
    const platform = new StubPlatform()
    const { bot } = boot(platform)
    const created = await bot.createBot({ name: '诗人小北', persona: '你是一位诗人' })
    platform.gatewayRows = [
      {
        sessionId: 'session-poet',
        running: false,
        updatedAt: 11,
        agentPreset: created.presetId,
      },
    ]
    const result = await bot.reconcile()
    expect(result.assigned).toEqual([
      { sessionId: 'session-poet', botId: created.id, reason: 'preset' },
    ])
    expect(await get('session-poet')).toEqual(
      expect.arrayContaining(['app:dsh-bot', 'kind:dsh-bot', 'form:plugin', `bot:${created.id}`]),
    )
  })

  it('skips non-bot presets and caches them on the next pass', async () => {
    const platform = new StubPlatform()
    platform.gatewayRows = [
      { sessionId: 'session-std', running: false, updatedAt: 10, agentPreset: 'standard' },
    ]
    const { bot } = boot(platform)
    const first = await bot.reconcile()
    expect(first.skippedNonBot).toBe(1)
    expect(first.skippedCached).toBe(0)
    expect(await get('session-std')).toBeUndefined()
    const second = await bot.reconcile()
    expect(second.skippedCached).toBe(1)
    expect(second.skippedNonBot).toBe(0)
    expect(second.labeled).toBe(0)
    expect(await get('session-std')).toBeUndefined()
  })

  it('forgets a cached non-bot id once it leaves the gateway listing', async () => {
    const platform = new StubPlatform()
    platform.gatewayRows = [{ sessionId: 'session-std', running: false, updatedAt: 10, agentPreset: 'standard' }]
    const { bot } = boot(platform)
    await bot.reconcile()
    platform.gatewayRows = []
    await bot.reconcile()
    platform.gatewayRows = [{ sessionId: 'session-std', running: false, updatedAt: 10, agentPreset: 'standard' }]
    const back = await bot.reconcile()
    expect(back.skippedCached).toBe(0)
    expect(back.skippedNonBot).toBe(1)
  })

  it('shares one in-flight pass between concurrent callers', async () => {
    const platform = new StubPlatform()
    platform.gatewayRows = [{ sessionId: 'session-gui', running: false, updatedAt: 10, agentPreset: 'dsh-bot' }]
    const { bot } = boot(platform)
    const [a, b] = await Promise.all([bot.reconcile(), bot.reconcile()])
    expect(platform.listCalls).toBe(1)
    expect(b).toBe(a)
    await bot.reconcile()
    expect(platform.listCalls).toBe(2)
  })

  it('is idempotent and does not delete extra marks', async () => {
    const platform = new StubPlatform()
    platform.gatewayRows = [
      { sessionId: 'session-keep', running: false, updatedAt: 10, agentPreset: 'dsh-bot' },
    ]
    await put('session-keep', ['kind:hidden', 'custom:keep'])
    const { bot } = boot(platform)
    const first = await bot.reconcile()
    expect(first.labeled).toBe(1)
    const tags = await get('session-keep')
    expect(tags).toEqual(expect.arrayContaining(['app:dsh-bot', 'kind:dsh-bot', 'form:plugin', 'bot:dsh-bot', 'hidden', 'kind:hidden', 'custom:keep']))
    const second = await bot.reconcile()
    expect(second.labeled).toBe(0)
    expect(second.alreadyLabeled).toBe(1)
    expect(await get('session-keep')).toEqual(tags)
  })

  it('does not retag a session that already has bot:<id>', async () => {
    const platform = new StubPlatform()
    platform.gatewayRows = [
      { sessionId: 'session-owned', running: false, updatedAt: 10, agentPreset: 'dsh-bot' },
    ]
    await put('session-owned', ['kind:dsh-bot', 'bot:dsh-bot'])
    const { bot } = boot(platform)
    const result = await bot.reconcile()
    expect(result.alreadyLabeled).toBe(1)
    expect(result.labeled).toBe(0)
    expect(await get('session-owned')).toEqual(expect.arrayContaining(['app:dsh-bot', 'kind:dsh-bot', 'form:plugin', 'bot:dsh-bot']))
  })
})
