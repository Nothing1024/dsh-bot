/**
 * better-sidebar "DSH Bot" tab: list / empty / error / create (UF-003).
 */
import { useState, useSyncExternalStore, type ReactElement, type SVGProps } from 'react'
import { zh } from './locales.ts'
import type { DshBotListState, IDshBotClient } from './rpc.ts'
import { jumpToSession } from './session-jump.ts'
import type { SessionJumpFace } from './session-jump.ts'
import css from './DshBotTab.module.css'

const EMPTY_FEED: DshBotListState = {
  items: [],
  botModel: null,
  state: 'loading',
  error: null,
  includeHidden: false,
}

export interface WorkspaceCwdFace {
  list?: {
    getSnapshot(): {
      items?: readonly { path?: string; id?: string }[]
      recentWorkspaceId?: string
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

function useFeed(client: IDshBotClient | undefined): DshBotListState {
  const subscribe = client === undefined ? () => () => undefined : client.list.subscribe.bind(client.list)
  const get = client === undefined ? () => EMPTY_FEED : client.list.getSnapshot.bind(client.list)
  return useSyncExternalStore(subscribe, get, get)
}

function formatTime(createdAt: number): string {
  if (!Number.isFinite(createdAt) || createdAt <= 0) return ''
  const ms = createdAt < 1e12 ? createdAt * 1000 : createdAt
  try {
    return new Date(ms).toLocaleString()
  } catch {
    return ''
  }
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

/**
 * Render the sidebar sessions tab.
 * @param props - tab props (ctx is allowed here).
 */
export function DshBotTab({ ctx }: DshBotTabProps) {
  const t = (key: string, vars?: Record<string, string>) => translate(ctx.locale, key, vars)
  const feed = useFeed(ctx.dshBot)
  const [creating, setCreating] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const jump = (sessionId: string): void => {
    try {
      if (!jumpToSession(ctx.sessions, sessionId)) {
        setNotice(t('list.jumpFailed'))
      }
    } catch {
      setNotice(t('list.jumpFailed'))
    }
  }

  const create = async (): Promise<void> => {
    if (ctx.dshBot === undefined || creating) return
    setCreating(true)
    setNotice(null)
    const outcome = await ctx.dshBot.createSession(undefined, resolveCreateCwd(ctx.sessions, ctx.workspaces))
    setCreating(false)
    if (!outcome.ok) {
      setNotice(outcome.error.message)
      return
    }
    jump(outcome.value.sessionId)
  }

  const modelLabel = (): string => {
    const info = feed.botModel
    if (info === null || (info.provider === '' && info.model === '')) {
      return t('footer.source.global')
    }
    const source = info.source === 'override' ? t('footer.source.override') : t('footer.source.global')
    return `${info.provider}/${info.model} (${source})`
  }

  const busy = creating

  return (
    <div className={css.root} data-testid="dsh-bot-tab">
      <div className={css.toolbar}>
        <label className={css.toggle}>
          <input
            type="checkbox"
            data-testid="dsh-bot-include-hidden"
            checked={feed.includeHidden}
            onChange={(event) => { ctx.dshBot?.setIncludeHidden(event.target.checked) }}
          />
          {t('list.includeHidden')}
        </label>
      </div>
      {feed.state === 'loading' && feed.items.length === 0 ? (
        <p className={css.hint} data-testid="dsh-bot-loading">{t('list.loading')}</p>
      ) : feed.state === 'error' && feed.items.length === 0 ? (
        <div className={css.stateBox} data-testid="dsh-bot-error">
          <p className={css.hint}>{t('list.error')}</p>
          <button type="button" className={css.btn} data-testid="dsh-bot-retry" onClick={() => { void ctx.dshBot?.refresh() }}>
            {t('list.retry')}
          </button>
        </div>
      ) : feed.items.length === 0 ? (
        <div className={css.stateBox} data-testid="dsh-bot-empty">
          <p className={css.hint}>{t('list.empty')}</p>
          <p className={css.hint}>{t('list.emptyHint')}</p>
        </div>
      ) : (
        <ul className={css.list} data-testid="dsh-bot-list">
          {feed.items.map(row => (
            <li key={row.sessionId}>
              <button
                type="button"
                className={css.row}
                data-testid={`dsh-bot-row-${row.sessionId}`}
                onClick={() => { jump(row.sessionId) }}
              >
                <span className={css.rowText}>
                  <span className={css.rowName}>{row.title ?? row.sessionId}</span>
                  <span className={css.rowMeta}>{formatTime(row.createdAt)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {notice !== null && <p className={css.notice}>{notice}</p>}
      <div className={css.actions}>
        <button
          type="button"
          className={`${css.btn} ${css.primary}`}
          data-testid="dsh-bot-new"
          disabled={busy}
          onClick={() => { void create() }}
        >
          {creating ? t('list.creating') : t('list.new')}
        </button>
      </div>
      <footer className={css.footer} data-testid="dsh-bot-footer-model">
        {t('footer.model', { model: modelLabel() })}
      </footer>
    </div>
  )
}
