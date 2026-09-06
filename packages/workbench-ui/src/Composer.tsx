/**
 * Composer dock: draft isolated by botId, Enter sends, Shift+Enter newline.
 * Mention `@` and emoji `:` share one popup + keyboard pattern.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { readDraft, writeDraft, draftStorageKey } from './api.ts'
import { emojiQuery, filterEmoji } from './emoji.ts'
import { mentionQuery } from './mentions.ts'

export interface ComposerMember {
  readonly id: string
  readonly name: string
}

export interface ComposerReplyTo {
  readonly seq: number
  readonly speaker: string
  readonly text: string
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
  readonly paletteOpen?: boolean
  readonly replyTo?: ComposerReplyTo | null
  readonly working?: boolean
  readonly onSend: (text: string) => Promise<boolean>
  readonly onStop?: () => void
  readonly onDraft?: (botId: string, text: string) => void
  readonly onClearReply?: () => void
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

function clip(text: string, max = 48): string {
  const next = text.replace(/\s+/g, ' ').trim()
  if (next.length <= max) return next
  return `${next.slice(0, max)}…`
}

type PopupKind = 'mention' | 'emoji' | null

/**
 * Enter sends, Shift+Enter newline. Cmd+K is handled on document (capture).
 */
export function Composer(props: ComposerProps) {
  const [text, setText] = useState(() => {
    const key = storageOf(props)
    const stored = readAt(key)
    if (stored !== '') return stored
    return props.storageKey !== undefined ? '' : readDraft(props.botId)
  })
  const [popup, setPopup] = useState<PopupKind>(null)
  const [emojiMode, setEmojiMode] = useState<'colon' | 'button'>('colon')
  const [active, setActive] = useState(0)
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
      setPopup(null)
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

  useEffect(() => {
    if (props.paletteOpen === true) setPopup(null)
  }, [props.paletteOpen])

  const syncPopup = (value: string, caret: number): void => {
    const mention = props.members !== undefined && props.members.length > 0
      ? mentionQuery(value, caret)
      : null
    const emoji = emojiQuery(value, caret)
    if (mention !== null) {
      setPopup('mention')
      setActive(0)
      return
    }
    if (emoji !== null) {
      setPopup('emoji')
      setEmojiMode('colon')
      setActive(0)
      return
    }
    setPopup(current => (current === 'emoji' && emojiMode === 'button' ? current : null))
  }

  const change = (value: string): void => {
    setText(value)
    writeAt(storageOf(props), value)
    if (props.storageKey === undefined) writeDraft(props.botId, value)
    onDraftRef.current?.(props.botId, value)
    const caret = inputRef.current?.selectionStart ?? value.length
    syncPopup(value, caret)
  }

  const send = async (): Promise<void> => {
    const next = text.trim()
    if (next === '' || props.sending) return
    const ok = await props.onSend(next)
    if (ok) {
      setText('')
      writeAt(storageOf(props), '')
      if (props.storageKey === undefined) writeDraft(props.botId, '')
      setPopup(null)
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
    setPopup(null)
    requestAnimationFrame(() => {
      const pos = query.start + name.length + 2
      node?.setSelectionRange(pos, pos)
      node?.focus()
    })
  }

  const insertEmoji = (glyph: string): void => {
    const node = inputRef.current
    const caret = node?.selectionStart ?? text.length
    const query = emojiMode === 'colon' ? emojiQuery(text, caret) : null
    const start = query?.start ?? caret
    const next = `${text.slice(0, start)}${glyph}${text.slice(caret)}`
    change(next)
    setPopup(null)
    requestAnimationFrame(() => {
      const pos = start + glyph.length
      node?.setSelectionRange(pos, pos)
      node?.focus()
    })
  }

  const caret = inputRef.current?.selectionStart ?? text.length
  const mentionToken = popup === 'mention' ? mentionQuery(text, caret) : null
  const emojiToken = popup === 'emoji' && emojiMode === 'colon' ? emojiQuery(text, caret) : null
  const mentionChoices = (props.members ?? []).filter(row => {
    if (mentionToken === null) return false
    const needle = mentionToken.query.toLowerCase()
    if (needle === '') return true
    return row.name.toLowerCase().includes(needle) || row.id.toLowerCase().includes(needle)
  })
  const emojiChoices = popup === 'emoji' ? filterEmoji(emojiToken?.query ?? '') : []
  const popupChoices = popup === 'mention' ? mentionChoices : emojiChoices
  const popupOpen = popup !== null && popupChoices.length > 0

  useEffect(() => {
    setActive(0)
  }, [popup, mentionChoices.length, emojiChoices.length])

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return
    if (event.key === 'Escape') {
      if (popup !== null) {
        event.preventDefault()
        setPopup(null)
        return
      }
      if (props.replyTo != null) {
        event.preventDefault()
        props.onClearReply?.()
        return
      }
      return
    }
    if (popupOpen) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActive(current => (current + 1) % popupChoices.length)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActive(current => (current - 1 + popupChoices.length) % popupChoices.length)
        return
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        const choice = popupChoices[active]
        if (choice === undefined) return
        if (popup === 'mention' && 'name' in choice) insertMention(choice.name)
        else if (popup === 'emoji' && 'glyph' in choice) insertEmoji(choice.glyph)
        return
      }
    }
    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    void send()
  }

  const locked = props.sending
  const working = props.working === true
  const placeholder = `给 ${props.botName} 发消息`
  const replyTo = props.replyTo

  const toggleEmojiButton = (): void => {
    if (locked) return
    setPopup(current => {
      if (current === 'emoji' && emojiMode === 'button') return null
      setEmojiMode('button')
      setActive(0)
      return 'emoji'
    })
  }

  return (
    <div className="composer" data-testid="composer">
      {replyTo !== undefined && replyTo !== null ? (
        <div className="replyCard" data-testid="composer-reply">
          <span className="replyCardText">
            回复: {replyTo.speaker}: {clip(replyTo.text)}
          </span>
          <button
            type="button"
            className="replyCardClear"
            data-testid="composer-reply-clear"
            aria-label="清除回复"
            onClick={() => props.onClearReply?.()}
          >
            ×
          </button>
        </div>
      ) : null}
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
            rows={2}
            onChange={event => change(event.target.value)}
            onKeyDown={onKeyDown}
            onSelect={event => syncPopup(event.currentTarget.value, event.currentTarget.selectionStart)}
          />
          {popup === 'mention' && mentionChoices.length > 0 ? (
            <ul className="mentionMenu" data-testid="mention-menu" role="listbox">
              {mentionChoices.map((row, index) => (
                <li key={row.id}>
                  <button
                    type="button"
                    className={index === active ? 'isActive' : undefined}
                    data-testid={`mention-item-${row.id}`}
                    onMouseEnter={() => setActive(index)}
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
          {popup === 'emoji' && emojiChoices.length > 0 ? (
            <ul className="mentionMenu" data-testid="emoji-menu" role="listbox">
              {emojiChoices.map((row, index) => (
                <li key={row.id}>
                  <button
                    type="button"
                    className={index === active ? 'isActive' : undefined}
                    data-testid={`emoji-item-${row.id}`}
                    onMouseEnter={() => setActive(index)}
                    onMouseDown={event => {
                      event.preventDefault()
                      insertEmoji(row.glyph)
                    }}
                  >
                    <span className="emojiGlyph">{row.glyph}</span>
                    <span>:{row.id}:</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <button
          type="button"
          className="composerEmojiBtn"
          data-testid="composer-emoji"
          aria-label="表情"
          disabled={locked}
          onMouseDown={event => {
            event.preventDefault()
            toggleEmojiButton()
          }}
        >
          😊
        </button>
        <button
          type="button"
          className="primaryBtn composerSend"
          data-testid="composer-send"
          disabled={working ? false : (locked || text.trim() === '')}
          onClick={() => {
            if (working) {
              props.onStop?.()
              return
            }
            void send()
          }}
        >
          {working ? '停止' : props.sending ? '发送中…' : '发送'}
        </button>
      </div>
    </div>
  )
}
