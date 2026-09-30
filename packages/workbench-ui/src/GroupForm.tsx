/**
 * Create / edit group as a modal: name, 2–6 members, and discussion rounds.
 */
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { describeWireError, type WorkbenchWireError } from 'dsh-bot-shared'
import type { WorkbenchBot, WorkbenchGroup } from './api.ts'
import { hashAvatarColor } from './avatar.ts'
import { Persona } from './Persona.tsx'
import { ESCAPE_PRIORITY, useEscapeLayer } from './interactions.tsx'

const MEMBER_MIN = 2
const MEMBER_MAX = 6

export interface GroupFormValues {
  readonly name: string
  readonly memberIds: readonly string[]
  readonly rounds: number
}

export interface GroupFormProps {
  readonly mode: 'create' | 'edit'
  readonly bots: readonly WorkbenchBot[]
  readonly initial?: WorkbenchGroup
  readonly busy: boolean
  /** Host failure; rendered with its user-facing title and hint. */
  readonly error: WorkbenchWireError | null
  readonly roundLocked?: boolean
  readonly onCancel: () => void
  readonly onSubmit: (values: GroupFormValues) => void
}

export function GroupForm(props: GroupFormProps) {
  const [name, setName] = useState(props.initial?.name ?? '')
  const [memberIds, setMemberIds] = useState<readonly string[]>(props.initial?.memberIds ?? [])
  const [rounds, setRounds] = useState<number>(props.initial?.rounds ?? 3)
  const [nameError, setNameError] = useState<string | null>(null)
  const [memberError, setMemberError] = useState<string | null>(null)
  const submitLock = useRef(false)
  const titleId = useId()
  const nameRef = useRef<HTMLInputElement>(null)
  const initialMembers = props.initial?.memberIds ?? []
  const pristine = name === (props.initial?.name ?? '')
    && rounds === (props.initial?.rounds ?? 3)
    && memberIds.length === initialMembers.length
    && memberIds.every(id => initialMembers.includes(id))
  // Escape only discards an untouched form; edits need the explicit 取消 button.
  useEscapeLayer(true, () => { if (pristine && !props.busy) props.onCancel() }, {
    priority: ESCAPE_PRIORITY.dialog,
    initialFocus: () => nameRef.current,
  })

  useEffect(() => {
    if (!props.busy) submitLock.current = false
  }, [props.busy])

  const toggle = (id: string): void => {
    setMemberIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
    setMemberError(null)
  }

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    if (props.busy || submitLock.current || props.roundLocked === true) return
    const trimmed = name.trim()
    let blocked = false
    if (trimmed === '') {
      setNameError('请填写名字')
      blocked = true
    } else {
      setNameError(null)
    }
    if (memberIds.length < MEMBER_MIN || memberIds.length > MEMBER_MAX) {
      setMemberError(`请选择 ${MEMBER_MIN}–${MEMBER_MAX} 个人设`)
      blocked = true
    } else {
      setMemberError(null)
    }
    if (blocked) return
    submitLock.current = true
    props.onSubmit({ name: trimmed, memberIds, rounds })
  }

  const locked = props.busy || props.roundLocked === true
  const errorCopy = props.error === null ? undefined : describeWireError(props.error)

  return (
    <div
      className="formMask"
      data-testid="group-form-mask"
      onMouseDown={event => {
        if (event.target === event.currentTarget && !props.busy) props.onCancel()
      }}
    >
    <form className="botForm botFormModal" data-testid="group-form" data-mode={props.mode} role="dialog" aria-modal="true" aria-labelledby={titleId} onSubmit={submit}>
      <header className="botFormHead">
        <h2 id={titleId}>{props.mode === 'create' ? '新建小组' : '编辑成员'}</h2>
        <p className="botFormSub">成员按轮次依次回应；可设固定轮数或无限讨论</p>
      </header>

      <section className="formSection">
        <h3 className="formSectionTitle">基本</h3>
        <label className="field">
          <span>名字</span>
          <input
            ref={nameRef}
            data-testid="group-form-name"
            value={name}
            maxLength={64}
            autoComplete="off"
            placeholder="例如：编辑室"
            disabled={locked}
            onChange={event => {
              setName(event.target.value)
              if (event.target.value.trim() !== '') setNameError(null)
            }}
          />
          {nameError !== null ? <span className="fieldError" data-testid="group-form-name-error">{nameError}</span> : null}
        </label>
        <label className="field">
          <span>讨论轮次</span>
          <select
            data-testid="group-form-rounds"
            value={String(rounds)}
            disabled={locked}
            onChange={event => { setRounds(Number(event.target.value)) }}
          >
            <option value="1">1 轮</option>
            <option value="2">2 轮</option>
            <option value="3">3 轮</option>
            <option value="5">5 轮</option>
            <option value="0">无限</option>
          </select>
          <span className="formHint">{rounds === 0 ? '一直讨论到某一轮没人再发言' : `一次发言后最多连跑 ${rounds} 轮`}</span>
        </label>
      </section>

      <section className="formSection">
        <h3 className="formSectionTitle">成员</h3>
        <p className="formSectionHint">已选 {memberIds.length} 个 · 需要 {MEMBER_MIN}–{MEMBER_MAX} 个已有人设</p>
        <fieldset className="field memberField" data-testid="group-form-members">
          <legend className="srOnly">成员</legend>
          {props.bots.map(bot => {
            const color = bot.avatar.color !== '' ? bot.avatar.color : hashAvatarColor(bot.id)
            const checked = memberIds.includes(bot.id)
            return (
              <label key={bot.id} className="memberPick" data-checked={checked ? '1' : '0'}>
                <input
                  type="checkbox"
                  data-testid={`group-form-member-${bot.id}`}
                  checked={checked}
                  disabled={locked}
                  onChange={() => toggle(bot.id)}
                />
                <Persona
                  botId={bot.id}
                  name={bot.name}
                  size="sm"
                  mood="idle"
                  color={color}
                  {...bot.avatar.emoji === undefined || bot.avatar.emoji === '' ? {} : { emoji: bot.avatar.emoji }}
                />
                <span className="memberPickName">{bot.name}</span>
              </label>
            )
          })}
          {memberError !== null ? <span className="fieldError" data-testid="group-form-members-error">{memberError}</span> : null}
        </fieldset>
        {props.roundLocked === true ? (
          <p className="formHint">一轮发言进行中，结束后再改成员。</p>
        ) : null}
      </section>

      {errorCopy !== undefined ? (
        <div className="formError" data-testid="group-form-error" role="alert">
          <strong className="formErrorTitle">{errorCopy.title}</strong>
          {errorCopy.hint !== undefined ? <span className="formErrorHint">{errorCopy.hint}</span> : null}
          <span className="formErrorDetail">{errorCopy.detail}（{errorCopy.code}）</span>
        </div>
      ) : null}

      <div className="formActions">
        <button type="button" className="ghostBtn" data-testid="group-form-cancel" onClick={props.onCancel} disabled={props.busy}>
          取消
        </button>
        <button
          type="submit"
          className="primaryBtn"
          data-testid="group-form-submit"
          disabled={locked}
        >
          {props.busy ? '保存中…' : props.mode === 'create' ? '创建' : '保存'}
        </button>
      </div>
    </form>
    </div>
  )
}
