import { SessionRename, useEscapeDismiss } from './interactions.tsx';
/**
 * Bound-session rows: one bot/group owns many threads. Used in the
 * conversation header switcher. Official / leftover sessions jump via
 * session-tool (`在官方会话打开` / `在会话协作中查看全部`).
 */
import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { relativeTime } from './avatar.ts'
import {
  browseSessionTool,
  performWorkbenchJump,
  SESSION_TOOL_BROWSE_LABEL,
  sessionJumpLabel,
  sessionJumpTitle,
} from './jump.ts'

export interface SessionChoice {
  readonly sessionId: string
  readonly title: string
  readonly updatedAt: number
  readonly working: boolean
  readonly hidden: boolean
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
  readonly onOpenOfficialSession?: (sessionId: string) => Promise<void> | void
  readonly onOpenSessionTool?: () => void
}

export interface SessionJumpMenuItemProps {
  readonly sessionId: string
  readonly testId: string
  readonly onToast: (text: string) => void
  readonly onDone: () => void
  readonly onOpenOfficialSession?: (sessionId: string) => Promise<void> | void
}

/**
 * Jump to the official conversation (session-tool openSession), or copy the id.
 */
export function SessionJumpMenuItem(props: SessionJumpMenuItemProps) {
  const hosted = props.onOpenOfficialSession !== undefined
  return (
    <button
      type="button"
      data-testid={props.testId}
      title={hosted ? sessionJumpTitle(false) : sessionJumpTitle()}
      onClick={() => {
        void performWorkbenchJump(props.sessionId, props.onToast, props.onOpenOfficialSession).then(props.onDone)
      }}
    >
      {hosted ? '在官方会话打开' : sessionJumpLabel()}
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
  useEscapeDismiss(() => setMenuId(null))

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
        <ul className="sessionListItems">
          {props.items.map(item => (
            <li key={item.sessionId} ref={menuId === item.sessionId ? menuRef : undefined}>
              <div className="sessionRow">
                <button
                  type="button"
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
                    className="rowMenuBtn sessionRowMenuBtn"
                    data-testid={`session-menu-${item.sessionId}`}
                    aria-label="会话操作"
                    onClick={(event: MouseEvent) => {
                      event.stopPropagation()
                      setMenuId(current => current === item.sessionId ? null : item.sessionId)
                    }}
                  >
                    ⋯
                  </button>
              </div>
              {menuId === item.sessionId ? (
                <div className="rowMenu sessionRowMenu" data-testid={`session-menu-panel-${item.sessionId}`}>
                  <SessionJumpMenuItem
                    sessionId={item.sessionId}
                    testId={`session-jump-${item.sessionId}`}
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
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {props.onCreate !== undefined ? (
        <button
          type="button"
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
            data-testid="include-hidden"
            checked={props.includeHidden === true}
            onChange={event => props.onIncludeHidden?.(event.target.checked)}
          />
          包含隐藏
        </label>
      ) : null}
      <button
        type="button"
        className="sessionListTool"
        data-testid="session-tool-browse"
        onClick={() => browseSessionTool(toast, props.onOpenSessionTool)}
      >
        {SESSION_TOOL_BROWSE_LABEL}
      </button>
    </div>
  )
}
