/** 群聊输入框与服务端使用相同的收件人规则。 */
export interface MentionMember {
  readonly id: string
  readonly name: string
}

export interface MentionParse {
  readonly responderIds: readonly string[]
  readonly unmatched: boolean
  readonly namedAll: boolean
  readonly unmatchedHandles: readonly string[]
}

const ALL_HANDLES = new Set(['all', 'everyone'])
const boundary = (value: string): boolean => value === '' || /^[\s@,，。.!！?？:：;；、)）\]】]/u.test(value)

export function parseMentions(text: string, members: readonly MentionMember[]): MentionParse {
  const wanted = new Set<string>()
  const unmatchedHandles: string[] = []
  let namedAll = false
  let count = 0
  let consumed = 0
  for (const match of text.matchAll(/(^|[\s(（,，。!！?？:：;；、])@/gu)) {
    const start = match.index! + match[0].length
    if (start < consumed) continue
    count += 1
    const tail = text.slice(start)
    const token = tail.match(/^[^\s@,，。!！?？:：;；、)）\]】]+/u)?.[0] ?? ''
    if (ALL_HANDLES.has(token.toLowerCase())) {
      namedAll = true
      consumed = start + token.length
      continue
    }
    const candidates = members.flatMap(member => [...new Set([member.id, member.name])]
      .filter(name => name !== '' && tail.startsWith(name) && boundary(tail.slice(name.length)))
      .map(name => ({ id: member.id, name })))
    const length = Math.max(0, ...candidates.map(row => row.name.length))
    const ids = [...new Set(candidates.filter(row => row.name.length === length).map(row => row.id))]
    if (ids.length !== 1) {
      unmatchedHandles.push(candidates.find(row => row.name.length === length)?.name ?? token)
      continue
    }
    wanted.add(ids[0]!)
    consumed = start + length
  }
  const unmatched = unmatchedHandles.length > 0
  return {
    responderIds: unmatched ? [] : members.filter(row => count === 0 || namedAll || wanted.has(row.id)).map(row => row.id),
    unmatched,
    namedAll,
    unmatchedHandles,
  }
}

/** 重名及保留名用唯一 ID 插入，普通名字保留可读形式。 */
export function mentionHandle(member: MentionMember, members: readonly MentionMember[]): string {
  return ALL_HANDLES.has(member.name.toLowerCase()) || members.filter(row => row.name === member.name).length !== 1
    || members.some(row => row.id === member.name && row.id !== member.id)
    ? member.id : member.name
}
