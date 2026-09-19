/**
 * Group registry: member bounds, no nesting via bot-id membership, corrupt
 * file does not touch bots.json (BR-301 / BR-302 / BR-306).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createGroupsRuntime } from '../src/groups.ts'
import { DshBotError } from '../src/errors.ts'

const BOT_IDS = ['dsh-bot', 'shiren-xiaobei', 'bot-three', 'bot-four', 'bot-five', 'bot-six', 'bot-seven']

const homes: string[] = []
const previousHome = process.env.DSH_HOME

beforeEach(() => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-bot-groups-'))
  homes.push(home)
  process.env.DSH_HOME = home
})

afterEach(() => {
  while (homes.length > 0) {
    const home = homes.pop()
    if (home !== undefined) rmSync(home, { recursive: true, force: true })
  }
  if (previousHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousHome
})

function runtime(ids: readonly string[] = BOT_IDS) {
  const home = process.env.DSH_HOME!
  return {
    home,
    groups: createGroupsRuntime({
      listBotIds: async () => ids,
      home: () => home,
      now: () => 1_700_000_000_000,
    }),
  }
}

describe('groups runtime', () => {
  it('persists room names through reload and preserves history when renaming', async () => {
    const { home, groups } = runtime()
    const group = await groups.createGroup({ name: '编辑室', memberIds: ['dsh-bot', 'shiren-xiaobei'] })
    const room = await groups.createGroupSession({ groupId: group.id })
    await groups.appendRoomMessage(room.roomId, { kind: 'user' }, '保留历史')
    await groups.renameGroupSession({ sessionId: room.roomId, title: '选题讨论' })
    const reloaded = createGroupsRuntime({ listBotIds: async () => BOT_IDS, home: () => home })
    expect((await reloaded.listGroupSessions({ groupId: group.id })).rooms[0]?.title).toBe('选题讨论')
    expect((await reloaded.peekRoom(room.roomId))?.messages[0]?.text).toBe('保留历史')
    await expect(groups.renameGroupSession({ sessionId: room.roomId, title: ' ' })).rejects.toMatchObject({ code: 'invalid-input' })
  })

  it('lists empty when groups.json is missing', async () => {
    const { groups } = runtime()
    expect(await groups.listGroups()).toEqual({ groups: [] })
  })

  it('creates a group, persists groups.json, and does not write bots.json', async () => {
    const { home, groups } = runtime()
    const created = await groups.createGroup({
      name: '编辑室',
      memberIds: ['dsh-bot', 'shiren-xiaobei'],
    })
    expect(created).toMatchObject({
      name: '编辑室',
      memberIds: ['dsh-bot', 'shiren-xiaobei'],
    })
    expect(created.id).toBe('bianji-shi')
    const listed = await groups.listGroups()
    expect(listed.groups.map(row => row.id)).toEqual(['bianji-shi'])
    expect(existsSync(join(home, 'dsh-bot', 'groups.json'))).toBe(true)
    expect(existsSync(join(home, 'dsh-bot', 'bots.json'))).toBe(false)
    const raw = JSON.parse(readFileSync(join(home, 'dsh-bot', 'groups.json'), 'utf8')) as {
      groups: Array<{ memberIds?: unknown; presetId?: unknown }>
    }
    expect(raw.groups[0]?.presetId).toBeUndefined()
    expect(raw.groups[0]?.memberIds).toEqual(['dsh-bot', 'shiren-xiaobei'])
  })

  it('rejects one member, seven members, unknown bots, and duplicates that collapse below 2', async () => {
    const { groups } = runtime()
    await expect(groups.createGroup({ name: '单人', memberIds: ['dsh-bot'] })).rejects.toMatchObject({
      code: 'invalid-input',
    })
    await expect(groups.createGroup({
      name: '七人',
      memberIds: BOT_IDS.slice(0, 7),
    })).rejects.toMatchObject({ code: 'invalid-input' })
    await expect(groups.createGroup({
      name: '幽灵',
      memberIds: ['dsh-bot', 'ghost'],
    })).rejects.toMatchObject({ code: 'invalid-input' })
    await expect(groups.createGroup({
      name: '重复',
      memberIds: ['dsh-bot', 'dsh-bot'],
    })).rejects.toMatchObject({ code: 'invalid-input' })
  })

  it('dedupes members while keeping order when still 2–6', async () => {
    const { groups } = runtime()
    const created = await groups.createGroup({
      name: '去重',
      memberIds: ['dsh-bot', 'shiren-xiaobei', 'dsh-bot'],
    })
    expect(created.memberIds).toEqual(['dsh-bot', 'shiren-xiaobei'])
  })

  it('refuses a group id that collides with a bot id by suffixing', async () => {
    const { groups } = runtime()
    const created = await groups.createGroup({
      name: 'DSH Bot',
      memberIds: ['dsh-bot', 'shiren-xiaobei'],
    })
    expect(created.id).not.toBe('dsh-bot')
    expect(created.id.startsWith('dsh-bot-')).toBe(true)
  })

  it('updates members with the same bounds and leaves 1:1 bots untouched', async () => {
    const { home, groups } = runtime()
    writeFileSync(join(home, 'dsh-bot-placeholder'), 'x')
    const created = await groups.createGroup({
      name: '编辑室',
      memberIds: ['dsh-bot', 'shiren-xiaobei'],
    })
    const updated = await groups.updateGroup({
      id: created.id,
      memberIds: ['dsh-bot', 'shiren-xiaobei', 'bot-three'],
    })
    expect(updated.memberIds).toEqual(['dsh-bot', 'shiren-xiaobei', 'bot-three'])
    await expect(groups.updateGroup({
      id: created.id,
      memberIds: ['dsh-bot'],
    })).rejects.toMatchObject({ code: 'invalid-input' })
  })

  it('defaults rounds to 3 and stores an explicit value', async () => {
    const { groups } = runtime()
    const plain = await groups.createGroup({
      name: '默认轮',
      memberIds: ['dsh-bot', 'shiren-xiaobei'],
    })
    expect(plain.rounds).toBe(3)
    const infinite = await groups.createGroup({
      name: '无限轮',
      memberIds: ['dsh-bot', 'shiren-xiaobei'],
      rounds: 0,
    })
    expect(infinite.rounds).toBe(0)
    const updated = await groups.updateGroup({ id: plain.id, rounds: 5 })
    expect(updated.rounds).toBe(5)
    const kept = await groups.updateGroup({ id: plain.id, name: '默认轮二' })
    expect(kept.rounds).toBe(5)
  })

  it('rejects a non-integer or out-of-range rounds value', async () => {
    const { groups } = runtime()
    await expect(groups.createGroup({
      name: '坏轮',
      memberIds: ['dsh-bot', 'shiren-xiaobei'],
      rounds: 1.5,
    })).rejects.toMatchObject({ code: 'invalid-input' })
    await expect(groups.createGroup({
      name: '越界',
      memberIds: ['dsh-bot', 'shiren-xiaobei'],
      rounds: 100,
    })).rejects.toMatchObject({ code: 'invalid-input' })
  })

  it('reloads rounds from disk for a legacy row that never stored one', async () => {
    const { home, groups } = runtime()
    const created = await groups.createGroup({
      name: '旧行',
      memberIds: ['dsh-bot', 'shiren-xiaobei'],
    })
    const file = join(home, 'dsh-bot', 'groups.json')
    const raw = JSON.parse(readFileSync(file, 'utf8')) as { groups: Array<Record<string, unknown>> }
    delete raw.groups[0]!.rounds
    writeFileSync(file, `${JSON.stringify(raw, null, 2)}\n`)
    const reloaded = createGroupsRuntime({ listBotIds: async () => BOT_IDS, home: () => home })
    expect((await reloaded.getGroup(created.id)).rounds).toBe(3)
  })

  it('deleteGroup removes the row and room files, not sibling files', async () => {
    const { home, groups } = runtime()
    mkdirSync(join(home, 'dsh-bot'), { recursive: true })
    writeFileSync(join(home, 'dsh-bot', 'bots.json'), '{"version":1,"bots":[]}\n')
    const created = await groups.createGroup({
      name: '编辑室',
      memberIds: ['dsh-bot', 'shiren-xiaobei'],
    })
    const room = await groups.createGroupSession({ groupId: created.id })
    expect(existsSync(join(home, 'dsh-bot', 'rooms', `${room.roomId}.jsonl`))).toBe(true)
    await groups.deleteGroup({ id: created.id })
    expect((await groups.listGroups()).groups).toEqual([])
    expect(existsSync(join(home, 'dsh-bot', 'rooms', `${room.roomId}.jsonl`))).toBe(false)
    expect(readFileSync(join(home, 'dsh-bot', 'bots.json'), 'utf8')).toContain('"bots"')
  })

  it('fails loud on corrupt groups.json without rewriting bots.json', async () => {
    const { home, groups } = runtime()
    mkdirSync(join(home, 'dsh-bot'), { recursive: true })
    writeFileSync(join(home, 'dsh-bot', 'bots.json'), '{"keep":true}\n')
    writeFileSync(join(home, 'dsh-bot', 'groups.json'), '{not json')
    await expect(groups.listGroups()).rejects.toMatchObject({ code: 'registry-corrupt' })
    expect(readFileSync(join(home, 'dsh-bot', 'bots.json'), 'utf8')).toBe('{"keep":true}\n')
  })

  it('createGroupSession writes an empty room that history can read', async () => {
    const { groups } = runtime()
    const created = await groups.createGroup({
      name: '编辑室',
      memberIds: ['dsh-bot', 'shiren-xiaobei'],
    })
    const room = await groups.createGroupSession({ groupId: created.id })
    const empty = await groups.peekRoom(room.roomId)
    expect(empty?.messages).toEqual([])
    const user = await groups.appendRoomMessage(room.roomId, { kind: 'user' }, '你们是谁?')
    expect(user.seq).toBe(1)
    const member = await groups.appendRoomMessage(
      room.roomId,
      { kind: 'member', botId: 'shiren-xiaobei' },
      '我是诗人小北',
    )
    expect(member.seq).toBe(2)
    const listed = await groups.listGroupSessions({ groupId: created.id })
    expect(listed.rooms.map(row => row.roomId)).toEqual([room.roomId])
  })

  it('getGroup throws group-not-found', async () => {
    const { groups } = runtime()
    await expect(groups.getGroup('missing')).rejects.toBeInstanceOf(DshBotError)
    await expect(groups.getGroup('missing')).rejects.toMatchObject({ code: 'group-not-found' })
  })

  it('removeBotFromGroups drops a member and keeps the group when two remain', async () => {
    const { groups } = runtime()
    const created = await groups.createGroup({
      name: '三人',
      memberIds: ['dsh-bot', 'shiren-xiaobei', 'bot-three'],
    })
    const result = await groups.removeBotFromGroups('bot-three')
    expect(result).toEqual({ updated: [created.id], deleted: [] })
    expect((await groups.getGroup(created.id)).memberIds).toEqual(['dsh-bot', 'shiren-xiaobei'])
  })

  it('removeBotFromGroups deletes a two-member group and its rooms', async () => {
    const { home, groups } = runtime()
    const created = await groups.createGroup({
      name: '双人',
      memberIds: ['dsh-bot', 'shiren-xiaobei'],
    })
    const room = await groups.createGroupSession({ groupId: created.id })
    const result = await groups.removeBotFromGroups('shiren-xiaobei')
    expect(result).toEqual({ updated: [], deleted: [created.id] })
    expect((await groups.listGroups()).groups).toEqual([])
    expect(existsSync(join(home, 'dsh-bot', 'rooms', `${room.roomId}.jsonl`))).toBe(false)
  })
})

describe('group layout defaults', () => {
  it('updateLayout skips unknown ids', async () => {
    const { groups } = runtime()
    const created = await groups.createGroup({ name: '编辑室', memberIds: ['dsh-bot', 'shiren-xiaobei'] })
    const result = await groups.updateLayout([
      { id: created.id, section: 'life', order: 1 },
      { id: 'nope', section: 'work' },
    ])
    expect(result.skipped).toEqual(['nope'])
    const listed = await groups.listGroups()
    expect(listed.groups[0]?.section).toBe('life')
  })
})

