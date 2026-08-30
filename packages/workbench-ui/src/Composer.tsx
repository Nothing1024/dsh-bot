/**
 * Composer dock: draft isolated by botId, Enter sends, Shift+Enter newline.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { readDraft, writeDraft } from './api.ts'

export interface ComposerProps {
  readonly botId: string
  readonly botName: string
  readonly disabled: boolean
  readonly sending: boolean
  readonly error: string | null
  readonly errorCode?: string | null
  readonly onSend: (text: string) => Promise<boolean>
  readonly onDraft?: (botId: string, text: string) => void
}

/**
 * Message box keyed by botId in localStorage. Failed sends keep the draft.
 */
export function Composer(props: ComposerProps) {
  const [text, setText] = useState(() => readDraft(props.botId))
  const botRef = useRef(props.botId)
  const textRef = useRef(text)
  const onDraftRef = useRef(props.onDraft)
  textRef.current = text
  onDraftRef.current = props.onDraft

  useEffect(() => {
    const previous = botRef.current
    if (previous !== props.botId) {
      writeDraft(previous, textRef.current)
      onDraftRef.current?.(previous, textRef.current)
      botRef.current = props.botId
      const next = readDraft(props.botId)
      setText(next)
      onDraftRef.current?.(props.botId, next)
      return
    }
    onDraftRef.current?.(props.botId, textRef.current)
  }, [props.botId])

  useEffect(() => {
    return () => {
      writeDraft(botRef.current, textRef.current)
      onDraftRef.current?.(botRef.current, textRef.current)
    }
  }, [])

  const change = (value: string): void => {
    setText(value)
    writeDraft(props.botId, value)
    onDraftRef.current?.(props.botId, value)
  }

  const send = async (): Promise<void> => {
    const next = text.trim()
    if (next === '' || props.disabled || props.sending) return
    const ok = await props.onSend(next)
    if (ok) {
      setText('')
      writeDraft(props.botId, '')
      onDraftRef.current?.(props.botId, '')
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== 'Enter' || event.shiftKey) return
    if (event.nativeEvent.isComposing || event.keyCode === 229) return
    event.preventDefault()
    void send()
  }

  const locked = props.disabled || props.sending
  const placeholder = `给 ${props.botName} 发消息`

  return (
    <div className="composer" data-testid="composer">
      {props.error !== null && props.error !== '' ? (
        <div className="composerError" data-testid="composer-error" role="alert">
          <span>{props.errorCode !== undefined && props.errorCode !== null && props.errorCode !== ''
            ? `${props.errorCode}: ${props.error}`
            : props.error}</span>
          <button
            type="button"
            className="retry"
            data-testid="composer-retry"
            disabled={locked}
            onClick={() => { void send() }}
          >
            重试
          </button>
        </div>
      ) : null}
      <div className="composerRow">
        <textarea
          className="composerInput"
          data-testid="composer-input"
          placeholder={placeholder}
          value={text}
          disabled={locked}
          rows={2}
          onChange={event => change(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          className="primaryBtn composerSend"
          data-testid="composer-send"
          disabled={locked || text.trim() === ''}
          onClick={() => { void send() }}
        >
          {props.sending ? '发送中…' : '发送'}
        </button>
      </div>
    </div>
  )
}
