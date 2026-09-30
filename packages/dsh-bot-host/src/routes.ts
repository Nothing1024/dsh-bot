/**
 * HTTP face for ctx.dshBot. Browser tab talks POST /dsh-bot/<method> with
 * `{args}` (vibee runs-client wire). Optional: compositions without webServer
 * still load the service.
 *
 * Every request passes {@link rejectRequest} first: the gateway's own /api
 * Host/Origin fence and browser-session cookie when Connection is composed,
 * with one exemption for non-browser clients on loopback (CLI, manual-test),
 * which already hold the same trust through `$DSH_HOME` on disk.
 * @module dsh-bot-host/routes
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { SessionToolError } from 'session-tool'
import type { SessionToolCaller } from 'session-tool'
import type {
  CreateBotSessionRequest,
  CreateBotSessionResult,
  DshBotSessionRow,
  ListBotSessionsRequest,
} from './ask.ts'
import { DshBotError } from './errors.ts'
import { dispatchWorkbenchApi } from './workbench-routes.ts'
import { handleBotEventsHttp } from './bot-events.ts'
import type { BotEventsSource } from './bot-events.ts'
import type { WorkbenchBotsFace } from './workbench-routes.ts'

/** Wire model shown on the sidebar footer (UF-006). */
export interface DshBotModelInfo {
  readonly provider: string
  readonly model: string
  readonly source: 'override' | 'global-default'
}

/** `listSessions` RPC value: rows plus current bot model. */
export interface ListSessionsRpcValue {
  readonly sessions: readonly DshBotSessionRow[]
  readonly botModel: DshBotModelInfo
}

/** Host methods the HTTP face needs. */
export interface DshBotHttpFace extends WorkbenchBotsFace, BotEventsSource {
  listSessions(request?: ListBotSessionsRequest): Promise<readonly DshBotSessionRow[]>
  createSession(caller: SessionToolCaller, request?: CreateBotSessionRequest): Promise<CreateBotSessionResult>
  currentBotModel(): DshBotModelInfo
}

interface WebServerLike {
  register(route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }): () => void
}

const CLI_CALLER: SessionToolCaller = { kind: 'cli' }

/** Largest accepted RPC body. Prompts carry pasted text; nothing legitimate nears this. */
const MAX_BODY_BYTES = 8 * 1024 * 1024

/** Subset of `ctx.connection` (dsh-client-connection) this face consults. */
interface ConnectionLike {
  requestRejection(request: { readonly headers: IncomingMessage['headers'] }): 401 | 403 | undefined
}

class HttpRefusal extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code)
  }
}

function headerOf(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name]
  return Array.isArray(value) ? value[0] : value
}

function isLoopbackHost(host: string | undefined): boolean {
  if (host === undefined) return false
  let hostname: string
  try {
    hostname = new URL(`http://${host}`).hostname
  } catch {
    return false
  }
  return hostname === 'localhost' || hostname === '[::1]' || /^127(?:\.\d{1,3}){3}$/.test(hostname)
}

/**
 * Status refusing this request, or undefined when it may proceed.
 * @param connection - the gateway's Connection service, when composed.
 */
export function rejectRequest(req: IncomingMessage, connection: ConnectionLike | undefined): 401 | 403 | undefined {
  const host = headerOf(req, 'host')
  const origin = headerOf(req, 'origin')
  const fetchSite = headerOf(req, 'sec-fetch-site')
  // A request no browser sent (no Origin, no Fetch-Metadata) from this machine,
  // addressed to loopback. The socket address is unforgeable; the Host check
  // keeps a DNS-rebound page (Host names the attacker domain) out.
  const remote = req.socket?.remoteAddress ?? ''
  const localNonBrowser = (remote === '::1' || remote.startsWith('127.') || remote.startsWith('::ffff:127.'))
    && isLoopbackHost(host) && origin === undefined && fetchSite === undefined
  if (connection === undefined) {
    // No browser auth composed: accept only same-origin loopback traffic.
    if (!isLoopbackHost(host) || fetchSite === 'cross-site') return 403
    if (origin === undefined) return undefined
    try {
      return new URL(origin).host === host ? undefined : 403
    } catch {
      return 403
    }
  }
  const rejection = connection.requestRejection(req)
  return rejection === 401 && localNonBrowser ? undefined : rejection
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const type = headerOf(req, 'content-type')?.split(';')[0]?.trim().toLowerCase()
  if (type !== 'application/json') throw new HttpRefusal(415, 'unsupported-media-type')
  const declared = Number(headerOf(req, 'content-length'))
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new HttpRefusal(413, 'payload-too-large')
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk as Buffer
    size += buffer.byteLength
    if (size > MAX_BODY_BYTES) throw new HttpRefusal(413, 'payload-too-large')
    chunks.push(buffer)
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (raw === '') return {}
  return JSON.parse(raw) as unknown
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Content-Length', Buffer.byteLength(payload))
  res.end(payload)
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * Sidebar HTTP has no agent caller. Bind new sessions to the plugin workspace
 * (`dirname(DSH_HOME)` = 仓根) so they enter the workspace view (UF-003).
 */
export function defaultCreateCwd(): string {
  const home = process.env.DSH_HOME?.trim()
  if (home !== undefined && home !== '') return dirname(home)
  return process.cwd()
}

function wireError(error: unknown): { code: string; message: string } {
  if (error instanceof SessionToolError) {
    return { code: error.code, message: error.message }
  }
  if (error instanceof DshBotError) {
    const cause = error.cause
    if (cause instanceof SessionToolError) {
      return { code: cause.code, message: cause.message }
    }
    return { code: error.code, message: error.message }
  }
  return {
    code: 'internal',
    message: error instanceof Error ? error.message : String(error),
  }
}

/**
 * Mount `/dsh-bot/<method>` when a webServer is present.
 * @param ctx - owning context.
 * @param bot - host service face.
 */
export function attachDshBotHttp(ctx: Context, bot: DshBotHttpFace): void {
  let webServer: WebServerLike | undefined
  try {
    webServer = (ctx as Context & { webServer?: WebServerLike }).webServer
  } catch {
    return
  }
  if (webServer === undefined || typeof webServer.register !== 'function') return
  ctx.effect(
    () => webServer.register({
      kind: 'prefix',
      path: '/dsh-bot',
      handler: (req, res) => {
        let connection: ConnectionLike | undefined
        try {
          connection = ctx.get('connection') as ConnectionLike | undefined
        } catch {
          connection = undefined
        }
        void handleDshBotHttp(bot, req, res, connection)
      },
    }),
    'dsh-bot-host: http rpc',
  )
}

/**
 * Dispatch one `/dsh-bot/<method>` request. Application errors stay HTTP 200
 * with `{ok:false,error}` (vibee isomorphic); trust, media-type and size
 * refusals are HTTP errors so no handler runs.
 * @param connection - gateway Connection service, when composed.
 */
export async function handleDshBotHttp(
  bot: DshBotHttpFace,
  req: IncomingMessage,
  res: ServerResponse,
  connection?: ConnectionLike,
): Promise<void> {
  const rejection = rejectRequest(req, connection)
  if (rejection !== undefined) {
    sendJson(res, rejection, { ok: false, error: { code: rejection === 401 ? 'unauthorized' : 'forbidden', message: `HTTP ${rejection}` } })
    return
  }
  try {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const method = url.pathname.replace(/^\/dsh-bot\/?/, '')
    if (method === 'events' && (req.method === 'GET' || req.method === 'HEAD')) {
      await handleBotEventsHttp(bot, req, res)
      return
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, error: { code: 'method-not-allowed', message: req.method } })
      return
    }
    const body = asRecord(await readBody(req))
    const args = asRecord(body.args ?? body)
    const workbench = await dispatchWorkbenchApi(bot, method, args)
    const value = workbench === undefined ? await dispatch(bot, method, args) : workbench
    sendJson(res, 200, { ok: true, value })
  } catch (error) {
    if (error instanceof HttpRefusal) {
      sendJson(res, error.status, { ok: false, error: { code: error.code, message: `HTTP ${error.status}` } })
      return
    }
    sendJson(res, 200, { ok: false, error: wireError(error) })
  }
}

async function dispatch(
  bot: DshBotHttpFace,
  method: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (method) {
    case 'listSessions': {
      const includeHidden = args.includeHidden === true
      const sessions = await bot.listSessions({ includeHidden })
      return { sessions, botModel: bot.currentBotModel() } satisfies ListSessionsRpcValue
    }
    case 'botModel':
      return { botModel: bot.currentBotModel() }
    case 'createSession': {
      const title = asString(args.title).trim()
      const cwd = asString(args.cwd).trim() || asString(args.workspacePath).trim() || defaultCreateCwd()
      return await bot.createSession(CLI_CALLER, {
        ...title === '' ? {} : { title },
        cwd,
        workspacePath: cwd,
      })
    }
    default:
      throw new DshBotError('internal', `unknown dsh-bot method ${JSON.stringify(method)}`)
  }
}
