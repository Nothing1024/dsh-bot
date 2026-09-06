// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ROUTINES_EMPTY, RoutinesPanel } from '../src/RoutinesPanel.tsx'

afterEach(() => {
  cleanup()
})

describe('RoutinesPanel', () => {
  it('shows the exact empty copy', () => {
    render(
      <RoutinesPanel
        open
        botId="ops"
        botName="运维夜班"
        rows={[]}
        onClose={() => undefined}
        onCreate={async () => true}
        onToggle={async () => true}
        onDelete={async () => true}
      />,
    )
    expect(screen.getByTestId('routines-empty').textContent).toBe(ROUTINES_EMPTY)
  })

  it('submits the create form', async () => {
    const onCreate = vi.fn(async () => true)
    render(
      <RoutinesPanel
        open
        botId="ops"
        botName="运维夜班"
        rows={[]}
        onClose={() => undefined}
        onCreate={onCreate}
        onToggle={async () => true}
        onDelete={async () => true}
      />,
    )
    fireEvent.submit(screen.getByTestId('routines-form'))
    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith({
        name: '报时',
        schedule: '@every 1m',
        instruction: '报告当前时间，一句话',
        notify: true,
      })
    })
  })
})
