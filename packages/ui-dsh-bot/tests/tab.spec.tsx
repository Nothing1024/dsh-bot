// @vitest-environment jsdom
/**
 * DshBotTab: probe /dsh-bot/ui, iframe src, gateway-dead error+retry.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { DshBotTab, resolveCreateCwd } from '../src/client/DshBotTab.tsx'
import type { DshBotListState, IDshBotClient } from '../src/client/rpc.ts'

function client(state: Partial<DshBotListState> = {}, extras: Partial<IDshBotClient> = {}): IDshBotClient {
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

function htmlOk(): { ok: true; text: () => Promise<string> } {
  return { ok: true, text: async () => '<!doctype html>\n<html><body></body></html>' }
}

describe('DshBotTab', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('shows loading copy and an iframe pointed at /dsh-bot/ui after probe', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => htmlOk()))
    render(<DshBotTab ctx={{ dshBot: client() }} />)
    expect(screen.getByTestId('dsh-bot-loading').textContent).toMatch(/加载工作台/)
    const frame = await screen.findByTestId('dsh-bot-iframe')
    expect(frame.getAttribute('src')).toBe('/dsh-bot/ui')
  })

  it('clears loading after iframe load when the workbench is still reachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => htmlOk()))
    render(<DshBotTab ctx={{ dshBot: client() }} />)
    const frame = await screen.findByTestId('dsh-bot-iframe')
    fireEvent.load(frame)
    await vi.waitFor(() => {
      expect(screen.queryByTestId('dsh-bot-loading')).toBeNull()
    })
  })

  it('shows error plus retry when the workbench probe fails (gateway dead)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('Failed to fetch')
    }))
    render(<DshBotTab ctx={{ dshBot: client() }} />)
    expect(await screen.findByTestId('dsh-bot-error')).toBeTruthy()
    expect(screen.queryByTestId('dsh-bot-iframe')).toBeNull()
    fireEvent.click(screen.getByTestId('dsh-bot-retry'))
    expect(await screen.findByTestId('dsh-bot-error')).toBeTruthy()
    expect(screen.queryByTestId('dsh-bot-iframe')).toBeNull()
  })

  it('shows error when iframe load re-probe fails (error page load)', async () => {
    let live = true
    vi.stubGlobal('fetch', vi.fn(async () => {
      if (!live) throw new Error('Failed to fetch')
      return htmlOk()
    }))
    render(<DshBotTab ctx={{ dshBot: client() }} />)
    const frame = await screen.findByTestId('dsh-bot-iframe')
    live = false
    fireEvent.load(frame)
    expect(await screen.findByTestId('dsh-bot-error')).toBeTruthy()
    expect(screen.queryByTestId('dsh-bot-iframe')).toBeNull()
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
