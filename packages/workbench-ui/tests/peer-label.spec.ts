import { describe, expect, it } from 'vitest'
import { peerLabelFromText } from '../src/peer-label.ts'

describe('peerLabelFromText', () => {
  it('parses [agent] 来自 X：', () => {
    expect(peerLabelFromText('[agent] 来自 诗人小北：封面用深蓝')).toBe('诗人小北')
  })

  it('ignores ordinary assistant text', () => {
    expect(peerLabelFromText('我是诗人小北')).toBeUndefined()
  })
})
