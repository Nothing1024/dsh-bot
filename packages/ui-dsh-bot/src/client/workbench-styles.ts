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
.dsh-bot-roster-seat {
  --wb-bg: transparent;
  --wb-panel: transparent;
  --wb-text: var(--dsw-alias-label-primary);
  --wb-muted: var(--dsw-alias-label-secondary);
  --wb-border: var(--dsw-alias-border-l2);
  --wb-hover: var(--dsw-specific-sidebar-nav-item-hover, var(--dsw-alias-interactive-bg-hover));
  --wb-accent: var(--dsw-alias-label-primary);
  background: transparent;
  color: var(--wb-text);
}
.dsh-bot-roster-target > .roster,
.dsh-bot-roster-target .rosterHead,
.dsh-bot-roster-target .rosterBody,
.dsh-bot-roster-target .newBot {
  background-color: transparent;
}
.dsh-bot-roster-target .rowMenu,
.dsh-bot-roster-target .rosterPreviewCard {
  background-color: var(--dsw-alias-bg-layer-1, var(--dsw-specific-menu));
  color: var(--dsw-alias-label-primary);
}
.dsh-bot-roster-target .rosterName,
.dsh-bot-roster-target .rosterSession,
.dsh-bot-roster-target .rowMenu button {
  color: var(--dsw-alias-label-primary);
}
.dsh-bot-roster-target .rosterPreview,
.dsh-bot-roster-target .rosterTime,
.dsh-bot-roster-target .rosterSectionHead,
.dsh-bot-roster-target .categoryCount {
  color: var(--dsw-alias-label-secondary);
}
.dsh-bot-roster-target > .roster { width: 100%; height: 100%; border: 0; }


`
  document.head.appendChild(tag)
}
