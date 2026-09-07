/**
 * conversation.session.header.actions identity chip + pills (BR-607 / BR-616).
 */
import { useEffect, useRef, useState, useSyncExternalStore, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { nameInitial, sessionDisplayTitle } from 'dsh-bot-shared'
import type { MemoryListValue, PeerLogRow, RoutineRow, WorkbenchBot, WorkbenchSessionRow } from 'dsh-bot-shared'
import type { SessionListFace } from './BoundRoster.tsx'
import { findBotByPreset } from './bot-preset.ts'
import { zh } from './locales.ts'
import type { OverlayStore } from './overlay-store.ts'
import { botColor } from './roster-items.ts'
import type { RosterRpc } from './roster-rpc.ts'
import { jumpToSession } from './session-jump.ts'
import css from './IdentityBar.module.css'

export interface IdentityBarProps {
  sessionId?: string
  roster: RosterRpc
  sessions?: SessionListFace
  overlay?: OverlayStore
  t?: (key: string, vars?: Record<string, string>) => string
}

type PanelKind = 'memory' | 'routines' | 'peers' | 'persona' | 'chats'

interface PillCache {
  at: number
  count: number
  lines: readonly string[]
  error: string | null
}

const CACHE_MS = 30_000

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

function memoryLines(value: MemoryListValue): string[] {
  return [...value.profile.map(row => row.text), ...value.log.map(row => row.text)]
}

function openEdit(overlay: OverlayStore | undefined, botId: string): void {
  overlay?.open({ kind: 'edit-bot', id: botId, target: 'bot' })
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
  const cache = useRef<Partial<Record<'memory' | 'routines' | 'peers', PillCache>>>({})
  const [panel, setPanel] = useState<PanelKind | null>(null)
  const [counts, setCounts] = useState({ memory: 0, routines: 0, peers: 0 })
  const [lines, setLines] = useState<readonly string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [chats, setChats] = useState<readonly WorkbenchSessionRow[]>([])
  const barRef = useRef<HTMLDivElement | null>(null)
  const [anchor, setAnchor] = useState<{ top: number; left: number }>({ top: 0, left: 0 })

  useEffect(() => {
    if (bot === null || props.sessionId === undefined) return
    if ((bot.unread ?? 0) <= 0) return
    const key = `${props.sessionId}:${bot.id}`
    if (marked.current === key) return
    marked.current = key
    void props.roster.markRead(bot.id)
  }, [bot, props.sessionId, props.roster])

  useEffect(() => {
    if (bot === null || props.sessionId === undefined) return
    void props.roster.historyOf(props.sessionId)
    props.roster.ensureWakes?.(props.sessionId)
  }, [bot, props.sessionId, props.roster])

  useEffect(() => {
    if (panel === null) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setPanel(null)
    }
    const onPtr = (event: PointerEvent): void => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest('[data-testid="dsh-bot-identity"]')) return
      if (target.closest('[data-testid="dsh-bot-identity-panel"]')) return
      setPanel(null)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPtr)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPtr)
    }
  }, [panel])

  if (bot === null || props.sessionId === undefined) return null
  const session = sessionSnap.byId?.[props.sessionId]
  const running = session?.running === true
  const chatTitle = session?.displayTitle ?? bot.name

  const placePanel = (): void => {
    const box = barRef.current?.getBoundingClientRect()
    if (box === undefined) return
    setAnchor({ top: box.bottom + 6, left: Math.max(8, box.left) })
  }

  const applyCache = (kind: 'memory' | 'routines' | 'peers', entry: PillCache): void => {
    cache.current[kind] = entry
    setCounts(current => ({ ...current, [kind]: entry.count }))
    setLines(entry.lines)
    setError(entry.error)
  }

  const loadPill = async (kind: 'memory' | 'routines' | 'peers', force = false): Promise<void> => {
    const hit = cache.current[kind]
    if (!force && hit !== undefined && Date.now() - hit.at < CACHE_MS) {
      applyCache(kind, hit)
      return
    }
    setLoading(true)
    setError(null)
    try {
      if (kind === 'memory') {
        const outcome = await props.roster.memoryList(bot.id)
        if (!outcome.ok) {
          applyCache(kind, { at: 0, count: counts.memory, lines: [], error: outcome.error.message })
          return
        }
        const next = memoryLines(outcome.value)
        applyCache(kind, { at: Date.now(), count: next.length, lines: next, error: null })
        return
      }
      if (kind === 'routines') {
        const outcome = await props.roster.routineList(bot.id)
        if (!outcome.ok) {
          applyCache(kind, { at: 0, count: counts.routines, lines: [], error: outcome.error.message })
          return
        }
        const rows = outcome.value as readonly RoutineRow[]
        applyCache(kind, { at: Date.now(), count: rows.length, lines: rows.map(row => row.name), error: null })
        return
      }
      const outcome = await props.roster.peerLog(bot.id)
      if (!outcome.ok) {
        applyCache(kind, { at: 0, count: counts.peers, lines: [], error: outcome.error.message })
        return
      }
      const rows = outcome.value as readonly PeerLogRow[]
      applyCache(kind, {
        at: Date.now(),
        count: rows.length,
        lines: rows.map(row => `${row.from} → ${row.to}`),
        error: null,
      })
    } finally {
      setLoading(false)
    }
  }

  const openPanel = (kind: PanelKind): void => {
    placePanel()
    setPanel(kind)
    if (kind === 'persona') {
      setLines([bot.persona])
      setError(null)
      setLoading(false)
      return
    }
    if (kind === 'chats') {
      setError(null)
      setLoading(true)
      void props.roster.sessionsOf(bot.id).then(rows => {
        setChats(rows)
        setLoading(false)
      })
      return
    }
    void loadPill(kind)
  }

  const onNewChat = (): void => {
    if (creating) return
    setCreating(true)
    void props.roster.createBotSession(bot.id).then(outcome => {
      if (!outcome.ok) {
        setError(outcome.error.message)
        setCreating(false)
        return
      }
      jumpToSession(props.sessions, outcome.value.sessionId)
      setCreating(false)
      setPanel(null)
    })
  }

  const panelNode = panel === null || typeof document === 'undefined'
    ? null
    : createPortal(
        <div
          className={css.panel}
          data-testid="dsh-bot-identity-panel"
          data-kind={panel}
          style={{ top: anchor.top, left: anchor.left }}
        >
          {loading ? <p className={css.hint}>{t('roster.loading')}</p> : null}
          {error !== null
            ? (
                <div className={css.error} data-testid="dsh-bot-identity-error">
                  <span>{error}</span>
                  <button
                    type="button"
                    data-testid="dsh-bot-identity-retry"
                    onClick={() => {
                      if (panel === 'memory' || panel === 'routines' || panel === 'peers') void loadPill(panel, true)
                    }}
                  >
                    {t('identity.retry')}
                  </button>
                </div>
              )
            : null}
          {panel === 'persona'
            ? (
                <>
                  <p className={css.persona} data-testid="dsh-bot-identity-persona-text">{bot.persona}</p>
                  <p className={css.hint}>{t('identity.preset', { id: bot.presetId })}</p>
                  <button
                    type="button"
                    data-testid="dsh-bot-identity-edit"
                    onClick={() => {
                      setPanel(null)
                      openEdit(props.overlay, bot.id)
                    }}
                  >
                    {t('identity.editPersona')}
                  </button>
                </>
              )
            : null}
          {panel === 'chats'
            ? (
                <ul className={css.list}>
                  {chats.map(row => (
                    <li key={row.sessionId}>
                      <button
                        type="button"
                        className={css.session}
                        data-testid={`dsh-bot-identity-session-${row.sessionId}`}
                        data-current={sessionSnap.current === row.sessionId ? '1' : '0'}
                        onClick={() => {
                          jumpToSession(props.sessions, row.sessionId)
                          setPanel(null)
                        }}
                      >
                        {sessionDisplayTitle(row.title, bot.name, { hidden: row.hidden })}
                      </button>
                    </li>
                  ))}
                  <li>
                    <button
                      type="button"
                      className={css.session}
                      data-testid="dsh-bot-identity-newchat"
                      disabled={creating}
                      onClick={onNewChat}
                    >
                      {t('identity.newChat')}
                    </button>
                  </li>
                </ul>
              )
            : null}
          {panel === 'memory' || panel === 'routines' || panel === 'peers'
            ? (
                <ul className={css.list} data-testid={`dsh-bot-identity-lines-${panel}`}>
                  {lines.length === 0 && error === null && !loading
                    ? <li className={css.hint}>{t('identity.empty')}</li>
                    : lines.map((line, index) => <li key={`${panel}-${index}`}>{line}</li>)}
                </ul>
              )
            : null}
          <button type="button" className={css.close} onClick={() => { setPanel(null) }}>{t('identity.close')}</button>
        </div>,
        document.body,
      )

  return (
    <div className={css.bar} data-testid="dsh-bot-identity" data-bot={bot.id} ref={barRef}>
      <button
        type="button"
        className={css.chip}
        data-testid="dsh-bot-identity-chip"
        onClick={() => { openEdit(props.overlay, bot.id) }}
      >
        <span className={css.face} style={{ background: botColor(bot) }} aria-hidden>
          {bot.avatar.emoji ?? nameInitial(bot.name)}
        </span>
        <span className={css.name}>{bot.name}</span>
        {running
          ? <span className={css.dot} data-testid="dsh-bot-identity-working" title={t('identity.working')} />
          : null}
      </button>
      <button type="button" className={css.pill} data-testid="dsh-bot-identity-memory" onClick={() => { openPanel('memory') }}>
        {t('identity.memory', { n: String(counts.memory) })}
      </button>
      <button type="button" className={css.pill} data-testid="dsh-bot-identity-routines" onClick={() => { openPanel('routines') }}>
        {t('identity.routines', { n: String(counts.routines) })}
      </button>
      <button type="button" className={css.pill} data-testid="dsh-bot-identity-peers" onClick={() => { openPanel('peers') }}>
        {t('identity.peers', { n: String(counts.peers) })}
      </button>
      <button type="button" className={css.pill} data-testid="dsh-bot-identity-persona" onClick={() => { openPanel('persona') }}>
        {t('identity.persona')}
      </button>
      <button type="button" className={css.pill} data-testid="dsh-bot-identity-chats" onClick={() => { openPanel('chats') }}>
        {t('identity.chat')} ▾ {chatTitle}
      </button>
      <button
        type="button"
        className={css.pill}
        data-testid="dsh-bot-identity-newchat-inline"
        disabled={creating}
        onClick={onNewChat}
      >
        {t('identity.newChat')}
      </button>
      {panelNode}
    </div>
  )
}
