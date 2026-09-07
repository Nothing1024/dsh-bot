/**
 * sidebar.workspaces occupant: segment bar, tri-state, wide vs rail (BR-610).
 */
import { type ReactElement, type ReactNode } from 'react'
import { zh } from './locales.ts'
import type { SidebarModeStore } from './sidebar-mode.ts'
import css from './BotRegion.module.css'

export type RosterViewState = 'loading' | 'error' | 'empty' | 'ready'

export interface BotRegionProps {
  wide?: boolean
  expandSidebar?: () => void
  t?: (key: string, vars?: Record<string, string>) => string
  mode?: SidebarModeStore
  children?: ReactNode
  rosterState?: RosterViewState
  onRetry?: () => void
  activateTab?: () => void
}

function fallbackT(key: string): string {
  return zh[key as keyof typeof zh] ?? key
}

function RailAvatars(): ReactElement {
  return <div className={css.rail} data-testid="dsh-bot-rail" />
}

function RosterState(props: {
  t: (key: string) => string
  rosterState: RosterViewState
  onRetry?: () => void
  activateTab?: () => void
  children?: ReactNode
}): ReactElement {
  if (props.rosterState === 'loading') {
    return <div className={css.state} data-testid="dsh-bot-region-loading">{props.t('roster.loading')}</div>
  }
  if (props.rosterState === 'error') {
    return (
      <div className={css.state} data-testid="dsh-bot-region-error">
        <span>{props.t('roster.error')}</span>
        <button
          type="button"
          className={css.retry}
          data-testid="dsh-bot-region-retry"
          onClick={props.onRetry}
        >
          {props.t('roster.retry')}
        </button>
      </div>
    )
  }
  if (props.rosterState === 'empty') {
    return (
      <div className={css.state} data-testid="dsh-bot-region-empty">
        <span>{props.t('roster.empty')}</span>
        {props.activateTab === undefined
          ? null
          : (
              <button type="button" className={css.emptyLink} onClick={props.activateTab}>
                {props.t('roster.emptyHint')}
              </button>
            )}
      </div>
    )
  }
  return <div className={css.body}>{props.children}</div>
}

/**
 * Bot-mode left rail region.
 * @param props - owner wide/expandSidebar plus injected mode/t/roster props.
 */
export function BotRegion(props: BotRegionProps): ReactElement {
  const t = props.t ?? fallbackT
  const wide = props.wide !== false
  const rosterState = props.rosterState ?? 'loading'
  if (!wide) {
    // UF-604 失败分支: roster never loaded → one warning glyph in the avatar column,
    // title「名册加载失败」; click expands the sidebar so UF-601 retry is reachable.
    if (rosterState === 'error') {
      return (
        <div className={css.root} data-testid="dsh-bot-region" data-wide="0">
          <div className={css.rail}>
            <button
              type="button"
              className={css.railWarn}
              title={t('roster.error')}
              aria-label={t('roster.error')}
              data-testid="dsh-bot-rail-error"
              onClick={() => { props.expandSidebar?.(); props.onRetry?.() }}
            >
              !
            </button>
          </div>
        </div>
      )
    }
    return (
      <div className={css.root} data-testid="dsh-bot-region" data-wide="0">
        {props.children ?? <RailAvatars />}
      </div>
    )
  }
  const rosterExtras: { onRetry?: () => void; activateTab?: () => void } = {}
  if (props.onRetry !== undefined) rosterExtras.onRetry = props.onRetry
  if (props.activateTab !== undefined) rosterExtras.activateTab = props.activateTab
  return (
    <div className={css.root} data-testid="dsh-bot-region" data-wide="1">
      <div className={css.seg} data-testid="dsh-bot-seg">
        <button
          type="button"
          className={css.segBtn}
          onClick={() => { props.mode?.set('sessions') }}
        >
          {t('mode.sessions')}
        </button>
        <button type="button" className={`${css.segBtn} ${css.segBtnPressed}`} aria-pressed="true">
          {t('mode.bot')}
        </button>
      </div>
      <RosterState t={t} rosterState={rosterState} {...rosterExtras}>
        {props.children}
      </RosterState>
    </div>
  )
}
