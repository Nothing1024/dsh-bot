/**
 * Group registry ($DSH_HOME/dsh-bot/groups.json) and room jsonl files.
 * Groups have no preset / persona; members are existing 1:1 bot ids (BR-301).
 * @module dsh-bot-host/groups
 */

import { existsSync } from 'node:fs'
import { appendFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DshBotError } from './errors.ts'
import { slugifyName } from './bots.ts'
import { groupLayoutFrom } from './roster-layout.ts'

export const GROUP_MEMBER_MIN = 2
export const GROUP_MEMBER_MAX = 6
/** 0 = keep going until a round has no visible member line. */
export const GROUP_ROUNDS_INFINITE = 0
export const GROUP_ROUNDS_DEFAULT = 3
export const GROUP_ROUNDS_MAX = 99
const NAME_MAX = 64
const REGISTRY_FILE = 'groups.json'
const ROOMS_INDEX_FILE = 'rooms.json'
const ROOMS_DIR = 'rooms'

export interface GroupRegistryRow {
  readonly id: string
  readonly name: string
  readonly memberIds: readonly string[]
  readonly createdAt: number
  readonly section: string
  readonly order: number
  readonly rounds: number
}

export interface GroupView extends GroupRegistryRow {}

export interface CreateGroupInput {
  readonly name: string
  readonly memberIds: readonly string[]
  readonly rounds?: number
}

export interface UpdateGroupInput {
  readonly id: string
  readonly name?: string
  readonly memberIds?: readonly string[]
  readonly rounds?: number
}

export interface ListGroupsResult {
  readonly groups: readonly GroupView[]
}

export interface DeleteGroupResult {
  readonly id: string
  readonly deleted: true
}

export interface GroupRoomRow {
  readonly title?: string
  readonly roomId: string
  readonly groupId: string
  readonly createdAt: number
  readonly updatedAt: number
  readonly working?: boolean
}

export interface ListGroupRoomsResult {
  readonly rooms: readonly GroupRoomRow[]
}

export type RoomSpeaker =
  | { readonly kind: 'user' }
  | { readonly kind: 'member'; readonly botId: string }
  | { readonly kind: 'error'; readonly botId: string; readonly code: string }
  /** Host anchor line (continue discussion). Never shown to members as `用户:`. */
  | { readonly kind: 'system' }

export interface RoomMessage {
  readonly cancelledAt?: number
  readonly requestId?: string
  readonly replyTo?: { readonly seq: number; readonly speaker: string; readonly text: string }
  readonly type: 'message'
  readonly id: string
  readonly seq: number
  readonly speaker: RoomSpeaker
  readonly text: string
  readonly createdAt: number
}

export interface RoomHeader {
  readonly type: 'header'
  readonly roomId: string
  readonly groupId: string
  readonly createdAt: number
}

export interface RoomState {
  readonly header: RoomHeader
  readonly messages: readonly RoomMessage[]
}

export interface GroupsRuntime {
  listGroups(): Promise<ListGroupsResult>
  getGroup(id: string): Promise<GroupView>
  createGroup(input: CreateGroupInput): Promise<GroupView>
  updateGroup(input: UpdateGroupInput): Promise<GroupView>
  deleteGroup(input: { id: string }): Promise<DeleteGroupResult>
  removeBotFromGroups(botId: string): Promise<{ updated: readonly string[]; deleted: readonly string[] }>
  createGroupSession(input: { groupId: string }): Promise<GroupRoomRow>
  listGroupSessions(input: { groupId: string }): Promise<ListGroupRoomsResult>
  renameGroupSession(input: { sessionId: string; title: string }): Promise<GroupRoomRow>
  deleteGroupSession(input: { roomId: string }): Promise<{ roomId: string; deleted: true }>
  peekRoom(roomId: string): Promise<RoomState | undefined>
  markRoomCancelled(roomId: string, messageIds: readonly string[]): Promise<void>
  appendRoomMessage(
    roomId: string,
    speaker: RoomSpeaker,
    text: string,
    metadata?: Pick<RoomMessage, 'requestId' | 'replyTo'>,
  ): Promise<RoomMessage>
  updateLayout(updates: readonly GroupLayoutUpdate[]): Promise<{ ok: true; skipped: string[] }>
}

export interface GroupLayoutUpdate {
  readonly id: string
  readonly section?: string
  readonly order?: number
}

export interface GroupsRuntimeOptions {
  readonly listBotIds: () => Promise<readonly string[]>
  readonly home?: () => string
  readonly now?: () => number
}

interface RegistryFile {
  readonly version: 1
  readonly groups: readonly GroupRegistryRow[]
}

interface RoomsIndexFile {
  readonly version: 1
  readonly rooms: readonly GroupRoomRow[]
}

function resolveHome(): string {
  const home = process.env.DSH_HOME?.trim()
  if (home === undefined || home === '') {
    throw new DshBotError('internal', 'DSH_HOME is required for the group registry')
  }
  return home
}

function registryPath(home: string): string {
  return join(home, 'dsh-bot', REGISTRY_FILE)
}

function roomsIndexPath(home: string): string {
  return join(home, 'dsh-bot', ROOMS_INDEX_FILE)
}

function roomFilePath(home: string, roomId: string): string {
  return join(home, 'dsh-bot', ROOMS_DIR, `${roomId}.jsonl`)
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

function normalizeName(raw: string): string {
  const name = raw.trim()
  assertNoControls(name, 'name')
  if (name === '') throw new DshBotError('invalid-input', 'name is required')
  if (name.length > NAME_MAX) throw new DshBotError('invalid-input', `name must be at most ${NAME_MAX} characters`)
  return name
}

export function normalizeRounds(raw: unknown): number {
  if (raw === undefined || raw === null) return GROUP_ROUNDS_DEFAULT
  if (typeof raw !== 'number' || !Number.isInteger(raw)) {
    throw new DshBotError('invalid-input', 'rounds must be an integer')
  }
  if (raw === GROUP_ROUNDS_INFINITE) return GROUP_ROUNDS_INFINITE
  if (raw < 1 || raw > GROUP_ROUNDS_MAX) {
    throw new DshBotError('invalid-input', `rounds must be 0 (unlimited) or 1–${GROUP_ROUNDS_MAX}`)
  }
  return raw
}

function normalizeMemberIds(
  raw: readonly string[],
  botIds: ReadonlySet<string>,
): string[] {
  const seen = new Set<string>()
  const ids: string[] = []
  for (const item of raw) {
    const id = item.trim()
    if (id === '') continue
    if (seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  if (ids.length < GROUP_MEMBER_MIN) {
    throw new DshBotError('invalid-input', `a group needs ${GROUP_MEMBER_MIN}–${GROUP_MEMBER_MAX} members`)
  }
  if (ids.length > GROUP_MEMBER_MAX) {
    throw new DshBotError('invalid-input', `a group needs ${GROUP_MEMBER_MIN}–${GROUP_MEMBER_MAX} members`)
  }
  for (const id of ids) {
    if (!botIds.has(id)) {
      throw new DshBotError('invalid-input', `member ${JSON.stringify(id)} is not a registered bot`)
    }
  }
  return ids
}

async function atomicWriteJson(file: string, body: unknown): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  await writeFile(tmp, `${JSON.stringify(body, null, 2)}\n`, 'utf8')
  await rename(tmp, file)
}

async function atomicWriteText(file: string, body: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  await writeFile(tmp, body, 'utf8')
  await rename(tmp, file)
}

function parseRegistry(value: unknown): GroupRegistryRow[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new DshBotError('registry-corrupt', 'groups.json must be an object')
  }
  const rec = value as { version?: unknown; groups?: unknown }
  if (rec.version !== 1) {
    throw new DshBotError('registry-corrupt', 'groups.json version is not 1')
  }
  if (!Array.isArray(rec.groups)) {
    throw new DshBotError('registry-corrupt', 'groups.json is missing groups[]')
  }
  return rec.groups.map((item, index) => parseGroupRow(item, index))
}

function parseGroupRow(value: unknown, index: number): GroupRegistryRow {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new DshBotError('registry-corrupt', `groups.json groups[${index}] is not an object`)
  }
  const rec = value as Record<string, unknown>
  const id = typeof rec.id === 'string' ? rec.id : ''
  const name = typeof rec.name === 'string' ? rec.name : ''
  const createdAt = typeof rec.createdAt === 'number' && Number.isFinite(rec.createdAt) ? rec.createdAt : Number.NaN
  if (id === '' || name === '' || Number.isNaN(createdAt)) {
    throw new DshBotError('registry-corrupt', `groups.json groups[${index}] is missing id/name/createdAt`)
  }
  if (!Array.isArray(rec.memberIds) || rec.memberIds.some(item => typeof item !== 'string')) {
    throw new DshBotError('registry-corrupt', `groups.json groups[${index}] memberIds is invalid`)
  }
  return {
    id,
    name,
    memberIds: rec.memberIds as string[],
    createdAt,
    ...groupLayoutFrom(rec, createdAt),
    rounds: rec.rounds === undefined || rec.rounds === null ? GROUP_ROUNDS_DEFAULT : normalizeRounds(rec.rounds),
  }
}

async function loadRegistry(home: string): Promise<GroupRegistryRow[]> {
  const file = registryPath(home)
  if (!existsSync(file)) return []
  let raw: string
  try {
    raw = await readFile(file, 'utf8')
  } catch (error) {
    throw new DshBotError('registry-corrupt', `cannot read groups.json: ${error instanceof Error ? error.message : String(error)}`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    throw new DshBotError('registry-corrupt', 'groups.json is not valid JSON')
  }
  return parseRegistry(parsed)
}

async function saveRegistry(home: string, groups: readonly GroupRegistryRow[]): Promise<void> {
  const body: RegistryFile = { version: 1, groups }
  await atomicWriteJson(registryPath(home), body)
}

function parseRoomsIndex(value: unknown): GroupRoomRow[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new DshBotError('registry-corrupt', 'rooms.json must be an object')
  }
  const rec = value as { version?: unknown; rooms?: unknown }
  if (rec.version !== 1) {
    throw new DshBotError('registry-corrupt', 'rooms.json version is not 1')
  }
  if (!Array.isArray(rec.rooms)) {
    throw new DshBotError('registry-corrupt', 'rooms.json is missing rooms[]')
  }
  const rooms: GroupRoomRow[] = []
  for (const item of rec.rooms) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) continue
    const row = item as Record<string, unknown>
    const roomId = typeof row.roomId === 'string' ? row.roomId : ''
    const groupId = typeof row.groupId === 'string' ? row.groupId : ''
    const createdAt = typeof row.createdAt === 'number' && Number.isFinite(row.createdAt) ? row.createdAt : Number.NaN
    const updatedAt = typeof row.updatedAt === 'number' && Number.isFinite(row.updatedAt) ? row.updatedAt : createdAt
    if (roomId === '' || groupId === '' || Number.isNaN(createdAt)) continue
    rooms.push({ roomId, groupId, createdAt, updatedAt, ...(typeof row.title === 'string' ? { title: row.title } : {}) })
  }
  return rooms
}

async function loadRoomsIndex(home: string): Promise<GroupRoomRow[]> {
  const file = roomsIndexPath(home)
  if (!existsSync(file)) return []
  let raw: string
  try {
    raw = await readFile(file, 'utf8')
  } catch {
    return []
  }
  try {
    return parseRoomsIndex(JSON.parse(raw) as unknown)
  } catch {
    throw new DshBotError('registry-corrupt', 'rooms.json is not valid JSON')
  }
}

async function saveRoomsIndex(home: string, rooms: readonly GroupRoomRow[]): Promise<void> {
  const body: RoomsIndexFile = { version: 1, rooms }
  await atomicWriteJson(roomsIndexPath(home), body)
}

function encodeRoom(state: RoomState): string {
  const lines = [JSON.stringify(state.header), ...state.messages.map(row => JSON.stringify(row))]
  return `${lines.join('\n')}\n`
}

function parseRoomFile(raw: string, roomId: string): RoomState | undefined {
  const lines = raw.split('\n').map(line => line.trim()).filter(line => line !== '')
  if (lines.length === 0) return undefined
  let header: RoomHeader | undefined
  const messages: RoomMessage[] = []
  for (const line of lines) {
    let parsed: unknown
    try {
      parsed = JSON.parse(line) as unknown
    } catch {
      continue
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) continue
    const rec = parsed as Record<string, unknown>
    if (rec.type === 'header') {
      const gid = typeof rec.groupId === 'string' ? rec.groupId : ''
      const createdAt = typeof rec.createdAt === 'number' && Number.isFinite(rec.createdAt) ? rec.createdAt : 0
      const id = typeof rec.roomId === 'string' && rec.roomId !== '' ? rec.roomId : roomId
      if (gid === '') continue
      header = { type: 'header', roomId: id, groupId: gid, createdAt }
      continue
    }
    if (rec.type === 'message') {
      const id = typeof rec.id === 'string' ? rec.id : ''
      const seq = typeof rec.seq === 'number' && Number.isFinite(rec.seq) ? rec.seq : Number.NaN
      const text = typeof rec.text === 'string' ? rec.text : ''
      const createdAt = typeof rec.createdAt === 'number' && Number.isFinite(rec.createdAt) ? rec.createdAt : 0
      const speaker = parseSpeaker(rec.speaker)
      if (id === '' || Number.isNaN(seq) || speaker === undefined) continue
      const reply = rec.replyTo as RoomMessage['replyTo']
      messages.push({ type: 'message', id, seq, speaker, text, createdAt,
        ...speaker.kind === 'user' && typeof rec.cancelledAt === 'number' && Number.isFinite(rec.cancelledAt)
          ? { cancelledAt: rec.cancelledAt } : {},
        ...typeof rec.requestId === 'string' ? { requestId: rec.requestId } : {},
        ...reply !== undefined && reply !== null && Number.isSafeInteger(reply.seq)
          && typeof reply.text === 'string' && typeof reply.speaker === 'string' ? { replyTo: reply } : {},
      })
    }
  }
  if (header === undefined) return undefined
  return { header, messages }
}

function parseSpeaker(value: unknown): RoomSpeaker | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const rec = value as Record<string, unknown>
  if (rec.kind === 'user') return { kind: 'user' }
  if (rec.kind === 'system') return { kind: 'system' }
  const botId = typeof rec.botId === 'string' ? rec.botId.trim() : ''
  if (botId === '') return undefined
  if (rec.kind === 'member') return { kind: 'member', botId }
  if (rec.kind === 'error') {
    const code = typeof rec.code === 'string' && rec.code.trim() !== '' ? rec.code : 'internal'
    return { kind: 'error', botId, code }
  }
  return undefined
}

async function readRoomFile(home: string, roomId: string): Promise<RoomState | undefined> {
  const file = roomFilePath(home, roomId)
  if (!existsSync(file)) return undefined
  const raw = await readFile(file, 'utf8')
  return parseRoomFile(raw, roomId)
}

function allocateSlug(name: string, groups: readonly GroupRegistryRow[], botIds: ReadonlySet<string>): string {
  const base = slugifyName(name)
  const seed = base === 'bot' ? 'group' : base
  let slug = seed
  let n = 2
  while (slugTaken(slug, groups, botIds)) {
    slug = `${seed}-${n}`
    n += 1
  }
  return slug
}

function slugTaken(slug: string, groups: readonly GroupRegistryRow[], botIds: ReadonlySet<string>): boolean {
  if (botIds.has(slug)) return true
  return groups.some(row => row.id === slug)
}

/**
 * Construct the group registry. Mutating methods share one lock.
 */
export function createGroupsRuntime(options: GroupsRuntimeOptions): GroupsRuntime {
  const homeOf = options.home ?? resolveHome
  const nowOf = options.now ?? Date.now
  let gate = Promise.resolve()
  const withLock = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = gate.then(fn, fn)
    gate = run.then(() => undefined, () => undefined)
    return run
  }

  const listGroups = async (): Promise<ListGroupsResult> => {
    const groups = await loadRegistry(homeOf())
    return { groups }
  }

  const getGroup = async (id: string): Promise<GroupView> => {
    const trimmed = id.trim()
    if (trimmed === '') throw new DshBotError('invalid-input', 'group id is required')
    const groups = await loadRegistry(homeOf())
    const row = groups.find(item => item.id === trimmed)
    if (row === undefined) {
      throw new DshBotError('group-not-found', `group ${JSON.stringify(trimmed)} is not in the registry`)
    }
    return row
  }

  const createGroup = async (input: CreateGroupInput): Promise<GroupView> => {
    const home = homeOf()
    const name = normalizeName(input.name)
    const botIds = new Set(await options.listBotIds())
    const memberIds = normalizeMemberIds(input.memberIds, botIds)
    const groups = [...await loadRegistry(home)]
    const id = allocateSlug(name, groups, botIds)
    const row: GroupRegistryRow = {
      id,
      name,
      memberIds,
      createdAt: nowOf(),
      section: 'work',
      order: nowOf(),
      rounds: normalizeRounds(input.rounds),
    }
    groups.push(row)
    await saveRegistry(home, groups)
    return row
  }

  const updateGroup = async (input: UpdateGroupInput): Promise<GroupView> => {
    const home = homeOf()
    const id = input.id.trim()
    if (id === '') throw new DshBotError('invalid-input', 'group id is required')
    const groups = [...await loadRegistry(home)]
    const index = groups.findIndex(row => row.id === id)
    if (index < 0) throw new DshBotError('group-not-found', `group ${JSON.stringify(id)} is not in the registry`)
    const current = groups[index]!
    const botIds = new Set(await options.listBotIds())
    const name = input.name === undefined ? current.name : normalizeName(input.name)
    const memberIds = input.memberIds === undefined
      ? [...current.memberIds]
      : normalizeMemberIds(input.memberIds, botIds)
    const next: GroupRegistryRow = {
      id: current.id,
      name,
      memberIds,
      createdAt: current.createdAt,
      section: current.section,
      order: current.order,
      rounds: input.rounds === undefined ? current.rounds : normalizeRounds(input.rounds),
    }
    groups[index] = next
    await saveRegistry(home, groups)
    return next
  }

  const purgeRooms = async (home: string, groupIds: ReadonlySet<string>): Promise<void> => {
    if (groupIds.size === 0) return
    const rooms = await loadRoomsIndex(home)
    const kept: GroupRoomRow[] = []
    for (const room of rooms) {
      if (groupIds.has(room.groupId)) {
        await rm(roomFilePath(home, room.roomId), { force: true })
        continue
      }
      kept.push(room)
    }
    await saveRoomsIndex(home, kept)
  }

  const deleteGroup = async (input: { id: string }): Promise<DeleteGroupResult> => {
    const home = homeOf()
    const id = input.id.trim()
    if (id === '') throw new DshBotError('invalid-input', 'group id is required')
    const groups = await loadRegistry(home)
    if (!groups.some(row => row.id === id)) {
      throw new DshBotError('group-not-found', `group ${JSON.stringify(id)} is not in the registry`)
    }
    await saveRegistry(home, groups.filter(row => row.id !== id))
    await purgeRooms(home, new Set([id]))
    return { id, deleted: true }
  }

  const removeBotFromGroups = async (botId: string): Promise<{ updated: string[]; deleted: string[] }> => {
    const home = homeOf()
    const trimmed = botId.trim()
    if (trimmed === '') throw new DshBotError('invalid-input', 'bot id is required')
    const groups = await loadRegistry(home)
    const updated: string[] = []
    const deleted: string[] = []
    const kept: GroupRegistryRow[] = []
    for (const group of groups) {
      if (!group.memberIds.includes(trimmed)) {
        kept.push(group)
        continue
      }
      const memberIds = group.memberIds.filter(id => id !== trimmed)
      if (memberIds.length < GROUP_MEMBER_MIN) {
        deleted.push(group.id)
        continue
      }
      kept.push({ ...group, memberIds })
      updated.push(group.id)
    }
    if (updated.length === 0 && deleted.length === 0) return { updated, deleted }
    await saveRegistry(home, kept)
    await purgeRooms(home, new Set(deleted))
    return { updated, deleted }
  }

  const renameGroupSession = async (input: { sessionId: string; title: string }): Promise<GroupRoomRow> => {
    const home = homeOf()
    const title = input.title.trim()
    if (title === '' || title.length > 60) throw new DshBotError('invalid-input', '名称须为 1–60 个字符')
    const rooms = await loadRoomsIndex(home)
    const index = rooms.findIndex(row => row.roomId === input.sessionId)
    if (index < 0) throw new DshBotError('group-not-found', '房间不存在')
    const row: GroupRoomRow = { ...rooms[index]!, title }
    rooms[index] = row
    await saveRoomsIndex(home, rooms)
    return row
  }

  const deleteGroupSession = async (input: { roomId: string }): Promise<{ roomId: string; deleted: true }> => {
    const home = homeOf()
    const roomId = input.roomId.trim()
    const rooms = await loadRoomsIndex(home)
    // Only ids registered in rooms.json reach rm(): no path traversal through roomId.
    if (roomId === '' || !rooms.some(row => row.roomId === roomId)) throw new DshBotError('group-not-found', '房间不存在')
    await rm(roomFilePath(home, roomId), { force: true })
    await saveRoomsIndex(home, rooms.filter(row => row.roomId !== roomId))
    return { roomId, deleted: true }
  }

  const createGroupSession = async (input: { groupId: string }): Promise<GroupRoomRow> => {
    const home = homeOf()
    const groupId = input.groupId.trim()
    if (groupId === '') throw new DshBotError('invalid-input', 'group id is required')
    const groups = await loadRegistry(home)
    if (!groups.some(row => row.id === groupId)) {
      throw new DshBotError('group-not-found', `group ${JSON.stringify(groupId)} is not in the registry`)
    }
    const now = nowOf()
    const roomId = `room-${randomUUID()}`
    const header: RoomHeader = { type: 'header', roomId, groupId, createdAt: now }
    const state: RoomState = { header, messages: [] }
    await atomicWriteText(roomFilePath(home, roomId), encodeRoom(state))
    const row: GroupRoomRow = { roomId, groupId, createdAt: now, updatedAt: now }
    const rooms = [...await loadRoomsIndex(home), row]
    await saveRoomsIndex(home, rooms)
    return row
  }

  const listGroupSessions = async (input: { groupId: string }): Promise<ListGroupRoomsResult> => {
    const groupId = input.groupId.trim()
    if (groupId === '') throw new DshBotError('invalid-input', 'group id is required')
    await getGroup(groupId)
    const rooms = (await loadRoomsIndex(homeOf()))
      .filter(row => row.groupId === groupId)
      .sort((a, b) => {
        if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt
        return b.createdAt - a.createdAt
      })
    return { rooms }
  }

  const peekRoom = async (roomId: string): Promise<RoomState | undefined> => {
    const id = roomId.trim()
    if (id === '') return undefined
    const home = homeOf()
    const rooms = await loadRoomsIndex(home)
    if (!rooms.some(row => row.roomId === id)) {
      const fromFile = await readRoomFile(home, id)
      return fromFile
    }
    return await readRoomFile(home, id)
  }

  const markRoomCancelled = async (roomId: string, messageIds: readonly string[]): Promise<void> => {
    if (messageIds.length === 0) return
    const state = await peekRoom(roomId)
    if (state === undefined) throw new DshBotError('invalid-input', 'group room does not exist')
    const wanted = new Set(messageIds)
    const cancelledAt = nowOf()
    const messages = state.messages.map(row => row.speaker.kind === 'user' && wanted.has(row.id) && row.cancelledAt === undefined
      ? { ...row, cancelledAt } : row)
    await atomicWriteText(roomFilePath(homeOf(), roomId), encodeRoom({ header: state.header, messages }))
  }

  const appendRoomMessage = async (
    roomId: string,
    speaker: RoomSpeaker,
    text: string,
    metadata: Pick<RoomMessage, 'requestId' | 'replyTo'> = {},
  ): Promise<RoomMessage> => {
    const home = homeOf()
    const id = roomId.trim()
    if (id === '') throw new DshBotError('invalid-input', 'roomId is required')
    const state = await peekRoom(id)
    if (state === undefined) throw new DshBotError('invalid-input', `room ${JSON.stringify(id)} does not exist`)
    const seq = state.messages.reduce((max, row) => row.seq > max ? row.seq : max, 0) + 1
    const message: RoomMessage = {
      type: 'message',
      id: `m-${seq}-${randomUUID().slice(0, 8)}`,
      seq,
      speaker,
      text,
      createdAt: nowOf(),
      ...metadata,
    }
    // One JSON line per message: append instead of rewriting the whole room.
    await appendFile(roomFilePath(home, id), `${JSON.stringify(message)}\n`, 'utf8')
    const rooms = await loadRoomsIndex(home)
    const index = rooms.findIndex(row => row.roomId === id)
    if (index >= 0) {
      const current = rooms[index]!
      const untitled = current.title === undefined || current.title.trim() === ''
      const autoTitle = untitled && speaker.kind === 'user' ? firstLineTitle(text) : undefined
      rooms[index] = {
        ...current,
        updatedAt: message.createdAt,
        ...autoTitle === undefined ? {} : { title: autoTitle },
      }
      await saveRoomsIndex(home, rooms)
    }
    return message
  }

  const updateLayout = async (updates: readonly GroupLayoutUpdate[]): Promise<{ ok: true; skipped: string[] }> => {
    const home = homeOf()
    const groups = [...await loadRegistry(home)]
    const skipped: string[] = []
    for (const patch of updates) {
      const id = patch.id.trim()
      const index = groups.findIndex(row => row.id === id)
      if (index < 0) {
        skipped.push(id)
        continue
      }
      const current = groups[index]!
      groups[index] = {
        ...current,
        section: patch.section?.trim() || current.section,
        order: patch.order ?? current.order,
      }
    }
    await saveRegistry(home, groups)
    return { ok: true, skipped }
  }

  return {
    listGroups: () => withLock(listGroups),
    getGroup: id => withLock(() => getGroup(id)),
    createGroup: input => withLock(() => createGroup(input)),
    updateGroup: input => withLock(() => updateGroup(input)),
    deleteGroup: input => withLock(() => deleteGroup(input)),
    removeBotFromGroups: botId => withLock(() => removeBotFromGroups(botId)),
    createGroupSession: input => withLock(() => createGroupSession(input)),
    listGroupSessions: input => withLock(() => listGroupSessions(input)),
    renameGroupSession: input => withLock(() => renameGroupSession(input)),
    deleteGroupSession: input => withLock(() => deleteGroupSession(input)),
    peekRoom: roomId => withLock(() => peekRoom(roomId)),
    markRoomCancelled: (roomId, messageIds) => withLock(() => markRoomCancelled(roomId, messageIds)),
    appendRoomMessage: (roomId, speaker, text, metadata) => withLock(() => appendRoomMessage(roomId, speaker, text, metadata)),
    updateLayout: updates => withLock(() => updateLayout(updates)),
  }
}

function firstLineTitle(text: string): string | undefined {
  const first = text.trim().split(/\r?\n/, 1)[0]?.trim() ?? ''
  if (first === '') return undefined
  return first.length <= 20 ? first : `${first.slice(0, 20).trimEnd()}…`
}
