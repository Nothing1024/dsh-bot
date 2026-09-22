// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ROUTINES_EMPTY, RoutinesPanel } from '../src/RoutinesPanel.tsx'
import { previewSchedule } from '../../dsh-bot-host/src/routines.ts'

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
    fireEvent.change(screen.getByTestId('routine-name'), { target: { value: '进度检查' } })
    fireEvent.change(screen.getByTestId('routine-instruction'), { target: { value: '检查进度' } })
    fireEvent.change(screen.getByTestId('routine-timezone'), { target: { value: 'Asia/Shanghai' } })
    fireEvent.submit(screen.getByTestId('routines-form'))
    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith({
        name: '进度检查',
        schedule: 'CRON_TZ=Asia/Shanghai 0 9 * * *',
        instruction: '检查进度',
        notify: true,
      })
    })
  })

  it('previews the actual schedule and exposes action failures', async () => {
    render(<RoutinesPanel open botId="ops" botName="运维" rows={[{
      id: 'r1', botId: 'ops', name: '检查', schedule: '@daily', instruction: '检查', enabled: true, notify: true,
      nextRunAt: Date.parse('2026-09-20T00:00:00Z'),
    }]} onClose={() => undefined}
      onPreview={async schedule => ({ ok: true, value: previewSchedule(schedule, Date.parse('2026-09-19T10:00:00+08:00')) })}
      onCreate={async () => true} onToggle={async () => false} onDelete={async () => true} />)
    fireEvent.change(screen.getByTestId('routine-timezone'), { target: { value: 'Asia/Shanghai' } })
    await waitFor(() => expect(screen.getByTestId('routine-preview').textContent).toContain('2026/9/20 09:00:00'))
    expect(screen.getByTestId('routine-preview').textContent).toContain('Asia/Shanghai')
    expect(screen.getByTestId('routine-row-r1').textContent).toContain('时区：UTC')
    fireEvent.click(screen.getByTestId('routine-toggle-r1'))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('切换失败'))
  })
})
