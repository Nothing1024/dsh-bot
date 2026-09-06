/**
 * One setTimeout per enabled routine (BR-902).
 * @module dsh-bot-host/routine-scheduler
 */
import { nextRun } from './routines.ts'
import type { RoutineRow, RoutineStore, RoutineOutcome } from './routines.ts'

export interface SchedulerWakeResult {
  readonly outcome: RoutineOutcome
  readonly ms: number
}

export interface RoutineScheduler {
  arm(id: string): Promise<void>
  disarm(id: string): void
  disarmAll(): void
  rearmAll(): Promise<void>
  runNow(id: string): Promise<SchedulerWakeResult>
}

export interface CreateSchedulerOptions {
  readonly store: RoutineStore
  readonly wake: (routine: RoutineRow) => Promise<SchedulerWakeResult>
  readonly now?: () => number
  readonly setTimeout?: typeof setTimeout
  readonly clearTimeout?: typeof clearTimeout
  readonly enabled?: () => boolean
}

export function createScheduler(options: CreateSchedulerOptions): RoutineScheduler {
  const nowOf = options.now ?? Date.now
  const setTimeoutOf = options.setTimeout ?? setTimeout
  const clearTimeoutOf = options.clearTimeout ?? clearTimeout
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const running = new Set<string>()

  const live = (): boolean => options.enabled?.() !== false

  const disarm = (id: string): void => {
    const handle = timers.get(id)
    if (handle !== undefined) clearTimeoutOf(handle)
    timers.delete(id)
  }

  const fire = async (id: string): Promise<void> => {
    if (!live() || running.has(id)) {
      if (live()) await arm(id)
      return
    }
    running.add(id)
    try {
      const routine = await options.store.get(id)
      if (!routine.enabled || !live()) return
      const started = nowOf()
      const result = await options.wake(routine)
      await options.store.recordRun(id, {
        ts: started,
        outcome: result.outcome,
        ms: result.ms,
      })
    } finally {
      running.delete(id)
      if (live()) await arm(id)
    }
  }

  const arm = async (id: string): Promise<void> => {
    disarm(id)
    if (!live()) return
    let routine: RoutineRow
    try {
      routine = await options.store.get(id)
    } catch {
      return
    }
    if (!routine.enabled) return
    const due = nextRun(routine.schedule, nowOf())
    const wait = Math.max(0, due - nowOf())
    const handle = setTimeoutOf(() => fire(id), wait)
    timers.set(id, handle)
  }

  return {
    arm,
    disarm,
    disarmAll() {
      for (const id of [...timers.keys()]) disarm(id)
    },
    async rearmAll() {
      for (const id of [...timers.keys()]) disarm(id)
      if (!live()) return
      const rows = await options.store.list()
      for (const row of rows) {
        if (row.enabled) await arm(row.id)
      }
    },
    async runNow(id) {
      const routine = await options.store.get(id)
      if (running.has(id)) {
        return { outcome: 'error', ms: 0 }
      }
      running.add(id)
      const started = nowOf()
      try {
        const result = await options.wake(routine)
        await options.store.recordRun(id, {
          ts: started,
          outcome: result.outcome,
          ms: result.ms,
        })
        return result
      } finally {
        running.delete(id)
        if (live() && routine.enabled) await arm(id)
      }
    },
  }
}
