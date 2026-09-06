/**
 * Routine behavior section + propose-routine block (BR-906).
 * @module dsh-bot-host/routine-behavior
 */

export const BEHAVIOR_HEADING = '## 行为规范'

export const PROPOSE_BLOCK_RE = /\[propose-routine\]([\s\S]*?)\[\/propose-routine\]/gu

export interface ProposeRoutinePayload {
  readonly name: string
  readonly schedule: string
  readonly instruction: string
}

export function renderBehaviorSection(declined: readonly string[] = []): string {
  const refused = declined
    .map(row => row.trim())
    .filter(row => row !== '')
    .map(row => `- ${row}`)
  const lines = [
    BEHAVIOR_HEADING,
    '',
    '例程回合：到点叫醒时没有人在等你。没有要说的就只输出一行 (silent)。有要说的就随口提一句，不要复述计划表。',
    '',
    '主动性：如果用户连续两次或以上让你做同一类事，你可以提议设成例程，且只提一次。输出单独一块：',
    '[propose-routine]{"name":"例程名","schedule":"@daily","instruction":"要做的事"}[/propose-routine]',
    '不要换别的格式。',
  ]
  if (refused.length > 0) {
    lines.push('', '这些主题已经拒绝过，不要再提：', ...refused)
  }
  return lines.join('\n')
}

export function parseProposeRoutine(text: string): {
  readonly text: string
  readonly proposals: readonly ProposeRoutinePayload[]
} {
  const proposals: ProposeRoutinePayload[] = []
  const stripped = text.replace(PROPOSE_BLOCK_RE, (_all, inner: string) => {
    try {
      const parsed = JSON.parse(inner.trim()) as Record<string, unknown>
      const name = typeof parsed.name === 'string' ? parsed.name.trim() : ''
      const schedule = typeof parsed.schedule === 'string' ? parsed.schedule.trim() : ''
      const instruction = typeof parsed.instruction === 'string' ? parsed.instruction.trim() : ''
      if (name !== '' && schedule !== '' && instruction !== '') {
        proposals.push({ name, schedule, instruction })
      }
    } catch {
      // illegal JSON: strip only
    }
    return ''
  })
  return { text: stripped.replace(/\n{3,}/g, '\n\n').trim(), proposals }
}
