/**
 * Module-level workbench iframe window so roster group jumps can postMessage.
 */
import { SELECT_GROUP_MESSAGE_TYPE } from 'dsh-bot-shared'

export interface SelectGroupMessage {
  readonly type: typeof SELECT_GROUP_MESSAGE_TYPE
  readonly groupId: string
  readonly roomId?: string
}

let frame: Window | null = null
let loadWaiters: Array<() => void> = []

/** better-sidebar `openTab` seed (subset of OpenTabSeed). */
export interface SidebarOpenSeed {
  readonly type: string
  readonly url?: string
}

let sidebarOpener: ((seed: SidebarOpenSeed) => void) | null = null

/**
 * Register better-sidebar's `openTab`. A content open (`url` seed) is the only
 * documented way to land a tab "in sight": it re-opens a closed tab and expands
 * a collapsed right panel, while `activateTab` is a strict no-op for unknown ids
 * and never expands (dsh-better-sidebar service.d.ts, `openTab` / `activateTab`).
 */
export function setSidebarOpener(open: ((seed: SidebarOpenSeed) => void) | null): void {
  sidebarOpener = open
}

export function workbenchTabSeed(tabId: string, origin = typeof location === 'undefined' ? '' : location.origin): SidebarOpenSeed {
  return { type: tabId, url: `${origin}/dsh-bot/ui` }
}

export function setWorkbenchFrame(win: Window | null): void {
  frame = win
  if (win !== null) {
    const waiters = loadWaiters
    loadWaiters = []
    for (const wake of waiters) wake()
  }
}

export function getWorkbenchFrame(): Window | null {
  return frame
}

export function waitForWorkbenchFrame(timeoutMs = 8000): Promise<Window | null> {
  if (frame !== null) return Promise.resolve(frame)
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      loadWaiters = loadWaiters.filter(item => item !== wake)
      resolve(null)
    }, timeoutMs)
    const wake = (): void => {
      clearTimeout(timer)
      resolve(frame)
    }
    loadWaiters.push(wake)
  })
}

export function postSelectGroup(groupId: string, roomId?: string, targetOrigin = location.origin): boolean {
  if (frame === null) return false
  const payload: SelectGroupMessage = roomId === undefined
    ? { type: SELECT_GROUP_MESSAGE_TYPE, groupId }
    : { type: SELECT_GROUP_MESSAGE_TYPE, groupId, roomId }
  frame.postMessage(payload, targetOrigin)
  return true
}

export async function openGroup(input: {
  groupId: string
  roomId?: string
  activateTab?: (id: string) => void
  tabId: string
}): Promise<{ ok: boolean; error?: string }> {
  if (input.activateTab === undefined && sidebarOpener === null) {
    return { ok: false, error: '需要右栏 DSH Bot 页签' }
  }
  // Content open first (re-opens a closed tab / expands a collapsed panel), then focus.
  if (sidebarOpener !== null) sidebarOpener(workbenchTabSeed(input.tabId))
  input.activateTab?.(input.tabId)
  if (postSelectGroup(input.groupId, input.roomId)) return { ok: true }
  const ready = await waitForWorkbenchFrame(8000)
  if (ready === null) return { ok: false, error: '工作台未就绪，请再点一次' }
  postSelectGroup(input.groupId, input.roomId)
  return { ok: true }
}
