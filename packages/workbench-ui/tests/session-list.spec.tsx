// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionList } from '../src/SessionList.tsx'
import type { SessionChoice } from '../src/SessionList.tsx'

const row: SessionChoice = { sessionId: 's-visible', title: '可见会话', updatedAt: 1, working: false, hidden: false, child: false, selected: true }
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('SessionList actions', () => {
  it('renames through the backend without navigating away from Bot', async () => {
    const onSelect = vi.fn()
    const onToast = vi.fn()
    const fetch = vi.fn(async () => ({ json: async () => ({ ok: true, value: {} }) }))
    vi.stubGlobal('fetch', fetch)
    render(<SessionList items={[row]} onSelect={onSelect} onToast={onToast} />)
    fireEvent.click(screen.getByTestId('session-menu-s-visible'))
    expect(screen.getByTestId('session-jump-s-visible').textContent).toBe('复制会话 ID')
    fireEvent.click(screen.getByTestId('session-rename-s-visible'))
    const input = screen.getByLabelText('对话或房间名称')
    expect((input as HTMLInputElement).value).toBe('可见会话')
    fireEvent.change(input, { target: { value: '文稿校对' } })
    fireEvent.click(screen.getByTestId('session-rename-save'))
    await vi.waitFor(() => expect(onToast).toHaveBeenCalledWith('名称已更新'))
    expect(fetch).toHaveBeenCalledWith('/dsh-bot/renameSession', expect.objectContaining({ body: JSON.stringify({ args: { sessionId: 's-visible', title: '文稿校对' } }) }))
    expect(onSelect).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('session-option-s-visible'))
    expect(onSelect).toHaveBeenCalledWith('s-visible')
  })

  it('retains the name and reports a failed save', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ ok: false, error: { code: 'unavailable', message: '暂不可用' } }) })))
    render(<SessionList items={[row]} onSelect={vi.fn()} />)
    fireEvent.click(screen.getByTestId('session-menu-s-visible'))
    fireEvent.click(screen.getByTestId('session-rename-s-visible'))
    fireEvent.click(screen.getByTestId('session-rename-save'))
    expect((await screen.findByRole('alert')).textContent).toBe('暂不可用')
    expect((screen.getByLabelText('对话或房间名称') as HTMLInputElement).value).toBe('可见会话')
  })

  it('offers room actions and room creation without a DSH jump', () => {
    render(<SessionList items={[row]} onSelect={vi.fn()} groupMode onCreate={vi.fn()} />)
    fireEvent.click(screen.getByTestId('session-menu-s-visible'))
    expect(screen.getByTestId('session-jump-s-visible').textContent).toBe('复制会话 ID')
    expect(screen.getByTestId('session-rename-s-visible').textContent).toBe('重命名')
    expect(screen.getByTestId('session-list-new').textContent).toBe('+ 新开房间')
    expect(screen.getByTestId('session-tool-browse').textContent).toMatch(/会话协作/)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('session-menu-panel-s-visible')).toBeNull()
  })

  it('opens session-tool from the browse footer', () => {
    const openTool = vi.fn()
    render(<SessionList items={[row]} onSelect={vi.fn()} onOpenSessionTool={openTool} />)
    fireEvent.click(screen.getByTestId('session-tool-browse'))
    expect(openTool).toHaveBeenCalledTimes(1)
  })

  it('jumps through the host opener from the row menu', async () => {
    const openOfficial = vi.fn(async () => undefined)
    const onDoneToast = vi.fn()
    render(<SessionList items={[row]} onSelect={vi.fn()} onToast={onDoneToast} onOpenOfficialSession={openOfficial} />)
    fireEvent.click(screen.getByTestId('session-menu-s-visible'))
    expect(screen.getByTestId('session-jump-s-visible').textContent).toBe('在官方会话打开')
    fireEvent.click(screen.getByTestId('session-jump-s-visible'))
    await vi.waitFor(() => expect(openOfficial).toHaveBeenCalledWith('s-visible'))
  })
})
