/**
 * Bot-mode roster: sections, search, hidden bucket, rail avatars (BR-604/610/619).
 */
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { nameInitial } from 'dsh-bot-shared'
import type { WorkbenchBot, WorkbenchGroup, WorkbenchSessionRow } from 'dsh-bot-shared'
import { sessionDisplayTitle } from 'dsh-bot-shared'
import {
  buildRosterRows,
  filterRosterRows,
  groupRosterRows,
  readFoldedSections,
  writeFoldedSections,
} from './roster-items.ts'
import type { RosterRowModel } from './roster-items.ts'
import { zh } from './locales.ts'
import css from './BotRoster.module.css'

export interface BotRosterProps {
  wide?: boolean
  expandSidebar?: () => void
  t?: (key: string, vars?: Record<string, string>) => string
  bots: readonly WorkbenchBot[]
  groups?: readonly WorkbenchGroup[]
  pendingBotIds?: ReadonlySet<string>
  lastMessages?: Readonly<Record<string, string>>
  sessionCounts?: Readonly<Record<string, number>>
  selectedId?: string | null
  currentSessionId?: string | null
  nestedSessions?: readonly WorkbenchSessionRow[]
  nestedStatus?: 'idle' | 'loading' | 'creating' | 'resolving' | 'error'
  nestedError?: string | null
  onSelect?: (row: RosterRowModel) => void
  onSelectSession?: (sessionId: string) => void
  onNewChat?: (botId: string) => void
  onNewRoom?: (groupId: string) => void
  onRetrySelect?: () => void
  onUnhide?: (botId: string) => void
  onMenuAction?: (action: RosterMenuAction, row: RosterRowModel) => void
  onOpenOverlay?: (kind: RosterOverlayKind, row?: RosterRowModel) => void
  previewDisabled?: boolean
  menuOpenId?: string | null
  onMenuOpen?: (id: string | null) => void
  actionError?: string | null
  routineCounts?: Readonly<Record<string, number>>
}

export type RosterMenuAction =
  | 'pin'
  | 'unpin'
  | 'move-work'
  | 'move-life'
  | 'mark-read'
  | 'hide'
  | 'mute'
  | 'unmute'

export type RosterOverlayKind =
  | 'create-bot'
  | 'create-group'
  | 'edit-bot'
  | 'edit-group'
  | 'confirm-delete'
  | 'graph'

function isCoarsePointer(): boolean {
  if (typeof matchMedia !== 'function') return false
  try {
    const coarse = matchMedia('(pointer: coarse)')
    const fine = matchMedia('(pointer: fine)')
    return coarse.matches === true && fine.matches === false
  } catch {
    return false
  }
}

function fallbackT(key: string, vars?: Record<string, string>): string {
  let text = zh[key as keyof typeof zh] ?? key
  if (vars !== undefined) {
    for (const [name, value] of Object.entries(vars)) text = text.replaceAll(`{${name}}`, value)
  }
  return text
}

function Face(props: { row: RosterRowModel }): ReactElement {
  if (props.row.kind === 'group') {
    return (
      <span className={css.mosaic} aria-hidden>
        {props.row.members.slice(0, 4).map(member => (
          <span key={member.id} style={{ background: member.color }} />
        ))}
      </span>
    )
  }
  return (
    <span className={css.face} style={{ background: props.row.color }} aria-hidden>
      {props.row.emoji ?? nameInitial(props.row.name)}
    </span>
  )
}

function Badge(props: { row: RosterRowModel }): ReactElement | null {
  if (props.row.pending) {
    return <span className={`${css.badge} ${css.badgePending}`} data-testid={`dsh-bot-badge-${props.row.id}`}>@</span>
  }
  if (props.row.unread <= 0) return null
  return (
    <span
      className={`${css.badge} ${props.row.muted ? css.badgeMuted : ''}`}
      data-testid={`dsh-bot-badge-${props.row.id}`}
    >
      {props.row.unread}
    </span>
  )
}

/**
 * Grouped persona/group list for Bot mode.
 */
export function BotRoster(props: BotRosterProps): ReactElement {
  const t = props.t ?? fallbackT
  const wide = props.wide !== false
  const [query, setQuery] = useState('')
  const [folded, setFolded] = useState<Set<string>>(() => readFoldedSections())
  const [hiddenOpen, setHiddenOpen] = useState(false)
  const [menuId, setMenuId] = useState<string | null>(props.menuOpenId ?? null)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const enterTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (props.menuOpenId !== undefined) setMenuId(props.menuOpenId)
  }, [props.menuOpenId])

  useEffect(() => {
    if (menuId === null) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closeMenu()
    }
    const onPtr = (event: PointerEvent): void => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest('[data-testid^="dsh-bot-menu"]')) return
      closeMenu()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPtr)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPtr)
    }
  }, [menuId])

  const rows = useMemo(
    () => buildRosterRows({
      bots: props.bots,
      groups: props.groups ?? [],
      ...props.pendingBotIds !== undefined ? { pendingBotIds: props.pendingBotIds } : {},
      ...props.lastMessages !== undefined ? { lastMessages: props.lastMessages } : {},
      ...props.sessionCounts !== undefined ? { sessionCounts: props.sessionCounts } : {},
    }),
    [props.bots, props.groups, props.pendingBotIds, props.lastMessages, props.sessionCounts],
  )
  const filtered = useMemo(() => filterRosterRows(rows, query), [rows, query])
  const grouped = useMemo(() => groupRosterRows(filtered), [filtered])

  const toggleFold = (id: string): void => {
    setFolded(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      writeFoldedSections(next)
      return next
    })
  }

  const openMenu = (id: string): void => {
    setPreviewId(null)
    setMenuId(id)
    props.onMenuOpen?.(id)
  }

  const closeMenu = (): void => {
    setMenuId(null)
    props.onMenuOpen?.(null)
  }

  const onEnter = (id: string): void => {
    if (props.previewDisabled === true || !wide) return
    if (isCoarsePointer()) return
    if (leaveTimer.current !== null) clearTimeout(leaveTimer.current)
    if (enterTimer.current !== null) clearTimeout(enterTimer.current)
    enterTimer.current = setTimeout(() => { setPreviewId(id) }, 400)
  }

  const onLeave = (): void => {
    if (enterTimer.current !== null) clearTimeout(enterTimer.current)
    if (leaveTimer.current !== null) clearTimeout(leaveTimer.current)
    leaveTimer.current = setTimeout(() => { setPreviewId(null) }, 120)
  }

  if (!wide) {
    const visibleBots = rows.filter(row => row.kind === 'bot' && !row.hidden)
    return (
      <div className={css.rail} data-testid="dsh-bot-rail">
        {visibleBots.map(row => (
          <button
            key={row.id}
            type="button"
            className={css.railBtn}
            title={row.name}
            data-testid={`dsh-bot-rail-${row.id}`}
            onClick={() => {
              props.expandSidebar?.()
              props.onSelect?.(row)
            }}
          >
            <Face row={row} />
            {row.unread > 0 || row.pending ? <span className={css.railDot} /> : null}
          </button>
        ))}
      </div>
    )
  }

  const renderRow = (row: RosterRowModel, opts: { hiddenBucket?: boolean } = {}): ReactElement => {
    const selected = props.selectedId === row.id
    const flip = typeof window !== 'undefined' && window.innerHeight > 0
      ? false
      : false
    return (
      <div key={row.id} className={css.rowWrap}>
        <button
          type="button"
          className={css.row}
          data-testid={`dsh-bot-row-${row.id}`}
          data-kind={row.kind}
          data-selected={selected ? '1' : '0'}
          onClick={() => { closeMenu(); props.onSelect?.(row) }}
          onPointerEnter={() => { onEnter(row.id) }}
          onPointerLeave={onLeave}
          onMouseEnter={() => { onEnter(row.id) }}
          onMouseLeave={onLeave}
        >
          <Face row={row} />
          <span className={css.meta}>
            <span className={css.name}>{row.name}</span>
            <span className={css.preview}>{row.preview}</span>
          </span>
          <span>
            <Badge row={row} />
            {row.kind === 'bot' && row.sessionCount > 0
              ? <span className={css.count}>{row.sessionCount}</span>
              : null}
          </span>
          <span
            role="button"
            tabIndex={0}
            data-testid={`dsh-bot-menu-btn-${row.id}`}
            onClick={event => {
              event.stopPropagation()
              openMenu(row.id)
            }}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.stopPropagation()
                openMenu(row.id)
              }
            }}
          >
            ⋯
          </span>
          {previewId === row.id
            ? (
                <div className={css.previewCard} data-testid={`dsh-bot-preview-${row.id}`} data-flip={flip ? '1' : '0'}>
                  {row.kind === 'bot'
                    ? `${row.modelLabel ?? t('preview.defaultModel')} · ${t('preview.routines', { n: String(props.routineCounts?.[row.id] ?? 0) })} · ${t('preview.sessions', { n: String(row.sessionCount) })} · ${row.preview}`
                    : `${t('preview.group')} · ${t('preview.members', { n: String(row.memberIds.length) })} · ${row.preview}`}
                </div>
              )
            : null}
        </button>
        {opts.hiddenBucket === true
          ? (
              <button
                type="button"
                data-testid={`dsh-bot-unhide-${row.id}`}
                onClick={() => { props.onUnhide?.(row.id) }}
              >
                {t('roster.unhide')}
              </button>
            )
          : null}
        {menuId === row.id
          ? (
              <RowMenu
                row={row}
                t={t}
                onClose={closeMenu}
                {...props.onMenuAction !== undefined ? { onAction: props.onMenuAction } : {}}
                {...props.onOpenOverlay !== undefined ? { onOverlay: props.onOpenOverlay } : {}}
              />
            )
          : null}
        {selected && row.kind === 'bot' ? (
          <div className={css.nested} data-testid={`dsh-bot-nested-${row.id}`}>
            {props.nestedStatus === 'loading' || props.nestedStatus === 'resolving' ? <div>{t('roster.loadingSessions')}</div> : null}
            {props.nestedStatus === 'creating' ? <div>{t('roster.creating')}</div> : null}
            {props.nestedError !== undefined && props.nestedError !== null
              ? (
                  <div className={css.error}>
                    <span>{props.nestedError}</span>
                    <button type="button" data-testid="dsh-bot-select-retry" onClick={props.onRetrySelect}>{t('roster.retry')}</button>
                  </div>
                )
              : null}
            {(props.nestedSessions ?? []).map(session => (
              <button
                key={session.sessionId}
                type="button"
                className={css.nestedBtn}
                data-testid={`dsh-bot-session-${session.sessionId}`}
                data-current={props.currentSessionId === session.sessionId ? '1' : '0'}
                onClick={() => { props.onSelectSession?.(session.sessionId) }}
              >
                {sessionDisplayTitle(session.title, row.name, { hidden: session.hidden })}
              </button>
            ))}
            <button
              type="button"
              className={css.newChat}
              data-testid="dsh-bot-new-chat"
              disabled={props.nestedStatus === 'creating'}
              onClick={() => { props.onNewChat?.(row.id) }}
            >
              {t('roster.newChat')}
            </button>
          </div>
        ) : null}
        {selected && row.kind === 'group' ? (
          <div className={css.nested}>
            <button type="button" className={css.newChat} data-testid="dsh-bot-new-room" onClick={() => { props.onNewRoom?.(row.id) }}>
              {t('roster.newRoom')}
            </button>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className={css.root} data-testid="dsh-bot-roster">
      <div className={css.head}>
        <span className={css.title}>{t('roster.title')}</span>
        <button type="button" className={css.iconBtn} data-testid="dsh-bot-graph" onClick={() => { props.onOpenOverlay?.('graph') }}>{t('roster.graph')}</button>
        <button type="button" className={css.iconBtn} data-testid="dsh-bot-new-bot" onClick={() => { props.onOpenOverlay?.('create-bot') }}>{t('roster.newBot')}</button>
        <button type="button" className={css.iconBtn} data-testid="dsh-bot-new-group" onClick={() => { props.onOpenOverlay?.('create-group') }}>{t('roster.newGroup')}</button>
      </div>
      <input
        className={css.search}
        data-testid="dsh-bot-roster-search"
        value={query}
        placeholder={t('roster.search')}
        onChange={event => { setQuery(event.target.value) }}
      />
      {grouped.visible.map(bucket => (
        <section key={bucket.section.id} data-testid={`dsh-bot-section-${bucket.section.id}`}>
          <button type="button" className={css.sectionHead} onClick={() => { toggleFold(bucket.section.id) }}>
            {bucket.section.name}
          </button>
          {folded.has(bucket.section.id) ? null : bucket.items.map(row => renderRow(row))}
        </section>
      ))}
      {props.actionError !== undefined && props.actionError !== null
        ? <div className={css.error} data-testid="dsh-bot-action-error">{props.actionError}</div>
        : null}
      {grouped.hidden.length > 0
        ? (
            <div className={css.hidden} data-testid="dsh-bot-hidden">
              <button type="button" onClick={() => { setHiddenOpen(open => !open) }}>
                {t('roster.hidden', { n: String(grouped.hidden.length) })}
              </button>
              {hiddenOpen ? grouped.hidden.map(row => renderRow(row, { hiddenBucket: true })) : null}
            </div>
          )
        : null}
    </div>
  )
}

function RowMenu(props: {
  row: RosterRowModel
  t: (key: string, vars?: Record<string, string>) => string
  onAction?: (action: RosterMenuAction, row: RosterRowModel) => void
  onOverlay?: (kind: RosterOverlayKind, row?: RosterRowModel) => void
  onClose: () => void
}): ReactElement {
  const items: { id: string; label: string; run: () => void }[] = props.row.kind === 'bot'
    ? [
        { id: props.row.pinned ? 'unpin' : 'pin', label: props.t(props.row.pinned ? 'roster.unpin' : 'roster.pin'), run: () => { props.onAction?.(props.row.pinned ? 'unpin' : 'pin', props.row) } },
        { id: 'move-work', label: props.t('roster.moveWork'), run: () => { props.onAction?.('move-work', props.row) } },
        { id: 'move-life', label: props.t('roster.moveLife'), run: () => { props.onAction?.('move-life', props.row) } },
        { id: 'mark-read', label: props.t('roster.markRead'), run: () => { props.onAction?.('mark-read', props.row) } },
        { id: 'hide', label: props.t('roster.hide'), run: () => { props.onAction?.('hide', props.row) } },
        { id: props.row.muted ? 'unmute' : 'mute', label: props.t(props.row.muted ? 'roster.unmute' : 'roster.mute'), run: () => { props.onAction?.(props.row.muted ? 'unmute' : 'mute', props.row) } },
        { id: 'edit', label: props.t('roster.editBot'), run: () => { props.onOverlay?.('edit-bot', props.row) } },
        ...props.row.protected
          ? []
          : [{ id: 'delete', label: props.t('roster.deleteBot'), run: () => { props.onOverlay?.('confirm-delete', props.row) } }],
      ]
    : [
        { id: 'edit', label: props.t('roster.editGroup'), run: () => { props.onOverlay?.('edit-group', props.row) } },
        { id: 'delete', label: props.t('roster.deleteGroup'), run: () => { props.onOverlay?.('confirm-delete', props.row) } },
      ]
  return (
    <div className={css.menu} data-testid={`dsh-bot-menu-${props.row.id}`} role="menu">
      {items.map(item => (
        <button
          key={item.id}
          type="button"
          data-testid={`dsh-bot-menu-${item.id}`}
          onClick={event => {
            event.stopPropagation()
            item.run()
            props.onClose()
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
