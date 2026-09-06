// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { notifyRoutineSpoke, resetNotifyThrottleForTests, shouldNotifyRoutine } from '../src/notify.ts'

const OriginalNotification = globalThis.Notification

afterEach(() => {
  resetNotifyThrottleForTests()
  vi.restoreAllMocks()
  Object.defineProperty(globalThis, 'Notification', {
    configurable: true,
    writable: true,
    value: OriginalNotification,
  })
})

describe('notifyRoutineSpoke', () => {
  it('skips when the document is visible', () => {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    expect(notifyRoutineSpoke('ops-visible', '运维夜班', 'hi', 1_000)).toBe(false)
  })

  it('throttles the same bot within 5s', () => {
    const created: string[] = []
    class FakeNotification {
      constructor(title: string) {
        created.push(title)
      }
      static permission = 'granted' as NotificationPermission
      static requestPermission() {
        return Promise.resolve('granted' as NotificationPermission)
      }
    }
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    Object.defineProperty(globalThis, 'Notification', {
      configurable: true,
      writable: true,
      value: FakeNotification,
    })
    expect(notifyRoutineSpoke('ops-throttle', '运维夜班', 'a', 1_000)).toBe(true)
    expect(notifyRoutineSpoke('ops-throttle', '运维夜班', 'b', 2_000)).toBe(false)
    expect(created).toEqual(['运维夜班'])
  })
})

describe('shouldNotifyRoutine', () => {
  it('skips muted bots even when unread grows', () => {
    expect(shouldNotifyRoutine(true, 3, 1)).toBe(false)
    expect(shouldNotifyRoutine(false, 3, 1)).toBe(true)
    expect(shouldNotifyRoutine(undefined, 1, 1)).toBe(false)
  })
})
