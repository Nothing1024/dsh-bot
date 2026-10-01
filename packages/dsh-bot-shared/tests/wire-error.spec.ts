import { describe, expect, it } from 'vitest'
import { describeWireError, formatWireError } from '../src/wire-error.ts'

describe('describeWireError', () => {
  it('names a known cause, offers the fix, and keeps the host message verbatim', () => {
    const copy = describeWireError({
      code: 'override-invalid',
      message: 'illegal dsh-bot.model override nope/nope: no adapter registered for provider "nope"',
    })
    expect(copy.title).toBe('该人设指定的模型不可用')
    expect(copy.hint).toMatch(/跟随全局/)
    expect(copy.detail).toBe('illegal dsh-bot.model override nope/nope: no adapter registered for provider "nope"')
  })

  it('falls back to a generic headline for an unknown code without dropping the detail', () => {
    const copy = describeWireError({ code: 'wat', message: 'boom' })
    expect(copy.title).toBe('操作失败')
    expect(copy.code).toBe('wat')
    expect(copy.detail).toBe('boom')
  })

  it('reports a missing code as internal', () => {
    expect(describeWireError({ message: 'x' }).code).toBe('internal')
  })

  it('tells the user how to free a full room queue', () => {
    const copy = describeWireError({ code: 'queue-full', message: 'room queue is full' })
    expect(copy.title).toBe('排队已满（最多 3 条）')
    expect(copy.hint).toMatch(/取消一条/)
  })
})

describe('formatWireError', () => {
  it('keeps the wire code and the raw message in the one-line form', () => {
    const line = formatWireError({ code: 'web-unreachable', message: 'connect ECONNREFUSED 127.0.0.1:3084' })
    expect(line).toContain('连不上 DSH 网关')
    expect(line).toContain('web-unreachable')
    expect(line).toContain('connect ECONNREFUSED 127.0.0.1:3084')
  })
})
