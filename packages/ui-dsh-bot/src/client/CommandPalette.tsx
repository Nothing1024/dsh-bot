/**
 * Overlay command palette: bots, groups, nested sessions, mode switch.
 */
import { useEffect, useMemo, useState, type KeyboardEvent, type ReactElement } from 'react'
import type { WorkbenchBot, WorkbenchGroup, WorkbenchSessionRow } from 'dsh-bot-shared'
import { sessionDisplayTitle } from 'dsh-bot-shared'
import { zh } from './locales.ts'
import css from './OverlayForms.module.css'

export type PaletteKind = 'bot' | 'group' | 'session' | 'mode'

export interface PaletteItem {
  readonly id: string
  readonly kind: PaletteKind
  readonly label: string
  readonly preview?: string
  readonly targetId: string
}

export interface CommandPaletteProps {
  bots: readonly WorkbenchBot[]
  groups?: readonly WorkbenchGroup[]
  sessions?: readonly WorkbenchSessionRow[]
  selectedBotId?: string | null
  query?: string
  t?: (key: string, vars?: Record<string, string>) => string
  mode?: 'sessions' | 'bot'
  onPick: (item: PaletteItem) => void
  onClose: () => void
}

function fallbackT(key: string): string {
  return zh[key as keyof typeof zh] ?? key
}

export function buildPaletteItems(input: {
  bots: readonly WorkbenchBot[]
  groups?: readonly WorkbenchGroup[]
  sessions?: readonly WorkbenchSessionRow[]
  selectedBotId?: string | null
  mode?: 'sessions' | 'bot'
  t: (key: string) => string
}): PaletteItem[] {
  const items: PaletteItem[] = []
  for (const bot of input.bots.filter(row => row.hidden !== true)) {
    items.push({ id: `bot:${bot.id}`, kind: 'bot', label: bot.name, preview: bot.persona, targetId: bot.id })
  }
  for (const group of input.groups ?? []) {
    items.push({ id: `group:${group.id}`, kind: 'group', label: group.name, targetId: group.id })
  }
  const bot = input.bots.find(row => row.id === input.selectedBotId)
  if (bot !== undefined) {
    for (const session of input.sessions ?? []) {
      items.push({
        id: `session:${session.sessionId}`,
        kind: 'session',
        label: sessionDisplayTitle(session.title, bot.name, { hidden: session.hidden }),
        targetId: session.sessionId,
      })
    }
  }
  items.push({
    id: 'mode',
    kind: 'mode',
    label: input.mode === 'bot' ? input.t('palette.toSessions') : input.t('palette.toBot'),
    targetId: input.mode === 'bot' ? 'sessions' : 'bot',
  })
  return items
}

export function filterPaletteItems(items: readonly PaletteItem[], query: string): PaletteItem[] {
  const q = query.trim().toLowerCase()
  if (q === '') return [...items]
  return items.filter(item => item.label.toLowerCase().includes(q) || (item.preview ?? '').toLowerCase().includes(q))
}

/**
 * Filterable jump list for the overlay palette.
 */
export function CommandPalette(props: CommandPaletteProps): ReactElement {
  const t = props.t ?? fallbackT
  const [query, setQuery] = useState(props.query ?? '')
  const [active, setActive] = useState(0)
  const items = useMemo(
    () => filterPaletteItems(buildPaletteItems({
      bots: props.bots,
      ...props.groups !== undefined ? { groups: props.groups } : {},
      ...props.sessions !== undefined ? { sessions: props.sessions } : {},
      ...props.selectedBotId !== undefined ? { selectedBotId: props.selectedBotId } : {},
      ...props.mode !== undefined ? { mode: props.mode } : {},
      t,
    }), query),
    [props.bots, props.groups, props.sessions, props.selectedBotId, props.mode, query, t],
  )
  useEffect(() => { setActive(0) }, [query])
  const onKey = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive(current => Math.min(items.length - 1, current + 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive(current => Math.max(0, current - 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const item = items[active]
      if (item !== undefined) props.onPick(item)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      props.onClose()
    }
  }
  return (
    <div className={css.palette} data-testid="dsh-bot-palette">
      <input
        className={css.palInput}
        data-testid="dsh-bot-palette-input"
        autoFocus
        value={query}
        placeholder={t('palette.placeholder')}
        onChange={event => { setQuery(event.target.value) }}
        onKeyDown={onKey}
      />
      {items.length === 0
        ? <div data-testid="dsh-bot-palette-empty">{t('palette.empty')}</div>
        : items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={css.palItem}
              data-testid={`dsh-bot-palette-${item.id}`}
              data-active={index === active ? '1' : '0'}
              onClick={() => { props.onPick(item) }}
            >
              {item.label}
              <span className={css.palKind}>{item.kind}</span>
            </button>
          ))}
    </div>
  )
}
