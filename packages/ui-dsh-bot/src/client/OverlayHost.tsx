/**
 * shell.overlay occupant. kind null → null so the layer stays click-through.
 */
import { useEffect, useSyncExternalStore, type KeyboardEvent, type ReactElement } from 'react'
import type { WorkbenchBot, WorkbenchGroup, WorkbenchSessionRow } from 'dsh-bot-shared'
import { CommandPalette } from './CommandPalette.tsx'
import type { PaletteItem } from './CommandPalette.tsx'
import { OverlayForms } from './OverlayForms.tsx'
import type { OverlayStore } from './overlay-store.ts'
import { RelationshipGraphOverlay } from './RelationshipGraphOverlay.tsx'
import type { RosterRpc } from './roster-rpc.ts'
import css from './OverlayForms.module.css'

export interface OverlayHostProps {
  overlay: OverlayStore
  roster: RosterRpc
  bots?: readonly WorkbenchBot[]
  groups?: readonly WorkbenchGroup[]
  sessions?: readonly WorkbenchSessionRow[]
  selectedBotId?: string | null
  mode?: 'sessions' | 'bot'
  t?: (key: string, vars?: Record<string, string>) => string
  onCreated?: (id: string) => void
  onDeleted?: (id: string) => void
  onSelectBot?: (botId: string) => void
  onSelectGroup?: (groupId: string) => void
  onSelectSession?: (sessionId: string) => void
  onSwitchMode?: (mode: 'sessions' | 'bot') => void
}

/**
 * Render the current overlay kind, or nothing.
 */
export function OverlayHost(props: OverlayHostProps): ReactElement | null {
  const state = useSyncExternalStore(props.overlay.subscribe, props.overlay.getSnapshot, props.overlay.getSnapshot)
  const bots = props.bots ?? props.roster.bots.getSnapshot().items
  const groups = props.groups ?? props.roster.groups.getSnapshot().items
  useEffect(() => {
    if (state.kind === null) return
    const onKey = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') props.overlay.close()
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [state.kind, props.overlay])
  if (state.kind === null) return null
  const stop = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      props.overlay.close()
    }
  }
  const cardClass = state.kind === 'confirm-delete'
    ? `${css.card} ${css.confirm}`
    : state.kind === 'graph'
      ? `${css.card} ${css.graphCard}`
      : state.kind === 'palette'
        ? `${css.card} ${css.palette}`
        : css.card
  return (
    <div
      className={css.mask}
      data-testid="dsh-bot-overlay"
      role="presentation"
      onClick={() => { props.overlay.close() }}
    >
      <div
        className={cardClass}
        role="dialog"
        data-testid="dsh-bot-overlay-dialog"
        onClick={event => { event.stopPropagation() }}
        onKeyDown={stop}
      >
        {state.kind === 'graph'
          ? (
              <RelationshipGraphOverlay
                bots={bots}
                groups={groups}
                roster={props.roster}
                {...props.t !== undefined ? { t: props.t } : {}}
                onClose={() => { props.overlay.close() }}
                onSelect={(botId) => {
                  props.overlay.close()
                  props.onSelectBot?.(botId)
                }}
                {...props.overlay !== undefined
                  ? { onCreateGroup: () => { props.overlay.open({ kind: 'create-group' }) } }
                  : {}}
              />
            )
          : state.kind === 'palette'
            ? (
                <CommandPalette
                  bots={bots}
                  {...props.groups !== undefined || groups.length > 0 ? { groups } : {}}
                  {...props.sessions !== undefined ? { sessions: props.sessions } : {}}
                  {...props.selectedBotId !== undefined ? { selectedBotId: props.selectedBotId } : {}}
                  {...props.mode !== undefined ? { mode: props.mode } : {}}
                  {...props.t !== undefined ? { t: props.t } : {}}
                  onClose={() => { props.overlay.close() }}
                  onPick={(item: PaletteItem) => {
                    props.overlay.close()
                    if (item.kind === 'bot') props.onSelectBot?.(item.targetId)
                    else if (item.kind === 'group') props.onSelectGroup?.(item.targetId)
                    else if (item.kind === 'session') props.onSelectSession?.(item.targetId)
                    else props.onSwitchMode?.(item.targetId as 'sessions' | 'bot')
                  }}
                />
              )
            : (
                <OverlayForms
                  overlay={props.overlay}
                  state={state}
                  roster={props.roster}
                  bots={bots}
                  groups={groups}
                  {...props.t !== undefined ? { t: props.t } : {}}
                  {...props.onCreated !== undefined ? { onCreated: props.onCreated } : {}}
                  {...props.onDeleted !== undefined ? { onDeleted: props.onDeleted } : {}}
                />
              )}
      </div>
    </div>
  )
}
