const now = Date.now()
let serial = 30
const uid = () => String(++serial)
const bots = [
  { id: 'aning', name: '校对阿宁', avatar: { color: '#e05c73' }, persona: '认真、直接的文字校对伙伴。保留原意，先指出问题，再给修改建议。', presetId: 'sample-aning', createdAt: now, protected: false, pinned: true, section: 'work', unread: 0 },
  { id: 'dsh', name: 'DSH Bot', avatar: { color: '#5b8def' }, persona: '常驻的对话助手。', presetId: 'sample-dsh', createdAt: now, protected: true, pinned: true, section: 'work', unread: 0 },
  { id: 'night', name: '运维夜班', avatar: { color: '#2ba5a7' }, persona: '关注运行状态，有明确问题再提醒。', presetId: 'sample-night', createdAt: now, protected: false, section: 'work', unread: 1 },
  { id: 'xiaobei', name: '诗人小北', avatar: { color: '#a271e8' }, persona: '用具体画面表达感受。', presetId: 'sample-xiaobei', createdAt: now, protected: false, section: 'life', unread: 0 },
]
const groups = [{ id: 'editorial', name: '编辑室', memberIds: ['aning', 'xiaobei'], createdAt: now, section: 'work' }]
const sessions: Record<string, any[]> = {}
const histories: Record<string, any[]> = {}
const running = new Set<string>()
const generations = new Map<string, number>()
const memories: Record<string, any> = { aning: { profile: [{ id: 'm1', text: '偏好直接、简洁的表达', ts: now }], log: [{ id: 'm2', kind: 'note', text: '校对时保留原意', ts: now, source: 'explicit' }] } }
let routines: any[] = [{ id: 'r1', botId: 'aning', name: '文稿回顾', schedule: '@daily', instruction: '回顾今天的文稿，有需要处理的问题再提醒。', enabled: true, notify: true }]
const sources = new Set<LocalEvents>()
const clone = (x: any) => JSON.parse(JSON.stringify(x))
const emit = (frame: any) => sources.forEach(s => s.onmessage?.({ data: JSON.stringify(frame) }))
const message = (text: string, role = 'assistant', author?: any) => ({ id: uid(), seq: serial, kind: 'message', role, text, ...(author ? { author: { botId: author.botId ?? author.id, name: author.name, avatar: author.avatar } } : {}) })
for (const b of [...bots, ...groups]) {
  const id = `sample-${b.id}`
  sessions[b.id] = [{ sessionId: id, roomId: id, groupId: b.id, title: b.id === 'editorial' ? '秋日文案讨论' : b.id === 'aning' ? '文字校对' : '最近对话', createdAt: now, updatedAt: now, tags: [], status: 'idle', hidden: false, working: false }]
  histories[id] = b.id === 'editorial'
    ? [message('“我们在秋天重新出发”，你们觉得怎样？', 'user'), message('意思很清楚，可以再补上具体行动。', 'assistant', bots[0]), message('趁秋风刚起，我们再走一程。', 'assistant', bots[3])]
    : [message(b.id === 'aning' ? '帮我把这句话写得更清楚：我们将持续推进相关工作的开展。' : '今天有什么需要一起处理的？', 'user'), { id: uid(), seq: serial, kind: 'thinking', text: '先检查原意，再删去重复或含糊的表达。' }, message(b.id === 'aning' ? '可以改成：“我们会继续推进这项工作。”\n\n删掉“相关”和“的开展”，表达更直接，也没有改变原意。' : '我们可以先看最需要处理的事情。')]
}
export class LocalEvents {
  static CONNECTING = 0
  readyState = 1
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  constructor() { sources.add(this); setTimeout(() => this.onmessage?.({ data: '{"type":"ready"}' }), 0) }
  close() { sources.delete(this) }
}
const storage = new Map<string, string>()
export const localStorage = { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v), removeItem: (k: string) => storage.delete(k), clear: () => storage.clear() }
export const prototypeSessionTitle = (id: string) => Object.values(sessions).flat().find(row => row.sessionId === id)?.title ?? ''
export function renamePrototypeSession(id: string, title: string) {
  const row = Object.values(sessions).flat().find(row => row.sessionId === id)
  if (row) row.title = title
  window.dispatchEvent(new Event('prototype:session-renamed'))
}
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
async function reply(sessionId: string, token: number) {
  const owner = Object.keys(sessions).find(id => sessions[id].some(s => s.sessionId === sessionId)) ?? 'aning'
  await wait(1000)
  const group = groups.find(g => g.id === owner)
  const participants = group ? group.memberIds : [owner]
  for (const botId of participants) {
    const bot = bots.find(b => b.id === botId) ?? bots[0]!
    const text = group ? `${bot.name}：我来接着说说我的想法。（原型示例）` : '收到，我会保留原意，把表达整理得更清楚。（原型示例）'
    const item = message('', 'assistant', group ? { botId, name: bot.name, avatar: bot.avatar } : undefined)
    histories[sessionId]!.push(item)
    for (const part of text.match(/.{1,3}/gu) ?? []) {
      if (generations.get(sessionId) !== token) return
      item.text += part
      emit({ type: 'session/event', sessionId, event: { type: 'assistant/chunk', data: { chunk: { type: 'text-delta', text: part } } } })
      await wait(110)
    }
    emit({ type: 'session/event', sessionId, event: { type: 'assistant/message' } })
  }
  running.delete(sessionId)
  emit({ type: 'bot/status', botId: owner, working: false, unread: 0 })
  emit({ type: 'session/event', sessionId, event: { type: 'assistant/message' } })
}
export async function mockCall(method: string, a: any = {}): Promise<any> {
  let value: any
  const owner = a.botId ?? a.groupId
  const memory = () => memories[a.botId] ??= { profile: [], log: [] }
  switch (method) {
    case 'listBots': value = { bots }; break
    case 'listGroups': value = { groups }; break
    case 'listSessions': value = { botModel: { provider: 'global', model: 'grok-4.6', source: 'global-default' } }; break
    case 'listBotSessions': value = { sessions: (sessions[owner] ?? []).map(s => ({ ...s, working: running.has(s.sessionId) })) }; break
    case 'listGroupSessions': value = { rooms: sessions[owner] ?? [] }; break
    case 'createBotSession': case 'createGroupSession': {
      const id = 'sample-' + uid(); value = { sessionId: id, roomId: id, botId: owner, groupId: owner, title: a.title ?? `${method === 'createGroupSession' ? '新房间' : '新对话'} ${(sessions[owner]?.length ?? 0) + 1}`, presetId: 'sample', createdAt: Date.now(), updatedAt: Date.now(), tags: [], status: 'idle', hidden: false, working: false }
      ;(sessions[owner] ??= []).push(value); histories[id] = []; break
    }
    case 'history': value = { sessionId: a.sessionId, items: histories[a.sessionId] ?? [], working: running.has(a.sessionId) }; break
    case 'prompt': {
      ;(histories[a.sessionId] ??= []).push(message(a.text, 'user'))
      running.add(a.sessionId); const token = Number(uid()); generations.set(a.sessionId, token)
      const id = Object.keys(sessions).find(k => sessions[k].some(s => s.sessionId === a.sessionId))
      emit({ type: 'bot/status', botId: id, working: true, unread: 0 }); void reply(a.sessionId, token)
      value = { sessionId: a.sessionId }; break
    }
    case 'cancel': generations.delete(a.sessionId); running.delete(a.sessionId); emit({ type: 'session/event', sessionId: a.sessionId, event: { type: 'assistant/message' } }); value = { accepted: true }; break
    case 'memoryList': value = memory(); break
    case 'memoryRemember': value = { id: uid() }; memory().log.push({ ...value, kind: 'note', text: a.text, ts: Date.now(), source: 'explicit' }); break
    case 'memoryForget': memory().profile = memory().profile.filter((m: any) => m.id !== a.id); memory().log = memory().log.filter((m: any) => m.id !== a.id); value = { ok: true }; break
    case 'memoryClear': memories[a.botId] = { profile: [], log: [] }; value = { ok: true }; break
    case 'routineList': value = routines.filter(r => !a.botId || r.botId === a.botId); break
    case 'routineCreate': value = { ...a, id: uid(), enabled: true, notify: a.notify ?? true }; routines.push(value); break
    case 'routineUpdate': value = routines.find(r => r.id === a.id); Object.assign(value, a); break
    case 'routineDelete': routines = routines.filter(r => r.id !== a.id); value = { id: a.id, deleted: true }; break
    case 'peerLog': value = [{ from: 'aning', to: 'xiaobei', ts: now, sessionId: 'sample-editorial' }]; break
    case 'markRead': { const b = bots.find(b => b.id === a.botId); if (b) b.unread = 0; value = { ok: true, unread: 0 }; break }
    case 'createBot': value = { ...a, id: 'bot-' + uid(), avatar: a.avatar ?? { color: '#5b8def' }, presetId: 'sample', createdAt: Date.now(), protected: false }; bots.push(value); break
    case 'createGroup': value = { ...a, id: 'group-' + uid(), createdAt: Date.now() }; groups.push(value); break
    case 'updateBot': case 'updateGroup': { value = (method === 'updateBot' ? bots : groups).find(b => b.id === a.id); Object.assign(value, a); break }
    case 'deleteBot': case 'deleteGroup': { const rows = method === 'deleteBot' ? bots : groups; const index = rows.findIndex(b => b.id === a.id); if (index >= 0) rows.splice(index, 1); value = { id: a.id, deleted: true }; break }
    case 'updateBotLayout': (a.bots ?? []).forEach((b: any) => Object.assign(bots.find(row => row.id === b.id) ?? {}, b)); (a.groups ?? []).forEach((g: any) => Object.assign(groups.find(row => row.id === g.id) ?? {}, g)); value = { ok: true, skipped: [], sections: a.sections ?? [{ id: 'pinned', name: '置顶', order: 0 }, { id: 'work', name: '工作', order: 1 }, { id: 'life', name: '生活', order: 2 }] }; break
    case 'reconcile': value = { assigned: [], scanned: 0, labeled: 0, alreadyLabeled: 0, skippedNonBot: 0, skippedCached: 0 }; break
    default: return { ok: false, error: { code: 'prototype', message: '此操作尚未接入原型数据' } }
  }
  return { ok: true, value: clone(value) }
}
