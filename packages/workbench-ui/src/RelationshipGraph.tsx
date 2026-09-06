import { useEffect, useMemo, useState } from 'react'
import { listBots, listGroups, peerLog } from './api.ts'
import type { PeerLogRow, WorkbenchBot, WorkbenchGroup } from './api.ts'

export interface RelationshipGraphProps {
  readonly open: boolean
  readonly workingIds?: ReadonlySet<string>
  readonly onClose: () => void
  readonly onSelect: (botId: string) => void
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

export function RelationshipGraph(props: RelationshipGraphProps) {
  const [bots, setBots] = useState<readonly WorkbenchBot[]>([])
  const [groups, setGroups] = useState<readonly WorkbenchGroup[]>([])
  const [rows, setRows] = useState<readonly PeerLogRow[]>([])

  useEffect(() => {
    if (!props.open) return
    let cancelled = false
    void Promise.all([listBots(), listGroups(), peerLog()]).then(([listed, grouped, log]) => {
      if (cancelled) return
      if (listed.ok) setBots(listed.value.bots)
      if (grouped.ok) setGroups(grouped.value.groups)
      if (log.ok) setRows(log.value)
    })
    return () => { cancelled = true }
  }, [props.open])

  const layout = useMemo(() => {
    const n = bots.length
    return bots.map((bot, index) => {
      const angle = n === 0 ? 0 : (index / n) * Math.PI * 2 - Math.PI / 2
      return { id: bot.id, name: bot.name, x: 160 + Math.cos(angle) * 110, y: 140 + Math.sin(angle) * 100 }
    })
  }, [bots])

  const solids = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of rows) {
      if (row.from === row.to) continue
      const key = pairKey(row.from, row.to)
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return map
  }, [rows])

  const dashes = useMemo(() => {
    const set = new Set<string>()
    for (const group of groups) {
      const ids = [...group.memberIds]
      for (let i = 0; i < ids.length; i += 1) {
        for (let j = i + 1; j < ids.length; j += 1) {
          set.add(pairKey(ids[i]!, ids[j]!))
        }
      }
    }
    return set
  }, [groups])

  if (!props.open) return null
  const byId = new Map(layout.map(node => [node.id, node]))
  return (
    <div className="graphOverlay" data-testid="relationship-graph">
      <div className="graphCard">
        <div className="memoryHead">
          <span>关系图</span>
          <button type="button" className="retry" data-testid="graph-close" onClick={props.onClose}>关闭</button>
        </div>
        <svg viewBox="0 0 320 280" width="320" height="280">
          {[...dashes].map(key => {
            const [a, b] = key.split('|')
            const na = byId.get(a!)
            const nb = byId.get(b!)
            if (na === undefined || nb === undefined) return null
            return (
              <line key={`d-${key}`} x1={na.x} y1={na.y} x2={nb.x} y2={nb.y} stroke="#6b8cff66" strokeDasharray="4 3" />
            )
          })}
          {[...solids.entries()].map(([key, n]) => {
            const [a, b] = key.split('|')
            const na = byId.get(a!)
            const nb = byId.get(b!)
            if (na === undefined || nb === undefined) return null
            return (
              <line key={`s-${key}`} x1={na.x} y1={na.y} x2={nb.x} y2={nb.y} stroke="#e8eaed" strokeWidth={Math.min(6, 1 + n)} />
            )
          })}
          {layout.map(node => (
            <g
              key={node.id}
              data-testid={`graph-node-${node.id}`}
              className={props.workingIds?.has(node.id) === true ? 'isWorking' : undefined}
              onClick={() => props.onSelect(node.id)}
              style={{ cursor: 'pointer' }}
            >
              <circle cx={node.x} cy={node.y} r={14} fill="#6b8cff" className={props.workingIds?.has(node.id) === true ? 'graphPulse' : undefined} />
              <text x={node.x} y={node.y + 28} textAnchor="middle" fill="#e8eaed" fontSize="11">{node.name}</text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  )
}
