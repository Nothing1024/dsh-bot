/**
 * Extract JSON parse, remove-vs-explicit, greeting skip (BR-802 / BR-805).
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryStore } from '../src/memory.ts'
import {
  applyExtract,
  extractMemory,
  parseExtractJson,
} from '../src/memory-extract.ts'

const homes: string[] = []

afterEach(() => {
  while (homes.length > 0) {
    const home = homes.pop()
    if (home !== undefined) rmSync(home, { recursive: true, force: true })
  }
})

function mem() {
  const home = mkdtempSync(join(tmpdir(), 'dsh-bot-ex-'))
  homes.push(home)
  return createMemoryStore(home)
}

describe('parseExtractJson', () => {
  it('accepts fenced JSON and ignores junk around it', () => {
    const parsed = parseExtractJson('好的\n```json\n{"profile":["用户叫 Nothing"],"log":["改了 README"],"remove":[]}\n```')
    expect(parsed).toEqual({
      profile: ['用户叫 Nothing'],
      log: ['改了 README'],
      remove: [],
    })
  })

  it('returns null on garbage', () => {
    expect(parseExtractJson('not json')).toBeNull()
  })
})

describe('applyExtract', () => {
  it('does not remove an explicit row even when remove names it', async () => {
    const memory = mem()
    const explicit = await memory.appendLog('b', {
      kind: 'log',
      text: '你标记的句子',
      source: 'explicit',
    })
    await applyExtract(memory, 'b', {
      profile: [],
      log: [],
      remove: ['你标记的句子'],
    })
    const listed = await memory.list('b')
    expect(listed.log.map(row => row.id)).toEqual([explicit.id])
  })

  it('tombstones an auto row that matches remove verbatim', async () => {
    const memory = mem()
    await memory.appendProfile('b', '用户叫旧名')
    await applyExtract(memory, 'b', {
      profile: ['用户叫 Nothing'],
      log: ['昨天改了 README'],
      remove: ['用户叫旧名'],
    })
    const listed = await memory.list('b')
    expect(listed.profile.map(row => row.text)).toEqual(['用户叫 Nothing'])
    expect(listed.log.map(row => row.text)).toEqual(['昨天改了 README'])
  })
})

describe('extractMemory', () => {
  it('skips askBot for greetings', async () => {
    const ask = vi.fn(async () => '{"profile":["x"],"log":[],"remove":[]}')
    const result = await extractMemory(
      { memory: mem(), ask },
      { botId: 'b', turnText: '谢谢' },
    )
    expect(result).toBeNull()
    expect(ask).not.toHaveBeenCalled()
  })

  it('returns null when the model output is not JSON', async () => {
    const ask = vi.fn(async () => '我记下了')
    const result = await extractMemory(
      { memory: mem(), ask },
      { botId: 'b', turnText: '我叫 Nothing，术语保留英文' },
    )
    expect(result).toBeNull()
  })
})
