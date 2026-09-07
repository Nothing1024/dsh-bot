/**
 * sidebar.footer.action occupant: toggle Bot / sessions (BR-603 / UF-602).
 */
import { useSyncExternalStore, type ReactElement } from 'react'
import { DshBotIcon } from './DshBotTab.tsx'
import { zh } from './locales.ts'
import type { SidebarModeStore } from './sidebar-mode.ts'
import css from './ModeFooterAction.module.css'

export interface ModeFooterActionProps {
  wide?: boolean
  t?: (key: string, vars?: Record<string, string>) => string
  mode: SidebarModeStore
  unread?: number
  pending?: boolean
}

function fallbackT(key: string): string {
  return zh[key as keyof typeof zh] ?? key
}

/**
 * Footer Bot switch.
 * @param props - owner `wide` plus the shared mode store.
 */
export function ModeFooterAction(props: ModeFooterActionProps): ReactElement {
  const current = useSyncExternalStore(props.mode.subscribe, props.mode.getSnapshot, props.mode.getSnapshot)
  const t = props.t ?? fallbackT
  const pressed = current === 'bot'
  const unread = props.unread ?? 0
  const pending = props.pending === true
  const onClick = (): void => {
    props.mode.set(current === 'bot' ? 'sessions' : 'bot')
  }
  if (props.wide === false) {
    return (
      <button
        type="button"
        className={css.rail}
        data-testid="dsh-bot-mode-footer"
        data-wide="0"
        aria-pressed={pressed}
        title={t('mode.bot')}
        onClick={onClick}
      >
        <DshBotIcon />
        {pending || unread > 0 ? <span className={css.dot} data-testid="dsh-bot-mode-dot" /> : null}
      </button>
    )
  }
  return (
    <button
      type="button"
      className={css.row}
      data-testid="dsh-bot-mode-footer"
      data-wide="1"
      aria-pressed={pressed}
      onClick={onClick}
    >
      <span>{t('mode.bot')}</span>
      {pending
        ? <span className={`${css.badge} ${css.badgePending}`} data-testid="dsh-bot-mode-badge">@</span>
        : unread > 0
          ? <span className={css.badge} data-testid="dsh-bot-mode-badge">{unread}</span>
          : null}
    </button>
  )
}
