/**
 * Conversation stage: identity header, session switcher, transcript, composer.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { formatWireError } from 'dsh-bot-shared'
import {
  createBotSession,
  createGroupSession,
  draftStorageKey,
  groupDraftStorageKey,
  history,
  listBotSessions,
  listGroupSessions,
  memoryCount,
  memoryForget,
  memoryList,
  memoryRemember,
  memoryClear,
  peerLog,
  routineList,
  routinePreview,
  routineCreate,
  routineUpdate,
  routineDelete,
  approvalRespond,
  cancel,
  cancelQueued,
  continueDiscussion,
  deleteGroupSession,
  prompt,
  questionRespond,
  retryMember,
} from './api.ts'
import type {
  MemoryListValue,
  RoutineRow,
  WorkbenchBot,
  WorkbenchGroup,
  WorkbenchHistoryItem,
  WorkbenchSessionRow,
} from './api.ts'
import { resolveResponders } from './mentions.ts'
import { hashAvatarColor } from './avatar.ts'
import { Persona } from './Persona.tsx'
import { Composer } from './Composer.tsx'
import type { ComposerReplyTo } from './Composer.tsx'
import { MemoryPanel } from './MemoryPanel.tsx'
import { PeersPanel } from './PeersPanel.tsx'
import { RoutinesPanel } from './RoutinesPanel.tsx'
import { Transcript } from './Transcript.tsx'
import type { TranscriptSpeaker } from './Transcript.tsx'

import { ESCAPE_PRIORITY, moveMenuFocus, SessionRename, useEscapeLayer } from './interactions.tsx'
import { isChildBotSession } from './jump.ts'
import { SessionJumpMenuItem, SessionList } from './SessionList.tsx'
import type { SessionChoice } from './SessionList.tsx'
import {
  groupRoomDisplayTitle,
  pickBoundSession,
  readLastSession,
  sessionDisplayTitle,
  writeLastSession,
} from './session-binding.ts'
import { mergeLiveItems, mergeGroupStream } from './useBotEvents.ts'
import type { BotLiveState } from './useBotEvents.ts'
import { useSessionPoll } from './useSessionPoll.ts'

/** Group room safety poll while SSE is ready (full snapshot: member switches, cancels). */
const GROUP_SSE_POLL_MS = 5000

export interface ConversationProps {
  readonly bot?: WorkbenchBot
  readonly group?: WorkbenchGroup
  readonly members?: readonly WorkbenchBot[]
  readonly hint?: string | null
  readonly refreshEpoch?: number
  readonly preferredSessionId?: string | null
  readonly roundLocked?: boolean
  readonly paletteOpen?: boolean
  readonly onEdit?: () => void
  readonly onEditMembers?: () => void
  readonly onWorking?: (botId: string, working: boolean) => void
  readonly onWorkingDetach?: (botId: string) => void
  readonly onPreview?: (botId: string, preview: string) => void
  readonly onDraft?: (botId: string, text: string) => void
  readonly onActiveSession?: (sessionId: string | null) => void
  readonly onSessions?: (sessions: readonly WorkbenchSessionRow[]) => void
  readonly onOpenOfficialSession?: (sessionId: string) => Promise<void> | void
  readonly onOpenSessionTool?: () => void
  readonly sseReady?: boolean
  readonly live?: Pick<BotLiveState, 'stream' | 'cards' | 'epoch'> & Partial<Pick<BotLiveState, 'streams'>>
}

function resolveSpeaking(
  speaking: { readonly botId: string; readonly name: string } | null,
  members: readonly WorkbenchBot[],
): TranscriptSpeaker | null {
  if (speaking === null) return null
  const member = members.find(row => row.id === speaking.botId)
  if (member === undefined) return speaking
  return {
    botId: speaking.botId,
    name: speaking.name,
    avatar: member.avatar,
  }
}

function lastPreview(items: readonly WorkbenchHistoryItem[]): string {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i]!
    if (item.kind === 'message' && item.text !== undefined && item.text.trim() !== '') return item.text
  }
  return ''
}

/**
 * Header + transcript + composer for one selected bot.
 */
function roomsToSessions(
  rooms: readonly { roomId?: string; title?: string; createdAt?: number; updatedAt?: number; working?: boolean }[],
  groupName: string,
): WorkbenchSessionRow[] {
  return rooms.flatMap(row => {
    const roomId = row.roomId
    if (typeof roomId !== 'string' || roomId === '') return []
    return [{
      sessionId: roomId,
      title: groupRoomDisplayTitle(row.title, groupName, row.createdAt ?? 0),
      tags: [],
      status: row.working === true ? 'live' as const : 'idle' as const,
      createdAt: row.createdAt ?? 0,
      updatedAt: row.updatedAt ?? 0,
      hidden: false,
      working: row.working === true,
    }]
  })
}

function toChoices(
  rows: readonly WorkbenchSessionRow[],
  identityName: string,
  sessionId: string | null,
): SessionChoice[] {
  return rows.map(row => ({
    sessionId: row.sessionId,
    title: sessionDisplayTitle(row.title, identityName, { hidden: row.hidden }),
    updatedAt: row.updatedAt > 0 ? row.updatedAt : row.createdAt,
    working: row.working,
    hidden: row.hidden,
    child: isChildBotSession(row.tags),
    selected: row.sessionId === sessionId,
  }))
}

export function Conversation(props: ConversationProps) {
  const group = props.group
  const isGroup = group !== undefined
  const bot = props.bot
  const identityId = isGroup ? group.id : bot?.id ?? ''
  const identityName = isGroup ? group.name : bot?.name ?? ''
  const members = props.members ?? []
  const [sessionsLoaded, setSessionsLoaded] = useState(false)
  const [sessions, setSessions] = useState<readonly WorkbenchSessionRow[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [pending, setPending] = useState<{ text: string; sinceSeq: number; messageId?: string; replyTo?: ComposerReplyTo; failed?: boolean } | null>(null)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [sendCode, setSendCode] = useState<string | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [awaitingTurn, setAwaitingTurn] = useState(false)
  const [includeHidden, setIncludeHidden] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [panel, setPanel] = useState<'memory' | 'routines' | 'peers' | null>(null)
  const [memory, setMemory] = useState<MemoryListValue | null>(null)
  const [memoryUnavailable, setMemoryUnavailable] = useState(false)
  const [routines, setRoutines] = useState<readonly RoutineRow[]>([])
  const [peerCount, setPeerCount] = useState(0)
  const [pinPick, setPinPick] = useState<string | null>(null)
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [currentMenuOpen, setCurrentMenuOpen] = useState(false)
  const [replyTo, setReplyTo] = useState<ComposerReplyTo | null>(null)
  const [continuing, setContinuing] = useState(false)
  const [deleteRoom, setDeleteRoom] = useState<{ sessionId: string; title: string } | null>(null)
  const [deletingRoom, setDeletingRoom] = useState(false)
  const [deleteRoomError, setDeleteRoomError] = useState<string | null>(null)
  const deleteCancelRef = useRef<HTMLButtonElement>(null)
  const deleteTitleId = useId()
  const retryRequest = useRef<{ sessionId: string; text: string; replyToSeq?: number; requestId: string } | null>(null)
  const switcherRef = useRef<HTMLDivElement>(null)
  const switcherMenuId = useId()
  const sawWorkingRef = useRef(false)
  const sendSeqRef = useRef(-1)
  const groupCreateRef = useRef<ReturnType<typeof createGroupSession> | null>(null)
  const sessionIdRef = useRef(sessionId)
  const loadGeneration = useRef(0)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  const includeHiddenRef = useRef(includeHidden)
  const onSessionsRef = useRef(props.onSessions)
  const onActiveSessionRef = useRef(props.onActiveSession)
  onSessionsRef.current = props.onSessions
  onActiveSessionRef.current = props.onActiveSession
  sessionIdRef.current = sessionId

  const loadSessions = useCallback(async (prefer: string | null): Promise<string | null> => {
    const generation = ++loadGeneration.current
    const selectedAtStart = sessionIdRef.current
    const current = (): boolean => mounted.current && generation === loadGeneration.current
      && sessionIdRef.current === selectedAtStart
    if (isGroup) {
      const listed = await listGroupSessions(group.id)
      if (!current()) return sessionIdRef.current
      if (!listed.ok) {
        setListError(formatWireError(listed.error))
        return prefer
      }
      let rooms = listed.value.rooms ?? []
      if (rooms.length === 0) {
        if (groupCreateRef.current === null) {
          groupCreateRef.current = createGroupSession(group.id)
        }
        const created = await groupCreateRef.current
        if (!current()) return sessionIdRef.current
        if (!created.ok) {
          groupCreateRef.current = null
          setListError(formatWireError(created.error))
          return prefer
        }
        rooms = [created.value]
      } else {
        groupCreateRef.current = null
      }
      setListError(null)
      const rows = roomsToSessions(rooms, group.name)
      setSessions(rows)
      onSessionsRef.current?.(rows)
      const keep = pickBoundSession(rows.map(row => row.sessionId), prefer, readLastSession(identityId))
      setSessionId(keep)
      return keep
    }
    if (bot === undefined) return prefer
    const outcome = await listBotSessions(bot.id, includeHidden)
    if (!current()) return sessionIdRef.current
    if (!outcome.ok) {
      setListError(formatWireError(outcome.error))
      return prefer
    }
    setListError(null)
    const rows = outcome.value.sessions ?? []
    setSessions(rows)
    onSessionsRef.current?.(rows)
    const keep = pickBoundSession(rows.map(row => row.sessionId), prefer, readLastSession(identityId))
    setSessionId(keep)
    return keep
  }, [bot, group, identityId, includeHidden, isGroup])
  const loadSessionsRef = useRef(loadSessions)
  loadSessionsRef.current = loadSessions

  useEffect(() => {
    let cancelled = false
    setPending(null)
    setSendError(null)
    setSendCode(null)
    setAwaitingTurn(false)
    setToast(null)
    setSwitcherOpen(false)
    setCurrentMenuOpen(false)
    setReplyTo(null)
    sawWorkingRef.current = false
    setSessionId(null)
    setSessionsLoaded(false)
    const prefer = props.preferredSessionId ?? readLastSession(identityId)
    void loadSessions(prefer).then(id => {
      if (cancelled) return
      if (id !== null) setSessionId(id)
      setSessionsLoaded(true)
    })
    return () => {
      cancelled = true
    }
    // Reload when the selected bot/group identity changes, not when list helpers churn.
  }, [identityId])

  useEffect(() => {
    const id = props.preferredSessionId
    if (id === undefined || id === null) return
    if (id === sessionIdRef.current) return
    if (sessions.some(row => row.sessionId === id)) {
      setSessionId(id)
      setPending(null)
      setSwitcherOpen(false)
      setCurrentMenuOpen(false)
      return
    }
    void loadSessionsRef.current(id)
  }, [props.preferredSessionId, sessions])

  useEffect(() => {
    if (identityId === '') return
    if (sessionId !== null) writeLastSession(identityId, sessionId)
    onActiveSessionRef.current?.(sessionId)
  }, [identityId, sessionId])

  useEffect(() => {
    if (switcherOpen === false && currentMenuOpen === false) return
    const onDoc = (event: Event): void => {
      const target = event.target as Node | null
      if (target !== null && switcherRef.current?.contains(target) === true) return
      setSwitcherOpen(false)
      setCurrentMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [switcherOpen, currentMenuOpen])

  useEscapeLayer(panel !== null, () => setPanel(null), { priority: ESCAPE_PRIORITY.panel })
  useEscapeLayer(switcherOpen, () => setSwitcherOpen(false), {
    priority: ESCAPE_PRIORITY.menu,
    initialFocus: () => document.getElementById(switcherMenuId)?.querySelector<HTMLElement>('[role^="menuitem"]'),
  })
  useEscapeLayer(currentMenuOpen, () => setCurrentMenuOpen(false), {
    priority: ESCAPE_PRIORITY.menu,
    initialFocus: () => document.getElementById(`${switcherMenuId}-current`)?.querySelector<HTMLElement>('[role^="menuitem"]'),
  })

  useEffect(() => {
    if (switcherOpen) void loadSessionsRef.current(sessionIdRef.current)
  }, [switcherOpen])

  useEffect(() => {
    if (toast === null) return
    const timer = window.setTimeout(() => setToast(null), 4000)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (includeHiddenRef.current === includeHidden) return
    includeHiddenRef.current = includeHidden
    void loadSessions(sessionIdRef.current)
  }, [includeHidden, loadSessions])

  useEffect(() => {
    if (props.refreshEpoch === undefined || props.refreshEpoch === 0) return
    void loadSessionsRef.current(props.preferredSessionId ?? sessionIdRef.current)
  }, [props.preferredSessionId, props.refreshEpoch])

  const poll = useSessionPoll({
    sessionId,
    // Stopping a room updates previously accepted messages, including queued ones.
    // A last-sequence cursor cannot represent those updates across tabs.
    incremental: !isGroup,
    enabled: sessionId !== null,
    sseReady: props.sseReady === true,
    // Member sessions stream over SSE and their user/message / turn/end bump a
    // refresh; the slow full poll still catches member switches and cancels.
    ...isGroup ? { sseIntervalMs: GROUP_SSE_POLL_MS } : {},
    load: history,
  })

  const executionId = isGroup ? poll.speaking?.sessionId : sessionId
  const liveStream = props.live?.streams?.find(row => row.sessionId === executionId)
    ?? (props.live?.stream?.sessionId === executionId ? props.live?.stream ?? null : null)
  const baseItems = mergeLiveItems(
    poll.items,
    sessionId,
    isGroup ? null : liveStream,
    props.live?.cards ?? [],
  )
  const liveItems = isGroup ? mergeGroupStream(baseItems, sessionId, liveStream, poll.speaking, members) : baseItems
  const showingLiveReply = liveItems.some(item => item.streaming === true
    || (item.role === 'assistant' && item.pending === true))

  const memoryBotId = bot?.id
  useEffect(() => {
    if (isGroup || memoryBotId === undefined) return
    let cancelled = false
    void memoryList(memoryBotId).then(result => {
      if (cancelled) return
      if (!result.ok) {
        setMemoryUnavailable(true)
        return
      }
      setMemoryUnavailable(false)
      setMemory({
        profile: result.value.profile ?? [],
        log: result.value.log ?? [],
      })
    })
    return () => { cancelled = true }
  }, [isGroup, memoryBotId, poll.working])

  const botId = bot?.id
  const routinesOpen = panel === 'routines'
  useEffect(() => {
    if (isGroup || botId === undefined) return
    let cancelled = false
    let loading = false
    const refresh = async (): Promise<void> => {
      if (loading) return
      loading = true
      try {
        const result = await routineList(botId)
        if (!cancelled && result.ok) setRoutines(Array.isArray(result.value) ? result.value : [])
      } finally {
        loading = false
      }
    }
    void refresh()
    const timer = routinesOpen ? window.setInterval(() => { void refresh() }, 5000) : undefined
    return () => {
      cancelled = true
      if (timer !== undefined) window.clearInterval(timer)
    }
  }, [botId, isGroup, routinesOpen])

  useEffect(() => {
    if (isGroup || botId === undefined) return
    let cancelled = false
    void peerLog(botId).then(result => {
      if (cancelled) return
      if (result.ok) setPeerCount(result.value.length)
    })
    return () => { cancelled = true }
  }, [botId, isGroup, props.refreshEpoch])

  const working = poll.working || sending || awaitingTurn
  const onWorking = props.onWorking
  const onWorkingDetach = props.onWorkingDetach
  const onPreview = props.onPreview
  useEffect(() => {
    onWorking?.(identityId, working)
  }, [identityId, onWorking, working])
  useEffect(() => {
    const id = identityId
    return () => { onWorkingDetach?.(id) }
  }, [identityId, onWorkingDetach])

  useEffect(() => {
    const preview = lastPreview(poll.items)
    if (preview !== '') onPreview?.(identityId, preview)
  }, [identityId, onPreview, poll.items])

  const liveEpoch = props.live?.epoch ?? 0
  useEffect(() => {
    if (liveEpoch === 0) return
    poll.refresh()
  }, [liveEpoch, poll.refresh])

  useEffect(() => {
    if (!awaitingTurn) return
    // A poll that cannot read the session can never report the turn's end, so
    // the wait must end here or the composer stays on "停止" forever.
    if (poll.error !== null) {
      setAwaitingTurn(false)
      return
    }
    if (poll.working) sawWorkingRef.current = true
    const hasReply = poll.items.some(item => (
      item.kind === 'message'
      && item.role === 'assistant'
      && item.seq > sendSeqRef.current
    ))
    if ((sawWorkingRef.current && !poll.working) || hasReply) {
      setAwaitingTurn(false)
    }
  }, [awaitingTurn, poll.error, poll.items, poll.working])

  useEffect(() => {
    if (pending === null || pending.failed === true) return
    const hasUser = poll.items.some(item => (
      item.kind === 'message' && item.role === 'user' && (pending.messageId !== undefined
        ? item.id === pending.messageId : item.text === pending.text && item.seq > pending.sinceSeq)
    ))
    if (hasUser) setPending(null)
  }, [pending, poll.items])

  const openNew = async (): Promise<void> => {
    if (isGroup) {
      const outcome = await createGroupSession(group.id)
      if (!outcome.ok) {
        setListError(formatWireError(outcome.error))
        return
      }
      setPending(null)
      setSendError(null)
      setAwaitingTurn(false)
      await loadSessions(outcome.value.roomId)
      setSessionId(outcome.value.roomId)
      return
    }
    if (bot === undefined) return
    const outcome = await createBotSession(bot.id)
    if (!outcome.ok) {
      setListError(formatWireError(outcome.error))
      return
    }
    setPending(null)
    setSendError(null)
    setAwaitingTurn(false)
    await loadSessions(outcome.value.sessionId)
    setSessionId(outcome.value.sessionId)
  }

  const send = async (text: string): Promise<boolean> => {
    if (isGroup) {
      const mention = resolveResponders(text, members, replyTo?.botId)
      if (mention.unmatched) {
        setSendCode('invalid-mention')
        setSendError(`无法识别或存在重名：${mention.unmatchedHandles.join('、')}`)
        return false
      }
    }
    const sinceSeq = poll.items.reduce((max, item) => Math.max(max, item.seq), -1)
    let id = sessionId
    const current = (): boolean => mounted.current && sessionIdRef.current === id
    setSending(true)
    setSendError(null)
    setSendCode(null)
    setToast(null)
    setPending({ text, sinceSeq, ...replyTo === null ? {} : { replyTo } })
    try {
      if (id === null) {
        if (isGroup) {
          const created = await createGroupSession(group.id)
          if (!created.ok) {
            setSendError(created.error.message)
            setSendCode(created.error.code ?? 'internal')
            setPending({ text, sinceSeq, failed: true })
            return false
          }
          id = created.value.roomId
        } else {
          if (bot === undefined) return false
          const created = await createBotSession(bot.id)
          if (!created.ok) {
            setSendError(created.error.message)
            setSendCode(created.error.code ?? 'internal')
            setPending({ text, sinceSeq, failed: true })
            return false
          }
          id = created.value.sessionId
        }
        setSessionId(id)
        await loadSessions(id)
      }
      const previous = retryRequest.current
      const request = previous?.sessionId === id && previous.text === text && previous.replyToSeq === replyTo?.seq
        ? previous : { sessionId: id, text, requestId: crypto.randomUUID(), ...replyTo === null ? {} : { replyToSeq: replyTo.seq } }
      retryRequest.current = request
      const outcome = await prompt(id, text, 'queue', isGroup ? {
        requestId: request.requestId,
        ...request.replyToSeq === undefined ? {} : { replyToSeq: request.replyToSeq },
      } : {})
      if (!current()) return outcome.ok
      if (!outcome.ok) {
        setSendError(outcome.error.message)
        setSendCode(outcome.error.code ?? 'internal')
        // queue-full: nothing was accepted; the draft (and reply card) stay in the composer.
        setPending(outcome.error.code === 'queue-full' ? null : { text, sinceSeq, failed: true })
        setAwaitingTurn(false)
        return false
      }
      if (outcome.value.queued === true) {
        // BR-002: nothing persisted yet; the queued row comes from history, not a pending bubble.
        retryRequest.current = null
        setReplyTo(null)
        setPending(null)
        poll.refresh()
        return true
      }
      retryRequest.current = null
      setReplyTo(null)
      const messageId = outcome.value.messageId
      if (messageId !== undefined) setPending(current => current === null ? null : { ...current, messageId })
      sendSeqRef.current = sinceSeq
      sawWorkingRef.current = false
      setAwaitingTurn(!isGroup)
      poll.refresh()
      void loadSessions(sessionIdRef.current)
      return true
    } finally {
      setSending(false)
    }
  }

  const color = !isGroup && bot !== undefined
    ? (bot.avatar.color !== '' ? bot.avatar.color : hashAvatarColor(bot.id))
    : '#5b8def'
  const empty = sessionsLoaded && poll.ready && poll.items.length === 0 && pending === null && !working && poll.error === null && listError === null
  const transcriptLoading = pending === null && (!sessionsLoaded || (sessionId !== null && !poll.ready))
  const composerWorking = poll.working || awaitingTurn
  const speaking = resolveSpeaking(poll.speaking, members)
  const currentTitle = sessionId === null
    ? undefined
    : sessions.find(row => row.sessionId === sessionId)?.title

  const stopGeneration = async (): Promise<void> => {
    if (sessionId === null) return
    const outcome = await cancel(sessionId)
    if (!outcome.ok) {
      setSendError(outcome.error.message)
      setSendCode(outcome.error.code ?? 'internal')
      return
    }
    setAwaitingTurn(false)
    const dropped = outcome.value.dropped ?? 0
    if (dropped > 0) setToast(`已停止，排队的 ${dropped} 条未发送`)
    poll.refresh()
  }

  const hasMemberLine = poll.items.some(item => item.kind === 'message' && item.role === 'assistant'
    && item.error === undefined && item.author !== undefined)
  const continueBlocked = working || poll.queued.length > 0
    ? '讨论进行中'
    : hasMemberLine ? null : '先发一条消息开始讨论'

  const startContinue = async (): Promise<void> => {
    if (sessionId === null || continuing) return
    setContinuing(true)
    try {
      const outcome = await continueDiscussion(sessionId)
      if (!mounted.current) return
      if (!outcome.ok) {
        setToast(outcome.error.message === 'room is busy' ? '讨论进行中，稍后再继续' : formatWireError(outcome.error))
        return
      }
      poll.refresh()
    } finally {
      if (mounted.current) setContinuing(false)
    }
  }

  const cancelQueuedRow = async (queueId: string): Promise<void> => {
    if (sessionId === null) return
    const outcome = await cancelQueued(sessionId, queueId)
    if (!mounted.current) return
    if (!outcome.ok) {
      setToast(outcome.error.code === 'not-found' ? '这条已开始讨论，无法取消' : formatWireError(outcome.error))
    }
    poll.refresh()
  }

  const openDeleteRoom = (id: string, title: string): void => {
    setSwitcherOpen(false)
    setDeleteRoomError(null)
    setDeleteRoom({ sessionId: id, title })
  }

  const closeDeleteRoom = (): void => {
    setDeleteRoom(null)
    setDeleteRoomError(null)
    switcherRef.current?.querySelector<HTMLElement>('.sessionSwitchBtn')?.focus()
  }

  useEscapeLayer(deleteRoom !== null, () => { if (!deletingRoom) closeDeleteRoom() }, {
    priority: ESCAPE_PRIORITY.dialog,
    initialFocus: () => deleteCancelRef.current,
  })

  const confirmDeleteRoom = async (): Promise<void> => {
    const target = deleteRoom
    if (target === null || deletingRoom) return
    setDeletingRoom(true)
    setDeleteRoomError(null)
    const outcome = await deleteGroupSession(target.sessionId)
    if (!mounted.current) return
    setDeletingRoom(false)
    const wasCurrent = sessionIdRef.current === target.sessionId
    if (!outcome.ok && outcome.error.code !== 'group-not-found') {
      setDeleteRoomError(outcome.error.message === 'room is busy' ? '房间正在讨论，先停止再删除' : formatWireError(outcome.error))
      return
    }
    closeDeleteRoom()
    setToast(outcome.ok ? '已删除房间' : '房间不存在')
    if (wasCurrent) {
      setPending(null)
      setReplyTo(null)
      setSendError(null)
      setSendCode(null)
    }
    // Deleted current room: the newest remaining room (or a fresh empty one) takes over.
    await loadSessions(wasCurrent ? null : sessionIdRef.current)
  }

  return (
    <div className="conversationPane" data-testid="conversation-pane" data-kind={isGroup ? 'group' : 'bot'}>
      <header className="conversationHead">
        {isGroup ? (
          <div className="identity" data-testid="conversation-identity">
            <span data-testid="conversation-name">{identityName}</span>
            {working ? (
              <span className="workingBadge" data-testid="conversation-working">
                {poll.round !== null && poll.rounds !== null
                  ? poll.rounds === 0
                    ? `第 ${poll.round} 轮${poll.speaking !== null ? ` · ${poll.speaking.name} 正在发言` : ''}`
                    : (poll.rounds > 1
                      ? `第 ${poll.round}/${poll.rounds} 轮${poll.speaking !== null ? ` · ${poll.speaking.name} 正在发言` : ''}`
                      : (poll.speaking !== null ? `${poll.speaking.name} 正在发言` : '工作中'))
                  : (poll.speaking !== null ? `${poll.speaking.name} 正在发言` : '工作中')}
              </span>
            ) : null}
          </div>
        ) : (
          <button
            type="button"
            className="identity identityBtn"
            data-testid="conversation-identity"
            title="编辑人设"
            onClick={() => props.onEdit?.()}
          >
            <Persona
              botId={bot?.id ?? identityId}
              name={identityName}
              size="sm"
              mood={working ? 'working' : 'idle'}
              color={color}
              {...bot?.avatar.emoji === undefined || bot.avatar.emoji === '' ? {} : { emoji: bot.avatar.emoji }}
            />
            <span data-testid="conversation-name">{identityName}</span>
            {working ? (
              <span className="workingBadge" data-testid="conversation-working">工作中</span>
            ) : null}
          </button>
        )}
        <span className="headActions">
          {!isGroup ? (
            <div className="memorySwitch">
              <button
                type="button"
                className="memoryPill"
                data-testid="memory-open"
                title="记忆"
                aria-expanded={panel === 'memory'}
                onClick={() => setPanel(current => current === 'memory' ? null : 'memory')}
              >
                🧠 {memoryCount(memory ?? undefined)}
              </button>
              <button
                type="button"
                className="memoryPill"
                data-testid="routines-open"
                title="例程"
                aria-expanded={routinesOpen}
                onClick={() => setPanel(current => current === 'routines' ? null : 'routines')}
              >
                ⏰ {routines.length}
              </button>
              <button
                type="button"
                className="memoryPill"
                data-testid="peers-open"
                title="同事"
                aria-expanded={panel === 'peers'}
                onClick={() => setPanel(current => current === 'peers' ? null : 'peers')}
              >
                同事 {peerCount}
              </button>
              {routinesOpen ? (
                <RoutinesPanel
                  open
                  botId={bot?.id ?? ''}
                  botName={identityName}
                  rows={routines}
                  onPreview={routinePreview}
                  onClose={() => setPanel(null)}
                  onCreate={async input => {
                    if (bot === undefined) return false
                    const result = await routineCreate({ botId: bot.id, ...input })
                    if (!result.ok) return false
                    const listed = await routineList(bot.id)
                    if (listed.ok) setRoutines(Array.isArray(listed.value) ? listed.value : [])
                    return true
                  }}
                  onToggle={async (id, enabled) => {
                    const result = await routineUpdate({ id, enabled })
                    if (!result.ok) return false
                    if (bot !== undefined) {
                      const listed = await routineList(bot.id)
                      if (listed.ok) setRoutines(Array.isArray(listed.value) ? listed.value : [])
                    }
                    return true
                  }}
                  onDelete={async id => {
                    const result = await routineDelete(id)
                    if (!result.ok) return false
                    if (bot !== undefined) {
                      const listed = await routineList(bot.id)
                      if (listed.ok) setRoutines(Array.isArray(listed.value) ? listed.value : [])
                    }
                    return true
                  }}
                />
              ) : null}
              {panel === 'peers' && bot !== undefined ? (
                <PeersPanel
                  open
                  botId={bot.id}
                  botName={identityName}
                  onClose={() => setPanel(null)}
                />
              ) : null}
              {panel === 'memory' ? (
                <MemoryPanel
                  open
                  botName={identityName}
                  data={memory}
                  unavailable={memoryUnavailable}
                  onClose={() => setPanel(null)}
                  onForget={async id => {
                    if (bot === undefined) return false
                    const result = await memoryForget(bot.id, id)
                    if (!result.ok) return false
                    const listed = await memoryList(bot.id)
                    if (listed.ok) setMemory(listed.value)
                    return true
                  }}
                  onClear={async () => {
                    if (bot === undefined) return false
                    const result = await memoryClear(bot.id)
                    if (!result.ok) return false
                    setMemory({ profile: [], log: [] })
                    return true
                  }}
                />
              ) : null}
            </div>
          ) : null}
          <div className="sessionSwitch" ref={switcherRef}>
            <button
              type="button"
              className="sessionSwitchBtn"
              data-testid="session-select"
              data-session-id={sessionId ?? ''}
              aria-expanded={switcherOpen}
              aria-haspopup="menu"
              aria-controls={switcherOpen ? switcherMenuId : undefined}
              title="切换这段对话"
              onClick={() => {
                setCurrentMenuOpen(false)
                setSwitcherOpen(open => !open)
              }}
            >
              <span className="sessionSwitchLabel">{isGroup ? '房间' : '对话'}</span>
              <span className="sessionSwitchTitle">
                {!sessionsLoaded
                  ? '加载中…'
                  : sessionId === null
                  ? '新对话'
                  : sessionDisplayTitle(
                    sessions.find(row => row.sessionId === sessionId)?.title,
                    identityName,
                    { hidden: sessions.find(row => row.sessionId === sessionId)?.hidden === true },
                  )}
              </span>
            </button>
            {switcherOpen ? (
              <div className="sessionSwitchMenu" id={switcherMenuId} role="menu" aria-label={isGroup ? '切换房间' : '切换对话'} onKeyDown={moveMenuFocus}>
                <SessionList
                  items={toChoices(sessions, identityName, sessionId)}
                  emptyHint="还没有绑定的对话"
                  onSelect={id => {
                    setSessionId(id)
                    setPending(null)
                    setReplyTo(null)
                    setSendError(null)
                    setSendCode(null)
                    setAwaitingTurn(false)
                    setSwitcherOpen(false)
                  }}
                  onCreate={() => {
                    setSwitcherOpen(false)
                    void openNew()
                  }}
                  groupMode={isGroup}
                  onToast={setToast}
                  {...isGroup ? { onDeleteRoom: openDeleteRoom } : {}}
                  {...props.onOpenOfficialSession === undefined ? {} : { onOpenOfficialSession: props.onOpenOfficialSession }}
                  {...props.onOpenSessionTool === undefined ? {} : { onOpenSessionTool: props.onOpenSessionTool }}
                  {...isGroup ? {} : {
                    includeHidden,
                    onIncludeHidden: (next: boolean) => setIncludeHidden(next),
                  }}
                />
              </div>
            ) : null}
            {!isGroup && sessionId !== null ? (
              <button
                type="button"
                className="rowMenuBtn sessionCurrentMenuBtn"
                data-testid="session-current-menu"
                aria-label="当前会话"
                aria-expanded={currentMenuOpen}
                aria-haspopup="menu"
                aria-controls={currentMenuOpen ? `${switcherMenuId}-current` : undefined}
                title="当前会话"
                onClick={() => {
                  setSwitcherOpen(false)
                  setCurrentMenuOpen(open => !open)
                }}
              >
                ⋯
              </button>
            ) : null}
            {!isGroup && currentMenuOpen && sessionId !== null ? (
              <div className="rowMenu sessionCurrentMenuPanel" id={`${switcherMenuId}-current`} role="menu" aria-label="当前会话" data-testid="session-current-menu-panel" onKeyDown={moveMenuFocus}>
                <SessionJumpMenuItem
                  sessionId={sessionId}
                  testId="session-current-jump"
                  child={sessions.some(row => row.sessionId === sessionId && isChildBotSession(row.tags))}
                  onToast={setToast}
                  onDone={() => setCurrentMenuOpen(false)}
                  {...props.onOpenOfficialSession === undefined ? {} : { onOpenOfficialSession: props.onOpenOfficialSession }}
                />
                <SessionRename
                  sessionId={sessionId}
                  {...currentTitle === undefined ? {} : { title: currentTitle }}
                  testId="session-current-rename"
                  onToast={setToast}
                  onDone={() => setCurrentMenuOpen(false)}
                />
              </div>
            ) : null}
          </div>
          {isGroup && sessionId !== null ? (
            <button
              type="button"
              className="retry"
              data-testid="group-continue"
              disabled={continuing || continueBlocked !== null}
              aria-busy={continuing}
              title={continueBlocked ?? '不发新消息，让成员接着刚才的话题再聊一场'}
              onClick={() => { void startContinue() }}
            >
              {continuing ? '正在开始…' : '让他们继续聊'}
            </button>
          ) : null}
          <button
            type="button"
            className="retry"
            data-testid="session-new"
            onClick={() => { void openNew() }}
          >
            {isGroup ? '新开房间' : '新开对话'}
          </button>
        </span>
      </header>
      {isGroup ? (
        <div className="memberChips" data-testid="group-member-chips">
          {members.map(member => {
            const chipColor = member.avatar.color !== '' ? member.avatar.color : hashAvatarColor(member.id)
            return (
              <button
                key={member.id}
                type="button"
                className={`memberChip${poll.speaking?.botId === member.id ? ' isSpeaking' : ''}`}
                data-testid={`group-chip-${member.id}`}
                data-speaking={poll.speaking?.botId === member.id ? 'true' : undefined}
                onClick={() => props.onEditMembers?.()}
              >
                <Persona
                  botId={member.id}
                  name={member.name}
                  size="sm"
                  mood={poll.speaking?.botId === member.id ? 'working' : 'idle'}
                  color={chipColor}
                  {...member.avatar.emoji === undefined || member.avatar.emoji === '' ? {} : { emoji: member.avatar.emoji }}
                />
                {member.name}
              </button>
            )
          })}
        </div>
      ) : null}
      {toast !== null ? (
        <p className="formHint" data-testid="conversation-toast">{toast}</p>
      ) : null}
      {listError !== null ? (
        <p className="formError" data-testid="conversation-list-error">{listError}</p>
      ) : null}
      {props.hint !== undefined && props.hint !== null && props.hint !== '' ? (
        <p className="formHint" data-testid="take-effect-hint">{props.hint}</p>
      ) : null}
      {poll.error !== null ? (
        <p className="formError" data-testid="transcript-error">{formatWireError(poll.error)}</p>
      ) : null}
      {transcriptLoading ? (
        <div className="conversationStage isLoading" data-testid="conversation-loading" role="status">
          <div className="conversationSkeleton" aria-hidden="true">
            <span className="skeletonBubble assistant" />
            <span className="skeletonBubble user" />
            <span className="skeletonBubble assistant" />
          </div>
          <p className="hint">加载对话…</p>
        </div>
      ) : empty ? (
        <div className="emptyChat isReady" data-testid="empty-chat-cta">
          <p>{isGroup ? '还没有发言' : '还没有对话'}</p>
          <p className="hint">
            给 {identityName} 发一条消息开始，或点「{isGroup ? '新开房间' : '新开对话'}」
          </p>
        </div>
      ) : (
        <div className="conversationStage isReady">
        <Transcript
          conversationKey={sessionId ?? identityId}
          {...bot?.id === undefined ? {} : { botId: bot.id }}
          items={liveItems}
          pending={pending}
          working={working && !showingLiveReply}
          {...speaking === null ? {} : { speaking }}
          onRemember={async (item: WorkbenchHistoryItem) => {
            const text = (item.text ?? '').slice(0, 200)
            if (text === '') return
            if (isGroup) {
              setPinPick(item.id)
              return
            }
            if (bot === undefined) return
            const result = await memoryRemember(bot.id, text, sessionId ?? undefined)
            setToast(result.ok ? '已记住' : '记住失败')
            if (result.ok) {
              const listed = await memoryList(bot.id)
              if (listed.ok) setMemory(listed.value)
            }
          }}
          onApproval={async (item, outcome) => {
            if (item.rpcId === undefined || item.approvalId === undefined || sessionId === null) return
            const result = await approvalRespond({
              rpcId: item.rpcId,
              sessionId: item.sessionId ?? sessionId,
              approvalId: item.approvalId,
              outcome,
            })
            setToast(result.ok ? '已处理审批' : '审批失败')
            poll.refresh()
          }}
          onQuestion={async (item, answer) => {
            if (item.rpcId === undefined || sessionId === null) return
            const result = await questionRespond({ rpcId: item.rpcId, sessionId: item.sessionId ?? sessionId, answer })
            setToast(result.ok ? '已提交回答' : '提问提交失败')
            poll.refresh()
          }}
          {...isGroup ? {
            groupMode: true,
            members,
            pinPick,
            onPickMember: async (memberId: string, item: WorkbenchHistoryItem) => {
              const text = (item.text ?? '').slice(0, 200)
              const result = await memoryRemember(memberId, text, sessionId ?? undefined)
              setPinPick(null)
              setToast(result.ok ? '已记住' : '记住失败')
            },
            pendingReply: pending?.replyTo ?? null,
            queued: poll.queued,
            onCancelQueued: cancelQueuedRow,
            onReplyTo: (item: WorkbenchHistoryItem) => {
              setReplyTo({
                seq: item.seq,
                speaker: item.author?.name ?? (item.role === 'user' ? '你' : '成员'),
                text: item.text ?? '',
                // Only a member's own line narrows the responders (BR-001).
                ...item.role === 'assistant' && item.error === undefined && item.author !== undefined
                  ? { botId: item.author.botId } : {},
              })
            },
            onRetryMember: async (item: WorkbenchHistoryItem) => {
              const botId = item.author?.botId
              if (sessionId === null || botId === undefined || botId === '') return
              const result = await retryMember(sessionId, botId, item.seq)
              setToast(result.ok ? '已开始重试该成员' : result.error.message)
              poll.refresh()
            },
          } : {}}
        />
        </div>
      )}
      {sessionsLoaded ? (
      <Composer
        pending={pending}
        botId={identityId}
        botName={identityName}
        disabled={false}
        sending={sending}
        working={composerWorking}
        error={sendError}
        errorCode={sendCode}
        toast={toast}
        paletteOpen={props.paletteOpen === true}
        {...replyTo === null ? {} : { replyTo }}
        onClearReply={() => setReplyTo(null)}
        storageKey={`${isGroup ? groupDraftStorageKey(group.id) : draftStorageKey(identityId)}${sessionId === null ? '' : `:${sessionId}`}`}
        {...isGroup ? { members } : {}}
        onSend={send}
        onStop={() => { void stopGeneration() }}
        onDraftEdit={() => {
          if (sendError !== null || sendCode !== null) {
            setSendError(null)
            setSendCode(null)
          }
        }}
        {...props.onDraft === undefined ? {} : { onDraft: props.onDraft }}
      />
      ) : null}
      {deleteRoom !== null ? (
        <div className="confirmMask" data-testid="room-delete-confirm">
          <div className="confirmBox" role="dialog" aria-modal="true" aria-labelledby={deleteTitleId} aria-describedby={`${deleteTitleId}-hint`}>
            <p id={deleteTitleId} className="confirmTitle">删除房间「{deleteRoom.title}」？</p>
            <p id={`${deleteTitleId}-hint`} className="hint">成员人设和他们的私聊都会保留。</p>
            {deleteRoomError !== null ? (
              <p className="formError" role="alert" data-testid="room-delete-error">{deleteRoomError}</p>
            ) : null}
            <div className="confirmActions">
              <button ref={deleteCancelRef} type="button" className="retry" data-testid="room-delete-cancel" disabled={deletingRoom} onClick={closeDeleteRoom}>
                取消
              </button>
              <button type="button" className="dangerBtn" data-testid="room-delete-ok" disabled={deletingRoom} aria-busy={deletingRoom}
                onClick={() => { void confirmDeleteRoom() }}>
                {deletingRoom ? '删除中…' : '删除'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
