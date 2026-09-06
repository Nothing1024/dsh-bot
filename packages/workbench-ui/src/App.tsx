/**
 * Workbench shell: 280px roster + conversation stage (reference-ui-notes §A).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { notifyRoutineSpoke } from './notify.ts'
import {
  createBot,
  createBotSession,
  createGroup,
  createGroupSession,
  deleteBot,
  deleteGroup,
  groupDraftStorageKey,
  listBots,
  listBotSessions,
  listGroups,
  listGroupSessions,
  listSessionsModel,
  readDraft,
  reconcile,
  updateBot,
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
import { sessionDisplayTitle } from './session-binding.ts'
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
import { Roster } from './Roster.tsx'
import type { RosterItem, RosterSession } from './Roster.tsx'
import { useGlobalKeyboard } from './useGlobalKeyboard.ts'

type ShellStatus = 'loading' | 'idle' | 'error'
type FormMode =
  | { kind: 'create' }
  | { kind: 'edit'; bot: WorkbenchBot }
  | { kind: 'create-group' }
  | { kind: 'edit-group'; group: WorkbenchGroup }

const RECONCILE_MS = 30_000

function overrideFromForm(values: BotFormValues): WorkbenchModelOverride | undefined {
  const provider = values.provider.trim()
  const model = values.model.trim()
  if (provider === '' && model === '') return undefined
  return { provider, model }
}

/**
 * Root layout. Loads listBots; conversation identity follows the selected row.
 */
export function App() {
  const [status, setStatus] = useState<ShellStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const [bots, setBots] = useState<readonly WorkbenchBot[]>([])
  const [groups, setGroups] = useState<readonly WorkbenchGroup[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [lastMessages, setLastMessages] = useState<Record<string, string>>({})
  const [workingIds, setWorkingIds] = useState<ReadonlySet<string>>(() => new Set())
  const [form, setForm] = useState<FormMode | null>(null)
  const [formBusy, setFormBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [effectHint, setEffectHint] = useState<string | null>(null)
  const [botModel, setBotModel] = useState<WorkbenchBotModelInfo | null>(null)
  const [refreshEpoch, setRefreshEpoch] = useState(0)
  const [updatedAtById, setUpdatedAtById] = useState<Record<string, number>>({})
  const [sessionsByOwner, setSessionsByOwner] = useState<Record<string, readonly WorkbenchSessionRow[]>>({})
  const [preferredSessionId, setPreferredSessionId] = useState<string | null>(null)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const submitLock = useRef(false)
  const workingOverlay = useRef(new Map<string, boolean>())
  const selectedIdRef = useRef(selectedId)
  const conversationOwned = useRef(new Set<string>())
  selectedIdRef.current = selectedId

  const load = useCallback(async (): Promise<void> => {
    setStatus('loading')
    setError(null)
    const [botsOutcome, groupsOutcome, modelOutcome] = await Promise.all([
      listBots(),
      listGroups(),
      listSessionsModel(),
    ])
    if (!botsOutcome.ok) {
      setStatus('error')
      setError(botsOutcome.error.message)
      return
    }
    const rows = botsOutcome.value.bots
    setBots(rows)
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
    setStatus('idle')
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    let cancelled = false
    const prev = new Map<string, number>()
    const tick = async (): Promise<void> => {
      const outcome = await listBots()
      if (!outcome.ok || cancelled) return
      const rows = outcome.value.bots
      for (const bot of rows) {
        const unread = bot.unread ?? 0
        const before = prev.get(bot.id) ?? 0
        if (unread > before) notifyRoutineSpoke(bot.id, bot.name, `有 ${unread} 条未读例程消息`)
        prev.set(bot.id, unread)
      }
      setBots(rows)
    }
    void tick()
    const timer = window.setInterval(() => { void tick() }, 2000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])


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

  useEffect(() => {
    if (status !== 'idle') return
    let cancelled = false
    const run = async (): Promise<void> => {
      const outcome = await reconcile()
      if (cancelled || !outcome.ok) return
      setRefreshEpoch(n => n + 1)
    }
    void run()
    const timer = setInterval(() => { void run() }, RECONCILE_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [status])

  useEffect(() => {
    if (status !== 'idle' || bots.length === 0) return
    let cancelled = false
    const tick = async (): Promise<void> => {
      if (typeof document !== 'undefined' && document.hidden) return
      const next = new Set<string>()
      const times: Record<string, number> = {}
      const listed: Record<string, readonly WorkbenchSessionRow[]> = {}
      await Promise.all([
        ...bots.map(async bot => {
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
        }),
        ...groups.map(async group => {
          const outcome = await listGroupSessions(group.id)
          if (!outcome.ok) return
          const rooms = outcome.value.rooms ?? []
          const sessions: WorkbenchSessionRow[] = rooms.map(row => ({
            sessionId: row.roomId,
            title: `房间 ${row.roomId.slice(0, 8)}`,
            tags: [],
            status: 'idle',
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            hidden: false,
            working: false,
          }))
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
      if (cancelled) return
      setWorkingIds(current => {
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
    }
    void tick()
    const timer = setInterval(() => { void tick() }, 2000)
    const onVis = (): void => {
      if (typeof document !== 'undefined' && !document.hidden) void tick()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [bots, groups, status])

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
  }, [activeSessionId, bots, drafts, groups, lastMessages, selectedGroup, selectedId, sessionsByOwner, updatedAtById, workingIds])

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
          setFormError(outcome.error.message)
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
        setFormError(outcome.error.message)
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
        const outcome = await createGroup({ name: values.name, memberIds: values.memberIds })
        if (!outcome.ok) {
          setFormError(outcome.error.message)
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
      })
      if (!outcome.ok) {
        setFormError(outcome.error.message)
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
        setActionError(outcome.error.message)
        return
      }
      setActionError(null)
      setGroups(current => current.map(row => row.id === outcome.value.id ? outcome.value : row))
      return
    }
    const outcome = await updateBot({ id, name })
    if (!outcome.ok) {
      setActionError(outcome.error.message)
      return
    }
    setActionError(null)
    setBots(current => current.map(row => row.id === outcome.value.id ? outcome.value : row))
  }

  const removeGroup = async (id: string): Promise<void> => {
    const outcome = await deleteGroup(id)
    if (!outcome.ok) {
      setActionError(outcome.error.message)
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
      setActionError(outcome.error.message)
      return
    }
    setActionError(null)
    setBots(current => current.filter(row => row.id !== id))
    setSelectedId(current => current === id ? (bots.find(row => row.id !== id)?.id ?? null) : current)
    setEffectHint(null)
    setDrafts(current => {
      const next = { ...current }
      delete next[id]
      return next
    })
    if (form?.kind === 'edit' && form.bot.id === id) setForm(null)
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

  const closePalette = useCallback(() => setPaletteOpen(false), [])
  const togglePalette = useCallback(() => setPaletteOpen(open => !open), [])
  useGlobalKeyboard({
    enabled: status === 'idle',
    paletteOpen,
    onTogglePalette: togglePalette,
    onClosePalette: closePalette,
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
        setActionError(outcome.error.message)
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
      setActionError(outcome.error.message)
      return
    }
    setActionError(null)
    setSelectedId(ownerId)
    setPreferredSessionId(outcome.value.sessionId)
    setRefreshEpoch(n => n + 1)
  }, [groups])

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
  }, [openOwnedSession])

  return (
    <div
      className="shell"
      data-testid="workbench-shell"
      data-roster="roster"
      data-status={status}
    >
      {status === 'loading' ? (
        <>
          <aside className="roster" data-testid="workbench-roster">
            <div className="rosterHead">人设</div>
            <div className="rosterBody">
              <p className="hint" data-testid="workbench-loading">加载中…</p>
            </div>
          </aside>
          <main className="conversation" data-testid="workbench-conversation">
            <header className="conversationHead">对话</header>
            <div className="conversationBody">
              <p className="hint">选择人设后在这里对话</p>
            </div>
          </main>
        </>
      ) : status === 'error' ? (
        <>
          <aside className="roster" data-testid="workbench-roster">
            <div className="rosterHead">人设</div>
            <div className="rosterBody">
              <div className="stateBox" data-testid="workbench-error">
                <p className="errorText">无法加载工作台</p>
                <p className="hint">{error}</p>
                <button type="button" className="retry" data-testid="workbench-retry" onClick={() => { void load() }}>
                  重试
                </button>
              </div>
            </div>
          </aside>
          <main className="conversation" data-testid="workbench-conversation">
            <header className="conversationHead">对话</header>
            <div className="conversationBody">
              <p className="hint">网关不可达时不会白屏，修好后点重试。</p>
            </div>
          </main>
        </>
      ) : (
        <>
          <Roster
            items={items}
            error={actionError}
            onSelect={id => {
              setSelectedId(id)
              setPreferredSessionId(null)
              setForm(null)
              setEffectHint(null)
              setActionError(null)
            }}
            onSelectSession={(ownerId, sessionId) => {
              setSelectedId(ownerId)
              setPreferredSessionId(sessionId)
              setForm(null)
              setEffectHint(null)
              setActionError(null)
            }}
            onNewSession={id => { void openOwnedSession(id) }}
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
          <main className="conversation" data-testid="workbench-conversation">
            {form !== null && (form.kind === 'create-group' || form.kind === 'edit-group') ? (
              <GroupForm
                key={form.kind === 'create-group' ? 'create-group' : form.group.id}
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
            ) : form !== null && (form.kind === 'create' || form.kind === 'edit') ? (
              <BotForm
                key={form.kind === 'create' ? 'create' : form.bot.id}
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
            ) : selectedGroup !== null ? (
              <Conversation
                key={`group:${selectedGroup.id}`}
                group={selectedGroup}
                members={groupMembers}
                hint={effectHint}
                refreshEpoch={refreshEpoch}
                preferredSessionId={preferredSessionId}
                paletteOpen={paletteOpen}
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
          </main>
        </>
      )}
      <CommandPalette
        open={paletteOpen && status === 'idle'}
        items={commandItems}
        onSelect={selectCommand}
        onClose={closePalette}
      />
    </div>
  )
}
