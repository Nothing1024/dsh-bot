/**
 * Stable fallback for group rooms created before explicit renaming was added.
 */
export function defaultGroupRoomTitle(groupName: string, createdAt: number): string {
  const name = groupName.trim()
  if (!Number.isFinite(createdAt) || createdAt <= 0) return name === '' ? '新房间' : name
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return name === '' ? '新房间' : name
  const pad = (value: number): string => String(value).padStart(2, '0')
  const stamp = String(date.getMonth() + 1) + '/' + String(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes())
  return name === '' ? '新房间 · ' + stamp : name + ' · ' + stamp
}
