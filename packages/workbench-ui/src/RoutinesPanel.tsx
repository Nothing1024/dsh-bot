import { useEffect, useRef, useState } from 'react'
import type { RoutineRow, RpcResult } from './api.ts'

export const ROUTINES_EMPTY = '没有例程。到点它会自己醒来，有事才说。'
type Preview = { schedule: string; timeZone: string; nextRunAt: number }

export interface RoutinesPanelProps {
  readonly open: boolean
  readonly botId: string
  readonly botName: string
  readonly rows: readonly RoutineRow[]
  readonly onClose: () => void
  readonly onPreview?: (schedule: string) => Promise<RpcResult<Preview>>
  readonly onCreate: (input: { name: string; schedule: string; instruction: string; notify: boolean }) => Promise<boolean>
  readonly onToggle: (id: string, enabled: boolean) => Promise<boolean>
  readonly onDelete: (id: string) => Promise<boolean>
}

const outcomes = { spoke: '有新消息', silent: '没有新情况', error: '执行失败' }
function when(ts: number, timeZone?: string): string {
  return new Date(ts).toLocaleString('zh-CN', { ...(timeZone ? { timeZone } : {}), hour12: false })
}
function zoneOf(schedule: string): string {
  return schedule.match(/^CRON_TZ=(\S+)\s/u)?.[1] ?? 'UTC'
}

export function RoutinesPanel(props: RoutinesPanelProps) {
  const [name, setName] = useState('')
  const [preset, setPreset] = useState('daily')
  const [clock, setClock] = useState('09:00')
  const [timeZone, setTimeZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone)
  const [minutes, setMinutes] = useState('60')
  const [custom, setCustom] = useState('@daily')
  const [instruction, setInstruction] = useState('')
  const [notify, setNotify] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [hour, minute] = clock.split(':').map(Number)
  const schedule = preset === 'daily' ? `CRON_TZ=${timeZone.trim()} ${minute} ${hour} * * *`
    : preset === 'hourly' ? `CRON_TZ=${timeZone.trim()} @hourly`
    : preset === 'interval' ? `@every ${minutes}m` : custom.trim()

  useEffect(() => {
    if (!props.open || props.onPreview === undefined) return
    let cancelled = false
    setPreview(null)
    setPreviewError(null)
    const timer = setTimeout(() => {
      void props.onPreview!(schedule).then(result => {
        if (cancelled) return
        if (result.ok) setPreview(result.value)
        else setPreviewError(result.error.message)
      }).catch(error => {
        if (!cancelled) setPreviewError(String(error))
      })
    }, 200)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [props.open, props.onPreview, schedule])

  if (!props.open) return null

  const act = async (action: () => Promise<boolean>, failure: string): Promise<boolean> => {
    if (busyRef.current) return false
    busyRef.current = true
    setBusy(true)
    setError(null)
    try {
      const ok = await action()
      if (!ok) setError(failure)
      return ok
    } catch (error) {
      setError(`${failure}：${String(error)}`)
      return false
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }
  const previewReady = props.onPreview === undefined || preview?.schedule === schedule
  const submit = async (): Promise<void> => {
    if (!name.trim() || !instruction.trim() || !previewReady) return
    if (await act(() => props.onCreate({ name: name.trim(), schedule, instruction: instruction.trim(), notify }), '创建失败，请重试')) {
      setName('')
      setInstruction('')
    }
  }

  return (
    <div className="memoryPanel routinesPanel" data-testid="routines-panel">
      <header className="memoryPanelHead">
        <strong>例程 · {props.botName}</strong>
        <button type="button" className="ghostBtn isTiny" data-testid="routines-close" aria-label="关闭例程" onClick={props.onClose}>关闭</button>
      </header>
      {props.rows.length === 0 ? <p className="hint" data-testid="routines-empty">{ROUTINES_EMPTY}</p> : (
        <ul className="routinesList" data-testid="routines-list">
          {props.rows.map(row => (
            <li key={row.id} data-testid={`routine-row-${row.id}`}>
              <div className="memoryRowText">{row.name}</div>
              <div className="memoryRowMeta">{row.schedule} · 时区：{zoneOf(row.schedule)}</div>
              <div className="memoryRowMeta">
                {!row.enabled ? '已暂停' : row.nextRunAt === undefined ? '下次执行时间暂不可用' : `下次：${when(row.nextRunAt, zoneOf(row.schedule))}`}
              </div>
              <div className="memoryRowMeta">
                <span>{row.lastRunAt === undefined ? '上次：还没有运行' : `上次：${when(row.lastRunAt)} · ${row.lastOutcome ? outcomes[row.lastOutcome] : ''}`}</span>
                <button type="button" className="ghostBtn isTiny" disabled={busy} data-testid={`routine-toggle-${row.id}`}
                  onClick={() => { void act(() => props.onToggle(row.id, !row.enabled), '切换失败，请重试') }}>
                  {row.enabled ? '暂停' : '启用'}
                </button>
                {confirmId === row.id ? <>
                  <button type="button" className="dangerBtn isTiny" disabled={busy} data-testid={`routine-delete-yes-${row.id}`}
                    onClick={() => { void act(() => props.onDelete(row.id), '删除失败，请重试').then(ok => { if (ok) setConfirmId(null) }) }}>确认删除</button>
                  <button type="button" className="ghostBtn isTiny" onClick={() => setConfirmId(null)}>取消</button>
                </> : <button type="button" className="ghostBtn isTiny" disabled={busy} data-testid={`routine-delete-${row.id}`} onClick={() => setConfirmId(row.id)}>删除</button>}
              </div>
              {(row.runs?.length ?? 0) > 0 ? <details>
                <summary>最近执行记录</summary>
                <ul>{row.runs?.slice(-5).reverse().map((run, index) => <li key={index}>{when(run.ts)} · {outcomes[run.outcome]} · {(run.ms / 1000).toFixed(1)} 秒</li>)}</ul>
              </details> : null}
            </li>
          ))}
        </ul>
      )}
      <form className="routinesForm" data-testid="routines-form" onSubmit={event => { event.preventDefault(); void submit() }}>
        <label>名称<input data-testid="routine-name" required value={name} disabled={busy} placeholder="例如：每日进度检查" onChange={event => setName(event.target.value)} /></label>
        <label>重复方式
          <select data-testid="routine-schedule-preset" value={preset} disabled={busy} onChange={event => setPreset(event.target.value)}>
            <option value="daily">每天</option><option value="hourly">每小时整点</option><option value="interval">间隔分钟</option><option value="custom">高级时间表达式</option>
          </select>
        </label>
        {preset === 'daily' ? <label>执行时间<input type="time" required data-testid="routine-clock" value={clock} disabled={busy} onChange={event => setClock(event.target.value)} /></label> : null}
        {preset === 'daily' || preset === 'hourly' ? <label>时区<input data-testid="routine-timezone" required value={timeZone} disabled={busy} onChange={event => setTimeZone(event.target.value)} /></label> : null}
        {preset === 'interval' ? <label>间隔分钟<input type="number" min="1" required value={minutes} disabled={busy} onChange={event => setMinutes(event.target.value)} /></label> : null}
        {preset === 'custom' ? <label>时间表达式<input data-testid="routine-schedule" value={custom} disabled={busy} onChange={event => setCustom(event.target.value)} /><span className="hint">未指定 CRON_TZ 时按 UTC；例如 CRON_TZ=Asia/Shanghai 0 9 * * *</span></label> : null}
        {props.onPreview !== undefined ? <p className={previewError ? 'formError' : 'hint'} data-testid="routine-preview" aria-live="polite">
          {previewError ?? (preview?.schedule === schedule ? `下次：${when(preview.nextRunAt, preview.timeZone)} · ${preview.timeZone}` : '正在核对执行时间…')}
        </p> : null}
        <label>指令<textarea data-testid="routine-instruction" required disabled={busy} value={instruction} placeholder="到点需要检查什么，什么情况下通知你" onChange={event => setInstruction(event.target.value)} /></label>
        <label className="routinesNotify"><input type="checkbox" data-testid="routine-notify" checked={notify} disabled={busy} onChange={event => setNotify(event.target.checked)} />有输出时通知</label>
        {error !== null ? <p className="formError" data-testid="routines-error" role="alert">{error}</p> : null}
        <div className="formActions"><button type="submit" className="primaryBtn" data-testid="routine-create" disabled={busy || !name.trim() || !instruction.trim() || !previewReady}>新建</button></div>
      </form>
    </div>
  )
}
