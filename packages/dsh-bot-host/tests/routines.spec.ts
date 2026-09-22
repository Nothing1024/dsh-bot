/**
 * Routine store + schedule parser (BR-901).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseProposeRoutine, renderBehaviorSection } from '../src/routine-behavior.ts'
import { createRoutineStore, nextRun, parseSchedule, previewSchedule } from '../src/routines.ts'

const homes: string[] = []

afterEach(() => {
  while (homes.length > 0) {
    const home = homes.pop()
    if (home !== undefined) rmSync(home, { recursive: true, force: true })
  }
})

function store(now = 1_700_000_000_000) {
  const home = mkdtempSync(join(tmpdir(), 'dsh-bot-rt-'))
  homes.push(home)
  let tick = now
  let n = 0
  return {
    home,
    api: createRoutineStore(home, {
      now: () => tick,
      random: () => {
        n += 1
        return `r${n}`
      },
    }),
    advance(ms: number) {
      tick += ms
    },
  }
}

describe('parseSchedule', () => {
  it('parses @every and aliases', () => {
    expect(parseSchedule('@every 1m')).toEqual({ kind: 'every', ms: 60_000 })
    expect(parseSchedule('@every 2h')).toEqual({ kind: 'every', ms: 7_200_000 })
    expect(parseSchedule('@hourly').kind).toBe('cron')
    expect(parseSchedule('@daily').kind).toBe('cron')
  })

  it('rejects empty and out-of-range fields', () => {
    expect(() => parseSchedule('@every 0m')).toThrow(/interval|invalid/i)
    expect(() => parseSchedule('61 * * * *')).toThrow(/out of range/)
    expect(() => parseSchedule('* * * *')).toThrow(/5 fields/)
  })

  it('accepts CRON_TZ prefix', () => {
    const parsed = parseSchedule('CRON_TZ=Asia/Shanghai 0 9 * * *')
    expect(parsed.kind).toBe('cron')
    expect(parsed.tz).toBe('Asia/Shanghai')
  })
})

describe('nextRun', () => {
  it('handles sparse UTC schedules without rebuilding a formatter every minute', () => {
    const now = Date.parse('2026-01-02T00:00:00Z')
    expect(nextRun('0 0 1 1 *', now)).toBe(Date.parse('2027-01-01T00:00:00Z'))
    expect(() => nextRun('0 0 31 2 *', now)).toThrow(/never matches/)
  }, 2000)
  it('previews legacy UTC and explicit local time without changing old schedules', () => {
    const now = Date.parse('2026-09-19T10:00:00+08:00')
    expect(previewSchedule('@daily', now)).toEqual({
      schedule: '@daily', timeZone: 'UTC', nextRunAt: Date.parse('2026-09-20T00:00:00Z'),
    })
    expect(previewSchedule('CRON_TZ=Asia/Shanghai 0 9 * * *', now).nextRunAt)
      .toBe(Date.parse('2026-09-20T09:00:00+08:00'))
  })
  it('adds interval for @every', () => {
    expect(nextRun('@every 1m', 1_000)).toBe(61_000)
  })

  it('finds the next cron minute across midnight UTC', () => {
    // 2024-01-01 23:59 UTC
    const now = Date.UTC(2024, 0, 1, 23, 59, 10)
    const next = nextRun('0 0 * * *', now)
    expect(next).toBe(Date.UTC(2024, 0, 2, 0, 0, 0))
  })

  it('respects CRON_TZ', () => {
    const now = Date.parse('2024-01-01T00:00:00+08:00')
    const next = nextRun('CRON_TZ=Asia/Shanghai 30 0 * * *', now)
    expect(new Date(next).toLocaleString('en-US', {
      timeZone: 'Asia/Shanghai',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })).toMatch(/00:30/)
  })
})

describe('createRoutineStore', () => {
  it('preserves concurrent creates and concurrent edits with run records', async () => {
    const { api } = store()
    const rows = await Promise.all(Array.from({ length: 12 }, (_, index) => api.create({
      botId: 'ops', name: `任务 ${index}`, schedule: '@daily', instruction: '检查状态',
    })))
    expect((await api.list()).map(row => row.id).sort()).toEqual(rows.map(row => row.id).sort())
    const row = rows[0]!
    await Promise.all([
      api.update({ id: row.id, instruction: '更新后的指令', enabled: false }),
      ...Array.from({ length: 10 }, (_, index) => api.recordRun(row.id, { ts: index + 1, outcome: 'silent', ms: 20 })),
    ])
    const saved = await api.get(row.id)
    expect(saved.instruction).toBe('更新后的指令')
    expect(saved.enabled).toBe(false)
    expect(saved.runs).toHaveLength(10)
    await expect(api.update({ id: 'missing', enabled: false })).rejects.toThrow()
    expect(await api.list()).toHaveLength(12)
  })

  it('creates, lists, records at most 20 runs, and backups corrupt files', async () => {
    const { home, api, advance } = store()
    const created = await api.create({
      botId: 'ops-night',
      name: '报时',
      schedule: '@every 1m',
      instruction: '报告当前时间',
    })
    expect(created.enabled).toBe(true)
    expect((await api.list('ops-night')).map(row => row.id)).toEqual([created.id])

    for (let i = 0; i < 25; i += 1) {
      advance(1000)
      await api.recordRun(created.id, { ts: 1_700_000_000_000 + i, outcome: 'spoke', ms: 10 })
    }
    const after = await api.get(created.id)
    expect(after.runs).toHaveLength(20)
    expect(after.lastOutcome).toBe('spoke')

    const file = join(home, 'dsh-bot', 'routines.json')
    writeFileSync(file, '{not-json')
    const recovered = await api.list()
    expect(recovered).toEqual([])
    expect(existsSync(`${file}.bak`)).toBe(true)
    expect(readFileSync(`${file}.bak`, 'utf8')).toContain('{not-json')
  })

  it('dedups same bot/name/schedule within 60s', async () => {
    const { api } = store()
    const a = await api.create({
      botId: 'ops-night',
      name: '报时',
      schedule: '@every 1m',
      instruction: 'A',
    })
    const b = await api.create({
      botId: 'ops-night',
      name: '报时',
      schedule: '@every 1m',
      instruction: 'B',
    })
    expect(b.id).toBe(a.id)
  })
})


describe('behavior section + propose parse', () => {
  it('renders declined topics and strips propose blocks', () => {
    const section = renderBehaviorSection(['校稿'])
    expect(section).toContain('## 行为规范')
    expect(section).toContain('这些主题已经拒绝过，不要再提：')
    expect(section).toContain('- 校稿')
    expect(section).toContain('同事：不要转述用户私下对你说的抱怨。')
    const parsed = parseProposeRoutine('先记下\n[propose-routine]{"name":"校稿","schedule":"@daily","instruction":"校今天的稿"}[/propose-routine]')
    expect(parsed.proposals).toEqual([{ name: '校稿', schedule: '@daily', instruction: '校今天的稿' }])
    expect(parsed.text).toBe('先记下')
  })
})
