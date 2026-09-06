/**
 * Model-facing `dsh_bot_ask` over `ctx.dshBot`. Render intent is `generic`
 * with no `locations` (session-tool zero-special-case convention).
 * @module tool-dsh-bot
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView, ToolExecution } from '@deepseek-ai/dsh-tools'
import type { SessionToolCaller } from 'session-tool'
import { DshBotError } from 'dsh-bot-host'

export const name = 'tool-dsh-bot'
export const inject = ['tools', 'dshBot']

/**
 * Resolve the calling agent identity for the session-tool fence.
 * @param exec - the tool execution context.
 */
function callerOf(exec: ToolExecution): SessionToolCaller {
  const agent = exec.agent
  if (agent === undefined) {
    throw new Error('dsh_bot_ask requires a calling agent (exec.agent was undefined)')
  }
  return {
    kind: 'agent',
    sessionId: agent.id,
    delegationDepth: agent.session.header.delegationDepth ?? 0,
  }
}

function askCard(title: string, rawInput?: unknown): GenericCallView {
  return { card: 'generic', title, kind: 'execute', ...rawInput !== undefined ? { rawInput } : {} }
}

/**
 * Register `dsh_bot_ask`.
 */
export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'dsh_bot_ask',
    description:
      'Ask DSH Bot a question in a hidden delegated session and return its final answer. '
      + 'Use this to consult DSH Bot without cluttering the official session rail. '
      + '`prompt` is the question; optional `title` is a short summary for the hidden session.',
    parameters: {
      prompt: {
        type: 'string',
        required: true,
        description: 'Non-empty question to send to DSH Bot.',
      },
      title: {
        type: 'string',
        description: 'Optional short summary used in the hidden session title.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          session_id: { type: 'string', required: true },
          answer: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.answer,
      }],
    },
    async execute(args, exec) {
      try {
        const result = await ctx.dshBot.askBot(callerOf(exec), {
          prompt: args.prompt,
          ...args.title === undefined ? {} : { title: args.title },
        })
        return {
          session_id: String(result.sessionId),
          answer: result.answer,
        }
      } catch (error) {
        if (error instanceof DshBotError) {
          throw new Error(
            `${error.code}: ${error.message}`
            + (error.sessionId === undefined ? '' : ` (session ${error.sessionId})`),
            { cause: error },
          )
        }
        throw error
      }
    },
    presentCall: args => askCard('Ask DSH Bot', args.title ?? args.prompt),
  }))

  ctx.tools.register(defineTool({
    name: 'dsh_bot_send',
    description:
      'Send an asynchronous note to another DSH Bot on this user roster. '
      + 'Returns immediately as accepted; does not wait for the recipient to finish speaking. '
      + '`toBot` is the recipient bot id; `text` is the note.',
    parameters: {
      toBot: {
        type: 'string',
        required: true,
        description: 'Recipient bot id from this user roster. Cannot be yourself.',
      },
      text: {
        type: 'string',
        required: true,
        description: 'Non-empty note to deliver.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          accepted: { type: 'boolean', required: true },
          session_id: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.accepted === true ? 'accepted' : 'failed',
      }],
    },
    async execute(args, exec) {
      try {
        const result = await ctx.dshBot.sendToPeer({
          toBot: args.toBot,
          text: args.text,
          ...exec.agent === undefined ? {} : { fromSessionId: exec.agent.id },
        })
        if (!result.ok) {
          throw new Error(result.error)
        }
        return { accepted: true, session_id: result.sessionId }
      } catch (error) {
        if (error instanceof DshBotError) {
          throw new Error(
            `${error.code}: ${error.message}`
            + (error.sessionId === undefined ? '' : ` (session ${error.sessionId})`),
            { cause: error },
          )
        }
        throw error
      }
    },
    presentCall: args => askCard('Send DSH Bot', args.toBot),
  }))
}
