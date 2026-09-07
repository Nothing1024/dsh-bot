/**
 * conversation.session.header.actions identity chip (BR-607).
 */
import { useEffect, useRef, useSyncExternalStore, type ReactElement } from 'react'
import { nameInitial } from 'dsh-bot-shared'
import type { WorkbenchBot } from 'dsh-bot-shared'
import type { SessionListFace } from './BoundRoster.tsx'
import { findBotByPreset } from './bot-preset.ts'
import { zh } from './locales.ts'
import type { OverlayStore } from './overlay-store.ts'
import { botColor } from './roster-items.ts'
import type { RosterRpc } from './roster-rpc.ts'
import css from './IdentityBar.module.css'

export interface IdentityBarProps {
  sessionId?: string
  roster: RosterRpc
  sessions?: SessionListFace
  overlay?: OverlayStore
  t?: (key: string, vars?: Record<string, string>) => string
}

function fallbackT(key: string, vars?: Record<string, string>): string {
  let text = zh[key as keyof typeof zh] ?? key
  if (vars !== undefined) {
    for (const [name, value] of Object.entries(vars)) text = text.replaceAll(`{${name}}`, value)
  }
  return text
}

const EMPTY_SESSION_LIST: ReturnType<NonNullable<NonNullable<SessionListFace['list']>['getSnapshot']>> = { byId: {} }
function emptyList(): ReturnType<NonNullable<NonNullable<SessionListFace['list']>['getSnapshot']>> {
  return EMPTY_SESSION_LIST
}

export function resolveIdentityBot(
  sessionId: string | undefined,
  bots: readonly WorkbenchBot[],
  botsStatus: 'loading' | 'idle' | 'error',
  byId: Record<string, { agentPreset?: string }> | undefined,
): WorkbenchBot | null {
  if (sessionId === undefined || sessionId === '') return null
  if (botsStatus === 'loading' && bots.length === 0) return null
  const preset = byId?.[sessionId]?.agentPreset
  return findBotByPreset(bots, preset) ?? null
}

/**
 * Renders only for official bot sessions that match a roster persona.
 */
export function IdentityBar(props: IdentityBarProps): ReactElement | null {
  const t = props.t ?? fallbackT
  const bots = useSyncExternalStore(props.roster.bots.subscribe, props.roster.bots.getSnapshot, props.roster.bots.getSnapshot)
  const list = props.sessions?.list
  const sessionSnap = useSyncExternalStore(
    list?.subscribe ?? ((fn: () => void) => { void fn; return () => {} }),
    list?.getSnapshot ?? emptyList,
    list?.getSnapshot ?? emptyList,
  )
  const bot = resolveIdentityBot(props.sessionId, bots.items, bots.status, sessionSnap.byId)
  const marked = useRef<string | null>(null)

  useEffect(() => {
    if (bot === null || props.sessionId === undefined) return
    if ((bot.unread ?? 0) <= 0) return
    const key = `${props.sessionId}:${bot.id}`
    if (marked.current === key) return
    marked.current = key
    void props.roster.markRead(bot.id)
  }, [bot, props.sessionId, props.roster])

  if (bot === null || props.sessionId === undefined) return null
  const session = sessionSnap.byId?.[props.sessionId]
  const running = session?.running === true
  return (
    <div className={css.bar} data-testid="dsh-bot-identity" data-bot={bot.id}>
      <button
        type="button"
        className={css.chip}
        data-testid="dsh-bot-identity-chip"
        onClick={() => { props.overlay?.open({ kind: 'edit-bot', id: bot.id, target: 'bot' }) }}
      >
        <span className={css.face} style={{ background: botColor(bot) }} aria-hidden>
          {bot.avatar.emoji ?? nameInitial(bot.name)}
        </span>
        <span className={css.name}>{bot.name}</span>
        {running
          ? <span className={css.dot} data-testid="dsh-bot-identity-working" title={t('identity.working')} />
          : null}
      </button>
    </div>
  )
}
