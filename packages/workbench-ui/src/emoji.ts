/**
 * Curated emoji subset for the composer picker. No third-party emoji pack.
 */

export interface EmojiEntry {
  readonly id: string
  readonly glyph: string
  readonly names: readonly string[]
}

export const EMOJI: readonly EmojiEntry[] = [
  { id: 'smile', glyph: '😀', names: ['smile', 'grin', 'happy'] },
  { id: 'grin', glyph: '😄', names: ['grin', 'smile'] },
  { id: 'laugh', glyph: '😂', names: ['laugh', 'joy', 'lol'] },
  { id: 'wink', glyph: '😉', names: ['wink'] },
  { id: 'blush', glyph: '😊', names: ['blush', 'smile'] },
  { id: 'think', glyph: '🤔', names: ['think', 'thinking'] },
  { id: 'neutral', glyph: '😐', names: ['neutral'] },
  { id: 'sad', glyph: '😢', names: ['sad', 'cry'] },
  { id: 'cry', glyph: '😭', names: ['cry', 'sob'] },
  { id: 'angry', glyph: '😠', names: ['angry', 'mad'] },
  { id: 'wow', glyph: '😮', names: ['wow', 'open_mouth'] },
  { id: 'cool', glyph: '😎', names: ['cool', 'sunglasses'] },
  { id: 'heart_eyes', glyph: '😍', names: ['love', 'heart_eyes'] },
  { id: 'kiss', glyph: '😘', names: ['kiss'] },
  { id: 'thumbsup', glyph: '👍', names: ['thumbsup', '+1', 'yes'] },
  { id: 'thumbsdown', glyph: '👎', names: ['thumbsdown', '-1', 'no'] },
  { id: 'ok', glyph: '👌', names: ['ok', 'okay'] },
  { id: 'clap', glyph: '👏', names: ['clap'] },
  { id: 'wave', glyph: '👋', names: ['wave', 'hi', 'hello'] },
  { id: 'pray', glyph: '🙏', names: ['pray', 'please', 'thanks'] },
  { id: 'fire', glyph: '🔥', names: ['fire'] },
  { id: '100', glyph: '💯', names: ['100', 'hundred'] },
  { id: 'star', glyph: '⭐', names: ['star'] },
  { id: 'sparkles', glyph: '✨', names: ['sparkles', 'stars'] },
  { id: 'heart', glyph: '❤️', names: ['heart', 'love', 'red_heart'] },
  { id: 'yellow_heart', glyph: '💛', names: ['yellow_heart'] },
  { id: 'broken_heart', glyph: '💔', names: ['broken_heart'] },
  { id: 'ok_button', glyph: '✅', names: ['check', 'done', 'ok'] },
  { id: 'x', glyph: '❌', names: ['x', 'no', 'cross'] },
  { id: 'warning', glyph: '⚠️', names: ['warning'] },
  { id: 'bulb', glyph: '💡', names: ['bulb', 'idea'] },
  { id: 'pencil', glyph: '✏️', names: ['pencil', 'write'] },
  { id: 'book', glyph: '📖', names: ['book'] },
  { id: 'memo', glyph: '📝', names: ['memo', 'note'] },
  { id: 'rocket', glyph: '🚀', names: ['rocket'] },
  { id: 'tada', glyph: '🎉', names: ['tada', 'party'] },
  { id: 'coffee', glyph: '☕', names: ['coffee'] },
  { id: 'tea', glyph: '🍵', names: ['tea'] },
  { id: 'sun', glyph: '☀️', names: ['sun'] },
  { id: 'moon', glyph: '🌙', names: ['moon'] },
  { id: 'rain', glyph: '🌧️', names: ['rain'] },
  { id: 'dog', glyph: '🐶', names: ['dog'] },
  { id: 'cat', glyph: '🐱', names: ['cat'] },
  { id: 'eyes', glyph: '👀', names: ['eyes', 'look'] },
  { id: 'poop', glyph: '💩', names: ['poop'] },
  { id: 'zzz', glyph: '💤', names: ['zzz', 'sleep'] },
  { id: 'speech', glyph: '💬', names: ['speech', 'comment'] },
  { id: 'link', glyph: '🔗', names: ['link'] },
]

const TOKEN = /(?:^|\s):([a-zA-Z0-9_+-]*)$/

/**
 * Open `:query` token at the caret. Requires start-or-whitespace so `http:`
 * and `12:00` do not open the picker.
 */
export function emojiQuery(text: string, caret: number): { start: number; query: string } | null {
  const head = text.slice(0, caret)
  const match = head.match(TOKEN)
  if (match === null || match.index === undefined) return null
  const start = match[0].startsWith(':') ? match.index : match.index + 1
  return { start, query: match[1] ?? '' }
}

export function filterEmoji(query: string, limit = 12): EmojiEntry[] {
  const needle = query.trim().toLowerCase()
  const rows = needle === ''
    ? EMOJI
    : EMOJI.filter(row => (
      row.id.includes(needle)
      || row.names.some(name => name.includes(needle))
    ))
  return rows.slice(0, limit)
}
