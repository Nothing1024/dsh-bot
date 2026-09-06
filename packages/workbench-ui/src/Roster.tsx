/**
 * Left roster (280px): avatar + name + preview + relative time + working dot.
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { hashAvatarColor, nameInitial, relativeTime } from './avatar.ts'
import { Persona } from './Persona.tsx'
import { nestedSessionSlice } from './session-binding.ts'
import { SessionJumpMenuItem } from './SessionList.tsx'

export interface RosterMemberAvatar {
  readonly id: string
  readonly name: string
  readonly color?: string
  readonly emoji?: string
}

export interface RosterSession {
  readonly sessionId: string
  readonly title: string
  readonly updatedAt: number
  readonly working: boolean
  readonly hidden: boolean
  readonly selected: boolean
}

export interface RosterItem {
  readonly id: string
  readonly name: string
  readonly avatar: { readonly color?: string; readonly emoji?: string }
  readonly preview: string
  readonly updatedAt: number
  readonly working: boolean
  readonly selected: boolean
  readonly protected: boolean
  readonly kind?: 'bot' | 'group'
  readonly members?: readonly RosterMemberAvatar[]
  readonly sessionCount?: number
  readonly unread?: number
  readonly sessions?: readonly RosterSession[]
}

export interface RosterProps {
  readonly items: readonly RosterItem[]
  readonly nowMs?: number
  readonly error?: string | null
  readonly onSelect: (id: string) => void
  readonly onSelectSession?: (ownerId: string, sessionId: string) => void
  readonly onNewSession?: (ownerId: string) => void
  readonly onCreate: () => void
  readonly onCreateGroup?: () => void
  readonly onEdit: (id: string) => void
  readonly onEditMembers?: (id: string) => void
  readonly onDelete: (id: string) => void
  readonly onDeleteGroup?: (id: string) => void
  readonly onRename: (id: string, name: string) => void
  readonly onOpenGraph?: () => void
}

function AvatarGlyph(props: {
  botId: string
  name: string
  emoji?: string
  color?: string
  mood?: 'idle' | 'thinking' | 'working'
}) {
  return (
    <Persona
      botId={props.botId}
      name={props.name}
      testId={`roster-avatar-${props.botId}`}
      {...props.color === undefined ? {} : { color: props.color }}
      {...props.emoji === undefined ? {} : { emoji: props.emoji }}
      {...props.mood === undefined ? {} : { mood: props.mood }}
    />
  )
}

function MosaicAvatar(props: { id: string; members: readonly RosterMemberAvatar[] }) {
  const tiles = props.members.slice(0, 4)
  const countClass = tiles.length <= 2 ? 'n2' : 'n4'
  return (
    <span className={`mosaic ${countClass}`} data-testid={`roster-avatar-${props.id}`}>
      {tiles.map(member => {
        const color = member.color !== undefined && member.color !== '' ? member.color : hashAvatarColor(member.id)
        const glyph = member.emoji !== undefined && member.emoji !== '' ? member.emoji : nameInitial(member.name)
        return (
          <span key={member.id} className="tile" style={{ background: color }} title={member.name}>
            {glyph}
          </span>
        )
      })}
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
  const [jumpToast, setJumpToast] = useState<string | null>(null)
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

  useEffect(() => {
    if (jumpToast === null) return
    const timer = window.setTimeout(() => setJumpToast(null), 4000)
    return () => window.clearTimeout(timer)
  }, [jumpToast])

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
        <span className="rosterHeadActions">
          {props.onOpenGraph === undefined ? null : (
            <button type="button" className="newBot" data-testid="roster-graph" onClick={props.onOpenGraph}>
              关系图
            </button>
          )}
          <button type="button" className="newBot" data-testid="roster-new" onClick={props.onCreate}>
            + 新建人设
          </button>
          {props.onCreateGroup !== undefined ? (
            <button type="button" className="newBot" data-testid="roster-new-group" onClick={props.onCreateGroup}>
              + 新建小组
            </button>
          ) : null}
        </span>
      </div>
      <div className="rosterBody">
        {props.error !== null && props.error !== undefined && props.error !== '' ? (
          <p className="formError" data-testid="workbench-action-error">{props.error}</p>
        ) : null}
        {jumpToast !== null ? (
          <p className="formHint" data-testid="roster-toast">{jumpToast}</p>
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
                    data-kind={item.kind === 'group' ? 'group' : 'bot'}
                    data-active={selected ? 'true' : 'false'}
                    aria-current={selected ? 'page' : undefined}
                    onClick={() => props.onSelect(item.id)}
                    onDoubleClick={(event: MouseEvent) => {
                      event.preventDefault()
                      openRename(item)
                    }}
                  >
                    <span className={`avatarWrap${item.working ? ' isWorking' : ''}`}>
                      {item.kind === 'group' && item.members !== undefined && item.members.length >= 2 ? (
                        <MosaicAvatar id={item.id} members={item.members} />
                      ) : (
                        <AvatarGlyph
                          botId={item.id}
                          name={item.name}
                          mood={item.working ? 'working' : 'idle'}
                          {...item.avatar.emoji === undefined ? {} : { emoji: item.avatar.emoji }}
                          {...item.avatar.color === undefined ? {} : { color: item.avatar.color }}
                        />
                      )}
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
                      {item.unread !== undefined && item.unread > 0 ? (
                        <span className="unreadBadge" data-testid={`roster-unread-${item.id}`}>{item.unread}</span>
                      ) : null}
                      {item.sessionCount !== undefined && item.sessionCount > 1 ? (
                        <span
                          className="sessionCount"
                          data-testid={`roster-session-count-${item.id}`}
                          title={`${item.sessionCount} 段对话`}
                        >
                          {item.sessionCount}
                        </span>
                      ) : null}
                      <span className="rosterTime">{relativeTime(item.updatedAt, props.nowMs)}</span>
                      <button
                        type="button"
                        className="rowMenuBtn"
                        data-testid={`roster-menu-${item.id}`}
                        aria-label={item.kind === 'group' ? '小组菜单' : '人设菜单'}
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
                      {item.kind === 'group' ? (
                        <>
                          <button
                            type="button"
                            data-testid={`roster-edit-${item.id}`}
                            onClick={() => {
                              setMenuId(null)
                              props.onEditMembers?.(item.id)
                            }}
                          >
                            编辑成员
                          </button>
                          <button
                            type="button"
                            data-testid={`roster-delete-${item.id}`}
                            onClick={() => {
                              setMenuId(null)
                              setConfirmId(item.id)
                            }}
                          >
                            删除小组
                          </button>
                        </>
                      ) : (
                        <>
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
                        </>
                      )}
                    </div>
                  ) : null}
                  {selected ? (
                    <BoundSessions
                      ownerId={item.id}
                      jumpable={item.kind !== 'group'}
                      sessions={item.sessions ?? []}
                      onToast={setJumpToast}
                      {...props.nowMs === undefined ? {} : { nowMs: props.nowMs }}
                      {...props.onSelectSession === undefined ? {} : { onSelectSession: props.onSelectSession }}
                      {...props.onNewSession === undefined ? {} : { onNewSession: props.onNewSession }}
                    />
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
          group={props.items.find(item => item.id === confirmId)?.kind === 'group'}
          onCancel={() => setConfirmId(null)}
          onConfirm={() => {
            const id = confirmId
            const group = props.items.find(item => item.id === id)?.kind === 'group'
            setConfirmId(null)
            if (group) props.onDeleteGroup?.(id)
            else props.onDelete(id)
          }}
        />
      ) : null}
    </aside>
  )
}

function BoundSessions(props: {
  ownerId: string
  jumpable: boolean
  sessions: readonly RosterSession[]
  nowMs?: number
  onToast: (text: string) => void
  onSelectSession?: (ownerId: string, sessionId: string) => void
  onNewSession?: (ownerId: string) => void
}) {
  const [menuId, setMenuId] = useState<string | null>(null)
  const menuRef = useRef<HTMLLIElement>(null)
  const sliced = nestedSessionSlice(props.sessions)

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

  return (
    <div className="rosterSessions" data-testid={`roster-sessions-${props.ownerId}`}>
      {props.sessions.length === 0 ? (
        <p className="hint rosterSessionsEmpty">还没有对话</p>
      ) : (
        <ul className="rosterSessionList">
          {sliced.visible.map(session => (
            <li key={session.sessionId} ref={menuId === session.sessionId ? menuRef : undefined}>
              <div className="rosterSessionRow">
                <button
                  type="button"
                  className={`rosterSession${session.selected ? ' isSelected' : ''}`}
                  data-testid={`roster-session-${session.sessionId}`}
                  data-selected={session.selected ? 'true' : 'false'}
                  onClick={event => {
                    event.stopPropagation()
                    props.onSelectSession?.(props.ownerId, session.sessionId)
                  }}
                >
                  <span className="rosterSessionTitle">{session.title}</span>
                  <span className="rosterSessionMeta">
                    {session.working ? <span className="sessionOptionWorking">工作中</span> : null}
                    <span className="rosterTime">{relativeTime(session.updatedAt, props.nowMs)}</span>
                  </span>
                </button>
                {props.jumpable ? (
                  <button
                    type="button"
                    className="rowMenuBtn"
                    data-testid={`roster-session-menu-${session.sessionId}`}
                    aria-label="会话操作"
                    onClick={event => {
                      event.stopPropagation()
                      setMenuId(current => current === session.sessionId ? null : session.sessionId)
                    }}
                  >
                    ⋯
                  </button>
                ) : null}
              </div>
              {props.jumpable && menuId === session.sessionId ? (
                <div className="rowMenu" data-testid={`roster-session-menu-panel-${session.sessionId}`}>
                  <SessionJumpMenuItem
                    sessionId={session.sessionId}
                    testId={`roster-session-jump-${session.sessionId}`}
                    onToast={props.onToast}
                    onDone={() => setMenuId(null)}
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {sliced.hiddenCount > 0 ? (
        <p className="hint rosterSessionsMore" data-testid={`roster-sessions-more-${props.ownerId}`}>
          还有 {sliced.hiddenCount} 段，用顶栏「对话」查看全部
        </p>
      ) : null}
      {props.onNewSession !== undefined ? (
        <button
          type="button"
          className="rosterSessionNew"
          data-testid={`roster-session-new-${props.ownerId}`}
          onClick={event => {
            event.stopPropagation()
            props.onNewSession?.(props.ownerId)
          }}
        >
          + 新开对话
        </button>
      ) : null}
    </div>
  )
}

function ConfirmDelete(props: { name: string; group?: boolean; onCancel: () => void; onConfirm: () => void }) {
  const labelId = useId()
  return (
    <div className="confirmMask" data-testid="roster-delete-confirm">
      <div className="confirmBox" role="dialog" aria-modal="true" aria-labelledby={labelId}>
        <p id={labelId} className="confirmTitle">删除「{props.name}」？</p>
        <p className="hint">
          {props.group === true
            ? '会删掉小组和房间记录，成员人设和他们的私聊都会保留。'
            : '历史对话保留，仅移除人设与其 preset。'}
        </p>
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
