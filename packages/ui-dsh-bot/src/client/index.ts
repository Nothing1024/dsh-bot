import { createElement } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import { DshBotIcon } from './DshBotTab.tsx'
import { en, NS, zh } from './locales.ts'
import { bindBotRegion, hasSlots } from './region-registration.ts'
import type { SlotsFace } from './region-registration.ts'
import { createSidebarMode } from './sidebar-mode.ts'
import { createWorkbenchSeat, WorkbenchPanel, WorkbenchRoster } from './WorkbenchPanel.tsx'
import { openOfficialSession, openSessionToolPanel } from './session-tool-jump.ts'

export { DEFAULT_ROSTER_SECTIONS } from 'dsh-bot-shared'
export { DSH_BOT_SESSIONS_TAB_ID } from './tab-id.ts'
export { jumpToSession } from './session-jump.ts'
export type { DshBotTabProps } from './DshBotTab.tsx'
export type { IDshBotClient, DshBotListState, DshBotSessionRow } from './rpc.ts'

export const BOT_PANEL_ID = 'dsh-bot'
export const inject = ['sessions', 'locale', 'slots', 'layout', 'workspaces']

interface WorkbenchClient extends Pick<Context, 'effect'> {
  slots: SlotsFace
  locale: { register(ns: string, dicts: { zh: Record<string, string>; en: Record<string, string> }): () => void }
  layout: { selectPanel(id: string | null): void; beginNavigation(): AbortSignal }
  sessions: { open?(id: string): void; refresh?(): Promise<unknown> | unknown }
  workspaces?: {
    list?: {
      getSnapshot(): { archivedSessionIds?: readonly string[] }
      subscribe?(listener: () => void): () => void
    }
  }
}

export function apply(ctx: Context): void {
  const client = ctx as unknown as WorkbenchClient
  client.effect(() => client.locale.register(NS, { zh, en }), 'ui-dsh-bot: dictionaries')
  if (!hasSlots(client)) return
  const host = { sessions: client.sessions, layout: client.layout, workspaces: client.workspaces }
  const mode = createSidebarMode()
  const restoreBot = mode.getSnapshot() === 'bot'
  mode.set('sessions')
  const seat = createWorkbenchSeat()
  client.effect(() => bindBotRegion({ slots: client.slots }, mode, (props: { wide?: boolean; expandSidebar?: () => void }) =>
    createElement(WorkbenchRoster, { ...props, seat })), 'ui-dsh-bot: roster seat')
  client.effect(() => client.slots.inject('main', () => {
    const dispose = client.slots.register({ name: 'main', key: BOT_PANEL_ID }, () => createElement(WorkbenchPanel, {
      seat,
      mode,
      onOpenOfficialSession: (id: string) => openOfficialSession(host, id),
      onOpenSessionTool: () => {
        try { openSessionToolPanel(host) }
        catch { /* session-tool panel not registered */ }
      },
    }))
    if (restoreBot) client.layout.selectPanel(BOT_PANEL_ID)
    return dispose
  }), 'ui-dsh-bot: main panel')
  client.effect(() => client.slots.inject('sidebar.panellist', () => {
    const conversation = client.slots.register({ name: 'sidebar.panellist', id: 'conversation', label: '会话', order: -20 }, () => createElement('span', { 'aria-hidden': true, 'data-dsh-bot-nav': 'sessions' }, '↩'))
    const bot = client.slots.register({ name: 'sidebar.panellist', id: BOT_PANEL_ID, label: 'Bot', order: -19 }, () => createElement('span', { 'data-dsh-bot-nav': 'bot' }, createElement(DshBotIcon)))
    return () => { bot(); conversation() }
  }), 'ui-dsh-bot: top navigation')
}
