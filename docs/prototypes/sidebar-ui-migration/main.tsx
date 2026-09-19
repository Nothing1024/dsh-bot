import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '../../../packages/workbench-ui/src/App.tsx'

function MigrationPrototype() {
  const [mode, setMode] = useState('bot')
  const [tools, setTools] = useState(false)
  useEffect(() => {
    const root = document.getElementById('dsh-bot-integrated-prototype')!
    const sync = () => {
      const inherited = getComputedStyle(root.parentElement!).colorScheme
      root.style.colorScheme = inherited === 'normal' ? 'light dark' : inherited
    }
    const observer = new MutationObserver(sync)
    for (let node = root.parentElement; node; node = node.parentElement) observer.observe(node, { attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'data-color-mode'] })
    sync()
    return () => observer.disconnect()
  }, [])
  return <>
    <div className="migration-caption"><span>DSH · 现有 Bot 工作台移入中间</span><span>原组件交互原型 · 数据仅在本页</span></div>
    <div className={`migration-grid ${mode === 'bot' ? 'is-bot' : 'is-session'} ${tools ? 'with-tools' : ''}`}>
      <header className="dsh-brand"><strong>deepseek <small>HARNESS</small></strong><nav className="dsh-mode-tabs" role="tablist" aria-label="工作模式">{[['session', '会话'], ['bot', 'Bot']].map(([id, label]) => <button key={id} id={`migration-tab-${id}`} type="button" role="tab" aria-selected={mode === id} aria-controls="migration-mode-content" onClick={() => setMode(id)} onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); const next = id === 'bot' ? 'session' : 'bot'; setMode(next); document.getElementById(`migration-tab-${next}`)?.focus() } }}>{label}</button>)}</nav>{mode === 'session' && <button className="dsh-new" type="button" onClick={() => setMode('session')}>＋ 新会话</button>}</header>
      <div id="migration-mode-content" role="tabpanel" aria-labelledby={`migration-tab-${mode}`} className="migration-content">
      <div className="migration-app"><App /></div>
      {mode === 'session' && <><aside className="dsh-workspaces">工作区<br /><br />plugin</aside><main className="dsh-native"><h2>探索未至之境</h2><span>plugin</span><textarea aria-label="Harness 消息" placeholder="描述你想要构建的内容" /></main></>}
      </div>
      <aside className="dsh-tools"><button type="button" aria-label={tools ? '收起 DSH 工具' : '展开 DSH 工具'} onClick={() => setTools(!tools)}>{tools ? '收起' : '›'}</button>{tools && <><strong>文件</strong><span>plugin</span><span>packages</span><span>workbench-ui</span><span>ui-dsh-bot</span></>}</aside>
    </div>
  </>
}
createRoot(document.getElementById('dsh-bot-integrated-prototype')!).render(<MigrationPrototype />)
