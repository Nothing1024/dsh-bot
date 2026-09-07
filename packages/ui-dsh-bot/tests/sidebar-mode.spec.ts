/**
 * Sidebar mode store: default sessions, persist, illegal values, storage throw.
 */
import { describe, expect, it } from 'vitest'
import {
  SIDEBAR_MODE_KEY,
  createSidebarMode,
  parseSidebarMode,
} from '../src/client/sidebar-mode.ts'
import type { SidebarStorage } from '../src/client/sidebar-mode.ts'

function memory(initial?: string): SidebarStorage & { bag: Map<string, string> } {
  const bag = new Map<string, string>()
  if (initial !== undefined) bag.set(SIDEBAR_MODE_KEY, initial)
  return {
    bag,
    getItem: (key) => bag.get(key) ?? null,
    setItem: (key, value) => { bag.set(key, value) },
  }
}

describe('parseSidebarMode', () => {
  it('keeps bot and treats everything else as sessions', () => {
    expect(parseSidebarMode('bot')).toBe('bot')
    expect(parseSidebarMode('sessions')).toBe('sessions')
    expect(parseSidebarMode(null)).toBe('sessions')
    expect(parseSidebarMode('')).toBe('sessions')
    expect(parseSidebarMode('BOT')).toBe('sessions')
    expect(parseSidebarMode('other')).toBe('sessions')
  })
})

describe('createSidebarMode', () => {
  it('defaults to sessions when storage is empty', () => {
    const store = createSidebarMode(memory())
    expect(store.getSnapshot()).toBe('sessions')
  })

  it('reads and writes the storage key', () => {
    const backend = memory('bot')
    const store = createSidebarMode(backend)
    expect(store.getSnapshot()).toBe('bot')
    store.set('sessions')
    expect(store.getSnapshot()).toBe('sessions')
    expect(backend.bag.get(SIDEBAR_MODE_KEY)).toBe('sessions')
    store.set('bot')
    expect(store.getSnapshot()).toBe('bot')
    expect(backend.bag.get(SIDEBAR_MODE_KEY)).toBe('bot')
  })

  it('treats an illegal stored value as sessions', () => {
    const store = createSidebarMode(memory('wide'))
    expect(store.getSnapshot()).toBe('sessions')
  })

  it('falls back to memory when storage throws', () => {
    const exploding: SidebarStorage = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    }
    const store = createSidebarMode(exploding)
    expect(store.getSnapshot()).toBe('sessions')
    store.set('bot')
    expect(store.getSnapshot()).toBe('bot')
    store.set('sessions')
    expect(store.getSnapshot()).toBe('sessions')
  })

  it('notifies subscribers on set', () => {
    const store = createSidebarMode(memory())
    const seen: string[] = []
    const unsub = store.subscribe(() => { seen.push(store.getSnapshot()) })
    store.set('bot')
    store.set('sessions')
    unsub()
    store.set('bot')
    expect(seen).toEqual(['bot', 'sessions'])
  })
})
