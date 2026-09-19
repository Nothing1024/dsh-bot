// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  copySessionId,
  formatJumpReason,
  JUMP_ACK_MS,
  JUMP_MESSAGE_TYPE,
  JUMP_RESULT_TYPE,
  browseSessionTool,
  performWorkbenchJump,
  requestJump,
  resetJumpInFlight,
  sessionJumpLabel,
  sessionJumpTitle,
} from '../src/jump.ts'

describe('jump helpers', () => {
  afterEach(() => {
    resetJumpInFlight()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    Object.defineProperty(window, 'parent', { configurable: true, value: window })
  })

  it('labels standalone vs in-tab actions', () => {
    expect(window.parent).toBe(window)
    expect(sessionJumpLabel()).toBe('复制会话 ID')
    expect(sessionJumpTitle()).toBe('复制后可到会话协作打开原来的会话')
    expect(sessionJumpLabel(false)).toBe('在官方会话打开')
    expect(sessionJumpTitle(false)).toBe('通过会话协作跳到官方对话')
  })

  it('maps machine reasons for the failure toast', () => {
    expect(formatJumpReason('unsupported')).toBe('当前页签不支持跳转')
    expect(formatJumpReason('timeout')).toBe('跳转超时')
    expect(formatJumpReason('archived')).toMatch(/已归档/)
    expect(formatJumpReason('会话不存在或已删除')).toBe('会话不存在或已删除')
  })

  it('returns unsupported when there is no parent host', async () => {
    await expect(requestJump('s1')).resolves.toEqual({ ok: false, reason: 'unsupported' })
  })

  it('posts dsh-bot:jump and resolves the matching result', async () => {
    const parent = { postMessage: vi.fn() }
    Object.defineProperty(window, 'parent', { configurable: true, value: parent })
    const origin = window.location.origin
    const pending = requestJump('session-live')
    expect(parent.postMessage).toHaveBeenCalledWith(
      { type: JUMP_MESSAGE_TYPE, sessionId: 'session-live' },
      origin,
    )
    window.dispatchEvent(new MessageEvent('message', {
      origin,
      source: parent as unknown as Window,
      data: { type: JUMP_RESULT_TYPE, ok: true },
    }))
    await expect(pending).resolves.toEqual({ ok: true })
  })

  it('times out after 1.5s without an ack', async () => {
    vi.useFakeTimers()
    const parent = { postMessage: vi.fn() }
    Object.defineProperty(window, 'parent', { configurable: true, value: parent })
    const pending = requestJump('session-live')
    await vi.advanceTimersByTimeAsync(JUMP_ACK_MS)
    await expect(pending).resolves.toEqual({ ok: false, reason: 'timeout' })
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
