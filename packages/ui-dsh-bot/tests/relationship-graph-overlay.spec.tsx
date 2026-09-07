// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorkbenchBot, WorkbenchGroup } from 'dsh-bot-shared'
import { dashedGroupEdges, layoutGraphNodes } from '../src/client/graph-layout.ts'
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

  it('shows the empty state when there are no groups', () => {
    render(<RelationshipGraphOverlay bots={bots} groups={[]} onClose={vi.fn()} onSelect={vi.fn()} onCreateGroup={vi.fn()} />)
    expect(screen.getByTestId('dsh-bot-graph-empty')).toBeTruthy()
    expect(screen.getByTestId('dsh-bot-graph-new-group')).toBeTruthy()
  })
})
