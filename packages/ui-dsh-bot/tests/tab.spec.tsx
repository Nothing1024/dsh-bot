// @vitest-environment jsdom
/**
 * DshBotTab states: loading, empty+CTA, error+retry, list jump, create guard.
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { DshBotTab, resolveCreateCwd } from '../src/client/DshBotTab.tsx'
import type { DshBotListState, IDshBotClient, RpcResult } from '../src/client/rpc.ts'

function client(state: Partial<DshBotListState>, extras: Partial<IDshBotClient> = {}): IDshBotClient {
  const snap: DshBotListState = {
    items: [],
    botModel: { provider: 'anthropic', model: 'grok-4.6', source: 'global-default' },
    state: 'idle',
    error: null,
    includeHidden: false,
    ...state,
  }
  return {
    list: {
      getSnapshot: () => snap,
      subscribe: () => () => undefined,
    },
    refresh: vi.fn(async () => undefined),
    setIncludeHidden: vi.fn(),
    setPanelOpen: vi.fn(),
    createSession: vi.fn(async () => ({ ok: true as const, value: { sessionId: 'session-new', title: 'DSH Bot' } })),
    dispose: vi.fn(),
    ...extras,
  }
}

describe('DshBotTab', () => {
  it('shows loading copy', () => {
    const view = render(<DshBotTab ctx={{ dshBot: client({ state: 'loading', botModel: null }) }} />)
    expect(screen.getByTestId('dsh-bot-loading').textContent).toMatch(/加载中/)
    view.unmount()
  })

  it('shows empty copy and a create CTA', () => {
    const view = render(<DshBotTab ctx={{ dshBot: client({ items: [], state: 'idle' }) }} />)
    expect(screen.getByTestId('dsh-bot-empty').textContent).toMatch(/还没有/)
    expect(screen.getByTestId('dsh-bot-new')).toBeTruthy()
    view.unmount()
  })

  it('shows error plus retry', () => {
    const dshBot = client({ state: 'error', error: { code: 'unavailable', message: 'down' }, botModel: null })
    const view = render(<DshBotTab ctx={{ dshBot }} />)
    expect(screen.getByTestId('dsh-bot-error')).toBeTruthy()
    fireEvent.click(screen.getByTestId('dsh-bot-retry'))
    expect(dshBot.refresh).toHaveBeenCalled()
    view.unmount()
  })

  it('lists title/time and jumps via sessions.open', () => {
    const open = vi.fn()
    const dshBot = client({
      items: [{
        sessionId: 'session-live',
        title: 'Plan',
        tags: ['kind:dsh-bot'],
        status: 'idle',
        createdAt: 1_700_000_000_000,
        hidden: false,
      }],
    })
    const view = render(<DshBotTab ctx={{ dshBot, sessions: { open } }} />)
    expect(screen.getByText('Plan')).toBeTruthy()
    fireEvent.click(screen.getByTestId('dsh-bot-row-session-live'))
    expect(open).toHaveBeenCalledWith('session-live')
    view.unmount()
  })

  it('sends the current session cwd when creating', async () => {
    const dshBot = client({ items: [] })
    const view = render(<DshBotTab ctx={{
      dshBot,
      sessions: {
        open: vi.fn(),
        list: {
          getSnapshot: () => ({
            current: 'session-cur',
            byId: { 'session-cur': { cwd: '/work/plugin' } },
          }),
        },
      },
    }} />)
    fireEvent.click(screen.getByTestId('dsh-bot-new'))
    await vi.waitFor(() => {
      expect(dshBot.createSession).toHaveBeenCalledWith(undefined, '/work/plugin')
    })
    view.unmount()
  })

  it('guards reentry on New and jumps after create', async () => {
    const open = vi.fn()
    let resolveCreate!: (value: { ok: true; value: { sessionId: string; title: string } }) => void
    const pending = new Promise<RpcResult<{ sessionId: string; title: string }>>((resolve) => {
      resolveCreate = resolve as typeof resolveCreate
    })
    const dshBot = client({ items: [] }, {
      createSession: vi.fn(() => pending),
    })
    const view = render(<DshBotTab ctx={{ dshBot, sessions: { open } }} />)
    const button = screen.getByTestId('dsh-bot-new') as HTMLButtonElement
    fireEvent.click(button)
    expect(button.disabled).toBe(true)
    fireEvent.click(button)
    expect(dshBot.createSession).toHaveBeenCalledTimes(1)
    resolveCreate({ ok: true as const, value: { sessionId: 'session-new', title: 'DSH Bot' } })
    await vi.waitFor(() => { expect(open).toHaveBeenCalledWith('session-new') })
    view.unmount()
  })

  it('renders the readonly bot model footer', () => {
    const view = render(<DshBotTab ctx={{
      dshBot: client({
        botModel: { provider: 'deepseek', model: 'flash', source: 'override' },
      }),
    }} />)
    expect(screen.getByTestId('dsh-bot-footer-model').textContent).toMatch(/deepseek\/flash/)
    expect(screen.getByTestId('dsh-bot-footer-model').textContent).toMatch(/override/)
    view.unmount()
  })
})

describe('resolveCreateCwd', () => {
  it('prefers the current session cwd then a workspace path', () => {
    expect(resolveCreateCwd(
      { list: { getSnapshot: () => ({ current: 's1', byId: { s1: { cwd: '/from-session' } } }) } },
      { list: { getSnapshot: () => ({ items: [{ path: '/from-ws' }] }) } },
    )).toBe('/from-session')
    expect(resolveCreateCwd(
      { list: { getSnapshot: () => ({ byId: {} }) } },
      { list: { getSnapshot: () => ({ items: [{ id: 'w1', path: '/from-ws' }], recentWorkspaceId: 'w1' }) } },
    )).toBe('/from-ws')
  })
})
