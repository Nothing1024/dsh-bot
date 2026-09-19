/**
 * Routines list + create form (BR-905).
 */
import { useState } from 'react'
import type { RoutineRow } from './api.ts'

export const ROUTINES_EMPTY = '没有例程。到点它会自己醒来，有事才说。'

export interface RoutinesPanelProps {
  readonly open: boolean
  readonly botId: string
  readonly botName: string
  readonly rows: readonly RoutineRow[]
  readonly onClose: () => void
  readonly onCreate: (input: { name: string; schedule: string; instruction: string; notify: boolean }) => Promise<boolean>
  readonly onToggle: (id: string, enabled: boolean) => Promise<boolean>
  readonly onDelete: (id: string) => Promise<boolean>
}

function lastLabel(row: RoutineRow): string {
  if (row.lastRunAt === undefined) return '上次：还没有跑过'
  const when = new Date(row.lastRunAt).toLocaleString()
  return `上次：${when} ${row.lastOutcome ?? ''}`
}

export function RoutinesPanel(props: RoutinesPanelProps) {
  const [name, setName] = useState('报时')
  const [schedule, setSchedule] = useState('@every 1m')
  const [instruction, setInstruction] = useState('报告当前时间，一句话')
  const [notify, setNotify] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  if (!props.open) return null

  const submit = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    const ok = await props.onCreate({ name, schedule, instruction, notify })
    setBusy(false)
    if (!ok) setError('时间文本不合法，或创建失败')
  }

  return (
    <div className="memoryPanel routinesPanel" data-testid="routines-panel">
      <header className="memoryPanelHead">
        <strong>例程 · {props.botName}</strong>
        <button type="button" className="ghostBtn isTiny" data-testid="routines-close" onClick={props.onClose}>
          关闭
        </button>
      </header>
      {props.rows.length === 0 ? (
        <p className="hint" data-testid="routines-empty">{ROUTINES_EMPTY}</p>
      ) : (
        <ul className="routinesList" data-testid="routines-list">
          {props.rows.map(row => (
            <li key={row.id} data-testid={`routine-row-${row.id}`}>
              <div className="memoryRowText">{row.name} · {row.schedule}</div>
              <div className="memoryRowMeta">
                <span>{lastLabel(row)}</span>
                <button
                  type="button"
                  className="ghostBtn isTiny"
                  data-testid={`routine-toggle-${row.id}`}
                  onClick={() => { void props.onToggle(row.id, !row.enabled) }}
                >
                  {row.enabled ? '开' : '关'}
                </button>
                {confirmId === row.id ? (
                  <>
                    <button type="button" className="dangerBtn isTiny" data-testid={`routine-delete-yes-${row.id}`} onClick={() => { void props.onDelete(row.id) }}>
                      确认删除
                    </button>
                    <button type="button" className="ghostBtn isTiny" onClick={() => setConfirmId(null)}>取消</button>
                  </>
                ) : (
                  <button type="button" className="ghostBtn isTiny" data-testid={`routine-delete-${row.id}`} onClick={() => setConfirmId(row.id)}>
                    删除
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <form
        className="routinesForm"
        data-testid="routines-form"
        onSubmit={event => {
          event.preventDefault()
          void submit()
        }}
      >
        <label>
          名称
          <input data-testid="routine-name" value={name} onChange={event => setName(event.target.value)} />
        </label>
        <label>
          时间
          <select data-testid="routine-schedule-preset" value={schedule} onChange={event => setSchedule(event.target.value)}>
            <option value="@every 1m">每分钟</option>
            <option value="@hourly">每小时</option>
            <option value="@daily">每天</option>
          </select>
          <input data-testid="routine-schedule" value={schedule} onChange={event => setSchedule(event.target.value)} />
        </label>
        <label>
          指令
          <textarea data-testid="routine-instruction" value={instruction} onChange={event => setInstruction(event.target.value)} />
        </label>
        <label className="routinesNotify">
          <input
            type="checkbox"
            data-testid="routine-notify"
            checked={notify}
            onChange={event => setNotify(event.target.checked)}
          />
          有输出时通知
        </label>
        {error !== null ? <p className="formError" data-testid="routines-error">{error}</p> : null}
        <div className="formActions">
          <button type="submit" className="primaryBtn" data-testid="routine-create" disabled={busy}>
            新建
          </button>
        </div>
      </form>
    </div>
  )
}
