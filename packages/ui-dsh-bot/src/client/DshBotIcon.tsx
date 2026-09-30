import type { ReactElement } from 'react'

/** Top-navigation Bot icon (14px grid, currentColor). */
export function DshBotIcon(): ReactElement {
  return (
    <svg width={14} height={14} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="10" height="8" rx="2" />
      <circle cx="6.5" cy="9" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="9.5" cy="9" r="0.8" fill="currentColor" stroke="none" />
      <path d="M6 5V3.5a2 2 0 0 1 4 0V5" />
    </svg>
  )
}
