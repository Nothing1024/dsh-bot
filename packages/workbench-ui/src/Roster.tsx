/**
 * Left roster (280px): avatar + name + preview + relative time + working dot.
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { hashAvatarColor, nameInitial, relativeTime } from './avatar.ts'

export interface RosterItem {
  readonly id: string
  readonly name: string
  readonly avatar: { readonly color?: string; readonly emoji?: string }
  readonly preview: string
  readonly updatedAt: number
  readonly working: boolean
  readonly selected: boolean
  readonly protected: boolean
}

export interface RosterProps {
  readonly items: readonly RosterItem[]
  readonly nowMs?: number
  readonly error?: string | null
  readonly onSelect: (id: string) => void
  readonly onCreate: () => void
  readonly onEdit: (id: string) => void
  readonly onDelete: (id: string) => void
  readonly onRename: (id: string, name: string) => void
}

function AvatarGlyph(props: { botId: string; name: string; emoji?: string; color?: string }) {
  const color = props.color && props.color !== '' ? props.color : hashAvatarColor(props.botId)
  const glyph = props.emoji !== undefined && props.emoji !== '' ? props.emoji : nameInitial(props.name)
  return (
    <span className="avatar" style={{ background: color }} data-testid={`roster-avatar-${props.botId}`}>
      {glyph}
    </span>
  )
}

/**
 * Bot list plus the new-bot control and per-row menu.
 */
export function Roster(props: RosterProps) {
  const [menuId, setMenuId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (renameId !== null) renameRef.current?.focus()
  }, [renameId])

  useEffect(() => {
    if (menuId === null) return
    const onDoc = (event: Event): void => {
      const target = event.target as Node | null
      if (target !== null && menuRef.current?.contains(target) === true) return
      setMenuId(null)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuId])

  const commitRename = (id: string): void => {
    const next = renameValue.trim()
    setRenameId(null)
    if (next === '') return
    const current = props.items.find(item => item.id === id)
    if (current !== undefined && current.name === next) return
    props.onRename(id, next)
  }

  const openRename = (item: RosterItem): void => {
    setMenuId(null)
    setRenameId(item.id)
    setRenameValue(item.name)
  }

  return (
    <aside className="roster" data-testid="workbench-roster">
      <div className="rosterHead">
        <span>人设</span>
        <button type="button" className="newBot" data-testid="roster-new" onClick={props.onCreate}>
          + 新建人设
        </button>
      </div>
      <div className="rosterBody">
        {props.error !== null && props.error !== undefined && props.error !== '' ? (
          <p className="formError" data-testid="workbench-action-error">{props.error}</p>
        ) : null}
        {props.items.length === 0 ? (
          <p className="hint" data-testid="workbench-empty">还没有人设</p>
        ) : (
          <ul className="rosterList">
            {props.items.map(item => {
              const selected = item.selected
              const renaming = renameId === item.id
              return (
                <li key={item.id}>
                  <div
                    className={`rosterRow${selected ? ' isSelected' : ''}`}
                    data-testid={`roster-row-${item.id}`}
                    data-active={selected ? 'true' : 'false'}
                    aria-current={selected ? 'page' : undefined}
                    onClick={() => props.onSelect(item.id)}
                    onDoubleClick={(event: MouseEvent) => {
                      event.preventDefault()
                      openRename(item)
                    }}
                  >
                    <span className="avatarWrap">
                      <AvatarGlyph
                        botId={item.id}
                        name={item.name}
                        {...item.avatar.emoji === undefined ? {} : { emoji: item.avatar.emoji }}
                        {...item.avatar.color === undefined ? {} : { color: item.avatar.color }}
                      />
                      {item.working ? (
                        <span className="workingDot" data-testid={`roster-working-${item.id}`} title="工作中" />
                      ) : null}
                    </span>
                    <span className="rosterMain">
                      {renaming ? (
                        <input
                          ref={renameRef}
                          className="renameInput"
                          data-testid={`roster-rename-${item.id}`}
                          value={renameValue}
                          aria-label="改名"
                          onChange={event => setRenameValue(event.target.value)}
                          onClick={event => event.stopPropagation()}
                          onBlur={() => commitRename(item.id)}
                          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                            if (event.key === 'Enter') {
                              event.preventDefault()
                              commitRename(item.id)
                            }
                            if (event.key === 'Escape') {
                              event.preventDefault()
                              setRenameId(null)
                            }
                          }}
                        />
                      ) : (
                        <span className="rosterName" data-testid={`roster-name-${item.id}`}>{item.name}</span>
                      )}
                      <span className="rosterPreview" data-testid={`roster-preview-${item.id}`}>{item.preview}</span>
                    </span>
                    <span className="rosterMeta">
                      <span className="rosterTime">{relativeTime(item.updatedAt, props.nowMs)}</span>
                      <button
                        type="button"
                        className="rowMenuBtn"
                        data-testid={`roster-menu-${item.id}`}
                        aria-label="人设菜单"
                        onClick={event => {
                          event.stopPropagation()
                          setMenuId(current => current === item.id ? null : item.id)
                        }}
                      >
                        ⋯
                      </button>
                    </span>
                  </div>
                  {menuId === item.id ? (
                    <div ref={menuRef} className="rowMenu" data-testid={`roster-menu-panel-${item.id}`}>
                      <button
                        type="button"
                        data-testid={`roster-edit-${item.id}`}
                        onClick={() => {
                          setMenuId(null)
                          props.onEdit(item.id)
                        }}
                      >
                        编辑人设
                      </button>
                      <button
                        type="button"
                        data-testid={`roster-delete-${item.id}`}
                        disabled={item.protected}
                        title={item.protected ? '默认人设不可删除' : '删除人设'}
                        onClick={() => {
                          if (item.protected) return
                          setMenuId(null)
                          setConfirmId(item.id)
                        }}
                      >
                        删除人设
                      </button>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </div>
      {confirmId !== null ? (
        <ConfirmDelete
          name={props.items.find(item => item.id === confirmId)?.name ?? confirmId}
          onCancel={() => setConfirmId(null)}
          onConfirm={() => {
            const id = confirmId
            setConfirmId(null)
            props.onDelete(id)
          }}
        />
      ) : null}
    </aside>
  )
}

function ConfirmDelete(props: { name: string; onCancel: () => void; onConfirm: () => void }) {
  const labelId = useId()
  return (
    <div className="confirmMask" data-testid="roster-delete-confirm">
      <div className="confirmBox" role="dialog" aria-modal="true" aria-labelledby={labelId}>
        <p id={labelId} className="confirmTitle">删除「{props.name}」？</p>
        <p className="hint">历史对话保留，仅移除人设与其 preset。</p>
        <div className="confirmActions">
          <button type="button" className="retry" onClick={props.onCancel}>取消</button>
          <button type="button" className="dangerBtn" data-testid="roster-delete-ok" onClick={props.onConfirm}>
            删除
          </button>
        </div>
      </div>
    </div>
  )
}
