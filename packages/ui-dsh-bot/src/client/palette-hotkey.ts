/**
 * ⌘K / Ctrl+K opens the shell.overlay command palette (BR-621).
 */
import type { OverlayStore } from './overlay-store.ts'

export function shouldIgnorePaletteTarget(el: Element | null): boolean {
  if (el === null) return false
  const tag = el.tagName
  if (tag === 'IFRAME' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (el.closest('iframe') !== null) return true
  if (el.getAttribute('contenteditable') === 'true') return true
  if (el.closest('[contenteditable="true"]') !== null) return true
  return false
}

export function isPaletteHotkey(event: KeyboardEvent): boolean {
  if (!(event.metaKey || event.ctrlKey)) return false
  if (event.key.toLowerCase() !== 'k') return false
  if (event.altKey) return false
  return !shouldIgnorePaletteTarget(document.activeElement)
}

export function bindPaletteHotkey(target: Window, overlay: OverlayStore): () => void {
  const onKey = (event: KeyboardEvent): void => {
    if (!isPaletteHotkey(event)) return
    event.preventDefault()
    if (overlay.getSnapshot().kind === 'palette') overlay.close()
    else overlay.open({ kind: 'palette' })
  }
  target.addEventListener('keydown', onKey)
  return () => { target.removeEventListener('keydown', onKey) }
}
