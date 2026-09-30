import { useEffect, useState } from 'react'
import { listBots, listGroups, peerLog } from './api.ts'
import type { PeerLogRow, WorkbenchBot, WorkbenchGroup } from './api.ts'

export interface PeersPanelProps {
  readonly open: boolean
  readonly botId: string
  readonly botName: string
  readonly onClose: () => void
}

function countsFor(botId: string, rows: readonly PeerLogRow[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const row of rows) {
    const other = row.from === botId ? row.to : row.to === botId ? row.from : ''
    if (other === '' || other === botId) continue
    map.set(other, (map.get(other) ?? 0) + 1)
  }
  return map
}

export function PeersPanel(props: PeersPanelProps) {
  const [rows, setRows] = useState<readonly PeerLogRow[]>([])
  const [bots, setBots] = useState<readonly WorkbenchBot[]>([])
  const [groups, setGroups] = useState<readonly WorkbenchGroup[]>([])

  useEffect(() => {
    if (!props.open) return
    let cancelled = false
    void Promise.all([peerLog(props.botId), listBots(), listGroups()]).then(([log, listed, grouped]) => {
      if (cancelled) return
      if (log.ok) setRows(log.value)
      if (listed.ok) setBots(listed.value.bots)
      if (grouped.ok) setGroups(grouped.value.groups)
    })
    return () => { cancelled = true }
  }, [props.open, props.botId])

  if (!props.open) return null
  const counts = countsFor(props.botId, rows)
  const mine = groups.filter(group => group.memberIds.includes(props.botId))
  return (
    <div className="memoryPanel" data-testid="peers-panel">
      <header className="memoryPanelHead">
        <span>同事 · {props.botName}</span>
        <button type="button" className="ghostBtn isTiny" data-testid="peers-close" aria-label="关闭同事" onClick={props.onClose}>关闭</button>
      </header>
      <div className="memoryPanelBody">
        {counts.size === 0 ? (
          <p className="hint" data-testid="peers-empty">还没有往来</p>
        ) : (
          <ul className="peersList" data-testid="peers-list">
            {[...counts.entries()].map(([id, n]) => {
              const name = bots.find(bot => bot.id === id)?.name ?? id
              return (
                <li key={id} data-testid={`peers-row-${id}`}>
                  {name} · {n} 条
                </li>
              )
            })}
          </ul>
        )}
        <p className="hint" data-testid="peers-groups">
          所在小组：{mine.length === 0 ? '无' : mine.map(group => group.name).join('、')}
        </p>
      </div>
    </div>
  )
}
