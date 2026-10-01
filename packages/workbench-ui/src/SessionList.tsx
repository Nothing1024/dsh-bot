import { ESCAPE_PRIORITY, moveMenuFocus, SessionRename, useEscapeLayer } from './interactions.tsx'
/**
 * Bound-session rows: one bot/group owns many threads. Used in the
 * conversation header switcher. Official / leftover sessions jump via
 * session-tool (`在官方会话打开` / `在会话协作中查看全部`).
 */
import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { relativeTime } from './avatar.ts'
import {
  browseSessionTool,
  CHILD_SESSION_JUMP_TOAST,
  performWorkbenchJump,
  SESSION_TOOL_BROWSE_LABEL,
} from './jump.ts'

export interface SessionChoice {
  readonly sessionId: string
  readonly title: string
  readonly updatedAt: number
  readonly working: boolean
  readonly hidden: boolean
  readonly child: boolean
  readonly selected: boolean
}

export interface SessionListProps {
  readonly items: readonly SessionChoice[]
  readonly nowMs?: number
  readonly emptyHint?: string
  readonly onSelect: (sessionId: string) => void
  readonly onCreate?: () => void
  readonly includeHidden?: boolean
  readonly onIncludeHidden?: (next: boolean) => void
  readonly onToast?: (text: string) => void
  readonly groupMode?: boolean
  /** Group rooms only (BR-004): opens the caller's confirm dialog; never deletes directly. */
  readonly onDeleteRoom?: (sessionId: string, title: string) => void
  readonly onOpenOfficialSession?: (sessionId: string) => Promise<void> | void
  readonly onOpenSessionTool?: () => void
}

export interface SessionJumpMenuItemProps {
  readonly sessionId: string
  readonly testId: string
  readonly onToast: (text: string) => void
  readonly onDone: () => void
  readonly child?: boolean
  readonly onOpenOfficialSession?: (sessionId: string) => Promise<void> | void
}

/**
 * Jump to the official conversation (session-tool openSession), or copy the id.
 */
export function SessionJumpMenuItem(props: SessionJumpMenuItemProps) {
  const hosted = props.onOpenOfficialSession !== undefined
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  return (
    <button
      type="button"
      role="menuitem"
      data-testid={props.testId}
      title={hosted ? '通过会话协作跳到官方对话' : '复制后可到会话协作打开原来的会话'}
      disabled={busy}
      aria-busy={busy}
      onClick={() => {
        if (props.child === true) {
          props.onToast(CHILD_SESSION_JUMP_TOAST)
          props.onDone()
          return
        }
        if (busyRef.current) return
        busyRef.current = true
        setBusy(true)
        void performWorkbenchJump(props.sessionId, props.onToast, props.onOpenOfficialSession).finally(() => {
          busyRef.current = false
          setBusy(false)
          props.onDone()
        })
      }}
    >
      {hosted ? '在官方会话打开' : '复制会话 ID'}
    </button>
  )
}

/**
 * Vertical list of sessions that belong to the current identity.
 */
export function SessionList(props: SessionListProps) {
  const [menuId, setMenuId] = useState<string | null>(null)
  const menuRef = useRef<HTMLLIElement>(null)
  const toast = props.onToast ?? ((text: string) => { void text })
  useEscapeLayer(menuId !== null, () => setMenuId(null), {
    priority: ESCAPE_PRIORITY.menu,
    initialFocus: () => menuRef.current?.querySelector<HTMLElement>('.sessionRowMenu [role="menuitem"]'),
  })

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
    <div className="sessionList" data-testid="session-list">
      {props.items.length === 0 ? (
        <p className="hint sessionListEmpty" data-testid="session-list-empty">
          {props.emptyHint ?? '还没有对话'}
        </p>
      ) : (
        <ul className="sessionListItems" role="none">
          {props.items.map(item => (
            <li key={item.sessionId} role="none" ref={menuId === item.sessionId ? menuRef : undefined}>
              <div className="sessionRow" role="none">
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={item.selected}
                  className={`sessionOption${item.selected ? ' isSelected' : ''}`}
                  data-testid={`session-option-${item.sessionId}`}
                  data-selected={item.selected ? 'true' : 'false'}
                  data-hidden={item.hidden ? 'true' : undefined}
                  onClick={() => props.onSelect(item.sessionId)}
                >
                  <span className="sessionOptionMain">
                    <span className="sessionOptionTitle">{item.title}</span>
                    {item.working ? (
                      <span className="sessionOptionWorking" title="工作中">工作中</span>
                    ) : null}
                  </span>
                  <span className="sessionOptionTime">
                    {relativeTime(item.updatedAt, props.nowMs)}
                  </span>
                </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="rowMenuBtn sessionRowMenuBtn"
                    data-testid={`session-menu-${item.sessionId}`}
                    aria-label={`会话操作：${item.title}`}
                    aria-haspopup="menu"
                    aria-expanded={menuId === item.sessionId}
                    onClick={(event: MouseEvent) => {
                      event.stopPropagation()
                      setMenuId(current => current === item.sessionId ? null : item.sessionId)
                    }}
                  >
                    ⋯
                  </button>
              </div>
              {menuId === item.sessionId ? (
                <div className="rowMenu sessionRowMenu" role="menu" aria-label="会话操作" data-testid={`session-menu-panel-${item.sessionId}`} onKeyDown={moveMenuFocus}>
                  <SessionJumpMenuItem
                    sessionId={item.sessionId}
                    testId={`session-jump-${item.sessionId}`}
                    child={item.child}
                    onToast={toast}
                    onDone={() => setMenuId(null)}
                    {...props.onOpenOfficialSession === undefined ? {} : { onOpenOfficialSession: props.onOpenOfficialSession }}
                  />
                  <SessionRename
                    sessionId={item.sessionId}
                    title={item.title}
                    testId={`session-rename-${item.sessionId}`}
                    onToast={toast}
                    onDone={() => setMenuId(null)}
                  />
                  {props.groupMode === true && props.onDeleteRoom !== undefined ? (
                    <button
                      type="button"
                      role="menuitem"
                      className="dangerItem"
                      data-testid={`session-delete-${item.sessionId}`}
                      onClick={() => {
                        setMenuId(null)
                        props.onDeleteRoom?.(item.sessionId, item.title)
                      }}
                    >
                      删除房间
                    </button>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {props.onCreate !== undefined ? (
        <button
          type="button"
          role="menuitem"
          className="sessionListNew"
          data-testid="session-list-new"
          onClick={props.onCreate}
        >
          {props.groupMode === true ? "+ 新开房间" : "+ 新开对话"}
        </button>
      ) : null}
      {props.onIncludeHidden !== undefined ? (
        <label className="hiddenToggle sessionListHidden">
          <input
            type="checkbox"
            role="menuitemcheckbox"
            aria-checked={props.includeHidden === true}
            data-testid="include-hidden"
            checked={props.includeHidden === true}
            onChange={event => props.onIncludeHidden?.(event.target.checked)}
          />
          包含隐藏
        </label>
      ) : null}
      <button
        type="button"
        role="menuitem"
        className="sessionListTool"
        data-testid="session-tool-browse"
        onClick={() => browseSessionTool(toast, props.onOpenSessionTool)}
      >
        {SESSION_TOOL_BROWSE_LABEL}
      </button>
    </div>
  )
}
