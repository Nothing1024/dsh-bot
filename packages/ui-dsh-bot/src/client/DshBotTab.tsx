/**
 * better-sidebar "DSH Bot" tab: iframe of `/dsh-bot/ui` (BR-204 / BR-208).
 * Badge polling stays in rpc.ts; this surface is load / error / frame.
 * Gateway-dead must not treat the browser error-page `load` as success.
 */
import { useEffect, useRef, useState, type ReactElement, type SVGProps } from 'react'
import { zh } from './locales.ts'
import type { IDshBotClient } from './rpc.ts'
import { handleJumpMessage, type SessionJumpFace } from './session-jump.ts'
import css from './DshBotTab.module.css'

export interface WorkspaceCwdFace {
  list?: {
    getSnapshot(): {
      items?: readonly { path?: string; id?: string }[]
      recentWorkspaceId?: string
      archivedSessionIds?: readonly string[]
    }
  }
}

export interface SessionCwdFace extends SessionJumpFace {
  list?: {
    getSnapshot(): {
      current?: string
      byId?: Record<string, { cwd?: string }>
    }
  }
}

export interface DshBotTabCtx {
  dshBot?: IDshBotClient
  locale?: { bind: (ns: string) => (key: string, vars?: Record<string, string>) => string }
  sessions?: SessionCwdFace
  workspaces?: WorkspaceCwdFace
}

/**
 * Prefer the current session cwd, else the recent/first workspace path.
 */
export function resolveCreateCwd(
  sessions: SessionCwdFace | undefined,
  workspaces: WorkspaceCwdFace | undefined,
): string | undefined {
  const sessionSnap = sessions?.list?.getSnapshot()
  const current = sessionSnap?.current
  if (current !== undefined && sessionSnap !== undefined) {
    const cwd = sessionSnap.byId?.[current]?.cwd
    if (cwd !== undefined && cwd.trim() !== '') return cwd
  }
  const wsSnap = workspaces?.list?.getSnapshot()
  const items = wsSnap?.items ?? []
  const recent = wsSnap?.recentWorkspaceId
  const hit = items.find(item => item.id === recent) ?? items[0]
  if (hit?.path !== undefined && hit.path.trim() !== '') return hit.path
  return undefined
}

export interface DshBotTabProps {
  ctx: DshBotTabCtx
}

function translate(
  locale: DshBotTabCtx['locale'],
  key: string,
  vars?: Record<string, string>,
): string {
  if (locale !== undefined) return locale.bind('dsh-bot')(key, vars)
  let text: string = zh[key as keyof typeof zh] ?? key
  if (vars !== undefined) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.replaceAll(`{${name}}`, value)
    }
  }
  return text
}

/** Sidebar tab icon (14px grid, currentColor). */
export function DshBotIcon(_props: { size?: number }): ReactElement {
  const svgProps: SVGProps<SVGSVGElement> = {
    width: 14,
    height: 14,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.4,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  }
  return (
    <svg {...svgProps}>
      <rect x="3" y="5" width="10" height="8" rx="2" />
      <circle cx="6.5" cy="9" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="9.5" cy="9" r="0.8" fill="currentColor" stroke="none" />
      <path d="M6 5V3.5a2 2 0 0 1 4 0V5" />
    </svg>
  )
}

const WORKBENCH_SRC = '/dsh-bot/ui'
const PROBE_MS = 8_000

async function probeWorkbench(signal: AbortSignal): Promise<boolean> {
  const response = await fetch(WORKBENCH_SRC, { method: 'GET', cache: 'no-store', signal })
  if (!response.ok) return false
  const text = await response.text()
  return /^\s*<!doctype html>/i.test(text)
}

/**
 * Render the sidebar workbench iframe.
 * @param props - tab props (ctx is allowed here).
 */
export function DshBotTab({ ctx }: DshBotTabProps) {
  const t = (key: string, vars?: Record<string, string>) => translate(ctx.locale, key, vars)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const sessionsRef = useRef(ctx.sessions)
  sessionsRef.current = ctx.sessions
  const workspacesRef = useRef(ctx.workspaces)
  workspacesRef.current = ctx.workspaces
  const [nonce, setNonce] = useState(0)
  const [probeOk, setProbeOk] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    const onMessage = (event: MessageEvent): void => {
      handleJumpMessage(
        event,
        iframeRef.current?.contentWindow ?? null,
        sessionsRef.current,
        window.location.origin,
        workspacesRef.current,
      )
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  useEffect(() => {
    let cancelled = false
    const ac = new AbortController()
    const timer = window.setTimeout(() => { ac.abort() }, PROBE_MS)
    setProbeOk(false)
    setLoaded(false)
    setError(false)
    void probeWorkbench(ac.signal).then((ok) => {
      if (cancelled) return
      if (!ok) {
        setError(true)
        return
      }
      setProbeOk(true)
    }).catch(() => {
      if (!cancelled) setError(true)
    })
    return () => {
      cancelled = true
      ac.abort()
      window.clearTimeout(timer)
    }
  }, [nonce])

  const remount = (): void => {
    setNonce(n => n + 1)
  }

  const onFrameLoad = (): void => {
    const ac = new AbortController()
    const timer = window.setTimeout(() => { ac.abort() }, PROBE_MS)
    void probeWorkbench(ac.signal).then((ok) => {
      window.clearTimeout(timer)
      if (!ok) {
        setError(true)
        return
      }
      setLoaded(true)
    }).catch(() => {
      window.clearTimeout(timer)
      setError(true)
    })
  }

  return (
    <div className={css.root} data-testid="dsh-bot-tab">
      {error ? (
        <div className={css.stateBox} data-testid="dsh-bot-error">
          <p className={css.hint}>{t('tab.error')}</p>
          <button type="button" className={css.btn} data-testid="dsh-bot-retry" onClick={remount}>
            {t('tab.retry')}
          </button>
        </div>
      ) : probeOk ? (
        <iframe
          key={nonce}
          ref={iframeRef}
          className={css.iframe}
          src={WORKBENCH_SRC}
          title={t('tab.title')}
          data-testid="dsh-bot-iframe"
          onLoad={onFrameLoad}
          onError={() => { setError(true) }}
        />
      ) : null}
      {!loaded && !error && (
        <p className={css.hint} data-testid="dsh-bot-loading">{t('tab.loading')}</p>
      )}
    </div>
  )
}
