// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RelationshipGraph } from '../src/RelationshipGraph.tsx'

function jsonOk(value: unknown): { json: () => Promise<unknown> } {
  return { json: async () => ({ ok: true, value }) }
}

describe('RelationshipGraph', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('renders nodes and selects a bot', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const path = String(url)
      if (path.includes('listBots')) {
        return jsonOk({
          bots: [
            { id: 'xiaodui-aning', name: '校对阿宁', avatar: { color: '#5b8def' }, presetId: 'p1', createdAt: 1, persona: '', protected: false },
            { id: 'shiren-xiaobei', name: '诗人小北', avatar: { color: '#c9a227' }, presetId: 'p2', createdAt: 1, persona: '', protected: false },
          ],
        })
      }
      if (path.includes('listGroups')) {
        return jsonOk({ groups: [{ id: 'g1', name: '编辑室', memberIds: ['xiaodui-aning', 'shiren-xiaobei'], createdAt: 1 }] })
      }
      if (path.includes('peerLog')) {
        return jsonOk([{ from: 'xiaodui-aning', to: 'shiren-xiaobei', ts: 1, sessionId: 'p1' }])
      }
      return jsonOk({})
    }))
    const onSelect = vi.fn()
    render(
      <RelationshipGraph
        open
        workingIds={new Set(['shiren-xiaobei'])}
        onClose={vi.fn()}
        onSelect={onSelect}
      />,
    )
    const node = await screen.findByTestId('graph-node-shiren-xiaobei')
    fireEvent.click(node)
    expect(onSelect).toHaveBeenCalledWith('shiren-xiaobei')
  })
})
