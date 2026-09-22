/**
 * A forked turn continues in the child session. Callers that wait on the
 * seed must read that child instead of treating `forked` as a failure.
 * @module dsh-bot-host/fork-continuation
 */

import { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionToolCaller, SessionToolMessageRow, SessionToolService } from 'session-tool'

/** Newest session marked `parent:<sessionId>`. */
export async function forkChildId(
  sessionTool: SessionToolService,
  caller: SessionToolCaller,
  sessionId: string,
): Promise<string | undefined> {
  const mark = `parent:${sessionId}`
  const listed = await sessionTool.list(caller, { includeHidden: true, limit: 200 })
  const children = listed.sessions.filter(row => row.tags.includes(mark))
  children.sort((a, b) => a.createdAt - b.createdAt)
  return children.at(-1)?.sessionId
}

/** Last assistant text in a session read. */
export function assistantTextOf(messages: readonly SessionToolMessageRow[]): string | undefined {
  const last = [...messages].reverse().find(row => row.role === 'assistant')
  if (last === undefined) return undefined
  const text = last.blocks
    .filter((block): block is { type: 'text'; text: string } =>
      block !== undefined && block !== null && typeof block === 'object'
      && 'type' in block && block.type === 'text'
      && 'text' in block && typeof block.text === 'string')
    .map(block => block.text)
    .join('')
  return text === '' ? undefined : text
}

export async function readAssistant(
  sessionTool: SessionToolService,
  caller: SessionToolCaller,
  sessionId: string,
): Promise<string | undefined> {
  const read = await sessionTool.read(caller, SessionId(sessionId), { maxBlocks: 500 })
  return assistantTextOf(read.messages)
}
