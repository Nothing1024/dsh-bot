/**
 * Conversation transcript: user right / assistant left; thinking and tool
 * rows folded to one line. No large avatar beside assistant (BR-205).
 */
import { useEffect, useRef, type UIEvent } from 'react'
import type { WorkbenchHistoryItem } from './api.ts'
import { hashAvatarColor, nameInitial } from './avatar.ts'

export interface TranscriptProps {
  readonly items: readonly WorkbenchHistoryItem[]
  readonly pending?: { readonly text: string; readonly failed?: boolean } | null
  readonly working: boolean
  readonly speaking?: { readonly botId: string; readonly name: string } | null
  readonly groupMode?: boolean
}

/**
 * Scrollable message list. Sticks to the bottom unless the user scrolled up.
 */
export function Transcript(props: TranscriptProps) {
  const scroller = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  const onScroll = (event: UIEvent<HTMLDivElement>): void => {
    const node = event.currentTarget
    stick.current = node.scrollHeight - node.scrollTop - node.clientHeight < 48
  }

  useEffect(() => {
    const node = scroller.current
    if (node === null || !stick.current) return
    node.scrollTop = node.scrollHeight
  }, [props.items, props.pending, props.working])

  return (
    <div
      className="transcript"
      data-testid="transcript"
      ref={scroller}
      onScroll={onScroll}
    >
      {props.items.map(item => (
        <TranscriptRow key={item.id} item={item} />
      ))}
      {props.pending !== undefined && props.pending !== null ? (
        <div
          className={`bubbleWrap user${props.pending.failed === true ? ' isFailed' : ' isPending'}`}
          data-testid="transcript-pending"
          data-role="user"
        >
          <div className="bubble user">{props.pending.text}</div>
        </div>
      ) : null}
      {props.working ? (
        <div className="workingRow" data-testid="transcript-working">
          <span className="dots" aria-hidden="true">
            <i /><i /><i />
          </span>
          {props.speaking !== undefined && props.speaking !== null
            ? `${props.speaking.name} 正在发言`
            : '工作中'}
        </div>
      ) : null}
    </div>
  )
}

function TranscriptRow(props: { item: WorkbenchHistoryItem }) {
  const item = props.item
  if (item.kind === 'thinking') {
    return (
      <details className="foldRow" data-testid={`transcript-thinking-${item.seq}`}>
        <summary>思考</summary>
        <pre className="foldBody">{item.text}</pre>
      </details>
    )
  }
  if (item.kind === 'tool') {
    return (
      <div className="toolRow" data-testid={`transcript-tool-${item.seq}`}>
        工具 · {item.summary ?? item.name ?? 'tool'}
      </div>
    )
  }
  const role = item.role === 'user' ? 'user' : 'assistant'
  const author = item.author
  const showAuthor = author !== undefined && role === 'assistant'
  const color = showAuthor
    ? (author.avatar.color !== '' ? author.avatar.color : hashAvatarColor(author.botId))
    : undefined
  const glyph = showAuthor
    ? (author.avatar.emoji !== undefined && author.avatar.emoji !== ''
      ? author.avatar.emoji
      : nameInitial(author.name))
    : undefined
  return (
    <div
      className={`bubbleWrap ${role}${showAuthor ? ' hasAuthor' : ''}`}
      data-role={role}
      data-author={showAuthor ? author.botId : undefined}
      data-testid={`transcript-msg-${item.seq}`}
    >
      {showAuthor ? (
        <span className="avatar sm" style={{ background: color }} data-testid={`transcript-author-avatar-${item.seq}`}>
          {glyph}
        </span>
      ) : null}
      <div className="bubbleCol">
        {showAuthor ? (
          <span className="authorName" data-testid={`transcript-author-${item.seq}`}>{author.name}</span>
        ) : null}
        {item.error !== undefined ? (
          <div className="memberError" data-testid={`transcript-error-${item.seq}`}>
            {item.error.code}: {item.error.message}
          </div>
        ) : (
          <div className={`bubble ${role}`}>{item.text}</div>
        )}
      </div>
    </div>
  )
}
