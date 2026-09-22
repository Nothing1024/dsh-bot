/**
 * Routine scheduler: arm, disable, reentry, rearmAll (BR-902).
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createScheduler } from '../src/routine-scheduler.ts'
import { createRoutineStore } from '../src/routines.ts'
import type { RoutineRow } from '../src/routines.ts'

const homes: string[] = []

afterEach(() => {
  while (homes.length > 0) {
    const home = homes.pop()
    if (home !== undefined) rmSync(home, { recursive: true, force: true })
  }
})

function clock() {
  let now = 1_700_000_000_000
  const timers = new Map<symbol, { due: number; fn: () => void }>()
  return {
    now: () => now,
    setTimeout(fn: () => void, ms: number) {
      const id = Symbol('t')
      timers.set(id, { due: now + ms, fn })
      return id as unknown as ReturnType<typeof setTimeout>
    },
    clearTimeout(id: ReturnType<typeof setTimeout>) {
      timers.delete(id as unknown as symbol)
    },
    async flush(ms: number) {
      now += ms
      const due = [...timers.entries()].filter(([, row]) => row.due <= now)
      const jobs: Array<unknown> = []
      for (const [id, row] of due) {
        timers.delete(id)
        jobs.push(row.fn())
      }
      await Promise.all(jobs)
    },
    pending() {
      return timers.size
    },
    nextDelay() {
      return Math.min(...[...timers.values()].map(row => row.due - now))
    },
  }
}

async function setup(enabled = true) {
  const home = mkdtempSync(join(tmpdir(), 'dsh-bot-sch-'))
  homes.push(home)
  const time = clock()
  const store = createRoutineStore(home, { now: time.now })
  const wakes: string[] = []
  let wakeMs = 5
  let hold: Promise<void> | undefined
  let started!: () => void
  const startedAt = new Promise<void>(resolve => { started = resolve })
  const scheduler = createScheduler({
    store,
    now: time.now,
    setTimeout: time.setTimeout as unknown as typeof setTimeout,
    clearTimeout: time.clearTimeout as unknown as typeof clearTimeout,
    enabled: () => enabled,
    wake: async (routine: RoutineRow) => {
      wakes.push(routine.id)
      started()
      if (hold !== undefined) await hold
      return { outcome: 'spoke', ms: wakeMs }
    },
  })
  const row = await store.create({
    botId: 'ops',
    name: '报时',
    schedule: '@every 1m',
    instruction: 'tick',
  })
  return { store, scheduler, time, wakes, row, startedAt, setHold(p: Promise<void> | undefined) { hold = p } }
}

describe('createScheduler', () => {
  it('waits in safe chunks for long intervals without moving the deadline or firing early', async () => {
    const { scheduler, store, time, wakes, row } = await setup()
    await store.update({ id: row.id, schedule: '@every 1000h' })
    const deadline = time.now() + 3_600_000_000
    await scheduler.arm(row.id)
    expect(time.nextDelay()).toBeLessThanOrEqual(2_147_483_647)
    await time.flush(2_147_483_647)
    expect(wakes).toEqual([])
    expect(scheduler.nextRunAt(row.id)).toBe(deadline)
    await time.flush(deadline - time.now())
    expect(wakes).toEqual([row.id])
    scheduler.disarm(row.id)
    expect(time.pending()).toBe(0)
  })
  it('fires once when due and rearms', async () => {
    const { scheduler, time, wakes, row } = await setup()
    await scheduler.arm(row.id)
    expect(scheduler.nextRunAt(row.id)).toBe(time.now() + 60_000)
    expect(wakes).toEqual([])
    await time.flush(60_000)
    expect(wakes).toEqual([row.id])
    await time.flush(60_000)
    expect(wakes).toEqual([row.id, row.id])
  })

  it('does not fire after disable', async () => {
    const { scheduler, store, time, wakes, row } = await setup()
    await scheduler.arm(row.id)
    await store.update({ id: row.id, enabled: false })
    scheduler.disarm(row.id)
    expect(scheduler.nextRunAt(row.id)).toBeUndefined()
    await time.flush(180_000)
    expect(wakes).toEqual([])
  })

  it('refuses reentry while a wake is running', async () => {
    const { scheduler, wakes, row, setHold, startedAt } = await setup()
    let release!: () => void
    setHold(new Promise<void>(resolve => { release = resolve }))
    const first = scheduler.runNow(row.id)
    await startedAt
    expect(wakes).toEqual([row.id])
    const again = await scheduler.runNow(row.id)
    expect(again.outcome).toBe('error')
    release()
    expect((await first).outcome).toBe('spoke')
    expect(wakes).toEqual([row.id])
  })

  it('rearmAll is idempotent', async () => {
    const { scheduler, time, wakes, row } = await setup()
    await scheduler.rearmAll()
    await scheduler.rearmAll()
    await time.flush(60_000)
    expect(wakes).toEqual([row.id])
    expect(time.pending()).toBe(1)
  })
})
