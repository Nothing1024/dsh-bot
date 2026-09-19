/**
 * Workbench static face: GET /dsh-bot/ui and GET /dsh-bot/ui/* from the
 * workbench-ui lib/ tree (require.resolve). Longest-prefix wins over the
 * existing `/dsh-bot` RPC prefix. Bot CRUD POSTs share the v1 `{args}` wire
 * and are dispatched from routes.ts.
 * @module dsh-bot-host/workbench-routes
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { createRequire } from 'node:module'
import { dirname, extname, join, relative, resolve as resolvePath, sep } from 'node:path'
import { readFile } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import type {
  BotView,
  CreateBotInput,
  DeleteBotResult,
  ListBotsResult,
  UpdateBotInput,
} from './bots.ts'
import type {
  CreateGroupInput,
  DeleteGroupResult,
  GroupRoomRow,
  GroupView,
  ListGroupRoomsResult,
  ListGroupsResult,
  UpdateGroupInput,
} from './groups.ts'
import { DshBotError } from './errors.ts'
import type { DshBotModelRef } from './platform.ts'
import type { ReconcileResult } from './reconcile.ts'
import type {
  CreateOwnedSessionRequest,
  CreateOwnedSessionResult,
  HistoryRequest,
  HistoryResult,
  ListOwnedSessionsRequest,
  ListOwnedSessionsResult,
  PromptRequest,
  PromptResult,
} from './workbench-sessions.ts'

interface WebServerLike {
  register(route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }): () => void
}

const CONTENT_TYPE: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
}

const UI_PREFIX = '/dsh-bot/ui'

/** Host methods the workbench bot CRUD + session face needs. */
export interface WorkbenchBotsFace {
  listBots(): Promise<ListBotsResult>
  createBot(input: CreateBotInput): Promise<BotView>
  updateBot(input: UpdateBotInput): Promise<BotView>
  deleteBot(input: { id: string }): Promise<DeleteBotResult>
  createBotSession(input: CreateOwnedSessionRequest): Promise<CreateOwnedSessionResult>
  listBotSessions(input: ListOwnedSessionsRequest): Promise<ListOwnedSessionsResult>
  renameSession(input: { sessionId: string; title: string }): Promise<{ sessionId: string; title: string }>
  prepareOfficialJump(input: { sessionId: string }): Promise<{ sessionId: string }>
  history(input: HistoryRequest): Promise<HistoryResult>
  prompt(input: PromptRequest): Promise<PromptResult>
  reconcile(): Promise<ReconcileResult>
  listGroups(): Promise<ListGroupsResult>
  createGroup(input: CreateGroupInput): Promise<GroupView>
  updateGroup(input: UpdateGroupInput): Promise<GroupView>
  deleteGroup(input: { id: string }): Promise<DeleteGroupResult>
  createGroupSession(input: { groupId: string }): Promise<GroupRoomRow>
  listGroupSessions(input: { groupId: string }): Promise<ListGroupRoomsResult>
  memoryList(input: { botId: string }): Promise<unknown>
  memoryRemember(input: { botId: string; text: string; sessionId?: string }): Promise<unknown>
  memoryForget(input: { botId: string; id: string }): Promise<unknown>
  memoryClear(input: { botId: string }): Promise<unknown>
  routineList(input?: { botId?: string }): Promise<unknown>
  routineCreate(input: { botId: string; name: string; schedule: string; instruction: string; notify?: boolean }): Promise<unknown>
  routineUpdate(input: { id: string; name?: string; schedule?: string; instruction?: string; enabled?: boolean; notify?: boolean }): Promise<unknown>
  routineDelete(input: { id: string }): Promise<unknown>
  routineRunNow(input: { id: string }): Promise<unknown>
  routineDecline(input: { botId: string; topic: string }): Promise<unknown>
  markRead(input: { botId: string }): Promise<unknown>
  cancel?(input: { sessionId: string }): Promise<unknown>
  updateQueue?(input: { sessionId: string; itemId: string; action: unknown }): Promise<unknown>
  approvalRespond?(input: {
    rpcId: string
    sessionId: string
    approvalId: string
    outcome: 'allowed-once' | 'rejected'
  }): Promise<unknown>
  questionRespond?(input: { rpcId: string; sessionId: string; answer: unknown }): Promise<unknown>
  peerLog?(input?: { botId?: string }): Promise<unknown>
  sendToPeer?(input: { toBot: string; text: string; fromBot?: string; fromSessionId?: string }): Promise<unknown>
  updateBotLayout?(input: {
    bots?: readonly { id: string; pinned?: boolean; section?: string; hidden?: boolean; order?: number; muted?: boolean }[]
    groups?: readonly { id: string; section?: string; order?: number }[]
    sections?: readonly { id: string; name: string; order: number }[]
  }): Promise<unknown>
}


function send(res: ServerResponse, status: number, body: string | Buffer, contentType: string): void {
  res.statusCode = status
  res.setHeader('Content-Type', contentType)
  res.setHeader('Content-Length', Buffer.byteLength(body))
  res.end(body)
}

function sendText(res: ServerResponse, status: number, message: string): void {
  send(res, status, message, 'text/plain; charset=utf-8')
}

/**
 * Resolve workbench-ui's built `lib/` directory via the package.json path.
 */
export function resolveWorkbenchRoot(): string {
  const require = createRequire(import.meta.url)
  const pkg = require.resolve('workbench-ui/package.json')
  return join(dirname(pkg), 'lib')
}

/**
 * Map a `/dsh-bot/ui` request onto a file inside `root`. Rejects traversal.
 * @returns absolute file path, or undefined when the request is illegal.
 */
export function safeWorkbenchFile(pathname: string, root: string): string | undefined {
  const trimmed = pathname === UI_PREFIX || pathname === `${UI_PREFIX}/`
    ? 'index.html'
    : pathname.startsWith(`${UI_PREFIX}/`)
      ? pathname.slice(`${UI_PREFIX}/`.length)
      : undefined
  if (trimmed === undefined || trimmed === '') return undefined
  let decoded: string
  try {
    decoded = decodeURIComponent(trimmed)
  } catch {
    return undefined
  }
  if (decoded.includes('\0')) return undefined
  const segments = decoded.split(/[/\\]/)
  if (segments.some(part => part === '..')) return undefined
  const target = resolvePath(root, decoded)
  const rel = relative(root, target)
  if (rel === '' || rel.startsWith(`..${sep}`) || rel === '..' || rel.startsWith('..')) return undefined
  if (process.platform === 'win32' && /^[a-zA-Z]:/.test(rel)) return undefined
  return target
}

/**
 * Serve one static workbench asset. Tests pass `root` so they do not need a
 * built workbench-ui package.
 */
export async function handleWorkbenchStatic(
  req: IncomingMessage,
  res: ServerResponse,
  root: string,
): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendText(res, 405, 'method-not-allowed')
    return
  }
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  const file = safeWorkbenchFile(url.pathname, root)
  if (file === undefined) {
    sendText(res, 403, 'forbidden')
    return
  }
  const type = CONTENT_TYPE[extname(file).toLowerCase()]
  if (type === undefined) {
    sendText(res, 404, 'not-found')
    return
  }
  try {
    const body = await readFile(file)
    res.statusCode = 200
    res.setHeader('Content-Type', type)
    res.setHeader('Content-Length', body.byteLength)
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    res.end(body)
  } catch {
    sendText(res, 404, 'not-found')
  }
}

/**
 * Mount GET `/dsh-bot/ui` when a webServer is present.
 */
/**
 * Dispatch listBots / createBot / updateBot / deleteBot plus workbench
 * session methods. Unknown methods return undefined so the v1
 * listSessions/createSession switch stays intact.
 */
export async function dispatchWorkbenchApi(
  bot: WorkbenchBotsFace,
  method: string,
  args: Record<string, unknown>,
): Promise<unknown | undefined> {
  switch (method) {
    case 'listBots':
      return await bot.listBots()
    case 'createBot':
      return await bot.createBot(parseCreateBot(args))
    case 'updateBot':
      return await bot.updateBot(parseUpdateBot(args))
    case 'deleteBot': {
      const id = asString(args.id).trim()
      if (id === '') throw new DshBotError('invalid-input', 'bot id is required')
      return await bot.deleteBot({ id })
    }
    case 'createBotSession':
      return await bot.createBotSession(parseCreateBotSession(args))
    case 'listBotSessions':
      return await bot.listBotSessions(parseListBotSessions(args))
    case 'history':
      return await bot.history(parseHistory(args))
    case 'prompt':
      return await bot.prompt(parsePrompt(args))
    case 'reconcile':
      return await bot.reconcile()
    case 'listGroups':
      return await bot.listGroups()
    case 'createGroup':
      return await bot.createGroup(parseCreateGroup(args))
    case 'updateGroup':
      return await bot.updateGroup(parseUpdateGroup(args))
    case 'deleteGroup': {
      const id = asString(args.id).trim()
      if (id === '') throw new DshBotError('invalid-input', 'group id is required')
      return await bot.deleteGroup({ id })
    }
    case 'createGroupSession': {
      const groupId = asString(args.groupId).trim()
      if (groupId === '') throw new DshBotError('invalid-input', 'groupId is required')
      return await bot.createGroupSession({ groupId })
    }
    case 'renameSession': {
      const sessionId = asString(args.sessionId).trim()
      const title = asString(args.title).trim()
      if (!sessionId || !title || title.length > 60) throw new DshBotError('invalid-input', '名称须为 1–60 个字符')
      return await bot.renameSession({ sessionId, title })
    }
    case 'prepareOfficialJump': {
      const sessionId = asString(args.sessionId).trim()
      if (sessionId === '') throw new DshBotError('invalid-input', 'sessionId is required')
      return await bot.prepareOfficialJump({ sessionId })
    }
    case 'listGroupSessions': {
      const groupId = asString(args.groupId).trim()
      if (groupId === '') throw new DshBotError('invalid-input', 'groupId is required')
      return await bot.listGroupSessions({ groupId })
    }
    case 'memoryList': {
      const botId = asString(args.botId).trim()
      if (botId === '') throw new DshBotError('invalid-input', 'botId is required')
      return await bot.memoryList({ botId })
    }
    case 'memoryRemember': {
      const botId = asString(args.botId).trim()
      const text = asString(args.text)
      if (botId === '') throw new DshBotError('invalid-input', 'botId is required')
      if (text.trim() === '') throw new DshBotError('invalid-input', 'text is required')
      const sessionId = asString(args.sessionId).trim()
      return await bot.memoryRemember({
        botId,
        text,
        ...sessionId === '' ? {} : { sessionId },
      })
    }
    case 'memoryForget': {
      const botId = asString(args.botId).trim()
      const id = asString(args.id).trim()
      if (botId === '') throw new DshBotError('invalid-input', 'botId is required')
      if (id === '') throw new DshBotError('invalid-input', 'id is required')
      return await bot.memoryForget({ botId, id })
    }
    case 'memoryClear': {
      const botId = asString(args.botId).trim()
      if (botId === '') throw new DshBotError('invalid-input', 'botId is required')
      return await bot.memoryClear({ botId })
    }
    case 'routineList': {
      const botId = asString(args.botId).trim()
      return await bot.routineList(botId === '' ? {} : { botId })
    }
    case 'routineCreate': {
      const botId = asString(args.botId).trim()
      const name = asString(args.name).trim()
      const schedule = asString(args.schedule)
      const instruction = asString(args.instruction)
      if (botId === '' || name === '' || schedule.trim() === '' || instruction.trim() === '') {
        throw new DshBotError('invalid-input', 'botId, name, schedule, instruction are required')
      }
      return await bot.routineCreate({
        botId,
        name,
        schedule,
        instruction,
        ...args.notify === false ? { notify: false } : {},
      })
    }
    case 'routineUpdate': {
      const id = asString(args.id).trim()
      if (id === '') throw new DshBotError('invalid-input', 'id is required')
      return await bot.routineUpdate({
        id,
        ...asString(args.name).trim() === '' ? {} : { name: asString(args.name).trim() },
        ...asString(args.schedule).trim() === '' ? {} : { schedule: asString(args.schedule) },
        ...asString(args.instruction).trim() === '' ? {} : { instruction: asString(args.instruction) },
        ...typeof args.enabled === 'boolean' ? { enabled: args.enabled } : {},
        ...typeof args.notify === 'boolean' ? { notify: args.notify } : {},
      })
    }
    case 'routineDelete': {
      const id = asString(args.id).trim()
      if (id === '') throw new DshBotError('invalid-input', 'id is required')
      return await bot.routineDelete({ id })
    }
    case 'routineRunNow': {
      const id = asString(args.id).trim()
      if (id === '') throw new DshBotError('invalid-input', 'id is required')
      return await bot.routineRunNow({ id })
    }
    case 'routineDecline': {
      const botId = asString(args.botId).trim()
      const topic = asString(args.topic).trim()
      if (botId === '' || topic === '') throw new DshBotError('invalid-input', 'botId and topic are required')
      return await bot.routineDecline({ botId, topic })
    }
    case 'markRead': {
      const botId = asString(args.botId).trim()
      if (botId === '') throw new DshBotError('invalid-input', 'botId is required')
      return await bot.markRead({ botId })
    }
    case 'cancel': {
      const sessionId = asString(args.sessionId).trim()
      if (sessionId === '') throw new DshBotError('invalid-input', 'sessionId is required')
      if (bot.cancel === undefined) throw new DshBotError('cancel-unavailable', 'sessions.cancel is unavailable')
      return await bot.cancel({ sessionId })
    }
    case 'updateQueue': {
      const sessionId = asString(args.sessionId).trim()
      const itemId = asString(args.itemId).trim()
      if (sessionId === '' || itemId === '') {
        throw new DshBotError('invalid-input', 'sessionId and itemId are required')
      }
      if (bot.updateQueue === undefined) {
        throw new DshBotError('update-queue-unavailable', 'sessions.updateQueue is unavailable')
      }
      return await bot.updateQueue({ sessionId, itemId, action: args.action })
    }
    case 'approvalRespond': {
      const rpcId = asString(args.rpcId).trim()
      const sessionId = asString(args.sessionId).trim()
      const approvalId = asString(args.approvalId).trim()
      const outcome = asString(args.outcome)
      if (rpcId === '' || sessionId === '' || approvalId === '') {
        throw new DshBotError('invalid-input', 'rpcId, sessionId, approvalId are required')
      }
      if (outcome !== 'allowed-once' && outcome !== 'rejected') {
        throw new DshBotError('invalid-input', 'outcome must be allowed-once or rejected')
      }
      if (bot.approvalRespond === undefined) {
        throw new DshBotError('respond-unavailable', 'apiProxy.respond is unavailable')
      }
      return await bot.approvalRespond({ rpcId, sessionId, approvalId, outcome })
    }
    case 'questionRespond': {
      const rpcId = asString(args.rpcId).trim()
      const sessionId = asString(args.sessionId).trim()
      if (rpcId === '' || sessionId === '') {
        throw new DshBotError('invalid-input', 'rpcId and sessionId are required')
      }
      if (bot.questionRespond === undefined) {
        throw new DshBotError('respond-unavailable', 'apiProxy.respond is unavailable')
      }
      return await bot.questionRespond({ rpcId, sessionId, answer: args.answer })
    }
    case 'peerLog': {
      if (bot.peerLog === undefined) throw new DshBotError('internal', 'peerLog is unavailable')
      const botId = asString(args.botId).trim()
      return await bot.peerLog(botId === '' ? {} : { botId })
    }
    case 'sendToPeer': {
      if (bot.sendToPeer === undefined) throw new DshBotError('internal', 'sendToPeer is unavailable')
      const toBot = asString(args.toBot).trim()
      const text = asString(args.text)
      const fromBot = asString(args.fromBot).trim()
      const fromSessionId = asString(args.fromSessionId).trim()
      if (toBot === '' || text.trim() === '') throw new DshBotError('invalid-input', 'toBot and text are required')
      return await bot.sendToPeer({
        toBot,
        text,
        ...fromBot === '' ? {} : { fromBot },
        ...fromSessionId === '' ? {} : { fromSessionId },
      })
    }
    case 'updateBotLayout': {
      if (bot.updateBotLayout === undefined) throw new DshBotError('internal', 'updateBotLayout is unavailable')
      const bots = Array.isArray(args.bots) ? args.bots : []
      const groups = Array.isArray(args.groups) ? args.groups : []
      const sections = Array.isArray(args.sections) ? args.sections : undefined
      return await bot.updateBotLayout({
        ...bots.length === 0 ? {} : { bots: bots as never },
        ...groups.length === 0 ? {} : { groups: groups as never },
        ...sections === undefined ? {} : { sections: sections as never },
      })
    }
    default:
      return undefined
  }
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function parseRoundsArg(value: unknown): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new DshBotError('invalid-input', 'rounds must be an integer')
  }
  return value
}

function parseCreateGroup(args: Record<string, unknown>): CreateGroupInput {
  const rounds = parseRoundsArg(args.rounds)
  return {
    name: asString(args.name),
    memberIds: asStringList(args.memberIds),
    ...rounds === undefined ? {} : { rounds },
  }
}

function parseUpdateGroup(args: Record<string, unknown>): UpdateGroupInput {
  const id = asString(args.id).trim()
  if (id === '') throw new DshBotError('invalid-input', 'group id is required')
  const name = args.name === undefined ? undefined : asString(args.name)
  const memberIds = args.memberIds === undefined ? undefined : asStringList(args.memberIds)
  const rounds = parseRoundsArg(args.rounds)
  return {
    id,
    ...name === undefined ? {} : { name },
    ...memberIds === undefined ? {} : { memberIds },
    ...rounds === undefined ? {} : { rounds },
  }
}

function parseCreateBot(args: Record<string, unknown>): CreateBotInput {
  const name = asString(args.name)
  const persona = asString(args.persona)
  const avatar = parseAvatar(args.avatar)
  const modelOverride = parseModelOverride(args.modelOverride)
  return {
    name,
    persona,
    ...avatar === undefined ? {} : { avatar },
    ...modelOverride === undefined || modelOverride === null ? {} : { modelOverride },
  }
}

function parseUpdateBot(args: Record<string, unknown>): UpdateBotInput {
  const id = asString(args.id).trim()
  if (id === '') throw new DshBotError('invalid-input', 'bot id is required')
  const name = args.name === undefined ? undefined : asString(args.name)
  const persona = args.persona === undefined ? undefined : asString(args.persona)
  const avatar = args.avatar === undefined ? undefined : parseAvatar(args.avatar)
  const hasOverride = Object.prototype.hasOwnProperty.call(args, 'modelOverride')
  const modelOverride = hasOverride ? parseModelOverride(args.modelOverride) : undefined
  return {
    id,
    ...name === undefined ? {} : { name },
    ...persona === undefined ? {} : { persona },
    ...avatar === undefined ? {} : { avatar },
    ...modelOverride === undefined ? {} : { modelOverride },
  }
}

function parseAvatar(value: unknown): { emoji?: string; color?: string } | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new DshBotError('invalid-input', 'avatar must be an object')
  }
  const rec = value as Record<string, unknown>
  const emoji = typeof rec.emoji === 'string' ? rec.emoji : undefined
  const color = typeof rec.color === 'string' ? rec.color : undefined
  if (emoji === undefined && color === undefined) return undefined
  return {
    ...emoji === undefined ? {} : { emoji },
    ...color === undefined ? {} : { color },
  }
}

function parseModelOverride(value: unknown): DshBotModelRef | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new DshBotError('invalid-input', 'modelOverride must be an object')
  }
  const rec = value as Record<string, unknown>
  const provider = typeof rec.provider === 'string' ? rec.provider : ''
  const model = typeof rec.model === 'string' ? rec.model : ''
  if (provider.trim() === '' && model.trim() === '') return null
  const reasoningEffort = typeof rec.reasoningEffort === 'string' ? rec.reasoningEffort : undefined
  return {
    provider,
    model,
    ...reasoningEffort === undefined ? {} : { reasoningEffort },
  }
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function parseCreateBotSession(args: Record<string, unknown>): CreateOwnedSessionRequest {
  const botId = asString(args.botId).trim()
  if (botId === '') throw new DshBotError('invalid-input', 'botId is required')
  const title = asString(args.title).trim()
  const cwd = asString(args.cwd).trim()
  return {
    botId,
    ...title === '' ? {} : { title },
    ...cwd === '' ? {} : { cwd },
  }
}

function parseListBotSessions(args: Record<string, unknown>): ListOwnedSessionsRequest {
  const botId = asString(args.botId).trim()
  if (botId === '') throw new DshBotError('invalid-input', 'botId is required')
  return {
    botId,
    ...args.includeHidden === true ? { includeHidden: true } : {},
  }
}

function parseHistory(args: Record<string, unknown>): HistoryRequest {
  const sessionId = asString(args.sessionId).trim()
  if (sessionId === '') throw new DshBotError('invalid-input', 'sessionId is required')
  const sinceSeq = typeof args.sinceSeq === 'number' && Number.isFinite(args.sinceSeq)
    ? args.sinceSeq
    : undefined
  return {
    sessionId,
    ...sinceSeq === undefined ? {} : { sinceSeq },
  }
}

function parsePrompt(args: Record<string, unknown>): PromptRequest {
  const sessionId = asString(args.sessionId).trim()
  if (sessionId === '') throw new DshBotError('invalid-input', 'sessionId is required')
  if (args.requestId !== undefined && (typeof args.requestId !== 'string' || args.requestId.trim() === '' || args.requestId.length > 128)) {
    throw new DshBotError('invalid-input', 'requestId must be a non-empty string up to 128 characters')
  }
  if (args.replyToSeq !== undefined && (!Number.isSafeInteger(args.replyToSeq) || Number(args.replyToSeq) < 0)) {
    throw new DshBotError('invalid-input', 'replyToSeq must be a non-negative integer')
  }
  return {
    sessionId,
    text: asString(args.text),
    ...typeof args.requestId === 'string' ? { requestId: args.requestId } : {},
    ...typeof args.replyToSeq === 'number' ? { replyToSeq: args.replyToSeq } : {},
    ...args.mode === 'steer' ? { mode: 'steer' as const } : args.mode === 'queue' ? { mode: 'queue' as const } : {},
  }
}

export function attachWorkbenchHttp(ctx: Context, options: { root?: string } = {}): void {
  let webServer: WebServerLike | undefined
  try {
    webServer = (ctx as Context & { webServer?: WebServerLike }).webServer
  } catch {
    return
  }
  if (webServer === undefined || typeof webServer.register !== 'function') return
  const root = options.root
  ctx.effect(
    () => webServer.register({
      kind: 'prefix',
      path: UI_PREFIX,
      handler: (req, res) => {
        const dir = root ?? resolveWorkbenchRoot()
        void handleWorkbenchStatic(req, res, dir)
      },
    }),
    'dsh-bot-host: workbench ui',
  )
}
