/**
 * Bot registry ($DSH_HOME/dsh-bot/bots.json). Persona lives only here.
 * Sessions are ordinary session-tool sessions; voice is wrapped at write time.
 * `presetId` is a wire alias of `id` so leftover GUI sessions can still match.
 * @module dsh-bot-host/bots
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pinyin } from 'pinyin-pro'
import { DshBotError } from './errors.ts'
import { botLayoutFrom } from './roster-layout.ts'
import type { DshBotModelRef } from './platform.ts'

/** Seed bot id, deletion-protected. */
export const SEED_BOT_ID = 'dsh-bot'
/** Wire alias kept so leftover GUI sessions that stored `agentPreset: dsh-bot` still match. */
export const SEED_PRESET_ID = 'dsh-bot'
/** Historical prefix of managed DSH presets; still used as the wire alias for custom bots. */
export const MANAGED_PRESET_PREFIX = 'dsh-bot--'

const REGISTRY_FILE = 'bots.json'
const NAME_MAX = 64
const PERSONA_MAX = 16_000
const EMOJI_MAX = 16

/** Seed bot base persona; also used by v1 `dsh_bot_ask`. */
export const SEED_PERSONA = '你是 DSH Bot，运行在本机 DSH 插件环境里的常驻对话助手。说话直率，先查证再下结论，不确定就明说不知道，不要编造。当前模型是 {{model}}，工作区是 {{cwd}}。你不是任何外部品牌或桌面产品的复刻。优先把事情做对，其次才简洁。'

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
  readonly persona: string
  readonly declined?: readonly string[]
  readonly modelOverride?: DshBotModelRef
  readonly createdAt: number
  readonly pinned: boolean
  readonly section: string
  readonly hidden: boolean
  readonly order: number
  readonly muted: boolean
}

/** Wire view: registry fields plus `protected`. */
export interface BotView extends BotRegistryRow {
  readonly protected: boolean
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
  declineTopic(botId: string, topic: string): Promise<BotView>
  updateLayout(updates: readonly BotLayoutUpdate[]): Promise<{ ok: true; skipped: string[] }>
}

export interface BotLayoutUpdate {
  readonly id: string
  readonly pinned?: boolean
  readonly section?: string
  readonly hidden?: boolean
  readonly order?: number
  readonly muted?: boolean
}

export interface BotsRuntimeOptions {
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
 * Slug for a bot id. ASCII words stay hyphenated; CJK runs are pinyin with
 * syllables grouped in pairs (`诗人小北` → `shiren-xiaobei`).
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
 * Wire alias for leftover GUI sessions: seed stays `dsh-bot`, custom bots
 * stay `dsh-bot--<id>` so `session.list.agentPreset` reverse-lookup still works.
 */
export function aliasPresetId(botId: string): string {
  return botId === SEED_BOT_ID ? SEED_PRESET_ID : `${MANAGED_PRESET_PREFIX}${botId}`
}

/**
 * Construct the registry. All mutating methods share one lock.
 */
export function createBotsRuntime(options: BotsRuntimeOptions = {}): BotsRuntime {
  const homeOf = options.home ?? resolveHome
  const nowOf = options.now ?? Date.now
  let gate = Promise.resolve()
  const withLock = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = gate.then(fn, fn)
    gate = run.then(() => undefined, () => undefined)
    return run
  }

  const listBots = async (): Promise<ListBotsResult> => {
    const rows = await loadRegistry(homeOf(), nowOf)
    return { bots: rows.map(toView) }
  }

  const getBot = async (id: string): Promise<BotView> => {
    const trimmed = id.trim()
    if (trimmed === '') throw new DshBotError('invalid-input', 'bot id is required')
    const rows = await loadRegistry(homeOf(), nowOf)
    const row = rows.find(item => item.id === trimmed)
    if (row === undefined) {
      throw new DshBotError('bot-not-found', `bot ${JSON.stringify(trimmed)} is not in the registry`)
    }
    return toView(row)
  }

  const createBot = async (input: CreateBotInput): Promise<BotView> => {
    const name = normalizeName(input.name)
    const persona = normalizePersona(input.persona)
    const rows = [...await loadRegistry(homeOf(), nowOf)]
    const slug = allocateSlug(name, rows)
    const avatar = buildAvatar(slug, input.avatar)
    const modelOverride = normalizeOverride(input.modelOverride)
    const createdAt = nowOf()
    const row: BotRegistryRow = {
      id: slug,
      name,
      avatar,
      presetId: aliasPresetId(slug),
      persona,
      ...modelOverride === undefined ? {} : { modelOverride },
      createdAt,
      pinned: false,
      section: 'work',
      hidden: false,
      order: createdAt,
      muted: false,
    }
    rows.push(row)
    await saveRegistry(homeOf(), rows)
    return toView(row)
  }

  const updateBot = async (input: UpdateBotInput): Promise<BotView> => {
    const id = input.id.trim()
    if (id === '') throw new DshBotError('invalid-input', 'bot id is required')
    const rows = [...await loadRegistry(homeOf(), nowOf)]
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
      persona,
      ...current.declined === undefined || current.declined.length === 0 ? {} : { declined: current.declined },
      ...modelOverride === undefined ? {} : { modelOverride },
      createdAt: current.createdAt,
      pinned: current.pinned,
      section: current.section,
      hidden: current.hidden,
      order: current.order,
      muted: current.muted,
    }
    rows[index] = nextRow
    await saveRegistry(homeOf(), rows)
    return toView(nextRow)
  }

  const deleteBot = async (input: { id: string }): Promise<DeleteBotResult> => {
    const id = input.id.trim()
    if (id === '') throw new DshBotError('invalid-input', 'bot id is required')
    if (id === SEED_BOT_ID) {
      throw new DshBotError('bot-protected', 'the default DSH Bot cannot be deleted')
    }
    const rows = [...await loadRegistry(homeOf(), nowOf)]
    const current = rows.find(row => row.id === id)
    if (current === undefined) throw new DshBotError('bot-not-found', `bot ${JSON.stringify(id)} is not in the registry`)
    await saveRegistry(homeOf(), rows.filter(row => row.id !== id))
    return { id, deleted: true }
  }

  const declineTopic = async (botId: string, topic: string): Promise<BotView> => {
    const trimmed = botId.trim()
    const text = topic.trim()
    if (trimmed === '') throw new DshBotError('invalid-input', 'bot id is required')
    if (text === '') throw new DshBotError('invalid-input', 'topic is required')
    const rows = await loadRegistry(homeOf(), nowOf)
    const index = rows.findIndex(item => item.id === trimmed)
    if (index < 0) throw new DshBotError('bot-not-found', `bot ${JSON.stringify(trimmed)} is not in the registry`)
    const current = rows[index]!
    const declined = [...(current.declined ?? [])]
    if (!declined.includes(text)) declined.push(text)
    const next = { ...current, declined }
    const copy = [...rows]
    copy[index] = next
    await saveRegistry(homeOf(), copy)
    return toView(next)
  }

  const updateLayout = async (updates: readonly BotLayoutUpdate[]): Promise<{ ok: true; skipped: string[] }> => {
    const rows = [...await loadRegistry(homeOf(), nowOf)]
    const skipped: string[] = []
    for (const patch of updates) {
      const id = patch.id.trim()
      const index = rows.findIndex(row => row.id === id)
      if (index < 0) {
        skipped.push(id)
        continue
      }
      const current = rows[index]!
      rows[index] = {
        ...current,
        pinned: patch.pinned ?? current.pinned,
        section: patch.section?.trim() || current.section,
        hidden: patch.hidden ?? current.hidden,
        order: patch.order ?? current.order,
        muted: patch.muted ?? current.muted,
      }
    }
    await saveRegistry(homeOf(), rows)
    return { ok: true, skipped }
  }

  return {
    listBots: () => withLock(listBots),
    getBot: id => withLock(() => getBot(id)),
    createBot: input => withLock(() => createBot(input)),
    updateBot: input => withLock(() => updateBot(input)),
    deleteBot: input => withLock(() => deleteBot(input)),
    declineTopic: (botId, topic) => withLock(() => declineTopic(botId, topic)),
    updateLayout: updates => withLock(() => updateLayout(updates)),
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

function assertNoControls(value: string, field: string): void {
  for (const ch of value) {
    const code = ch.charCodeAt(0)
    if (code === 10) continue
    if (code < 32 || code === 127) {
      throw new DshBotError('invalid-input', `${field} contains a control character`)
    }
  }
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

function allocateSlug(name: string, rows: readonly BotRegistryRow[]): string {
  const base = slugifyName(name)
  let slug = base
  let n = 2
  while (slugTaken(slug, rows)) {
    slug = `${base}-${n}`
    n += 1
  }
  return slug
}

function slugTaken(slug: string, rows: readonly BotRegistryRow[]): boolean {
  if (slug === SEED_BOT_ID) return true
  return rows.some(row => row.id === slug)
}

async function loadRegistry(home: string, now: () => number): Promise<BotRegistryRow[]> {
  const file = registryPath(home)
  await mkdir(join(home, 'dsh-bot'), { recursive: true })
  try {
    const raw = await readFile(file, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    const rows = parseRegistry(parsed)
    if (!rows.some(row => row.id === SEED_BOT_ID)) {
      const next = [seedRow(now), ...rows]
      await saveRegistry(home, next)
      return next
    }
    return rows
  } catch (error) {
    if (error instanceof DshBotError) throw error
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      const seed = seedRow(now)
      await saveRegistry(home, [seed])
      return [seed]
    }
    if (error instanceof SyntaxError) {
      throw new DshBotError('registry-corrupt', 'bots.json is not valid JSON')
    }
    throw new DshBotError('registry-corrupt', `cannot read bots.json: ${error instanceof Error ? error.message : String(error)}`)
  }
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
  const createdAt = typeof rec.createdAt === 'number' && Number.isFinite(rec.createdAt) ? rec.createdAt : Number.NaN
  if (id === '' || name === '' || Number.isNaN(createdAt)) {
    throw new DshBotError('registry-corrupt', `bots.json bots[${index}] is missing id/name/createdAt`)
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
  const persona = typeof rec.persona === 'string' && rec.persona.trim() !== ''
    ? rec.persona
    : id === SEED_BOT_ID ? SEED_PERSONA : ''
  if (persona === '') {
    throw new DshBotError('registry-corrupt', `bots.json bots[${index}] is missing persona`)
  }
  const declined = Array.isArray(rec.declined)
    ? rec.declined.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
    : undefined
  const storedPreset = typeof rec.presetId === 'string' && rec.presetId.trim() !== ''
    ? rec.presetId
    : aliasPresetId(id)
  return {
    id,
    name,
    avatar,
    presetId: storedPreset,
    persona,
    ...declined === undefined || declined.length === 0 ? {} : { declined },
    ...modelOverride === undefined ? {} : { modelOverride },
    createdAt,
    ...botLayoutFrom(rec, createdAt),
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

function seedRow(now: () => number): BotRegistryRow {
  const createdAt = now()
  return {
    id: SEED_BOT_ID,
    pinned: false,
    section: 'work',
    hidden: false,
    muted: false,
    name: 'DSH Bot',
    avatar: { color: hashAvatarColor(SEED_BOT_ID) },
    presetId: SEED_PRESET_ID,
    persona: SEED_PERSONA,
    createdAt,
    order: createdAt,
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

function toView(row: BotRegistryRow): BotView {
  return {
    ...row,
    protected: row.id === SEED_BOT_ID,
  }
}
