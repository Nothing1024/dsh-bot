/**
 * Browser Notification for routine spoke (BR-904): hidden tab + 5s per bot.
 */
const lastAt = new Map<string, number>()

export function resetNotifyThrottleForTests(): void {
  lastAt.clear()
}

export function notifyRoutineSpoke(botId: string, title: string, body: string, now = Date.now()): boolean {
  const doc = globalThis.document
  const Notice = (globalThis as unknown as { Notification?: typeof Notification }).Notification
  if (doc === undefined || Notice === undefined) return false
  if (doc.hidden !== true) return false
  const prev = lastAt.get(botId)
  if (prev !== undefined && now - prev < 5000) return false
  if (Notice.permission === 'denied') return false
  if (Notice.permission === 'default') {
    void Notice.requestPermission()
    return false
  }
  lastAt.set(botId, now)
  try {
    new Notice(title, { body })
    return true
  } catch {
    lastAt.delete(botId)
    return false
  }
}
