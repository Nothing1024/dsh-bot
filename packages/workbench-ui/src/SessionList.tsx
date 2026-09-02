/**
 * Bound-session rows: one bot/group owns many threads. Used nested under a
 * roster identity and in the conversation header switcher.
 */
import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { relativeTime } from './avatar.ts'
import {
  isStandaloneWorkbench,
  performWorkbenchJump,
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
  readonly enableJump?: boolean
}

export interface SessionJumpMenuItemProps {
  readonly sessionId: string
  readonly testId: string
  readonly onToast: (text: string) => void
  readonly onDone: () => void
}

/**
 * First row-menu action: jump in-tab, or copy id when standalone.
 */
export function SessionJumpMenuItem(props: SessionJumpMenuItemProps) {
  const [busy, setBusy] = useState(false)
  const standalone = isStandaloneWorkbench()
  return (
    <button
      type="button"
      data-testid={props.testId}
      title={sessionJumpTitle(standalone)}
      disabled={busy}
      onClick={(event: MouseEvent) => {
        event.stopPropagation()
        setBusy(true)
        void performWorkbenchJump(props.sessionId, props.onToast).finally(() => {
          setBusy(false)
          props.onDone()
        })
      }}
    >
      {busy ? '打开中…' : sessionJumpLabel(standalone)}
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
  const jumpOn = props.enableJump !== false

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
                {jumpOn ? (
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
                ) : null}
              </div>
              {jumpOn && menuId === item.sessionId ? (
                <div className="rowMenu sessionRowMenu" data-testid={`session-menu-panel-${item.sessionId}`}>
                  <SessionJumpMenuItem
                    sessionId={item.sessionId}
                    testId={`session-jump-${item.sessionId}`}
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
          + 新开对话
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
    </div>
  )
}
