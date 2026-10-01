export { parseMentions, mentionHandle, resolveResponders } from 'dsh-bot-shared'
export type { MentionMember, MentionParse } from 'dsh-bot-shared'

export function mentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const head = text.slice(0, caret)
  const match = head.match(/@([^\s@]*)$/)
  if (match === null || match.index === undefined) return null
  return { start: match.index, query: match[1] ?? '' }
}
