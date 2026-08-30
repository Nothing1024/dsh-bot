/**
 * Workbench static face: GET /dsh-bot/ui and GET /dsh-bot/ui/* from the
 * workbench-ui lib/ tree (require.resolve). Longest-prefix wins over the
 * existing `/dsh-bot` RPC prefix.
 * @module dsh-bot-host/workbench-routes
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { createRequire } from 'node:module'
import { dirname, extname, join, relative, resolve as resolvePath, sep } from 'node:path'
import { readFile } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'

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
