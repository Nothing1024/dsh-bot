/**
 * GUI / v1 session backfill: preset reverse-lookup, v1 leftovers, skip
 * cache, idempotence, never delete existing marks (Task 12).
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { get, put } from 'session-marks'
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
import type { PresetGate, PresetListEntry } from '../src/bots.ts'
import { parseBotMark } from '../src/marks.ts'
import type { DshBotModelRef, DshBotPlatform } from '../src/platform.ts'

const BASE_CONFIG: DshBotConfig = {
  webUrl: 'http://127.0.0.1:3084',
  askTimeoutMs: 30_000,
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

class StubSessionTool implements SessionToolService {
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
  gatewayRows: Array<{ sessionId: string; running: boolean; updatedAt: number; agentPreset?: string }> = []
  listCalls = 0

  async archiveSession() {}
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

function seedTemplate(home: string): void {
  const dir = join(home, '.agent-presets', 'dsh-bot')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'agent.cordis.yml'), TEMPLATE)
  writeFileSync(join(dir, 'preset.yml'), 'name: DSH Bot\n')
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
  const home = mkdtempSync(join(tmpdir(), 'dsh-bot-rec-'))
  homes.push(home)
  process.env.DSH_HOME = home
  seedTemplate(home)
})

afterEach(() => {
  while (homes.length > 0) {
    const home = homes.pop()
    if (home !== undefined) rmSync(home, { recursive: true, force: true })
  }
  if (previousHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousHome
})

function boot(platform?: StubPlatform): { bot: DshBotService; platform: StubPlatform } {
  const home = process.env.DSH_HOME!
  const gate = fsGate(home)
  const botsRuntime = createBotsRuntime({ gate, home: () => home, now: () => 1 })
  const plat = platform ?? new StubPlatform()
  const ctx = new Context()
  ctx.provide('sessionTool', new StubSessionTool())
  const bot = new DshBotService(ctx, BASE_CONFIG, plat, botsRuntime)
  return { bot, platform: plat }
}

describe('parseBotMark', () => {
  it('reads the first bot:<id> token', () => {
    expect(parseBotMark(['kind:dsh-bot', 'bot:shiren-xiaobei'])).toBe('shiren-xiaobei')
    expect(parseBotMark(['kind:dsh-bot'])).toBeUndefined()
    expect(parseBotMark(['bot:'])).toBeUndefined()
  })
})

describe('reconcileBotSessions', () => {
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
    expect(await get('session-gui')).toEqual(expect.arrayContaining(['kind:dsh-bot', 'bot:dsh-bot']))
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
    expect(await get('session-v1')).toEqual(expect.arrayContaining(['kind:dsh-bot', 'bot:dsh-bot']))
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
      expect.arrayContaining(['kind:dsh-bot', `bot:${created.id}`]),
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
    expect(tags).toEqual(expect.arrayContaining(['kind:dsh-bot', 'bot:dsh-bot', 'kind:hidden', 'custom:keep']))
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
    expect(await get('session-owned')).toEqual(expect.arrayContaining(['kind:dsh-bot', 'bot:dsh-bot']))
  })
})
