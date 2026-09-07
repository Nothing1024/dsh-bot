/**
 * Observable overlay kind for shell.overlay (BR-613 / BR-621).
 */
import { observable } from './observable.ts'
import type { ObservableHandle } from './observable.ts'

export type OverlayKind =
  | 'create-bot'
  | 'edit-bot'
  | 'create-group'
  | 'edit-group'
  | 'confirm-delete'
  | 'graph'
  | 'palette'

export interface OverlayState {
  readonly kind: OverlayKind | null
  readonly id?: string
  readonly target?: 'bot' | 'group'
  readonly busy: boolean
  readonly error: string | null
}

export interface OverlayStore {
  getSnapshot(): OverlayState
  subscribe(fn: () => void): () => void
  open(next: Pick<OverlayState, 'kind'> & Partial<Omit<OverlayState, 'kind' | 'busy' | 'error'>>): void
  close(): void
  setBusy(busy: boolean, error?: string | null): void
}

const EMPTY: OverlayState = { kind: null, busy: false, error: null }

export function createOverlayStore(handle: ObservableHandle<OverlayState> = observable(EMPTY)): OverlayStore {
  return {
    getSnapshot: handle.getSnapshot,
    subscribe: handle.subscribe,
    open: (next) => {
      handle.set({
        kind: next.kind,
        busy: false,
        error: null,
        ...next.id !== undefined ? { id: next.id } : {},
        ...next.target !== undefined ? { target: next.target } : {},
      })
    },
    close: () => { handle.set({ ...EMPTY }) },
    setBusy: (busy, error = null) => {
      const current = handle.getSnapshot()
      handle.set({ ...current, busy, error })
    },
  }
}
