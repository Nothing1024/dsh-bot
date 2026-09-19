import { useEffect, useState } from 'react'
import { renamePrototypeSession, prototypeSessionTitle } from './transport.ts'

export function CategoryPicker({ item, sections, onMove }: any) {
  const [open, setOpen] = useState(false)
  return <>
    <button type="button" data-testid={`roster-move-${item.id}`} aria-expanded={open} onClick={() => setOpen(!open)}>移至分类</button>
    {open && <div className="prototype-category-picker" aria-label="选择分类">
      {sections.filter((section: any) => section.id !== 'pinned').map((section: any) => <button key={section.id} type="button" data-testid={`roster-move-${item.id}-${section.id}`} aria-pressed={item.section === section.id} onClick={() => onMove(section.id)}>{section.name}{item.section === section.id ? ' · 当前' : ''}</button>)}
    </div>}
  </>
}

export function SessionRename({ sessionId, testId, onToast, onDone }: any) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(() => prototypeSessionTitle(sessionId))
  if (!editing) return <button type="button" data-testid={testId} onClick={() => setEditing(true)}>重命名</button>
  const save = () => {
    if (!name.trim()) return
    renamePrototypeSession(sessionId, name.trim())
    onToast('名称已更新')
    onDone()
  }
  return <div className="prototype-session-rename" role="group" aria-label="重命名">
    <label>对话 / 房间名称<input autoFocus aria-label="对话或房间名称" value={name} maxLength={60} onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); save() } }} /></label>
    <div><button type="button" data-testid="session-rename-save" disabled={!name.trim()} onClick={save}>保存</button><button type="button" onClick={onDone}>取消</button></div>
  </div>
}

export function usePrototypeEscape(close: () => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [close])
}
