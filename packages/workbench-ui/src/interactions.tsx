import { useEffect, useState } from 'react'
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
  if (!editing) return <button type="button" data-testid={testId} onClick={() => setEditing(true)}>重命名</button>
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

export function useEscapeDismiss(close: () => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !event.defaultPrevented) close() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [close])
}
