import styles from 'workbench-ui/styles.css'

const id = 'dsh-bot-workbench-styles'
if (typeof document !== 'undefined' && !document.getElementById(id)) {
  const tag = document.createElement('style')
  tag.id = id
  tag.textContent = `@scope (.dsh-bot-workbench) { ${styles.replace(':root', ':scope').replace('color-scheme: light dark;', 'color-scheme: inherit;').replace(/html,\s*body,\s*#root\s*\{/, ':scope {')} }
nav:has(> button [data-dsh-bot-nav]) { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
nav:has(> button [data-dsh-bot-nav]) > button { grid-column: 1 / -1; }
nav:has(> button [data-dsh-bot-nav]) > button:has([data-dsh-bot-nav="sessions"]) { grid-column: 1; justify-content: center; }
nav:has(> button [data-dsh-bot-nav]) > button:has([data-dsh-bot-nav="bot"]) { grid-column: 2; justify-content: center; }
@media (max-width: 600px) { nav:has(> button [data-dsh-bot-nav]) { grid-template-columns: 1fr; } nav:has(> button [data-dsh-bot-nav]) > button:has([data-dsh-bot-nav="bot"]) { grid-column: 1; } }
.dsh-bot-workbench { min-width: 0; min-height: 0; color-scheme: inherit; }
.dsh-bot-main-panel { height: 100%; overflow: hidden; }
.dsh-bot-main-panel > .shell { height: 100%; }
.dsh-bot-roster-seat { display: flex; flex-direction: column; flex: 1; overflow: hidden; }
.dsh-bot-roster-target { min-height: 0; height: 100%; }
.dsh-bot-roster-target > .roster { width: 100%; height: 100%; border: 0; background: transparent; }
`
  document.head.appendChild(tag)
}
