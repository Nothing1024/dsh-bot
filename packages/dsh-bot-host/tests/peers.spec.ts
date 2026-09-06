import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  acceptPeerSend,
  appendPeerLog,
  buildPeerWake,
  createPeerRateLimiter,
  finishPeerSend,
  parseAgentLine,
  readPeerLog,
  type PeerSendIO,
} from '../src/peers.ts'

function io(overrides: Partial<PeerSendIO> & { writes?: string[]; waits?: string[] } = {}) {
  const writes = overrides.writes ?? []
  const waits = overrides.waits ?? []
  const bots = new Map([
    ['xiaodui-aning', { id: 'xiaodui-aning', name: '校对阿宁' }],
    ['shiren-xiaobei', { id: 'shiren-xiaobei', name: '诗人小北' }],
  ])
  let peerSession: string | undefined
  const base: PeerSendIO = {
    limiter: createPeerRateLimiter(() => 1_700_000_000_000),
    now: () => 1_700_000_000_000,
    async getBot(id) {
      const row = bots.get(id)
      if (row === undefined) throw new Error(`missing ${id}`)
      return row
    },
    async findPeerSession() {
      return peerSession
    },
    async createPeerSession(_to, _from, _title) {
      peerSession = 'peer-s'
      return 'peer-s'
    },
    async write(sessionId, text) {
      writes.push(`${sessionId}:${text}`)
    },
    async waitRead() {
      return waits.shift()
    },
    async resolveFromSession(_from, hint) {
      return hint ?? 'from-s'
    },
    incrementUnread() {
      writes.push('unread++')
    },
    async appendLog() {},
  }
  return { ...base, ...overrides, writes, waits, setPeer: (id: string) => { peerSession = id } }
}

describe('peer rate limit + jsonl', () => {
  it('allows 3 and rejects the 4th in the same minute', () => {
    let t = 1000
    const limiter = createPeerRateLimiter(() => t)
    expect(limiter.tryConsume('a')).toBe(true)
    expect(limiter.tryConsume('a')).toBe(true)
    expect(limiter.tryConsume('a')).toBe(true)
    expect(limiter.tryConsume('a')).toBe(false)
    t += 60_001
    expect(limiter.tryConsume('a')).toBe(true)
  })

  it('counts each fromBot separately', () => {
    const limiter = createPeerRateLimiter(() => 1)
    expect(limiter.tryConsume('a')).toBe(true)
    expect(limiter.tryConsume('b')).toBe(true)
  })

  it('appends and filters peers.jsonl', async () => {
    const home = mkdtempSync(join(tmpdir(), 'dsh-bot-peers-'))
    mkdirSync(join(home, 'dsh-bot'), { recursive: true })
    await appendPeerLog(home, { from: 'a', to: 'b', ts: 1, sessionId: 's1' })
    await appendPeerLog(home, { from: 'c', to: 'a', ts: 2, sessionId: 's2' })
    expect(existsSync(join(home, 'dsh-bot', 'peers.jsonl'))).toBe(true)
    expect(readFileSync(join(home, 'dsh-bot', 'peers.jsonl'), 'utf8')).toMatch(/"from":"a"/)
    expect(await readPeerLog(home, 'a')).toHaveLength(2)
    expect(await readPeerLog(home, 'b')).toHaveLength(1)
    expect(await readPeerLog(home)).toHaveLength(2)
    rmSync(home, { recursive: true, force: true })
  })
})

describe('accept + finish', () => {
  it('rejects self send and does not write', async () => {
    const stub = io()
    const result = await acceptPeerSend(stub, {
      fromBot: 'xiaodui-aning',
      toBot: 'xiaodui-aning',
      text: 'hi',
    })
    expect(result).toEqual({ ok: false, error: 'cannot-send-to-self' })
    expect(stub.writes).toEqual([])
  })

  it('rejects the 4th send without writing', async () => {
    const stub = io()
    for (let i = 0; i < 3; i += 1) {
      const ok = await acceptPeerSend(stub, {
        fromBot: 'xiaodui-aning',
        toBot: 'shiren-xiaobei',
        text: `m${i}`,
      })
      expect(ok.ok).toBe(true)
    }
    const fourth = await acceptPeerSend(stub, {
      fromBot: 'xiaodui-aning',
      toBot: 'shiren-xiaobei',
      text: 'm3',
    })
    expect(fourth).toEqual({ ok: false, error: 'rate-limited' })
    expect(stub.writes.filter(row => row.startsWith('peer-s:')).length).toBe(3)
  })

  it('returns accepted before wait and writes [agent] wake', async () => {
    const stub = io()
    const result = await acceptPeerSend(stub, {
      fromBot: 'xiaodui-aning',
      toBot: 'shiren-xiaobei',
      text: '封面用深蓝',
    })
    expect(result).toEqual({ ok: true, accepted: true, sessionId: 'peer-s' })
    expect(stub.writes[0]).toBe('peer-s:[agent] 来自 校对阿宁：封面用深蓝')
  })

  it('does not echo or increment unread on silent', async () => {
    const stub = io({ waits: ['(silent)'] })
    const accepted = await acceptPeerSend(stub, {
      fromBot: 'xiaodui-aning',
      toBot: 'shiren-xiaobei',
      text: '没事',
    })
    if (!accepted.ok) throw new Error('expected accept')
    await finishPeerSend(stub, {
      fromBot: 'xiaodui-aning',
      toBot: 'shiren-xiaobei',
      text: '没事',
      fromSessionId: 'from-s',
    }, accepted.sessionId)
    expect(stub.writes.some(row => row.startsWith('from-s:'))).toBe(false)
    expect(stub.writes).not.toContain('unread++')
  })

  it('echoes a non-silent reply to the from session', async () => {
    const stub = io({ waits: ['深蓝很好'] })
    const accepted = await acceptPeerSend(stub, {
      fromBot: 'xiaodui-aning',
      toBot: 'shiren-xiaobei',
      text: '封面用深蓝',
      fromSessionId: 'from-s',
    })
    if (!accepted.ok) throw new Error('expected accept')
    await finishPeerSend(stub, {
      fromBot: 'xiaodui-aning',
      toBot: 'shiren-xiaobei',
      text: '封面用深蓝',
      fromSessionId: 'from-s',
    }, accepted.sessionId)
    expect(stub.writes).toContain('from-s:[agent] 来自 诗人小北：深蓝很好')
    expect(stub.writes).toContain('unread++')
  })
})

describe('agent line', () => {
  it('builds and parses 来自 tags', () => {
    const line = buildPeerWake('校对阿宁', '封面用深蓝')
    expect(line).toBe('[agent] 来自 校对阿宁：封面用深蓝')
    expect(parseAgentLine(line)).toEqual({ fromName: '校对阿宁', body: '封面用深蓝' })
  })
})
