/**
 * Create / edit group: name + 2–6 existing bots (BR-301 / BR-302).
 */
import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { WorkbenchBot, WorkbenchGroup } from './api.ts'
import { hashAvatarColor, nameInitial } from './avatar.ts'

const MEMBER_MIN = 2
const MEMBER_MAX = 6

export interface GroupFormValues {
  readonly name: string
  readonly memberIds: readonly string[]
}

export interface GroupFormProps {
  readonly mode: 'create' | 'edit'
  readonly bots: readonly WorkbenchBot[]
  readonly initial?: WorkbenchGroup
  readonly busy: boolean
  readonly error: string | null
  readonly roundLocked?: boolean
  readonly onCancel: () => void
  readonly onSubmit: (values: GroupFormValues) => void
}

export function GroupForm(props: GroupFormProps) {
  const [name, setName] = useState(props.initial?.name ?? '')
  const [memberIds, setMemberIds] = useState<readonly string[]>(props.initial?.memberIds ?? [])
  const [nameError, setNameError] = useState<string | null>(null)
  const [memberError, setMemberError] = useState<string | null>(null)
  const submitLock = useRef(false)

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
    props.onSubmit({ name: trimmed, memberIds })
  }

  const locked = props.busy || props.roundLocked === true

  return (
    <form className="botForm" data-testid="group-form" data-mode={props.mode} onSubmit={submit}>
      <header className="botFormHead">
        <h2>{props.mode === 'create' ? '新建小组' : '编辑成员'}</h2>
        <button type="button" className="retry" data-testid="group-form-cancel" onClick={props.onCancel} disabled={props.busy}>
          取消
        </button>
      </header>
      <label className="field">
        <span>名字</span>
        <input
          data-testid="group-form-name"
          value={name}
          maxLength={64}
          autoComplete="off"
          disabled={locked}
          onChange={event => {
            setName(event.target.value)
            if (event.target.value.trim() !== '') setNameError(null)
          }}
        />
        {nameError !== null ? <span className="fieldError" data-testid="group-form-name-error">{nameError}</span> : null}
      </label>
      <fieldset className="field" data-testid="group-form-members">
        <legend>成员（2–6 个已有人设）</legend>
        {props.bots.map(bot => {
          const color = bot.avatar.color !== '' ? bot.avatar.color : hashAvatarColor(bot.id)
          const glyph = bot.avatar.emoji !== undefined && bot.avatar.emoji !== ''
            ? bot.avatar.emoji
            : nameInitial(bot.name)
          const checked = memberIds.includes(bot.id)
          return (
            <label key={bot.id} className="memberPick">
              <input
                type="checkbox"
                data-testid={`group-form-member-${bot.id}`}
                checked={checked}
                disabled={locked}
                onChange={() => toggle(bot.id)}
              />
              <span className="avatar sm" style={{ background: color }}>{glyph}</span>
              <span>{bot.name}</span>
            </label>
          )
        })}
        {memberError !== null ? <span className="fieldError" data-testid="group-form-members-error">{memberError}</span> : null}
      </fieldset>
      {props.roundLocked === true ? (
        <p className="formHint">一轮发言进行中，结束后再改成员。</p>
      ) : null}
      {props.error !== null && props.error !== '' ? (
        <p className="formError" data-testid="group-form-error">{props.error}</p>
      ) : null}
      <div className="formActions">
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
  )
}
