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
