import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  isVoiceInjection,
  resolvePersonaPlaceholders,
  unwrapPrompt,
  wrapPrompt,
  wrapVoice,
} from '../src/session-voice.ts'
import { createSessionVoiceStore } from '../src/session-voice-store.ts'

describe('session-voice', () => {
  it('wraps a non-empty persona as a system-reminder around the user text', () => {
    const wrapped = wrapPrompt('你是诗人。', '你好')
    expect(wrapped.startsWith('<system-reminder>')).toBe(true)
    expect(wrapped.endsWith('你好')).toBe(true)
    expect(wrapped).toContain('你是诗人。')
    expect(isVoiceInjection(wrapped)).toBe(true)
    expect(unwrapPrompt(wrapped)).toBe('你好')
    expect(wrapVoice('你是诗人。')).toContain('你是诗人。')
    expect(wrapVoice('你是诗人。')).not.toContain('你好')
  })

  it('unwraps the legacy voice block', () => {
    expect(unwrapPrompt('[dsh-bot-voice]\n你是诗人。\n[/dsh-bot-voice]\n\n你好')).toBe('你好')
  })

  it('leaves empty persona as the original text', () => {
    expect(wrapPrompt('  ', '你好')).toBe('你好')
    expect(isVoiceInjection('你好')).toBe(false)
    expect(unwrapPrompt('你好')).toBe('你好')
  })

  it('fills {{model}} and {{cwd}}', () => {
    expect(resolvePersonaPlaceholders('模型 {{model}} 在 {{cwd}}', { model: 'grok-4.6', cwd: '/work' }))
      .toBe('模型 grok-4.6 在 /work')
    expect(resolvePersonaPlaceholders('{{model}} {{cwd}}', {})).toBe(' ')
  })
})

describe('session-voice-store', () => {
  const homes: string[] = []
  afterEach(() => {
    while (homes.length > 0) {
      const home = homes.pop()
      if (home !== undefined) rmSync(home, { recursive: true, force: true })
    }
  })

  it('freezes the first snapshot and ignores later writes', async () => {
    const home = mkdtempSync(join(tmpdir(), 'dsh-bot-voice-'))
    homes.push(home)
    const store = createSessionVoiceStore(() => home)
    await store.snapshot('s1', '旧口吻')
    await store.snapshot('s1', '新口吻')
    expect(await store.read('s1')).toBe('旧口吻')
    expect(readFileSync(join(home, 'dsh-bot', 'session-voice', 's1.txt'), 'utf8')).toBe('旧口吻\n')
  })

  it('returns undefined for a missing session', async () => {
    const home = mkdtempSync(join(tmpdir(), 'dsh-bot-voice-'))
    homes.push(home)
    const store = createSessionVoiceStore(() => home)
    expect(await store.read('missing')).toBeUndefined()
  })
})
