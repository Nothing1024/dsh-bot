/**
 * Document-level shortcuts. Capture phase so Cmd/Ctrl+K wins over textarea.
 */
import { useEffect } from 'react'

export interface GlobalKeyboardOptions {
  readonly enabled?: boolean
  readonly paletteOpen: boolean
  readonly onTogglePalette: () => void
  readonly onClosePalette: () => void
  readonly onRosterIndex?: (index: number) => void
  readonly onRosterMove?: (delta: -1 | 1) => void
  readonly onToggleRoster?: () => void
}

export function isPaletteToggle(event: KeyboardEvent): boolean {
  if (event.altKey || event.shiftKey) return false
  if (!event.metaKey && !event.ctrlKey) return false
  return event.key === 'k' || event.key === 'K'
}

/**
 * Cmd/Ctrl+K toggles the command palette from anywhere, including composer
 * focus. Escape closes the palette when it is open.
 */
export function useGlobalKeyboard(options: GlobalKeyboardOptions): void {
  const enabled = options.enabled !== false
  const { paletteOpen, onTogglePalette, onClosePalette, onRosterIndex, onRosterMove, onToggleRoster } = options

  useEffect(() => {
    if (!enabled) return
    const onKey = (event: KeyboardEvent): void => {
      if (isPaletteToggle(event)) {
        event.preventDefault()
        event.stopPropagation()
        onTogglePalette()
        return
      }
      if (event.key === 'Escape' && paletteOpen) {
        event.preventDefault()
        onClosePalette()
        return
      }
      const meta = event.metaKey || event.ctrlKey
      if (meta && !event.altKey && !event.shiftKey && (event.key === 'b' || event.key === 'B')) {
        event.preventDefault()
        event.stopPropagation()
        onToggleRoster?.()
        return
      }
      if (meta && !event.altKey && !event.shiftKey && event.key >= '1' && event.key <= '9') {
        event.preventDefault()
        event.stopPropagation()
        onRosterIndex?.(Number(event.key) - 1)
        return
      }
      if (event.altKey && !event.metaKey && !event.ctrlKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        event.preventDefault()
        event.stopPropagation()
        onRosterMove?.(event.key === 'ArrowUp' ? -1 : 1)
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [enabled, onClosePalette, onRosterIndex, onRosterMove, onTogglePalette, onToggleRoster, paletteOpen])
}
