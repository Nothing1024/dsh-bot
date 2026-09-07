/**
 * Polar node layout + group/peer edges (workbench RelationshipGraph).
 */
import type { PeerLogRow, WorkbenchBot, WorkbenchGroup } from 'dsh-bot-shared'

export interface GraphNode {
  readonly id: string
  readonly name: string
  readonly x: number
  readonly y: number
}

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

export function layoutGraphNodes(bots: readonly Pick<WorkbenchBot, 'id' | 'name'>[]): GraphNode[] {
  const n = bots.length
  return bots.map((bot, index) => {
    const angle = n === 0 ? 0 : (index / n) * Math.PI * 2 - Math.PI / 2
    return { id: bot.id, name: bot.name, x: 160 + Math.cos(angle) * 110, y: 140 + Math.sin(angle) * 100 }
  })
}

export function dashedGroupEdges(groups: readonly WorkbenchGroup[]): readonly string[] {
  const set = new Set<string>()
  for (const group of groups) {
    const ids = [...group.memberIds]
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        set.add(pairKey(ids[i]!, ids[j]!))
      }
    }
  }
  return [...set]
}

export function solidPeerEdges(rows: readonly PeerLogRow[]): ReadonlyMap<string, number> {
  const map = new Map<string, number>()
  for (const row of rows) {
    if (row.from === row.to) continue
    const key = pairKey(row.from, row.to)
    map.set(key, (map.get(key) ?? 0) + 1)
  }
  return map
}
