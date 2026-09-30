/**
 * One sequential poll loop: the next tick is armed only after the previous one
 * settles, so ticks never overlap. Hidden tabs stop ticking (unless
 * `hiddenIntervalMs` asks for a slow keep-alive) and returning to visible runs
 * one refresh immediately.
 */
import { useEffect, useRef } from 'react'

export interface PollerOptions {
  readonly enabled: boolean
  readonly intervalMs: number
  /** Cadence while `document.hidden`; omitted = no ticks until visible again. */
  readonly hiddenIntervalMs?: number
  /** Tick once on start instead of waiting one interval. */
  readonly immediate?: boolean
  /** Changing this restarts the loop with an immediate tick (when `immediate`). */
  readonly restartKey?: string
  /**
   * One tick. `current()` turns false once the loop was torn down (disabled,
   * cadence/key change, unmount) — check it before applying a response.
   */
  readonly run: (current: () => boolean) => Promise<void>
}

export function usePoller(options: PollerOptions): void {
  const { enabled, intervalMs, hiddenIntervalMs, immediate = false, restartKey } = options
  const runRef = useRef(options.run)
  runRef.current = options.run

  useEffect(() => {
    if (!enabled) return
    let disposed = false
    let inFlight = false
    let again = false
    // Ticks are sequential; the only way a response goes stale is teardown
    // (disable, interval/key change, unmount) while it was in flight.
    let timer: ReturnType<typeof setTimeout> | undefined
    const hidden = (): boolean => typeof document !== 'undefined' && document.hidden

    const schedule = (): void => {
      if (disposed) return
      const isHidden = hidden()
      if (isHidden && hiddenIntervalMs === undefined) return
      timer = setTimeout(() => {
        timer = undefined
        void tick()
      }, isHidden ? hiddenIntervalMs : intervalMs)
    }

    const tick = async (): Promise<void> => {
      if (disposed) return
      if (inFlight) {
        again = true
        return
      }
      if (hidden() && hiddenIntervalMs === undefined) return
      inFlight = true
      try {
        await runRef.current(() => !disposed)
      } finally {
        inFlight = false
      }
      if (again) {
        again = false
        void tick()
        return
      }
      schedule()
    }

    const onVisibility = (): void => {
      if (hidden()) return
      if (timer !== undefined) {
        clearTimeout(timer)
        timer = undefined
      }
      void tick()
    }

    document.addEventListener('visibilitychange', onVisibility)
    if (immediate) void tick()
    else schedule()
    return () => {
      disposed = true
      if (timer !== undefined) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [enabled, intervalMs, hiddenIntervalMs, immediate, restartKey])
}
