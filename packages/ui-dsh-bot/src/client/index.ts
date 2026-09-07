/**
 * ui-dsh-bot plugin, browser half. Optionally registers a better-sidebar
 * "DSH Bot" tab. betterSidebar is never a hard inject (BR-008).
 */
import { createElement } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import { DshBotIcon, DshBotTab } from './DshBotTab.tsx'
import type { SessionCwdFace, WorkspaceCwdFace } from './DshBotTab.tsx'
import { inject as requiredInject } from './inject.ts'
import { en, NS, zh } from './locales.ts'
import { bindBotRegion, hasSlots } from './region-registration.ts'
import type { SlotsFace } from './region-registration.ts'
import { createRpcDshBot } from './rpc.ts'
import { createSidebarMode } from './sidebar-mode.ts'
import { DSH_BOT_SESSIONS_TAB_ID } from './tab-id.ts'

interface ClientLocale {
  register(ns: string, dicts: { zh: Record<string, string>; en: Record<string, string> }): () => void
  bind(ns: string): (key: string, vars?: Record<string, string>) => string
}

interface BetterSidebarService {
  registerTab: (descriptor: {
    id: string
    title: string | (() => string)
    icon?: unknown
    order?: number
    single?: boolean
    badge?: (ctx: unknown, scope: unknown, state: { panelOpen?: boolean }) => string | number | null | undefined
    component: (props: { ctx: Context; visible?: boolean }) => unknown
  }) => () => void
  getSnapshot: () => { state?: { panelOpen?: boolean } }
  subscribeState: (listener: () => void) => () => void
}

/** Duck-typed client ctx (locale + sessions + optional slots / betterSidebar). */
type ClientCtx = Context & {
  locale: ClientLocale
  sessions: SessionCwdFace
  workspaces?: WorkspaceCwdFace
  slots?: SlotsFace
  betterSidebar?: BetterSidebarService
}

export type { DshBotTabProps } from './DshBotTab.tsx'
export type { IDshBotClient, DshBotListState, DshBotSessionRow } from './rpc.ts'
export { DSH_BOT_SESSIONS_TAB_ID } from './tab-id.ts'
export { jumpToSession } from './session-jump.ts'

/**
 * Required services: sessions, locale, and slots. betterSidebar is optional
 * via ctx.inject (BR-008) — never a hard inject entry.
 */
export const inject = [...requiredInject]

/**
 * Register dictionaries and, when present, the better-sidebar sessions tab.
 * @param ctx - client root context.
 */
function BotRegionPlaceholder(): null {
  return null
}

export function apply(ctx: Context): void {
  const client = ctx as unknown as ClientCtx
  client.effect(() => client.locale.register(NS, { zh, en }), 'ui-dsh-bot: dictionaries')
  const t = client.locale.bind(NS)
  const mode = createSidebarMode()

  if (!hasSlots(client)) {
    console.info('[ui-dsh-bot] ctx.slots missing; skip sidebar.workspaces / footer.action')
  } else {
    client.effect(
      () => bindBotRegion(client, mode, BotRegionPlaceholder),
      'ui-dsh-bot: bot region',
    )
  }

  ctx.inject(['betterSidebar'], (raw) => {
    const sidebarCtx = raw as unknown as ClientCtx
    if (sidebarCtx.betterSidebar === undefined) return
    const sidebar = sidebarCtx.betterSidebar
    const dshBot = createRpcDshBot()
    sidebarCtx.effect(
      () => {
        const unsub = sidebar.subscribeState(() => {
          dshBot.setPanelOpen(sidebar.getSnapshot().state?.panelOpen === true)
        })
        dshBot.setPanelOpen(sidebar.getSnapshot().state?.panelOpen === true)
        return () => {
          unsub()
          dshBot.dispose()
        }
      },
      'ui-dsh-bot: poll',
    )
    sidebarCtx.effect(
      () => sidebar.registerTab({
        id: DSH_BOT_SESSIONS_TAB_ID,
        title: () => t('tab.title'),
        icon: (size: number) => createElement(DshBotIcon, { size }),
        order: 25,
        single: true,
        badge: () => {
          const n = dshBot.list.getSnapshot().items.length
          return n > 0 ? n : null
        },
        component: () => {
          const workspaces = ctx.get('workspaces') as WorkspaceCwdFace | undefined
          return createElement(DshBotTab, {
            ctx: {
              dshBot,
              locale: client.locale,
              sessions: client.sessions,
              ...workspaces === undefined ? {} : { workspaces },
            },
          })
        },
      }),
      'ui-dsh-bot: registerTab',
    )
  })
}
