/**
 * Browser HTTP RPC against `/dsh-bot/<method>` with `{args}` (v1 rpc.ts wire).
 */

export interface WorkbenchWireError {
  readonly code?: string
  readonly message: string
}

interface RpcOk<T> { ok: true; value: T }
interface RpcFail { ok: false; error: WorkbenchWireError }
export type RpcResult<T> = RpcOk<T> | RpcFail

/**
 * POST `/dsh-bot/<method>` with `{args}` and unwrap `{ok,value|error}`.
 */
export async function workbenchCall<T>(
  method: string,
  args: Record<string, unknown> = {},
): Promise<RpcResult<T>> {
  let response: Response
  try {
    response = await fetch(`/dsh-bot/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ args }),
    })
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'unavailable',
        message: error instanceof Error ? error.message : String(error),
      },
    }
  }
  let json: unknown
  try {
    json = await response.json()
  } catch {
    return { ok: false, error: { code: 'internal', message: `dsh-bot RPC ${method} returned non-JSON` } }
  }
  if (typeof json !== 'object' || json === null) {
    return { ok: false, error: { code: 'internal', message: `dsh-bot RPC ${method} returned an empty body` } }
  }
  const body = json as { ok?: boolean; error?: WorkbenchWireError; value?: T }
  if (body.ok === false) {
    return { ok: false, error: body.error ?? { message: `${method} failed` } }
  }
  return { ok: true, value: body.value as T }
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
  readonly id: string
  readonly name: string
  readonly avatar: WorkbenchBotAvatar
  readonly presetId: string
  readonly modelOverride?: WorkbenchModelOverride
  readonly createdAt: number
  readonly persona: string
  readonly protected: boolean
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

export function listBots(): Promise<RpcResult<ListBotsValue>> {
  return workbenchCall<ListBotsValue>('listBots', {})
}

export function createBot(args: CreateBotArgs): Promise<RpcResult<WorkbenchBot>> {
  return workbenchCall<WorkbenchBot>('createBot', { ...args })
}

export function updateBot(args: UpdateBotArgs): Promise<RpcResult<WorkbenchBot>> {
  const body: Record<string, unknown> = { id: args.id }
  if (args.name !== undefined) body.name = args.name
  if (args.persona !== undefined) body.persona = args.persona
  if (args.avatar !== undefined) body.avatar = args.avatar
  if (args.modelOverride !== undefined) body.modelOverride = args.modelOverride
  return workbenchCall<WorkbenchBot>('updateBot', body)
}

export function deleteBot(id: string): Promise<RpcResult<{ id: string; deleted: true }>> {
  return workbenchCall('deleteBot', { id })
}

export interface WorkbenchBotModelInfo {
  readonly provider: string
  readonly model: string
  readonly source: 'override' | 'global-default'
}

export function listSessionsModel(): Promise<RpcResult<{ botModel: WorkbenchBotModelInfo }>> {
  return workbenchCall('listSessions', {})
}
