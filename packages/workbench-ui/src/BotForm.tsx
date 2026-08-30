/**
 * Create / edit bot form: name, persona, emoji/color, optional model.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { AVATAR_COLORS, hashAvatarColor, nameInitial } from './avatar.ts'
import type { WorkbenchBot, WorkbenchBotModelInfo } from './api.ts'

export interface BotFormValues {
  readonly name: string
  readonly persona: string
  readonly emoji: string
  readonly color: string
  readonly provider: string
  readonly model: string
}

export interface BotFormProps {
  readonly mode: 'create' | 'edit'
  readonly initial?: WorkbenchBot
  readonly botModel?: WorkbenchBotModelInfo | null
  readonly busy: boolean
  readonly error: string | null
  readonly hint?: string | null
  readonly onCancel: () => void
  readonly onSubmit: (values: BotFormValues) => void
}

function valuesFrom(bot: WorkbenchBot | undefined): BotFormValues {
  if (bot === undefined) {
    return { name: '', persona: '', emoji: '', color: '', provider: '', model: '' }
  }
  return {
    name: bot.name,
    persona: bot.persona,
    emoji: bot.avatar.emoji ?? '',
    color: bot.avatar.color,
    provider: bot.modelOverride?.provider ?? '',
    model: bot.modelOverride?.model ?? '',
  }
}

/**
 * Shared create/edit panel with inline validation and a submit lock.
 */
export function BotForm(props: BotFormProps) {
  const [values, setValues] = useState<BotFormValues>(() => valuesFrom(props.initial))
  const [nameError, setNameError] = useState<string | null>(null)
  const [personaError, setPersonaError] = useState<string | null>(null)
  const submitLock = useRef(false)

  useEffect(() => {
    if (!props.busy) submitLock.current = false
  }, [props.busy])
  const previewId = props.initial?.id ?? values.name
  const previewColor = values.color !== '' ? values.color : hashAvatarColor(previewId === '' ? 'bot' : previewId)
  const previewGlyph = values.emoji !== '' ? values.emoji : nameInitial(values.name === '' ? '人' : values.name)
  const globalLabel = props.botModel !== undefined && props.botModel !== null && props.botModel.model !== ''
    ? `${props.botModel.provider}/${props.botModel.model}`
    : '跟随全局'

  const setField = <K extends keyof BotFormValues>(key: K, value: BotFormValues[K]): void => {
    setValues(current => ({ ...current, [key]: value }))
  }

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    if (props.busy || submitLock.current) return
    const name = values.name.trim()
    const persona = values.persona.trim()
    let blocked = false
    if (name === '') {
      setNameError('请填写名字')
      blocked = true
    } else {
      setNameError(null)
    }
    if (persona === '') {
      setPersonaError('请填写人设')
      blocked = true
    } else {
      setPersonaError(null)
    }
    if (blocked) return
    submitLock.current = true
    props.onSubmit({ ...values, name, persona })
  }

  return (
    <form className="botForm" data-testid="bot-form" data-mode={props.mode} onSubmit={submit}>
      <header className="botFormHead">
        <h2>{props.mode === 'create' ? '新建人设' : '编辑人设'}</h2>
        <button type="button" className="retry" data-testid="bot-form-cancel" onClick={props.onCancel} disabled={props.busy}>
          取消
        </button>
      </header>
      <label className="field">
        <span>名字</span>
        <input
          data-testid="bot-form-name"
          value={values.name}
          maxLength={64}
          autoComplete="off"
          disabled={props.busy}
          onChange={event => {
            setField('name', event.target.value)
            if (event.target.value.trim() !== '') setNameError(null)
          }}
        />
        {nameError !== null ? <span className="fieldError" data-testid="bot-form-name-error">{nameError}</span> : null}
      </label>
      <label className="field">
        <span>人设</span>
        <textarea
          data-testid="bot-form-persona"
          value={values.persona}
          rows={8}
          disabled={props.busy}
          onChange={event => {
            setField('persona', event.target.value)
            if (event.target.value.trim() !== '') setPersonaError(null)
          }}
        />
        {personaError !== null ? <span className="fieldError" data-testid="bot-form-persona-error">{personaError}</span> : null}
      </label>
      <div className="field">
        <span>头像</span>
        <div className="avatarPicker">
          <span className="avatar lg" style={{ background: previewColor }}>{previewGlyph}</span>
          <input
            data-testid="bot-form-emoji"
            placeholder="emoji（可选）"
            value={values.emoji}
            maxLength={16}
            disabled={props.busy}
            onChange={event => setField('emoji', event.target.value)}
          />
        </div>
        <div className="colorRow" data-testid="bot-form-colors">
          {AVATAR_COLORS.map(color => (
            <button
              key={color}
              type="button"
              className={`colorSwatch${values.color === color ? ' isOn' : ''}`}
              style={{ background: color }}
              aria-label={color}
              data-testid={`bot-form-color-${color}`}
              disabled={props.busy}
              onClick={() => setField('color', color)}
            />
          ))}
        </div>
      </div>
      <div className="field">
        <span>模型（可选，空则跟随全局）</span>
        <p className="hint">当前全局：{globalLabel}</p>
        <div className="modelRow">
          <input
            data-testid="bot-form-provider"
            placeholder="provider"
            value={values.provider}
            disabled={props.busy}
            onChange={event => setField('provider', event.target.value)}
          />
          <input
            data-testid="bot-form-model"
            placeholder="model"
            value={values.model}
            disabled={props.busy}
            onChange={event => setField('model', event.target.value)}
          />
        </div>
      </div>
      {props.error !== null ? (
        <p className="formError" data-testid="bot-form-error">{props.error}</p>
      ) : null}
      {props.hint !== null && props.hint !== undefined ? (
        <p className="formHint" data-testid="bot-form-hint">{props.hint}</p>
      ) : null}
      <button
        type="submit"
        className="primaryBtn"
        data-testid="bot-form-submit"
        disabled={props.busy}
      >
        {props.busy ? (props.mode === 'create' ? '创建中…' : '保存中…') : (props.mode === 'create' ? '创建' : '保存')}
      </button>
    </form>
  )
}
