import { randomUUID } from 'node:crypto'
import { resolveResponders } from 'dsh-bot-shared'
import type { GroupQueuedItem } from 'dsh-bot-shared'
import { DshBotError } from './errors.ts'
import {
  executeRetryMemberTurn,
  prepareRetryMemberTurn,
  runGroupRound,
  type GroupEngineDeps,
  type RunGroupRoundRequest,
} from './group-engine.ts'
import type { RoomMessage } from './groups.ts'
import type { PromptRequest, PromptResult } from './workbench-sessions.ts'

/** BR-002: per-room cap on prompts waiting for the running discussion. */
export const GROUP_QUEUE_MAX = 3
const CONTINUE_TEXT = '继续讨论'

interface GroupJob {
  readonly controller: AbortController
  readonly messageId: string
}

interface QueuedPrompt extends GroupQueuedItem {
  readonly requestId?: string
  readonly quotedBotId?: string
}

type PendingPrompt = Omit<QueuedPrompt, 'queueId' | 'createdAt'>

export class GroupInbox {
  private readonly admissions = new Map<string, Promise<void>>()
  private readonly tails = new Map<string, Promise<void>>()
  private readonly jobs = new Map<string, Set<GroupJob>>()
  private readonly retrying = new Set<string>()
  /** Memory only: a gateway restart drops it; nothing here is in the room file (INV-002). */
  private readonly queues = new Map<string, QueuedPrompt[]>()

  constructor(private readonly dependencies: () => GroupEngineDeps) {}

  working(roomId: string): boolean {
    return (this.jobs.get(roomId)?.size ?? 0) > 0
  }

  /** Job, queue, member retry, or tracked round: nothing new may start, nothing may be deleted. */
  busy(roomId: string): boolean {
    return this.working(roomId) || (this.queues.get(roomId)?.length ?? 0) > 0 || this.retrying.has(roomId)
      || this.dependencies().tracker.get(roomId)?.working === true
  }

  queued(roomId: string): GroupQueuedItem[] {
    return (this.queues.get(roomId) ?? []).map(({ queueId, text, replyTo, createdAt }) =>
      ({ queueId, text, ...replyTo === undefined ? {} : { replyTo }, createdAt }))
  }

  /** Resolves once the room has no running job and no pending admission (drain included). */
  async settled(roomId: string): Promise<void> {
    while (this.tails.has(roomId) || this.admissions.has(roomId)) {
      await this.tails.get(roomId)
      await this.admissions.get(roomId)
    }
  }

  cancel(roomId: string): Promise<{ accepted: true; dropped: number }> {
    const id = roomId.trim()
    return this.admit(id, () => this.stop(id))
  }

  private async stop(roomId: string): Promise<{ accepted: true; dropped: number }> {
    const deps = this.dependencies()
    const active = deps.tracker.get(roomId)?.speaking?.sessionId
    if (active !== undefined && deps.platform.cancelSession === undefined) {
      throw new DshBotError('cancel-unavailable', 'sessions.cancel is unavailable')
    }
    // Clear before aborting: the aborted job's drain must find nothing to start.
    const dropped = this.queues.get(roomId)?.length ?? 0
    this.queues.delete(roomId)
    const stopped = [...this.jobs.get(roomId) ?? []]
    for (const job of stopped) job.controller.abort()
    if (active !== undefined) {
      const outcome = await deps.platform.cancelSession!(active)
      if ('unavailable' in outcome) throw new DshBotError('cancel-unavailable', outcome.message ?? 'sessions.cancel is unavailable')
    }
    await deps.groups.markRoomCancelled(roomId, stopped.map(job => job.messageId))
    return { accepted: true, dropped }
  }

  cancelQueued(roomId: string, queueId: string): Promise<{ queueId: string; cancelled: true }> {
    const id = roomId.trim()
    return this.admit(id, async () => {
      const queue = this.queues.get(id) ?? []
      const index = queue.findIndex(row => row.queueId === queueId)
      if (index < 0) throw new DshBotError('not-found', '这条已开始讨论，无法取消')
      queue.splice(index, 1)
      if (queue.length === 0) this.queues.delete(id)
      return { queueId, cancelled: true }
    })
  }

  continueDiscussion(roomId: string): Promise<{ sessionId: string; messageId: string }> {
    const id = roomId.trim()
    return this.admit(id, async () => {
      const deps = this.dependencies()
      const room = await deps.groups.peekRoom(id)
      if (room === undefined) throw new DshBotError('invalid-input', 'group room does not exist')
      if (this.busy(id)) throw new DshBotError('invalid-input', 'room is busy')
      if (!room.messages.some(row => row.speaker.kind === 'member')) {
        throw new DshBotError('invalid-input', '先发一条消息开始讨论')
      }
      const message = await deps.groups.appendRoomMessage(id, { kind: 'system' }, CONTINUE_TEXT)
      this.launch(id, message.id, { roomId: id, text: CONTINUE_TEXT, message, continuation: true })
      return { sessionId: id, messageId: message.id }
    })
  }

  retryMember(input: {
    readonly roomId: string
    readonly botId: string
    readonly errorSeq: number
  }): Promise<{ roomId: string; botId: string; accepted: true }> {
    const roomId = input.roomId.trim()
    const previous = this.admissions.get(roomId) ?? Promise.resolve()
    const result = previous.then(() => this.acceptRetry({ ...input, roomId }))
    const done = result.then(() => undefined, () => undefined)
    this.admissions.set(roomId, done)
    void done.then(() => { if (this.admissions.get(roomId) === done) this.admissions.delete(roomId) })
    return result
  }

  private async acceptRetry(input: {
    readonly roomId: string
    readonly botId: string
    readonly errorSeq: number
  }): Promise<{ roomId: string; botId: string; accepted: true }> {
    const deps = this.dependencies()
    const roomId = input.roomId
    if (roomId === '') throw new DshBotError('invalid-input', 'roomId is required')
    if (this.working(roomId) || this.retrying.has(roomId) || deps.tracker.get(roomId)?.working === true) {
      throw new DshBotError('invalid-input', 'room is busy')
    }
    const prepared = await prepareRetryMemberTurn(deps, input)
    const controller = new AbortController()
    const job = { controller, messageId: '' }
    const jobs = this.jobs.get(roomId) ?? new Set<GroupJob>()
    jobs.add(job)
    this.jobs.set(roomId, jobs)
    this.retrying.add(roomId)
    const run = (this.tails.get(roomId) ?? Promise.resolve()).then(async () => {
      if (controller.signal.aborted) return
      try {
        await executeRetryMemberTurn(deps, prepared, controller.signal)
      } catch (error) {
        if (!controller.signal.aborted) {
          await deps.groups.appendRoomMessage(roomId, { kind: 'error', botId: input.botId, code: 'group-failed' },
            error instanceof Error ? error.message : '小组执行失败')
        }
      }
    }).finally(() => {
      jobs.delete(job)
      if (jobs.size === 0) this.jobs.delete(roomId)
      this.retrying.delete(roomId)
    })
    const done = run.catch(() => undefined)
    this.tails.set(roomId, done)
    void done.then(() => { if (this.tails.get(roomId) === done) this.tails.delete(roomId) })
    return { roomId, botId: prepared.botId, accepted: true }
  }


  submit(input: PromptRequest): Promise<PromptResult> {
    const roomId = input.sessionId.trim()
    return this.admit(roomId, () => this.accept({ ...input, sessionId: roomId }))
  }

  private admit<T>(roomId: string, action: () => Promise<T>): Promise<T> {
    const previous = this.admissions.get(roomId) ?? Promise.resolve()
    const result = previous.then(action)
    const done = result.then(() => undefined, () => undefined)
    this.admissions.set(roomId, done)
    void done.then(() => { if (this.admissions.get(roomId) === done) this.admissions.delete(roomId) })
    return result
  }

  private async accept(input: PromptRequest): Promise<PromptResult> {
    const deps = this.dependencies()
    const roomId = input.sessionId
    const text = input.text.trim()
    if (text === '') throw new DshBotError('empty-prompt', 'prompt requires a non-empty text')
    const room = await deps.groups.peekRoom(roomId)
    if (room === undefined) throw new DshBotError('invalid-input', 'group room does not exist')
    const group = await deps.groups.getGroup(room.header.groupId)
    const members = await Promise.all(group.memberIds.map(id => deps.bots.getBot(id)))
    const mention = resolveResponders(text, members)
    const sameRequest = (row: { text: string; replyTo?: { seq: number } }): boolean => {
      if (row.text === text && row.replyTo?.seq === input.replyToSeq) return true
      throw new DshBotError('invalid-input', 'requestId already belongs to another message')
    }
    const existing = input.requestId === undefined ? undefined : room.messages.find(row => row.requestId === input.requestId)
    if (existing !== undefined && sameRequest(existing)) {
      return { sessionId: roomId, messageId: existing.id, unmatchedMentions: mention.unmatched }
    }
    const queue = this.queues.get(roomId) ?? []
    const waiting = input.requestId === undefined ? undefined : queue.find(row => row.requestId === input.requestId)
    if (waiting !== undefined && sameRequest(waiting)) return { sessionId: roomId, queued: true, queueId: waiting.queueId }
    // BR-005: a member retry still refuses new prompts outright; they are not queued.
    if (this.retrying.has(roomId)) throw new DshBotError('invalid-input', 'room is busy')
    if (mention.unmatched) {
      throw new DshBotError('invalid-mention', `无法识别或存在重名：${mention.unmatchedHandles.join('、')}`)
    }
    const quote = input.replyToSeq === undefined ? undefined : room.messages.find(row => row.seq === input.replyToSeq)
    if (input.replyToSeq !== undefined && (quote === undefined || quote.speaker.kind === 'error' || quote.speaker.kind === 'system')) {
      throw new DshBotError('invalid-input', '引用的消息不存在')
    }
    const quotedBotId = quote?.speaker.kind === 'member' ? quote.speaker.botId : undefined
    const replyTo = quote === undefined ? undefined : {
      seq: quote.seq,
      text: quote.text,
      speaker: quotedBotId === undefined ? '你' : members.find(row => row.id === quotedBotId)?.name ?? '成员',
    }
    const pending: PendingPrompt = {
      text,
      ...input.requestId === undefined ? {} : { requestId: input.requestId },
      ...replyTo === undefined ? {} : { replyTo },
      ...quotedBotId === undefined ? {} : { quotedBotId },
    }
    if (this.working(roomId) || queue.length > 0) {
      if (queue.length >= GROUP_QUEUE_MAX) throw new DshBotError('queue-full', `room queue is full (max ${GROUP_QUEUE_MAX})`)
      const item: QueuedPrompt = { ...pending, queueId: `q-${randomUUID()}`, createdAt: Date.now() }
      this.queues.set(roomId, [...queue, item])
      return { sessionId: roomId, queued: true, queueId: item.queueId }
    }
    const message = await this.start(roomId, pending)
    return { sessionId: roomId, messageId: message.id, unmatchedMentions: mention.unmatched }
  }

  /** Persist the user line only now (INV-002), then run its discussion. */
  private async start(roomId: string, pending: PendingPrompt): Promise<RoomMessage> {
    const message = await this.dependencies().groups.appendRoomMessage(roomId, { kind: 'user' }, pending.text, {
      ...pending.requestId === undefined ? {} : { requestId: pending.requestId },
      ...pending.replyTo === undefined ? {} : { replyTo: pending.replyTo },
    })
    this.launch(roomId, message.id, {
      roomId,
      text: pending.text,
      message,
      ...pending.quotedBotId === undefined ? {} : { quotedBotId: pending.quotedBotId },
    })
    return message
  }

  private launch(roomId: string, messageId: string, request: Omit<RunGroupRoundRequest, 'signal'>): void {
    const deps = this.dependencies()
    const controller = new AbortController()
    const job = { controller, messageId }
    const jobs = this.jobs.get(roomId) ?? new Set<GroupJob>()
    jobs.add(job)
    this.jobs.set(roomId, jobs)
    const run = (this.tails.get(roomId) ?? Promise.resolve()).then(async () => {
      if (controller.signal.aborted) return
      try {
        await runGroupRound(deps, { ...request, signal: controller.signal })
      } catch (error) {
        if (!controller.signal.aborted) {
          await deps.groups.appendRoomMessage(roomId, { kind: 'error', botId: '', code: 'group-failed' },
            error instanceof Error ? error.message : '小组执行失败')
        }
      }
    }).finally(() => {
      jobs.delete(job)
      if (jobs.size === 0) this.jobs.delete(roomId)
    })
    const done = run.catch(() => undefined)
    this.tails.set(roomId, done)
    void done.then(() => {
      if (this.tails.get(roomId) === done) this.tails.delete(roomId)
      // Registered synchronously so `settled` never sees a gap between job end and dequeue.
      void this.admit(roomId, () => this.drain(roomId)).catch(() => undefined)
    })
  }

  private async drain(roomId: string): Promise<void> {
    while (!this.working(roomId) && !this.retrying.has(roomId)) {
      const queue = this.queues.get(roomId)
      const next = queue?.shift()
      if (queue !== undefined && queue.length === 0) this.queues.delete(roomId)
      if (next === undefined) return
      try {
        await this.start(roomId, next)
        return
      } catch (error) {
        // One bad item must not strand the rest of the queue.
        await this.dependencies().groups.appendRoomMessage(roomId, { kind: 'error', botId: '', code: 'group-failed' },
          error instanceof Error ? error.message : '小组执行失败').catch(() => undefined)
      }
    }
  }
}
