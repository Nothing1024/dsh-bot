import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { SessionId } from '@deepseek-ai/dsh-session'
import { DshBotError } from 'dsh-bot-host'
import { apply } from '../src/index.ts'

function stubExec() {
  return {
    agent: {
      id: SessionId('caller'),
      session: { header: { delegationDepth: 0 } },
    },
    signal: new AbortController().signal,
  }
}

function register(): {
  defs: Map<string, ToolDefinition>
  dshBot: { askBot: ReturnType<typeof vi.fn>; sendToPeer: ReturnType<typeof vi.fn> }
} {
  const dshBot = { askBot: vi.fn(), sendToPeer: vi.fn() }
  const defs = new Map<string, ToolDefinition>()
  const ctx = {
    tools: { register: vi.fn((definition: ToolDefinition) => { defs.set(definition.name, definition) }) },
    dshBot,
  } as unknown as Context
  apply(ctx)
  return { defs, dshBot }
}

async function run(definition: ToolDefinition, args: unknown) {
  const value = await (definition.execute as (a: unknown, e: unknown) => Promise<unknown>)(args, stubExec())
  validateJsonSchemaValue(definition.output.schema, value)
  return value
}

describe('tool-dsh-bot', () => {
  it('registers dsh_bot_ask as a generic card with no locations', () => {
    const { defs } = register()
    expect([...defs.keys()]).toEqual(['dsh_bot_ask', 'dsh_bot_send'])
    const view = defs.get('dsh_bot_ask')!.presentCall?.({ prompt: 'hi' })
    expect(view?.card).toBe('generic')
    expect((view as { locations?: unknown } | undefined)?.locations).toBeUndefined()
  })

  it('delegates prompt and title to ctx.dshBot.askBot', async () => {
    const { defs, dshBot } = register()
    dshBot.askBot.mockResolvedValue({ sessionId: SessionId('session-bot-1'), answer: 'entanglement is…' })
    const value = await run(defs.get('dsh_bot_ask')!, { prompt: '量子纠缠是什么', title: 'qe' })
    expect(dshBot.askBot).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'agent', sessionId: 'caller' }),
      { prompt: '量子纠缠是什么', title: 'qe' },
    )
    expect(value).toEqual({ session_id: 'session-bot-1', answer: 'entanglement is…' })
  })

  it('omits title when the model did not pass one', async () => {
    const { defs, dshBot } = register()
    dshBot.askBot.mockResolvedValue({ sessionId: SessionId('session-bot-1'), answer: 'ok' })
    await run(defs.get('dsh_bot_ask')!, { prompt: 'hi' })
    expect(dshBot.askBot).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'agent' }),
      { prompt: 'hi' },
    )
  })

  it('fails loud on web-unreachable and never returns an empty string', async () => {
    const { defs, dshBot } = register()
    dshBot.askBot.mockRejectedValue(new DshBotError('web-unreachable', 'gateway down'))
    await expect(run(defs.get('dsh_bot_ask')!, { prompt: 'hi' })).rejects.toThrow(/web-unreachable/)
  })

  it('requires a calling agent', async () => {
    const { defs } = register()
    const execute = defs.get('dsh_bot_ask')!.execute as (a: unknown, e: unknown) => Promise<unknown>
    await expect(execute({ prompt: 'hi' }, { signal: new AbortController().signal })).rejects.toThrow(/calling agent/)
  })
})

  it('registers dsh_bot_send and returns accepted before wait', async () => {
    const { defs, dshBot } = register()
    dshBot.sendToPeer.mockResolvedValue({ ok: true, accepted: true, sessionId: 'peer-1' })
    const value = await run(defs.get('dsh_bot_send')!, { toBot: 'shiren-xiaobei', text: '封面用深蓝' })
    expect(dshBot.sendToPeer).toHaveBeenCalledWith({
      toBot: 'shiren-xiaobei',
      text: '封面用深蓝',
      fromSessionId: 'caller',
    })
    expect(value).toEqual({ accepted: true, session_id: 'peer-1' })
  })

  it('fails dsh_bot_send on host rejection', async () => {
    const { defs, dshBot } = register()
    dshBot.sendToPeer.mockResolvedValue({ ok: false, error: 'cannot-send-to-self' })
    await expect(run(defs.get('dsh_bot_send')!, { toBot: 'shiren-xiaobei', text: 'x' })).rejects.toThrow(/cannot-send-to-self/)
  })

