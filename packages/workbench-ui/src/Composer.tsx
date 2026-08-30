/**
 * Composer dock: draft isolated by botId, Enter sends, Shift+Enter newline.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { readDraft, writeDraft, draftStorageKey } from './api.ts'
import { mentionQuery } from './mentions.ts'

export interface ComposerMember {
  readonly id: string
  readonly name: string
}

export interface ComposerProps {
  readonly botId: string
  readonly botName: string
  readonly disabled: boolean
  readonly sending: boolean
  readonly error: string | null
  readonly errorCode?: string | null
  readonly storageKey?: string
  readonly members?: readonly ComposerMember[]
  readonly toast?: string | null
  readonly onSend: (text: string) => Promise<boolean>
  readonly onDraft?: (botId: string, text: string) => void
}

/**
 * Message box keyed by botId in localStorage. Failed sends keep the draft.
 */
function storageOf(props: ComposerProps): string {
  return props.storageKey ?? draftStorageKey(props.botId)
}

function readAt(key: string): string {
  try {
    return localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

function writeAt(key: string, text: string): void {
  try {
    if (text.trim() === '') localStorage.removeItem(key)
    else localStorage.setItem(key, text)
  } catch {
    // private-mode / blocked storage must not break sending
  }
}

export function Composer(props: ComposerProps) {
  const [text, setText] = useState(() => {
    const key = storageOf(props)
    const stored = readAt(key)
    if (stored !== '') return stored
    return props.storageKey !== undefined ? '' : readDraft(props.botId)
  })
  const [mentionOpen, setMentionOpen] = useState(false)
  const botRef = useRef(props.botId)
  const keyRef = useRef(storageOf(props))
  const textRef = useRef(text)
  const onDraftRef = useRef(props.onDraft)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  textRef.current = text
  onDraftRef.current = props.onDraft

  useEffect(() => {
    const previousId = botRef.current
    const previousKey = keyRef.current
    const nextKey = storageOf(props)
    if (previousId !== props.botId || previousKey !== nextKey) {
      writeAt(previousKey, textRef.current)
      if (previousKey === draftStorageKey(previousId)) writeDraft(previousId, textRef.current)
      onDraftRef.current?.(previousId, textRef.current)
      botRef.current = props.botId
      keyRef.current = nextKey
      const next = readAt(nextKey)
      setText(next)
      setMentionOpen(false)
      onDraftRef.current?.(props.botId, next)
      return
    }
    onDraftRef.current?.(props.botId, textRef.current)
  }, [props.botId, props.storageKey])

  useEffect(() => {
    return () => {
      writeAt(keyRef.current, textRef.current)
      if (keyRef.current === draftStorageKey(botRef.current)) writeDraft(botRef.current, textRef.current)
      onDraftRef.current?.(botRef.current, textRef.current)
    }
  }, [])

  const change = (value: string): void => {
    setText(value)
    writeAt(storageOf(props), value)
    if (props.storageKey === undefined) writeDraft(props.botId, value)
    onDraftRef.current?.(props.botId, value)
    const caret = inputRef.current?.selectionStart ?? value.length
    const query = props.members !== undefined && props.members.length > 0
      ? mentionQuery(value, caret)
      : null
    setMentionOpen(query !== null)
  }

  const send = async (): Promise<void> => {
    const next = text.trim()
    if (next === '' || props.disabled || props.sending) return
    const ok = await props.onSend(next)
    if (ok) {
      setText('')
      writeAt(storageOf(props), '')
      if (props.storageKey === undefined) writeDraft(props.botId, '')
      setMentionOpen(false)
      onDraftRef.current?.(props.botId, '')
    }
  }

  const insertMention = (name: string): void => {
    const node = inputRef.current
    const caret = node?.selectionStart ?? text.length
    const query = mentionQuery(text, caret)
    if (query === null) return
    const next = `${text.slice(0, query.start)}@${name} ${text.slice(caret)}`
    change(next)
    setMentionOpen(false)
    requestAnimationFrame(() => {
      const pos = query.start + name.length + 2
      node?.setSelectionRange(pos, pos)
      node?.focus()
    })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Escape' && mentionOpen) {
      event.preventDefault()
      setMentionOpen(false)
      return
    }
    if (event.key !== 'Enter' || event.shiftKey) return
    if (event.nativeEvent.isComposing || event.keyCode === 229) return
    event.preventDefault()
    void send()
  }

  const locked = props.disabled || props.sending
  const placeholder = `给 ${props.botName} 发消息`
  const caret = inputRef.current?.selectionStart ?? text.length
  const query = props.members !== undefined && mentionOpen ? mentionQuery(text, caret) : null
  const mentionChoices = (props.members ?? []).filter(row => {
    if (query === null) return false
    const needle = query.query.toLowerCase()
    if (needle === '') return true
    return row.name.toLowerCase().includes(needle) || row.id.toLowerCase().includes(needle)
  })

  return (
    <div className="composer" data-testid="composer">
      {props.toast !== undefined && props.toast !== null && props.toast !== '' ? (
        <p className="formHint" data-testid="composer-toast">{props.toast}</p>
      ) : null}
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
        <div className="composerField">
          <textarea
            ref={inputRef}
            className="composerInput"
            data-testid="composer-input"
            placeholder={placeholder}
            value={text}
            disabled={locked}
            rows={2}
            onChange={event => change(event.target.value)}
            onKeyDown={onKeyDown}
          />
          {mentionOpen && mentionChoices.length > 0 ? (
            <ul className="mentionMenu" data-testid="mention-menu">
              {mentionChoices.map(row => (
                <li key={row.id}>
                  <button
                    type="button"
                    data-testid={`mention-item-${row.id}`}
                    onMouseDown={event => {
                      event.preventDefault()
                      insertMention(row.name)
                    }}
                  >
                    {row.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
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
