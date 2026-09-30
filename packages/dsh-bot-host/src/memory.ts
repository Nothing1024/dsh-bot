/**
 * Per-bot durable memory under $DSH_HOME/dsh-bot/memory/<botId>/.
 * profile.md is long-term facts; log.jsonl is dated log/note rows.
 */

import { appendFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export const MEMORY_HEADING = '## 你记得的事'
export const DEFAULT_MEMORY_MAX_CHARS = 4000
export const DEFAULT_MEMORY_MAX_LOG = 20

export type MemorySource = 'auto' | 'explicit'
export type MemoryLogKind = 'log' | 'note'

export interface MemoryProfileEntry {
  readonly id: string
  readonly ts: number
  readonly text: string
}

export interface MemoryLogEntry {
  readonly id: string
  readonly ts: number
  readonly kind: MemoryLogKind
  readonly text: string
  readonly source: MemorySource
  readonly sessionId?: string
  readonly tombstone?: boolean
}

export interface AppendLogInput {
  readonly kind: MemoryLogKind
  readonly text: string
  readonly source: MemorySource
  readonly sessionId?: string
}

export interface RenderMemoryOptions {
  readonly maxChars?: number
  readonly maxLog?: number
}

export interface MemoryListView {
  readonly profile: readonly MemoryProfileEntry[]
  readonly log: readonly MemoryLogEntry[]
}

export interface MemoryStore {
  dir(botId: string): string
  readProfile(botId: string): Promise<MemoryProfileEntry[]>
  appendProfile(botId: string, text: string): Promise<MemoryProfileEntry>
  readLog(botId: string): Promise<MemoryLogEntry[]>
  appendLog(botId: string, input: AppendLogInput): Promise<MemoryLogEntry>
  tombstone(botId: string, id: string): Promise<MemoryLogEntry>
  clear(botId: string): Promise<void>
  remove(botId: string): Promise<void>
  list(botId: string): Promise<MemoryListView>
}

const PROFILE_FILE = 'profile.md'
const LOG_FILE = 'log.jsonl'
const META_RE = /^<!-- dsh-mem (\S+) (\d+) -->$/
const GREETINGS = new Set([
  '谢谢',
  '谢谢你',
  '谢谢啦',
  '多谢',
  '好的',
  '好',
  '收到',
  '哈哈',
  '嗯',
  '嗯嗯',
  'ok',
  'okay',
  'thanks',
  'thx',
  'ty',
])

export function createMemoryStore(
  home: string | (() => string),
  options: { now?: () => number; random?: () => string } = {},
): MemoryStore {
  const homeOf = typeof home === 'function' ? home : () => home
  const nowOf = options.now ?? Date.now
  const randomOf = options.random ?? randomId

  const dir = (botId: string): string => join(homeOf(), 'dsh-bot', 'memory', normalizeBotId(botId))

  const readProfile = async (botId: string): Promise<MemoryProfileEntry[]> => {
    const raw = await readOptional(join(dir(botId), PROFILE_FILE))
    return parseProfile(raw)
  }

  const writeProfile = async (botId: string, rows: readonly MemoryProfileEntry[]): Promise<void> => {
    await ensureDir(dir(botId))
    await writeFile(join(dir(botId), PROFILE_FILE), serializeProfile(rows), 'utf8')
  }

  const readLog = async (botId: string): Promise<MemoryLogEntry[]> => {
    const raw = await readOptional(join(dir(botId), LOG_FILE))
    return parseLog(raw)
  }

  const writeLog = async (botId: string, rows: readonly MemoryLogEntry[]): Promise<void> => {
    await ensureDir(dir(botId))
    await writeFile(join(dir(botId), LOG_FILE), serializeLog(rows), 'utf8')
  }

  const appendProfile = async (botId: string, text: string): Promise<MemoryProfileEntry> => {
    const trimmed = text.trim()
    if (trimmed === '') throw new Error('profile text is required')
    const rows = await readProfile(botId)
    const existing = rows.find(row => row.text === trimmed)
    if (existing !== undefined) return existing
    const entry: MemoryProfileEntry = {
      id: makeId(nowOf(), randomOf),
      ts: nowOf(),
      text: trimmed,
    }
    await writeProfile(botId, [...rows, entry])
    return entry
  }

  const appendLog = async (botId: string, input: AppendLogInput): Promise<MemoryLogEntry> => {
    const text = input.text.trim()
    if (text === '') throw new Error('log text is required')
    const entry: MemoryLogEntry = {
      id: makeId(nowOf(), randomOf),
      ts: nowOf(),
      kind: input.kind,
      text,
      source: input.source,
      ...input.sessionId === undefined || input.sessionId.trim() === ''
        ? {}
        : { sessionId: input.sessionId.trim() },
    }
    await ensureDir(dir(botId))
    await appendFile(join(dir(botId), LOG_FILE), serializeLog([entry]), 'utf8')
    return entry
  }

  const tombstone = async (botId: string, id: string): Promise<MemoryLogEntry> => {
    const token = id.trim()
    if (token === '') throw new Error('memory id is required')
    const logs = await readLog(botId)
    const hit = logs.find(row => row.id === token)
    if (hit !== undefined) {
      if (hit.tombstone === true) return hit
      const next: MemoryLogEntry = { ...hit, tombstone: true }
      await writeLog(botId, logs.map(row => row.id === token ? next : row))
      return next
    }
    const profiles = await readProfile(botId)
    const profile = profiles.find(row => row.id === token)
    if (profile === undefined) throw new Error(`memory row ${JSON.stringify(token)} not found`)
    await writeProfile(botId, profiles.filter(row => row.id !== token))
    const moved: MemoryLogEntry = {
      id: profile.id,
      ts: nowOf(),
      kind: 'note',
      text: profile.text,
      source: 'auto',
      tombstone: true,
    }
    await writeLog(botId, [...logs, moved])
    return moved
  }

  const clear = async (botId: string): Promise<void> => {
    await ensureDir(dir(botId))
    await writeProfile(botId, [])
    await writeLog(botId, [])
  }

  const remove = async (botId: string): Promise<void> => {
    await rm(dir(botId), { recursive: true, force: true })
  }

  const list = async (botId: string): Promise<MemoryListView> => {
    const profile = await readProfile(botId)
    const log = (await readLog(botId)).filter(row => row.tombstone !== true)
    return { profile, log }
  }

  return { dir, readProfile, appendProfile, readLog, appendLog, tombstone, clear, remove, list }
}

/**
 * Skip extraction for greeting-only turns (word list, or short no-question
 * messages whose every token is a greeting). A short fact or any question
 * still extracts — otherwise UF-801's "我叫 Nothing，术语保留英文" would drop.
 */
export function shouldExtract(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed === '') return false
  if (GREETINGS.has(normalizeGreeting(trimmed))) return false
  if (trimmed.length < 40 && !/[?？]/.test(trimmed) && isGreetingTokens(trimmed)) return false
  return true
}

/**
 * Injected persona tail. Empty memory → empty string (caller writes base only).
 * Over budget drops oldest live logs first; leftover overflow is sliced.
 */
/**
 * Single persona composer (BR-102). Order is fixed: base + memory + behavior.
 * Later packages may pass `behavior`; they must not rewrite this function.
 */
export function stripMemorySection(persona: string): string {
  const headings = ['## 你记得的事', '## 行为规范']
  let cut = -1
  for (const heading of headings) {
    if (persona.startsWith(heading)) return ''
    const idx = persona.indexOf(`\n${heading}`)
    if (idx >= 0 && (cut < 0 || idx < cut)) cut = idx
  }
  if (cut >= 0) return persona.slice(0, cut).replace(/\s+$/u, '')
  return persona
}

export function composePersona(
  base: string,
  extras: { readonly memory?: string; readonly behavior?: string } = {},
): string {
  const chunks = [base.replace(/\s+$/u, '')]
  const memory = extras.memory?.trim()
  if (memory !== undefined && memory !== '') chunks.push(memory)
  const behavior = extras.behavior?.trim()
  if (behavior !== undefined && behavior !== '') chunks.push(behavior)
  return chunks.join('\n\n')
}

export function renderMemorySection(
  profile: readonly MemoryProfileEntry[],
  log: readonly MemoryLogEntry[],
  options: RenderMemoryOptions = {},
): string {
  const maxChars = options.maxChars ?? DEFAULT_MEMORY_MAX_CHARS
  const maxLog = options.maxLog ?? DEFAULT_MEMORY_MAX_LOG
  const live = log.filter(row => row.tombstone !== true)
  let picked = live.slice(-maxLog)
  if (profile.length === 0 && picked.length === 0) return ''

  const render = (logs: readonly MemoryLogEntry[]): string => {
    const parts = [MEMORY_HEADING]
    if (profile.length > 0) {
      parts.push('', '长期事实：', ...profile.map(row => `- ${row.text}`))
    }
    if (logs.length > 0) {
      parts.push('', '近期记录：', ...logs.map(row => `- ${row.text}`))
    }
    return parts.join('\n')
  }

  let text = render(picked)
  while (text.length > maxChars && picked.length > 0) {
    picked = picked.slice(1)
    text = render(picked)
  }
  if (text.length <= maxChars) return text
  return text.slice(0, maxChars)
}

export function parseProfile(raw: string): MemoryProfileEntry[] {
  if (raw.trim() === '') return []
  const lines = raw.replaceAll('\r\n', '\n').split('\n')
  const out: MemoryProfileEntry[] = []
  let pending: { id: string; ts: number } | undefined
  for (const line of lines) {
    const meta = META_RE.exec(line.trim())
    if (meta !== null) {
      pending = { id: meta[1]!, ts: Number(meta[2]) }
      continue
    }
    const bullet = line.match(/^- (.+)$/)
    if (bullet === null) continue
    const text = bullet[1]!.trim()
    if (text === '') continue
    const id = pending?.id ?? `p-${hashText(text)}`
    const ts = pending?.ts ?? 0
    pending = undefined
    if (out.some(row => row.text === text)) continue
    out.push({ id, ts, text })
  }
  return out
}

export function serializeProfile(rows: readonly MemoryProfileEntry[]): string {
  if (rows.length === 0) return ''
  return `${rows.map(row => `<!-- dsh-mem ${row.id} ${row.ts} -->\n- ${row.text}`).join('\n')}\n`
}

export function parseLog(raw: string): MemoryLogEntry[] {
  if (raw.trim() === '') return []
  const out: MemoryLogEntry[] = []
  for (const line of raw.replaceAll('\r\n', '\n').split('\n')) {
    if (line.trim() === '') continue
    try {
      const value = JSON.parse(line) as Record<string, unknown>
      const parsed = parseLogRow(value)
      if (parsed !== undefined) out.push(parsed)
    } catch {
      // skip a corrupt line; the rest of the log stays usable
    }
  }
  return out
}

export function serializeLog(rows: readonly MemoryLogEntry[]): string {
  if (rows.length === 0) return ''
  return `${rows.map(row => JSON.stringify(row)).join('\n')}\n`
}

function parseLogRow(value: Record<string, unknown>): MemoryLogEntry | undefined {
  if (typeof value.id !== 'string' || value.id.trim() === '') return undefined
  if (typeof value.ts !== 'number' || !Number.isFinite(value.ts)) return undefined
  if (value.kind !== 'log' && value.kind !== 'note') return undefined
  if (typeof value.text !== 'string' || value.text.trim() === '') return undefined
  if (value.source !== 'auto' && value.source !== 'explicit') return undefined
  return {
    id: value.id,
    ts: value.ts,
    kind: value.kind,
    text: value.text,
    source: value.source,
    ...typeof value.sessionId === 'string' && value.sessionId.trim() !== ''
      ? { sessionId: value.sessionId }
      : {},
    ...value.tombstone === true ? { tombstone: true } : {},
  }
}

function normalizeBotId(botId: string): string {
  const trimmed = botId.trim()
  if (trimmed === '') throw new Error('bot id is required')
  return trimmed
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 8)
}

function makeId(ts: number, randomOf: () => string): string {
  return `${ts}-${randomOf()}`
}

async function readOptional(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return ''
    throw error
  }
}

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
}

function normalizeGreeting(text: string): string {
  return text.trim().toLowerCase().replace(/[。.!！,，、\s]+$/u, '')
}

function isGreetingTokens(text: string): boolean {
  const tokens = text
    .split(/[\s,，。.!！、]+/u)
    .map(token => normalizeGreeting(token))
    .filter(token => token !== '')
  return tokens.length > 0 && tokens.every(token => GREETINGS.has(token))
}

function hashText(text: string): string {
  let hash = 0
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 33 + text.charCodeAt(i)) >>> 0
  }
  return hash.toString(16)
}
