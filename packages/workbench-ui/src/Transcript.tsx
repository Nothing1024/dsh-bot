/**
 * Conversation transcript: user right / assistant left. Pending actions stay
 * outside the text-only message history.
 * Assistant markdown is DSH-shaped GFM. No large avatar beside 1:1 assistant (BR-205).
 */
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type Ref, type UIEvent } from 'react'
import { routineCreate, routineDecline } from './api.ts'
import type { GroupQueuedItem, WorkbenchBot, WorkbenchHistoryItem } from './api.ts'
import { hashAvatarColor } from './avatar.ts'
import { Markdown } from './Markdown.tsx'
import { Persona } from './Persona.tsx'
import { peerLabelFromText } from './peer-label.ts'

export interface TranscriptSpeaker {
  readonly botId: string
  readonly name: string
  readonly avatar?: { readonly color: string; readonly emoji?: string }
}

export interface TranscriptReplyTo {
  readonly seq: number
  readonly speaker: string
  readonly text: string
}

export interface TranscriptReplyMark {
  readonly text: string
  readonly replyTo: TranscriptReplyTo
}

export interface TranscriptProps {
  readonly conversationKey?: string
  readonly botId?: string
  readonly items: readonly WorkbenchHistoryItem[]
  readonly pending?: { readonly text: string; readonly failed?: boolean } | null
  readonly working: boolean
  readonly speaking?: TranscriptSpeaker | null
  readonly groupMode?: boolean
  readonly replyMarks?: readonly TranscriptReplyMark[]
  readonly pendingReply?: TranscriptReplyTo | null
  readonly onReplyTo?: (item: WorkbenchHistoryItem) => void
  readonly onRemember?: (item: WorkbenchHistoryItem) => void
  readonly members?: readonly WorkbenchBot[]
  readonly pinPick?: string | null
  readonly onPickMember?: (botId: string, item: WorkbenchHistoryItem) => void
  readonly onApproval?: (item: WorkbenchHistoryItem, outcome: 'allowed-once' | 'rejected') => void
  readonly onQuestion?: (item: WorkbenchHistoryItem, answer: string) => void
  readonly onRetryMember?: (item: WorkbenchHistoryItem) => void
  /** Error row whose member is being asked again. Other rows stay labeled as retry. */
  readonly retryingSeq?: number | null
  /** Group room only: prompts waiting for the running discussion (BR-002). Not message bubbles. */
  readonly queued?: readonly GroupQueuedItem[]
  readonly onCancelQueued?: (queueId: string) => Promise<void>
}

function markFor(text: string | undefined, marks: readonly TranscriptReplyMark[] | undefined): TranscriptReplyTo | undefined {
  if (text === undefined || marks === undefined) return undefined
  return marks.find(row => row.text === text)?.replyTo
}

function sourceMissing(items: readonly WorkbenchHistoryItem[], seq: number): boolean {
  return !items.some(item => item.kind === 'message' && item.seq === seq)
}

/**
 * Scrollable message list. Sticks to the bottom unless the user scrolled up.
 */
export function Transcript(props: TranscriptProps) {
  const scroller = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const [away, setAway] = useState(false)
  const [menuSeq, setMenuSeq] = useState<number | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const latest = useRef(props)
  latest.current = props

  const onScroll = (event: UIEvent<HTMLDivElement>): void => {
    const node = event.currentTarget
    const wasStuck = stick.current
    stick.current = node.scrollHeight - node.scrollTop - node.clientHeight < 48
    if (stick.current !== wasStuck) setAway(!stick.current)
  }

  const toLatest = (): void => {
    stick.current = true
    setAway(false)
    if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight
  }

  useLayoutEffect(() => { toLatest() }, [props.conversationKey])

  useLayoutEffect(() => {
    const node = scroller.current
    if (node === null || !stick.current) return
    node.scrollTop = node.scrollHeight
  }, [props.items, props.pending, props.working])

  // Images, streamed text and the growing composer change geometry without a
  // new message: watch the viewport and the content column, once.
  useEffect(() => {
    const node = scroller.current
    const column = content.current
    if (!node || !column || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      if (stick.current) node.scrollTop = node.scrollHeight
    })
    observer.observe(node)
    observer.observe(column)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (menuSeq === null) return
    const onDoc = (event: Event): void => {
      const target = event.target as Node | null
      if (target !== null && menuRef.current?.contains(target) === true) return
      setMenuSeq(null)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuSeq])

  // Identity-stable row callbacks, so memoized rows repaint only when their own item changes.
  const actions = useMemo<RowActions>(() => ({
    openMenu: item => setMenuSeq(current => current === item.seq ? null : item.seq),
    reply: item => {
      setMenuSeq(null)
      latest.current.onReplyTo?.(item)
    },
    remember: item => {
      latest.current.onRemember?.(item)
      if (latest.current.groupMode !== true) setMenuSeq(null)
    },
    pickMember: (botId, item) => {
      setMenuSeq(null)
      latest.current.onPickMember?.(botId, item)
    },
    retry: item => latest.current.onRetryMember?.(item),
  }), [])

  const canReply = props.onReplyTo !== undefined
  const canRemember = props.onRemember !== undefined
  const canMenu = canReply || canRemember
  // System anchors (continue discussion) sit between messages as dividers, never as bubbles.
  const rows = props.items.filter(item => (props.groupMode === true && item.kind === 'system')
    || (item.kind === 'message'
      && (item.role === 'user' || item.role === 'assistant')
      && ((item.text ?? '').trim() !== '' || item.error !== undefined)))
  const messages = rows.filter(item => item.kind === 'message')

  return (
    <>
      <PendingActions {...props} />
      <div
        className="transcript"
        data-testid="transcript"
        ref={scroller}
        onScroll={onScroll}
      >
        <div className="transcriptContent" ref={content}>
          {rows.map(item => {
            if (item.kind === 'system') {
              return (
                <div key={item.id} className="systemDivider" role="separator" aria-label={item.text} data-testid="system-divider">
                  <span>{item.text}</span>
                </div>
              )
            }
            const mark = item.role === 'user' ? item.replyTo ?? markFor(item.text, props.replyMarks) : undefined
            const retryBotId = item.author?.botId
            const canRetry = props.onRetryMember !== undefined
              && item.error !== undefined
              && retryBotId !== undefined
              && retryBotId !== ''
              && !messages.some(other => other.seq > item.seq && other.author?.botId === retryBotId)
            const pinPick = props.pinPick === item.id
            return (
              <TranscriptRow
                key={item.id}
                item={item}
                menuOpen={canMenu && menuSeq === item.seq}
                {...menuSeq === item.seq ? { menuRef } : {}}
                {...mark === undefined ? {} : { replyTo: mark, sourceGone: sourceMissing(props.items, mark.seq) }}
                {...canMenu && item.pending !== true ? { onOpenMenu: actions.openMenu } : {}}
                {...canReply ? { onReply: actions.reply } : {}}
                {...!canRemember || item.role !== 'assistant' ? {} : {
                  onRemember: actions.remember,
                  pinPick,
                  ...pinPick && props.members !== undefined ? { members: props.members } : {},
                  onPickMember: actions.pickMember,
                }}
                {...canRetry ? {
                  onRetryMember: actions.retry,
                  retryDisabled: props.working,
                  retrying: props.retryingSeq === item.seq,
                } : {}}
              />
            )
          })}
          {props.working ? (
            <TypingIndicator {...props.speaking === undefined ? {} : { speaking: props.speaking }} />
          ) : null}
          {props.groupMode === true && props.queued !== undefined && props.queued.length > 0 ? (
            <ul className="queuedList" aria-label="排队中的消息" data-testid="queued-list">
              {props.queued.map(row => (
                <QueuedRow key={row.queueId} row={row} {...props.onCancelQueued === undefined ? {} : { onCancel: props.onCancelQueued }} />
              ))}
            </ul>
          ) : null}
        </div>
      </div>
      {away ? <button type="button" className="jumpLatest" aria-label="回到最新消息" onClick={toLatest}>
        ↓ 最新消息
      </button> : null}
    </>
  )
}

function QueuedRow(props: { row: GroupQueuedItem; onCancel?: (queueId: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const { row } = props
  return (
    <li className="queuedRow" data-testid={`queued-row-${row.queueId}`}>
      {row.replyTo !== undefined ? <span className="queuedCite">→ {row.replyTo.speaker}</span> : null}
      <span className="queuedText">{row.text}</span>
      <span className="queuedState" aria-hidden="true">· 排队中 ·</span>
      <span className="visuallyHidden">排队中</span>
      {props.onCancel !== undefined ? (
        <button
          type="button"
          className="queuedCancel"
          data-testid={`queued-cancel-${row.queueId}`}
          aria-label={`取消排队：${row.text}`}
          aria-busy={busy}
          disabled={busy}
          onClick={() => {
            setBusy(true)
            void props.onCancel!(row.queueId).finally(() => setBusy(false))
          }}
        >
          {busy ? '取消中…' : '取消'}
        </button>
      ) : null}
    </li>
  )
}

interface RowActions {
  readonly openMenu: (item: WorkbenchHistoryItem) => void
  readonly reply: (item: WorkbenchHistoryItem) => void
  readonly remember: (item: WorkbenchHistoryItem) => void
  readonly pickMember: (botId: string, item: WorkbenchHistoryItem) => void
  readonly retry: (item: WorkbenchHistoryItem) => void
}

function PendingActions(props: TranscriptProps) {
  const actions = props.items.filter(item => item.kind === 'propose-routine'
    || ((item.kind === 'approval' || item.kind === 'question') && item.pending !== false))
  if (actions.length === 0) return null
  return (
    <section className="conversationActions" aria-label="待处理操作" data-testid="conversation-actions">
      {actions.map(item => {
        if (item.kind === 'propose-routine') {
          return (
            <div key={item.id} className="proposeCard" data-testid={`propose-${item.id}`}>
              <div>设成例程：{item.name} · {item.schedule}</div>
              <div className="hint">{item.instruction}</div>
              <button
                type="button"
                className="retry"
                data-testid={`propose-accept-${item.id}`}
                onClick={() => {
                  if (props.botId === undefined || item.name === undefined || item.schedule === undefined || item.instruction === undefined) return
                  void routineCreate({
                    botId: props.botId,
                    name: item.name,
                    schedule: item.schedule,
                    instruction: item.instruction,
                  })
                }}
              >
                设成例程
              </button>
              <button
                type="button"
                className="retry"
                data-testid={`propose-decline-${item.id}`}
                onClick={() => {
                  if (props.botId === undefined || item.name === undefined) return
                  void routineDecline(props.botId, item.name)
                }}
              >
                不用
              </button>
            </div>
          )
        }

        return <ActionCard key={item.id} item={item}
          {...props.onApproval === undefined ? {} : { onApproval: props.onApproval }}
          {...props.onQuestion === undefined ? {} : { onQuestion: props.onQuestion }} />
      })}
    </section>
  )
}

function TypingIndicator(props: { speaking?: TranscriptSpeaker | null }) {
  const speaking = props.speaking
  const showAuthor = speaking !== undefined && speaking !== null
  const label = showAuthor ? `${speaking.name} 正在发言` : '工作中'
  const color = showAuthor
    ? (speaking.avatar !== undefined && speaking.avatar.color !== ''
      ? speaking.avatar.color
      : hashAvatarColor(speaking.botId))
    : undefined
  return (
    <div
      className={`bubbleWrap assistant typingRow${showAuthor ? ' hasAuthor' : ''}`}
      data-testid="transcript-working"
      data-role="assistant"
      data-author={showAuthor ? speaking.botId : undefined}
      aria-live="polite"
      aria-label={label}
    >
      {showAuthor ? (
        <Persona
          botId={speaking.botId}
          name={speaking.name}
          size="sm"
          mood="working"
          testId="transcript-typing-avatar"
          {...color === undefined ? {} : { color }}
          {...speaking.avatar?.emoji === undefined || speaking.avatar.emoji === ''
            ? {}
            : { emoji: speaking.avatar.emoji }}
        />
      ) : null}
      <div className="bubbleCol">
        {showAuthor ? (
          <span className="authorName" data-testid="transcript-typing-name">{speaking.name}</span>
        ) : null}
        <div className="bubble assistant typingBubble">
          <span className="dots" aria-hidden="true">
            <i /><i /><i />
          </span>
          <span className="visuallyHidden">{label}</span>
        </div>
      </div>
    </div>
  )
}

function ReplyCite(props: { seq: number; speaker: string; missing: boolean; text?: string }) {
  const testId = props.seq < 0 ? 'transcript-reply-cite-pending' : `transcript-reply-cite-${props.seq}`
  return (
    <div className="replyCite" data-testid={testId}>
      <span>{props.missing && !props.text ? '原消息已删除' : `→ ${props.speaker}`}</span>
      {props.text ? <span className="replyExcerpt">{props.text}</span> : null}
    </div>
  )
}

/** Host text sometimes already starts with the code; the bubble shows it once. */
export function formatMemberError(code: string, message: string): string {
  const prefix = `${code}: `
  const detail = message.startsWith(prefix) ? message.slice(prefix.length) : message
  return detail === '' ? code : `${code}: ${detail}`
}

const TranscriptRow = memo(function TranscriptRow(props: {
  item: WorkbenchHistoryItem
  menuOpen?: boolean
  menuRef?: Ref<HTMLDivElement>
  replyTo?: TranscriptReplyTo
  sourceGone?: boolean
  onOpenMenu?: (item: WorkbenchHistoryItem) => void
  onReply?: (item: WorkbenchHistoryItem) => void
  onRemember?: (item: WorkbenchHistoryItem) => void
  pinPick?: boolean
  members?: readonly WorkbenchBot[]
  onPickMember?: (botId: string, item: WorkbenchHistoryItem) => void
  onRetryMember?: (item: WorkbenchHistoryItem) => void
  retryDisabled?: boolean
  retrying?: boolean
}) {
  const item = props.item
  const role = item.role === 'user' ? 'user' : 'assistant'
  const author = item.author
  const showAuthor = author !== undefined && role === 'assistant'
  const peerFrom = peerLabelFromText(item.text)
  const color = showAuthor
    ? (author.avatar.color !== '' ? author.avatar.color : hashAvatarColor(author.botId))
    : undefined
  const canMenu = props.onOpenMenu !== undefined
  const copy = async (): Promise<void> => {
    const text = item.text ?? ''
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // clipboard may be denied in tests / http
    }
  }
  return (
    <div
      className={`bubbleWrap ${role}${showAuthor ? ' hasAuthor' : ''}${props.menuOpen === true ? ' isMenuOpen' : ''}`}
      data-role={role}
      data-author={showAuthor ? author.botId : undefined}
      data-testid={`transcript-msg-${item.seq}`}
      onContextMenu={event => {
        if (!canMenu) return
        event.preventDefault()
        props.onOpenMenu?.(item)
      }}
    >
      {showAuthor ? (
        <Persona
          botId={author.botId}
          name={author.name}
          size="sm"
          mood="idle"
          testId={`transcript-author-avatar-${item.seq}`}
          {...color === undefined ? {} : { color }}
          {...author.avatar.emoji === undefined || author.avatar.emoji === ''
            ? {}
            : { emoji: author.avatar.emoji }}
        />
      ) : null}
      <div className="bubbleCol">
        {peerFrom !== undefined ? (
          <span className="peerTag" data-testid={`transcript-peer-${item.seq}`}>来自 {peerFrom}</span>
        ) : null}
        {showAuthor ? (
          <>
            {item.origin === 'routine' ? <span className="routineTag" data-testid={`transcript-routine-${item.seq}`}>主动 · routine</span> : null}
            <span className="authorName" data-testid={`transcript-author-${item.seq}`}>{author.name}</span>
          </>
        ) : null}
        {props.replyTo !== undefined ? (
          <ReplyCite
            seq={item.seq}
            speaker={props.replyTo.speaker}
            text={props.replyTo.text}
            missing={props.sourceGone === true}
          />
        ) : null}
        {item.error !== undefined ? (
          <div className="memberError" data-testid={`transcript-error-${item.seq}`}>
            <span>{formatMemberError(item.error.code, item.error.message)}</span>
            {props.onRetryMember !== undefined ? (
              <button
                type="button"
                className="retry"
                data-testid={`transcript-retry-${item.seq}`}
                disabled={props.retryDisabled === true || props.retrying === true}
                aria-busy={props.retrying === true}
                title={props.retrying === true
                  ? undefined
                  : props.retryDisabled === true ? '讨论进行中，稍后再试' : undefined}
                onClick={() => props.onRetryMember?.(item)}
              >
                {props.retrying === true ? '重试中' : '重试该成员'}
              </button>
            ) : null}
          </div>
        ) : (
          <div className={`bubble ${role}`}>
            {role === 'assistant' && item.text !== undefined
              ? <Markdown text={item.text} />
              : item.text}
            {item.streaming === true ? <span className="streamCursor" data-testid={`transcript-stream-${item.seq}`} /> : null}
          </div>
        )}
        {role === 'user' && item.cancelledAt !== undefined ? (
          <span className="hint" data-testid={`transcript-cancelled-${item.seq}`} title={new Date(item.cancelledAt).toLocaleString()}>
            已取消 · 不再继续回应
          </span>
        ) : null}
      </div>
      {canMenu ? (
        <div className="msgMenu" ref={props.menuRef}>
          <button
            type="button"
            className="rowMenuBtn"
            data-testid={`transcript-menu-${item.seq}`}
            aria-label="消息菜单"
            onClick={event => {
              event.stopPropagation()
              props.onOpenMenu?.(item)
            }}
          >
            ⋯
          </button>
          {props.menuOpen === true ? (
            <div className="rowMenu msgMenuPanel" data-testid={`transcript-menu-panel-${item.seq}`}>
              {props.onReply !== undefined ? (
                <button
                  type="button"
                  data-testid={`transcript-reply-${item.seq}`}
                  onClick={() => props.onReply?.(item)}
                >
                  回复
                </button>
              ) : null}
              <button
                type="button"
                data-testid={`transcript-copy-${item.seq}`}
                onClick={() => {
                  void copy()
                }}
              >
                复制
              </button>
              {props.onRemember !== undefined ? (
                <button
                  type="button"
                  data-testid={`transcript-pin-${item.seq}`}
                  onClick={() => props.onRemember?.(item)}
                >
                  📌 记住这条
                </button>
              ) : null}
              {props.pinPick === true && props.members !== undefined ? (
                <div className="pinPick" data-testid={`transcript-pin-pick-${item.seq}`}>
                  {props.members.map(member => (
                    <button
                      key={member.id}
                      type="button"
                      data-testid={`transcript-pin-member-${member.id}`}
                      onClick={() => props.onPickMember?.(member.id, item)}
                    >
                      记到 {member.name}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
})

function ActionCard(props: {
  item: WorkbenchHistoryItem
  onApproval?: (item: WorkbenchHistoryItem, outcome: 'allowed-once' | 'rejected') => void
  onQuestion?: (item: WorkbenchHistoryItem, answer: string) => void
}) {
  const item = props.item
  const pending = item.pending !== false
  const [answer, setAnswer] = useState('')
  const testId = item.kind === 'approval' ? `transcript-approval-${item.seq}` : `transcript-question-${item.seq}`
  return (
    <div className={`actionCard${pending ? '' : ' isDone'}`} data-testid={testId} data-kind={item.kind}>
      <p className="actionCardText">{item.text}</p>
      {!pending ? (
        <p className="actionCardDone" data-testid={`${testId}-done`}>已处理</p>
      ) : item.kind === 'approval' ? (
        <div className="actionCardRow">
          <button
            type="button"
            className="primaryBtn"
            data-testid={`${testId}-allow`}
            onClick={() => props.onApproval?.(item, 'allowed-once')}
          >
            允许一次
          </button>
          <button
            type="button"
            data-testid={`${testId}-reject`}
            onClick={() => props.onApproval?.(item, 'rejected')}
          >
            拒绝
          </button>
        </div>
      ) : (
        <div className="actionCardRow">
          <input
            className="composerInput"
            data-testid={`${testId}-input`}
            value={answer}
            onChange={event => setAnswer(event.target.value)}
          />
          <button
            type="button"
            className="primaryBtn"
            data-testid={`${testId}-submit`}
            disabled={answer.trim() === ''}
            onClick={() => props.onQuestion?.(item, answer.trim())}
          >
            提交
          </button>
        </div>
      )}
    </div>
  )
}
