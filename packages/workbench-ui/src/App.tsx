/**
 * Workbench shell: 280px roster + conversation stage (reference-ui-notes §A).
 * P0 is an empty/error skeleton; roster rows arrive in Task 6.
 */
import { useCallback, useEffect, useState } from 'react'
import { workbenchCall } from './api.ts'

type ShellStatus = 'loading' | 'idle' | 'error'

/**
 * Root layout. Probes v1 `listSessions` so iframe same-origin fetch is
 * exercised before listBots exists (ASM-203 / Task 1).
 */
export function App() {
  const [status, setStatus] = useState<ShellStatus>('loading')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (): Promise<void> => {
    setStatus('loading')
    setError(null)
    const outcome = await workbenchCall('listSessions', {})
    if (!outcome.ok) {
      setStatus('error')
      setError(outcome.error.message)
      return
    }
    setStatus('idle')
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div
      className="shell"
      data-testid="workbench-shell"
      data-roster="roster"
      data-status={status}
    >
      <aside className="roster" data-testid="workbench-roster">
        <div className="rosterHead">人设</div>
        <div className="rosterBody">
          {status === 'loading' ? (
            <p className="hint" data-testid="workbench-loading">加载中…</p>
          ) : status === 'error' ? (
            <div className="stateBox" data-testid="workbench-error">
              <p className="errorText">无法加载工作台</p>
              <p className="hint">{error}</p>
              <button type="button" className="retry" data-testid="workbench-retry" onClick={() => { void load() }}>
                重试
              </button>
            </div>
          ) : (
            <div className="stateBox" data-testid="workbench-empty">
              <p className="hint">还没有人设</p>
            </div>
          )}
        </div>
      </aside>
      <main className="conversation" data-testid="workbench-conversation">
        <header className="conversationHead">对话</header>
        <div className="conversationBody">
          <p className="hint">选择人设后在这里对话</p>
        </div>
      </main>
    </div>
  )
}
