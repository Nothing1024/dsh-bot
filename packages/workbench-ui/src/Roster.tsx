/**
 * Left roster (280px): avatar + name + preview + relative time + working dot.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { hashAvatarColor, nameInitial, relativeTime } from './avatar.ts'
import { Persona } from './Persona.tsx'
import { DEFAULT_ROSTER_SECTIONS, groupRosterItems } from './roster-sections.ts'
import type { RosterSection } from './roster-sections.ts'
import { ESCAPE_PRIORITY, useEscapeLayer } from './interactions.tsx'

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
  readonly pinned?: boolean
  readonly section?: string
  readonly hidden?: boolean
  readonly order?: number
  readonly muted?: boolean
  readonly modelLabel?: string
  readonly routineCount?: number
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
  readonly sections?: readonly RosterSection[]
  readonly collapsed?: boolean
  readonly onLayout?: (input: {
    bots?: readonly { id: string; pinned?: boolean; section?: string; hidden?: boolean; order?: number; muted?: boolean }[]
    groups?: readonly { id: string; section?: string; order?: number }[]
  }) => void
  readonly onMarkRead?: (id: string) => void
  readonly onRenameSection?: (id: string, name: string) => void
  readonly folded?: ReadonlySet<string>
  readonly onToggleSection?: (id: string) => void
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

const HOVER_CARD_WIDTH = 220
const HOVER_CARD_GAP = 28

function placeHoverCard(anchor: HTMLElement): { readonly top: number; readonly left: number } {
  const rect = anchor.getBoundingClientRect()
  let left = rect.right + HOVER_CARD_GAP
  if (left + HOVER_CARD_WIDTH > window.innerWidth - 8) {
    left = Math.max(8, rect.left - HOVER_CARD_WIDTH - HOVER_CARD_GAP)
  }
  const top = Math.max(8, Math.min(rect.top, window.innerHeight - 48))
  return { top, left }
}

/**
 * Hover summary. Portaled and fixed so the sidebar's overflow clip cannot
 * turn the card's shadow into a band on the roster's right edge.
 */
function RosterHoverCard(props: {
  readonly anchor: HTMLElement
  readonly testId: string
  readonly children: ReactNode
}) {
  const [place, setPlace] = useState(() => placeHoverCard(props.anchor))
  useLayoutEffect(() => {
    const sync = (): void => {
      const next = placeHoverCard(props.anchor)
      setPlace(current => current.top === next.top && current.left === next.left ? current : next)
    }
    sync()
    window.addEventListener('resize', sync)
    window.addEventListener('scroll', sync, true)
    return () => {
      window.removeEventListener('resize', sync)
      window.removeEventListener('scroll', sync, true)
    }
  }, [props.anchor])
  return createPortal(
    <div className="rosterPreviewCard" data-testid={props.testId} style={{ top: place.top, left: place.left }}>
      {props.children}
    </div>,
    document.body,
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
  const [localFolded, setLocalFolded] = useState<ReadonlySet<string>>(() => new Set())
  const folded = props.folded ?? localFolded
  const toggleSection = (id: string): void => {
    if (props.onToggleSection !== undefined) {
      props.onToggleSection(id)
      return
    }
    setLocalFolded(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const [hiddenOpen, setHiddenOpen] = useState(false)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const previewAnchor = useRef<HTMLDivElement | null>(null)
  const hoverTimer = useRef<number | null>(null)
  const leaveTimer = useRef<number | null>(null)
  const renameRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const sections = props.sections ?? DEFAULT_ROSTER_SECTIONS
  const grouped = groupRosterItems(props.items, sections)
  const listIdPrefix = useId()
  useEscapeLayer(menuId !== null, () => setMenuId(null), { priority: ESCAPE_PRIORITY.menu })
  useEscapeLayer(confirmId !== null, () => setConfirmId(null), { priority: ESCAPE_PRIORITY.dialog })

  const applyLayout = (input: NonNullable<RosterProps['onLayout']> extends (i: infer I) => void ? I : never): void => {
    props.onLayout?.(input)
  }

  const clearHover = (): void => {
    if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current)
    if (leaveTimer.current !== null) window.clearTimeout(leaveTimer.current)
    hoverTimer.current = null
    leaveTimer.current = null
  }

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
    <aside className={`roster${props.collapsed === true ? ' isCollapsed' : ''}`} data-testid="workbench-roster">
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
        {props.items.length === 0 ? (
          <p className="hint" data-testid="workbench-empty">还没有人设</p>
        ) : (
          grouped.visible.map(bucket => {
            const collapsedSec = folded.has(bucket.section.id)
            const listId = `${listIdPrefix}-${bucket.section.id}`
            return (
          <section
            key={bucket.section.id}
            className="rosterSection"
            data-testid={`roster-section-${bucket.section.id}`}
            onDragOver={event => event.preventDefault()}
            onDrop={event => {
              event.preventDefault()
              const id = event.dataTransfer.getData('text/plain')
              if (id === '') return
              const item = props.items.find(row => row.id === id)
              if (item === undefined) return
              const pinned = bucket.section.id === 'pinned'
              if (item.kind === 'group') {
                applyLayout({ groups: [{ id, section: bucket.section.id, order: Date.now() }] })
              } else {
                applyLayout({ bots: [{ id, pinned, section: bucket.section.id, order: Date.now() }] })
              }
            }}
          >
            <button
              type="button"
              className="rosterSectionHead"
              data-testid={`roster-section-toggle-${bucket.section.id}`}
              aria-expanded={!collapsedSec}
              aria-controls={listId}
              onClick={() => toggleSection(bucket.section.id)}
            >
              {bucket.section.name}
            </button>
            {collapsedSec ? null : bucket.items.length === 0 ? (
              <p id={listId} className="categoryEmpty" data-testid={`roster-section-empty-${bucket.section.id}`}>暂无</p>
            ) : (
          <ul id={listId} className="rosterList">
            {bucket.items.map(item => {
              const selected = item.selected
              const renaming = renameId === item.id
              return (
                <li key={item.id}>
                  <div
                    className={`rosterRow${selected ? ' isSelected' : ''}${item.muted === true ? ' isMuted' : ''}`}
                    data-testid={`roster-row-${item.id}`}
                    data-kind={item.kind === 'group' ? 'group' : 'bot'}
                    data-active={selected ? 'true' : 'false'}
                    aria-current={selected ? 'page' : undefined}
                    tabIndex={0}
                    onClick={() => props.onSelect(item.id)}
                    onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
                      // Only the row itself; the nested menu button and rename input keep their own keys.
                      if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return
                      event.preventDefault()
                      props.onSelect(item.id)
                    }}
                    onDoubleClick={(event: MouseEvent) => {
                      event.preventDefault()
                      openRename(item)
                    }}
                    draggable
                    data-muted={item.muted === true ? 'true' : 'false'}
                    onDragStart={event => {
                      event.dataTransfer.setData('text/plain', item.id)
                      clearHover()
                      setPreviewId(null)
                      setMenuId(null)
                    }}
                    onMouseEnter={(event) => {
                      const anchor = event.currentTarget
                      clearHover()
                      hoverTimer.current = window.setTimeout(() => {
                        previewAnchor.current = anchor
                        setPreviewId(item.id)
                      }, 500)
                    }}
                    onMouseLeave={() => {
                      clearHover()
                      leaveTimer.current = window.setTimeout(() => {
                        setPreviewId(current => current === item.id ? null : current)
                      }, 150)
                    }}
                    onContextMenu={event => {
                      event.preventDefault()
                      setMenuId(item.id)
                    }}
                  >
                    {previewId === item.id && previewAnchor.current !== null ? (
                      <RosterHoverCard anchor={previewAnchor.current} testId={`roster-hover-${item.id}`}>
                        <div>{item.modelLabel ?? '默认模型'}</div>
                        <div>例行 {item.routineCount ?? 0}</div>
                        <div>会话 {item.sessionCount ?? 0}</div>
                        <div>{item.preview.trim() === '' ? '还没聊过' : item.preview}</div>
                      </RosterHoverCard>
                    ) : null}
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
                          data-escape-local="true"
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
                      <button
                        type="button"
                        data-testid={`roster-pin-${item.id}`}
                        onClick={() => {
                          setMenuId(null)
                          if (item.kind === 'group') applyLayout({ groups: [{ id: item.id, section: item.section === 'pinned' ? '' : 'pinned' }] })
                          else applyLayout({ bots: [{ id: item.id, pinned: item.pinned !== true, section: item.pinned === true ? '' : 'pinned' }] })
                        }}
                      >
                        {(item.kind === 'group' ? item.section === 'pinned' : item.pinned === true) ? '取消置顶' : '置顶'}
                      </button>
                      <button
                        type="button"
                        data-testid={`roster-read-${item.id}`}
                        onClick={() => {
                          setMenuId(null)
                          props.onMarkRead?.(item.id)
                        }}
                      >
                        标已读
                      </button>
                      {item.kind === 'group' ? null : (
                        <>
                          <button
                            type="button"
                            data-testid={`roster-hide-${item.id}`}
                            onClick={() => {
                              setMenuId(null)
                              applyLayout({ bots: [{ id: item.id, hidden: true }] })
                            }}
                          >
                            隐藏
                          </button>
                          <button
                            type="button"
                            data-testid={`roster-mute-${item.id}`}
                            onClick={() => {
                              setMenuId(null)
                              applyLayout({ bots: [{ id: item.id, muted: item.muted !== true }] })
                            }}
                          >
                            {item.muted === true ? '取消静音' : '静音'}
                          </button>
                        </>
                      )}
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
                </li>
              )
            })}
          </ul>
            )}
          </section>
            )
          })
        )}
        {grouped.hidden.length > 0 ? (
          <div className="rosterHidden" data-testid="roster-hidden">
            <button
              type="button"
              className="rosterHiddenHead"
              data-testid="roster-hidden-toggle"
              onClick={() => setHiddenOpen(open => !open)}
            >
              已隐藏 {grouped.hidden.length} 个
              {grouped.hidden.reduce((n, row) => n + (row.unread ?? 0), 0) > 0
                ? ` · ${grouped.hidden.reduce((n, row) => n + (row.unread ?? 0), 0)}`
                : ''}
            </button>
            {hiddenOpen ? (
              <ul className="rosterList">
                {grouped.hidden.map(item => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="rosterRow"
                      data-testid={`roster-hidden-row-${item.id}`}
                      onClick={() => props.onSelect(item.id)}
                    >
                      {item.name}
                    </button>
                    <button
                      type="button"
                      data-testid={`roster-unhide-${item.id}`}
                      onClick={() => applyLayout({ bots: [{ id: item.id, hidden: false }] })}
                    >
                      取消隐藏
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
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
