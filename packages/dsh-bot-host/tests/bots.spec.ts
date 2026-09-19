/**
 * Internal bot registry: seed, CRUD, slug clash, default protect.
 * Persona lives in bots.json. No DSH agentPreset directories.
 */
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  SEED_PERSONA,
  aliasPresetId,
  createBotsRuntime,
  slugifyName,
} from '../src/bots.ts'

const homes: string[] = []
const previousHome = process.env.DSH_HOME

beforeEach(() => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-bot-reg-'))
  homes.push(home)
  process.env.DSH_HOME = home
})

afterEach(() => {
  while (homes.length > 0) {
    const home = homes.pop()
    if (home !== undefined) rmSync(home, { recursive: true, force: true })
  }
  if (previousHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousHome
})

function runtime() {
  const home = process.env.DSH_HOME!
  return {
    home,
    bots: createBotsRuntime({
      home: () => home,
      now: () => 1_700_000_000_000,
    }),
  }
}

describe('slugifyName', () => {
  it('groups CJK pinyin in pairs: 诗人小北 → shiren-xiaobei', () => {
    expect(slugifyName('诗人小北')).toBe('shiren-xiaobei')
  })

  it('hyphenates ASCII words', () => {
    expect(slugifyName('DSH Bot')).toBe('dsh-bot')
  })
})

describe('aliasPresetId', () => {
  it('keeps the seed id and prefixes custom bots', () => {
    expect(aliasPresetId('dsh-bot')).toBe('dsh-bot')
    expect(aliasPresetId('shiren-xiaobei')).toBe('dsh-bot--shiren-xiaobei')
  })
})

describe('bots runtime', () => {
  it('seeds the default bot with persona in the registry', async () => {
    const { home, bots } = runtime()
    const { bots: rows } = await bots.listBots()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: 'dsh-bot',
      name: 'DSH Bot',
      presetId: 'dsh-bot',
      protected: true,
      persona: SEED_PERSONA,
    })
    expect(rows[0]?.avatar.color).toMatch(/^#[0-9a-fA-F]{6}$/)
    const registry = JSON.parse(readFileSync(join(home, 'dsh-bot', 'bots.json'), 'utf8')) as {
      bots: Array<{ persona?: unknown }>
    }
    expect(registry.bots[0]?.persona).toBe(SEED_PERSONA)
    expect(existsSync(join(home, '.agent-presets'))).toBe(false)
  })

  it('creates a bot as registry-only config', async () => {
    const { home, bots } = runtime()
    const created = await bots.createBot({
      name: '诗人小北',
      persona: '你是一位诗人，先比喻再回答。',
      avatar: { emoji: '📜' },
    })
    expect(created.id).toBe('shiren-xiaobei')
    expect(created.presetId).toBe('dsh-bot--shiren-xiaobei')
    expect(created.protected).toBe(false)
    expect(created.persona).toBe('你是一位诗人，先比喻再回答。')
    expect(existsSync(join(home, '.agent-presets'))).toBe(false)
    const listed = await bots.listBots()
    expect(listed.bots.map(row => row.id)).toEqual(['dsh-bot', 'shiren-xiaobei'])
    const registry = JSON.parse(readFileSync(join(home, 'dsh-bot', 'bots.json'), 'utf8')) as {
      bots: Array<{ id: string; persona?: string }>
    }
    expect(registry.bots.find(row => row.id === created.id)?.persona).toBe('你是一位诗人，先比喻再回答。')
  })

  it('suffixes slugs on collision', async () => {
    const { bots } = runtime()
    const first = await bots.createBot({ name: '诗人小北', persona: '一人。' })
    const second = await bots.createBot({ name: '诗人小北', persona: '二人。' })
    expect(first.presetId).toBe('dsh-bot--shiren-xiaobei')
    expect(second.presetId).toBe('dsh-bot--shiren-xiaobei-2')
    expect(second.id).toBe('shiren-xiaobei-2')
  })

  it('updates name/avatar/modelOverride and persona in the registry', async () => {
    const { bots } = runtime()
    const created = await bots.createBot({ name: '诗人小北', persona: '旧人设' })
    const updated = await bots.updateBot({
      id: created.id,
      name: '北北',
      persona: '新人设',
      avatar: { emoji: '🪶', color: '#3db88a' },
      modelOverride: { provider: 'anthropic', model: 'grok-4.6' },
    })
    expect(updated.name).toBe('北北')
    expect(updated.persona).toBe('新人设')
    expect(updated.avatar).toEqual({ emoji: '🪶', color: '#3db88a' })
    expect(updated.modelOverride).toEqual({ provider: 'anthropic', model: 'grok-4.6' })
    const cleared = await bots.updateBot({ id: created.id, modelOverride: null })
    expect(cleared.modelOverride).toBeUndefined()
    expect(cleared.persona).toBe('新人设')
  })

  it('rolls back the persona if the registry write fails after rewrite', async () => {
    const { home, bots } = runtime()
    const created = await bots.createBot({ name: '诗人小北', persona: '旧人设' })
    chmodSync(join(home, 'dsh-bot'), 0o555)
    try {
      await expect(bots.updateBot({ id: created.id, persona: '新人设' })).rejects.toThrow()
    } finally {
      chmodSync(join(home, 'dsh-bot'), 0o755)
    }
    expect((await bots.listBots()).bots.find(row => row.id === created.id)?.persona).toBe('旧人设')
  })

  it('refuses to delete the seed bot', async () => {
    const { bots } = runtime()
    await expect(bots.deleteBot({ id: 'dsh-bot' })).rejects.toMatchObject({ code: 'bot-protected' })
  })

  it('deletes a custom bot from the registry only', async () => {
    const { bots } = runtime()
    const created = await bots.createBot({ name: '诗人小北', persona: '人设' })
    const result = await bots.deleteBot({ id: created.id })
    expect(result).toEqual({ id: 'shiren-xiaobei', deleted: true })
    expect((await bots.listBots()).bots.map(row => row.id)).toEqual(['dsh-bot'])
  })

  it('allows updating the seed persona in the registry', async () => {
    const { bots } = runtime()
    const updated = await bots.updateBot({ id: 'dsh-bot', name: '默认助手', persona: '新人设' })
    expect(updated.name).toBe('默认助手')
    expect(updated.persona).toBe('新人设')
  })

  it('fails loud on a corrupt registry without throwing untyped errors', async () => {
    const { home, bots } = runtime()
    await bots.listBots()
    writeFileSync(join(home, 'dsh-bot', 'bots.json'), '{not json')
    await expect(bots.listBots()).rejects.toMatchObject({ code: 'registry-corrupt' })
  })

  it('treats empty modelOverride as follow-global', async () => {
    const { bots } = runtime()
    const created = await bots.createBot({
      name: '跟随',
      persona: '人设',
      modelOverride: { provider: ' ', model: '' },
    })
    expect(created.modelOverride).toBeUndefined()
  })

  it('fills missing seed persona from the bundled default', async () => {
    const { home, bots } = runtime()
    await bots.listBots()
    const file = join(home, 'dsh-bot', 'bots.json')
    const raw = JSON.parse(readFileSync(file, 'utf8')) as { version: number; bots: Record<string, unknown>[] }
    delete raw.bots[0]!.persona
    writeFileSync(file, JSON.stringify(raw))
    const listed = await bots.listBots()
    expect(listed.bots[0]?.persona).toBe(SEED_PERSONA)
  })
})

describe('declineTopic / behavior section', () => {
  it('records declined topics without rewriting persona', async () => {
    const { home, bots } = runtime()
    const created = await bots.createBot({ name: '校对阿宁', persona: '你是校对阿宁。' })
    const next = await bots.declineTopic(created.id, '校稿')
    expect(next.declined).toEqual(['校稿'])
    const registry = JSON.parse(readFileSync(join(home, 'dsh-bot', 'bots.json'), 'utf8')) as {
      bots: Array<{ id: string; persona?: string; declined?: string[] }>
    }
    const row = registry.bots.find(item => item.id === created.id)
    expect(row?.persona).toBe('你是校对阿宁。')
    expect(row?.declined).toEqual(['校稿'])
  })
})

describe('bot layout defaults', () => {
  it('fills layout defaults for old bots.json rows', async () => {
    const { home, bots } = runtime()
    await bots.listBots()
    const file = join(home, 'dsh-bot', 'bots.json')
    const raw = JSON.parse(readFileSync(file, 'utf8')) as { version: number; bots: Record<string, unknown>[] }
    raw.bots = raw.bots.map(row => {
      const copy = { ...row }
      delete copy.pinned
      delete copy.section
      delete copy.hidden
      delete copy.order
      delete copy.muted
      return copy
    })
    writeFileSync(file, JSON.stringify(raw))
    const listed = await bots.listBots()
    expect(listed.bots[0]?.pinned).toBe(false)
    expect(listed.bots[0]?.section).toBe('work')
    expect(listed.bots[0]?.hidden).toBe(false)
    expect(listed.bots[0]?.muted).toBe(false)
    expect(typeof listed.bots[0]?.order).toBe('number')
  })

  it('updateLayout skips unknown ids', async () => {
    const { bots } = runtime()
    const listed = await bots.listBots()
    const id = listed.bots[0]!.id
    const result = await bots.updateLayout([
      { id, pinned: true, section: 'pinned' },
      { id: 'missing-bot', hidden: true },
    ])
    expect(result.ok).toBe(true)
    expect(result.skipped).toEqual(['missing-bot'])
    const again = await bots.getBot(id)
    expect(again.pinned).toBe(true)
    expect(again.section).toBe('pinned')
  })
})
