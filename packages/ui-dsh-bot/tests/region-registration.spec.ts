/**
 * Bot-region slot lifecycle: priority -1, dispose on sessions, master disposer.
 */
import { describe, expect, it } from 'vitest'
import { NS } from '../src/client/locales.ts'
import { bindBotRegion } from '../src/client/region-registration.ts'
import { createSidebarMode } from '../src/client/sidebar-mode.ts'
import type { SlotsFace } from '../src/client/region-registration.ts'
import type { SidebarStorage } from '../src/client/sidebar-mode.ts'

interface LiveReg {
  descriptor: {
    name: string
    priority?: number
    locale?: string
    inject?: () => Record<string, unknown>
  }
  component: unknown
  disposed: boolean
}

function memory(): SidebarStorage {
  const bag = new Map<string, string>()
  return {
    getItem: (key) => bag.get(key) ?? null,
    setItem: (key, value) => { bag.set(key, value) },
  }
}

function fakeSlots(): { slots: SlotsFace; live: () => LiveReg[]; names: string[] } {
  const regs: LiveReg[] = []
  const names: string[] = []
  const slots: SlotsFace = {
    inject(name, factory) {
      names.push(name)
      const inner = factory()
      let gone = false
      return () => {
        if (gone) return
        gone = true
        if (typeof inner === 'function') inner()
      }
    },
    register(descriptor, component) {
      const rec: LiveReg = { descriptor, component, disposed: false }
      regs.push(rec)
      return () => { rec.disposed = true }
    },
  }
  return {
    slots,
    live: () => regs.filter(item => !item.disposed),
    names,
  }
}

describe('bindBotRegion', () => {
  it('registers sidebar.workspaces at priority -1 in bot mode', () => {
    const mode = createSidebarMode(memory())
    const fake = fakeSlots()
    const dispose = bindBotRegion({ slots: fake.slots }, mode, 'Region')
    expect(fake.live()).toHaveLength(0)
    mode.set('bot')
    expect(fake.names).toEqual(['sidebar.workspaces'])
    expect(fake.live()).toHaveLength(1)
    const last = fake.live()[0]
    expect(last?.descriptor.name).toBe('sidebar.workspaces')
    expect(last?.descriptor.priority).toBe(-1)
    expect(last?.descriptor.locale).toBe(NS)
    expect(last?.component).toBe('Region')
    const injected = last?.descriptor.inject?.()
    expect(injected).toEqual({
      open: expect.any(Function),
      expandHint: expect.any(Function),
    })
    dispose()
  })

  it('leaves zero live registrations after two toggles', () => {
    const mode = createSidebarMode(memory())
    const fake = fakeSlots()
    const dispose = bindBotRegion({ slots: fake.slots }, mode, 'Region')
    mode.set('bot')
    mode.set('sessions')
    mode.set('bot')
    mode.set('sessions')
    expect(fake.live()).toHaveLength(0)
    dispose()
  })

  it('does not register after the master disposer runs', () => {
    const mode = createSidebarMode(memory())
    const fake = fakeSlots()
    const dispose = bindBotRegion({ slots: fake.slots }, mode, 'Region')
    mode.set('bot')
    expect(fake.live()).toHaveLength(1)
    dispose()
    expect(fake.live()).toHaveLength(0)
    mode.set('sessions')
    mode.set('bot')
    expect(fake.live()).toHaveLength(0)
    expect(fake.names).toEqual(['sidebar.workspaces'])
  })
})
