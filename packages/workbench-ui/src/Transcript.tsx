/**
 * Conversation transcript: user right / assistant left. Thinking and tool
 * process stay out of the chat (Grok-like). Assistant markdown is DSH-shaped
 * GFM. No large avatar beside 1:1 assistant (BR-205).
 */
import { useEffect, useRef, useState, type Ref, type UIEvent } from 'react'
import type { WorkbenchHistoryItem } from './api.ts'
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
  readonly items: readonly WorkbenchHistoryItem[]
  readonly pending?: { readonly text: string; readonly failed?: boolean } | null
  readonly working: boolean
  readonly speaking?: TranscriptSpeaker | null
  readonly groupMode?: boolean
  readonly replyMarks?: readonly TranscriptReplyMark[]
  readonly pendingReply?: TranscriptReplyTo | null
  readonly onReplyTo?: (item: WorkbenchHistoryItem) => void
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

  return (
    <div
      className="transcript"
      data-testid="transcript"
      ref={scroller}
      onScroll={onScroll}
    >
      {props.items.map(item => {
        const mark = item.role === 'user' ? markFor(item.text, props.replyMarks) : undefined
        return (
          <TranscriptRow
            key={item.id}
            item={item}
            menuOpen={canReply && menuSeq === item.seq}
            {...menuSeq === item.seq ? { menuRef } : {}}
            {...mark === undefined ? {} : { replyTo: mark, sourceGone: sourceMissing(props.items, mark.seq) }}
            {...canReply ? {
              onOpenMenu: () => setMenuSeq(current => current === item.seq ? null : item.seq),
            } : {}}
            {...props.onReplyTo === undefined ? {} : {
              onReply: () => {
                setMenuSeq(null)
                props.onReplyTo?.(item)
              },
            }}
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
}) {
  const item = props.item
  if (item.kind === 'thinking' || item.kind === 'tool') {
    return null
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
          <span className="authorName" data-testid={`transcript-author-${item.seq}`}>{author.name}</span>
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
              <button
                type="button"
                data-testid={`transcript-reply-${item.seq}`}
                onClick={() => props.onReply?.()}
              >
                回复
              </button>
              <button
                type="button"
                data-testid={`transcript-copy-${item.seq}`}
                onClick={() => {
                  void copy()
                }}
              >
                复制
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
