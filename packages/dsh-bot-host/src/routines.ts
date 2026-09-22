/**
 * Routine registry at `$DSH_HOME/dsh-bot/routines.json` (BR-901).
 * @module dsh-bot-host/routines
 */
import { existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { DshBotError } from './errors.ts'

export type RoutineOutcome = 'spoke' | 'silent' | 'error'

export interface RoutineRun {
  readonly ts: number
  readonly outcome: RoutineOutcome
  readonly ms: number
}

export interface RoutineRow {
  readonly id: string
  readonly botId: string
  readonly name: string
  readonly schedule: string
  readonly instruction: string
  readonly enabled: boolean
  readonly notify: boolean
  readonly sessionId?: string
  readonly createdAt: number
  readonly lastRunAt?: number
  readonly lastOutcome?: RoutineOutcome
  readonly runs: readonly RoutineRun[]
}

export type ParsedSchedule =
  | { readonly kind: 'every'; readonly ms: number; readonly tz?: string }
  | { readonly kind: 'cron'; readonly fields: CronFields; readonly tz?: string }

export interface CronFields {
  readonly minute: readonly number[]
  readonly hour: readonly number[]
  readonly day: readonly number[]
  readonly month: readonly number[]
  readonly dow: readonly number[]
}

export interface CreateRoutineInput {
  readonly botId: string
  readonly name: string
  readonly schedule: string
  readonly instruction: string
  readonly notify?: boolean
}

export interface UpdateRoutineInput {
  readonly id: string
  readonly name?: string
  readonly schedule?: string
  readonly instruction?: string
  readonly enabled?: boolean
  readonly notify?: boolean
  readonly sessionId?: string | null
}

export interface RoutineStore {
  list(botId?: string): Promise<readonly RoutineRow[]>
  get(id: string): Promise<RoutineRow>
  create(input: CreateRoutineInput): Promise<RoutineRow>
  update(input: UpdateRoutineInput): Promise<RoutineRow>
  remove(id: string): Promise<{ readonly id: string; readonly deleted: true }>
  recordRun(id: string, run: RoutineRun): Promise<RoutineRow>
}

const FILE = 'routines.json'
const RUNS_MAX = 20
const NAME_MAX = 64
const EVERY_RE = /^@every\s+(\d+)\s*([mh])$/u
const CRON_TZ_RE = /^CRON_TZ=(\S+)\s+(.+)$/u
const fileGates = new Map<string, Promise<void>>()

export function parseSchedule(text: string): ParsedSchedule {
  const trimmed = text.trim()
  if (trimmed === '') throw new DshBotError('invalid-input', 'schedule is required')
  const tzMatch = CRON_TZ_RE.exec(trimmed)
  const tz = tzMatch?.[1]
  const body = tzMatch?.[2] ?? trimmed
  if (tz !== undefined) assertTimeZone(tz)

  if (body === '@hourly') {
    return { kind: 'cron', fields: parseCronFields('0 * * * *'), ...tz === undefined ? {} : { tz } }
  }
  if (body === '@daily') {
    return { kind: 'cron', fields: parseCronFields('0 0 * * *'), ...tz === undefined ? {} : { tz } }
  }
  const every = EVERY_RE.exec(body)
  if (every !== null) {
    const n = Number(every[1])
    if (!Number.isInteger(n) || n <= 0) {
      throw new DshBotError('invalid-input', `invalid interval ${JSON.stringify(body)}`)
    }
    const ms = every[2] === 'h' ? n * 3_600_000 : n * 60_000
    return { kind: 'every', ms, ...tz === undefined ? {} : { tz } }
  }
  return { kind: 'cron', fields: parseCronFields(body), ...tz === undefined ? {} : { tz } }
}

export function nextRun(schedule: string, now: number): number {
  const parsed = parseSchedule(schedule)
  if (parsed.kind === 'every') return now + parsed.ms
  const tz = parsed.tz ?? 'UTC'
  const formatter = tz === 'UTC' ? undefined : wallClockFormatter(tz)
  const start = Math.floor(now / 60_000) * 60_000 + 60_000
  const limit = start + 366 * 24 * 60 * 60 * 1000
  for (let ts = start; ts <= limit; ts += 60_000) {
    if (cronMatches(parsed.fields, ts, formatter)) return ts
  }
  throw new DshBotError('invalid-input', `schedule ${JSON.stringify(schedule)} never matches`)
}

export function previewSchedule(schedule: string, now = Date.now()) {
  const parsed = parseSchedule(schedule)
  return { schedule: schedule.trim(), timeZone: parsed.tz ?? 'UTC', nextRunAt: nextRun(schedule, now) }
}

export function createRoutineStore(
  home: string | (() => string),
  options: { now?: () => number; random?: () => string } = {},
): RoutineStore {
  const homeOf = typeof home === 'function' ? home : () => home
  const nowOf = options.now ?? Date.now
  const randomOf = options.random ?? (() => Math.random().toString(36).slice(2, 10))

  const pathOf = (): string => join(homeOf(), 'dsh-bot', FILE)

  const load = async (): Promise<RoutineRow[]> => {
    const file = pathOf()
    if (!existsSync(file)) return []
    try {
      const raw = await readFile(file, 'utf8')
      if (raw.trim() === '') return []
      return parseFile(JSON.parse(raw) as unknown)
    } catch {
      const bak = `${file}.bak`
      try {
        await rename(file, bak)
      } catch {
        // keep going from empty
      }
      return []
    }
  }

  const save = async (rows: readonly RoutineRow[]): Promise<void> => {
    const file = pathOf()
    await mkdir(dirname(file), { recursive: true })
    const tmp = `${file}.${randomUUID()}.tmp`
    await writeFile(tmp, `${JSON.stringify(rows, null, 2)}\n`, 'utf8')
    await rename(tmp, file)
  }

  const withLock = async <T>(fn: (rows: RoutineRow[]) => Promise<T> | T): Promise<T> => {
    const file = pathOf()
    const previous = fileGates.get(file) ?? Promise.resolve()
    const result = previous.then(async () => fn(await load()))
    const settled = result.then(() => undefined, () => undefined)
    fileGates.set(file, settled)
    void settled.then(() => {
      if (fileGates.get(file) === settled) fileGates.delete(file)
    })
    return result
  }

  return {
    list(botId) {
      return withLock(rows => {
        const id = botId?.trim()
        if (id === undefined || id === '') return rows
        return rows.filter(row => row.botId === id)
      })
    },
    get(id) {
      return withLock(rows => {
        const row = rows.find(item => item.id === id.trim())
        if (row === undefined) throw new DshBotError('not-found', `routine ${JSON.stringify(id)} not found`)
        return row
      })
    },
    async create(input) {
      return await withLock(async rows => {
        const botId = input.botId.trim()
        const name = input.name.trim()
        const instruction = input.instruction.trim()
        if (botId === '') throw new DshBotError('invalid-input', 'botId is required')
        if (name === '') throw new DshBotError('invalid-input', 'name is required')
        if (name.length > NAME_MAX) throw new DshBotError('invalid-input', 'name is too long')
        if (instruction === '') throw new DshBotError('invalid-input', 'instruction is required')
        parseSchedule(input.schedule)
        const now = nowOf()
        const dup = rows.find(row => (
          row.botId === botId
          && row.name === name
          && row.schedule.trim() === input.schedule.trim()
          && now - row.createdAt < 60_000
        ))
        if (dup !== undefined) return dup
        const row: RoutineRow = {
          id: `r-${now}-${randomOf()}`,
          botId,
          name,
          schedule: input.schedule.trim(),
          instruction,
          enabled: true,
          notify: input.notify !== false,
          createdAt: now,
          runs: [],
        }
        await save([...rows, row])
        return row
      })
    },
    async update(input) {
      return await withLock(async rows => {
        const index = rows.findIndex(row => row.id === input.id.trim())
        if (index < 0) throw new DshBotError('not-found', `routine ${JSON.stringify(input.id)} not found`)
        const current = rows[index]!
        const schedule = input.schedule === undefined ? current.schedule : input.schedule.trim()
        if (input.schedule !== undefined) parseSchedule(schedule)
        const name = input.name === undefined ? current.name : input.name.trim()
        if (name === '') throw new DshBotError('invalid-input', 'name is required')
        const instruction = input.instruction === undefined ? current.instruction : input.instruction.trim()
        if (instruction === '') throw new DshBotError('invalid-input', 'instruction is required')
        const cleared = input.sessionId === null
          || (typeof input.sessionId === 'string' && input.sessionId.trim() === '')
        const sessionId = input.sessionId === undefined
          ? current.sessionId
          : cleared
            ? undefined
            : input.sessionId.trim()
        const next: RoutineRow = {
          id: current.id,
          botId: current.botId,
          name,
          schedule,
          instruction,
          enabled: input.enabled ?? current.enabled,
          notify: input.notify ?? current.notify,
          createdAt: current.createdAt,
          runs: current.runs,
          ...current.lastRunAt === undefined ? {} : { lastRunAt: current.lastRunAt },
          ...current.lastOutcome === undefined ? {} : { lastOutcome: current.lastOutcome },
          ...sessionId === undefined ? {} : { sessionId },
        }
        const copy = [...rows]
        copy[index] = next
        await save(copy)
        return next
      })
    },
    async remove(id) {
      return await withLock(async rows => {
        const token = id.trim()
        if (!rows.some(row => row.id === token)) {
          throw new DshBotError('not-found', `routine ${JSON.stringify(id)} not found`)
        }
        await save(rows.filter(row => row.id !== token))
        return { id: token, deleted: true as const }
      })
    },
    async recordRun(id, run) {
      return await withLock(async rows => {
        const index = rows.findIndex(row => row.id === id.trim())
        if (index < 0) throw new DshBotError('not-found', `routine ${JSON.stringify(id)} not found`)
        const current = rows[index]!
        const runs = [...current.runs, run].slice(-RUNS_MAX)
        const next: RoutineRow = {
          ...current,
          lastRunAt: run.ts,
          lastOutcome: run.outcome,
          runs,
        }
        const copy = [...rows]
        copy[index] = next
        await save(copy)
        return next
      })
    },
  }
}

function parseFile(value: unknown): RoutineRow[] {
  if (!Array.isArray(value)) throw new Error('routines.json must be an array')
  return value.map((item, index) => parseRow(item, index))
}

function parseRow(value: unknown, index: number): RoutineRow {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`routines[${index}] is not an object`)
  }
  const rec = value as Record<string, unknown>
  const id = typeof rec.id === 'string' ? rec.id : ''
  const botId = typeof rec.botId === 'string' ? rec.botId : ''
  const name = typeof rec.name === 'string' ? rec.name : ''
  const schedule = typeof rec.schedule === 'string' ? rec.schedule : ''
  const instruction = typeof rec.instruction === 'string' ? rec.instruction : ''
  const createdAt = typeof rec.createdAt === 'number' && Number.isFinite(rec.createdAt) ? rec.createdAt : Number.NaN
  if (id === '' || botId === '' || name === '' || schedule === '' || instruction === '' || Number.isNaN(createdAt)) {
    throw new Error(`routines[${index}] is missing required fields`)
  }
  parseSchedule(schedule)
  const runs = Array.isArray(rec.runs) ? rec.runs.map(parseRun).filter((row): row is RoutineRun => row !== undefined) : []
  const lastOutcome = rec.lastOutcome === 'spoke' || rec.lastOutcome === 'silent' || rec.lastOutcome === 'error'
    ? rec.lastOutcome
    : undefined
  return {
    id,
    botId,
    name,
    schedule,
    instruction,
    enabled: rec.enabled !== false,
    notify: rec.notify !== false,
    createdAt,
    runs: runs.slice(-RUNS_MAX),
    ...typeof rec.sessionId === 'string' && rec.sessionId.trim() !== '' ? { sessionId: rec.sessionId.trim() } : {},
    ...typeof rec.lastRunAt === 'number' && Number.isFinite(rec.lastRunAt) ? { lastRunAt: rec.lastRunAt } : {},
    ...lastOutcome === undefined ? {} : { lastOutcome },
  }
}

function parseRun(value: unknown): RoutineRun | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const rec = value as Record<string, unknown>
  if (rec.outcome !== 'spoke' && rec.outcome !== 'silent' && rec.outcome !== 'error') return undefined
  if (typeof rec.ts !== 'number' || typeof rec.ms !== 'number') return undefined
  return { ts: rec.ts, outcome: rec.outcome, ms: rec.ms }
}

function parseCronFields(text: string): CronFields {
  const parts = text.trim().split(/\s+/u)
  if (parts.length !== 5) throw new DshBotError('invalid-input', `cron must have 5 fields: ${JSON.stringify(text)}`)
  return {
    minute: parseField(parts[0]!, 0, 59),
    hour: parseField(parts[1]!, 0, 23),
    day: parseField(parts[2]!, 1, 31),
    month: parseField(parts[3]!, 1, 12),
    dow: parseField(parts[4]!, 0, 7).map(value => value === 7 ? 0 : value),
  }
}

function parseField(raw: string, min: number, max: number): number[] {
  const out = new Set<number>()
  for (const part of raw.split(',')) {
    const token = part.trim()
    if (token === '') throw new DshBotError('invalid-input', `empty cron field in ${JSON.stringify(raw)}`)
    const stepMatch = /^(\*|\d+(?:-\d+)?)\/(\d+)$/u.exec(token)
    const rangeMatch = /^(\d+)-(\d+)$/u.exec(token)
    if (token === '*') {
      for (let n = min; n <= max; n += 1) out.add(n)
      continue
    }
    if (stepMatch !== null) {
      const step = Number(stepMatch[2])
      if (!Number.isInteger(step) || step <= 0) {
        throw new DshBotError('invalid-input', `invalid cron step ${JSON.stringify(token)}`)
      }
      const [lo, hi] = stepMatch[1] === '*'
        ? [min, max]
        : rangeBounds(stepMatch[1]!, min, max)
      for (let n = lo; n <= hi; n += step) out.add(n)
      continue
    }
    if (rangeMatch !== null) {
      const [lo, hi] = rangeBounds(token, min, max)
      for (let n = lo; n <= hi; n += 1) out.add(n)
      continue
    }
    if (!/^\d+$/u.test(token)) {
      throw new DshBotError('invalid-input', `invalid cron field ${JSON.stringify(token)}`)
    }
    const n = Number(token)
    if (n < min || n > max) {
      throw new DshBotError('invalid-input', `cron value ${n} out of range ${min}-${max}`)
    }
    out.add(n)
  }
  return [...out].sort((a, b) => a - b)
}

function rangeBounds(token: string, min: number, max: number): [number, number] {
  const [a, b] = token.split('-').map(Number)
  if (!Number.isInteger(a) || !Number.isInteger(b) || a! < min || b! > max || a! > b!) {
    throw new DshBotError('invalid-input', `invalid cron range ${JSON.stringify(token)}`)
  }
  return [a!, b!]
}

function cronMatches(fields: CronFields, ts: number, formatter?: Intl.DateTimeFormat): boolean {
  const parts = wallClock(ts, formatter)
  return fields.minute.includes(parts.minute)
    && fields.hour.includes(parts.hour)
    && fields.month.includes(parts.month)
    && fields.day.includes(parts.day)
    && fields.dow.includes(parts.dow)
}

function wallClockFormatter(tz: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
  })
}

function wallClock(ts: number, formatter?: Intl.DateTimeFormat): {
  minute: number
  hour: number
  day: number
  month: number
  dow: number
} {
  const date = new Date(ts)
  if (formatter === undefined) return {
    minute: date.getUTCMinutes(), hour: date.getUTCHours(), day: date.getUTCDate(),
    month: date.getUTCMonth() + 1, dow: date.getUTCDay(),
  }
  const bag: Record<string, string> = {}
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') bag[part.type] = part.value
  }
  const dowMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  }
  return {
    minute: Number(bag.minute),
    hour: Number(bag.hour),
    day: Number(bag.day),
    month: Number(bag.month),
    dow: dowMap[bag.weekday ?? 'Sun'] ?? 0,
  }
}

function assertTimeZone(tz: string): void {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz }).format()
  } catch {
    throw new DshBotError('invalid-input', `unknown time zone ${JSON.stringify(tz)}`)
  }
}
