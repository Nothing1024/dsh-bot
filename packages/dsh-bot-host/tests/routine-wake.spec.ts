import { describe, expect, it } from 'vitest'
import {
  buildWakePrompt,
  isRoutineInjection,
  isSilentReply,
  wakeRoutine,
  wakeWaitFailed,
} from '../src/routine-wake.ts'
import type { RoutineRow, UpdateRoutineInput } from '../src/routines.ts'

const routine: RoutineRow = {
  id: 'r1',
  botId: 'ops',
  name: '报时',
  schedule: '@every 1m',
  instruction: '报告当前时间',
  enabled: true,
  notify: true,
  createdAt: 1,
  runs: [],
}

describe('buildWakePrompt', () => {
  it('is self-written and starts with [routine]', () => {
    const text = buildWakePrompt(routine)
    expect(text.startsWith('[routine] 报时')).toBe(true)
    expect(text).toMatch(/没有人在等你/)
    expect(text).toMatch(/\(silent\)/)
    expect(isRoutineInjection(text)).toBe(true)
  })
})

describe('wakeRoutine', () => {
  it('marks silent without incrementing unread', async () => {
    const unread = new Map<string, number>()
    const result = await wakeRoutine({
      io: {
        ensureSession: async () => 'sess-1',
        writeWaitRead: async () => '(silent)',
      },
      store: { update: async (input: UpdateRoutineInput) => ({
        ...routine,
        name: input.name ?? routine.name,
        schedule: input.schedule ?? routine.schedule,
        instruction: input.instruction ?? routine.instruction,
        enabled: input.enabled ?? routine.enabled,
        notify: input.notify ?? routine.notify,
        runs: [],
      }) },
      unread,
      errors: new Map(),
    }, routine)
    expect(result.outcome).toBe('silent')
    expect(unread.size).toBe(0)
    expect(isSilentReply('(silent)')).toBe(true)
  })

  it('marks spoke and increments unread', async () => {
    const unread = new Map<string, number>()
    const result = await wakeRoutine({
      io: {
        ensureSession: async () => 'sess-1',
        writeWaitRead: async () => '现在是凌晨三点。',
      },
      store: { update: async (input: UpdateRoutineInput) => ({
        ...routine,
        name: input.name ?? routine.name,
        schedule: input.schedule ?? routine.schedule,
        instruction: input.instruction ?? routine.instruction,
        enabled: input.enabled ?? routine.enabled,
        notify: input.notify ?? routine.notify,
        runs: [],
      }) },
      unread,
      errors: new Map(),
    }, routine)
    expect(result.outcome).toBe('spoke')
    expect(unread.get('ops')).toBe(1)
  })

  it('writes a system hint after three errors', async () => {
    const systems: string[] = []
    const errors = new Map<string, number>()
    const ctx = {
      io: {
        ensureSession: async () => 'sess-1',
        writeWaitRead: async () => {
          throw new Error('down')
        },
        writeSystem: async (_id: string, text: string) => { systems.push(text) },
      },
      store: { update: async (input: UpdateRoutineInput) => ({
        ...routine,
        name: input.name ?? routine.name,
        schedule: input.schedule ?? routine.schedule,
        instruction: input.instruction ?? routine.instruction,
        enabled: input.enabled ?? routine.enabled,
        notify: input.notify ?? routine.notify,
        runs: [],
      }) },
      unread: new Map<string, number>(),
      errors,
    }
    expect((await wakeRoutine(ctx, routine)).outcome).toBe('error')
    expect((await wakeRoutine(ctx, routine)).outcome).toBe('error')
    expect((await wakeRoutine(ctx, routine)).outcome).toBe('error')
    expect(systems).toHaveLength(1)
    expect(systems[0]).toMatch(/^\[routine-system\]/)
    expect(isRoutineInjection(systems[0]!)).toBe(false)
  })
})

describe('wakeWaitFailed', () => {
  it('treats completed like askBot: settled, not failed', () => {
    expect(wakeWaitFailed('idle')).toBe(false)
    expect(wakeWaitFailed('completed')).toBe(false)
    expect(wakeWaitFailed('timeout')).toBe(true)
    expect(wakeWaitFailed('failed')).toBe(true)
    expect(wakeWaitFailed('aborted')).toBe(true)
  })
})
