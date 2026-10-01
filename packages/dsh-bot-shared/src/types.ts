/**
 * RPC value types shared by the iframe workbench and the left-rail roster.
 * Fetch wrappers stay in workbench-ui `api.ts`.
 */

export interface WorkbenchWireError {
  readonly code?: string
  readonly message: string
}

export interface WorkbenchBotAvatar {
  readonly color: string
  readonly emoji?: string
}

export interface WorkbenchModelOverride {
  readonly provider: string
  readonly model: string
  readonly reasoningEffort?: string
}

export interface WorkbenchBot {
  readonly unread?: number
  readonly declined?: readonly string[]
  readonly id: string
  readonly name: string
  readonly avatar: WorkbenchBotAvatar
  readonly presetId: string
  readonly modelOverride?: WorkbenchModelOverride
  readonly createdAt: number
  readonly persona: string
  readonly protected: boolean
  readonly pinned?: boolean
  readonly section?: string
  readonly hidden?: boolean
  readonly order?: number
  readonly muted?: boolean
}

export interface ListBotsValue {
  readonly bots: readonly WorkbenchBot[]
}

export interface CreateBotArgs {
  readonly name: string
  readonly persona: string
  readonly avatar?: { readonly emoji?: string; readonly color?: string }
  readonly modelOverride?: WorkbenchModelOverride
}

export interface UpdateBotArgs {
  readonly id: string
  readonly name?: string
  readonly persona?: string
  readonly avatar?: { readonly emoji?: string; readonly color?: string }
  readonly modelOverride?: WorkbenchModelOverride | null
}

export interface WorkbenchBotModelInfo {
  readonly provider: string
  readonly model: string
  readonly source: 'override' | 'global-default'
}

export interface WorkbenchSessionRow {
  readonly sessionId: string
  readonly title?: string
  readonly tags: readonly string[]
  readonly status: 'live' | 'idle'
  readonly createdAt: number
  readonly updatedAt: number
  readonly hidden: boolean
  readonly working: boolean
}

export interface ListBotSessionsValue {
  readonly sessions: readonly WorkbenchSessionRow[]
}

export interface CreateBotSessionValue {
  readonly sessionId: string
  readonly title: string
  readonly botId: string
  readonly presetId: string
}

export interface WorkbenchHistoryAuthor {
  readonly botId: string
  readonly name: string
  readonly avatar: { readonly color: string; readonly emoji?: string }
}

export interface WorkbenchHistoryItem {
  readonly cancelledAt?: number
  readonly roomId?: string
  readonly replyTo?: { readonly seq: number; readonly speaker: string; readonly text: string }
  readonly id: string
  readonly kind: 'message' | 'thinking' | 'tool' | 'propose-routine' | 'approval' | 'question' | 'system'
  readonly sessionId?: string
  readonly rpcId?: string
  readonly approvalId?: string
  readonly pending?: boolean
  readonly streaming?: boolean
  readonly schedule?: string
  readonly instruction?: string
  readonly origin?: 'routine'
  readonly seq: number
  readonly role?: 'user' | 'assistant'
  readonly text?: string
  readonly name?: string
  readonly summary?: string
  readonly author?: WorkbenchHistoryAuthor
  readonly error?: { readonly code: string; readonly message: string }
}

export interface HistoryValue {
  readonly sessionId: string
  readonly items: readonly WorkbenchHistoryItem[]
  readonly working: boolean
  readonly speaking?: { readonly botId: string; readonly name: string; readonly sessionId?: string; readonly afterSeq?: number; readonly afterSessionSeq?: number }
  readonly round?: number
  readonly rounds?: number
  /** Group room only: submissions waiting for the current discussion (in-memory, ≤3). */
  readonly queued?: readonly GroupQueuedItem[]
}

export interface GroupQueuedItem {
  readonly queueId: string
  readonly text: string
  readonly replyTo?: { readonly seq: number; readonly speaker: string; readonly text: string }
  readonly createdAt: number
}
export interface WorkbenchGroup {
  readonly id: string
  readonly name: string
  readonly memberIds: readonly string[]
  readonly createdAt: number
  readonly section?: string
  readonly order?: number
  readonly rounds: number
}

export interface ListGroupsValue {
  readonly groups: readonly WorkbenchGroup[]
}

export interface GroupRoomRow {
  readonly title?: string
  readonly roomId: string
  readonly groupId: string
  readonly createdAt: number
  readonly updatedAt: number
  /** True while this room has an active group round. */
  readonly working?: boolean
}

export interface MemoryProfileRow {
  readonly id: string
  readonly text: string
  readonly ts: number
}

export interface MemoryLogRow {
  readonly id: string
  readonly kind: 'log' | 'note'
  readonly text: string
  readonly ts: number
  readonly source: 'auto' | 'explicit'
  readonly sessionId?: string
}

export interface MemoryListValue {
  readonly profile: readonly MemoryProfileRow[]
  readonly log: readonly MemoryLogRow[]
}

export interface RoutineRow {
  readonly id: string
  readonly botId: string
  readonly name: string
  readonly schedule: string
  readonly instruction: string
  readonly enabled: boolean
  readonly notify: boolean
  readonly nextRunAt?: number
  readonly runs?: readonly { readonly ts: number; readonly outcome: 'spoke' | 'silent' | 'error'; readonly ms: number }[]
  readonly lastRunAt?: number
  readonly lastOutcome?: 'spoke' | 'silent' | 'error'
}

export interface PeerLogRow {
  readonly from: string
  readonly to: string
  readonly ts: number
  readonly sessionId: string
}

export interface RosterSection {
  readonly id: string
  readonly name: string
  readonly order: number
}

export interface UpdateBotLayoutInput {
  readonly bots?: readonly Partial<Pick<WorkbenchBot, 'id' | 'pinned' | 'section' | 'hidden' | 'order' | 'muted'>>[]
  readonly groups?: readonly { id: string; section?: string; order?: number }[]
  readonly sections?: readonly RosterSection[]
}

export interface UpdateBotLayoutValue {
  readonly ok: true
  readonly skipped: readonly string[]
  readonly sections: readonly RosterSection[]
}

/** Host `groups.ts` member bounds (BR-613). */
export const GROUP_MEMBER_MIN = 2
export const GROUP_MEMBER_MAX = 6

/** Host → iframe / left-rail → iframe group selection. */
export const SELECT_GROUP_MESSAGE_TYPE = 'dsh-bot:select-group' as const
