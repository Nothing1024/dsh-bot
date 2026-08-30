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
  history(input: HistoryRequest): Promise<HistoryResult>
  prompt(input: PromptRequest): Promise<PromptResult>
  reconcile(): Promise<ReconcileResult>
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
    default:
      return undefined
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
  return {
    sessionId,
    text: asString(args.text),
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
