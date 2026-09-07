/**
 * Overlay cards: persona / group / confirm-delete (BR-613 / BR-614).
 */
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactElement } from 'react'
import { AVATAR_COLORS, GROUP_MEMBER_MAX, GROUP_MEMBER_MIN } from 'dsh-bot-shared'
import type { WorkbenchBot, WorkbenchGroup } from 'dsh-bot-shared'
import { zh } from './locales.ts'
import type { OverlayState, OverlayStore } from './overlay-store.ts'
import type { RosterRpc } from './roster-rpc.ts'
import css from './OverlayForms.module.css'

export interface OverlayFormsProps {
  overlay: OverlayStore
  state: OverlayState
  roster: RosterRpc
  bots: readonly WorkbenchBot[]
  groups: readonly WorkbenchGroup[]
  t?: (key: string, vars?: Record<string, string>) => string
  onCreated?: (id: string) => void
  onDeleted?: (id: string) => void
}

function fallbackT(key: string, vars?: Record<string, string>): string {
  let text = zh[key as keyof typeof zh] ?? key
  if (vars !== undefined) {
    for (const [name, value] of Object.entries(vars)) text = text.replaceAll(`{${name}}`, value)
  }
  return text
}

/**
 * Form body for overlay kinds other than graph / palette.
 */
export function OverlayForms(props: OverlayFormsProps): ReactElement | null {
  const t = props.t ?? fallbackT
  const kind = props.state.kind
  if (kind === null || kind === 'graph' || kind === 'palette') return null
  if (kind === 'confirm-delete') {
    return <ConfirmDelete {...props} t={t} />
  }
  if (kind === 'create-group' || kind === 'edit-group') {
    return <GroupFields {...props} t={t} />
  }
  return <BotFields {...props} t={t} />
}

function BotFields(props: OverlayFormsProps & { t: (key: string, vars?: Record<string, string>) => string }): ReactElement {
  const editing = props.state.kind === 'edit-bot'
  const bot = props.bots.find(row => row.id === props.state.id)
  const [name, setName] = useState(bot?.name ?? '')
  const [persona, setPersona] = useState(bot?.persona ?? '')
  const [emoji, setEmoji] = useState(bot?.avatar.emoji ?? '')
  const [color, setColor] = useState(bot?.avatar.color ?? '')
  const [provider, setProvider] = useState(bot?.modelOverride?.provider ?? '')
  const [model, setModel] = useState(bot?.modelOverride?.model ?? '')
  const nameRef = useRef<HTMLInputElement>(null)
  useEffect(() => { nameRef.current?.focus() }, [])
  const blocked = name.trim() === '' || persona.trim() === ''
  const submit = (event: FormEvent): void => {
    event.preventDefault()
    if (blocked || props.state.busy) return
    void (async () => {
      props.overlay.setBusy(true)
      const avatar = {
        ...emoji.trim() !== '' ? { emoji: emoji.trim() } : {},
        ...color.trim() !== '' ? { color: color.trim() } : {},
      }
      const modelOverride = provider.trim() === '' && model.trim() === ''
        ? undefined
        : { provider: provider.trim(), model: model.trim() }
      const outcome = editing && bot !== undefined
        ? await props.roster.updateBot({
          id: bot.id,
          name: name.trim(),
          persona: persona.trim(),
          ...Object.keys(avatar).length > 0 ? { avatar } : {},
          ...modelOverride !== undefined ? { modelOverride } : { modelOverride: null },
        })
        : await props.roster.createBot({
          name: name.trim(),
          persona: persona.trim(),
          ...Object.keys(avatar).length > 0 ? { avatar } : {},
          ...modelOverride !== undefined ? { modelOverride } : {},
        })
      if (!outcome.ok) {
        props.overlay.setBusy(false, outcome.error.code === 'unavailable' ? '网关不可达' : outcome.error.message)
        return
      }
      props.overlay.close()
      props.onCreated?.(outcome.value.id)
    })()
  }
  return (
    <form data-testid="dsh-bot-overlay-form" onSubmit={submit}>
      <div className={css.head}>
        <h2>{props.t(editing ? 'overlay.editBot' : 'overlay.createBot')}</h2>
      </div>
      {props.state.error !== null ? <div className={css.error} data-testid="dsh-bot-overlay-error">{props.state.error}</div> : null}
      <label className={css.field}>
        <span>{props.t('overlay.name')}</span>
        <input ref={nameRef} data-testid="dsh-bot-overlay-name" value={name} onChange={event => { setName(event.target.value) }} disabled={props.state.busy} />
      </label>
      <label className={css.field}>
        <span>{props.t('overlay.persona')}</span>
        <textarea data-testid="dsh-bot-overlay-persona" value={persona} onChange={event => { setPersona(event.target.value) }} disabled={props.state.busy} />
      </label>
      <label className={css.field}>
        <span>{props.t('overlay.emoji')}</span>
        <input data-testid="dsh-bot-overlay-emoji" value={emoji} onChange={event => { setEmoji(event.target.value) }} disabled={props.state.busy} />
      </label>
      <div className={css.field}>
        <span>{props.t('overlay.color')}</span>
        <div className={css.colors}>
          {AVATAR_COLORS.map(swatch => (
            <button
              key={swatch}
              type="button"
              className={css.swatch}
              data-on={color === swatch ? '1' : '0'}
              data-testid={`dsh-bot-overlay-color-${swatch}`}
              style={{ background: swatch }}
              onClick={() => { setColor(swatch) }}
            />
          ))}
        </div>
      </div>
      <label className={css.field}>
        <span>{props.t('overlay.model')}</span>
        <input data-testid="dsh-bot-overlay-provider" placeholder="provider" value={provider} onChange={event => { setProvider(event.target.value) }} disabled={props.state.busy} />
        <input data-testid="dsh-bot-overlay-model" placeholder="model" value={model} onChange={event => { setModel(event.target.value) }} disabled={props.state.busy} />
      </label>
      <div className={css.actions}>
        <button type="button" onClick={() => { props.overlay.close() }} disabled={props.state.busy}>{props.t('overlay.cancel')}</button>
        <button type="submit" data-testid="dsh-bot-overlay-save" data-primary="1" disabled={blocked || props.state.busy}>{props.t('overlay.save')}</button>
      </div>
    </form>
  )
}

function GroupFields(props: OverlayFormsProps & { t: (key: string, vars?: Record<string, string>) => string }): ReactElement {
  const editing = props.state.kind === 'edit-group'
  const group = props.groups.find(row => row.id === props.state.id)
  const visibleBots = useMemo(() => props.bots.filter(bot => bot.hidden !== true), [props.bots])
  const [name, setName] = useState(group?.name ?? '')
  const [memberIds, setMemberIds] = useState<readonly string[]>(group?.memberIds ?? [])
  const nameRef = useRef<HTMLInputElement>(null)
  useEffect(() => { nameRef.current?.focus() }, [])
  const blocked = name.trim() === '' || memberIds.length < GROUP_MEMBER_MIN || memberIds.length > GROUP_MEMBER_MAX
  const toggle = (id: string): void => {
    setMemberIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
  }
  const submit = (event: FormEvent): void => {
    event.preventDefault()
    if (blocked || props.state.busy) return
    void (async () => {
      props.overlay.setBusy(true)
      const outcome = editing && group !== undefined
        ? await props.roster.updateGroup({ id: group.id, name: name.trim(), memberIds })
        : await props.roster.createGroup({ name: name.trim(), memberIds })
      if (!outcome.ok) {
        props.overlay.setBusy(false, outcome.error.code === 'unavailable' ? '网关不可达' : outcome.error.message)
        return
      }
      props.overlay.close()
      props.onCreated?.(outcome.value.id)
    })()
  }
  return (
    <form data-testid="dsh-bot-overlay-form" onSubmit={submit}>
      <div className={css.head}>
        <h2>{props.t(editing ? 'overlay.editGroup' : 'overlay.createGroup')}</h2>
      </div>
      {props.state.error !== null ? <div className={css.error} data-testid="dsh-bot-overlay-error">{props.state.error}</div> : null}
      <label className={css.field}>
        <span>{props.t('overlay.name')}</span>
        <input ref={nameRef} data-testid="dsh-bot-overlay-name" value={name} onChange={event => { setName(event.target.value) }} disabled={props.state.busy} />
      </label>
      <div className={css.field}>
        <span>{props.t('overlay.members')}</span>
        <div className={css.checks}>
          {visibleBots.map(bot => (
            <label key={bot.id}>
              <input
                type="checkbox"
                data-testid={`dsh-bot-overlay-member-${bot.id}`}
                checked={memberIds.includes(bot.id)}
                onChange={() => { toggle(bot.id) }}
                disabled={props.state.busy}
              />
              {bot.name}
            </label>
          ))}
        </div>
        {memberIds.length < GROUP_MEMBER_MIN ? <div className={css.hint}>{props.t('overlay.memberHint')}</div> : null}
      </div>
      <div className={css.actions}>
        <button type="button" onClick={() => { props.overlay.close() }} disabled={props.state.busy}>{props.t('overlay.cancel')}</button>
        <button type="submit" data-testid="dsh-bot-overlay-save" data-primary="1" disabled={blocked || props.state.busy}>{props.t('overlay.save')}</button>
      </div>
    </form>
  )
}

function ConfirmDelete(props: OverlayFormsProps & { t: (key: string, vars?: Record<string, string>) => string }): ReactElement {
  const target = props.state.target === 'group'
    ? props.groups.find(row => row.id === props.state.id)
    : props.bots.find(row => row.id === props.state.id)
  const name = target?.name ?? ''
  const isGroup = props.state.target === 'group'
  const protectedBot = !isGroup && props.bots.some(row => row.id === props.state.id && row.protected)
  const confirm = (): void => {
    if (props.state.busy) return
    if (protectedBot) {
      props.overlay.setBusy(false, 'the default DSH Bot cannot be deleted')
      return
    }
    void (async () => {
      props.overlay.setBusy(true)
      const id = props.state.id ?? ''
      const outcome = isGroup ? await props.roster.deleteGroup(id) : await props.roster.deleteBot(id)
      if (!outcome.ok) {
        props.overlay.setBusy(false, outcome.error.code === 'unavailable' ? '网关不可达' : outcome.error.message)
        return
      }
      props.overlay.close()
      props.onDeleted?.(id)
    })()
  }
  return (
    <div data-testid="dsh-bot-overlay-confirm">
      <p>{props.t(isGroup ? 'overlay.deleteGroupText' : 'overlay.deleteBotText', { name })}</p>
      {props.state.error !== null ? <div className={css.error} data-testid="dsh-bot-overlay-error">{props.state.error}</div> : null}
      <div className={css.actions}>
        <button type="button" onClick={() => { props.overlay.close() }}>{props.t('overlay.cancel')}</button>
        <button type="button" data-testid="dsh-bot-overlay-delete" data-primary="1" disabled={props.state.busy} onClick={confirm}>
          {props.t('overlay.delete')}
        </button>
      </div>
    </div>
  )
}
