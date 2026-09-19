/**
 * Memory drawer: profile / log / note, forget, clear (BR-804).
 */
import { useState } from 'react'
import type { MemoryListValue, MemoryLogRow, MemoryProfileRow } from './api.ts'

export const MEMORY_EMPTY = '还没记住什么。每轮后自动抽取，寒暄不记。'

export interface MemoryPanelProps {
  readonly open: boolean
  readonly botName: string
  readonly data: MemoryListValue | null
  readonly unavailable?: boolean
  readonly onClose: () => void
  readonly onForget: (id: string) => Promise<boolean>
  readonly onClear: () => Promise<boolean>
}

function sourceLabel(source: 'auto' | 'explicit' | undefined): string {
  return source === 'explicit' ? '你标记的' : '自动'
}

function when(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return ''
  try {
    return new Date(ts).toLocaleString()
  } catch {
    return ''
  }
}

/**
 * Three-section memory list with forget + confirmed clear.
 */
export function MemoryPanel(props: MemoryPanelProps) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set())
  const [confirmClear, setConfirmClear] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  if (!props.open) return null

  const visible = (id: string): boolean => !hidden.has(id)
  const profile = (props.data?.profile ?? []).filter(row => visible(row.id))
  const logs = (props.data?.log ?? []).filter(row => row.kind === 'log' && visible(row.id))
  const notes = (props.data?.log ?? []).filter(row => row.kind === 'note' && visible(row.id))
  const empty = profile.length === 0 && logs.length === 0 && notes.length === 0

  const forget = async (id: string): Promise<void> => {
    setHidden(current => new Set([...current, id]))
    const ok = await props.onForget(id)
    if (!ok) {
      setHidden(current => new Set([...current].filter(row => row !== id)))
      setToast('忘记失败')
    }
  }

  const clear = async (): Promise<void> => {
    setClearing(true)
    const ok = await props.onClear()
    setClearing(false)
    setConfirmClear(false)
    if (!ok) setToast('清空失败')
  }

  return (
    <div className="memoryPanel" data-testid="memory-panel">
      <header className="memoryPanelHead">
        <strong>记忆 · {props.botName}</strong>
        <button type="button" className="ghostBtn isTiny" data-testid="memory-close" onClick={props.onClose}>
          关闭
        </button>
      </header>
      {props.unavailable === true ? (
        <p className="formError" data-testid="memory-unavailable">记忆暂不可用</p>
      ) : empty ? (
        <p className="hint" data-testid="memory-empty">{MEMORY_EMPTY}</p>
      ) : (
        <>
          <MemorySection title="关于用户" testId="memory-profile" rows={profile} onForget={forget} />
          <MemorySection title="日志" testId="memory-log" rows={logs} onForget={forget} />
          <MemorySection title="备注" testId="memory-note" rows={notes} onForget={forget} />
        </>
      )}
      {toast !== null ? <p className="formError" data-testid="memory-toast">{toast}</p> : null}
      <footer className="memoryPanelFoot">
        {confirmClear ? (
          <div className="memoryConfirm" data-testid="memory-clear-confirm">
            <span>清空全部记忆？不可恢复。</span>
            <button type="button" className="dangerBtn isTiny" data-testid="memory-clear-yes" disabled={clearing} onClick={() => { void clear() }}>
              确认清空
            </button>
            <button type="button" className="ghostBtn isTiny" data-testid="memory-clear-no" onClick={() => setConfirmClear(false)}>
              取消
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="ghostBtn isTiny"
            data-testid="memory-clear"
            disabled={empty || props.unavailable === true}
            onClick={() => setConfirmClear(true)}
          >
            清空全部
          </button>
        )}
      </footer>
    </div>
  )
}

function MemorySection(props: {
  title: string
  testId: string
  rows: readonly (MemoryProfileRow | MemoryLogRow)[]
  onForget: (id: string) => Promise<void>
}) {
  if (props.rows.length === 0) return null
  return (
    <section className="memorySection" data-testid={props.testId}>
      <h3>{props.title}</h3>
      <ul>
        {props.rows.map(row => (
          <li key={row.id} data-testid={`memory-row-${row.id}`}>
            <div className="memoryRowText">{row.text}</div>
            <div className="memoryRowMeta">
              <span>{sourceLabel('source' in row ? row.source : 'auto')}</span>
              <span>{when(row.ts)}</span>
              <button
                type="button"
                className="ghostBtn isTiny"
                data-testid={`memory-forget-${row.id}`}
                onClick={() => { void props.onForget(row.id) }}
              >
                忘记
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
