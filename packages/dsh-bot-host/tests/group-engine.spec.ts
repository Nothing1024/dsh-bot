/**
 * Group round engine: all-members, mention, pass skip, tool rows stay out
 * of the room, failure keeps the earlier reply (BR-304 / ASM-302 / ASM-303).
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {
  SessionToolCaller,
  SessionToolListResult,
  SessionToolMessageRow,
  SessionToolService,
} from 'session-tool'
import { DshBotError } from '../src/errors.ts'
import { createGroupsRuntime } from '../src/groups.ts'
import {
  buildMemberTurnPrompt,
  createRoundTracker,
  isSkipReply,
  parseMentions,
  runGroupRound,
} from '../src/group-engine.ts'
import { get } from 'session-marks'
import type { BotView, BotsRuntime } from '../src/bots.ts'
import type { DshBotModelRef, DshBotPlatform } from '../src/platform.ts'
import type { DshBotRuntimeConfig } from '../src/ask.ts'

const CONFIG: DshBotRuntimeConfig = {
  webUrl: 'http://127.0.0.1:3084',
  askTimeoutMs: 5_000,
}

const DSH: BotView = {
  id: 'dsh-bot',
  name: 'DSH Bot',
  avatar: { color: '#3db88a' },
  presetId: 'dsh-bot',
  createdAt: 1,
  persona: '你是 DSH Bot。',
  protected: true,
}

const POET: BotView = {
  id: 'shiren-xiaobei',
  name: '诗人小北',
  avatar: { color: '#c9a227', emoji: '📜' },
  presetId: 'dsh-bot--shiren-xiaobei',
  createdAt: 2,
  persona: '你是一位诗人。',
  protected: false,
}

class StubSessionTool implements SessionToolService {
  readonly writeCalls: Array<{ sessionId: string; content: string }> = []
  readonly replies = new Map<string, readonly SessionToolMessageRow[]>()
  waitStatus: 'idle' | 'failed' | 'timeout' = 'idle'
  failSessionIds = new Set<string>()
  listResult: SessionToolListResult = { sessions: [] }

  setReply(sessionId: string, messages: readonly SessionToolMessageRow[]): void {
    this.replies.set(sessionId, messages)
  }

  async create() {
    return { sessionId: SessionId('session-tool-created') }
  }

  async write(_caller: SessionToolCaller, sessionId: SessionId, content: string) {
    this.writeCalls.push({ sessionId: String(sessionId), content })
    return { sessionId }
  }

  async wait(_caller: SessionToolCaller, sessionId: SessionId) {
    if (this.failSessionIds.has(String(sessionId))) {
      return { sessionId, status: 'failed' as const }
    }
    return { sessionId, status: this.waitStatus }
  }

  async read(_caller: SessionToolCaller, sessionId: SessionId) {
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
  readonly archiveCalls: string[] = []
  private next = 0

  async archiveSession(sessionId: string) {
    this.archiveCalls.push(sessionId)
  }

  async selectModel() {}

  snapshotGlobalDefault(): DshBotModelRef {
    return { provider: 'anthropic', model: 'grok-4.6' }
  }

  async restoreGlobalDefault() {}

  async createSession(request: { agentPreset: string; cwd: string }) {
    this.createCalls.push(request)
    this.next += 1
    return { sessionId: `session-owned-${this.next}`, agentPreset: request.agentPreset }
  }

  async renameSession() {}

  async listSessions() {
    return []
  }
}

const fakeBots: BotsRuntime = {
  async listBots() {
    return { bots: [DSH, POET] }
  },
  async getBot(id: string) {
    if (id === DSH.id) return DSH
    if (id === POET.id) return POET
    throw new DshBotError('bot-not-found', id)
  },
  async createBot() {
    throw new DshBotError('internal', 'unused')
  },
  async updateBot() {
    throw new DshBotError('internal', 'unused')
  },
  async deleteBot() {
    throw new DshBotError('internal', 'unused')
  },
}

const homes: string[] = []
const previousHome = process.env.DSH_HOME

beforeEach(() => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-bot-engine-'))
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

async function setupRoom() {
  const home = process.env.DSH_HOME!
  const groups = createGroupsRuntime({
    listBotIds: async () => [DSH.id, POET.id],
    home: () => home,
    now: () => 1_700_000_000_000,
  })
  const group = await groups.createGroup({
    name: '编辑室',
    memberIds: [POET.id, DSH.id],
  })
  const room = await groups.createGroupSession({ groupId: group.id })
  return { groups, group, room }
}

function assistantText(sessionId: string, text: string): SessionToolMessageRow[] {
  return [
    { seq: 1, role: 'user', blocks: [{ type: 'text', text: 'prompt' }] },
    { seq: 2, role: 'assistant', blocks: [{ type: 'text', text }] },
  ] as SessionToolMessageRow[]
}

describe('parseMentions', () => {
  const members = [
    { id: POET.id, name: POET.name },
    { id: DSH.id, name: DSH.name },
  ]

  it('with no mention returns all members in roster order', () => {
    expect(parseMentions('你们是谁?', members).responderIds).toEqual([POET.id, DSH.id])
  })

  it('matches a Chinese name after @', () => {
    const parsed = parseMentions('@诗人小北 作一句诗', members)
    expect(parsed.responderIds).toEqual([POET.id])
    expect(parsed.unmatched).toBe(false)
  })

  it('treats @all as everyone', () => {
    expect(parseMentions('@all 都自我介绍', members).namedAll).toBe(true)
    expect(parseMentions('@everyone 都自我介绍', members).responderIds).toEqual([POET.id, DSH.id])
  })

  it('unmatched handle falls back to everyone', () => {
    const parsed = parseMentions('@幽灵 你好', members)
    expect(parsed.unmatched).toBe(true)
    expect(parsed.responderIds).toEqual([POET.id, DSH.id])
  })
})

describe('isSkipReply', () => {
  it('skips empty and (pass) in any case', () => {
    expect(isSkipReply('')).toBe(true)
    expect(isSkipReply('  (PASS)  ')).toBe(true)
    expect(isSkipReply('一句诗')).toBe(false)
  })
})

describe('buildMemberTurnPrompt', () => {
  it('is original copy and names the speaking member', () => {
    const prompt = buildMemberTurnPrompt({
      groupName: '编辑室',
      memberName: '诗人小北',
      peerNames: ['DSH Bot'],
      userText: '你们是谁?',
      recent: ['用户: 你们是谁?'],
    })
    expect(prompt).toMatch(/诗人小北/)
    expect(prompt).toMatch(/编辑室/)
    expect(prompt.includes('SendMessage')).toBe(false)
    expect(prompt.includes(['sand', '://'].join(''))).toBe(false)
  })
})

describe('runGroupRound', () => {
  it('appends two member replies in memberIds order', async () => {
    const { groups, room } = await setupRoom()
    const sessionTool = new StubSessionTool()
    const platform = new StubPlatform()
    sessionTool.setReply('session-owned-1', assistantText('session-owned-1', '我是诗人小北，先比喻再回答。'))
    sessionTool.setReply('session-owned-2', assistantText('session-owned-2', '我是 DSH Bot。'))
    const tracker = createRoundTracker()
    await runGroupRound({
      sessionTool,
      platform,
      bots: fakeBots,
      groups,
      config: CONFIG,
      tracker,
      createCwd: () => '/work',
    }, { roomId: room.roomId, text: '你们是谁?' })
    const state = await groups.peekRoom(room.roomId)
    const speakers = state?.messages.map(row => row.speaker) ?? []
    expect(speakers[0]).toEqual({ kind: 'user' })
    expect(speakers[1]).toEqual({ kind: 'member', botId: POET.id })
    expect(speakers[2]).toEqual({ kind: 'member', botId: DSH.id })
    expect(state?.messages[1]?.text).toMatch(/诗人小北/)
    expect(state?.messages[2]?.text).toMatch(/DSH Bot/)
    expect(platform.createCalls.map(call => call.agentPreset)).toEqual([
      'dsh-bot--shiren-xiaobei',
      'dsh-bot',
    ])
    expect(await get('session-owned-1')).toEqual(expect.arrayContaining([
      'kind:hidden',
      'bot:shiren-xiaobei',
      `group:${(await groups.listGroups()).groups[0]!.id}`,
      `group-room:${room.roomId}`,
    ]))
  })

  it('mention asks only the named member', async () => {
    const { groups, room } = await setupRoom()
    const sessionTool = new StubSessionTool()
    const platform = new StubPlatform()
    sessionTool.setReply('session-owned-1', assistantText('session-owned-1', '窗含西岭千秋雪'))
    await runGroupRound({
      sessionTool,
      platform,
      bots: fakeBots,
      groups,
      config: CONFIG,
      tracker: createRoundTracker(),
      createCwd: () => '/work',
    }, { roomId: room.roomId, text: '@诗人小北 作一句诗' })
    const state = await groups.peekRoom(room.roomId)
    const members = state?.messages.filter(row => row.speaker.kind === 'member') ?? []
    expect(members).toHaveLength(1)
    expect(members[0]?.speaker).toEqual({ kind: 'member', botId: POET.id })
    expect(platform.createCalls).toHaveLength(1)
  })

  it('skips (pass) and does not write a member line', async () => {
    const { groups, room } = await setupRoom()
    const sessionTool = new StubSessionTool()
    const platform = new StubPlatform()
    sessionTool.setReply('session-owned-1', assistantText('session-owned-1', '(pass)'))
    sessionTool.setReply('session-owned-2', assistantText('session-owned-2', '我是 DSH Bot。'))
    await runGroupRound({
      sessionTool,
      platform,
      bots: fakeBots,
      groups,
      config: CONFIG,
      tracker: createRoundTracker(),
      createCwd: () => '/work',
    }, { roomId: room.roomId, text: '你们是谁?' })
    const state = await groups.peekRoom(room.roomId)
    const members = state?.messages.filter(row => row.speaker.kind === 'member') ?? []
    expect(members).toHaveLength(1)
    expect(members[0]?.speaker).toEqual({ kind: 'member', botId: DSH.id })
  })

  it('does not copy tool rows into the room', async () => {
    const { groups, room } = await setupRoom()
    const sessionTool = new StubSessionTool()
    const platform = new StubPlatform()
    sessionTool.setReply('session-owned-1', [
      {
        seq: 2,
        role: 'assistant',
        blocks: [{ type: 'tool-call', id: 'c1', name: 'bash', arguments: '{"cmd":"secret"}' }],
      },
    ] as SessionToolMessageRow[])
    sessionTool.setReply('session-owned-2', assistantText('session-owned-2', '我是 DSH Bot。'))
    await runGroupRound({
      sessionTool,
      platform,
      bots: fakeBots,
      groups,
      config: CONFIG,
      tracker: createRoundTracker(),
      createCwd: () => '/work',
    }, { roomId: room.roomId, text: '你们是谁?' })
    const state = await groups.peekRoom(room.roomId)
    const blob = JSON.stringify(state?.messages)
    expect(blob).not.toMatch(/secret/)
    expect(blob).not.toMatch(/bash/)
    const members = state?.messages.filter(row => row.speaker.kind === 'member') ?? []
    expect(members).toHaveLength(1)
  })

  it('keeps the first reply when a later member fails', async () => {
    const { groups, room } = await setupRoom()
    const sessionTool = new StubSessionTool()
    const platform = new StubPlatform()
    sessionTool.setReply('session-owned-1', assistantText('session-owned-1', '我是诗人小北'))
    sessionTool.failSessionIds.add('session-owned-2')
    await runGroupRound({
      sessionTool,
      platform,
      bots: fakeBots,
      groups,
      config: CONFIG,
      tracker: createRoundTracker(),
      createCwd: () => '/work',
    }, { roomId: room.roomId, text: '你们是谁?' })
    const state = await groups.peekRoom(room.roomId)
    expect(state?.messages.some(row => row.speaker.kind === 'member' && row.speaker.botId === POET.id)).toBe(true)
    expect(state?.messages.some(row => row.speaker.kind === 'error' && row.speaker.botId === DSH.id)).toBe(true)
  })

  it('reuses the hidden session on a second round', async () => {
    const { groups, room } = await setupRoom()
    const sessionTool = new StubSessionTool()
    const platform = new StubPlatform()
    sessionTool.setReply('session-owned-1', assistantText('session-owned-1', '第一轮小北'))
    sessionTool.setReply('session-owned-2', assistantText('session-owned-2', '第一轮 DSH'))
    const deps = {
      sessionTool,
      platform,
      bots: fakeBots,
      groups,
      config: CONFIG,
      tracker: createRoundTracker(),
      createCwd: () => '/work',
    }
    await runGroupRound(deps, { roomId: room.roomId, text: '你们是谁?' })
    sessionTool.setReply('session-owned-1', assistantText('session-owned-1', '第二轮小北'))
    sessionTool.setReply('session-owned-2', assistantText('session-owned-2', '第二轮 DSH'))
    await runGroupRound(deps, { roomId: room.roomId, text: '再介绍一次' })
    expect(platform.createCalls).toHaveLength(2)
    const state = await groups.peekRoom(room.roomId)
    const memberTexts = state?.messages.filter(row => row.speaker.kind === 'member').map(row => row.text) ?? []
    expect(memberTexts).toEqual(['第一轮小北', '第一轮 DSH', '第二轮小北', '第二轮 DSH'])
  })
})
