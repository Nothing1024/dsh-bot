/**
 * Bot registry ($DSH_HOME/dsh-bot/bots.json) and whole-file preset factory
 * (env/.agent-presets/dsh-bot--<slug>/). Persona text is never stored in the
 * registry — only in the preset persona row (BR-201 / BR-202).
 * @module dsh-bot-host/bots
 */

import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pinyin } from 'pinyin-pro'
import { DshBotError } from './errors.ts'
import { stripMemorySection } from './memory.ts'
import type { DshBotModelRef } from './platform.ts'

/** Seed bot id, bound to the existing dsh-bot preset and deletion-protected. */
export const SEED_BOT_ID = 'dsh-bot'
/** Preset id for the seed bot (the official bundled template, never rewritten). */
export const SEED_PRESET_ID = 'dsh-bot'
/** Directory prefix that marks an automatically managed bot preset. */
export const MANAGED_PRESET_PREFIX = 'dsh-bot--'

const COMPOSITION_FILE = 'agent.cordis.yml'
const METADATA_FILE = 'preset.yml'
const REGISTRY_FILE = 'bots.json'
const NAME_MAX = 64
const PERSONA_MAX = 16_000
const EMOJI_MAX = 16

/** 8-color avatar board; UI hashes botId into the same set (BR-206). */
export const AVATAR_COLORS = [
  '#5b8def',
  '#7c6af7',
  '#d4537e',
  '#e08a3c',
  '#3db88a',
  '#2eb5d0',
  '#c9a227',
  '#a78bfa',
] as const

/** Avatar stored in the registry (no image upload). */
export interface BotAvatar {
  readonly color: string
  readonly emoji?: string
}

/** Durable registry row. `persona` is the user-edited base (INV-801). */
export interface BotRegistryRow {
  readonly id: string
  readonly name: string
  readonly avatar: BotAvatar
  readonly presetId: string
  readonly persona?: string
  readonly declined?: readonly string[]
  readonly modelOverride?: DshBotModelRef
  readonly createdAt: number
}

/** Wire view: registry fields plus persona read from the preset file. */
export interface BotView extends BotRegistryRow {
  readonly persona: string
  readonly protected: boolean
}

/** `agentPreset.list` subset the factory needs (stubbed in tests). */
export interface PresetListEntry {
  readonly id: string
  readonly broken?: string
}

/** Write-after-check gate. Production binds `ctx.agentPresets` / apiProxy. */
export interface PresetGate {
  list(): Promise<readonly PresetListEntry[]>
}

/** createBot args. Empty modelOverride follows the global default (BR-010). */
export interface CreateBotInput {
  readonly name: string
  readonly persona: string
  readonly avatar?: { readonly emoji?: string; readonly color?: string }
  readonly modelOverride?: DshBotModelRef
}

/** updateBot args. `modelOverride: null` clears a per-bot override. */
export interface UpdateBotInput {
  readonly id: string
  readonly name?: string
  readonly persona?: string
  readonly avatar?: { readonly emoji?: string; readonly color?: string }
  readonly modelOverride?: DshBotModelRef | null
}

export interface ListBotsResult {
  readonly bots: readonly BotView[]
}

export interface DeleteBotResult {
  readonly id: string
  readonly deleted: true
}

export interface BotsRuntime {
  listBots(): Promise<ListBotsResult>
  getBot(id: string): Promise<BotView>
  createBot(input: CreateBotInput): Promise<BotView>
  updateBot(input: UpdateBotInput): Promise<BotView>
  deleteBot(input: { id: string }): Promise<DeleteBotResult>
  rewritePresetPersona(botId: string, fullText: string): Promise<void>
  declineTopic(botId: string, topic: string): Promise<BotView>
}

export interface BotsRuntimeOptions {
  readonly gate: PresetGate
  readonly home?: () => string
  readonly now?: () => number
}

interface RegistryFile {
  readonly version: 1
  readonly bots: readonly BotRegistryRow[]
}

/**
 * Deterministic color from botId (FNV-1a → 8-color board).
 */
export function hashAvatarColor(botId: string): string {
  let hash = 2166136261
  for (let i = 0; i < botId.length; i += 1) {
    hash ^= botId.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return AVATAR_COLORS[(hash >>> 0) % AVATAR_COLORS.length]!
}

/**
 * YAML 1.1 single-quoted scalar (no backslash escapes). Apostrophes double.
 * Newlines are not encoded here — multi-line persona uses a literal block.
 */
export function yamlSingleQuote(value: string): string {
  assertNoControls(value, 'value')
  if (value.includes('\n')) {
    throw new DshBotError('internal', 'yamlSingleQuote does not encode newlines')
  }
  return `'${value.replaceAll("'", "''")}'`
}

/**
 * Persona `config.text` value that a YAML engine round-trips to `persona`.
 * Single line → quoted scalar; multi-line → `|-` literal (injection-safe).
 */
export function yamlPersonaScalar(persona: string, keyIndent: string): string {
  assertNoControls(persona, 'persona')
  if (!persona.includes('\n')) return yamlSingleQuote(persona)
  const child = `${keyIndent}  `
  return `|-\n${persona.split('\n').map(line => `${child}${line}`).join('\n')}`
}

/**
 * Slug for `dsh-bot--<slug>`. ASCII words stay hyphenated; CJK runs are
 * pinyin with syllables grouped in pairs (`诗人小北` → `shiren-xiaobei`).
 */
export function slugifyName(name: string): string {
  const tokens: string[] = []
  const chars = [...name.normalize('NFKC').trim()]
  let i = 0
  while (i < chars.length) {
    const ch = chars[i]!
    if (/[A-Za-z0-9]/.test(ch)) {
      let word = ''
      while (i < chars.length && /[A-Za-z0-9]/.test(chars[i]!)) {
        word += chars[i]!.toLowerCase()
        i += 1
      }
      tokens.push(word)
      continue
    }
    if (/[\u4E00-\u9FFF]/.test(ch)) {
      const syllables: string[] = []
      while (i < chars.length && /[\u4E00-\u9FFF]/.test(chars[i]!)) {
        const py = pinyinOf(chars[i]!)
        if (py !== '') syllables.push(py)
        i += 1
      }
      for (let j = 0; j < syllables.length; j += 2) {
        tokens.push(syllables[j]! + (syllables[j + 1] ?? ''))
      }
      continue
    }
    i += 1
  }
  const slug = tokens.filter(part => part !== '').join('-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  return slug === '' ? 'bot' : slug
}

/**
 * Replace the persona `config.text` value inside a whole composition file.
 * The rest of the document is copied unchanged (no YAML surgery of other rows).
 */
export function replacePersonaText(source: string, persona: string): string {
  const lines = source.replaceAll('\r\n', '\n').split('\n')
  let personaStart = -1
  let personaEnd = lines.length
  for (let i = 0; i < lines.length; i += 1) {
    if (/^- id: persona\b/.test(lines[i]!)) {
      personaStart = i
      for (let j = i + 1; j < lines.length; j += 1) {
        if (/^- id: /.test(lines[j]!)) {
          personaEnd = j
          break
        }
      }
      break
    }
  }
  if (personaStart < 0) {
    throw new DshBotError('internal', 'template is missing a persona row')
  }
  let textIndex = -1
  let textIndent = '    '
  let textEnd = personaStart
  for (let i = personaStart; i < personaEnd; i += 1) {
    const match = lines[i]!.match(/^([ \t]*)text:[ \t]*/)
    if (match !== null) {
      textIndex = i
      textIndent = match[1] ?? '    '
      textEnd = i
      const indentLen = textIndent.length
      for (let j = i + 1; j < personaEnd; j += 1) {
        const line = lines[j]!
        if (line.trim() === '') {
          textEnd = j
          continue
        }
        const leading = line.match(/^[ \t]*/)?.[0].length ?? 0
        if (leading > indentLen) {
          textEnd = j
          continue
        }
        break
      }
      break
    }
  }
  if (textIndex < 0) {
    throw new DshBotError('internal', 'template persona row is missing config.text')
  }
  const next = [...lines]
  next.splice(textIndex, textEnd - textIndex + 1, `${textIndent}text: ${yamlPersonaScalar(persona, textIndent)}`)
  return next.join('\n')
}

/**
 * Read persona text from a composition file (quoted scalar or folded/literal block).
 */
export function readPersonaText(source: string): string {
  const lines = source.replaceAll('\r\n', '\n').split('\n')
  let personaEnd = lines.length
  let personaStart = -1
  for (let i = 0; i < lines.length; i += 1) {
    if (/^- id: persona\b/.test(lines[i]!)) {
      personaStart = i
      for (let j = i + 1; j < lines.length; j += 1) {
        if (/^- id: /.test(lines[j]!)) {
          personaEnd = j
          break
        }
      }
      break
    }
  }
  if (personaStart < 0) return ''
  for (let i = personaStart; i < personaEnd; i += 1) {
    const match = lines[i]!.match(/^([ \t]*)text:[ \t]*(.*)$/)
    if (match === null) continue
    const indent = match[1] ?? ''
    const rest = (match[2] ?? '').trimEnd()
    if (rest.startsWith("'") || rest.startsWith('"')) {
      return unquoteScalar(rest)
    }
    if (rest === '>' || rest === '>-' || rest === '|' || rest === '|-') {
      const folded = rest.startsWith('>')
      const collected: string[] = []
      for (let j = i + 1; j < personaEnd; j += 1) {
        const line = lines[j]!
        if (line.trim() === '') {
          collected.push(line)
          continue
        }
        const leading = line.match(/^[ \t]*/)?.[0].length ?? 0
        if (leading <= indent.length) break
        collected.push(line)
      }
      while (collected.length > 0 && collected[collected.length - 1]!.trim() === '') collected.pop()
      let blockIndent = Number.POSITIVE_INFINITY
      for (const line of collected) {
        if (line.trim() === '') continue
        const leading = line.match(/^[ \t]*/)?.[0].length ?? 0
        if (leading < blockIndent) blockIndent = leading
      }
      if (!Number.isFinite(blockIndent)) blockIndent = indent.length + 2
      const body = collected.map(line => line.trim() === '' ? '' : line.slice(blockIndent))
      if (folded) return body.join(' ').replace(/ +/g, ' ').trim()
      return body.join('\n').replace(/\n+$/g, '')
    }
    return unquoteScalar(rest)
  }
  return ''
}

/**
 * Bind `agentPreset.list` through the in-process roster, else apiProxy.
 */
export function createPresetGate(ctx: { get(name: string): unknown }): PresetGate {
  return {
    async list() {
      const service = optionalGet(ctx, 'agentPresets') as {
        list?: () => Promise<readonly { id: string; broken?: string }[]>
      } | undefined
      if (service?.list !== undefined) {
        const rows = await service.list()
        return rows.map(row => row.broken === undefined ? { id: row.id } : { id: row.id, broken: row.broken })
      }
      const api = optionalGet(ctx, 'apiProxy') as {
        agentPresets?: {
          list: (request: { rpcId: string; payload: Record<string, never> }) => Promise<{
            result?: {
              ok?: boolean
              value?: { presets?: readonly { id: string; broken?: string }[] }
              error?: { message?: string }
            }
          }>
        }
      } | undefined
      if (api?.agentPresets?.list === undefined) {
        throw new DshBotError('preset-broken', 'agentPreset.list is unavailable in this composition')
      }
      const response = await api.agentPresets.list({ rpcId: crypto.randomUUID(), payload: {} })
      const result = response.result
      if (result?.ok === false) {
        throw new DshBotError('preset-broken', result.error?.message ?? 'agentPreset.list failed')
      }
      const presets = result?.value?.presets ?? []
      return presets.map(row => row.broken === undefined ? { id: row.id } : { id: row.id, broken: row.broken })
    },
  }
}

/**
 * Construct the registry + factory. All mutating methods share one lock.
 */
export function createBotsRuntime(options: BotsRuntimeOptions): BotsRuntime {
  const homeOf = options.home ?? resolveHome
  const nowOf = options.now ?? Date.now
  let gate = Promise.resolve()
  const withLock = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = gate.then(fn, fn)
    gate = run.then(() => undefined, () => undefined)
    return run
  }

  const listBots = async (): Promise<ListBotsResult> => {
    const home = homeOf()
    const rows = await loadRegistry(home, nowOf)
    const bots: BotView[] = []
    for (const row of rows) {
      bots.push(await toView(home, row))
    }
    return { bots }
  }

  const getBot = async (id: string): Promise<BotView> => {
    const trimmed = id.trim()
    if (trimmed === '') throw new DshBotError('invalid-input', 'bot id is required')
    const home = homeOf()
    const rows = await loadRegistry(home, nowOf)
    const row = rows.find(item => item.id === trimmed)
    if (row === undefined) {
      throw new DshBotError('bot-not-found', `bot ${JSON.stringify(trimmed)} is not in the registry`)
    }
    return toView(home, row)
  }

  const createBot = async (input: CreateBotInput): Promise<BotView> => {
    const home = homeOf()
    const name = normalizeName(input.name)
    const persona = normalizePersona(input.persona)
    const rows = [...await loadRegistry(home, nowOf)]
    const slug = allocateSlug(name, rows, home)
    const presetId = `${MANAGED_PRESET_PREFIX}${slug}`
    const dest = join(presetsRoot(home), presetId)
    const avatar = buildAvatar(slug, input.avatar)
    const modelOverride = normalizeOverride(input.modelOverride)
    const row: BotRegistryRow = {
      id: slug,
      name,
      avatar,
      presetId,
      persona,
      ...modelOverride === undefined ? {} : { modelOverride },
      createdAt: nowOf(),
    }
    try {
      await writePresetDir(home, dest, name, persona)
      await assertPresetHealthy(options.gate, presetId, dest)
      rows.push(row)
      await saveRegistry(home, rows)
    } catch (error) {
      await rm(dest, { recursive: true, force: true })
      throw error
    }
    return toView(home, row)
  }

  const updateBot = async (input: UpdateBotInput): Promise<BotView> => {
    const home = homeOf()
    const id = input.id.trim()
    if (id === '') throw new DshBotError('invalid-input', 'bot id is required')
    const rows = [...await loadRegistry(home, nowOf)]
    const index = rows.findIndex(row => row.id === id)
    if (index < 0) throw new DshBotError('bot-not-found', `bot ${JSON.stringify(id)} is not in the registry`)
    const current = rows[index]!
    const name = input.name === undefined ? current.name : normalizeName(input.name)
    const avatar = input.avatar === undefined
      ? current.avatar
      : buildAvatar(id, {
        color: input.avatar.color ?? current.avatar.color,
        ...nextEmoji(current.avatar.emoji, input.avatar.emoji),
      })
    let modelOverride = current.modelOverride
    if (input.modelOverride === null) modelOverride = undefined
    else if (input.modelOverride !== undefined) modelOverride = normalizeOverride(input.modelOverride)
    const persona = input.persona === undefined
      ? current.persona
      : normalizePersona(input.persona)
    const nextRow: BotRegistryRow = {
      id: current.id,
      name,
      avatar,
      presetId: current.presetId,
      ...persona === undefined ? {} : { persona },
      ...modelOverride === undefined ? {} : { modelOverride },
      createdAt: current.createdAt,
    }
    let restorePreset: (() => Promise<void>) | undefined
    try {
      if (isManagedPreset(current.presetId)) {
        if (input.persona !== undefined || name !== current.name) {
          restorePreset = await rewriteManagedPreset(
            home,
            join(presetsRoot(home), current.presetId),
            current.presetId,
            name,
            input.persona,
            options.gate,
          )
        }
      } else if (input.persona !== undefined) {
        const existing = await readPresetPersona(home, current.presetId)
        if (normalizePersona(input.persona) !== existing) {
          throw new DshBotError(
            'bot-protected',
            'the default bot persona lives in the bundled preset; create a new bot to set a custom persona',
          )
        }
      }
      rows[index] = nextRow
      await saveRegistry(home, rows)
    } catch (error) {
      if (restorePreset !== undefined) await restorePreset()
      throw error
    }
    return toView(home, nextRow)
  }

  const deleteBot = async (input: { id: string }): Promise<DeleteBotResult> => {
    const home = homeOf()
    const id = input.id.trim()
    if (id === '') throw new DshBotError('invalid-input', 'bot id is required')
    if (id === SEED_BOT_ID) {
      throw new DshBotError('bot-protected', 'the default DSH Bot cannot be deleted')
    }
    const rows = [...await loadRegistry(home, nowOf)]
    const current = rows.find(row => row.id === id)
    if (current === undefined) throw new DshBotError('bot-not-found', `bot ${JSON.stringify(id)} is not in the registry`)
    if (isManagedPreset(current.presetId)) {
      await rm(join(presetsRoot(home), current.presetId), { recursive: true, force: true })
    }
    await saveRegistry(home, rows.filter(row => row.id !== id))
    return { id, deleted: true }
  }


  const declineTopic = async (botId: string, topic: string): Promise<BotView> => {
    const home = homeOf()
    const trimmed = botId.trim()
    const text = topic.trim()
    if (trimmed === '') throw new DshBotError('invalid-input', 'bot id is required')
    if (text === '') throw new DshBotError('invalid-input', 'topic is required')
    const rows = await loadRegistry(home, nowOf)
    const index = rows.findIndex(item => item.id === trimmed)
    if (index < 0) throw new DshBotError('bot-not-found', `bot ${JSON.stringify(trimmed)} is not in the registry`)
    const current = rows[index]!
    const declined = [...(current.declined ?? [])]
    if (!declined.includes(text)) declined.push(text)
    const next = { ...current, declined }
    const copy = [...rows]
    copy[index] = next
    await saveRegistry(home, copy)
    return toView(home, next)
  }

  const rewritePresetPersona = async (botId: string, fullText: string): Promise<void> => {
    const home = homeOf()
    const trimmed = botId.trim()
    if (trimmed === '') throw new DshBotError('invalid-input', 'bot id is required')
    const rows = await loadRegistry(home, nowOf)
    const row = rows.find(item => item.id === trimmed)
    if (row === undefined) {
      throw new DshBotError('bot-not-found', `bot ${JSON.stringify(trimmed)} is not in the registry`)
    }
    if (!isManagedPreset(row.presetId)) return
    const dest = join(presetsRoot(home), row.presetId)
    const compositionPath = join(dest, COMPOSITION_FILE)
    let previous = ''
    try {
      previous = await readFile(compositionPath, 'utf8')
    } catch {
      previous = await readFile(join(templateDir(home), COMPOSITION_FILE), 'utf8')
    }
    const next = replacePersonaText(previous, fullText)
    try {
      await mkdir(dest, { recursive: true })
      await writeFile(compositionPath, next, 'utf8')
      await assertPresetHealthy(options.gate, row.presetId, dest)
    } catch (error) {
      if (previous !== '') await writeFile(compositionPath, previous, 'utf8')
      throw error
    }
  }

  return {
    listBots: () => withLock(listBots),
    getBot: id => withLock(() => getBot(id)),
    createBot: input => withLock(() => createBot(input)),
    updateBot: input => withLock(() => updateBot(input)),
    deleteBot: input => withLock(() => deleteBot(input)),
    rewritePresetPersona: (botId, fullText) => withLock(() => rewritePresetPersona(botId, fullText)),
    declineTopic: (botId, topic) => withLock(() => declineTopic(botId, topic)),
  }
}

function pinyinOf(ch: string): string {
  return String(pinyin(ch, { toneType: 'none', type: 'string', v: true }))
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function resolveHome(): string {
  const home = process.env.DSH_HOME?.trim()
  if (home === undefined || home === '') {
    throw new DshBotError('internal', 'DSH_HOME is not set')
  }
  return home
}

function registryPath(home: string): string {
  return join(home, 'dsh-bot', REGISTRY_FILE)
}

function presetsRoot(home: string): string {
  return join(home, '.agent-presets')
}

function templateDir(home: string): string {
  return join(presetsRoot(home), SEED_PRESET_ID)
}

function isManagedPreset(presetId: string): boolean {
  return presetId.startsWith(MANAGED_PRESET_PREFIX)
}

function optionalGet(ctx: { get(name: string): unknown }, name: string): unknown {
  try {
    return ctx.get(name)
  } catch {
    return undefined
  }
}

function assertNoControls(value: string, field: string): void {
  for (const ch of value) {
    const code = ch.charCodeAt(0)
    if (code === 10) continue
    if (code < 32 || code === 127) {
      throw new DshBotError('invalid-input', `${field} contains a control character`)
    }
  }
}

function unquoteScalar(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2) {
    return unescapeSingleQuoted(trimmed.slice(1, -1))
  }
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    return unescapeSingleQuoted(trimmed.slice(1, -1).replaceAll('\\"', '"'))
  }
  return trimmed
}

function unescapeSingleQuoted(body: string): string {
  return body.replaceAll("''", "'")
}

function nextEmoji(
  current: string | undefined,
  incoming: string | undefined,
): { emoji?: string } {
  if (incoming === undefined) {
    return current === undefined ? {} : { emoji: current }
  }
  const trimmed = incoming.trim()
  return trimmed === '' ? {} : { emoji: trimmed }
}

function normalizeName(raw: string): string {
  const name = raw.trim()
  if (name === '') throw new DshBotError('invalid-input', 'name is required')
  if ([...name].length > NAME_MAX) throw new DshBotError('invalid-input', `name must be at most ${NAME_MAX} characters`)
  if (name.includes('/') || name.includes('\\') || name.includes('\0')) {
    throw new DshBotError('invalid-input', 'name contains an illegal character')
  }
  assertNoControls(name, 'name')
  return name
}

function normalizePersona(raw: string): string {
  const persona = raw.replaceAll('\r\n', '\n').replaceAll('\r', '\n').trim()
  if (persona === '') throw new DshBotError('invalid-input', 'persona is required')
  if ([...persona].length > PERSONA_MAX) {
    throw new DshBotError('invalid-input', `persona must be at most ${PERSONA_MAX} characters`)
  }
  assertNoControls(persona, 'persona')
  return persona
}

function normalizeOverride(value: DshBotModelRef | undefined): DshBotModelRef | undefined {
  if (value === undefined) return undefined
  const provider = value.provider.trim()
  const model = value.model.trim()
  if (provider === '' && model === '') return undefined
  if (provider === '' || model === '') {
    throw new DshBotError('invalid-input', 'modelOverride needs both provider and model (empty follows global)')
  }
  const effort = value.reasoningEffort?.trim()
  return effort === undefined || effort === ''
    ? { provider, model }
    : { provider, model, reasoningEffort: effort }
}

function buildAvatar(
  botId: string,
  input: { readonly emoji?: string; readonly color?: string } | undefined,
): BotAvatar {
  const colorRaw = input?.color?.trim()
  const color = colorRaw === undefined || colorRaw === '' ? hashAvatarColor(botId) : colorRaw
  if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
    throw new DshBotError('invalid-input', 'avatar color must be a #RRGGBB hex')
  }
  const emoji = input?.emoji?.trim()
  if (emoji === undefined || emoji === '') return { color }
  if ([...emoji].length > EMOJI_MAX) throw new DshBotError('invalid-input', 'emoji is too long')
  assertNoControls(emoji, 'emoji')
  return { color, emoji }
}

function allocateSlug(name: string, rows: readonly BotRegistryRow[], home: string): string {
  const base = slugifyName(name)
  let slug = base
  let n = 2
  while (slugTaken(slug, rows, home)) {
    slug = `${base}-${n}`
    n += 1
  }
  return slug
}

function slugTaken(slug: string, rows: readonly BotRegistryRow[], home: string): boolean {
  if (slug === SEED_BOT_ID || slug === SEED_PRESET_ID) return true
  const presetId = `${MANAGED_PRESET_PREFIX}${slug}`
  if (rows.some(row => row.id === slug || row.presetId === presetId)) return true
  return existsSync(join(presetsRoot(home), presetId))
}

async function loadRegistry(home: string, now: () => number): Promise<BotRegistryRow[]> {
  const file = registryPath(home)
  await mkdir(join(home, 'dsh-bot'), { recursive: true })
  if (!existsSync(file)) {
    const seed = await seedRow(home, now)
    await saveRegistry(home, [seed])
    return [seed]
  }
  let raw: string
  try {
    raw = await readFile(file, 'utf8')
  } catch (error) {
    throw new DshBotError('registry-corrupt', `cannot read bots.json: ${error instanceof Error ? error.message : String(error)}`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    throw new DshBotError('registry-corrupt', 'bots.json is not valid JSON')
  }
  const rows = parseRegistry(parsed)
  if (!rows.some(row => row.id === SEED_BOT_ID)) {
    const next = [await seedRow(home, now), ...rows]
    await saveRegistry(home, next)
    return next
  }
  return rows
}

function parseRegistry(value: unknown): BotRegistryRow[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new DshBotError('registry-corrupt', 'bots.json must be an object')
  }
  const rec = value as { version?: unknown; bots?: unknown }
  if (rec.version !== 1) {
    throw new DshBotError('registry-corrupt', 'bots.json version is not 1')
  }
  if (!Array.isArray(rec.bots)) {
    throw new DshBotError('registry-corrupt', 'bots.json is missing bots[]')
  }
  return rec.bots.map((item, index) => parseRow(item, index))
}

function parseRow(value: unknown, index: number): BotRegistryRow {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new DshBotError('registry-corrupt', `bots.json bots[${index}] is not an object`)
  }
  const rec = value as Record<string, unknown>
  const id = typeof rec.id === 'string' ? rec.id : ''
  const name = typeof rec.name === 'string' ? rec.name : ''
  const presetId = typeof rec.presetId === 'string' ? rec.presetId : ''
  const createdAt = typeof rec.createdAt === 'number' && Number.isFinite(rec.createdAt) ? rec.createdAt : Number.NaN
  if (id === '' || name === '' || presetId === '' || Number.isNaN(createdAt)) {
    throw new DshBotError('registry-corrupt', `bots.json bots[${index}] is missing id/name/presetId/createdAt`)
  }
  const avatarRaw = rec.avatar
  if (typeof avatarRaw !== 'object' || avatarRaw === null || Array.isArray(avatarRaw)) {
    throw new DshBotError('registry-corrupt', `bots.json bots[${index}] avatar is invalid`)
  }
  const avatarRec = avatarRaw as Record<string, unknown>
  const color = typeof avatarRec.color === 'string' ? avatarRec.color : hashAvatarColor(id)
  const emoji = typeof avatarRec.emoji === 'string' && avatarRec.emoji.trim() !== '' ? avatarRec.emoji : undefined
  const avatar: BotAvatar = emoji === undefined ? { color } : { color, emoji }
  const modelOverride = rec.modelOverride === undefined ? undefined : normalizeOverride(asModel(rec.modelOverride))
  const persona = typeof rec.persona === 'string' && rec.persona.trim() !== '' ? rec.persona : undefined
  const declined = Array.isArray(rec.declined)
    ? rec.declined.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
    : undefined
  return {
    id,
    name,
    avatar,
    presetId,
    ...persona === undefined ? {} : { persona },
    ...declined === undefined || declined.length === 0 ? {} : { declined },
    ...modelOverride === undefined ? {} : { modelOverride },
    createdAt,
  }
}

function asModel(value: unknown): DshBotModelRef {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new DshBotError('registry-corrupt', 'modelOverride is not an object')
  }
  const rec = value as Record<string, unknown>
  return {
    provider: typeof rec.provider === 'string' ? rec.provider : '',
    model: typeof rec.model === 'string' ? rec.model : '',
    ...typeof rec.reasoningEffort === 'string' ? { reasoningEffort: rec.reasoningEffort } : {},
  }
}

async function seedRow(home: string, now: () => number): Promise<BotRegistryRow> {
  let name = 'DSH Bot'
  try {
    const raw = await readFile(join(templateDir(home), METADATA_FILE), 'utf8')
    const match = raw.match(/^name:\s*(.*)$/m)
    const fromFile = match === null ? undefined : unquoteScalar(match[1] ?? '').trim()
    if (fromFile !== undefined && fromFile !== '') name = fromFile
  } catch {
    // bundled metadata is optional; the seed name stays DSH Bot
  }
  return {
    id: SEED_BOT_ID,
    name,
    avatar: { color: hashAvatarColor(SEED_BOT_ID) },
    presetId: SEED_PRESET_ID,
    createdAt: now(),
  }
}

async function saveRegistry(home: string, bots: readonly BotRegistryRow[]): Promise<void> {
  const dir = join(home, 'dsh-bot')
  await mkdir(dir, { recursive: true })
  const file = registryPath(home)
  const body: RegistryFile = { version: 1, bots }
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  await writeFile(tmp, `${JSON.stringify(body, null, 2)}\n`, 'utf8')
  await rename(tmp, file)
}

async function readPresetPersona(home: string, presetId: string): Promise<string> {
  try {
    return readPersonaText(await readFile(join(presetsRoot(home), presetId, COMPOSITION_FILE), 'utf8'))
  } catch {
    return ''
  }
}

async function toView(home: string, row: BotRegistryRow): Promise<BotView> {
  return {
    ...row,
    persona: row.persona ?? stripMemorySection(await readPresetPersona(home, row.presetId)),
    protected: row.id === SEED_BOT_ID,
  }
}

async function writePresetDir(home: string, dest: string, name: string, persona: string): Promise<void> {
  const source = join(templateDir(home), COMPOSITION_FILE)
  let raw: string
  try {
    raw = await readFile(source, 'utf8')
  } catch (error) {
    throw new DshBotError(
      'internal',
      `cannot read template ${source}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  const composition = replacePersonaText(raw, persona)
  await mkdir(dest, { recursive: true })
  await writeFile(join(dest, COMPOSITION_FILE), composition, 'utf8')
  const description = persona.split('\n')[0]?.slice(0, 80)
  const meta = [
    `name: ${yamlSingleQuote(name)}`,
    ...description === undefined || description === '' ? [] : [`description: ${yamlSingleQuote(description)}`],
    '',
  ].join('\n')
  await writeFile(join(dest, METADATA_FILE), meta, 'utf8')
}

async function rewriteManagedPreset(
  home: string,
  dest: string,
  presetId: string,
  name: string,
  persona: string | undefined,
  gate: PresetGate,
): Promise<() => Promise<void>> {
  const compositionPath = join(dest, COMPOSITION_FILE)
  const metaPath = join(dest, METADATA_FILE)
  let previousComposition = ''
  let previousMeta = ''
  try {
    previousComposition = await readFile(compositionPath, 'utf8')
    previousMeta = await readFile(metaPath, 'utf8')
  } catch {
    previousComposition = await readFile(join(templateDir(home), COMPOSITION_FILE), 'utf8')
  }
  const restore = async (): Promise<void> => {
    await mkdir(dest, { recursive: true })
    if (previousComposition !== '') await writeFile(compositionPath, previousComposition, 'utf8')
    if (previousMeta !== '') await writeFile(metaPath, previousMeta, 'utf8')
  }
  const nextPersona = persona === undefined ? readPersonaText(previousComposition) : normalizePersona(persona)
  try {
    await writePresetDir(home, dest, name, nextPersona)
    await assertPresetHealthy(gate, presetId, dest)
  } catch (error) {
    await restore()
    throw error
  }
  return restore
}

async function assertPresetHealthy(gate: PresetGate, presetId: string, dest: string): Promise<void> {
  let rows: readonly PresetListEntry[]
  try {
    rows = await gate.list()
  } catch (error) {
    throw new DshBotError(
      'preset-broken',
      `agentPreset.list failed after writing ${presetId}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    )
  }
  const hit = rows.find(row => row.id === presetId)
  if (hit === undefined) {
    throw new DshBotError('preset-broken', `agentPreset.list does not contain ${presetId}`)
  }
  if (hit.broken !== undefined && hit.broken !== '') {
    throw new DshBotError('preset-broken', `preset ${presetId} is broken: ${hit.broken}`)
  }
  if (!existsSync(join(dest, COMPOSITION_FILE))) {
    throw new DshBotError('preset-broken', `preset directory ${dest} is missing ${COMPOSITION_FILE}`)
  }
}


