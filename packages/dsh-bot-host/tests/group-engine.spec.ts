/**
 * Group discussion engine: mention, pass skip, tool rows stay out of the
 * room, failure keeps the earlier reply, and a user prompt may run up to
 * three rotated rounds (BR-304 / reference GroupChatOrchestrator).
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GroupInbox } from '../src/group-inbox.ts'
import { projectRoomHistory } from '../src/workbench-sessions.ts'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {
  SessionToolCaller,
  SessionToolListResult,
  SessionToolMessageRow,
  SessionToolService,
} from 'session-tool'
import { DshBotError } from '../src/errors.ts'
import { createGroupsRuntime } from '../src/groups.ts'
import type { GroupsRuntime } from '../src/groups.ts'
import {
  buildMemberTurnPrompt,
  createRoundTracker,
  isSkipReply,
  latestPublishableSpeech,
  orderRoundSpeakers,
  parseMentions,
  retryMemberTurn,
  runGroupRound,
  toRoomSpeech,
} from '../src/group-engine.ts'
import { get, patch } from 'session-marks'
import { expandRemoveAliases, expandWriteAliases } from '../src/marks.ts'
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
  pinned: false,
  section: 'work',
  hidden: false,
  order: 1,
  muted: false,
}

const POET: BotView = {
  id: 'shiren-xiaobei',
  name: '诗人小北',
  avatar: { color: '#c9a227', emoji: '📜' },
  presetId: 'dsh-bot--shiren-xiaobei',
  createdAt: 2,
  persona: '你是一位诗人。',
  protected: false,
  pinned: false,
  section: 'work',
  hidden: false,
  order: 2,
  muted: false,
}

class StubSessionTool implements SessionToolService {
  async readMarks(_caller: Parameters<SessionToolService['readMarks']>[0], sessionId: SessionId) {
    return { sessionId, tags: [], hiddenPrefixes: ['~'] }
  }

  readonly writeCalls: Array<{ sessionId: string; content: string }> = []
  readonly createCalls: unknown[] = []
  readonly replies = new Map<string, readonly SessionToolMessageRow[]>()
  readonly queuedReplies = new Map<string, Array<readonly SessionToolMessageRow[]>>()
  waitStatus: 'idle' | 'failed' | 'timeout' = 'idle'
  /** Statuses consumed before `waitStatus`. A leading `timeout` is a still-running turn. */
  waitQueue: Array<'idle' | 'failed' | 'timeout'> = []
  waitCount = 0
  failSessionIds = new Set<string>()
  listResult: SessionToolListResult = { sessions: [] }
  private next = 0

  setReply(sessionId: string, messages: readonly SessionToolMessageRow[]): void {
    const queued = this.queuedReplies.get(sessionId) ?? []
    queued.push(messages)
    this.queuedReplies.set(sessionId, queued)
  }

  async create(_caller: SessionToolCaller, options: Parameters<SessionToolService['create']>[1]) {
    this.next += 1
    const sessionId = SessionId(`session-owned-${this.next}`)
    this.createCalls.push({ sessionId, options })
    if (options.tags !== undefined && options.tags.length > 0) {
      await patch(sessionId, { add: expandWriteAliases(options.tags) })
    }
    return { sessionId }
  }

  async write(_caller: SessionToolCaller, sessionId: SessionId, content: string) {
    this.writeCalls.push({ sessionId: String(sessionId), content })
    const queued = this.queuedReplies.get(String(sessionId))
    const next = queued?.shift()
    if (queued !== undefined && queued.length === 0) this.queuedReplies.delete(String(sessionId))
    if (next !== undefined) {
      const previous = this.replies.get(String(sessionId)) ?? []
      const lastSeq = previous.reduce((max, row) => Math.max(max, row.seq), 0)
      this.replies.set(String(sessionId), [...previous, ...next.map((row, index) => ({ ...row, seq: lastSeq + index + 1 }))])
    }
    return { sessionId }
  }

  async wait(_caller: SessionToolCaller, sessionId: SessionId) {
    this.waitCount += 1
    if (this.failSessionIds.has(String(sessionId))) {
      return { sessionId, status: 'failed' as const }
    }
    const queued = this.waitQueue.shift()
    return { sessionId, status: queued ?? this.waitStatus }
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
  readonly createCalls: Array<{ agentPreset: string; cwd: string }> = []
  readonly archiveCalls: string[] = []
  private next = 0

  async archiveSession(sessionId: string) {
    this.archiveCalls.push(sessionId)
  }

  readonly unarchiveCalls: string[] = []
  async unarchiveSession(sessionId: string) {
    this.unarchiveCalls.push(sessionId)
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
  async declineTopic() {
    throw new DshBotError('internal', 'unused')
  },
  async updateLayout() {
    return { ok: true as const, skipped: [] }
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

async function voiceFor(botId: string): Promise<string> {
  if (botId === POET.id) return POET.persona
  if (botId === DSH.id) return DSH.persona
  return ''
}

function engineDeps(
  sessionTool: StubSessionTool,
  platform: StubPlatform,
  groups: GroupsRuntime,
  tracker = createRoundTracker(),
) {
  return {
    sessionTool,
    platform,
    bots: fakeBots,
    groups,
    config: CONFIG,
    tracker,
    createCwd: () => '/work',
    voiceFor,
  }
}

function assistantText(_sessionId: string, text: string): SessionToolMessageRow[] {
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

  it('unmatched handle does not broadcast', () => {
    const parsed = parseMentions('@幽灵 你好', members)
    expect(parsed.unmatched).toBe(true)
    expect(parsed.responderIds).toEqual([])
  })

  it('matches spaced names and rejects mixed invalid mentions', () => {
    expect(parseMentions('@DSH Bot 请回复', members).responderIds).toEqual([DSH.id])
    expect(parseMentions('@DSH Bot @幽灵 请回复', members).unmatched).toBe(true)
  })
})
describe('orderRoundSpeakers', () => {
  it('rotates the start member by round index', () => {
    expect(orderRoundSpeakers(['a', 'b'], 0)).toEqual(['a', 'b'])
    expect(orderRoundSpeakers(['a', 'b'], 1)).toEqual(['b', 'a'])
    expect(orderRoundSpeakers(['a', 'b'], 2)).toEqual(['a', 'b'])
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
  it('names the speaker and room without host banners', () => {
    const prompt = buildMemberTurnPrompt({
      groupName: '编辑室',
      memberName: '诗人小北',
      peerNames: ['DSH Bot'],
      recent: ['用户: 你们是谁?'],
    })
    expect(prompt).toMatch(/诗人小北/)
    expect(prompt).toMatch(/编辑室/)
    expect(prompt).toMatch(/用户: 你们是谁/)
    expect(prompt).not.toMatch(/【/)
    expect(prompt).not.toMatch(/小组房间轮次/)
    expect(prompt).not.toMatch(/SAND_HIDDEN/)
    expect(prompt).not.toMatch(/Group chat:/)
    expect(prompt.includes('SendMessage')).toBe(false)
    expect(prompt.includes(['sand', '://'].join(''))).toBe(false)
  })
})

describe('toRoomSpeech', () => {
  const prompt = buildMemberTurnPrompt({
    groupName: '编辑室',
    memberName: '诗人小北',
    peerNames: ['DSH Bot'],
    recent: ['用户: 你们是谁?'],
  })

  it('returns the assistant line as room speech', () => {
    expect(toRoomSpeech('我是诗人小北。', prompt)).toBe('我是诗人小北。')
  })

  it('strips an echoed turn prompt', () => {
    expect(toRoomSpeech(`${prompt}\n\n窗含西岭千秋雪`, prompt)).toBe('窗含西岭千秋雪')
  })

  it('strips leaked host banners', () => {
    expect(toRoomSpeech('【小组房间轮次】\n我是小北', prompt)).toBe('我是小北')
    expect(toRoomSpeech('[SAND_HIDDEN_PROMPT]hello', prompt)).toBe('hello')
  })

  it('skips pass and empty', () => {
    expect(toRoomSpeech('(pass)', prompt)).toBeUndefined()
    expect(toRoomSpeech('   ', prompt)).toBeUndefined()
  })
})

describe('latestPublishableSpeech', () => {
  it('keeps an earlier delivery when the tail is (pass)', () => {
    const messages = [
      { seq: 2, role: 'assistant', blocks: [{ type: 'text', text: '交活了' }] },
      { seq: 3, role: 'assistant', blocks: [{ type: 'text', text: '(pass)' }] },
    ] as SessionToolMessageRow[]
    expect(latestPublishableSpeech(messages)).toBe('交活了')
  })
})

describe('runGroupRound', () => {
  it('rejects unknown recipients before persisting or starting any member', async () => {
    const { groups, room } = await setupRoom()
    const tool = new StubSessionTool()
    const deps = engineDeps(tool, new StubPlatform(), groups)
    const inbox = new GroupInbox(() => deps)
    await expect(inbox.submit({ sessionId: room.roomId, text: '@DSH Bot @幽灵 请回答' }))
      .rejects.toMatchObject({ code: 'invalid-mention' })
    expect(tool.writeCalls).toHaveLength(0)
    expect((await groups.peekRoom(room.roomId))?.messages).toHaveLength(0)
    await expect(runGroupRound(deps, { roomId: room.roomId, text: '@幽灵 请回答' }))
      .rejects.toMatchObject({ code: 'invalid-mention' })
    expect(tool.writeCalls).toHaveLength(0)
  })
  it('accepts and deduplicates a message before the member finishes', async () => {
    const { groups, room } = await setupRoom()
    const tool = new StubSessionTool()
    let resolve!: (value: void) => void
    const promise = new Promise<void>(done => { resolve = done })
    tool.wait = async (_caller, sessionId) => { await promise; return { sessionId, status: 'idle' as const } }
    const inbox = new GroupInbox(() => engineDeps(tool, new StubPlatform(), groups))
    const input = { sessionId: room.roomId, text: '@诗人小北 hello', requestId: 'request-1' }
    const accepted = await inbox.submit(input)
    expect(accepted.messageId).toBeTruthy()
    expect(await inbox.submit(input)).toEqual(accepted)
    await vi.waitFor(() => expect(tool.writeCalls).toHaveLength(1))
    expect((await groups.peekRoom(room.roomId))?.messages.filter(row => row.speaker.kind === 'user')).toHaveLength(1)
    resolve()
    await inbox.settled(room.roomId)
  })

  it('cancels the actual member session and prevents later members from starting', async () => {
    const { groups, room } = await setupRoom()
    const tool = new StubSessionTool()
    let resolve!: (value: void) => void
    const promise = new Promise<void>(done => { resolve = done })
    tool.wait = async (_caller, sessionId) => { await promise; return { sessionId, status: 'idle' as const } }
    const cancelSession = vi.fn(async () => { resolve(); return { accepted: true as const } })
    const deps = engineDeps(tool, Object.assign(new StubPlatform(), { cancelSession }), groups)
    const inbox = new GroupInbox(() => deps)
    await inbox.submit({ sessionId: room.roomId, text: 'hello', requestId: 'cancel-me' })
    await vi.waitFor(() => expect(tool.writeCalls).toHaveLength(1))
    expect(await inbox.submit({ sessionId: room.roomId, text: 'queued', requestId: 'cancel-queued' }))
      .toMatchObject({ queued: true, queueId: expect.any(String) })
    expect(await inbox.cancel(room.roomId)).toEqual({ accepted: true, dropped: 1 })
    await inbox.settled(room.roomId)
    expect(cancelSession).toHaveBeenCalledWith('session-owned-1')
    expect(tool.writeCalls).toHaveLength(1)
    expect(inbox.queued(room.roomId)).toEqual([])
    const reloaded = createGroupsRuntime({ home: () => process.env.DSH_HOME!, listBotIds: async () => [DSH.id, POET.id] })
    const stopped = (await reloaded.peekRoom(room.roomId))!.messages.filter(row => row.speaker.kind === 'user')
    // INV-002: the queued prompt was never persisted, so stop leaves only the running line, marked cancelled.
    expect(stopped).toEqual([
      expect.objectContaining({ requestId: 'cancel-me', cancelledAt: expect.any(Number) }),
    ])
    await inbox.submit({ sessionId: room.roomId, text: '@DSH Bot fresh-question', requestId: 'fresh' })
    await inbox.settled(room.roomId)
    expect(tool.writeCalls.at(-1)?.content).not.toContain('用户: queued')
    expect(tool.writeCalls.at(-1)?.content).not.toContain('用户: hello')
    const fresh = (await reloaded.peekRoom(room.roomId))!.messages.find(row => row.requestId === 'fresh')
    expect(fresh?.cancelledAt).toBeUndefined()
    await inbox.cancel(room.roomId)
    const state = (await reloaded.peekRoom(room.roomId))!
    expect(projectRoomHistory(state, new Map()).filter(row => row.cancelledAt !== undefined)).toHaveLength(1)
    expect(state.messages.find(row => row.requestId === 'fresh')?.cancelledAt).toBeUndefined()
  })

  it('holds new admissions until a concurrent stop has persisted the cancellation', async () => {
    const { groups, room } = await setupRoom()
    const tool = new StubSessionTool()
    let finishTurn!: () => void
    const turn = new Promise<void>(resolve => { finishTurn = resolve })
    tool.wait = async (_caller, sessionId) => { await turn; return { sessionId, status: 'idle' as const } }
    const deps = engineDeps(tool, Object.assign(new StubPlatform(), { cancelSession: async () => { finishTurn(); return { accepted: true as const } } }), groups)
    const originalMark = groups.markRoomCancelled.bind(groups)
    let finishSave!: () => void
    const save = new Promise<void>(resolve => { finishSave = resolve })
    const mark = vi.spyOn(groups, 'markRoomCancelled').mockImplementation(async (...args) => { await save; await originalMark(...args) })
    const inbox = new GroupInbox(() => deps)
    await inbox.submit({ sessionId: room.roomId, text: 'cancelled-input', requestId: 'old' })
    await vi.waitFor(() => expect(tool.writeCalls).toHaveLength(1))
    const stopping = inbox.cancel(room.roomId)
    await vi.waitFor(() => expect(mark).toHaveBeenCalledTimes(1))
    const next = inbox.submit({ sessionId: room.roomId, text: '@DSH Bot new-input', requestId: 'new' })
    await Promise.resolve()
    expect((await groups.peekRoom(room.roomId))!.messages.some(row => row.requestId === 'new')).toBe(false)
    finishSave()
    await Promise.all([stopping, next])
    await inbox.settled(room.roomId)
    expect(tool.writeCalls.at(-1)?.content).not.toContain('cancelled-input')
  })

  it('keeps each accepted message in its own round when later messages arrive during a reply', async () => {
    const { groups, room } = await setupRoom()
    const tool = new StubSessionTool()
    let release!: () => void
    const waiting = new Promise<void>(resolve => { release = resolve })
    tool.wait = async (_caller, sessionId) => { await waiting; return { sessionId, status: 'idle' as const } }
    tool.setReply('session-owned-1', assistantText('session-owned-1', 'first answer'))
    const inbox = new GroupInbox(() => engineDeps(tool, new StubPlatform(), groups))
    await inbox.submit({ sessionId: room.roomId, text: '@诗人小北 first-question', requestId: 'first' })
    await vi.waitFor(() => expect(tool.writeCalls).toHaveLength(1))
    const second = await inbox.submit({ sessionId: room.roomId, text: '@诗人小北 second-question', requestId: 'second' })
    expect(second).toMatchObject({ queued: true, queueId: expect.any(String) })
    expect(second.messageId).toBeUndefined()
    // INV-002: still only the first user line on disk while it waits.
    expect((await groups.peekRoom(room.roomId))!.messages.filter(row => row.speaker.kind === 'user').map(row => row.requestId)).toEqual(['first'])
    expect(await inbox.submit({ sessionId: room.roomId, text: '@诗人小北 second-question', requestId: 'second' })).toEqual(second)
    release()
    await inbox.settled(room.roomId)
    expect(tool.writeCalls).toHaveLength(2)
    expect(tool.writeCalls[0]?.content).not.toContain('second-question')
    expect(tool.writeCalls[1]?.content).toContain('second-question')
    expect((await groups.peekRoom(room.roomId))!.messages.filter(row => row.speaker.kind === 'user').map(row => row.requestId)).toEqual(['first', 'second'])
    expect(inbox.queued(room.roomId)).toEqual([])
    await expect(inbox.submit({ sessionId: room.roomId, text: 'different', requestId: 'first' })).rejects.toThrow('requestId')
  })

  it('queues at most three, rejects the fourth, and cancelled items never reach the room (BR-002)', async () => {
    const { groups, room } = await setupRoom()
    const tool = new StubSessionTool()
    let release!: () => void
    const waiting = new Promise<void>(resolve => { release = resolve })
    tool.wait = async (_caller, sessionId) => { await waiting; return { sessionId, status: 'idle' as const } }
    const inbox = new GroupInbox(() => engineDeps(tool, new StubPlatform(), groups))
    await inbox.submit({ sessionId: room.roomId, text: '@诗人小北 running' })
    await vi.waitFor(() => expect(tool.writeCalls).toHaveLength(1))
    const queued = []
    for (const text of ['q1', 'q2', 'q3']) queued.push(await inbox.submit({ sessionId: room.roomId, text: `@诗人小北 ${text}` }))
    await expect(inbox.submit({ sessionId: room.roomId, text: '@诗人小北 q4' })).rejects.toMatchObject({ code: 'queue-full' })
    await expect(inbox.submit({ sessionId: room.roomId, text: '@幽灵 bad' })).rejects.toMatchObject({ code: 'invalid-mention' })
    expect(inbox.queued(room.roomId).map(row => row.text)).toEqual(['@诗人小北 q1', '@诗人小北 q2', '@诗人小北 q3'])
    expect(inbox.busy(room.roomId)).toBe(true)
    await inbox.cancelQueued(room.roomId, queued[1]!.queueId!)
    await expect(inbox.cancelQueued(room.roomId, queued[1]!.queueId!)).rejects.toMatchObject({ code: 'not-found', message: '这条已开始讨论，无法取消' })
    release()
    await inbox.settled(room.roomId)
    const users = (await groups.peekRoom(room.roomId))!.messages.filter(row => row.speaker.kind === 'user').map(row => row.text)
    expect(users).toEqual(['@诗人小北 running', '@诗人小北 q1', '@诗人小北 q3'])
    expect(tool.writeCalls.map(call => call.content).some(content => content.includes('q2'))).toBe(false)
    expect(inbox.busy(room.roomId)).toBe(false)
  })

  it('a queued quote keeps its quoted member when it is dequeued', async () => {
    const { groups, room } = await setupRoom()
    const quoted = await groups.appendRoomMessage(room.roomId, { kind: 'member', botId: POET.id }, '原句')
    const tool = new StubSessionTool()
    let release!: () => void
    const waiting = new Promise<void>(resolve => { release = resolve })
    tool.wait = async (_caller, sessionId) => { await waiting; return { sessionId, status: 'idle' as const } }
    const inbox = new GroupInbox(() => engineDeps(tool, new StubPlatform(), groups))
    await inbox.submit({ sessionId: room.roomId, text: '@DSH Bot running' })
    await vi.waitFor(() => expect(tool.writeCalls).toHaveLength(1))
    await inbox.submit({ sessionId: room.roomId, text: '改短一点', replyToSeq: quoted.seq })
    expect(inbox.queued(room.roomId)[0]?.replyTo).toEqual({ seq: quoted.seq, speaker: '诗人小北', text: '原句' })
    release()
    await inbox.settled(room.roomId)
    const second = tool.writeCalls.slice(1)
    expect(second).toHaveLength(1)
    expect(second[0]?.content).toContain('诗人小北，现在轮到你')
  })

  it('continueDiscussion refuses an empty or busy room and runs only when idle (BR-003)', async () => {
    const { groups, room } = await setupRoom()
    const tool = new StubSessionTool()
    const inbox = new GroupInbox(() => engineDeps(tool, new StubPlatform(), groups))
    await expect(inbox.continueDiscussion(room.roomId)).rejects.toMatchObject({ code: 'invalid-input', message: '先发一条消息开始讨论' })
    await groups.appendRoomMessage(room.roomId, { kind: 'user' }, '起个标题')
    await expect(inbox.continueDiscussion(room.roomId)).rejects.toMatchObject({ message: '先发一条消息开始讨论' })
    await groups.appendRoomMessage(room.roomId, { kind: 'member', botId: POET.id }, '秋声')
    let release!: () => void
    const waiting = new Promise<void>(resolve => { release = resolve })
    tool.wait = async (_caller, sessionId) => { await waiting; return { sessionId, status: 'idle' as const } }
    const started = await inbox.continueDiscussion(room.roomId)
    expect(started.messageId).toBeTruthy()
    await vi.waitFor(() => expect(tool.writeCalls).toHaveLength(1))
    await expect(inbox.continueDiscussion(room.roomId)).rejects.toMatchObject({ message: 'room is busy' })
    release()
    await inbox.settled(room.roomId)
    const messages = (await groups.peekRoom(room.roomId))!.messages
    expect(messages.filter(row => row.speaker.kind === 'user')).toHaveLength(1)
    expect(messages.filter(row => row.speaker.kind === 'system')).toHaveLength(1)
  })

  it('persists the quoted message and includes it in the member prompt', async () => {
    const { groups, room } = await setupRoom()
    const quoted = await groups.appendRoomMessage(room.roomId, { kind: 'member', botId: POET.id }, 'original answer')
    const tool = new StubSessionTool()
    const inbox = new GroupInbox(() => engineDeps(tool, new StubPlatform(), groups))
    await inbox.submit({ sessionId: room.roomId, text: '@诗人小北 revise', requestId: 'reply-1', replyToSeq: quoted.seq })
    await inbox.settled(room.roomId)
    const user = (await groups.peekRoom(room.roomId))?.messages.find(row => row.speaker.kind === 'user')
    expect(user?.replyTo?.seq).toBe(quoted.seq)
    expect(tool.writeCalls[0]?.content).toContain('original answer')
    expect(tool.writeCalls[0]?.content).toContain('引用')
  })

  it('skips a member that is no longer in the bot registry', async () => {
    const home = process.env.DSH_HOME!
    const groups = createGroupsRuntime({
      listBotIds: async () => [DSH.id, POET.id, 'gone'],
      home: () => home,
      now: () => 1_700_000_000_000,
    })
    const group = await groups.createGroup({
      name: '残留',
      memberIds: [POET.id, 'gone', DSH.id],
    })
    const room = await groups.createGroupSession({ groupId: group.id })
    const sessionTool = new StubSessionTool()
    const platform = new StubPlatform()
    sessionTool.setReply('session-owned-1', assistantText('session-owned-1', '我是诗人小北。'))
    sessionTool.setReply('session-owned-2', assistantText('session-owned-2', '我是 DSH Bot。'))
    await runGroupRound(engineDeps(sessionTool, platform, groups), { roomId: room.roomId, text: '你们是谁?' })
    const state = await groups.peekRoom(room.roomId)
    const speakers = state?.messages.map(row => row.speaker) ?? []
    expect(speakers).toEqual([
      { kind: 'user' },
      { kind: 'member', botId: POET.id },
      { kind: 'member', botId: DSH.id },
    ])
    expect(sessionTool.createCalls).toHaveLength(2)
  })

  it('appends two member replies in memberIds order', async () => {
    const { groups, room } = await setupRoom()
    const sessionTool = new StubSessionTool()
    const platform = new StubPlatform()
    sessionTool.setReply('session-owned-1', assistantText('session-owned-1', '我是诗人小北，先比喻再回答。'))
    sessionTool.setReply('session-owned-2', assistantText('session-owned-2', '我是 DSH Bot。'))
    await runGroupRound(engineDeps(sessionTool, platform, groups), { roomId: room.roomId, text: '你们是谁?' })
    const state = await groups.peekRoom(room.roomId)
    const speakers = state?.messages.map(row => row.speaker) ?? []
    expect(speakers[0]).toEqual({ kind: 'user' })
    expect(speakers[1]).toEqual({ kind: 'member', botId: POET.id })
    expect(speakers[2]).toEqual({ kind: 'member', botId: DSH.id })
    expect(state?.messages[1]?.text).toMatch(/诗人小北/)
    expect(state?.messages[2]?.text).toMatch(/DSH Bot/)
    expect(sessionTool.createCalls).toHaveLength(2)
    expect(await get('session-owned-1')).toEqual(expect.arrayContaining([
      'app:dsh-bot',
      'kind:dsh-bot',
      'form:plugin',
      'hidden',
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
    await runGroupRound(engineDeps(sessionTool, platform, groups), { roomId: room.roomId, text: '@诗人小北 作一句诗' })
    const state = await groups.peekRoom(room.roomId)
    const members = state?.messages.filter(row => row.speaker.kind === 'member') ?? []
    expect(members).toHaveLength(1)
    expect(members[0]?.speaker).toEqual({ kind: 'member', botId: POET.id })
    expect(sessionTool.createCalls).toHaveLength(1)
  })

  it('a quote of a member wakes only that member (BR-001)', async () => {
    const { groups, room } = await setupRoom()
    const sessionTool = new StubSessionTool()
    sessionTool.setReply('session-owned-1', assistantText('session-owned-1', '短一点：秋'))
    await runGroupRound(engineDeps(sessionTool, new StubPlatform(), groups), { roomId: room.roomId, text: '这句改短一点', quotedBotId: POET.id })
    const members = (await groups.peekRoom(room.roomId))?.messages.filter(row => row.speaker.kind === 'member') ?? []
    expect(members.map(row => row.speaker)).toEqual([{ kind: 'member', botId: POET.id }])
    expect(sessionTool.createCalls).toHaveLength(1)
  })

  it('an explicit @ overrides the quote, and a departed quoted member falls back to everyone', async () => {
    const { groups, room } = await setupRoom()
    const sessionTool = new StubSessionTool()
    sessionTool.setReply('session-owned-1', assistantText('session-owned-1', 'DSH 来改'))
    const deps = engineDeps(sessionTool, new StubPlatform(), groups)
    await runGroupRound(deps, { roomId: room.roomId, text: '@DSH Bot 你来改', quotedBotId: POET.id })
    expect((await groups.peekRoom(room.roomId))?.messages.filter(row => row.speaker.kind === 'member').map(row => row.speaker))
      .toEqual([{ kind: 'member', botId: DSH.id }])
    sessionTool.writeCalls.length = 0
    await runGroupRound(deps, { roomId: room.roomId, text: '大家看看', quotedBotId: 'gone' })
    expect(sessionTool.writeCalls.length).toBeGreaterThanOrEqual(2)
  })

  it('continuation anchors on a system line, adds no user line, and skips members with nothing new (BR-003)', async () => {
    const { groups, room } = await setupRoom()
    await groups.appendRoomMessage(room.roomId, { kind: 'user' }, '起个标题')
    await groups.appendRoomMessage(room.roomId, { kind: 'member', botId: POET.id }, '秋声')
    await groups.appendRoomMessage(room.roomId, { kind: 'member', botId: DSH.id }, '秋声赋')
    const sessionTool = new StubSessionTool()
    sessionTool.setReply('session-owned-1', assistantText('session-owned-1', '那就叫秋声赋吧'))
    await runGroupRound(engineDeps(sessionTool, new StubPlatform(), groups), { roomId: room.roomId, text: '继续讨论', continuation: true })
    const messages = (await groups.peekRoom(room.roomId))?.messages ?? []
    expect(messages.filter(row => row.speaker.kind === 'user')).toHaveLength(1)
    expect(messages[3]).toMatchObject({ speaker: { kind: 'system' }, text: '继续讨论' })
    expect(messages[4]).toMatchObject({ speaker: { kind: 'member', botId: POET.id }, text: '那就叫秋声赋吧' })
    expect(sessionTool.writeCalls[0]?.sessionId).toBe('session-owned-1')
    expect(sessionTool.writeCalls[0]?.content).toContain('主持提示：请接着刚才的讨论继续。')
    expect(sessionTool.writeCalls.every(call => !call.content.includes('用户: 继续讨论'))).toBe(true)
  })

  it('does not copy an echoed turn prompt into the room', async () => {
    const { groups, group, room } = await setupRoom()
    const sessionTool = new StubSessionTool()
    const platform = new StubPlatform()
    const wake = buildMemberTurnPrompt({
      groupName: group.name,
      memberName: POET.name,
      peerNames: [DSH.name],
      recent: ['用户: 你们是谁?'],
    })
    const leaked = `【小组房间轮次】\n${wake}\n\n我才是房间里该看见的那句。`
    sessionTool.setReply('session-owned-1', assistantText('session-owned-1', leaked))
    sessionTool.setReply('session-owned-2', assistantText('session-owned-2', '我是 DSH Bot。'))
    await runGroupRound(engineDeps(sessionTool, platform, groups), { roomId: room.roomId, text: '你们是谁?' })
    const state = await groups.peekRoom(room.roomId)
    const blob = JSON.stringify(state?.messages)
    expect(blob).not.toMatch(/小组房间轮次/)
    expect(blob).toMatch(/我才是房间里该看见的那句/)
  })

  it('skips (pass) and does not write a member line', async () => {
    const { groups, room } = await setupRoom()
    const sessionTool = new StubSessionTool()
    const platform = new StubPlatform()
    sessionTool.setReply('session-owned-1', assistantText('session-owned-1', '(pass)'))
    sessionTool.setReply('session-owned-2', assistantText('session-owned-2', '我是 DSH Bot。'))
    await runGroupRound(engineDeps(sessionTool, platform, groups), { roomId: room.roomId, text: '你们是谁?' })
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
    ] as unknown as SessionToolMessageRow[])
    sessionTool.setReply('session-owned-2', assistantText('session-owned-2', '我是 DSH Bot。'))
    await runGroupRound(engineDeps(sessionTool, platform, groups), { roomId: room.roomId, text: '你们是谁?' })
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
    await runGroupRound(engineDeps(sessionTool, platform, groups), { roomId: room.roomId, text: '你们是谁?' })
    const state = await groups.peekRoom(room.roomId)
    expect(state?.messages.some(row => row.speaker.kind === 'member' && row.speaker.botId === POET.id)).toBe(true)
    const error = state?.messages.find(row => row.speaker.kind === 'error' && row.speaker.botId === DSH.id)
    expect(error?.text).toBe('DSH Bot failed to reply (status failed)')
    expect(error?.speaker).toMatchObject({ kind: 'error', code: 'session-failed' })
  })

  it('keeps a member reply that arrives after askTimeoutMs while the session is still running', async () => {
    const { groups, room } = await setupRoom()
    const sessionTool = new StubSessionTool()
    const platform = new StubPlatform()
    sessionTool.setReply('session-owned-1', assistantText('session-owned-1', '写完了'))
    sessionTool.waitQueue = ['timeout', 'timeout', 'idle']
    await runGroupRound(engineDeps(sessionTool, platform, groups), { roomId: room.roomId, text: '@诗人小北 写长一点' })
    const messages = (await groups.peekRoom(room.roomId))?.messages ?? []
    expect(messages.some(row => row.speaker.kind === 'error')).toBe(false)
    expect(messages.filter(row => row.speaker.kind === 'member').map(row => row.text)).toEqual(['写完了'])
    expect(sessionTool.waitCount).toBe(3)
  })

  it('retries only the failed member without another user line', async () => {
    const { groups, room } = await setupRoom()
    const sessionTool = new StubSessionTool()
    const platform = new StubPlatform()
    sessionTool.setReply('session-owned-1', assistantText('session-owned-1', '我是诗人小北'))
    sessionTool.failSessionIds.add('session-owned-2')
    const deps = engineDeps(sessionTool, platform, groups)
    await runGroupRound(deps, { roomId: room.roomId, text: '你们是谁?' })
    const failed = await groups.peekRoom(room.roomId)
    const error = [...failed?.messages ?? []].reverse().find(row =>
      row.speaker.kind === 'error' && row.speaker.botId === DSH.id,
    )
    expect(error).toBeDefined()
    sessionTool.failSessionIds.delete('session-owned-2')
    sessionTool.setReply('session-owned-2', assistantText('session-owned-2', '我是 DSH Bot'))
    await retryMemberTurn(deps, { roomId: room.roomId, botId: DSH.id, errorSeq: error!.seq })
    const state = await groups.peekRoom(room.roomId)
    const users = state?.messages.filter(row => row.speaker.kind === 'user') ?? []
    const poet = state?.messages.filter(row => row.speaker.kind === 'member' && row.speaker.botId === POET.id) ?? []
    const dsh = state?.messages.filter(row => row.speaker.kind === 'member' && row.speaker.botId === DSH.id) ?? []
    expect(users.map(row => row.text)).toEqual(['你们是谁?'])
    expect(poet.map(row => row.text)).toEqual(['我是诗人小北'])
    expect(dsh.map(row => row.text)).toEqual(['我是 DSH Bot'])
  })

  it('posts a hidden-session delivery that (pass) retries never copied into the room', async () => {
    const { groups, room } = await setupRoom()
    const sessionTool = new StubSessionTool()
    const platform = new StubPlatform()
    sessionTool.setReply('session-owned-1', assistantText('session-owned-1', '我是诗人小北'))
    sessionTool.failSessionIds.add('session-owned-2')
    sessionTool.setReply('session-owned-2', assistantText('session-owned-2', '交活了'))
    const deps = engineDeps(sessionTool, platform, groups)
    await runGroupRound(deps, { roomId: room.roomId, text: '你们是谁?' })
    const failed = await groups.peekRoom(room.roomId)
    const error = [...failed?.messages ?? []].reverse().find(row =>
      row.speaker.kind === 'error' && row.speaker.botId === DSH.id,
    )
    expect(error).toBeDefined()
    const saved = sessionTool.replies.get('session-owned-2') ?? []
    const lastSeq = saved.reduce((max, row) => Math.max(max, row.seq), 0)
    sessionTool.replies.set('session-owned-2', [
      ...saved,
      { seq: lastSeq + 1, role: 'assistant', blocks: [{ type: 'text', text: '(pass)' }] } as SessionToolMessageRow,
    ])
    sessionTool.failSessionIds.delete('session-owned-2')
    const writes = sessionTool.writeCalls.length
    await retryMemberTurn(deps, { roomId: room.roomId, botId: DSH.id, errorSeq: error!.seq })
    const state = await groups.peekRoom(room.roomId)
    const dsh = state?.messages.filter(row => row.speaker.kind === 'member' && row.speaker.botId === DSH.id) ?? []
    expect(dsh.map(row => row.text)).toEqual(['交活了'])
    expect(sessionTool.writeCalls).toHaveLength(writes)
  })

  it('admits retryMember before the member finishes', async () => {
    const { groups, room } = await setupRoom()
    const sessionTool = new StubSessionTool()
    const platform = new StubPlatform()
    sessionTool.setReply('session-owned-1', assistantText('session-owned-1', '我是诗人小北'))
    sessionTool.failSessionIds.add('session-owned-2')
    const deps = engineDeps(sessionTool, platform, groups)
    await runGroupRound(deps, { roomId: room.roomId, text: '你们是谁?' })
    const failed = await groups.peekRoom(room.roomId)
    const error = [...failed?.messages ?? []].reverse().find(row =>
      row.speaker.kind === 'error' && row.speaker.botId === DSH.id,
    )
    expect(error).toBeDefined()
    sessionTool.failSessionIds.delete('session-owned-2')
    let resolve!: (value: void) => void
    const promise = new Promise<void>(done => { resolve = done })
    sessionTool.wait = async (_caller, sessionId) => {
      await promise
      return { sessionId, status: 'idle' as const }
    }
    sessionTool.setReply('session-owned-2', assistantText('session-owned-2', '我是 DSH Bot'))
    const inbox = new GroupInbox(() => engineDeps(sessionTool, platform, groups, deps.tracker))
    const accepted = await inbox.retryMember({ roomId: room.roomId, botId: DSH.id, errorSeq: error!.seq })
    expect(accepted).toEqual({ roomId: room.roomId, botId: DSH.id, accepted: true })
    expect(inbox.working(room.roomId)).toBe(true)
    expect((await groups.peekRoom(room.roomId))?.messages.filter(row => row.speaker.kind === 'user')).toHaveLength(1)
    expect((await groups.peekRoom(room.roomId))?.messages.some(row =>
      row.speaker.kind === 'member' && row.speaker.botId === DSH.id,
    )).toBe(false)
    resolve()
    await inbox.settled(room.roomId)
    const state = await groups.peekRoom(room.roomId)
    expect(state?.messages.filter(row => row.speaker.kind === 'user').map(row => row.text)).toEqual(['你们是谁?'])
    expect(state?.messages.some(row =>
      row.speaker.kind === 'member' && row.speaker.botId === DSH.id && row.text === '我是 DSH Bot',
    )).toBe(true)
  })

  it('rejects a second concurrent retryMember while the first is running', async () => {
    const { groups, room } = await setupRoom()
    const sessionTool = new StubSessionTool()
    const platform = new StubPlatform()
    sessionTool.setReply('session-owned-1', assistantText('session-owned-1', '我是诗人小北'))
    sessionTool.failSessionIds.add('session-owned-2')
    const deps = engineDeps(sessionTool, platform, groups)
    await runGroupRound(deps, { roomId: room.roomId, text: '你们是谁?' })
    const failed = await groups.peekRoom(room.roomId)
    const error = [...failed?.messages ?? []].reverse().find(row =>
      row.speaker.kind === 'error' && row.speaker.botId === DSH.id,
    )
    expect(error).toBeDefined()
    sessionTool.failSessionIds.delete('session-owned-2')
    let resolve!: (value: void) => void
    const promise = new Promise<void>(done => { resolve = done })
    sessionTool.wait = async (_caller, sessionId) => {
      await promise
      return { sessionId, status: 'idle' as const }
    }
    sessionTool.setReply('session-owned-2', assistantText('session-owned-2', '我是 DSH Bot'))
    const inbox = new GroupInbox(() => engineDeps(sessionTool, platform, groups, deps.tracker))
    await inbox.retryMember({ roomId: room.roomId, botId: DSH.id, errorSeq: error!.seq })
    await expect(inbox.retryMember({ roomId: room.roomId, botId: DSH.id, errorSeq: error!.seq })).rejects.toThrow('room is busy')
    resolve()
    await inbox.settled(room.roomId)
  })

  it('rejects a new prompt while a member retry is running', async () => {
    const { groups, room } = await setupRoom()
    const sessionTool = new StubSessionTool()
    const platform = new StubPlatform()
    sessionTool.setReply('session-owned-1', assistantText('session-owned-1', '我是诗人小北'))
    sessionTool.failSessionIds.add('session-owned-2')
    const deps = engineDeps(sessionTool, platform, groups)
    await runGroupRound(deps, { roomId: room.roomId, text: '你们是谁?' })
    const failed = await groups.peekRoom(room.roomId)
    const error = [...failed?.messages ?? []].reverse().find(row =>
      row.speaker.kind === 'error' && row.speaker.botId === DSH.id,
    )
    expect(error).toBeDefined()
    sessionTool.failSessionIds.delete('session-owned-2')
    let resolve!: (value: void) => void
    const promise = new Promise<void>(done => { resolve = done })
    sessionTool.wait = async (_caller, sessionId) => {
      await promise
      return { sessionId, status: 'idle' as const }
    }
    sessionTool.setReply('session-owned-2', assistantText('session-owned-2', '我是 DSH Bot'))
    const inbox = new GroupInbox(() => engineDeps(sessionTool, platform, groups, deps.tracker))
    await inbox.retryMember({ roomId: room.roomId, botId: DSH.id, errorSeq: error!.seq })
    await expect(inbox.submit({ sessionId: room.roomId, text: 'another' })).rejects.toThrow('room is busy')
    expect((await groups.peekRoom(room.roomId))?.messages.filter(row => row.speaker.kind === 'user')).toHaveLength(1)
    resolve()
    await inbox.settled(room.roomId)
  })

  it('reuses the hidden session on a second round', async () => {
    const { groups, room } = await setupRoom()
    const sessionTool = new StubSessionTool()
    const platform = new StubPlatform()
    sessionTool.setReply('session-owned-1', assistantText('session-owned-1', '第一轮小北'))
    sessionTool.setReply('session-owned-2', assistantText('session-owned-2', '第一轮 DSH'))
    const deps = engineDeps(sessionTool, platform, groups)
    await runGroupRound(deps, { roomId: room.roomId, text: '你们是谁?' })
    sessionTool.setReply('session-owned-1', assistantText('session-owned-1', '第二轮小北'))
    sessionTool.setReply('session-owned-2', assistantText('session-owned-2', '第二轮 DSH'))
    await runGroupRound(deps, { roomId: room.roomId, text: '再介绍一次' })
    expect(sessionTool.createCalls).toHaveLength(2)
    const state = await groups.peekRoom(room.roomId)
    const memberTexts = state?.messages.filter(row => row.speaker.kind === 'member').map(row => row.text) ?? []
    expect(memberTexts).toEqual(['第一轮小北', '第一轮 DSH', '第二轮小北', '第二轮 DSH'])
  })

  it('never archives member turn sessions and unarchives a reused one', async () => {
    const { groups, room } = await setupRoom()
    const sessionTool = new StubSessionTool()
    const platform = new StubPlatform()
    const deps = engineDeps(sessionTool, platform, groups)
    await runGroupRound(deps, { roomId: room.roomId, text: '你们是谁?' })
    expect(platform.archiveCalls).toEqual([])
    await runGroupRound(deps, { roomId: room.roomId, text: '再介绍一次' })
    expect(platform.archiveCalls).toEqual([])
    expect(platform.unarchiveCalls).toEqual(expect.arrayContaining(['session-owned-1', 'session-owned-2']))
  })

  it('does not reuse an earlier answer when the next turn produces no text', async () => {
    const { groups, room } = await setupRoom()
    const sessionTool = new StubSessionTool()
    const deps = engineDeps(sessionTool, new StubPlatform(), groups)
    sessionTool.setReply('session-owned-1', assistantText('session-owned-1', '上一轮回答'))
    await runGroupRound(deps, { roomId: room.roomId, text: '@诗人小北 第一问' })
    await runGroupRound(deps, { roomId: room.roomId, text: '@诗人小北 第二问' })
    const state = await groups.peekRoom(room.roomId)
    expect(state?.messages.filter(row => row.speaker.kind === 'member').map(row => row.text)).toEqual(['上一轮回答'])
  })

  it('lets the first speaker answer a peer on a second rotated round', async () => {
    const { groups, room } = await setupRoom()
    const sessionTool = new StubSessionTool()
    sessionTool.setReply('session-owned-1', assistantText('session-owned-1', '小北第一轮'))
    sessionTool.setReply('session-owned-1', assistantText('session-owned-1', '小北接着 DSH 说'))
    sessionTool.setReply('session-owned-2', assistantText('session-owned-2', 'DSH 第一轮'))
    await runGroupRound(engineDeps(sessionTool, new StubPlatform(), groups), { roomId: room.roomId, text: '你们讨论下' })
    const state = await groups.peekRoom(room.roomId)
    const members = state?.messages.filter(row => row.speaker.kind === 'member') ?? []
    expect(members.map(row => row.text)).toEqual(['小北第一轮', 'DSH 第一轮', '小北接着 DSH 说'])
    expect(members.map(row => row.speaker)).toEqual([
      { kind: 'member', botId: POET.id },
      { kind: 'member', botId: DSH.id },
      { kind: 'member', botId: POET.id },
    ])
    expect(sessionTool.writeCalls[2]?.content).toContain('DSH 第一轮')
    expect(sessionTool.createCalls).toHaveLength(2)
  })

  it('keeps discussing past three rounds when the group is unlimited', async () => {
    const home = process.env.DSH_HOME!
    const groups = createGroupsRuntime({
      listBotIds: async () => [DSH.id, POET.id],
      home: () => home,
      now: () => 1_700_000_000_000,
    })
    const group = await groups.createGroup({
      name: '无限室',
      memberIds: [POET.id, DSH.id],
      rounds: 0,
    })
    const room = await groups.createGroupSession({ groupId: group.id })
    const sessionTool = new StubSessionTool()
    for (let index = 1; index <= 5; index += 1) {
      sessionTool.setReply('session-owned-1', assistantText('session-owned-1', `小北第 ${index} 说`))
      sessionTool.setReply('session-owned-2', assistantText('session-owned-2', `DSH 第 ${index} 说`))
    }
    await runGroupRound(engineDeps(sessionTool, new StubPlatform(), groups), { roomId: room.roomId, text: '一直聊' })
    const members = (await groups.peekRoom(room.roomId))?.messages.filter(row => row.speaker.kind === 'member') ?? []
    expect(members.length).toBeGreaterThan(6)
    expect(members.every(row => row.speaker.kind === 'member')).toBe(true)
  })

  it('ends the discussion when the first round has no visible member lines', async () => {
    const { groups, room } = await setupRoom()
    const sessionTool = new StubSessionTool()
    sessionTool.setReply('session-owned-1', assistantText('session-owned-1', '(pass)'))
    sessionTool.setReply('session-owned-2', assistantText('session-owned-2', '(pass)'))
    await runGroupRound(engineDeps(sessionTool, new StubPlatform(), groups), { roomId: room.roomId, text: '你们是谁?' })
    const members = (await groups.peekRoom(room.roomId))?.messages.filter(row => row.speaker.kind === 'member') ?? []
    expect(members).toHaveLength(0)
    expect(sessionTool.writeCalls).toHaveLength(2)
  })
})

it('projects a group routine suggestion as readable text without creating a routine', () => {
  const room = { header: { type: 'header' as const, roomId: 'r', groupId: 'g', createdAt: 1 }, messages: [
    { type: 'message' as const, id: 'a', seq: 1, createdAt: 1, speaker: { kind: 'member' as const, botId: 'b' }, text: '正文\n[propose-routine]{"name":"检查","schedule":"@daily","instruction":"检查一下"}[/propose-routine]' },
  ] }
  const items = projectRoomHistory(room, new Map([['b', { botId: 'b', name: '成员', avatar: { color: '#555' } }]]))
  expect(items[0]?.text).toBe('正文\n\n例程建议：检查（@daily）。可在 成员 的私聊中设置。')
})
