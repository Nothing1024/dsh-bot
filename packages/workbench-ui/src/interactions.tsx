import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { workbenchCall } from './api.ts'
import type { RosterItem } from './Roster.tsx'
import type { RosterSection } from './roster-sections.ts'

export function CategoryPicker({ item, sections, onMove }: { item: RosterItem; sections: readonly RosterSection[]; onMove: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  return <>
    <button type="button" data-testid={`roster-move-${item.id}`} aria-expanded={open} onClick={() => setOpen(!open)}>移至分类</button>
    {open && <div className="categoryPicker" aria-label="选择分类">
      {sections.filter(section => section.id !== 'pinned').map(section => <button key={section.id} type="button" data-testid={`roster-move-${item.id}-${section.id}`} aria-pressed={item.section === section.id} onClick={() => onMove(section.id)}>{section.name}{item.section === section.id ? ' · 当前' : ''}</button>)}
    </div>}
  </>
}

export function SessionRename({ sessionId, title, testId, onToast, onDone }: { sessionId: string; title?: string; testId: string; onToast: (text: string) => void; onDone: () => void }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(title ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!editing) return <button type="button" role="menuitem" data-testid={testId} onClick={() => setEditing(true)}>重命名</button>
  const save = async () => {
    if (!name.trim() || busy) return
    setBusy(true)
    const result = await workbenchCall('renameSession', { sessionId, title: name.trim() })
    setBusy(false)
    if (!result.ok) { setError(result.error.message); return }
    window.dispatchEvent(new Event('dsh-bot:session-renamed'))
    onToast('名称已更新')
    onDone()
  }
  return <div className="sessionRename" role="group" aria-label="重命名">
    <label>对话 / 房间名称<input autoFocus aria-label="对话或房间名称" value={name} maxLength={60} disabled={busy} onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void save() } }} /></label>
    {error && <p role="alert">{error}</p>}
    <div><button type="button" data-testid="session-rename-save" disabled={busy || !name.trim()} onClick={() => { void save() }}>{busy ? '保存中…' : '保存'}</button><button type="button" disabled={busy} onClick={onDone}>取消</button></div>
  </div>
}

/** Escape precedence when several layers are open at once; ties go to the most recently opened. */
export const ESCAPE_PRIORITY = { menu: 0, panel: 1, graph: 2, dialog: 3, palette: 4 } as const

interface EscapeLayer {
  readonly priority: number
  readonly close: () => void
  readonly restore: Element | null
}

/** Open dismissable layers in open order; one capture listener serves them all. */
const escapeLayers: EscapeLayer[] = []

function onEscapeKey(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || event.isComposing || event.keyCode === 229) return
  // Inputs with their own Escape step (mention popup, pending reply, inline rename) mark themselves.
  if (event.target instanceof Element && event.target.closest('[data-escape-local="true"]') !== null) return
  let top: EscapeLayer | undefined
  for (const layer of escapeLayers) if (top === undefined || layer.priority >= top.priority) top = layer
  if (top === undefined) return
  event.preventDefault()
  event.stopPropagation()
  top.close()
}

export interface EscapeLayerOptions {
  readonly priority: number
  /** Runs after the opener is recorded, so the returned element may take focus. */
  readonly initialFocus?: () => HTMLElement | null | undefined
}

/**
 * Registers a dismissable layer while `active`. Escape closes exactly one
 * layer: the highest priority, then the most recently opened. When the layer
 * goes away, focus returns to the element focused at open time unless the
 * user already moved it somewhere live.
 */
export function useEscapeLayer(active: boolean, close: () => void, options: EscapeLayerOptions): void {
  const closeRef = useRef(close)
  const focusRef = useRef(options.initialFocus)
  closeRef.current = close
  focusRef.current = options.initialFocus
  const priority = options.priority
  useEffect(() => {
    if (!active) return
    const layer: EscapeLayer = { priority, close: () => closeRef.current(), restore: document.activeElement }
    if (escapeLayers.length === 0) document.addEventListener('keydown', onEscapeKey, true)
    escapeLayers.push(layer)
    focusRef.current?.()?.focus()
    return () => {
      escapeLayers.splice(escapeLayers.indexOf(layer), 1)
      if (escapeLayers.length === 0) document.removeEventListener('keydown', onEscapeKey, true)
      const current = document.activeElement
      if ((current === null || current === document.body) && layer.restore instanceof HTMLElement && layer.restore.isConnected) layer.restore.focus()
    }
  }, [active, priority])
}

/** ArrowUp/ArrowDown/Home/End roving focus across a role=menu container's own enabled items (nested menus excluded). */
export function moveMenuFocus(event: ReactKeyboardEvent<HTMLElement>): void {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') return
  const target = event.target
  // Text fields inside the menu (inline rename) keep their caret keys.
  if (target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && target.type !== 'checkbox')) return
  const menu = event.currentTarget
  const items = [...menu.querySelectorAll<HTMLElement>('[role^="menuitem"]:not(:disabled)')]
    .filter(item => item.parentElement?.closest('[role="menu"]') === menu)
  if (items.length === 0) return
  event.preventDefault()
  event.stopPropagation()
  const index = items.indexOf(target as HTMLElement)
  const next = event.key === 'Home' ? 0
    : event.key === 'End' ? items.length - 1
    : event.key === 'ArrowDown' ? (index + 1) % items.length
    : index <= 0 ? items.length - 1 : index - 1
  items[next]?.focus()
}
