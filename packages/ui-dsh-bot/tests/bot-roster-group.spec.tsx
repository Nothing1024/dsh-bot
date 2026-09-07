// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SELECT_GROUP_MESSAGE_TYPE } from 'dsh-bot-shared'
import type { WorkbenchBot, WorkbenchGroup } from 'dsh-bot-shared'
import { BotRoster } from '../src/client/BotRoster.tsx'
import { DSH_BOT_SESSIONS_TAB_ID } from '../src/client/tab-id.ts'
import { openGroup, postSelectGroup, setSidebarOpener, setWorkbenchFrame, workbenchTabSeed } from '../src/client/workbench-frame.ts'

const reviewer: WorkbenchBot = {
  id: 'reviewer',
  name: '代码审查官',
  avatar: { color: '#5b8def' },
  presetId: 'dsh-bot--reviewer',
  createdAt: 1,
  persona: '审',
  protected: false,
  section: 'work',
}

const room: WorkbenchGroup = {
  id: 'editors',
  name: '编辑室',
  memberIds: ['reviewer'],
  createdAt: 2,
  section: 'work',
}

afterEach(() => {
  cleanup()
  setWorkbenchFrame(null)
})

describe('openGroup', () => {
  it('activates the tab and posts select-group', async () => {
    const activateTab = vi.fn()
    const postMessage = vi.fn()
    setWorkbenchFrame({ postMessage } as unknown as Window)
    const result = await openGroup({ groupId: 'editors', activateTab, tabId: DSH_BOT_SESSIONS_TAB_ID })
    expect(result.ok).toBe(true)
    expect(activateTab).toHaveBeenCalledWith(DSH_BOT_SESSIONS_TAB_ID)
    expect(postMessage).toHaveBeenCalledWith(
      { type: SELECT_GROUP_MESSAGE_TYPE, groupId: 'editors' },
      location.origin,
    )
  })

  it('includes roomId when opening a new room', async () => {
    const postMessage = vi.fn()
    setWorkbenchFrame({ postMessage } as unknown as Window)
    expect(postSelectGroup('editors', 'room-1')).toBe(true)
    expect(postMessage).toHaveBeenCalledWith(
      { type: SELECT_GROUP_MESSAGE_TYPE, groupId: 'editors', roomId: 'room-1' },
      location.origin,
    )
  })

  it('opens the tab in sight via openTab (url seed) before focusing it (BR-608 / UF-606 collapsed panel)', async () => {
    const opened: unknown[] = []
    setSidebarOpener(seed => { opened.push(seed) })
    const activateTab = vi.fn()
    const post = vi.fn()
    setWorkbenchFrame({ postMessage: post } as unknown as Window)
    const result = await openGroup({ groupId: 'editors', activateTab, tabId: DSH_BOT_SESSIONS_TAB_ID })
    expect(result.ok).toBe(true)
    expect(opened).toEqual([workbenchTabSeed(DSH_BOT_SESSIONS_TAB_ID)])
    expect((opened[0] as { url: string }).url).toMatch(/\/dsh-bot\/ui$/)
    expect(activateTab).toHaveBeenCalledWith(DSH_BOT_SESSIONS_TAB_ID)
    setSidebarOpener(null)
    setWorkbenchFrame(null)
  })

  it('returns the missing-tab copy when activateTab is absent', async () => {
    const result = await openGroup({ groupId: 'editors', tabId: DSH_BOT_SESSIONS_TAB_ID })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/需要右栏 DSH Bot 页签/)
  })

  it('renders + 新开房间 under a selected group', () => {
    const onNewRoom = vi.fn()
    render(<BotRoster bots={[reviewer]} groups={[room]} selectedId="editors" onNewRoom={onNewRoom} />)
    fireEvent.click(screen.getByTestId('dsh-bot-new-room'))
    expect(onNewRoom).toHaveBeenCalledWith('editors')
  })
})
