// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorkbenchBot } from 'dsh-bot-shared'
import { OverlayHost } from '../src/client/OverlayHost.tsx'
import { createOverlayStore } from '../src/client/overlay-store.ts'
import { observable } from '../src/client/observable.ts'
import type { RosterRpc } from '../src/client/roster-rpc.ts'

const seed: WorkbenchBot = {
  id: 'dsh-bot',
  name: 'DSH Bot',
  avatar: { color: '#5b8def' },
  presetId: 'dsh-bot',
  createdAt: 1,
  persona: '默认',
  protected: true,
}

function fakeRoster(overrides: Partial<RosterRpc> = {}): RosterRpc {
  return {
    bots: observable({ status: 'idle' as const, error: null, items: [seed] }),
    groups: observable({ status: 'idle' as const, error: null, items: [] }),
    sessionsByBot: observable({}),
    historyBySession: observable({}),
    lastMessages: observable({}),
    refresh: vi.fn(async () => {}),
    sessionsOf: vi.fn(async () => []),
    createBotSession: vi.fn(),
    createGroupSession: vi.fn(),
    markRead: vi.fn(),
    updateBotLayout: vi.fn(),
    createBot: vi.fn(async () => ({ ok: true as const, value: { ...seed, id: 'new', name: '左栏测试', protected: false } })),
    updateBot: vi.fn(),
    deleteBot: vi.fn(),
    createGroup: vi.fn(),
    updateGroup: vi.fn(),
    deleteGroup: vi.fn(),
    memoryList: vi.fn(),
    routineList: vi.fn(),
    peerLog: vi.fn(),
    historyOf: vi.fn(),
    ensurePreview: vi.fn(),
    setActive: vi.fn(),
    dispose: vi.fn(),
    ...overrides,
  } as unknown as RosterRpc
}

afterEach(() => {
  cleanup()
})

describe('OverlayHost', () => {
  it('renders null when kind is null', () => {
    const overlay = createOverlayStore()
    const { container } = render(<OverlayHost overlay={overlay} roster={fakeRoster()} />)
    expect(container.firstChild).toBeNull()
  })

  it('disables save until name and persona are filled', () => {
    const overlay = createOverlayStore()
    overlay.open({ kind: 'create-bot' })
    render(<OverlayHost overlay={overlay} roster={fakeRoster()} />)
    expect(screen.getByTestId('dsh-bot-overlay-save').hasAttribute('disabled')).toBe(true)
    fireEvent.change(screen.getByTestId('dsh-bot-overlay-name'), { target: { value: '左栏测试' } })
    fireEvent.change(screen.getByTestId('dsh-bot-overlay-persona'), { target: { value: '人设' } })
    expect(screen.getByTestId('dsh-bot-overlay-save').hasAttribute('disabled')).toBe(false)
  })

  it('closes after a successful create and reports the new id', async () => {
    const overlay = createOverlayStore()
    const onCreated = vi.fn()
    const roster = fakeRoster()
    overlay.open({ kind: 'create-bot' })
    render(<OverlayHost overlay={overlay} roster={roster} onCreated={onCreated} />)
    fireEvent.change(screen.getByTestId('dsh-bot-overlay-name'), { target: { value: '左栏测试' } })
    fireEvent.change(screen.getByTestId('dsh-bot-overlay-persona'), { target: { value: '人设' } })
    fireEvent.click(screen.getByTestId('dsh-bot-overlay-save'))
    await vi.waitFor(() => { expect(onCreated).toHaveBeenCalledWith('new') })
    expect(overlay.getSnapshot().kind).toBeNull()
  })

  it('keeps the form and shows an RPC error', async () => {
    const overlay = createOverlayStore()
    const roster = fakeRoster({
      createBot: vi.fn(async () => ({ ok: false as const, error: { message: '名字重复' } })),
    })
    overlay.open({ kind: 'create-bot' })
    render(<OverlayHost overlay={overlay} roster={roster} />)
    fireEvent.change(screen.getByTestId('dsh-bot-overlay-name'), { target: { value: '左栏测试' } })
    fireEvent.change(screen.getByTestId('dsh-bot-overlay-persona'), { target: { value: '人设' } })
    fireEvent.click(screen.getByTestId('dsh-bot-overlay-save'))
    expect((await screen.findByTestId('dsh-bot-overlay-error')).textContent).toMatch(/名字重复/)
    expect(overlay.getSnapshot().kind).toBe('create-bot')
    expect(screen.getByTestId('dsh-bot-overlay-name')).toBeTruthy()
  })

  it('closes on Escape', () => {
    const overlay = createOverlayStore()
    overlay.open({ kind: 'create-bot' })
    render(<OverlayHost overlay={overlay} roster={fakeRoster()} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(overlay.getSnapshot().kind).toBeNull()
  })

  it('refuses to delete a protected bot', async () => {
    const overlay = createOverlayStore()
    const deleteBot = vi.fn()
    overlay.open({ kind: 'confirm-delete', id: 'dsh-bot', target: 'bot' })
    render(<OverlayHost overlay={overlay} roster={fakeRoster({ deleteBot })} />)
    fireEvent.click(screen.getByTestId('dsh-bot-overlay-delete'))
    expect((await screen.findByTestId('dsh-bot-overlay-error')).textContent).toMatch(/cannot be deleted/)
    expect(deleteBot).not.toHaveBeenCalled()
  })
})
