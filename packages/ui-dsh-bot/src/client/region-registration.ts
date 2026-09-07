/**
 * Bind Bot-mode occupancy of sidebar.workspaces (BR-601 / BR-602 / BR-611).
 * sessions mode disposes the shadow registration so the official tree returns.
 */
import { NS } from './locales.ts'
import type { SidebarModeStore } from './sidebar-mode.ts'

export interface SlotsFace {
  inject(name: string, factory: () => (() => void) | void): () => void
  register(descriptor: {
    name: string
    priority?: number
    locale?: string
    id?: string
    order?: number
    inject?: () => Record<string, unknown>
  }, component: unknown): () => void
}

export interface RegionHost {
  slots?: SlotsFace
  sessions?: {
    open?: (id: string) => void
  }
}

/**
 * Duck-type the official slots service.
 * @param ctx - client ctx.
 */
export function hasSlots(ctx: { slots?: unknown }): ctx is { slots: SlotsFace } {
  if (ctx.slots === undefined || ctx.slots === null || typeof ctx.slots !== 'object') {
    return false
  }
  const face = ctx.slots as SlotsFace
  return typeof face.inject === 'function' && typeof face.register === 'function'
}

/**
 * Subscribe to mode and occupy sidebar.workspaces only while mode is bot.
 * @param ctx - duck-typed client with slots.
 * @param mode - sidebar mode store.
 * @param Component - region occupant.
 */
export function bindBotRegion(
  ctx: RegionHost,
  mode: SidebarModeStore,
  Component: unknown,
): () => void {
  let live: (() => void) | undefined
  let disposed = false

  const drop = (): void => {
    if (live === undefined) return
    live()
    live = undefined
  }

  const occupy = (): void => {
    if (disposed || live !== undefined) return
    const slots = ctx.slots
    if (slots === undefined) return
    const open = (id: string): void => {
      ctx.sessions?.open?.(id)
    }
    const expandHint = (): void => {
      // owner expandSidebar is the real expander; this is the registrant inject seat
    }
    live = slots.inject('sidebar.workspaces', () => slots.register({
      name: 'sidebar.workspaces',
      priority: -1,
      locale: NS,
      inject: () => ({ open, expandHint }),
    }, Component))
  }

  const sync = (): void => {
    if (disposed) return
    if (mode.getSnapshot() === 'bot') occupy()
    else drop()
  }

  const unsub = mode.subscribe(sync)
  sync()
  return () => {
    disposed = true
    unsub()
    drop()
  }
}
