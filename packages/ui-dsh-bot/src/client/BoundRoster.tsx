/**
 * Bot-mode region bound to roster-rpc, overlay, and sessions.open.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactElement } from 'react'
import type { WorkbenchSessionRow } from 'dsh-bot-shared'
import { BotRegion } from './BotRegion.tsx'
import type { RosterViewState } from './BotRegion.tsx'
import { BotRoster } from './BotRoster.tsx'
import type { RosterMenuAction, RosterOverlayKind } from './BotRoster.tsx'
import { ModeFooterAction } from './ModeFooterAction.tsx'
import { OverlayHost } from './OverlayHost.tsx'
import { firstVisibleId, runMenuAction } from './menu-action.ts'
import type { OverlayStore } from './overlay-store.ts'
import { countBotSessions, pickLatestBotSession } from './bot-preset.ts'
import { readLastBot } from './roster-items.ts'
import type { RosterRowModel } from './roster-items.ts'
import type { RosterRpc } from './roster-rpc.ts'
import { pendingBotIds, selectBot, sliceNested } from './select-bot.ts'
import { jumpToSession } from './session-jump.ts'
import type { SessionJumpFace } from './session-jump.ts'
import type { SidebarModeStore } from './sidebar-mode.ts'
import { writeLastSession } from 'dsh-bot-shared'
import { DSH_BOT_SESSIONS_TAB_ID } from './tab-id.ts'
import { openGroup } from './workbench-frame.ts'

export interface SessionListFace extends SessionJumpFace {
  list?: {
    getSnapshot(): {
      current?: string
      byId?: Record<string, {
        agentPreset?: string
        pendingInteraction?: string
        updatedAt?: number
        running?: boolean
        displayTitle?: string
      }>
    }
    subscribe(fn: () => void): () => void
  }
}

export interface BoundRosterProps {
  wide?: boolean
  expandSidebar?: () => void
  t: (key: string, vars?: Record<string, string>) => string
  mode: SidebarModeStore
  roster: RosterRpc
  overlay: OverlayStore
  sessions?: SessionListFace
  activateTab?: (id: string) => void
  selectedId?: string | null
  onSelectedId?: (id: string | null) => void
}

function emptyList(): ReturnType<NonNullable<NonNullable<SessionListFace['list']>['getSnapshot']>> {
  return { byId: {} }
}

export function deriveRosterState(
  botsStatus: 'loading' | 'idle' | 'error',
  botCount: number,
  groupCount: number,
): RosterViewState {
  if (botsStatus === 'loading' && botCount === 0 && groupCount === 0) return 'loading'
  if (botsStatus === 'error' && botCount === 0 && groupCount === 0) return 'error'
  if (botCount === 0 && groupCount === 0) return 'empty'
  return 'ready'
}

/**
 * Occupies sidebar.workspaces while mode is bot.
 */
export function BoundBotRegion(props: BoundRosterProps): ReactElement {
  const bots = useSyncExternalStore(props.roster.bots.subscribe, props.roster.bots.getSnapshot, props.roster.bots.getSnapshot)
  const groups = useSyncExternalStore(props.roster.groups.subscribe, props.roster.groups.getSnapshot, props.roster.groups.getSnapshot)
  const sessionsByBot = useSyncExternalStore(props.roster.sessionsByBot.subscribe, props.roster.sessionsByBot.getSnapshot, props.roster.sessionsByBot.getSnapshot)
  const lastMessages = useSyncExternalStore(props.roster.lastMessages.subscribe, props.roster.lastMessages.getSnapshot, props.roster.lastMessages.getSnapshot)
  const list = props.sessions?.list
  const sessionSnap = useSyncExternalStore(
    list?.subscribe ?? ((fn: () => void) => { void fn; return () => {} }),
    list?.getSnapshot ?? emptyList,
    list?.getSnapshot ?? emptyList,
  )
  const [localSelected, setLocalSelected] = useState<string | null>(() => readLastBot())
  const selectedId = props.selectedId !== undefined ? props.selectedId : localSelected
  const setSelectedId = (id: string | null): void => {
    if (props.onSelectedId !== undefined) props.onSelectedId(id)
    else setLocalSelected(id)
  }
  const [nestedStatus, setNestedStatus] = useState<'idle' | 'loading' | 'creating' | 'resolving' | 'error'>('idle')
  const [nestedError, setNestedError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [routineCounts, setRoutineCounts] = useState<Record<string, number>>({})
  const lock = useRef(false)
  const lastAction = useRef<() => void>(() => {})

  useEffect(() => {
    if (bots.status !== 'idle') return
    let cancelled = false
    void props.roster.routineList().then(outcome => {
      if (cancelled || !outcome.ok) return
      const counts: Record<string, number> = {}
      for (const row of outcome.value) counts[row.botId] = (counts[row.botId] ?? 0) + 1
      setRoutineCounts(counts)
    })
    return () => { cancelled = true }
  }, [bots.status, props.roster])

  useEffect(() => {
    if (actionError === null) return
    const timer = window.setTimeout(() => { setActionError(null) }, 2400)
    return () => { window.clearTimeout(timer) }
  }, [actionError])

  useEffect(() => {
    const byId = sessionSnap.byId
    for (const bot of bots.items) {
      if (bot.hidden === true) continue
      const latest = pickLatestBotSession(bot.presetId, byId)
      if (latest === undefined) continue
      props.roster.ensurePreview(bot.id, latest.sessionId, latest.updatedAt)
    }
  }, [bots.items, sessionSnap.byId, props.roster])

  const pending = useMemo(
    () => pendingBotIds(bots.items, sessionSnap.byId),
    [bots.items, sessionSnap.byId],
  )
  // BR-604 "会话数": path B only fetches `listBotSessions` for the selected bot, so
  // every other row counts its sessions from the official list by preset (BR-607).
  const sessionCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const bot of bots.items) counts[bot.id] = countBotSessions(bot.presetId, sessionSnap.byId)
    for (const [id, rows] of Object.entries(sessionsByBot)) counts[id] = rows.length
    return counts
  }, [bots.items, sessionSnap.byId, sessionsByBot])
  const rosterState = deriveRosterState(bots.status, bots.items.length, groups.items.length)
  const selectedBot = bots.items.find(row => row.id === selectedId)
  const nested = selectedBot === undefined ? [] : sliceNested(sessionsByBot[selectedBot.id] ?? [], sessionSnap.current ?? null)

  const runSelect = async (botId: string, forceCreate = false): Promise<void> => {
    if (lock.current) return
    lock.current = true
    setSelectedId(botId)
    setNestedError(null)
    setNestedStatus(forceCreate ? 'creating' : 'resolving')
    lastAction.current = () => { void runSelect(botId, forceCreate) }
    try {
      if (forceCreate) {
        if (props.sessions?.open === undefined) {
          setNestedStatus('error')
          setNestedError(props.t('roster.hostNoOpen'))
          return
        }
        const created = await props.roster.createBotSession(botId)
        if (!created.ok) {
          setNestedStatus('error')
          setNestedError(created.error.code === 'unavailable' ? props.t('roster.gatewayDown') : created.error.message)
          return
        }
        if (!jumpToSession(props.sessions, created.value.sessionId)) {
          setNestedStatus('error')
          setNestedError(props.t('roster.hostNoOpen'))
          return
        }
        writeLastSession(botId, created.value.sessionId)
        void props.roster.markRead(botId)
        setNestedStatus('idle')
        return
      }
      const result = await selectBot(botId, {
        sessionsOf: id => props.roster.sessionsOf(id),
        createBotSession: id => props.roster.createBotSession(id),
        markRead: id => props.roster.markRead(id),
        onPhase: phase => {
          if (phase === 'creating' || phase === 'resolving') setNestedStatus(phase)
        },
        ...props.sessions !== undefined ? { sessions: props.sessions } : {},
      })
      if (!result.ok) {
        setNestedStatus('error')
        setNestedError(result.error ?? props.t('roster.gatewayDown'))
        return
      }
      setNestedStatus('idle')
    } finally {
      lock.current = false
    }
  }

  const onSelect = (row: RosterRowModel): void => {
    if (row.kind === 'group') {
      setSelectedId(row.id)
      lastAction.current = () => { void onSelect(row) }
      void openGroup({
        groupId: row.id,
        tabId: DSH_BOT_SESSIONS_TAB_ID,
        ...props.activateTab !== undefined ? { activateTab: props.activateTab } : {},
      }).then(result => {
        if (!result.ok) setNestedError(result.error ?? props.t('roster.needTab'))
        else setNestedError(null)
      })
      return
    }
    void runSelect(row.id)
  }

  const onNewRoom = (groupId: string): void => {
    void (async () => {
      const created = await props.roster.createGroupSession(groupId)
      if (!created.ok) {
        setNestedError(created.error.message)
        return
      }
      const result = await openGroup({
        groupId,
        roomId: created.value.roomId,
        tabId: DSH_BOT_SESSIONS_TAB_ID,
        ...props.activateTab !== undefined ? { activateTab: props.activateTab } : {},
      })
      if (!result.ok) setNestedError(result.error ?? props.t('roster.needTab'))
    })()
  }

  const onMenu = (action: RosterMenuAction, row: RosterRowModel): void => {
    void runMenuAction({ action, id: row.id, roster: props.roster }).then(result => {
      if (!result.ok) {
        setActionError(result.error ?? props.t('roster.error'))
        return
      }
      if (action === 'hide' && selectedId === row.id) {
        setSelectedId(firstVisibleId(props.roster.bots.getSnapshot().items, groups.items, row.id))
      }
    })
  }

  const onOverlay = (kind: RosterOverlayKind, row?: RosterRowModel): void => {
    if (kind === 'create-bot' || kind === 'create-group' || kind === 'graph') {
      props.overlay.open({ kind })
      return
    }
    if (row === undefined) return
    if (kind === 'edit-bot') props.overlay.open({ kind, id: row.id, target: 'bot' })
    else if (kind === 'edit-group') props.overlay.open({ kind, id: row.id, target: 'group' })
    else if (kind === 'confirm-delete') {
      props.overlay.open({ kind, id: row.id, target: row.kind === 'group' ? 'group' : 'bot' })
    }
  }

  const onUnhide = (botId: string): void => {
    void props.roster.updateBotLayout({ bots: [{ id: botId, hidden: false }] })
  }

  const regionProps: import('./BotRegion.tsx').BotRegionProps = {
    t: props.t,
    mode: props.mode,
    rosterState,
    onRetry: () => { void props.roster.refresh() },
  }
  if (props.wide !== undefined) regionProps.wide = props.wide
  if (props.expandSidebar !== undefined) regionProps.expandSidebar = props.expandSidebar
  if (props.activateTab !== undefined) {
    regionProps.activateTab = () => { props.activateTab?.(DSH_BOT_SESSIONS_TAB_ID) }
  }

  const nestedRows: readonly WorkbenchSessionRow[] = nested
  const rosterProps: import('./BotRoster.tsx').BotRosterProps = {
    t: props.t,
    bots: bots.items,
    groups: groups.items,
    pendingBotIds: pending,
    lastMessages,
    sessionCounts,
    selectedId,
    currentSessionId: sessionSnap.current ?? null,
    nestedSessions: nestedRows,
    nestedStatus,
    onSelect,
    onSelectSession: (sessionId) => {
      if (!jumpToSession(props.sessions, sessionId) || selectedBot === undefined) {
        setNestedError(props.t('roster.hostNoOpen'))
        return
      }
      writeLastSession(selectedBot.id, sessionId)
    },
    onNewChat: (botId) => { void runSelect(botId, true) },
    onNewRoom,
    onRetrySelect: () => { lastAction.current() },
    onUnhide,
    onMenuAction: onMenu,
    onOpenOverlay: onOverlay,
  }
  if (props.wide !== undefined) rosterProps.wide = props.wide
  if (props.expandSidebar !== undefined) rosterProps.expandSidebar = props.expandSidebar
  if (nestedError !== null) rosterProps.nestedError = nestedError
  if (actionError !== null) rosterProps.actionError = actionError
  if (Object.keys(routineCounts).length > 0) rosterProps.routineCounts = routineCounts

  return (
    <BotRegion {...regionProps}>
      <BotRoster {...rosterProps} />
    </BotRegion>
  )
}

export interface BoundFooterProps {
  wide?: boolean
  t: (key: string, vars?: Record<string, string>) => string
  mode: SidebarModeStore
  roster: RosterRpc
  sessions?: SessionListFace
}

export function BoundModeFooter(props: BoundFooterProps): ReactElement {
  const bots = useSyncExternalStore(props.roster.bots.subscribe, props.roster.bots.getSnapshot, props.roster.bots.getSnapshot)
  const list = props.sessions?.list
  const sessionSnap = useSyncExternalStore(
    list?.subscribe ?? ((fn: () => void) => { void fn; return () => {} }),
    list?.getSnapshot ?? emptyList,
    list?.getSnapshot ?? emptyList,
  )
  const pending = pendingBotIds(bots.items, sessionSnap.byId)
  const unread = bots.items.reduce((sum, bot) => bot.hidden === true ? sum : sum + (bot.unread ?? 0), 0)
  const footerProps: import('./ModeFooterAction.tsx').ModeFooterActionProps = {
    mode: props.mode,
    t: props.t,
    unread,
    pending: pending.size > 0,
  }
  if (props.wide !== undefined) footerProps.wide = props.wide
  return <ModeFooterAction {...footerProps} />
}

export function BoundOverlay(props: {
  overlay: OverlayStore
  roster: RosterRpc
  t: (key: string, vars?: Record<string, string>) => string
  mode: SidebarModeStore
  sessions?: SessionListFace
  activateTab?: (id: string) => void
  selectedId: string | null
  onSelectedId: (id: string | null) => void
  onSelectBot: (botId: string) => void
}): ReactElement {
  const bots = useSyncExternalStore(props.roster.bots.subscribe, props.roster.bots.getSnapshot, props.roster.bots.getSnapshot)
  const groups = useSyncExternalStore(props.roster.groups.subscribe, props.roster.groups.getSnapshot, props.roster.groups.getSnapshot)
  const sessionsByBot = useSyncExternalStore(props.roster.sessionsByBot.subscribe, props.roster.sessionsByBot.getSnapshot, props.roster.sessionsByBot.getSnapshot)
  const current = props.selectedId !== null ? sessionsByBot[props.selectedId] : undefined
  return (
    <OverlayHost
      overlay={props.overlay}
      roster={props.roster}
      bots={bots.items}
      groups={groups.items}
      {...current !== undefined ? { sessions: current } : {}}
      selectedBotId={props.selectedId}
      mode={props.mode.getSnapshot()}
      t={props.t}
      onCreated={(id) => { props.onSelectedId(id) }}
      onDeleted={(id) => {
        if (props.selectedId === id) {
          props.onSelectedId(firstVisibleId(props.roster.bots.getSnapshot().items, props.roster.groups.getSnapshot().items, id))
        }
      }}
      onSelectBot={props.onSelectBot}
      onSelectGroup={(groupId) => {
        props.onSelectedId(groupId)
        void openGroup({
          groupId,
          tabId: DSH_BOT_SESSIONS_TAB_ID,
          ...props.activateTab !== undefined ? { activateTab: props.activateTab } : {},
        })
      }}
      onSelectSession={(sessionId) => { jumpToSession(props.sessions, sessionId) }}
      onSwitchMode={(next) => { props.mode.set(next) }}
    />
  )
}
