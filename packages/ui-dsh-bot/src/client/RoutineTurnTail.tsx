/**
 * conversation.chat.turnTail tag for routine-origin turns (BR-620 / ASM-608).
 */
import { useSyncExternalStore, type ReactElement } from 'react'
import type { WorkbenchHistoryItem } from 'dsh-bot-shared'
import { isBotPreset } from './bot-preset.ts'
import type { SessionListFace } from './BoundRoster.tsx'
import { zh } from './locales.ts'
import type { HistorySlice, RosterRpc } from './roster-rpc.ts'
import css from './RoutineTurnTail.module.css'

const EMPTY_HISTORY: Readonly<Record<string, HistorySlice>> = {}
function emptyHistory(): Readonly<Record<string, HistorySlice>> {
  return EMPTY_HISTORY
}

const EMPTY_LIST: NonNullable<NonNullable<SessionListFace['list']>['getSnapshot']> extends () => infer T ? T : never = { byId: {} }
function emptyList(): typeof EMPTY_LIST {
  return EMPTY_LIST
}

export interface TurnTailOwner {
  readonly turn?: {
    readonly start?: { readonly seq?: number; readonly time?: number }
    readonly end?: { readonly seq?: number; readonly time?: number }
  }
  readonly seq?: number
}

export interface RoutineMatch {
  readonly routineName: string
}

export interface RoutineTurnTailProps {
  matched?: RoutineMatch | null
  turn?: TurnTailOwner['turn']
  seq?: number
  roster?: RosterRpc
  sessions?: SessionListFace
  t?: (key: string, vars?: Record<string, string>) => string
}

function fallbackT(key: string, vars?: Record<string, string>): string {
  const raw = (zh as Record<string, string>)[key] ?? key
  if (vars === undefined) return raw
  return raw.replace(/\{(\w+)\}/g, (_, name: string) => vars[name] ?? '')
}

function asOwner(owner: unknown): TurnTailOwner {
  if (owner === null || typeof owner !== 'object') return {}
  return owner as TurnTailOwner
}

function routineNameOf(item: WorkbenchHistoryItem): string {
  if (item.name !== undefined && item.name !== '') return item.name
  const text = item.text ?? ''
  const labeled = /^\[routine\]\s*(.+)$/m.exec(text)
  const name = labeled?.[1]?.trim()
  if (name !== undefined && name !== '') return name
  return '例程'
}

function inTurnRange(seq: number, start: number | undefined, end: number | undefined): boolean {
  if (start !== undefined && seq < start) return false
  if (end !== undefined && seq > end) return false
  return true
}

function pickRoutineItem(
  owner: TurnTailOwner,
  slice: HistorySlice | undefined,
): WorkbenchHistoryItem | undefined {
  if (slice === undefined) return undefined
  const start = owner.turn?.start?.seq
  const end = owner.turn?.end?.seq ?? owner.seq
  const hits = Object.values(slice.routineBySeq).filter(item => inTurnRange(item.seq, start, end))
  if (hits.length === 0) return undefined
  const named = hits.find(item => item.name !== undefined && item.name !== '')
  if (named !== undefined) return named
  if (owner.seq !== undefined) {
    const direct = hits.find(item => item.seq === owner.seq)
    if (direct !== undefined) return direct
  }
  return hits[0]
}

/**
 * Sync O(1) chain selector: bot sessions only, prebuilt routineBySeq lookup.
 */
export function matchRoutineTurn(
  owner: unknown,
  roster: Pick<RosterRpc, 'historyBySession' | 'sessionsByBot'>,
  sessions: SessionListFace | undefined,
): RoutineMatch | null {
  const list = sessions?.list?.getSnapshot()
  const sessionId = list?.current
  if (sessionId === undefined || sessionId === '') return null
  const owned = Object.values(roster.sessionsByBot.getSnapshot()).some(rows => rows.some(row => row.sessionId === sessionId))
  if (!owned && !isBotPreset(list?.byId?.[sessionId]?.agentPreset)) return null
  const item = pickRoutineItem(asOwner(owner), roster.historyBySession.getSnapshot()[sessionId])
  if (item === undefined) return null
  return { routineName: routineNameOf(item) }
}

/**
 * Small wake tag under a completed official turn.
 */
export function RoutineTurnTail(props: RoutineTurnTailProps): ReactElement | null {
  const t = props.t ?? fallbackT
  useSyncExternalStore(
    props.roster?.historyBySession.subscribe ?? ((fn: () => void) => { void fn; return () => {} }),
    props.roster?.historyBySession.getSnapshot ?? emptyHistory,
    props.roster?.historyBySession.getSnapshot ?? emptyHistory,
  )
  useSyncExternalStore(
    props.sessions?.list?.subscribe ?? ((fn: () => void) => { void fn; return () => {} }),
    props.sessions?.list?.getSnapshot ?? emptyList,
    props.sessions?.list?.getSnapshot ?? emptyList,
  )
  const live = props.roster === undefined
    ? null
    : matchRoutineTurn({ turn: props.turn, seq: props.seq }, props.roster, props.sessions)
  const name = live?.routineName ?? props.matched?.routineName
  if (name === undefined || name === '') return null
  return (
    <span className={css.wakeTag} data-testid="dsh-bot-routine-tail">
      {t('identity.tail', { name })}
    </span>
  )
}
