/**
 * Create / edit bot form: name, persona, emoji/color, optional model.
 *
 * Layout follows the shadcn form idiom the other config surfaces use: one
 * card per concern, muted 12px labels, a single right-aligned action row, and
 * errors rendered as a titled alert that keeps the host's own message.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { describeWireError, type WorkbenchWireError } from 'dsh-bot-shared'
import { AVATAR_COLORS, hashAvatarColor } from './avatar.ts'
import { Persona } from './Persona.tsx'
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
  /** Host failure; rendered with its user-facing title and hint. */
  readonly error: WorkbenchWireError | null
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
  const [modelError, setModelError] = useState<string | null>(null)
  const submitLock = useRef(false)

  useEffect(() => {
    if (!props.busy) submitLock.current = false
  }, [props.busy])
  const previewId = props.initial?.id ?? values.name
  const previewColor = values.color !== '' ? values.color : hashAvatarColor(previewId === '' ? 'bot' : previewId)
  const globalLabel = props.botModel !== undefined && props.botModel !== null && props.botModel.model !== ''
    ? `${props.botModel.provider}/${props.botModel.model}`
    : '跟随全局'
  const errorCopy = props.error === null ? null : describeWireError(props.error)
  const pinned = values.provider.trim() !== '' || values.model.trim() !== ''

  const setField = <K extends keyof BotFormValues>(key: K, value: BotFormValues[K]): void => {
    setValues(current => ({ ...current, [key]: value }))
  }

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    if (props.busy || submitLock.current) return
    const name = values.name.trim()
    const persona = values.persona.trim()
    const provider = values.provider.trim()
    const model = values.model.trim()
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
    // Half a model override is always a mistake: the host would reject it with
    // an override-invalid far from the field that caused it.
    if ((provider === '') !== (model === '')) {
      setModelError('provider 和 model 要么都填，要么都留空跟随全局')
      blocked = true
    } else {
      setModelError(null)
    }
    if (blocked) return
    submitLock.current = true
    props.onSubmit({ ...values, name, persona })
  }

  return (
    <div
      className="formMask"
      data-testid="bot-form-mask"
      onMouseDown={event => {
        if (event.target === event.currentTarget && !props.busy) props.onCancel()
      }}
    >
    <form className="botForm botFormModal" data-testid="bot-form" data-mode={props.mode} onSubmit={submit}>
      <header className="botFormHead">
        <h2>{props.mode === 'create' ? '新建人设' : '编辑人设'}</h2>
        <p className="botFormSub">人设决定这个 Bot 的口吻与职责</p>
      </header>

      <section className="formSection">
        <h3 className="formSectionTitle">基本</h3>
        <label className="field">
          <span>名字</span>
          <input
            data-testid="bot-form-name"
            value={values.name}
            maxLength={64}
            autoComplete="off"
            placeholder="例如：校对阿宁"
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
            placeholder="描述它扮演谁、怎么说话、不该做什么"
            disabled={props.busy}
            onChange={event => {
              setField('persona', event.target.value)
              if (event.target.value.trim() !== '') setPersonaError(null)
            }}
          />
          {personaError !== null ? <span className="fieldError" data-testid="bot-form-persona-error">{personaError}</span> : null}
        </label>
      </section>

      <section className="formSection">
        <h3 className="formSectionTitle">外观</h3>
        <div className="avatarRow">
          <Persona
            botId={previewId === '' ? 'bot' : previewId}
            name={values.name === '' ? '人' : values.name}
            size="lg"
            mood="idle"
            color={previewColor}
            {...values.emoji === '' ? {} : { emoji: values.emoji }}
          />
          <label className="field avatarEmoji">
            <span>头像 emoji（可选）</span>
            <input
              data-testid="bot-form-emoji"
              placeholder="例如 🧭"
              value={values.emoji}
              maxLength={16}
              disabled={props.busy}
              onChange={event => setField('emoji', event.target.value)}
            />
          </label>
        </div>
        <div className="field">
          <span>头像颜色</span>
          <div className="colorRow" data-testid="bot-form-colors">
            {AVATAR_COLORS.map(color => (
              <button
                key={color}
                type="button"
                className={`colorSwatch${values.color === color ? ' isOn' : ''}`}
                style={{ background: color }}
                aria-label={color}
                aria-pressed={values.color === color}
                data-testid={`bot-form-color-${color}`}
                disabled={props.busy}
                onClick={() => setField('color', color)}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="formSection">
        <h3 className="formSectionTitle">模型</h3>
        <p className="formSectionHint">
          留空则跟随全局（当前全局：{globalLabel}）
        </p>
        <div className="modelRow">
          <label className="field">
            <span>provider</span>
            <input
              data-testid="bot-form-provider"
              placeholder="anthropic"
              value={values.provider}
              disabled={props.busy}
              onChange={event => {
                setField('provider', event.target.value)
                setModelError(null)
              }}
            />
          </label>
          <label className="field">
            <span>model</span>
            <input
              data-testid="bot-form-model"
              placeholder="deepseek-flash"
              value={values.model}
              disabled={props.busy}
              onChange={event => {
                setField('model', event.target.value)
                setModelError(null)
              }}
            />
          </label>
        </div>
        {modelError !== null ? <span className="fieldError" data-testid="bot-form-model-error">{modelError}</span> : null}
        {pinned ? (
          <button
            type="button"
            className="ghostBtn isTiny"
            data-testid="bot-form-model-reset"
            disabled={props.busy}
            onClick={() => {
              setField('provider', '')
              setField('model', '')
              setModelError(null)
            }}
          >
            改回跟随全局
          </button>
        ) : null}
      </section>

      {errorCopy !== null ? (
        <div className="formError" data-testid="bot-form-error" role="alert">
          <strong className="formErrorTitle">{errorCopy.title}</strong>
          {errorCopy.hint !== undefined ? <span className="formErrorHint">{errorCopy.hint}</span> : null}
          <span className="formErrorDetail">{errorCopy.detail}（{errorCopy.code}）</span>
        </div>
      ) : null}
      {props.hint !== null && props.hint !== undefined ? (
        <p className="formHint" data-testid="bot-form-hint">{props.hint}</p>
      ) : null}

      <div className="formActions">
        <button type="button" className="ghostBtn" data-testid="bot-form-cancel" onClick={props.onCancel} disabled={props.busy}>
          取消
        </button>
        <button
          type="submit"
          className="primaryBtn"
          data-testid="bot-form-submit"
          disabled={props.busy}
        >
          {props.busy ? (props.mode === 'create' ? '创建中…' : '保存中…') : (props.mode === 'create' ? '创建' : '保存')}
        </button>
      </div>
    </form>
    </div>
  )
}
