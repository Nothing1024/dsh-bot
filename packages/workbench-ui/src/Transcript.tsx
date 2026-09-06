/**
 * Conversation transcript: user right / assistant left. Thinking and tool
 * process render as fold cards; approval/question are actionable.
 * Assistant markdown is DSH-shaped GFM. No large avatar beside 1:1 assistant (BR-205).
 */
import { useEffect, useRef, useState, type Ref, type UIEvent } from 'react'
import { routineCreate, routineDecline } from './api.ts'
import type { WorkbenchBot, WorkbenchHistoryItem } from './api.ts'
import { hashAvatarColor } from './avatar.ts'
import { Markdown } from './Markdown.tsx'
import { Persona } from './Persona.tsx'

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
  const stick = useRef(true)
  const [menuSeq, setMenuSeq] = useState<number | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const onScroll = (event: UIEvent<HTMLDivElement>): void => {
    const node = event.currentTarget
    stick.current = node.scrollHeight - node.scrollTop - node.clientHeight < 48
  }

  useEffect(() => {
    const node = scroller.current
    if (node === null || !stick.current) return
    node.scrollTop = node.scrollHeight
  }, [props.items, props.pending, props.working])

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

  const canReply = props.onReplyTo !== undefined
  const canRemember = props.onRemember !== undefined
  const canMenu = canReply || canRemember

  return (
    <div
      className="transcript"
      data-testid="transcript"
      ref={scroller}
      onScroll={onScroll}
    >
      {props.items.map(item => {
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

        const mark = item.role === 'user' ? markFor(item.text, props.replyMarks) : undefined
        return (
          <TranscriptRow
            key={item.id}
            item={item}
            menuOpen={canMenu && menuSeq === item.seq}
            {...menuSeq === item.seq ? { menuRef } : {}}
            {...mark === undefined ? {} : { replyTo: mark, sourceGone: sourceMissing(props.items, mark.seq) }}
            {...canMenu ? {
              onOpenMenu: () => setMenuSeq(current => current === item.seq ? null : item.seq),
            } : {}}
            {...props.onReplyTo === undefined ? {} : {
              onReply: () => {
                setMenuSeq(null)
                props.onReplyTo?.(item)
              },
            }}
            {...props.onRemember === undefined || item.role !== 'assistant' ? {} : {
              onRemember: () => {
                props.onRemember?.(item)
                if (props.groupMode !== true) setMenuSeq(null)
              },
              pinPick: props.pinPick === item.id,
              members: props.members,
              onPickMember: (botId: string) => {
                setMenuSeq(null)
                props.onPickMember?.(botId, item)
              },
            }}
            {...props.onApproval === undefined ? {} : { onApproval: props.onApproval }}
            {...props.onQuestion === undefined ? {} : { onQuestion: props.onQuestion }}
          />
        )
      })}
      {props.pending !== undefined && props.pending !== null ? (
        <div
          className={`bubbleWrap user${props.pending.failed === true ? ' isFailed' : ' isPending'}`}
          data-testid="transcript-pending"
          data-role="user"
        >
          <div className="bubbleCol">
            {props.pendingReply !== undefined && props.pendingReply !== null ? (
              <ReplyCite
                seq={-1}
                speaker={props.pendingReply.speaker}
                missing={sourceMissing(props.items, props.pendingReply.seq)}
              />
            ) : null}
            <div className="bubble user">{props.pending.text}</div>
          </div>
        </div>
      ) : null}
      {props.working ? (
        <TypingIndicator {...props.speaking === undefined ? {} : { speaking: props.speaking }} />
      ) : null}
    </div>
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

function ReplyCite(props: { seq: number; speaker: string; missing: boolean }) {
  const testId = props.seq < 0 ? 'transcript-reply-cite-pending' : `transcript-reply-cite-${props.seq}`
  return (
    <div className="replyCite" data-testid={testId}>
      {props.missing ? '原消息已删除' : `→ ${props.speaker}`}
    </div>
  )
}

function TranscriptRow(props: {
  item: WorkbenchHistoryItem
  menuOpen?: boolean
  menuRef?: Ref<HTMLDivElement>
  replyTo?: TranscriptReplyTo
  sourceGone?: boolean
  onOpenMenu?: () => void
  onReply?: () => void
  onRemember?: () => void
  pinPick?: boolean
  members?: readonly WorkbenchBot[]
  onPickMember?: (botId: string) => void
  onApproval?: (item: WorkbenchHistoryItem, outcome: 'allowed-once' | 'rejected') => void
  onQuestion?: (item: WorkbenchHistoryItem, answer: string) => void
}) {
  const item = props.item
  if (item.kind === 'thinking' || item.kind === 'tool') {
    return <FoldCard item={item} />
  }
  if (item.kind === 'approval' || item.kind === 'question') {
    return (
      <ActionCard
        item={item}
        {...props.onApproval === undefined ? {} : { onApproval: props.onApproval }}
        {...props.onQuestion === undefined ? {} : { onQuestion: props.onQuestion }}
      />
    )
  }
  const role = item.role === 'user' ? 'user' : 'assistant'
  const author = item.author
  const showAuthor = author !== undefined && role === 'assistant'
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
        props.onOpenMenu?.()
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
            missing={props.sourceGone === true}
          />
        ) : null}
        {item.error !== undefined ? (
          <div className="memberError" data-testid={`transcript-error-${item.seq}`}>
            {item.error.code}: {item.error.message}
          </div>
        ) : (
          <div className={`bubble ${role}`}>
            {role === 'assistant' && item.text !== undefined
              ? <Markdown text={item.text} />
              : item.text}
            {item.streaming === true ? <span className="streamCursor" data-testid={`transcript-stream-${item.seq}`} /> : null}
          </div>
        )}
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
              props.onOpenMenu?.()
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
                  onClick={() => props.onReply?.()}
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
                  onClick={() => props.onRemember?.()}
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
                      onClick={() => props.onPickMember?.(member.id)}
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
}

function FoldCard(props: { item: WorkbenchHistoryItem }) {
  const item = props.item
  const thinking = item.kind === 'thinking'
  const [open, setOpen] = useState(!thinking)
  const testId = thinking ? `transcript-thinking-${item.seq}` : `transcript-tool-${item.seq}`
  const title = thinking ? '思考' : (item.name ?? item.summary ?? '工具')
  return (
    <div className="foldCard" data-testid={testId} data-kind={item.kind}>
      <button
        type="button"
        className="foldCardHead"
        data-testid={`${testId}-toggle`}
        onClick={() => { setOpen(current => !current) }}
      >
        {open ? '▾' : '▸'} {title}
        {!thinking && item.summary !== undefined && item.summary !== title ? ` · ${item.summary}` : ''}
      </button>
      {open ? (
        <div className="foldCardBody" data-testid={`${testId}-body`}>
          {item.text ?? item.summary ?? ''}
        </div>
      ) : null}
    </div>
  )
}

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
