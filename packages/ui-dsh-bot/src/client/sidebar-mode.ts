/**
 * Persist left-rail mode in localStorage (BR-603). Illegal values and
 * storage throws fall back to sessions / in-memory.
 */
import { observable } from './observable.ts'

export type SidebarMode = 'sessions' | 'bot'

export const SIDEBAR_MODE_KEY = 'dsh-bot:sidebar-mode'

export interface SidebarStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface SidebarModeStore {
  getSnapshot(): SidebarMode
  subscribe(fn: () => void): () => void
  set(next: SidebarMode): void
}

/**
 * Coerce a stored string to a legal mode.
 * @param raw - localStorage value or null.
 */
export function parseSidebarMode(raw: string | null): SidebarMode {
  return raw === 'bot' ? 'bot' : 'sessions'
}

function memoryStorage(seed: SidebarMode = 'sessions'): SidebarStorage {
  const bag = new Map<string, string>()
  if (seed === 'bot') bag.set(SIDEBAR_MODE_KEY, seed)
  return {
    getItem: (key) => bag.get(key) ?? null,
    setItem: (key, value) => { bag.set(key, value) },
  }
}

function resolveStorage(storage?: SidebarStorage): SidebarStorage {
  if (storage !== undefined) return storage
  try {
    const ls = globalThis.localStorage
    if (ls !== undefined) return ls
  } catch {
    // privacy / unavailable
  }
  return memoryStorage()
}

/**
 * Create the sidebar mode store.
 * @param storage - injectable Storage; defaults to localStorage, then memory.
 */
export function createSidebarMode(storage?: SidebarStorage): SidebarModeStore {
  const backend = resolveStorage(storage)
  let memory: SidebarMode = 'sessions'
  const read = (): SidebarMode => {
    try {
      return parseSidebarMode(backend.getItem(SIDEBAR_MODE_KEY))
    } catch {
      return memory
    }
  }
  memory = read()
  const inner = observable<SidebarMode>(memory)
  return {
    getSnapshot: () => inner.getSnapshot(),
    subscribe: inner.subscribe,
    set: (next) => {
      memory = next
      try {
        backend.setItem(SIDEBAR_MODE_KEY, next)
      } catch {
        // keep the in-memory snapshot (privacy mode)
      }
      inner.set(next)
    },
  }
}
