/**
 * Document-level shortcuts. Capture phase so Cmd/Ctrl+K wins over textarea.
 */
import { useEffect } from 'react'

export interface GlobalKeyboardOptions {
  readonly enabled?: boolean
  readonly paletteOpen: boolean
  readonly onTogglePalette: () => void
  readonly onClosePalette: () => void
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
  const { paletteOpen, onTogglePalette, onClosePalette } = options

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
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [enabled, onClosePalette, onTogglePalette, paletteOpen])
}
