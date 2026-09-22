/**
 * Turn-closed memory extraction. Prompt text is original (INV-103 / BR-807).
 */

import type { Context } from '@deepseek-ai/cordis'
import type { SessionToolCaller, SessionToolService } from 'session-tool'
import { extractAssistantAnswer, resolveOverride } from './ask.ts'
import type { DshBotRuntimeConfig } from './ask.ts'
import {
  DSH_BOT_MEMORY_HIDDEN_TITLE_PREFIX,
  botMark,
  botOwnershipTags,
} from './marks.ts'
import type { MemoryStore } from './memory.ts'
import { shouldExtract } from './memory.ts'
import { applyModelOverride } from './platform.ts'
import type { DshBotPlatform } from './platform.ts'
import { hideBotSession } from './session-visibility.ts'
import { forkChildId, readAssistant } from './fork-continuation.ts'

export interface ExtractPayload {
  readonly profile: readonly string[]
  readonly log: readonly string[]
  readonly remove: readonly string[]
}

export interface ExtractMemoryInput {
  readonly botId: string
  readonly sessionId?: string
  readonly turnText: string
}

export type ExtractAsk = (prompt: string, botId: string) => Promise<string | null>

export interface ExtractMemoryDeps {
  readonly memory: MemoryStore
  readonly ask: ExtractAsk
}

const CLI_CALLER: SessionToolCaller = { kind: 'cli' }

/**
 * Self-written extract prompt. Asks for JSON only; remove is exact-text.
 */
export function buildExtractPrompt(turnText: string, existingProfile: readonly string[]): string {
  const known = existingProfile.length === 0
    ? '（尚无长期事实）'
    : existingProfile.map(row => `- ${row}`).join('\n')
  return [
    '你在整理一份同事对用户的长期记忆。只根据下面这一轮对话判断该记什么。',
    '只输出一个 JSON 对象，不要解释，不要代码围栏。形状必须是：',
    '{"profile":[],"log":[],"remove":[]}',
    '',
    '字段约定：',
    '- profile：关于用户的稳定事实（称呼、偏好、长期约定），每条一句短句。',
    '- log：这一轮里实际发生过的事，每条一句短句。',
    '- remove：仅当新信息明确否定某条已有事实时，填写那条已有事实的原文；禁止改写，禁止发明。',
    '- 寒暄、道谢、没有新信息：三个数组都留空。',
    '- 已有事实不要再写进 profile。',
    '',
    '已有长期事实：',
    known,
    '',
    '本轮对话：',
    turnText.trim(),
  ].join('\n')
}

export function parseExtractJson(raw: string): ExtractPayload | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  const start = unfenced.indexOf('{')
  const end = unfenced.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const value = JSON.parse(unfenced.slice(start, end + 1)) as Record<string, unknown>
    return {
      profile: stringList(value.profile),
      log: stringList(value.log),
      remove: stringList(value.remove),
    }
  } catch {
    return null
  }
}

export async function applyExtract(
  memory: MemoryStore,
  botId: string,
  payload: ExtractPayload,
  sessionId?: string,
): Promise<{ readonly wrote: boolean }> {
  const profile = await memory.readProfile(botId)
  const logs = await memory.readLog(botId)
  let wrote = false
  for (const text of payload.remove) {
    const needle = text.trim()
    if (needle === '') continue
    const fact = profile.find(row => row.text === needle)
    if (fact !== undefined) {
      await memory.tombstone(botId, fact.id)
      wrote = true
      continue
    }
    const auto = logs.find(row => (
      row.text === needle && row.source === 'auto' && row.tombstone !== true
    ))
    if (auto !== undefined) {
      await memory.tombstone(botId, auto.id)
      wrote = true
    }
  }
  const afterProfile = wrote ? await memory.readProfile(botId) : profile
  for (const text of payload.profile) {
    const trimmed = text.trim()
    if (trimmed === '') continue
    if (afterProfile.some(row => row.text === trimmed)) continue
    await memory.appendProfile(botId, trimmed)
    wrote = true
  }
  for (const text of payload.log) {
    const trimmed = text.trim()
    if (trimmed === '') continue
    await memory.appendLog(botId, {
      kind: 'log',
      text: trimmed,
      source: 'auto',
      ...sessionId === undefined ? {} : { sessionId },
    })
    wrote = true
  }
  return { wrote }
}

export async function extractMemory(
  deps: ExtractMemoryDeps,
  input: ExtractMemoryInput,
): Promise<ExtractPayload | null> {
  if (!shouldExtract(input.turnText)) return null
  const existing = await deps.memory.readProfile(input.botId)
  const prompt = buildExtractPrompt(input.turnText, existing.map(row => row.text))
  const raw = await deps.ask(prompt, input.botId)
  if (raw === null) return null
  const payload = parseExtractJson(raw)
  if (payload === null) return null
  if (payload.profile.length === 0 && payload.log.length === 0 && payload.remove.length === 0) {
    return payload
  }
  await applyExtract(deps.memory, input.botId, payload, input.sessionId)
  return payload
}

export function createExtractAsk(deps: {
  readonly ctx: Context
  readonly sessionTool: SessionToolService
  readonly platform: DshBotPlatform
  readonly config: () => DshBotRuntimeConfig
}): ExtractAsk {
  return async (prompt, botId) => {
    const config = deps.config()
    const title = `${DSH_BOT_MEMORY_HIDDEN_TITLE_PREFIX}${botId}`
    try {
      const created = await deps.sessionTool.create(CLI_CALLER, {
        title,
        tags: botOwnershipTags(botMark(botId)),
      })
      const sessionId = created.sessionId
      await hideBotSession(deps.sessionTool, deps.platform, sessionId, CLI_CALLER, { syncToArchived: true })
      await applyModelOverride(deps.platform, sessionId, resolveOverride(config))
      await deps.sessionTool.write(CLI_CALLER, sessionId, prompt)
      const waited = await deps.sessionTool.wait(CLI_CALLER, sessionId, {
        until: 'idle',
        timeoutMs: config.askTimeoutMs,
      })
      if (waited.status === 'timeout' || waited.status === 'failed' || waited.status === 'aborted') {
        return null
      }
      if (waited.status === 'forked') {
        const childId = await forkChildId(deps.sessionTool, CLI_CALLER, sessionId)
        if (childId === undefined) return null
        return await readAssistant(deps.sessionTool, CLI_CALLER, childId) ?? null
      }
      const read = await deps.sessionTool.read(CLI_CALLER, sessionId, { maxBlocks: 500 })
      return extractAssistantAnswer(read.messages) ?? null
    } catch {
      return null
    }
  }
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((row): row is string => typeof row === 'string' && row.trim() !== '')
    .map(row => row.trim())
}
