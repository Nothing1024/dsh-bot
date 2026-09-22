/**
 * Official conversation classifies user/message by `source.kind`, not tags.
 * session-tool.write is always kind=user, so wrapping the prompt cannot hide
 * persona. When `ctx.agents` is present, a pre-step listener prepends a
 * plugin-sourced reminder (context card). Tests without agents still wrap.
 * @module dsh-bot-host/session-voice-inject
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-llm'
import { wrapVoice } from './session-voice.ts'

/** Persona reminder written ahead of a user turn. V4 admits this kind; the shared `plugin` kind is gone. */
export interface DshBotInstructionSource {
  readonly kind: 'dsh-bot-instructions'
  readonly form: 'instructions'
}

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'dsh-bot-instructions': DshBotInstructionSource
  }
}

interface PreStepDecision {
  readonly kind: string
  readonly messages?: readonly unknown[]
}

interface AgentsHost {
  inject(deps: string[], callback: () => (() => void) | void): (() => void) | void
  on(event: string, listener: (...args: unknown[]) => unknown): () => void
}

function asAgentsHost(ctx: Context): AgentsHost {
  // Cordis Context is untyped for optional `agents`; the host surface is inject + on.
  return ctx as unknown as AgentsHost
}

function isEnterDecision(value: unknown): value is PreStepDecision {
  return typeof value === 'object' && value !== null && 'kind' in value && value.kind === 'enter'
}

function sourceKindOf(row: unknown): string | undefined {
  if (typeof row !== 'object' || row === null || !('source' in row)) return undefined
  const source = row.source
  if (typeof source !== 'object' || source === null || !('kind' in source)) return undefined
  return typeof source.kind === 'string' ? source.kind : undefined
}

function sessionIdOf(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null || !('agent' in payload)) return undefined
  const agent = payload.agent
  if (typeof agent !== 'object' || agent === null || !('id' in agent)) return undefined
  const id = agent.id
  return typeof id === 'string' && id !== '' ? id : undefined
}

export interface VoicePreStep {
  readonly active: () => boolean
  readonly dispose: () => void
}

/**
 * Register `agent/pre-step` when `ctx.agents` exists. `voiceOf` returns the
 * frozen persona for that session, or undefined to skip.
 */
export function installVoicePreStep(
  ctx: Context,
  voiceOf: (sessionId: string) => Promise<string | undefined>,
): VoicePreStep {
  let active = false
  let disposeInner: (() => void) | undefined
  const host = asAgentsHost(ctx)
  const inject = host.inject(['agents'], () => {
    active = true
    const off = host.on('agent/pre-step', async (payload: unknown, next: unknown) => {
      const decision = typeof next === 'function' ? await next() : undefined
      if (!isEnterDecision(decision)) return decision
      const batch = decision.messages ?? []
      const hasUser = batch.some(row => sourceKindOf(row) === 'user')
      if (!hasUser) return decision
      const sessionId = sessionIdOf(payload)
      if (sessionId === undefined) return decision
      const persona = await voiceOf(sessionId)
      const reminder = persona === undefined ? '' : wrapVoice(persona)
      if (reminder === '') return decision
      const injected = {
        id: crypto.randomUUID(),
        role: 'user' as const,
        content: [{ type: 'text' as const, text: reminder }],
        source: { kind: 'dsh-bot-instructions' as const, form: 'instructions' as const },
      }
      return { kind: 'enter', messages: [injected, ...batch] }
    })
    disposeInner = () => {
      active = false
      off()
    }
    return () => {
      disposeInner?.()
      disposeInner = undefined
    }
  })
  return {
    active: () => active,
    dispose: () => {
      disposeInner?.()
      disposeInner = undefined
      if (typeof inject === 'function') inject()
    },
  }
}
