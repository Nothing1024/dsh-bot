// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import {
  copySessionId,
  browseSessionTool,
  performWorkbenchJump,
  isChildBotSession,
} from '../src/jump.ts'

describe('jump helpers', () => {
  it('treats child and parent marks as subagent sessions', () => {
    expect(isChildBotSession(['child', 'hidden'])).toBe(true)
    expect(isChildBotSession(['parent:session-1'])).toBe(true)
    expect(isChildBotSession(['kind:hidden', 'app:dsh-bot'])).toBe(false)
  })

  it('copies the session id and toasts in standalone', async () => {
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    const onToast = vi.fn()
    await performWorkbenchJump('session-live', onToast)
    expect(writeText).toHaveBeenCalledWith('session-live')
    expect(onToast).toHaveBeenCalledWith('已复制会话 ID，可到会话协作打开')
  })
})

describe('copySessionId', () => {
  it('returns false when clipboard is missing', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
    expect(await copySessionId('s1')).toBe(false)
  })
})

describe('hosted official jump', () => {
  it('calls the host opener instead of copying', async () => {
    const openOfficial = vi.fn(async () => undefined)
    const onToast = vi.fn()
    await performWorkbenchJump('session-live', onToast, openOfficial)
    expect(openOfficial).toHaveBeenCalledWith('session-live')
    expect(onToast).not.toHaveBeenCalled()
  })

  it('toasts the host error message', async () => {
    const onToast = vi.fn()
    await performWorkbenchJump('session-live', onToast, async () => {
      throw new Error('宿主不支持打开会话')
    })
    expect(onToast).toHaveBeenCalledWith('宿主不支持打开会话')
  })
})

describe('browseSessionTool', () => {
  it('opens the host panel when provided', () => {
    const open = vi.fn()
    const onToast = vi.fn()
    browseSessionTool(onToast, open)
    expect(open).toHaveBeenCalledTimes(1)
    expect(onToast).not.toHaveBeenCalled()
  })

  it('toasts a hint when the host panel is unavailable', () => {
    const onToast = vi.fn()
    browseSessionTool(onToast)
    expect(onToast).toHaveBeenCalledWith('请在 DSH 侧栏打开「会话协作」查看原来的会话')
  })
})
