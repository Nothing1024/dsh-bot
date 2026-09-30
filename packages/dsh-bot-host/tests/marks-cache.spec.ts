/**
 * marks.jsonl snapshot cache: revalidation on external writes, home switches.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { patch, put } from 'session-marks'
import { marksOf, marksTable, rowsWithMark } from '../src/marks-cache.ts'

const homes: string[] = []
const previousHome = process.env.DSH_HOME

function useHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'dsh-bot-marks-cache-'))
  homes.push(home)
  process.env.DSH_HOME = home
  return home
}

beforeEach(() => { useHome() })

afterEach(() => {
  while (homes.length > 0) {
    const home = homes.pop()
    if (home !== undefined) rmSync(home, { recursive: true, force: true })
  }
  if (previousHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousHome
})

describe('marks-cache', () => {
  it('reads an absent table as empty, then sees writes made outside this module', async () => {
    expect(await marksOf('s1')).toBeUndefined()
    await put('s1', ['bot:a'])
    expect(await marksOf('s1')).toEqual(['bot:a'])
    await patch('s1', { add: ['group-room:r1'] })
    expect(await marksOf('s1')).toEqual(['bot:a', 'group-room:r1'])
    await patch('s1', { remove: ['bot:a', 'group-room:r1'] })
    expect(await marksOf('s1')).toBeUndefined()
  })

  it('shares one load between concurrent callers', async () => {
    await put('s1', ['bot:a'])
    const [a, b] = await Promise.all([marksTable(), marksTable()])
    expect(b).toBe(a)
  })

  it('follows a DSH_HOME switch instead of serving the previous table', async () => {
    await put('s1', ['bot:a'])
    expect(await rowsWithMark('bot:a')).toEqual([{ id: 's1', tags: ['bot:a'] }])
    useHome()
    expect(await rowsWithMark('bot:a')).toEqual([])
  })
})
