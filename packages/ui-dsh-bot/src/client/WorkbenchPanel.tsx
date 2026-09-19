import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { App } from 'workbench-ui/embedded'
import { observable } from './observable.ts'
import type { SidebarModeStore } from './sidebar-mode.ts'
import './workbench-styles.ts'

export function createWorkbenchSeat() {
  return observable<HTMLElement | null>(null)
}
export type WorkbenchSeat = ReturnType<typeof createWorkbenchSeat>

export function WorkbenchRoster({ seat, wide, expandSidebar }: { seat: WorkbenchSeat; wide?: boolean; expandSidebar?: () => void }) {
  const ref = useCallback((node: HTMLDivElement | null) => seat.set(node), [seat])
  return <div className="dsh-bot-workbench dsh-bot-roster-seat" data-wide={wide !== false}>
    {wide === false && <button className="retry" type="button" aria-label="展开 Bot 名册" onClick={expandSidebar}>Bot</button>}
    <div ref={ref} className="dsh-bot-roster-target" hidden={wide === false} />
  </div>
}

export function WorkbenchPanel({ seat, mode, onOpenOfficialSession, onOpenSessionTool }: {
  seat: WorkbenchSeat
  mode: SidebarModeStore
  onOpenOfficialSession?: (sessionId: string) => Promise<void> | void
  onOpenSessionTool?: () => void
}) {
  const target = useSyncExternalStore(seat.subscribe, seat.getSnapshot, seat.getSnapshot)
  useEffect(() => {
    mode.set('bot')
    return () => mode.set('sessions')
  }, [mode])
  return <div className="dsh-bot-workbench dsh-bot-main-panel" data-testid="dsh-bot-main-panel">
    {target ? <App
      rosterTarget={target}
      {...onOpenOfficialSession === undefined ? {} : { onOpenOfficialSession }}
      {...onOpenSessionTool === undefined ? {} : { onOpenSessionTool }}
    /> : <p role="status">加载 Bot 工作台…</p>}
  </div>
}
