/**
 * Conversation stage: identity header, session switcher, transcript, composer.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createBotSession,
  history,
  listBotSessions,
  prompt,
} from './api.ts'
import type {
  WorkbenchBot,
  WorkbenchHistoryItem,
  WorkbenchSessionRow,
  WorkbenchWireError,
} from './api.ts'
import { hashAvatarColor, nameInitial } from './avatar.ts'
import { Composer } from './Composer.tsx'
import { Transcript } from './Transcript.tsx'
import { useSessionPoll } from './useSessionPoll.ts'

export interface ConversationProps {
  readonly bot: WorkbenchBot
  readonly hint?: string | null
  readonly onWorking?: (botId: string, working: boolean) => void
  readonly onWorkingDetach?: (botId: string) => void
  readonly onPreview?: (botId: string, preview: string) => void
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
export function Conversation(props: ConversationProps) {
  const bot = props.bot
  const [sessions, setSessions] = useState<readonly WorkbenchSessionRow[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [pending, setPending] = useState<{ text: string; failed?: boolean } | null>(null)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [sendCode, setSendCode] = useState<string | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [awaitingTurn, setAwaitingTurn] = useState(false)
  const sawWorkingRef = useRef(false)
  const sendSeqRef = useRef(-1)

  const loadSessions = useCallback(async (prefer: string | null): Promise<string | null> => {
    const outcome = await listBotSessions(bot.id)
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
  }, [bot.id])

  useEffect(() => {
    let cancelled = false
    setPending(null)
    setSendError(null)
    setSendCode(null)
    setAwaitingTurn(false)
    sawWorkingRef.current = false
    setSessionId(null)
    void listBotSessions(bot.id).then(outcome => {
      if (cancelled) return
      if (!outcome.ok) {
        setListError(formatError(outcome.error))
        return
      }
      setListError(null)
      const rows = outcome.value.sessions ?? []
      setSessions(rows)
      setSessionId(rows[0]?.sessionId ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [bot.id])

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
    onWorking?.(bot.id, working)
  }, [bot.id, onWorking, working])
  useEffect(() => {
    const id = bot.id
    return () => { onWorkingDetach?.(id) }
  }, [bot.id, onWorkingDetach])

  useEffect(() => {
    const preview = lastPreview(poll.items)
    if (preview !== '') onPreview?.(bot.id, preview)
  }, [bot.id, onPreview, poll.items])

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
    setPending({ text })
    try {
      let id = sessionId
      if (id === null) {
        const created = await createBotSession(bot.id)
        if (!created.ok) {
          setSendError(created.error.message)
          setSendCode(created.error.code ?? 'internal')
          setPending({ text, failed: true })
          return false
        }
        id = created.value.sessionId
        setSessionId(id)
        await loadSessions(id)
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

  const color = bot.avatar.color !== '' ? bot.avatar.color : hashAvatarColor(bot.id)
  const glyph = bot.avatar.emoji !== undefined && bot.avatar.emoji !== ''
    ? bot.avatar.emoji
    : nameInitial(bot.name)

  return (
    <div className="conversationPane" data-testid="conversation-pane">
      <header className="conversationHead">
        <span className="identity" data-testid="conversation-identity">
          <span className="avatar sm" style={{ background: color }}>{glyph}</span>
          <span data-testid="conversation-name">{bot.name}</span>
          {working ? (
            <span className="workingBadge" data-testid="conversation-working">工作中</span>
          ) : null}
        </span>
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
              {sessions.map(row => (
                <option key={row.sessionId} value={row.sessionId}>
                  {row.title !== undefined && row.title !== '' ? row.title : row.sessionId.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
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
      {listError !== null ? (
        <p className="formError" data-testid="conversation-list-error">{listError}</p>
      ) : null}
      {props.hint !== undefined && props.hint !== null && props.hint !== '' ? (
        <p className="formHint" data-testid="take-effect-hint">{props.hint}</p>
      ) : null}
      {poll.error !== null ? (
        <p className="formError" data-testid="transcript-error">{formatError(poll.error)}</p>
      ) : null}
      <Transcript items={poll.items} pending={pending} working={working} />
      <Composer
        botId={bot.id}
        botName={bot.name}
        disabled={poll.working || awaitingTurn}
        sending={sending}
        error={sendError}
        errorCode={sendCode}
        onSend={send}
      />
    </div>
  )
}
