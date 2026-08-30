/**
 * Loud failures for the dsh-bot host seam. Never used to swallow an empty
 * answer or a silent global-model fallback (BR-007 / BR-010).
 * @module dsh-bot-host/errors
 */

/** Stable machine codes returned by {@link DshBotError}. */
export type DshBotErrorCode =
  | 'web-unreachable'
  | 'wait-timeout'
  | 'empty-answer'
  | 'session-failed'
  | 'missing-credential'
  | 'override-invalid'
  | 'override-unavailable'
  | 'override-restore-failed'
  | 'archive-failed'
  | 'archive-unavailable'
  | 'empty-prompt'
  | 'invalid-input'
  | 'bot-not-found'
  | 'bot-protected'
  | 'group-not-found'
  | 'preset-broken'
  | 'registry-corrupt'
  | 'internal'

/**
 * Typed failure for askBot / createSession. `code` is the stable wire value;
 * `sessionId` is attached when a bot session already exists.
 */
export class DshBotError extends Error {
  override readonly name = 'DshBotError'
  readonly code: DshBotErrorCode
  readonly sessionId?: string

  constructor(code: DshBotErrorCode, message: string, options?: ErrorOptions & { sessionId?: string }) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause })
    this.code = code
    if (options?.sessionId !== undefined) this.sessionId = options.sessionId
  }
}
