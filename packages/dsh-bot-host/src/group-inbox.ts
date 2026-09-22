import { DshBotError } from './errors.ts'
import {
  executeRetryMemberTurn,
  parseMentions,
  prepareRetryMemberTurn,
  runGroupRound,
  type GroupEngineDeps,
} from './group-engine.ts'
import type { PromptRequest, PromptResult } from './workbench-sessions.ts'

interface GroupJob {
  readonly controller: AbortController
  readonly messageId: string
}

export class GroupInbox {
  private readonly admissions = new Map<string, Promise<void>>()
  private readonly tails = new Map<string, Promise<void>>()
  private readonly jobs = new Map<string, Set<GroupJob>>()
  private readonly retrying = new Set<string>()

  constructor(private readonly dependencies: () => GroupEngineDeps) {}

  working(roomId: string): boolean {
    return (this.jobs.get(roomId)?.size ?? 0) > 0
  }

  async settled(roomId: string): Promise<void> {
    await this.tails.get(roomId)
  }

  cancel(roomId: string): Promise<{ accepted: true }> {
    const id = roomId.trim()
    return this.admit(id, () => this.stop(id))
  }

  private async stop(roomId: string): Promise<{ accepted: true }> {
    const deps = this.dependencies()
    const active = deps.tracker.get(roomId)?.speaking?.sessionId
    if (active !== undefined && deps.platform.cancelSession === undefined) {
      throw new DshBotError('cancel-unavailable', 'sessions.cancel is unavailable')
    }
    const stopped = [...this.jobs.get(roomId) ?? []]
    for (const job of stopped) job.controller.abort()
    if (active !== undefined) {
      const outcome = await deps.platform.cancelSession!(active)
      if ('unavailable' in outcome) throw new DshBotError('cancel-unavailable', outcome.message ?? 'sessions.cancel is unavailable')
    }
    await deps.groups.markRoomCancelled(roomId, stopped.map(job => job.messageId))
    return { accepted: true }
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
    const mention = parseMentions(text, members)
    const existing = input.requestId === undefined ? undefined : room.messages.find(row => row.requestId === input.requestId)
    if (existing !== undefined) {
      if (existing.text !== text || existing.replyTo?.seq !== input.replyToSeq) {
        throw new DshBotError('invalid-input', 'requestId already belongs to another message')
      }
      return { sessionId: roomId, messageId: existing.id, unmatchedMentions: mention.unmatched }
    }
    if (this.retrying.has(roomId)) {
      throw new DshBotError('invalid-input', 'room is busy')
    }
    if (mention.unmatched) {
      throw new DshBotError('invalid-mention', `无法识别或存在重名：${mention.unmatchedHandles.join('、')}`)
    }
    const quote = input.replyToSeq === undefined ? undefined : room.messages.find(row => row.seq === input.replyToSeq)
    if (input.replyToSeq !== undefined && (quote === undefined || quote.speaker.kind === 'error')) {
      throw new DshBotError('invalid-input', 'quoted message does not exist in this room')
    }
    const replyTo = quote === undefined ? undefined : {
      seq: quote.seq,
      text: quote.text,
      speaker: quote.speaker.kind === 'user' ? '你' : members.find(row => row.id === (quote.speaker as { botId: string }).botId)?.name ?? '成员',
    }
    const message = await deps.groups.appendRoomMessage(roomId, { kind: 'user' }, text, {
      ...input.requestId === undefined ? {} : { requestId: input.requestId },
      ...replyTo === undefined ? {} : { replyTo },
    })
    const controller = new AbortController()
    const job = { controller, messageId: message.id }
    const jobs = this.jobs.get(roomId) ?? new Set<GroupJob>()
    jobs.add(job)
    this.jobs.set(roomId, jobs)
    const run = (this.tails.get(roomId) ?? Promise.resolve()).then(async () => {
      if (controller.signal.aborted) return
      try {
        await runGroupRound(deps, { roomId, text, message, signal: controller.signal })
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
    void done.then(() => { if (this.tails.get(roomId) === done) this.tails.delete(roomId) })
    return { sessionId: roomId, messageId: message.id, unmatchedMentions: mention.unmatched }
  }
}
