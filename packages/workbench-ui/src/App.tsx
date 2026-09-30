/**
 * Workbench shell: 280px roster + conversation stage (reference-ui-notes §A).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { notifyRoutineSpoke, shouldNotifyRoutine } from './notify.ts'
import {
  createBot,
  createBotSession,
  createGroup,
  createGroupSession,
  deleteBot,
  deleteGroup,
  groupDraftStorageKey,
  listBots,
  markRead,
  listBotSessions,
  listGroups,
  listGroupSessions,
  fetchBotModel,
  readDraft,
  reconcile,
  routineList,
  updateBot,
  updateBotLayout,
  updateGroup,
} from './api.ts'
import type {
  WorkbenchBot,
  WorkbenchBotModelInfo,
  WorkbenchGroup,
  WorkbenchModelOverride,
  WorkbenchSessionRow,
} from './api.ts'
import { rowPreview } from './avatar.ts'
import { groupRoomDisplayTitle, sessionDisplayTitle } from './session-binding.ts'
import { BotForm } from './BotForm.tsx'
import type { BotFormValues } from './BotForm.tsx'
import {
  buildCommandItems,
  CLEAR_COMMAND,
  CommandPalette,
  NEW_BOT_COMMAND,
  NEW_GROUP_COMMAND,
  parseIdentityCommand,
} from './CommandPalette.tsx'
import { Conversation } from './Conversation.tsx'
import { GroupForm } from './GroupForm.tsx'
import type { GroupFormValues } from './GroupForm.tsx'
import { RelationshipGraph } from './RelationshipGraph.tsx'
import { Roster } from './Roster.tsx'
import type { RosterItem, RosterSession } from './Roster.tsx'
import { useBotEvents } from './useBotEvents.ts'
import { useGlobalKeyboard } from './useGlobalKeyboard.ts'
import { usePoller } from './usePoller.ts'
import { groupRosterItems } from './roster-sections.ts'
import { formatWireError, readLastOwner, writeLastOwner, SELECT_GROUP_MESSAGE_TYPE } from 'dsh-bot-shared'
import type { WorkbenchWireError } from 'dsh-bot-shared'

type ShellStatus = 'loading' | 'idle' | 'error'
type FormMode =
  | { kind: 'create' }
  | { kind: 'edit'; bot: WorkbenchBot }
  | { kind: 'create-group' }
  | { kind: 'edit-group'; group: WorkbenchGroup }

/** Visible-only orphan-session labeling; SSE does not cover it. */
const RECONCILE_MS = 60_000
/** Roster polls without SSE. */
const POLL_MS = 2000
/** Roster safety polls once SSE is live; also the hidden-tab unread cadence for notifications. */
const POLL_SSE_MS = 15_000

function sameBot(a: WorkbenchBot, b: WorkbenchBot): boolean {
  return a.id === b.id
    && a.name === b.name
    && a.unread === b.unread
    && a.persona === b.persona
    && a.pinned === b.pinned
    && a.section === b.section
    && a.hidden === b.hidden
    && a.order === b.order
    && a.muted === b.muted
    && a.protected === b.protected
    && a.avatar.color === b.avatar.color
    && a.avatar.emoji === b.avatar.emoji
    && a.modelOverride?.provider === b.modelOverride?.provider
    && a.modelOverride?.model === b.modelOverride?.model
}

function sameBots(a: readonly WorkbenchBot[], b: readonly WorkbenchBot[]): boolean {
  return a.length === b.length && a.every((row, index) => sameBot(row, b[index]!))
}

const GROUP_MEMBER_MIN = 2
/** Collapsed roster categories survive reloads. */
const FOLDED_SECTIONS_KEY = 'dsh-bot:workbench:folded-sections'

function readFoldedSections(): ReadonlySet<string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(FOLDED_SECTIONS_KEY) ?? '[]')
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [])
  } catch {
    return new Set()
  }
}

function groupsAfterBotRemoved(
  rows: readonly WorkbenchGroup[],
  botId: string,
): WorkbenchGroup[] {
  return rows.flatMap(group => {
    if (!group.memberIds.includes(botId)) return [group]
    const memberIds = group.memberIds.filter(id => id !== botId)
    if (memberIds.length < GROUP_MEMBER_MIN) return []
    return [{ ...group, memberIds }]
  })
}


function overrideFromForm(values: BotFormValues): WorkbenchModelOverride | undefined {
  const provider = values.provider.trim()
  const model = values.model.trim()
  if (provider === '' && model === '') return undefined
  return { provider, model }
}

/**
 * Root layout. Loads listBots; conversation identity follows the selected row.
 */
export interface AppProps {
  readonly rosterTarget?: HTMLElement | null
  readonly onOpenOfficialSession?: (sessionId: string) => Promise<void> | void
  readonly onOpenSessionTool?: () => void
}

export function App(props: AppProps = {}) {
  const live = useBotEvents()
  const sseReady = live.sseReady
  const [status, setStatus] = useState<ShellStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const [bots, setBots] = useState<readonly WorkbenchBot[]>([])
  const [groups, setGroups] = useState<readonly WorkbenchGroup[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(readLastOwner)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [lastMessages, setLastMessages] = useState<Record<string, string>>({})
  const [workingIds, setWorkingIds] = useState<ReadonlySet<string>>(() => new Set())
  const [form, setForm] = useState<FormMode | null>(null)
  const [formBusy, setFormBusy] = useState(false)
  const [formError, setFormError] = useState<WorkbenchWireError | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [effectHint, setEffectHint] = useState<string | null>(null)
  const [botModel, setBotModel] = useState<WorkbenchBotModelInfo | null>(null)
  const [refreshEpoch, setRefreshEpoch] = useState(0)
  const [updatedAtById, setUpdatedAtById] = useState<Record<string, number>>({})
  const [sessionsByOwner, setSessionsByOwner] = useState<Record<string, readonly WorkbenchSessionRow[]>>({})
  const [graphOpen, setGraphOpen] = useState(false)
  const [preferredSessionId, setPreferredSessionId] = useState<string | null>(null)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [rosterCollapsed, setRosterCollapsed] = useState(false)
  const [foldedSections, setFoldedSections] = useState<ReadonlySet<string>>(readFoldedSections)
  const [routineCountByBot, setRoutineCountByBot] = useState<Record<string, number>>({})
  const submitLock = useRef(false)
  const workingOverlay = useRef(new Map<string, boolean>())
  const selectedIdRef = useRef(selectedId)
  const conversationOwned = useRef(new Set<string>())
  selectedIdRef.current = selectedId

  useEffect(() => {
    if (status === 'idle' && selectedId !== null) writeLastOwner(selectedId)
  }, [status, selectedId])

  useEffect(() => {
    const onMessage = (event: MessageEvent): void => {
      if (event.origin !== window.location.origin) return
      const data = event.data
      if (typeof data !== 'object' || data === null) return
      const body = data as { type?: unknown; groupId?: unknown; roomId?: unknown }
      if (body.type !== SELECT_GROUP_MESSAGE_TYPE) return
      if (typeof body.groupId !== 'string' || body.groupId.trim() === '') return
      setSelectedId(body.groupId)
      if (typeof body.roomId === 'string' && body.roomId.trim() !== '') {
        setPreferredSessionId(body.roomId)
      }
    }
    window.addEventListener('message', onMessage)
    return () => { window.removeEventListener('message', onMessage) }
  }, [])


  /** Newest listBots request; an older response must not overwrite a newer roster. */
  const botsRequest = useRef(0)
  /** Last unread count per bot the notifier has seen. */
  const unreadSeen = useRef(new Map<string, number>())

  /**
   * `background` keeps the shell mounted (roster move/pin/hide/markRead);
   * only the first load and 重试 show the loading screen.
   */
  const load = useCallback(async (background = false): Promise<void> => {
    if (!background) {
      setStatus('loading')
      setError(null)
    }
    const request = ++botsRequest.current
    const [botsOutcome, groupsOutcome, modelOutcome, routinesOutcome] = await Promise.all([
      listBots(),
      listGroups(),
      fetchBotModel(),
      routineList(),
    ])
    if (!botsOutcome.ok) {
      if (!background) {
        setStatus('error')
        setError(botsOutcome.error.message)
      }
      return
    }
    const rows = botsOutcome.value.bots
    if (request === botsRequest.current) {
      for (const bot of rows) unreadSeen.current.set(bot.id, bot.unread ?? 0)
      setBots(current => sameBots(current, rows) ? current : rows)
    }
    const groupRows = groupsOutcome.ok && Array.isArray(groupsOutcome.value.groups)
      ? groupsOutcome.value.groups
      : []
    setGroups(groupRows)
    setSelectedId(current => {
      if (current !== null && (rows.some(row => row.id === current) || groupRows.some(row => row.id === current))) {
        return current
      }
      return rows[0]?.id ?? groupRows[0]?.id ?? null
    })
    if (modelOutcome.ok) setBotModel(modelOutcome.value.botModel)
    if (routinesOutcome.ok && Array.isArray(routinesOutcome.value)) {
      const counts: Record<string, number> = {}
      for (const row of routinesOutcome.value) {
        counts[row.botId] = (counts[row.botId] ?? 0) + 1
      }
      setRoutineCountByBot(counts)
    }
    setStatus('idle')
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Routine notifications only fire for a hidden tab, so unread keeps a slow
  // poll there while the browser may still show them.
  const notifyWhileHidden = typeof Notification !== 'undefined' && Notification.permission !== 'denied'
  usePoller({
    enabled: status === 'idle',
    intervalMs: sseReady ? POLL_SSE_MS : POLL_MS,
    ...notifyWhileHidden ? { hiddenIntervalMs: POLL_SSE_MS } : {},
    run: async fresh => {
      const request = ++botsRequest.current
      const outcome = await listBots()
      if (!fresh() || request !== botsRequest.current || !outcome.ok) return
      const rows = outcome.value.bots
      for (const bot of rows) {
        const unread = bot.unread ?? 0
        const before = unreadSeen.current.get(bot.id) ?? 0
        if (shouldNotifyRoutine(bot.muted, unread, before)) {
          notifyRoutineSpoke(bot.id, bot.name, `有 ${unread} 条未读例程消息`)
        }
        unreadSeen.current.set(bot.id, unread)
      }
      setBots(current => sameBots(current, rows) ? current : rows)
    },
  })


  useEffect(() => {
    if (bots.length === 0 && groups.length === 0) return
    setDrafts(current => {
      let changed = false
      const next = { ...current }
      for (const bot of bots) {
        const draft = readDraft(bot.id)
        if ((next[bot.id] ?? '') !== draft) {
          next[bot.id] = draft
          changed = true
        }
      }
      for (const group of groups) {
        let draft = ''
        try {
          draft = localStorage.getItem(groupDraftStorageKey(group.id)) ?? ''
        } catch {
          draft = ''
        }
        if ((next[group.id] ?? '') !== draft) {
          next[group.id] = draft
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [bots, groups])

  usePoller({
    enabled: status === 'idle',
    intervalMs: RECONCILE_MS,
    immediate: true,
    run: async fresh => {
      const outcome = await reconcile()
      if (!fresh() || !outcome.ok) return
      if (outcome.value.labeled > 0) setRefreshEpoch(n => n + 1)
    },
  })

  const botsRef = useRef(bots)
  botsRef.current = bots
  const groupsRef = useRef(groups)
  groupsRef.current = groups
  // Membership changes (not unread/name churn) restart the roster poll with a fresh tick.
  const ownerKey = `${bots.map(bot => bot.id).join(',')}|${groups.map(group => group.id).join(',')}`

  usePoller({
    enabled: status === 'idle' && bots.length > 0,
    intervalMs: sseReady ? POLL_SSE_MS : POLL_MS,
    immediate: true,
    restartKey: ownerKey,
    run: async fresh => {
      const next = new Set<string>()
      const times: Record<string, number> = {}
      const listed: Record<string, readonly WorkbenchSessionRow[]> = {}
      await Promise.all([
        ...(sseReady ? [] : botsRef.current.map(async bot => {
          const outcome = await listBotSessions(bot.id)
          if (!outcome.ok) return
          const sessions = outcome.value.sessions ?? []
          if (sessions.some(row => row.working)) next.add(bot.id)
          let latest = 0
          for (const row of sessions) {
            latest = Math.max(latest, row.updatedAt, row.createdAt)
          }
          if (latest > 0) times[bot.id] = latest
          const selected = selectedIdRef.current
          if (bot.id !== selected || !conversationOwned.current.has(bot.id)) listed[bot.id] = sessions
        })),
        ...groupsRef.current.map(async group => {
          const outcome = await listGroupSessions(group.id)
          if (!outcome.ok) return
          const rooms = outcome.value.rooms ?? []
          const sessions: WorkbenchSessionRow[] = rooms.map(row => ({
            sessionId: row.roomId,
            title: groupRoomDisplayTitle(row.title, group.name, row.createdAt),
            tags: [],
            status: row.working === true ? 'live' : 'idle',
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            hidden: false,
            working: row.working === true,
          }))
          if (rooms.some(row => row.working === true)) next.add(group.id)
          let latest = 0
          for (const row of rooms) {
            latest = Math.max(latest, row.updatedAt, row.createdAt)
          }
          if (latest > 0) times[group.id] = latest
          const selected = selectedIdRef.current
          if (group.id !== selected || !conversationOwned.current.has(group.id)) listed[group.id] = sessions
        }),
      ])
      for (const [id, on] of workingOverlay.current) {
        if (on) next.add(id)
      }
      if (!fresh()) return
      setWorkingIds(current => {
        // With SSE live, bot rows were not polled: their working state is the stream's.
        if (sseReady) {
          const groupIds = new Set(groupsRef.current.map(group => group.id))
          for (const id of current) if (!groupIds.has(id)) next.add(id)
        }
        if (current.size === next.size && [...next].every(id => current.has(id))) return current
        return next
      })
      setUpdatedAtById(current => {
        const keys = Object.keys(times)
        if (keys.length === 0) return current
        let same = true
        for (const key of keys) {
          if (current[key] !== times[key]) {
            same = false
            break
          }
        }
        return same ? current : { ...current, ...times }
      })
      setSessionsByOwner(current => {
        const keys = Object.keys(listed)
        if (keys.length === 0) return current
        let same = true
        for (const key of keys) {
          const prev = current[key] ?? []
          const nextRows = listed[key] ?? []
          if (prev.length !== nextRows.length) {
            same = false
            break
          }
          if (prev.some((row, index) => row.sessionId !== nextRows[index]?.sessionId
            || row.updatedAt !== nextRows[index]?.updatedAt
            || row.working !== nextRows[index]?.working
            || row.title !== nextRows[index]?.title)) {
            same = false
            break
          }
        }
        return same ? current : { ...current, ...listed }
      })
    },
  })

  useEffect(() => {
    if (live.status.length === 0) return
    setBots(current => {
      let changed = false
      const next = current.map(bot => {
        const row = live.status.find(item => item.botId === bot.id)
        if (row === undefined || (bot.unread ?? 0) === row.unread) return bot
        changed = true
        return { ...bot, unread: row.unread }
      })
      return changed ? next : current
    })
    setWorkingIds(current => {
      const next = new Set(current)
      let changed = false
      for (const row of live.status) {
        if (row.working && !next.has(row.botId)) {
          next.add(row.botId)
          changed = true
        }
        if (!row.working && next.has(row.botId) && workingOverlay.current.get(row.botId) !== true) {
          next.delete(row.botId)
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [live.status])

  const selected = useMemo(
    () => bots.find(bot => bot.id === selectedId) ?? null,
    [bots, selectedId],
  )
  const selectedGroup = useMemo(
    () => groups.find(group => group.id === selectedId) ?? null,
    [groups, selectedId],
  )
  const groupMembers = useMemo(() => {
    if (selectedGroup === null) return []
    return selectedGroup.memberIds
      .map(id => bots.find(bot => bot.id === id))
      .filter((row): row is WorkbenchBot => row !== undefined)
  }, [bots, selectedGroup])

  const items: readonly RosterItem[] = useMemo(() => {
    const boundSessions = (ownerId: string, name: string, selected: boolean): {
      sessionCount: number
      sessions?: readonly RosterSession[]
    } => {
      const rows = sessionsByOwner[ownerId] ?? []
      return {
        sessionCount: rows.length,
        ...selected ? {
          sessions: rows.map(row => ({
            sessionId: row.sessionId,
            title: sessionDisplayTitle(row.title, name, { hidden: row.hidden }),
            updatedAt: row.updatedAt > 0 ? row.updatedAt : row.createdAt,
            working: row.working,
            hidden: row.hidden,
            selected: row.sessionId === activeSessionId,
          })),
        } : {},
      }
    }
    const botItems: RosterItem[] = bots.map(bot => {
      const selected = selectedGroup === null && bot.id === selectedId
      return {
        id: bot.id,
        name: bot.name,
        avatar: bot.avatar,
        preview: rowPreview(drafts[bot.id], lastMessages[bot.id]),
        updatedAt: updatedAtById[bot.id] ?? bot.createdAt,
        working: workingIds.has(bot.id),
        selected,
        protected: bot.protected,
        kind: 'bot',
        unread: bot.unread ?? 0,
        pinned: bot.pinned === true,
        section: bot.section ?? 'work',
        hidden: bot.hidden === true,
        order: bot.order ?? bot.createdAt,
        muted: bot.muted === true,
        modelLabel: bot.modelOverride?.model ?? botModel?.model ?? '默认模型',
        routineCount: routineCountByBot[bot.id] ?? 0,
        ...boundSessions(bot.id, bot.name, selected),
      }
    })
    const groupItems: RosterItem[] = groups.map(group => {
      const selected = group.id === selectedId && selectedGroup !== null
      return {
        id: group.id,
        name: group.name,
        avatar: {},
        preview: rowPreview(drafts[group.id], lastMessages[group.id]),
        updatedAt: updatedAtById[group.id] ?? group.createdAt,
        working: workingIds.has(group.id),
        selected,
        protected: false,
        kind: 'group',
        section: group.section ?? 'work',
        order: group.order ?? group.createdAt,
        members: group.memberIds.map(id => {
          const bot = bots.find(row => row.id === id)
          return {
            id,
            name: bot?.name ?? id,
            ...bot?.avatar.color === undefined ? {} : { color: bot.avatar.color },
            ...bot?.avatar.emoji === undefined ? {} : { emoji: bot.avatar.emoji },
          }
        }),
        ...boundSessions(group.id, group.name, selected),
      }
    })
    return [...botItems, ...groupItems].sort((a, b) => b.updatedAt - a.updatedAt)
  }, [activeSessionId, botModel, bots, drafts, groups, lastMessages, routineCountByBot, selectedGroup, selectedId, sessionsByOwner, updatedAtById, workingIds])

  const submitForm = async (values: BotFormValues): Promise<void> => {
    if (submitLock.current || form === null) return
    submitLock.current = true
    setFormBusy(true)
    setFormError(null)
    const avatar = {
      ...values.emoji.trim() === '' ? {} : { emoji: values.emoji.trim() },
      ...values.color.trim() === '' ? {} : { color: values.color.trim() },
    }
    const modelOverride = overrideFromForm(values)
    try {
      if (form.kind === 'create-group' || form.kind === 'edit-group') {
        return
      }
      if (form.kind === 'create') {
        const outcome = await createBot({
          name: values.name,
          persona: values.persona,
          ...Object.keys(avatar).length === 0 ? {} : { avatar },
          ...modelOverride === undefined ? {} : { modelOverride },
        })
        if (!outcome.ok) {
          setFormError(outcome.error)
          return
        }
        setBots(current => {
          const without = current.filter(row => row.id !== outcome.value.id)
          return [...without, outcome.value]
        })
        setSelectedId(outcome.value.id)
        setForm(null)
        setEffectHint(null)
        return
      }
      const outcome = await updateBot({
        id: form.bot.id,
        name: values.name,
        persona: values.persona,
        ...Object.keys(avatar).length === 0 ? {} : { avatar },
        modelOverride: modelOverride ?? null,
      })
      if (!outcome.ok) {
        setFormError(outcome.error)
        return
      }
      setBots(current => current.map(row => row.id === outcome.value.id ? outcome.value : row))
      setForm(null)
      setEffectHint('人设对之后的新对话生效')
    } finally {
      submitLock.current = false
      setFormBusy(false)
    }
  }

  const submitGroupForm = async (values: GroupFormValues): Promise<void> => {
    if (submitLock.current || form === null) return
    if (form.kind !== 'create-group' && form.kind !== 'edit-group') return
    submitLock.current = true
    setFormBusy(true)
    setFormError(null)
    try {
      if (form.kind === 'create-group') {
        const outcome = await createGroup({ name: values.name, memberIds: values.memberIds, rounds: values.rounds })
        if (!outcome.ok) {
          setFormError(outcome.error)
          return
        }
        setGroups(current => [...current.filter(row => row.id !== outcome.value.id), outcome.value])
        setSelectedId(outcome.value.id)
        setForm(null)
        setEffectHint(null)
        return
      }
      const outcome = await updateGroup({
        id: form.group.id,
        name: values.name,
        memberIds: values.memberIds,
        rounds: values.rounds,
      })
      if (!outcome.ok) {
        setFormError(outcome.error)
        return
      }
      setGroups(current => current.map(row => row.id === outcome.value.id ? outcome.value : row))
      setForm(null)
    } finally {
      submitLock.current = false
      setFormBusy(false)
    }
  }

  const renameBot = async (id: string, name: string): Promise<void> => {
    if (groups.some(row => row.id === id)) {
      const outcome = await updateGroup({ id, name })
      if (!outcome.ok) {
        setActionError(formatWireError(outcome.error))
        return
      }
      setActionError(null)
      setGroups(current => current.map(row => row.id === outcome.value.id ? outcome.value : row))
      return
    }
    const outcome = await updateBot({ id, name })
    if (!outcome.ok) {
      setActionError(formatWireError(outcome.error))
      return
    }
    setActionError(null)
    setBots(current => current.map(row => row.id === outcome.value.id ? outcome.value : row))
  }

  const removeGroup = async (id: string): Promise<void> => {
    const outcome = await deleteGroup(id)
    if (!outcome.ok) {
      setActionError(formatWireError(outcome.error))
      return
    }
    setActionError(null)
    setGroups(current => current.filter(row => row.id !== id))
    setSelectedId(current => current === id ? (bots[0]?.id ?? groups.find(row => row.id !== id)?.id ?? null) : current)
    setDrafts(current => {
      const next = { ...current }
      delete next[id]
      return next
    })
    if (form?.kind === 'edit-group' && form.group.id === id) setForm(null)
  }

  const removeBot = async (id: string): Promise<void> => {
    const outcome = await deleteBot(id)
    if (!outcome.ok) {
      setActionError(formatWireError(outcome.error))
      return
    }
    setActionError(null)
    const remainingBots = bots.filter(row => row.id !== id)
    setBots(remainingBots)
    let nextGroups = groupsAfterBotRemoved(groups, id)
    const listed = await listGroups()
    if (listed.ok && Array.isArray(listed.value.groups)) {
      nextGroups = groupsAfterBotRemoved(listed.value.groups, id)
    }
    setGroups(nextGroups)
    setSelectedId(current => {
      if (current !== null && (
        remainingBots.some(row => row.id === current)
        || nextGroups.some(row => row.id === current)
      )) {
        return current
      }
      return remainingBots[0]?.id ?? nextGroups[0]?.id ?? null
    })
    setEffectHint(null)
    const dropped = new Set([
      id,
      ...groups.filter(group => !nextGroups.some(row => row.id === group.id)).map(group => group.id),
    ])
    setDrafts(current => {
      const next = { ...current }
      for (const key of dropped) delete next[key]
      return next
    })
    setSessionsByOwner(current => {
      const next = { ...current }
      for (const key of dropped) delete next[key]
      return next
    })
    if (form?.kind === 'edit' && form.bot.id === id) setForm(null)
    if (form?.kind === 'edit-group') {
      const updated = nextGroups.find(row => row.id === form.group.id)
      if (updated === undefined) setForm(null)
      else if (updated !== form.group) setForm({ kind: 'edit-group', group: updated })
    }
  }

  const rememberSessions = (ownerId: string, rows: readonly WorkbenchSessionRow[]): void => {
    conversationOwned.current.add(ownerId)
    setSessionsByOwner(current => {
      const prev = current[ownerId] ?? []
      if (prev.length === rows.length
        && prev.every((row, index) => row.sessionId === rows[index]?.sessionId
          && row.title === rows[index]?.title
          && row.updatedAt === rows[index]?.updatedAt
          && row.working === rows[index]?.working
          && row.hidden === rows[index]?.hidden)) {
        return current
      }
      return { ...current, [ownerId]: rows }
    })
  }

  useEffect(() => {
    try {
      localStorage.setItem(FOLDED_SECTIONS_KEY, JSON.stringify([...foldedSections]))
    } catch {
      // blocked storage only loses persistence
    }
  }, [foldedSections])
  const toggleSection = (id: string): void => setFoldedSections(current => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const closePalette = useCallback(() => setPaletteOpen(false), [])
  const togglePalette = useCallback(() => setPaletteOpen(open => !open), [])
  const visibleRosterIds = useMemo(() => {
    const grouped = groupRosterItems(items)
    return grouped.visible.flatMap(bucket => (
      foldedSections.has(bucket.section.id) ? [] : bucket.items.map(row => row.id)
    ))
  }, [foldedSections, items])

  useGlobalKeyboard({
    enabled: status === 'idle',
    onTogglePalette: togglePalette,
    onToggleRoster: () => setRosterCollapsed(open => !open),
    onRosterIndex: index => {
      const id = visibleRosterIds[index]
      if (id === undefined) return
      setSelectedId(id)
      setPreferredSessionId(null)
      setForm(null)
    },
    onRosterMove: delta => {
      if (visibleRosterIds.length === 0) return
      const current = selectedId === null ? 0 : Math.max(0, visibleRosterIds.indexOf(selectedId))
      const next = Math.min(visibleRosterIds.length - 1, Math.max(0, current + delta))
      const id = visibleRosterIds[next]
      if (id === undefined) return
      setSelectedId(id)
      setPreferredSessionId(null)
      setForm(null)
    },
  })

  const commandItems = useMemo(() => buildCommandItems(
    bots.map(bot => ({
      id: bot.id,
      name: bot.name,
      updatedAt: updatedAtById[bot.id] ?? bot.createdAt,
      kind: 'bot' as const,
    })),
    groups.map(group => ({
      id: group.id,
      name: group.name,
      updatedAt: updatedAtById[group.id] ?? group.createdAt,
      kind: 'group' as const,
    })),
  ), [bots, groups, updatedAtById])

  const openOwnedSession = useCallback(async (ownerId: string): Promise<void> => {
    const group = groups.find(row => row.id === ownerId)
    if (group !== undefined) {
      const outcome = await createGroupSession(ownerId)
      if (!outcome.ok) {
        setActionError(formatWireError(outcome.error))
        return
      }
      setActionError(null)
      setSelectedId(ownerId)
      setPreferredSessionId(outcome.value.roomId)
      setRefreshEpoch(n => n + 1)
      return
    }
    const outcome = await createBotSession(ownerId)
    if (!outcome.ok) {
      setActionError(formatWireError(outcome.error))
      return
    }
    setActionError(null)
    setSelectedId(ownerId)
    setPreferredSessionId(outcome.value.sessionId)
    setRefreshEpoch(n => n + 1)
  }, [groups])

  const clearUnread = useCallback((botId: string): void => {
    setBots(current => current.map(bot => bot.id === botId && (bot.unread ?? 0) !== 0
      ? { ...bot, unread: 0 }
      : bot))
    void markRead(botId)
  }, [])

  const selectCommand = useCallback((id: string): void => {
    setPaletteOpen(false)
    if (id === NEW_BOT_COMMAND) {
      setFormError(null)
      setActionError(null)
      setEffectHint(null)
      setForm({ kind: 'create' })
      return
    }
    if (id === NEW_GROUP_COMMAND) {
      setFormError(null)
      setActionError(null)
      setEffectHint(null)
      setForm({ kind: 'create-group' })
      return
    }
    if (id === CLEAR_COMMAND) {
      const current = selectedIdRef.current
      if (current === null) return
      void openOwnedSession(current)
      return
    }
    const identity = parseIdentityCommand(id)
    if (identity === null) return
    setSelectedId(identity.id)
    setPreferredSessionId(null)
    setForm(null)
    setEffectHint(null)
    setActionError(null)
    if (identity.kind !== 'group') clearUnread(identity.id)
  }, [clearUnread, openOwnedSession])

  const placeRoster = (node: ReactNode): ReactNode => (
    props.rosterTarget != null ? createPortal(node, props.rosterTarget) : node
  )

  return (
    <div
      className="shell"
      data-testid="workbench-shell"
      data-roster="roster"
      data-status={status}
    >
      {status === 'loading' || status === 'error' ? (
        <>
          {placeRoster(
            <aside className="roster" data-testid="workbench-roster">
              <div className="rosterHead">人设</div>
              <div className="rosterBody">
                {status === 'loading' ? (
                  <p className="hint" data-testid="workbench-loading">加载中…</p>
                ) : (
                  <div className="stateBox" data-testid="workbench-error">
                    <p className="errorText">无法加载工作台</p>
                    <p className="hint">{error}</p>
                    <button type="button" className="retry" data-testid="workbench-retry" onClick={() => { void load() }}>
                      重试
                    </button>
                  </div>
                )}
              </div>
            </aside>,
          )}
          <main className="conversation" data-testid="workbench-conversation">
            <header className="conversationHead">对话</header>
            <div className="conversationBody">
              <p className="hint">
                {status === 'loading' ? '选择人设后在这里对话' : '网关不可达时不会白屏，修好后点重试。'}
              </p>
            </div>
          </main>
        </>
      ) : (
        <>
          {props.rosterTarget != null
            ? createPortal(
          <Roster
            items={items}
            error={actionError}
            onSelect={id => {
              setSelectedId(id)
              setPreferredSessionId(null)
              setForm(null)
              setEffectHint(null)
              setActionError(null)
              if (!groups.some(row => row.id === id)) clearUnread(id)
            }}
            onSelectSession={(ownerId, sessionId) => {
              setSelectedId(ownerId)
              setPreferredSessionId(sessionId)
              setForm(null)
              setEffectHint(null)
              setActionError(null)
              if (!groups.some(row => row.id === ownerId)) clearUnread(ownerId)
            }}
            onNewSession={id => { void openOwnedSession(id) }}
            onOpenGraph={() => setGraphOpen(true)}
            collapsed={rosterCollapsed}
            folded={foldedSections}
            onToggleSection={toggleSection}
            onLayout={input => {
              void (async () => {
                const outcome = await updateBotLayout(input)
                if (!outcome.ok) {
                  setActionError('没保住')
                  return
                }
                setActionError(null)
                await load(true)
              })()
            }}
            onMarkRead={id => {
              void (async () => {
                await markRead(id)
                await load(true)
              })()
            }}
            onCreate={() => {
              setFormError(null)
              setActionError(null)
              setEffectHint(null)
              setForm({ kind: 'create' })
            }}
            onCreateGroup={() => {
              setFormError(null)
              setActionError(null)
              setEffectHint(null)
              setForm({ kind: 'create-group' })
            }}
            onEdit={id => {
              const bot = bots.find(row => row.id === id)
              if (bot === undefined) return
              setFormError(null)
              setEffectHint(null)
              setForm({ kind: 'edit', bot })
              setSelectedId(id)
            }}
            onEditMembers={id => {
              const group = groups.find(row => row.id === id)
              if (group === undefined) return
              setFormError(null)
              setEffectHint(null)
              setForm({ kind: 'edit-group', group })
              setSelectedId(id)
            }}
            onDelete={id => { void removeBot(id) }}
            onDeleteGroup={id => { void removeGroup(id) }}
            onRename={(id, name) => { void renameBot(id, name) }}
          />
            , props.rosterTarget)
            : (
          <Roster
            items={items}
            error={actionError}
            onSelect={id => {
              setSelectedId(id)
              setPreferredSessionId(null)
              setForm(null)
              setEffectHint(null)
              setActionError(null)
              if (!groups.some(row => row.id === id)) clearUnread(id)
            }}
            onSelectSession={(ownerId, sessionId) => {
              setSelectedId(ownerId)
              setPreferredSessionId(sessionId)
              setForm(null)
              setEffectHint(null)
              setActionError(null)
              if (!groups.some(row => row.id === ownerId)) clearUnread(ownerId)
            }}
            onNewSession={id => { void openOwnedSession(id) }}
            onOpenGraph={() => setGraphOpen(true)}
            collapsed={rosterCollapsed}
            folded={foldedSections}
            onToggleSection={toggleSection}
            onLayout={input => {
              void (async () => {
                const outcome = await updateBotLayout(input)
                if (!outcome.ok) {
                  setActionError('没保住')
                  return
                }
                setActionError(null)
                await load(true)
              })()
            }}
            onMarkRead={id => {
              void (async () => {
                await markRead(id)
                await load(true)
              })()
            }}
            onCreate={() => {
              setFormError(null)
              setActionError(null)
              setEffectHint(null)
              setForm({ kind: 'create' })
            }}
            onCreateGroup={() => {
              setFormError(null)
              setActionError(null)
              setEffectHint(null)
              setForm({ kind: 'create-group' })
            }}
            onEdit={id => {
              const bot = bots.find(row => row.id === id)
              if (bot === undefined) return
              setFormError(null)
              setEffectHint(null)
              setForm({ kind: 'edit', bot })
              setSelectedId(id)
            }}
            onEditMembers={id => {
              const group = groups.find(row => row.id === id)
              if (group === undefined) return
              setFormError(null)
              setEffectHint(null)
              setForm({ kind: 'edit-group', group })
              setSelectedId(id)
            }}
            onDelete={id => { void removeBot(id) }}
            onDeleteGroup={id => { void removeGroup(id) }}
            onRename={(id, name) => { void renameBot(id, name) }}
          />
            )}
          <main className="conversation" data-testid="workbench-conversation">
            {selectedGroup !== null ? (
              <Conversation
                key={`group:${selectedGroup.id}`}
                group={selectedGroup}
                members={groupMembers}
                hint={effectHint}
                refreshEpoch={refreshEpoch}
                preferredSessionId={preferredSessionId}
                paletteOpen={paletteOpen}
                sseReady={live.sseReady}
                live={live}
                {...props.onOpenOfficialSession === undefined ? {} : { onOpenOfficialSession: props.onOpenOfficialSession }}
                {...props.onOpenSessionTool === undefined ? {} : { onOpenSessionTool: props.onOpenSessionTool }}
                onEditMembers={() => {
                  setFormError(null)
                  setForm({ kind: 'edit-group', group: selectedGroup })
                }}
                onActiveSession={setActiveSessionId}
                onSessions={rows => rememberSessions(selectedGroup.id, rows)}
                onWorking={(id, working) => {
                  workingOverlay.current.set(id, working)
                  setWorkingIds(current => {
                    const has = current.has(id)
                    if (working === has) return current
                    const next = new Set(current)
                    if (working) next.add(id)
                    else next.delete(id)
                    return next
                  })
                }}
                onWorkingDetach={id => {
                  workingOverlay.current.delete(id)
                }}
                onPreview={(id, preview) => {
                  setLastMessages(current => current[id] === preview ? current : { ...current, [id]: preview })
                }}
                onDraft={(id, text) => {
                  setDrafts(current => current[id] === text ? current : { ...current, [id]: text })
                }}
              />
            ) : selected === null ? (
              <>
                <header className="conversationHead"><span>对话</span></header>
                <div className="conversationBody">
                  <p className="hint">选择人设后在这里对话</p>
                </div>
              </>
            ) : (
              <Conversation
                key={selected.id}
                bot={selected}
                hint={effectHint}
                refreshEpoch={refreshEpoch}
                preferredSessionId={preferredSessionId}
                paletteOpen={paletteOpen}
                sseReady={live.sseReady}
                live={live}
                {...props.onOpenOfficialSession === undefined ? {} : { onOpenOfficialSession: props.onOpenOfficialSession }}
                {...props.onOpenSessionTool === undefined ? {} : { onOpenSessionTool: props.onOpenSessionTool }}
                onEdit={() => {
                  setFormError(null)
                  setForm({ kind: 'edit', bot: selected })
                }}
                onActiveSession={setActiveSessionId}
                onSessions={rows => rememberSessions(selected.id, rows)}
                onWorking={(id, working) => {
                  workingOverlay.current.set(id, working)
                  setWorkingIds(current => {
                    const has = current.has(id)
                    if (working === has) return current
                    const next = new Set(current)
                    if (working) next.add(id)
                    else next.delete(id)
                    return next
                  })
                }}
                onWorkingDetach={id => {
                  workingOverlay.current.delete(id)
                }}
                onPreview={(id, preview) => {
                  setLastMessages(current => current[id] === preview ? current : { ...current, [id]: preview })
                }}
                onDraft={(id, text) => {
                  setDrafts(current => current[id] === text ? current : { ...current, [id]: text })
                }}
              />
            )}
            {form !== null && (form.kind === 'create-group' || form.kind === 'edit-group') ? (
              <GroupForm
                key={form.kind === 'create-group' ? 'create-group' : `edit-group:${form.group.id}`}
                mode={form.kind === 'create-group' ? 'create' : 'edit'}
                bots={bots}
                {...form.kind === 'edit-group' ? { initial: form.group } : {}}
                busy={formBusy}
                error={formError}
                roundLocked={form.kind === 'edit-group' && workingIds.has(form.group.id)}
                onCancel={() => {
                  if (formBusy) return
                  setForm(null)
                }}
                onSubmit={values => { void submitGroupForm(values) }}
              />
            ) : null}
            {form !== null && (form.kind === 'create' || form.kind === 'edit') ? (
              <BotForm
                key={form.kind === 'create' ? 'create' : `edit-bot:${form.bot.id}`}
                mode={form.kind}
                {...form.kind === 'edit' ? { initial: form.bot } : {}}
                botModel={botModel}
                busy={formBusy}
                error={formError}
                hint={form.kind === 'edit' ? '人设对之后的新对话生效；记忆会随新会话一起注入' : null}
                onCancel={() => {
                  if (formBusy) return
                  setForm(null)
                }}
                onSubmit={values => { void submitForm(values) }}
              />
            ) : null}
          </main>
        </>
      )}
      <CommandPalette
        open={paletteOpen && status === 'idle'}
        items={commandItems}
        onSelect={selectCommand}
        onClose={closePalette}
      />
      <RelationshipGraph
        open={graphOpen}
        workingIds={workingIds}
        onClose={() => setGraphOpen(false)}
        onSelect={id => {
          setSelectedId(id)
          setPreferredSessionId(null)
          setForm(null)
          setGraphOpen(false)
          if (!groups.some(row => row.id === id)) clearUnread(id)
        }}
      />
    </div>
  )
}
