// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MEMORY_EMPTY, MemoryPanel } from '../src/MemoryPanel.tsx'
import type { MemoryListValue } from '../src/api.ts'

const DATA: MemoryListValue = {
  profile: [{ id: 'p1', text: '用户叫 Nothing', ts: 1 }],
  log: [
    { id: 'l1', kind: 'log', text: '约了下午校对', ts: 2, source: 'auto' },
    { id: 'n1', kind: 'note', text: '术语保留英文', ts: 3, source: 'explicit' },
  ],
}

describe('MemoryPanel', () => {
  afterEach(() => {
    cleanup()
  })

  it('shows the empty copy when there are no rows', () => {
    render(
      <MemoryPanel
        open
        botName="校对阿宁"
        data={{ profile: [], log: [] }}
        onClose={vi.fn()}
        onForget={vi.fn(async () => true)}
        onClear={vi.fn(async () => true)}
      />,
    )
    expect(screen.getByTestId('memory-empty').textContent).toBe(MEMORY_EMPTY)
    expect(screen.getByTestId('memory-empty').textContent).toBe('还没记住什么。每轮后自动抽取，寒暄不记。')
  })

  it('renders three sections and forgets a row immediately', async () => {
    const onForget = vi.fn(async () => true)
    render(
      <MemoryPanel
        open
        botName="校对阿宁"
        data={DATA}
        onClose={vi.fn()}
        onForget={onForget}
        onClear={vi.fn(async () => true)}
      />,
    )
    expect(screen.getByTestId('memory-profile').textContent).toMatch(/用户叫 Nothing/)
    expect(screen.getByTestId('memory-log').textContent).toMatch(/约了下午校对/)
    expect(screen.getByTestId('memory-note').textContent).toMatch(/术语保留英文/)
    expect(screen.getByTestId('memory-note').textContent).toMatch(/你标记的/)
    fireEvent.click(screen.getByTestId('memory-forget-p1'))
    expect(screen.queryByTestId('memory-row-p1')).toBeNull()
    await vi.waitFor(() => {
      expect(onForget).toHaveBeenCalledWith('p1')
    })
  })

  it('rolls a forgotten row back and toasts when forget fails', async () => {
    const onForget = vi.fn(async () => false)
    render(
      <MemoryPanel
        open
        botName="校对阿宁"
        data={DATA}
        onClose={vi.fn()}
        onForget={onForget}
        onClear={vi.fn(async () => true)}
      />,
    )
    fireEvent.click(screen.getByTestId('memory-forget-p1'))
    expect(screen.queryByTestId('memory-row-p1')).toBeNull()
    expect(await screen.findByTestId('memory-toast')).toHaveProperty('textContent', '忘记失败')
    expect(screen.getByTestId('memory-row-p1')).toBeTruthy()
  })

  it('shows unavailable copy and hides lists', () => {
    render(
      <MemoryPanel
        open
        botName="校对阿宁"
        data={null}
        unavailable
        onClose={vi.fn()}
        onForget={vi.fn(async () => true)}
        onClear={vi.fn(async () => true)}
      />,
    )
    expect(screen.getByTestId('memory-unavailable').textContent).toBe('记忆暂不可用')
    expect(screen.queryByTestId('memory-profile')).toBeNull()
    expect((screen.getByTestId('memory-clear') as HTMLButtonElement).disabled).toBe(true)
  })
})
