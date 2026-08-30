/**
 * @mention parse for the group composer (mirrors host parseMentions).
 */

export interface MentionMember {
  readonly id: string
  readonly name: string
}

export interface MentionParse {
  readonly responderIds: readonly string[]
  readonly unmatched: boolean
  readonly namedAll: boolean
}

const ALL_HANDLES = new Set(['all', 'everyone'])

function matchMember(token: string, members: readonly MentionMember[]): MentionMember | undefined {
  const compact = token.replace(/\s+/g, '')
  if (compact === '') return undefined
  let prefixHit: MentionMember | undefined
  for (const member of members) {
    const nameCompact = member.name.replace(/\s+/g, '')
    if (member.id === token || member.name === token || nameCompact === compact) return member
    if (nameCompact !== '' && compact.startsWith(nameCompact)) {
      if (prefixHit === undefined || member.name.length > prefixHit.name.length) prefixHit = member
    }
  }
  return prefixHit
}

export function parseMentions(text: string, members: readonly MentionMember[]): MentionParse {
  const order = members.map(row => row.id)
  const mentions = [...text.matchAll(/@([^\s@]+)/g)].map(match => match[1] ?? '')
  if (mentions.length === 0) {
    return { responderIds: order, unmatched: false, namedAll: false }
  }
  const wanted = new Set<string>()
  let namedAll = false
  let anyMatch = false
  for (const raw of mentions) {
    const token = raw.trim()
    if (token === '') continue
    if (ALL_HANDLES.has(token.toLowerCase())) {
      namedAll = true
      anyMatch = true
      continue
    }
    const hit = matchMember(token, members)
    if (hit !== undefined) {
      wanted.add(hit.id)
      anyMatch = true
    }
  }
  if (namedAll) {
    return { responderIds: order, unmatched: false, namedAll: true }
  }
  if (!anyMatch) {
    return { responderIds: order, unmatched: true, namedAll: false }
  }
  return {
    responderIds: order.filter(id => wanted.has(id)),
    unmatched: false,
    namedAll: false,
  }
}

export function mentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const head = text.slice(0, caret)
  const match = head.match(/@([^\s@]*)$/)
  if (match === null || match.index === undefined) return null
  return { start: match.index, query: match[1] ?? '' }
}
