/**
 * Workbench shell: 280px roster + conversation stage (reference-ui-notes §A).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createBot,
  deleteBot,
  listBots,
  listSessionsModel,
  updateBot,
} from './api.ts'
import type { WorkbenchBot, WorkbenchBotModelInfo, WorkbenchModelOverride } from './api.ts'
import { hashAvatarColor, nameInitial, rowPreview } from './avatar.ts'
import { BotForm } from './BotForm.tsx'
import type { BotFormValues } from './BotForm.tsx'
import { Roster } from './Roster.tsx'
import type { RosterItem } from './Roster.tsx'

type ShellStatus = 'loading' | 'idle' | 'error'
type FormMode = { kind: 'create' } | { kind: 'edit'; bot: WorkbenchBot }

function overrideFromForm(values: BotFormValues): WorkbenchModelOverride | undefined {
  const provider = values.provider.trim()
  const model = values.model.trim()
  if (provider === '' && model === '') return undefined
  return { provider, model }
}

/**
 * Root layout. Loads listBots; conversation identity follows the selected row.
 */
export function App() {
  const [status, setStatus] = useState<ShellStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const [bots, setBots] = useState<readonly WorkbenchBot[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [lastMessages] = useState<Record<string, string>>({})
  const [workingIds] = useState<ReadonlySet<string>>(() => new Set())
  const [form, setForm] = useState<FormMode | null>(null)
  const [formBusy, setFormBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [effectHint, setEffectHint] = useState<string | null>(null)
  const [botModel, setBotModel] = useState<WorkbenchBotModelInfo | null>(null)
  const submitLock = useRef(false)

  const load = useCallback(async (): Promise<void> => {
    setStatus('loading')
    setError(null)
    const [botsOutcome, modelOutcome] = await Promise.all([
      listBots(),
      listSessionsModel(),
    ])
    if (!botsOutcome.ok) {
      setStatus('error')
      setError(botsOutcome.error.message)
      return
    }
    const rows = botsOutcome.value.bots
    setBots(rows)
    setSelectedId(current => {
      if (current !== null && rows.some(row => row.id === current)) return current
      return rows[0]?.id ?? null
    })
    if (modelOutcome.ok) setBotModel(modelOutcome.value.botModel)
    setStatus('idle')
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const selected = useMemo(
    () => bots.find(bot => bot.id === selectedId) ?? null,
    [bots, selectedId],
  )

  const items: readonly RosterItem[] = useMemo(() => bots.map(bot => ({
    id: bot.id,
    name: bot.name,
    avatar: bot.avatar,
    preview: rowPreview(drafts[bot.id], lastMessages[bot.id]),
    updatedAt: bot.createdAt,
    working: workingIds.has(bot.id),
    selected: bot.id === selectedId,
    protected: bot.protected,
  })), [bots, drafts, lastMessages, selectedId, workingIds])

  const submitForm = async (values: BotFormValues): Promise<void> => {
    if (submitLock.current || form === null) return
    submitLock.current = true
    setFormBusy(true)
    setFormError(null)
    const avatar = {
      ...values.emoji.trim() === '' ? {} : { emoji: values.emoji.trim() },
      ...values.color.trim() === '' ? {} : { color: values.color.trim() },
    }
    const modelOverride = overrideFromForm(values)
    try {
      if (form.kind === 'create') {
        const outcome = await createBot({
          name: values.name,
          persona: values.persona,
          ...Object.keys(avatar).length === 0 ? {} : { avatar },
          ...modelOverride === undefined ? {} : { modelOverride },
        })
        if (!outcome.ok) {
          setFormError(outcome.error.message)
          return
        }
        setBots(current => {
          const without = current.filter(row => row.id !== outcome.value.id)
          return [...without, outcome.value]
        })
        setSelectedId(outcome.value.id)
        setForm(null)
        setEffectHint(null)
        return
      }
      const outcome = await updateBot({
        id: form.bot.id,
        name: values.name,
        persona: values.persona,
        ...Object.keys(avatar).length === 0 ? {} : { avatar },
        modelOverride: modelOverride ?? null,
      })
      if (!outcome.ok) {
        setFormError(outcome.error.message)
        return
      }
      setBots(current => current.map(row => row.id === outcome.value.id ? outcome.value : row))
      setForm(null)
      setEffectHint('人设对之后的新对话生效')
    } finally {
      submitLock.current = false
      setFormBusy(false)
    }
  }

  const renameBot = async (id: string, name: string): Promise<void> => {
    const outcome = await updateBot({ id, name })
    if (!outcome.ok) {
      setActionError(outcome.error.message)
      return
    }
    setActionError(null)
    setBots(current => current.map(row => row.id === outcome.value.id ? outcome.value : row))
  }

  const removeBot = async (id: string): Promise<void> => {
    const outcome = await deleteBot(id)
    if (!outcome.ok) {
      setActionError(outcome.error.message)
      return
    }
    setActionError(null)
    setBots(current => current.filter(row => row.id !== id))
    setSelectedId(current => current === id ? (bots.find(row => row.id !== id)?.id ?? null) : current)
    setEffectHint(null)
    setDrafts(current => {
      const next = { ...current }
      delete next[id]
      return next
    })
    if (form?.kind === 'edit' && form.bot.id === id) setForm(null)
  }

  return (
    <div
      className="shell"
      data-testid="workbench-shell"
      data-roster="roster"
      data-status={status}
    >
      {status === 'loading' ? (
        <>
          <aside className="roster" data-testid="workbench-roster">
            <div className="rosterHead">人设</div>
            <div className="rosterBody">
              <p className="hint" data-testid="workbench-loading">加载中…</p>
            </div>
          </aside>
          <main className="conversation" data-testid="workbench-conversation">
            <header className="conversationHead">对话</header>
            <div className="conversationBody">
              <p className="hint">选择人设后在这里对话</p>
            </div>
          </main>
        </>
      ) : status === 'error' ? (
        <>
          <aside className="roster" data-testid="workbench-roster">
            <div className="rosterHead">人设</div>
            <div className="rosterBody">
              <div className="stateBox" data-testid="workbench-error">
                <p className="errorText">无法加载工作台</p>
                <p className="hint">{error}</p>
                <button type="button" className="retry" data-testid="workbench-retry" onClick={() => { void load() }}>
                  重试
                </button>
              </div>
            </div>
          </aside>
          <main className="conversation" data-testid="workbench-conversation">
            <header className="conversationHead">对话</header>
            <div className="conversationBody">
              <p className="hint">网关不可达时不会白屏，修好后点重试。</p>
            </div>
          </main>
        </>
      ) : (
        <>
          <Roster
            items={items}
            error={actionError}
            onSelect={id => {
              setSelectedId(id)
              setForm(null)
              setEffectHint(null)
              setActionError(null)
            }}
            onCreate={() => {
              setFormError(null)
              setActionError(null)
              setEffectHint(null)
              setForm({ kind: 'create' })
            }}
            onEdit={id => {
              const bot = bots.find(row => row.id === id)
              if (bot === undefined) return
              setFormError(null)
              setEffectHint(null)
              setForm({ kind: 'edit', bot })
              setSelectedId(id)
            }}
            onDelete={id => { void removeBot(id) }}
            onRename={(id, name) => { void renameBot(id, name) }}
          />
          <main className="conversation" data-testid="workbench-conversation">
            {form !== null ? (
              <BotForm
                key={form.kind === 'create' ? 'create' : form.bot.id}
                mode={form.kind}
                {...form.kind === 'edit' ? { initial: form.bot } : {}}
                botModel={botModel}
                busy={formBusy}
                error={formError}
                hint={form.kind === 'edit' ? '人设对之后的新对话生效' : null}
                onCancel={() => {
                  if (formBusy) return
                  setForm(null)
                }}
                onSubmit={values => { void submitForm(values) }}
              />
            ) : (
              <>
                <header className="conversationHead">
                  {selected === null ? (
                    <span>对话</span>
                  ) : (
                    <span className="identity" data-testid="conversation-identity">
                      <span className="avatar sm" style={{ background: selected.avatar.color || hashAvatarColor(selected.id) }}>
                        {selected.avatar.emoji !== undefined && selected.avatar.emoji !== ''
                          ? selected.avatar.emoji
                          : nameInitial(selected.name)}
                      </span>
                      <span>{selected.name}</span>
                    </span>
                  )}
                </header>
                <div className="conversationBody">
                  {effectHint !== null ? (
                    <p className="formHint" data-testid="take-effect-hint">{effectHint}</p>
                  ) : null}
                  <p className="hint">
                    {selected === null ? '选择人设后在这里对话' : `给 ${selected.name} 发消息`}
                  </p>
                </div>
              </>
            )}
          </main>
        </>
      )}
    </div>
  )
}
