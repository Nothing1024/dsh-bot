/**
 * Lightweight local command palette: actions + current bots/groups. No search.
 */
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { ESCAPE_PRIORITY, useEscapeLayer } from './interactions.tsx'

export const NEW_BOT_COMMAND = 'action:new-bot'
export const NEW_GROUP_COMMAND = 'action:new-group'
export const CLEAR_COMMAND = 'action:clear'

export interface CommandItem {
  readonly id: string
  readonly label: string
  readonly hint?: string
}

export interface CommandIdentity {
  readonly id: string
  readonly name: string
  readonly updatedAt: number
  readonly kind: 'bot' | 'group'
}

export interface CommandPaletteProps {
  readonly open: boolean
  readonly items: readonly CommandItem[]
  readonly onSelect: (id: string) => void
  readonly onClose: () => void
}

export function identityCommandId(kind: 'bot' | 'group', id: string): string {
  return `${kind}:${id}`
}

export function parseIdentityCommand(id: string): { kind: 'bot' | 'group'; id: string } | null {
  if (id.startsWith('bot:')) return { kind: 'bot', id: id.slice(4) }
  if (id.startsWith('group:')) return { kind: 'group', id: id.slice(6) }
  return null
}

/**
 * Actions first, then bots/groups by updatedAt descending (UF-001).
 */
export function buildCommandItems(
  bots: readonly CommandIdentity[],
  groups: readonly CommandIdentity[],
): CommandItem[] {
  const identities = [...bots, ...groups]
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(row => ({
      id: identityCommandId(row.kind, row.id),
      label: row.name,
      hint: row.kind === 'group' ? '小组' : '人设',
    }))
  return [
    { id: NEW_BOT_COMMAND, label: '+ 新建人设', hint: '动作' },
    { id: NEW_GROUP_COMMAND, label: '+ 新建小组', hint: '动作' },
    { id: CLEAR_COMMAND, label: '清空当前对话', hint: '动作' },
    ...identities,
  ]
}

/**
 * Overlay + list. Arrows / Enter / 1-9 select; Escape closes.
 */
export function CommandPalette(props: CommandPaletteProps) {
  const [active, setActive] = useState(0)
  const panelRef = useRef<HTMLDivElement>(null)
  const items = props.items
  const count = items.length
  const onSelect = props.onSelect
  const onClose = props.onClose

  // Before the focus effect below, so the layer records the opener, not the panel.
  useEscapeLayer(props.open, onClose, { priority: ESCAPE_PRIORITY.palette })

  useEffect(() => {
    if (!props.open) return
    setActive(0)
    panelRef.current?.focus()
  }, [props.open, items])

  useEffect(() => {
    if (!props.open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActive(current => (count === 0 ? 0 : (current + 1) % count))
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActive(current => (count === 0 ? 0 : (current - 1 + count) % count))
        return
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        const item = items[active]
        if (item === undefined) return
        event.preventDefault()
        onSelect(item.id)
        return
      }
      if (event.key >= '1' && event.key <= '9' && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
        const index = Number(event.key) - 1
        const item = items[index]
        if (item === undefined) return
        event.preventDefault()
        onSelect(item.id)
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [active, count, items, onClose, onSelect, props.open])

  if (!props.open) return null

  const hasIdentities = items.some(row => row.id.startsWith('bot:') || row.id.startsWith('group:'))

  const onPanelKey = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Tab') event.preventDefault()
  }

  return (
    <div
      className="paletteOverlay"
      data-testid="command-palette-overlay"
      onMouseDown={() => props.onClose()}
    >
      <div
        ref={panelRef}
        className="palette"
        data-testid="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="命令面板"
        tabIndex={-1}
        onMouseDown={event => event.stopPropagation()}
        onKeyDown={onPanelKey}
      >
        <p className="paletteKicker">命令</p>
        {!hasIdentities ? (
          <p className="hint" data-testid="command-palette-empty">还没有人设</p>
        ) : null}
        <ul className="paletteList">
          {items.map((item, index) => (
            <li key={item.id}>
              <button
                type="button"
                className={`paletteItem${index === active ? ' isActive' : ''}`}
                data-testid={`command-item-${item.id}`}
                data-active={index === active ? 'true' : undefined}
                onMouseEnter={() => setActive(index)}
                onClick={() => props.onSelect(item.id)}
              >
                <span className="paletteLabel">{item.label}</span>
                {item.hint !== undefined ? <span className="paletteHint">{item.hint}</span> : null}
                {index < 9 ? <span className="paletteIndex">{index + 1}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
