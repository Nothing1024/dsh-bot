import { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionToolCaller, SessionToolService } from 'session-tool'
import { invalidateMarks } from './marks-cache.ts'
import type { DshBotPlatform } from './platform.ts'

export interface HideBotSessionOptions {
  /** Default true: delegated / auxiliary rows. Workbench 1:1 chats pass false. */
  readonly syncToArchived?: boolean
}

export async function hideBotSession(
  sessionTool: SessionToolService,
  platform: Pick<DshBotPlatform, 'archiveSession'>,
  sessionId: string,
  caller: SessionToolCaller = { kind: 'cli' },
  options: HideBotSessionOptions = {},
): Promise<void> {
  const syncToArchived = options.syncToArchived !== false
  let visibility
  try {
    visibility = await sessionTool.hide(caller, SessionId(sessionId), { syncToArchived })
  } finally {
    invalidateMarks()
  }
  if (syncToArchived && !visibility.archived) await platform.archiveSession(sessionId)
}
