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

  it('offers 删除房间 only for group rooms and hands off to the caller without any request', () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const onDeleteRoom = vi.fn()
    const view = render(<SessionList items={[row]} onSelect={vi.fn()} onDeleteRoom={onDeleteRoom} />)
    fireEvent.click(screen.getByTestId('session-menu-s-visible'))
    expect(screen.queryByTestId('session-delete-s-visible')).toBeNull()
    view.unmount()
    render(<SessionList items={[row]} groupMode onSelect={vi.fn()} onDeleteRoom={onDeleteRoom} />)
    fireEvent.click(screen.getByTestId('session-menu-s-visible'))
    fireEvent.click(screen.getByTestId('session-delete-s-visible'))
    expect(onDeleteRoom).toHaveBeenCalledWith('s-visible', '可见会话')
    expect(screen.queryByTestId('session-menu-panel-s-visible')).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('opens session-tool from the browse footer', () => {
    const openTool = vi.fn()
    render(<SessionList items={[row]} onSelect={vi.fn()} onOpenSessionTool={openTool} />)
    fireEvent.click(screen.getByTestId('session-tool-browse'))
    expect(openTool).toHaveBeenCalledTimes(1)
  })

  it('opens a group room through the member official session, not the room id', async () => {
    const openOfficial = vi.fn(async () => undefined)
    const onToast = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (!String(url).includes('listRoomOfficialSessions')) {
        return { json: async () => ({ ok: true, value: {} }) }
      }
      return {
        json: async () => ({
          ok: true,
          value: {
            sessions: [
              { botId: 'bei', name: '诗人小北', sessionId: 'session-bei' },
              { botId: 'ning', name: '校对阿宁', sessionId: 'session-ning' },
            ],
          },
        }),
      }
    }))
    render(<SessionList items={[row]} groupMode onSelect={vi.fn()} onToast={onToast} onOpenOfficialSession={openOfficial} />)
    fireEvent.click(screen.getByTestId('session-menu-s-visible'))
    fireEvent.click(screen.getByTestId('session-jump-s-visible'))
    const poet = await screen.findByTestId('session-jump-s-visible-bei')
    expect(poet.textContent).toBe('在官方会话打开 · 诗人小北')
    fireEvent.click(poet)
    await vi.waitFor(() => expect(openOfficial).toHaveBeenCalledWith('session-bei'))
    expect(openOfficial).not.toHaveBeenCalledWith('s-visible')
    expect(onToast).not.toHaveBeenCalled()
  })

  it('says when a group room has no official session yet', async () => {
    const onToast = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ ok: true, value: { sessions: [] } }) })))
    render(<SessionList items={[row]} groupMode onSelect={vi.fn()} onToast={onToast} onOpenOfficialSession={vi.fn()} />)
    fireEvent.click(screen.getByTestId('session-menu-s-visible'))
    fireEvent.click(screen.getByTestId('session-jump-s-visible'))
    await vi.waitFor(() => expect(onToast).toHaveBeenCalledWith('这个房间还没有官方会话'))
  })

  it('opens a bot group session without treating it as the current chat', async () => {
    const openOfficial = vi.fn(async () => undefined)
    const onSelect = vi.fn()
    const onJumped = vi.fn()
    const official: SessionChoice = {
      sessionId: 'session-bei',
      title: '小组 · 编辑室 · 夜谈',
      updatedAt: 1,
      working: false,
      hidden: false,
      child: false,
      selected: false,
      jumpOnly: true,
    }
    render(<SessionList items={[official]} onSelect={onSelect} onJumped={onJumped} onOpenOfficialSession={openOfficial} />)
    fireEvent.click(screen.getByTestId('session-option-session-bei'))
    await vi.waitFor(() => expect(openOfficial).toHaveBeenCalledWith('session-bei'))
    expect(onSelect).not.toHaveBeenCalled()
    expect(onJumped).toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('session-menu-session-bei'))
    expect(screen.queryByTestId('session-rename-session-bei')).toBeNull()
    expect(screen.getByTestId('session-jump-session-bei').textContent).toBe('在官方会话打开')
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
