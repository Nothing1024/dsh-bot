/**
 * Conversation stage: identity header, session switcher, transcript, composer.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createBotSession,
  createGroupSession,
  groupDraftStorageKey,
  history,
  listBotSessions,
  listGroupSessions,
  memoryCount,
  memoryForget,
  memoryList,
  memoryRemember,
  memoryClear,
  routineList,
  routineCreate,
  routineUpdate,
  routineDelete,
  markRead,
  prompt,
} from './api.ts'
import type {
  MemoryListValue,
  RoutineRow,
  WorkbenchBot,
  WorkbenchGroup,
  WorkbenchHistoryItem,
  WorkbenchSessionRow,
  WorkbenchWireError,
} from './api.ts'
import { parseMentions } from './mentions.ts'
import { hashAvatarColor } from './avatar.ts'
import { Persona } from './Persona.tsx'
import { Composer } from './Composer.tsx'
import type { ComposerReplyTo } from './Composer.tsx'
import { MemoryPanel } from './MemoryPanel.tsx'
import { RoutinesPanel } from './RoutinesPanel.tsx'
import { Transcript } from './Transcript.tsx'
import type { TranscriptSpeaker } from './Transcript.tsx'

type ReplyMark = {
  readonly sessionId: string
  readonly text: string
  readonly replyTo: ComposerReplyTo
}
import { SessionJumpMenuItem, SessionList } from './SessionList.tsx'
import type { SessionChoice } from './SessionList.tsx'
import {
  pickBoundSession,
  readLastSession,
  sessionDisplayTitle,
  writeLastSession,
} from './session-binding.ts'
import { useSessionPoll } from './useSessionPoll.ts'

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
}

function formatError(error: WorkbenchWireError): string {
  const code = error.code !== undefined && error.code !== '' ? error.code : 'internal'
  return `${code}: ${error.message}`
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
function roomsToSessions(rooms: readonly { roomId: string; createdAt: number; updatedAt: number }[]): WorkbenchSessionRow[] {
  return rooms.map(row => ({
    sessionId: row.roomId,
    title: `房间 ${row.roomId.slice(0, 8)}`,
    tags: [],
    status: 'idle' as const,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    hidden: false,
    working: false,
  }))
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
  const [sessions, setSessions] = useState<readonly WorkbenchSessionRow[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [pending, setPending] = useState<{ text: string; failed?: boolean } | null>(null)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [sendCode, setSendCode] = useState<string | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [awaitingTurn, setAwaitingTurn] = useState(false)
  const [includeHidden, setIncludeHidden] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [memoryOpen, setMemoryOpen] = useState(false)
  const [memory, setMemory] = useState<MemoryListValue | null>(null)
  const [memoryUnavailable, setMemoryUnavailable] = useState(false)
  const [routinesOpen, setRoutinesOpen] = useState(false)
  const [routines, setRoutines] = useState<readonly RoutineRow[]>([])
  const [pinPick, setPinPick] = useState<string | null>(null)
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [currentMenuOpen, setCurrentMenuOpen] = useState(false)
  const [replyTo, setReplyTo] = useState<ComposerReplyTo | null>(null)
  const [replyMarks, setReplyMarks] = useState<readonly ReplyMark[]>([])
  const switcherRef = useRef<HTMLDivElement>(null)
  const sawWorkingRef = useRef(false)
  const sendSeqRef = useRef(-1)
  const sessionIdRef = useRef(sessionId)
  const includeHiddenRef = useRef(includeHidden)
  const onSessionsRef = useRef(props.onSessions)
  const onActiveSessionRef = useRef(props.onActiveSession)
  onSessionsRef.current = props.onSessions
  onActiveSessionRef.current = props.onActiveSession
  sessionIdRef.current = sessionId

  const loadSessions = useCallback(async (prefer: string | null): Promise<string | null> => {
    if (isGroup) {
      const listed = await listGroupSessions(group.id)
      if (!listed.ok) {
        setListError(formatError(listed.error))
        return prefer
      }
      let rooms = listed.value.rooms ?? []
      if (rooms.length === 0) {
        const created = await createGroupSession(group.id)
        if (!created.ok) {
          setListError(formatError(created.error))
          return prefer
        }
        rooms = [created.value]
      }
      setListError(null)
      const rows = roomsToSessions(rooms)
      setSessions(rows)
      onSessionsRef.current?.(rows)
      const keep = pickBoundSession(rows.map(row => row.sessionId), prefer, readLastSession(identityId))
      setSessionId(keep)
      return keep
    }
    if (bot === undefined) return prefer
    const outcome = await listBotSessions(bot.id, includeHidden)
    if (!outcome.ok) {
      setListError(formatError(outcome.error))
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
    const prefer = props.preferredSessionId ?? readLastSession(identityId)
    void loadSessions(prefer).then(id => {
      if (cancelled) return
      if (id !== null) setSessionId(id)
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
    if (!sessions.some(row => row.sessionId === id)) return
    setSessionId(id)
    setPending(null)
    setSwitcherOpen(false)
    setCurrentMenuOpen(false)
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
    void loadSessions(props.preferredSessionId ?? sessionIdRef.current)
  }, [loadSessions, props.preferredSessionId, props.refreshEpoch])

  const poll = useSessionPoll({
    sessionId,
    enabled: sessionId !== null,
    load: (id, sinceSeq) => history(id, sinceSeq),
  })

  const historySeq = poll.items.reduce((max, item) => item.seq > max ? item.seq : max, 0)
  useEffect(() => {
    if (isGroup || bot === undefined) return
    let cancelled = false
    void memoryList(bot.id).then(result => {
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
  }, [bot, isGroup, poll.ready, poll.working, historySeq])

  useEffect(() => {
    if (isGroup || bot === undefined) return
    void routineList(bot.id).then(result => {
      if (result.ok) setRoutines(Array.isArray(result.value) ? result.value : [])
    })
    void markRead(bot.id)
  }, [bot, isGroup])

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

  useEffect(() => {
    if (!awaitingTurn) return
    if (poll.working) sawWorkingRef.current = true
    const hasReply = poll.items.some(item => (
      item.kind === 'message'
      && item.role === 'assistant'
      && item.seq > sendSeqRef.current
    ))
    if ((sawWorkingRef.current && !poll.working) || hasReply) {
      setAwaitingTurn(false)
    }
  }, [awaitingTurn, poll.items, poll.working])

  useEffect(() => {
    if (pending === null || pending.failed === true) return
    const hasUser = poll.items.some(item => (
      item.kind === 'message' && item.role === 'user' && item.text === pending.text
    ))
    if (hasUser) setPending(null)
  }, [pending, poll.items])

  const openNew = async (): Promise<void> => {
    if (isGroup) {
      const outcome = await createGroupSession(group.id)
      if (!outcome.ok) {
        setListError(formatError(outcome.error))
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
      setListError(formatError(outcome.error))
      return
    }
    setPending(null)
    setSendError(null)
    setAwaitingTurn(false)
    await loadSessions(outcome.value.sessionId)
    setSessionId(outcome.value.sessionId)
  }

  const send = async (text: string): Promise<boolean> => {
    setSending(true)
    setSendError(null)
    setSendCode(null)
    setToast(null)
    setPending({ text })
    try {
      let id = sessionId
      if (id === null) {
        if (isGroup) {
          const created = await createGroupSession(group.id)
          if (!created.ok) {
            setSendError(created.error.message)
            setSendCode(created.error.code ?? 'internal')
            setPending({ text, failed: true })
            return false
          }
          id = created.value.roomId
        } else {
          if (bot === undefined) return false
          const created = await createBotSession(bot.id)
          if (!created.ok) {
            setSendError(created.error.message)
            setSendCode(created.error.code ?? 'internal')
            setPending({ text, failed: true })
            return false
          }
          id = created.value.sessionId
        }
        setSessionId(id)
        await loadSessions(id)
      }
      if (isGroup && parseMentions(text, members.map(row => ({ id: row.id, name: row.name }))).unmatched) {
        setToast('未匹配成员,已发给全员')
      }
      const outcome = await prompt(id, text)
      if (!outcome.ok) {
        setSendError(outcome.error.message)
        setSendCode(outcome.error.code ?? 'internal')
        setPending({ text, failed: true })
        setAwaitingTurn(false)
        return false
      }
      if (replyTo !== null) {
        const cited = replyTo
        setReplyMarks(current => [...current, { sessionId: id, text, replyTo: cited }])
        setReplyTo(null)
      }
      sendSeqRef.current = poll.items.reduce((max, item) => item.seq > max ? item.seq : max, -1)
      sawWorkingRef.current = false
      setAwaitingTurn(true)
      poll.refresh()
      void loadSessions(id)
      return true
    } finally {
      setSending(false)
    }
  }

  const color = !isGroup && bot !== undefined
    ? (bot.avatar.color !== '' ? bot.avatar.color : hashAvatarColor(bot.id))
    : '#5b8def'
  const empty = poll.ready && poll.items.length === 0 && pending === null && !working && poll.error === null && listError === null
  const composerLocked = poll.working || awaitingTurn || sending
  const speaking = resolveSpeaking(poll.speaking, members)

  return (
    <div className="conversationPane" data-testid="conversation-pane" data-kind={isGroup ? 'group' : 'bot'}>
      <header className="conversationHead">
        {isGroup ? (
          <div className="identity" data-testid="conversation-identity">
            <span data-testid="conversation-name">{identityName}</span>
            {working ? (
              <span className="workingBadge" data-testid="conversation-working">
                {poll.speaking !== null ? `${poll.speaking.name} 正在发言` : '工作中'}
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
                onClick={() => setMemoryOpen(open => !open)}
              >
                🧠 {memoryCount(memory ?? undefined)}
              </button>
              <button
                type="button"
                className="memoryPill"
                data-testid="routines-open"
                title="例程"
                onClick={() => setRoutinesOpen(open => !open)}
              >
                ⏰ {routines.length}
              </button>
              {routinesOpen ? (
                <RoutinesPanel
                  open
                  botId={bot?.id ?? ''}
                  botName={identityName}
                  rows={routines}
                  onClose={() => setRoutinesOpen(false)}
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
              {memoryOpen ? (
                <MemoryPanel
                  open
                  botName={identityName}
                  data={memory}
                  unavailable={memoryUnavailable}
                  onClose={() => setMemoryOpen(false)}
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
              aria-haspopup="listbox"
              title="切换这段对话"
              onClick={() => {
                setCurrentMenuOpen(false)
                setSwitcherOpen(open => !open)
              }}
            >
              <span className="sessionSwitchLabel">对话</span>
              <span className="sessionSwitchTitle">
                {sessionId === null
                  ? '新对话'
                  : sessionDisplayTitle(
                    sessions.find(row => row.sessionId === sessionId)?.title,
                    identityName,
                    { hidden: sessions.find(row => row.sessionId === sessionId)?.hidden === true },
                  )}
              </span>
            </button>
            {switcherOpen ? (
              <div className="sessionSwitchMenu" role="listbox">
                <SessionList
                  items={toChoices(sessions, identityName, sessionId)}
                  emptyHint="还没有绑定的对话"
                  onSelect={id => {
                    setSessionId(id)
                    setPending(null)
                    setSwitcherOpen(false)
                  }}
                  onCreate={() => {
                    setSwitcherOpen(false)
                    void openNew()
                  }}
                  {...isGroup ? { enableJump: false } : {
                    includeHidden,
                    onIncludeHidden: (next: boolean) => setIncludeHidden(next),
                    onToast: setToast,
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
              <div className="rowMenu sessionCurrentMenuPanel" data-testid="session-current-menu-panel">
                <SessionJumpMenuItem
                  sessionId={sessionId}
                  testId="session-current-jump"
                  onToast={setToast}
                  onDone={() => setCurrentMenuOpen(false)}
                />
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="retry"
            data-testid="session-new"
            onClick={() => { void openNew() }}
          >
            新开对话
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
        <p className="formError" data-testid="transcript-error">{formatError(poll.error)}</p>
      ) : null}
      {empty ? (
        <div className="emptyChat" data-testid="empty-chat-cta">
          <p>还没有对话</p>
          <p className="hint">给 {identityName} 发一条消息开始，或点「新开对话」</p>
        </div>
      ) : (
        <Transcript
          {...bot?.id === undefined ? {} : { botId: bot.id }}
          items={poll.items}
          pending={pending}
          working={working}
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
            replyMarks: replyMarks
              .filter(row => row.sessionId === sessionId)
              .map(row => ({ text: row.text, replyTo: row.replyTo })),
            pendingReply: pending === null
              ? null
              : (replyMarks.find(row => row.sessionId === sessionId && row.text === pending.text)?.replyTo ?? null),
            onReplyTo: (item: WorkbenchHistoryItem) => {
              setReplyTo({
                seq: item.seq,
                speaker: item.author?.name ?? (item.role === 'user' ? '你' : '成员'),
                text: item.text ?? '',
              })
            },
          } : {}}
        />
      )}
      <Composer
        botId={identityId}
        botName={identityName}
        disabled={composerLocked}
        sending={sending}
        error={sendError}
        errorCode={sendCode}
        toast={toast}
        paletteOpen={props.paletteOpen === true}
        {...replyTo === null ? {} : { replyTo }}
        onClearReply={() => setReplyTo(null)}
        {...isGroup ? { storageKey: groupDraftStorageKey(group.id), members } : {}}
        onSend={send}
        {...props.onDraft === undefined ? {} : { onDraft: props.onDraft }}
      />
    </div>
  )
}
