/**
 * Loopback HTTP face for ctx.dshBot. Browser tab talks POST /dsh-bot/<method>
 * with `{args}` (vibee runs-client wire). Optional: compositions without
 * webServer still load the service.
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
export interface DshBotHttpFace extends WorkbenchBotsFace {
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

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
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
      handler: (req, res) => { void handleDshBotHttp(bot, req, res) },
    }),
    'dsh-bot-host: http rpc',
  )
}

/**
 * Dispatch one `/dsh-bot/<method>` request. Application errors stay HTTP 200
 * with `{ok:false,error}` (vibee isomorphic).
 */
export async function handleDshBotHttp(
  bot: DshBotHttpFace,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const method = url.pathname.replace(/^\/dsh-bot\/?/, '')
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
