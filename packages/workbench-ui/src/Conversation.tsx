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
  prompt,
} from './api.ts'
import type {
  WorkbenchBot,
  WorkbenchGroup,
  WorkbenchHistoryItem,
  WorkbenchSessionRow,
  WorkbenchWireError,
} from './api.ts'
import { parseMentions } from './mentions.ts'
import { hashAvatarColor, nameInitial } from './avatar.ts'
import { Composer } from './Composer.tsx'
import { Transcript } from './Transcript.tsx'
import { useSessionPoll } from './useSessionPoll.ts'

export interface ConversationProps {
  readonly bot?: WorkbenchBot
  readonly group?: WorkbenchGroup
  readonly members?: readonly WorkbenchBot[]
  readonly hint?: string | null
  readonly refreshEpoch?: number
  readonly roundLocked?: boolean
  readonly onEdit?: () => void
  readonly onEditMembers?: () => void
  readonly onWorking?: (botId: string, working: boolean) => void
  readonly onWorkingDetach?: (botId: string) => void
  readonly onPreview?: (botId: string, preview: string) => void
  readonly onDraft?: (botId: string, text: string) => void
}

function formatError(error: WorkbenchWireError): string {
  const code = error.code !== undefined && error.code !== '' ? error.code : 'internal'
  return `${code}: ${error.message}`
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
  return rooms.map((row, index) => ({
    sessionId: row.roomId,
    title: index === 0 ? '当前房间' : `房间 ${row.roomId.slice(0, 8)}`,
    tags: [],
    status: 'idle' as const,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    hidden: false,
    working: false,
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
  const sawWorkingRef = useRef(false)
  const sendSeqRef = useRef(-1)
  const sessionIdRef = useRef(sessionId)
  const includeHiddenRef = useRef(includeHidden)
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
      const keep = prefer !== null && rows.some(row => row.sessionId === prefer)
        ? prefer
        : rows[0]?.sessionId ?? null
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
    const keep = prefer !== null && rows.some(row => row.sessionId === prefer)
      ? prefer
      : rows[0]?.sessionId ?? null
    setSessionId(keep)
    return keep
  }, [bot, group, includeHidden, isGroup])

  useEffect(() => {
    let cancelled = false
    setPending(null)
    setSendError(null)
    setSendCode(null)
    setAwaitingTurn(false)
    setToast(null)
    sawWorkingRef.current = false
    setSessionId(null)
    void loadSessions(null).then(id => {
      if (cancelled) return
      if (id !== null) setSessionId(id)
    })
    return () => {
      cancelled = true
    }
    // Reload when the selected bot/group identity changes, not when list helpers churn.
  }, [identityId])

  useEffect(() => {
    if (includeHiddenRef.current === includeHidden) return
    includeHiddenRef.current = includeHidden
    void loadSessions(sessionIdRef.current)
  }, [includeHidden, loadSessions])

  useEffect(() => {
    if (props.refreshEpoch === undefined || props.refreshEpoch === 0) return
    void loadSessions(sessionIdRef.current)
  }, [loadSessions, props.refreshEpoch])

  const poll = useSessionPoll({
    sessionId,
    enabled: sessionId !== null,
    load: (id, sinceSeq) => history(id, sinceSeq),
  })

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
  const glyph = !isGroup && bot !== undefined
    ? (bot.avatar.emoji !== undefined && bot.avatar.emoji !== '' ? bot.avatar.emoji : nameInitial(bot.name))
    : nameInitial(identityName)
  const empty = poll.ready && poll.items.length === 0 && pending === null && !working && poll.error === null && listError === null
  const composerLocked = poll.working || awaitingTurn || sending

  return (
    <div className="conversationPane" data-testid="conversation-pane" data-kind={isGroup ? 'group' : 'bot'}>
      <header className="conversationHead">
        {isGroup ? (
          <div className="identity" data-testid="conversation-identity">
            <span data-testid="conversation-name">{identityName}</span>
            {working ? (
              <span className="workingBadge" data-testid="conversation-working">工作中</span>
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
            <span className="avatar sm" style={{ background: color }}>{glyph}</span>
            <span data-testid="conversation-name">{identityName}</span>
            {working ? (
              <span className="workingBadge" data-testid="conversation-working">工作中</span>
            ) : null}
          </button>
        )}
        <span className="headActions">
          <label className="sessionPick">
            <span className="visuallyHidden">对话</span>
            <select
              data-testid="session-select"
              value={sessionId ?? ''}
              onChange={event => {
                const next = event.target.value
                setSessionId(next === '' ? null : next)
                setPending(null)
              }}
            >
              {sessions.length === 0 ? <option value="">新对话</option> : null}
              {sessions.map(row => {
                const title = row.title !== undefined && row.title !== '' ? row.title : row.sessionId.slice(0, 8)
                return (
                  <option key={row.sessionId} value={row.sessionId}>
                    {row.hidden ? `~ ${title}` : title}
                  </option>
                )
              })}
            </select>
          </label>
          {isGroup ? null : (
            <label className="hiddenToggle">
              <input
                type="checkbox"
                data-testid="include-hidden"
                checked={includeHidden}
                onChange={event => setIncludeHidden(event.target.checked)}
              />
              包含隐藏
            </label>
          )}
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
            const chipGlyph = member.avatar.emoji !== undefined && member.avatar.emoji !== ''
              ? member.avatar.emoji
              : nameInitial(member.name)
            return (
              <button
                key={member.id}
                type="button"
                className="memberChip"
                data-testid={`group-chip-${member.id}`}
                onClick={() => props.onEditMembers?.()}
              >
                <span className="avatar sm" style={{ background: chipColor }}>{chipGlyph}</span>
                {member.name}
              </button>
            )
          })}
        </div>
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
          items={poll.items}
          pending={pending}
          working={working}
          speaking={poll.speaking}
          groupMode={isGroup}
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
        {...isGroup ? { storageKey: groupDraftStorageKey(group.id), members } : {}}
        onSend={send}
        {...props.onDraft === undefined ? {} : { onDraft: props.onDraft }}
      />
    </div>
  )
}
