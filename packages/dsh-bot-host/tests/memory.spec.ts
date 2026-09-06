/**
 * Memory store: files, tombstone, render budget, shouldExtract (BR-801).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  composePersona,
  createMemoryStore,
  parseProfile,
  renderMemorySection,
  shouldExtract,
  stripMemorySection,
} from '../src/memory.ts'

const homes: string[] = []

afterEach(() => {
  while (homes.length > 0) {
    const home = homes.pop()
    if (home !== undefined) rmSync(home, { recursive: true, force: true })
  }
})

function store(now = 1_700_000_000_000) {
  const home = mkdtempSync(join(tmpdir(), 'dsh-bot-mem-'))
  homes.push(home)
  let tick = now
  let n = 0
  return {
    home,
    mem: createMemoryStore(home, {
      now: () => {
        tick += 1
        return tick
      },
      random: () => {
        n += 1
        return `r${String(n).padStart(5, '0')}`
      },
    }),
  }
}

describe('createMemoryStore', () => {
  it('lazy-creates the bot directory and round-trips profile / log', async () => {
    const { home, mem } = store()
    expect(existsSync(mem.dir('xiaodui-aning'))).toBe(false)
    const fact = await mem.appendProfile('xiaodui-aning', '用户叫 Nothing')
    const log = await mem.appendLog('xiaodui-aning', {
      kind: 'log',
      text: '约定术语保留英文',
      source: 'auto',
      sessionId: 's1',
    })
    expect(fact.text).toBe('用户叫 Nothing')
    expect(log.id).toMatch(/^\d+-r00002$/)
    expect(existsSync(join(home, 'dsh-bot', 'memory', 'xiaodui-aning', 'profile.md'))).toBe(true)
    const listed = await mem.list('xiaodui-aning')
    expect(listed.profile.map(row => row.text)).toEqual(['用户叫 Nothing'])
    expect(listed.log.map(row => row.text)).toEqual(['约定术语保留英文'])
  })

  it('dedupes identical profile lines', async () => {
    const { mem } = store()
    const a = await mem.appendProfile('b', '用户叫 Nothing')
    const b = await mem.appendProfile('b', '用户叫 Nothing')
    expect(b.id).toBe(a.id)
    expect(await mem.readProfile('b')).toHaveLength(1)
  })

  it('tombstones a log row in place and hides it from list', async () => {
    const { mem } = store()
    const row = await mem.appendLog('b', { kind: 'note', text: '旧备注', source: 'explicit' })
    const gone = await mem.tombstone('b', row.id)
    expect(gone.tombstone).toBe(true)
    expect((await mem.readLog('b'))[0]?.tombstone).toBe(true)
    expect((await mem.list('b')).log).toEqual([])
    const again = await mem.tombstone('b', row.id)
    expect(again.id).toBe(row.id)
  })

  it('moves a forgotten profile line into a tombstoned log row', async () => {
    const { mem } = store()
    const fact = await mem.appendProfile('b', '用户叫 Nothing')
    const moved = await mem.tombstone('b', fact.id)
    expect(moved.tombstone).toBe(true)
    expect(moved.text).toBe('用户叫 Nothing')
    expect(await mem.readProfile('b')).toEqual([])
    expect((await mem.readLog('b')).some(row => row.id === fact.id && row.tombstone === true)).toBe(true)
  })

  it('clear empties files and remove deletes the directory', async () => {
    const { mem } = store()
    await mem.appendProfile('b', 'x')
    await mem.appendLog('b', { kind: 'log', text: 'y', source: 'auto' })
    await mem.clear('b')
    expect(await mem.readProfile('b')).toEqual([])
    expect(await mem.readLog('b')).toEqual([])
    expect(existsSync(mem.dir('b'))).toBe(true)
    await mem.remove('b')
    expect(existsSync(mem.dir('b'))).toBe(false)
  })

  it('skips a corrupt jsonl line', async () => {
    const { home, mem } = store()
    const dir = mem.dir('b')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'log.jsonl'), 'not-json\n{"id":"1","ts":1,"kind":"log","text":"ok","source":"auto"}\n')
    const rows = await mem.readLog('b')
    expect(rows).toEqual([{ id: '1', ts: 1, kind: 'log', text: 'ok', source: 'auto' }])
    expect(readFileSync(join(home, 'dsh-bot', 'memory', 'b', 'log.jsonl'), 'utf8')).toContain('not-json')
  })
})

describe('parseProfile', () => {
  it('reads bare bullets without meta as hashed ids', () => {
    const rows = parseProfile('- 用户叫 Nothing\n- 术语保留英文\n')
    expect(rows.map(row => row.text)).toEqual(['用户叫 Nothing', '术语保留英文'])
    expect(rows[0]?.id.startsWith('p-')).toBe(true)
  })
})

describe('renderMemorySection', () => {
  it('returns empty when both sides are empty', () => {
    expect(renderMemorySection([], [])).toBe('')
  })

  it('keeps the heading and drops tombstones', () => {
    const text = renderMemorySection(
      [{ id: 'p', ts: 1, text: '用户叫 Nothing' }],
      [
        { id: 'a', ts: 1, kind: 'log', text: '死行', source: 'auto', tombstone: true },
        { id: 'b', ts: 2, kind: 'log', text: '昨天改了 README', source: 'auto' },
      ],
    )
    expect(text.startsWith('## 你记得的事')).toBe(true)
    expect(text).toContain('- 用户叫 Nothing')
    expect(text).toContain('- 昨天改了 README')
    expect(text).not.toContain('死行')
  })

  it('drops oldest logs first when over the char budget', () => {
    const profile = [{ id: 'p', ts: 1, text: 'x'.repeat(20) }]
    const log = Array.from({ length: 6 }, (_, i) => ({
      id: `l${i}`,
      ts: i,
      kind: 'log' as const,
      text: `entry-${i}-${'y'.repeat(40)}`,
      source: 'auto' as const,
    }))
    const text = renderMemorySection(profile, log, { maxChars: 180, maxLog: 6 })
    expect(text).toContain('entry-5-')
    expect(text).not.toContain('entry-0-')
    expect(text.length).toBeLessThanOrEqual(180)
  })
})

describe('shouldExtract', () => {
  it('skips short greetings without a question mark', () => {
    expect(shouldExtract('谢谢')).toBe(false)
    expect(shouldExtract('好的')).toBe(false)
    expect(shouldExtract('ok')).toBe(false)
    expect(shouldExtract('嗯嗯')).toBe(false)
    expect(shouldExtract('收到。')).toBe(false)
  })

  it('extracts short questions and short facts that are not greetings', () => {
    expect(shouldExtract('为什么？')).toBe(true)
    expect(shouldExtract('我叫 Nothing，术语保留英文')).toBe(true)
    expect(shouldExtract('好的，收到')).toBe(false)
    expect(shouldExtract('请记住：发布前先跑 typecheck 再打 tag，这是团队约定。')).toBe(true)
  })
})


describe('stripMemorySection + composePersona', () => {
  it('strips an injected memory heading and recomposes to base when empty', () => {
    const base = '你是小安。'
    const injected = composePersona(base, { memory: '## 你记得的事\n\n长期事实：\n- 用户叫 Nothing' })
    expect(injected).toContain('## 你记得的事')
    expect(stripMemorySection(injected)).toBe(base)
    expect(composePersona(stripMemorySection(injected), { memory: '' })).toBe(base)
  })

  it('leaves a clean base unchanged', () => {
    expect(stripMemorySection('你是小安。')).toBe('你是小安。')
  })
})
