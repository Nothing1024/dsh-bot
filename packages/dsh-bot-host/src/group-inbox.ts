import { DshBotError } from './errors.ts'
import { parseMentions, runGroupRound, type GroupEngineDeps } from './group-engine.ts'
import type { PromptRequest, PromptResult } from './workbench-sessions.ts'

export class GroupInbox {
  private readonly admissions = new Map<string, Promise<void>>()
  private readonly tails = new Map<string, Promise<void>>()
  private readonly jobs = new Map<string, Set<AbortController>>()

  constructor(private readonly dependencies: () => GroupEngineDeps) {}

  working(roomId: string): boolean {
    return (this.jobs.get(roomId)?.size ?? 0) > 0
  }

  async settled(roomId: string): Promise<void> {
    await this.tails.get(roomId)
  }

  async cancel(roomId: string): Promise<{ accepted: true }> {
    await this.admissions.get(roomId)
    const deps = this.dependencies()
    const active = deps.tracker.get(roomId)?.speaking?.sessionId
    if (active !== undefined && deps.platform.cancelSession === undefined) {
      throw new DshBotError('cancel-unavailable', 'sessions.cancel is unavailable')
    }
    for (const controller of this.jobs.get(roomId) ?? []) controller.abort()
    if (active !== undefined) {
      const outcome = await deps.platform.cancelSession!(active)
      if ('unavailable' in outcome) throw new DshBotError('cancel-unavailable', outcome.message ?? 'sessions.cancel is unavailable')
    }
    return { accepted: true }
  }

  submit(input: PromptRequest): Promise<PromptResult> {
    const roomId = input.sessionId.trim()
    const previous = this.admissions.get(roomId) ?? Promise.resolve()
    const result = previous.then(() => this.accept({ ...input, sessionId: roomId }))
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
    const jobs = this.jobs.get(roomId) ?? new Set<AbortController>()
    jobs.add(controller)
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
      jobs.delete(controller)
      if (jobs.size === 0) this.jobs.delete(roomId)
    })
    const done = run.catch(() => undefined)
    this.tails.set(roomId, done)
    void done.then(() => { if (this.tails.get(roomId) === done) this.tails.delete(roomId) })
    return { sessionId: roomId, messageId: message.id, unmatchedMentions: mention.unmatched }
  }
}
