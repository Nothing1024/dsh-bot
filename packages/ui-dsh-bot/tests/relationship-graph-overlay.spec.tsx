// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorkbenchBot, WorkbenchGroup } from 'dsh-bot-shared'
import { GRAPH_VIEW, dashedGroupEdges, layoutGraphNodes } from '../src/client/graph-layout.ts'
import { RelationshipGraphOverlay } from '../src/client/RelationshipGraphOverlay.tsx'

const bots: WorkbenchBot[] = [
  { id: 'poet', name: '诗人小北', avatar: { color: '#d4537e' }, presetId: 'a', createdAt: 1, persona: '诗', protected: false },
  { id: 'reviewer', name: '代码审查官', avatar: { color: '#5b8def' }, presetId: 'b', createdAt: 2, persona: '审', protected: false },
]

const groups: WorkbenchGroup[] = [
  { id: 'editors', name: '编辑室', memberIds: ['poet', 'reviewer'], createdAt: 3 },
]

afterEach(() => {
  cleanup()
})

describe('RelationshipGraphOverlay', () => {
  it('lays out nodes and draws one dashed edge per group pair', () => {
    expect(layoutGraphNodes(bots)).toHaveLength(2)
    expect(dashedGroupEdges(groups)).toHaveLength(1)
    render(
      <RelationshipGraphOverlay
        bots={bots}
        groups={groups}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />,
    )
    expect(screen.getByTestId('dsh-bot-graph-node-poet')).toBeTruthy()
    expect(screen.getByTestId('dsh-bot-graph-dash-poet|reviewer')).toBeTruthy()
  })

  it('invokes onSelect when a node is clicked', () => {
    const onSelect = vi.fn()
    render(<RelationshipGraphOverlay bots={bots} groups={groups} onClose={vi.fn()} onSelect={onSelect} />)
    fireEvent.click(screen.getByTestId('dsh-bot-graph-node-reviewer'))
    expect(onSelect).toHaveBeenCalledWith('reviewer')
  })

  it('keeps every node inside the prototype viewBox and uses non-scaling strokes (BR-617 / UF-609)', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ ...bots[0]!, id: `b${i}`, name: `bot${i}` }))
    for (const node of layoutGraphNodes(many)) {
      expect(node.x).toBeGreaterThanOrEqual(GRAPH_VIEW.rx / 2)
      expect(node.x).toBeLessThanOrEqual(GRAPH_VIEW.width - GRAPH_VIEW.rx / 2)
      expect(node.y).toBeGreaterThanOrEqual(GRAPH_VIEW.cy - GRAPH_VIEW.ry)
      expect(node.y + 30).toBeLessThanOrEqual(GRAPH_VIEW.height)
    }
    const peerLog = vi.fn().mockResolvedValue({ ok: true, value: [
      { from: 'poet', to: 'reviewer', ts: 1, sessionId: 's' },
      { from: 'poet', to: 'reviewer', ts: 2, sessionId: 's' },
      { from: 'reviewer', to: 'poet', ts: 3, sessionId: 's' },
      { from: 'poet', to: 'reviewer', ts: 4, sessionId: 's' },
      { from: 'poet', to: 'reviewer', ts: 5, sessionId: 's' },
      { from: 'poet', to: 'reviewer', ts: 6, sessionId: 's' },
    ] })
    const roster = { peerLog } as unknown as NonNullable<Parameters<typeof RelationshipGraphOverlay>[0]['roster']>
    render(<RelationshipGraphOverlay bots={bots} groups={groups} roster={roster} onClose={vi.fn()} onSelect={vi.fn()} />)
    const svg = screen.getByRole('img', { name: '关系图' })
    expect(svg.getAttribute('viewBox')).toBe(`0 0 ${GRAPH_VIEW.width} ${GRAPH_VIEW.height}`)
    const dash = screen.getByTestId('dsh-bot-graph-dash-poet|reviewer')
    expect(dash.getAttribute('vector-effect')).toBe('non-scaling-stroke')
    return vi.waitFor(() => {
      const solid = screen.getByTestId('dsh-bot-graph-solid-poet|reviewer')
      expect(solid.getAttribute('vector-effect')).toBe('non-scaling-stroke')
      expect(Number(solid.getAttribute('stroke-width'))).toBeLessThanOrEqual(3)
    })
  })

  it('legend explains dashed/solid edges and lists group members', () => {
    render(<RelationshipGraphOverlay bots={bots} groups={groups} onClose={vi.fn()} onSelect={vi.fn()} />)
    const legend = screen.getByTestId('dsh-bot-graph-legend').textContent ?? ''
    expect(legend).toContain('虚线 = 同组')
    expect(legend).toContain('实线 = 有过传话')
    expect(legend).toContain('编辑室：诗人小北 · 代码审查官')
  })

  it('shows the empty state when there are no groups', () => {
    render(<RelationshipGraphOverlay bots={bots} groups={[]} onClose={vi.fn()} onSelect={vi.fn()} onCreateGroup={vi.fn()} />)
    expect(screen.getByTestId('dsh-bot-graph-empty')).toBeTruthy()
    expect(screen.getByTestId('dsh-bot-graph-new-group')).toBeTruthy()
  })
})
