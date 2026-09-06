/**
 * Registry + preset factory: seed, CRUD, slug clash, YAML escape, broken
 * rollback, default protect (BR-201 / BR-202).
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createBotsRuntime,
  readPersonaText,
  replacePersonaText,
  slugifyName,
  yamlSingleQuote,
} from '../src/bots.ts'
import type { PresetGate, PresetListEntry } from '../src/bots.ts'
import { DshBotError } from '../src/errors.ts'

const TEMPLATE = `---
- id: persona
  name: '@deepseek-ai/dsh-persona'
  config:
    text: >-
      你是 DSH Bot。

- id: tool-bash
  name: '@deepseek-ai/dsh-tool-bash'
`

function seedTemplate(home: string): void {
  const dir = join(home, '.agent-presets', 'dsh-bot')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'agent.cordis.yml'), TEMPLATE)
  writeFileSync(join(dir, 'preset.yml'), 'name: DSH Bot\ndescription: 常驻对话助手。\n')
}

function fsGate(home: string, broken = new Set<string>()): PresetGate {
  return {
    async list(): Promise<PresetListEntry[]> {
      const root = join(home, '.agent-presets')
      if (!existsSync(root)) return []
      const { readdirSync } = await import('node:fs')
      const out: PresetListEntry[] = []
      for (const id of readdirSync(root)) {
        if (!existsSync(join(root, id, 'agent.cordis.yml'))) continue
        const reason = broken.has(id)
        out.push(reason ? { id, broken: 'injected-broken' } : { id })
      }
      return out
    },
  }
}

const homes: string[] = []
const previousHome = process.env.DSH_HOME

beforeEach(() => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-bot-reg-'))
  homes.push(home)
  process.env.DSH_HOME = home
  seedTemplate(home)
})

afterEach(() => {
  while (homes.length > 0) {
    const home = homes.pop()
    if (home !== undefined) rmSync(home, { recursive: true, force: true })
  }
  if (previousHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousHome
})

function runtime(broken?: Set<string>) {
  const home = process.env.DSH_HOME!
  return {
    home,
    bots: createBotsRuntime({
      gate: fsGate(home, broken),
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

function yamlEngineLoad(doc: string): unknown {
  const require = createRequire(import.meta.url)
  const yaml = require('../../../env/profiles/gb/node_modules/js-yaml') as { load: (raw: string) => unknown }
  return yaml.load(doc)
}

describe('yaml persona quoting', () => {
  it('single-quotes and doubles apostrophes', () => {
    expect(yamlSingleQuote("it's a trap")).toBe("'it''s a trap'")
  })

  it('rejects control characters', () => {
    expect(() => yamlSingleQuote('ok\u0000no')).toThrow(DshBotError)
  })

  it('round-trips multi-line injection text through a YAML engine', () => {
    const injected = '""" !!js/function >-\nfoo'
    const next = replacePersonaText(TEMPLATE, injected)
    expect(next).toMatch(/text: \|-$/m)
    expect(next).toContain('""" !!js/function >-')
    expect(next).not.toMatch(/\\nfoo/)
    expect(next).toContain('- id: tool-bash')
    expect(readPersonaText(next)).toBe(injected)
    const loaded = yamlEngineLoad(next) as Array<{ id?: string; config?: { text?: string } }>
    expect(loaded.find(row => row.id === 'persona')?.config?.text).toBe(injected)
  })
})

describe('bots runtime', () => {
  it('seeds the default bot bound to the bundled preset', async () => {
    const { home, bots } = runtime()
    const { bots: rows } = await bots.listBots()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: 'dsh-bot',
      name: 'DSH Bot',
      presetId: 'dsh-bot',
      protected: true,
      persona: '你是 DSH Bot。',
    })
    expect(rows[0]?.avatar.color).toMatch(/^#[0-9a-fA-F]{6}$/)
    const registry = JSON.parse(readFileSync(join(home, 'dsh-bot', 'bots.json'), 'utf8')) as {
      bots: Array<{ persona?: unknown }>
    }
    expect(registry.bots[0]?.persona).toBeUndefined()
  })

  it('creates a managed preset, then lists it', async () => {
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
    const dir = join(home, '.agent-presets', 'dsh-bot--shiren-xiaobei')
    expect(existsSync(join(dir, 'agent.cordis.yml'))).toBe(true)
    const composition = readFileSync(join(dir, 'agent.cordis.yml'), 'utf8')
    expect(composition).toContain("text: '你是一位诗人，先比喻再回答。'")
    expect(composition).toContain('- id: tool-bash')
    const listed = await bots.listBots()
    expect(listed.bots.map(row => row.id)).toEqual(['dsh-bot', 'shiren-xiaobei'])
  })

  it('suffixes slugs on collision', async () => {
    const { bots } = runtime()
    const first = await bots.createBot({ name: '诗人小北', persona: '一人。' })
    const second = await bots.createBot({ name: '诗人小北', persona: '二人。' })
    expect(first.presetId).toBe('dsh-bot--shiren-xiaobei')
    expect(second.presetId).toBe('dsh-bot--shiren-xiaobei-2')
    expect(second.id).toBe('shiren-xiaobei-2')
  })

  it('updates name/avatar/modelOverride in the registry and persona on disk', async () => {
    const { home, bots } = runtime()
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
    const composition = readFileSync(
      join(home, '.agent-presets', 'dsh-bot--shiren-xiaobei', 'agent.cordis.yml'),
      'utf8',
    )
    expect(readPersonaText(composition)).toBe('新人设')
    const cleared = await bots.updateBot({ id: created.id, modelOverride: null })
    expect(cleared.modelOverride).toBeUndefined()
  })

  it('rolls back a broken create: no directory, no registry row', async () => {
    const { home, bots } = runtime(new Set(['dsh-bot--shiren-xiaobei']))
    await expect(bots.createBot({ name: '诗人小北', persona: '人设' })).rejects.toMatchObject({
      code: 'preset-broken',
    })
    expect(existsSync(join(home, '.agent-presets', 'dsh-bot--shiren-xiaobei'))).toBe(false)
    const listed = await bots.listBots()
    expect(listed.bots.map(row => row.id)).toEqual(['dsh-bot'])
  })

  it('rolls back the preset if the registry write fails after rewrite', async () => {
    const { home, bots } = runtime()
    const created = await bots.createBot({ name: '诗人小北', persona: '旧人设' })
    chmodSync(join(home, 'dsh-bot'), 0o555)
    try {
      await expect(bots.updateBot({ id: created.id, persona: '新人设' })).rejects.toThrow()
    } finally {
      chmodSync(join(home, 'dsh-bot'), 0o755)
    }
    const composition = readFileSync(
      join(home, '.agent-presets', 'dsh-bot--shiren-xiaobei', 'agent.cordis.yml'),
      'utf8',
    )
    expect(readPersonaText(composition)).toBe('旧人设')
    expect((await bots.listBots()).bots.find(row => row.id === created.id)?.persona).toBe('旧人设')
  })

  it('rolls back a broken update and keeps the previous composition', async () => {
    const { home } = runtime()
    const created = await createBotsRuntime({
      gate: fsGate(home),
      home: () => home,
    }).createBot({ name: '诗人小北', persona: '旧人设' })
    const broken = createBotsRuntime({
      gate: fsGate(home, new Set(['dsh-bot--shiren-xiaobei'])),
      home: () => home,
    })
    await expect(broken.updateBot({ id: created.id, persona: '新人设' })).rejects.toMatchObject({
      code: 'preset-broken',
    })
    const composition = readFileSync(
      join(home, '.agent-presets', 'dsh-bot--shiren-xiaobei', 'agent.cordis.yml'),
      'utf8',
    )
    expect(readPersonaText(composition)).toBe('旧人设')
    const listed = await broken.listBots()
    expect(listed.bots.find(row => row.id === created.id)?.persona).toBe('旧人设')
  })

  it('refuses to delete the seed bot and does not touch the bundled preset', async () => {
    const { home, bots } = runtime()
    await expect(bots.deleteBot({ id: 'dsh-bot' })).rejects.toMatchObject({ code: 'bot-protected' })
    expect(existsSync(join(home, '.agent-presets', 'dsh-bot', 'agent.cordis.yml'))).toBe(true)
  })

  it('deletes a managed preset directory then the registry row', async () => {
    const { home, bots } = runtime()
    const created = await bots.createBot({ name: '诗人小北', persona: '人设' })
    const result = await bots.deleteBot({ id: created.id })
    expect(result).toEqual({ id: 'shiren-xiaobei', deleted: true })
    expect(existsSync(join(home, '.agent-presets', 'dsh-bot--shiren-xiaobei'))).toBe(false)
    expect((await bots.listBots()).bots.map(row => row.id)).toEqual(['dsh-bot'])
  })

  it('does not rewrite the bundled preset when updating the seed name', async () => {
    const { home, bots } = runtime()
    const updated = await bots.updateBot({ id: 'dsh-bot', name: '默认助手' })
    expect(updated.name).toBe('默认助手')
    expect(readFileSync(join(home, '.agent-presets', 'dsh-bot', 'agent.cordis.yml'), 'utf8')).toBe(TEMPLATE)
    await expect(bots.updateBot({ id: 'dsh-bot', persona: '偷偷改官方人设' })).rejects.toMatchObject({
      code: 'bot-protected',
    })
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
})


describe('rewritePresetPersona / INV-801', () => {
  it('rewrites the preset file twice without changing bots.json.persona', async () => {
    const { home, bots } = runtime()
    const created = await bots.createBot({ name: '校对阿宁', persona: '你是校对阿宁。' })
    const section = '## 你记得的事\n\n长期事实：\n- 用户叫 Nothing'
    await bots.rewritePresetPersona(created.id, `${created.persona}\n\n${section}`)
    await bots.rewritePresetPersona(created.id, `${created.persona}\n\n${section}\n- 术语保留英文`)
    const registry = JSON.parse(readFileSync(join(home, 'dsh-bot', 'bots.json'), 'utf8')) as {
      bots: Array<{ id: string; persona?: string }>
    }
    expect(registry.bots.find(row => row.id === created.id)?.persona).toBe('你是校对阿宁。')
    expect((await bots.getBot(created.id)).persona).toBe('你是校对阿宁。')
    const composition = readFileSync(
      join(home, '.agent-presets', created.presetId, 'agent.cordis.yml'),
      'utf8',
    )
    expect(composition).toContain('你记得的事')
    expect(composition).toContain('术语保留英文')
  })

  it('rolls back a broken rewrite', async () => {
    const { home } = runtime()
    const created = await createBotsRuntime({
      gate: fsGate(home),
      home: () => home,
    }).createBot({ name: '校对阿宁', persona: '旧人设' })
    const broken = createBotsRuntime({
      gate: fsGate(home, new Set([created.presetId])),
      home: () => home,
    })
    await expect(broken.rewritePresetPersona(created.id, '新人设加记忆')).rejects.toMatchObject({
      code: 'preset-broken',
    })
    const composition = readFileSync(
      join(home, '.agent-presets', created.presetId, 'agent.cordis.yml'),
      'utf8',
    )
    expect(readPersonaText(composition)).toBe('旧人设')
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
