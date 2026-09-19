import { resolve } from 'node:path'

export function adaptPrototype(source, id, base) {
  let code = source
  const replace = (from, to) => {
    if (!code.includes(from)) throw new Error(`Prototype source anchor changed in ${id}: ${from.slice(0, 70)}`)
    code = code.replace(from, to)
  }
  const helpers = JSON.stringify(resolve(base, 'interactions.tsx'))
  if (id.endsWith('/Roster.tsx')) {
    code = `import { CategoryPicker, usePrototypeEscape } from ${helpers};\n` + code
    replace('  const [menuId, setMenuId] = useState<string | null>(null)', '  const [menuId, setMenuId] = useState<string | null>(null)\n  usePrototypeEscape(() => setMenuId(null))')
    replace('className="rosterSectionHead"', 'className="rosterSectionHead" aria-expanded={!collapsedSec}')
    replace('{bucket.section.name}', '<span aria-hidden="true">{collapsedSec ? "▸" : "▾"}</span> {bucket.section.name}<span className="prototype-category-count">{bucket.items.length}</span>')
    replace('{bucket.items.map(item => {', '{bucket.items.length === 0 && <li className="prototype-category-empty">此分类暂无人设或小组</li>}\n            {bucket.items.map(item => {')
    replace("applyLayout({ bots: [{ id: item.id, pinned: item.pinned !== true, section: item.pinned === true ? 'work' : 'pinned' }] })", "if (item.kind === 'group') applyLayout({ groups: [{ id: item.id, section: item.section === 'pinned' ? 'work' : 'pinned' }] })\n                          else applyLayout({ bots: [{ id: item.id, pinned: item.pinned !== true, section: item.pinned === true ? 'work' : 'pinned' }] })")
    replace("{item.pinned === true ? '取消置顶' : '置顶'}", "{(item.kind === 'group' ? item.section === 'pinned' : item.pinned === true) ? '取消置顶' : '置顶'}")
    const start = code.lastIndexOf('<button', code.indexOf('data-testid={`roster-move-${item.id}`}'))
    const end = code.indexOf('</button>', start) + '</button>'.length
    if (start < 0 || end < start) throw new Error('Missing roster move action')
    code = code.slice(0, start) + `<CategoryPicker item={item} sections={props.sections ?? [{id:'work',name:'工作'},{id:'life',name:'生活'}]} onMove={(next: string) => {
                        setMenuId(null)
                        if (item.kind === 'group') applyLayout({ groups: [{ id: item.id, section: next }] })
                        else applyLayout({ bots: [{ id: item.id, section: next, pinned: false }] })
                      }} />` + code.slice(end)
    replace('{props.jumpable ? (', '{true ? (')
    replace('{props.jumpable && menuId === session.sessionId ? (', '{menuId === session.sessionId ? (')
    replace('还有 {sliced.hiddenCount} 段，用顶栏「对话」查看全部', '还有 {sliced.hiddenCount} 个，用顶栏「{props.jumpable ? "对话" : "房间"}」查看全部')
    replace('+ 新开对话', '{props.jumpable ? "+ 新开对话" : "+ 新开房间"}')
    replace('<p className="hint rosterSessionsEmpty">还没有对话</p>', '<p className="hint rosterSessionsEmpty">{props.jumpable ? "还没有对话" : "还没有房间"}</p>')
  }
  if (id.endsWith('/SessionList.tsx')) {
    code = `import { SessionRename, usePrototypeEscape } from ${helpers};\n` + code
    const start = code.indexOf('export function SessionJumpMenuItem(')
    const end = code.indexOf('/**', start)
    if (start < 0 || end < 0) throw new Error('Missing session action boundary')
    code = code.slice(0, start) + 'export const SessionJumpMenuItem = SessionRename\n\n' + code.slice(end)
    replace('const jumpOn = props.enableJump !== false', 'const jumpOn = true\n  usePrototypeEscape(() => setMenuId(null))')
    replace('+ 新开对话', '{props.enableJump === false ? "+ 新开房间" : "+ 新开对话"}')
  }
  if (id.endsWith('/Conversation.tsx')) {
    code = `import { usePrototypeEscape } from ${helpers};\n` + code
    replace('roomId: string; createdAt: number;', 'roomId: string; title?: string; createdAt: number;')
    replace('}, [props.preferredSessionId, sessions])', '}, [props.preferredSessionId])')
    replace('title: `房间 ${row.roomId.slice(0, 8)}`', 'title: row.title ?? `房间 ${row.roomId.slice(0, 8)}`')
    for (const [active, others] of [['Memory', ['Routines', 'Peers']], ['Routines', ['Memory', 'Peers']], ['Peers', ['Memory', 'Routines']]]) {
      replace(`onClick={() => set${active}Open(open => !open)}`, `onClick={() => { ${others.map(name => `set${name}Open(false);`).join(' ')} set${active}Open(open => !open) }}`)
    }
    replace('  const switcherRef = useRef<HTMLDivElement>(null)', `  usePrototypeEscape(() => {
    const trigger = memoryOpen ? 'memory-open' : routinesOpen ? 'routines-open' : peersOpen ? 'peers-open' : null
    setMemoryOpen(false); setRoutinesOpen(false); setPeersOpen(false)
    setSwitcherOpen(false); setCurrentMenuOpen(false)
    if (trigger) document.querySelector<HTMLElement>('#dsh-bot-integrated-prototype [data-testid="' + trigger + '"]')?.focus()
  })
  const switcherRef = useRef<HTMLDivElement>(null)`)
    replace('<span className="sessionSwitchLabel">对话</span>', '<span className="sessionSwitchLabel">{isGroup ? "房间" : "对话"}</span>')
    replace('            新开对话', '            {isGroup ? "新开房间" : "新开对话"}')
    replace('{!isGroup && sessionId !== null ? (', '{sessionId !== null ? (')
    replace('{!isGroup && currentMenuOpen && sessionId !== null ? (', '{currentMenuOpen && sessionId !== null ? (')
    replace('{...isGroup ? { storageKey: groupDraftStorageKey(group.id), members } : {}}', 'key={sessionId ?? identityId}\n        storageKey={`prototype-draft:${identityId}:${sessionId ?? "pending"}`}\n        {...isGroup ? { members } : {}}')
  }
  if (id.endsWith('/App.tsx')) {
    code = code.replaceAll('onActiveSession={setActiveSessionId}', 'onActiveSession={id => { setActiveSessionId(id); if (id !== null) setPreferredSessionId(id) }}')
    replace('title: `房间 ${row.roomId.slice(0, 8)}`', 'title: row.title ?? `房间 ${row.roomId.slice(0, 8)}`')
    replace('  const [refreshEpoch, setRefreshEpoch] = useState(0)', `  const [refreshEpoch, setRefreshEpoch] = useState(0)
  useEffect(() => {
    const refresh = () => setRefreshEpoch(n => n + 1)
    window.addEventListener('prototype:session-renamed', refresh)
    return () => window.removeEventListener('prototype:session-renamed', refresh)
  }, [])`)
  }
  return code
}
