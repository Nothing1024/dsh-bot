/**
 * Polar relationship graph inside shell.overlay (BR-618).
 */
import { useEffect, useMemo, useState, type ReactElement } from 'react'
import type { PeerLogRow, WorkbenchBot, WorkbenchGroup } from 'dsh-bot-shared'
import { GRAPH_VIEW, dashedGroupEdges, layoutGraphNodes, solidPeerEdges } from './graph-layout.ts'
import { zh } from './locales.ts'
import type { RosterRpc } from './roster-rpc.ts'
import css from './OverlayForms.module.css'

export interface RelationshipGraphOverlayProps {
  bots: readonly WorkbenchBot[]
  groups: readonly WorkbenchGroup[]
  roster?: RosterRpc
  t?: (key: string, vars?: Record<string, string>) => string
  onClose: () => void
  onSelect: (botId: string) => void
  onCreateGroup?: () => void
}

function fallbackT(key: string): string {
  return zh[key as keyof typeof zh] ?? key
}

/**
 * Graph card: dashed = same group, solid = peerLog.
 */
export function RelationshipGraphOverlay(props: RelationshipGraphOverlayProps): ReactElement {
  const t = props.t ?? fallbackT
  const visible = props.bots.filter(bot => bot.hidden !== true)
  const [rows, setRows] = useState<readonly PeerLogRow[]>([])
  useEffect(() => {
    if (props.roster === undefined) return
    let cancelled = false
    void props.roster.peerLog().then(outcome => {
      if (cancelled || !outcome.ok) return
      setRows(outcome.value)
    })
    return () => { cancelled = true }
  }, [props.roster])
  const layout = useMemo(() => layoutGraphNodes(visible), [visible])
  const dashes = useMemo(() => dashedGroupEdges(props.groups), [props.groups])
  const solids = useMemo(() => solidPeerEdges(rows), [rows])
  const byId = new Map(layout.map(node => [node.id, node]))
  const empty = props.groups.length === 0
  return (
    <div className={css.graphCard} data-testid="dsh-bot-graph-overlay">
      <div className={css.head}>
        <h2>{t('roster.graph')}</h2>
        <button type="button" data-testid="dsh-bot-graph-close" onClick={props.onClose}>{t('overlay.cancel')}</button>
      </div>
      {empty
        ? (
            <div data-testid="dsh-bot-graph-empty">
              <p>{t('overlay.graphEmpty')}</p>
              {props.onCreateGroup !== undefined
                ? <button type="button" data-testid="dsh-bot-graph-new-group" onClick={props.onCreateGroup}>{t('roster.newGroup')}</button>
                : null}
            </div>
          )
        : null}
      <svg
        className={css.graphSvg}
        viewBox={`0 0 ${GRAPH_VIEW.width} ${GRAPH_VIEW.height}`}
        width="100%"
        height="320"
        role="img"
        aria-label={t('roster.graph')}
      >
        {dashes.map(key => {
          const [a, b] = key.split('|')
          const na = byId.get(a!)
          const nb = byId.get(b!)
          if (na === undefined || nb === undefined) return null
          return (
            <line
              key={`d-${key}`}
              data-testid={`dsh-bot-graph-dash-${key}`}
              x1={na.x}
              y1={na.y}
              x2={nb.x}
              y2={nb.y}
              stroke="currentColor"
              strokeOpacity="0.4"
              strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
            />
          )
        })}
        {[...solids.entries()].map(([key, n]) => {
          const [a, b] = key.split('|')
          const na = byId.get(a!)
          const nb = byId.get(b!)
          if (na === undefined || nb === undefined) return null
          return (
            <line
              key={`s-${key}`}
              data-testid={`dsh-bot-graph-solid-${key}`}
              x1={na.x}
              y1={na.y}
              x2={nb.x}
              y2={nb.y}
              stroke="currentColor"
              strokeOpacity="0.6"
              strokeWidth={Math.min(3, 1 + n * 0.5)}
              vectorEffect="non-scaling-stroke"
            />
          )
        })}
        {layout.map(node => (
          <g
            key={node.id}
            data-testid={`dsh-bot-graph-node-${node.id}`}
            onClick={() => { props.onSelect(node.id) }}
            style={{ cursor: 'pointer' }}
          >
            <circle cx={node.x} cy={node.y} r={16} fill="currentColor" fillOpacity="0.35" />
            <text x={node.x} y={node.y + 30} textAnchor="middle" fill="currentColor" fontSize="12">{node.name}</text>
          </g>
        ))}
      </svg>
      <div className={css.legend} data-testid="dsh-bot-graph-legend">
        {t('overlay.graphLegend')}
        {props.groups.length > 0
          ? ` ${props.groups.map(group => `${group.name}：${group.memberIds.map(id => visible.find(bot => bot.id === id)?.name ?? id).join(' · ')}`).join('；')}。`
          : ''}
        {t('overlay.graphHint')}
      </div>
    </div>
  )
}
