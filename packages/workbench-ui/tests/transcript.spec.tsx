// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { WorkbenchHistoryItem } from '../src/api.ts'
import { Transcript } from '../src/Transcript.tsx'

const items: readonly WorkbenchHistoryItem[] = [
  { id: 'm-1', kind: 'message', seq: 1, role: 'user', text: '你是谁?' },
  { id: 't-2', kind: 'thinking', seq: 2, text: 'remember I am a poet' },
  { id: 'tool-2', kind: 'tool', seq: 2, name: 'bash', summary: 'bash' },
  { id: 'm-2', kind: 'message', seq: 2, role: 'assistant', text: '我是诗人小北' },
]

describe('Transcript', () => {
  afterEach(() => {
    cleanup()
  })

  it('places user on the right and assistant on the left without a large avatar', () => {
    const { container } = render(<Transcript items={items} working={false} />)
    expect(screen.getByTestId('transcript-msg-1').getAttribute('data-role')).toBe('user')
    expect(screen.getByTestId('transcript-msg-2').getAttribute('data-role')).toBe('assistant')
    expect(container.querySelectorAll('.avatar').length).toBe(0)
    expect(screen.getByTestId('transcript-msg-1').className).toMatch(/user/)
    expect(screen.getByTestId('transcript-msg-2').className).toMatch(/assistant/)
  })

  it('folds thinking by default and shows a one-line tool summary', () => {
    render(<Transcript items={items} working={false} />)
    const thinking = screen.getByTestId('transcript-thinking-2') as HTMLDetailsElement
    expect(thinking.open).toBe(false)
    expect(thinking.textContent).toMatch(/思考/)
    expect(screen.getByTestId('transcript-tool-2').textContent).toBe('工具 · bash')
    fireEvent.click(thinking.querySelector('summary')!)
    expect(thinking.open).toBe(true)
    expect(thinking.textContent).toMatch(/remember I am a poet/)
  })

  it('shows a working indicator and pending user bubble', () => {
    render(
      <Transcript
        items={items}
        working
        pending={{ text: '下一句' }}
      />,
    )
    expect(screen.getByTestId('transcript-working').textContent).toMatch(/工作中/)
    expect(screen.getByTestId('transcript-pending').textContent).toMatch(/下一句/)
  })
})
