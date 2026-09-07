/**
 * Tiny subscribe/set store shared by rpc polling and sidebar-mode.
 */

export interface ObservableHandle<T> {
  getSnapshot(): T
  subscribe(fn: () => void): () => void
  set(next: T): void
}

/**
 * Create an in-memory observable snapshot.
 * @param initial - first snapshot.
 */
export function observable<T>(initial: T): ObservableHandle<T> {
  let snap = initial
  const subs = new Set<() => void>()
  return {
    getSnapshot: () => snap,
    subscribe: (fn) => {
      subs.add(fn)
      return () => { subs.delete(fn) }
    },
    set: (next) => {
      snap = next
      for (const sub of subs) sub()
    },
  }
}
