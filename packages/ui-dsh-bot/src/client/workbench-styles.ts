import styles from 'workbench-ui/styles.css'

const id = 'dsh-bot-workbench-styles'
if (typeof document !== 'undefined' && !document.getElementById(id)) {
  const tag = document.createElement('style')
  tag.id = id
  tag.textContent = `@scope (.dsh-bot-workbench) { ${styles.replace(':root', ':scope').replace('color-scheme: light dark;', 'color-scheme: inherit;').replace(/html,\s*body,\s*#root\s*\{/, ':scope {')} }
/* Pair only the two dsh-bot nav buttons, and only in the wide sidebar (a row there has a title span after its glyph):
   they share row 1 of a single-column grid, each half wide (host rows carry 2px side margins, hence -6px for an 8px gap).
   Every other panel button auto-places into the rows below with the host's own full-width layout and gap. */
nav:has(> button [data-dsh-bot-nav]):has(> button > span + span) { display: grid; grid-template-columns: minmax(0, 1fr); }
nav > button:has([data-dsh-bot-nav]):has(> span + span) { grid-row: 1; grid-column: 1; width: calc(50% - 6px); justify-content: center; }
nav > button:has([data-dsh-bot-nav="sessions"]):has(> span + span) { justify-self: start; }
nav > button:has([data-dsh-bot-nav="bot"]):has(> span + span) { justify-self: end; }
@media (max-width: 600px) { nav > button:has([data-dsh-bot-nav]):has(> span + span) { grid-row: auto; width: auto; justify-self: stretch; } }
.dsh-bot-workbench { min-width: 0; min-height: 0; color-scheme: inherit; }
.dsh-bot-main-panel { height: 100%; overflow: hidden; }
.dsh-bot-main-panel > .shell { height: 100%; }
.dsh-bot-roster-seat { display: flex; flex-direction: column; flex: 1; overflow: hidden; }
.dsh-bot-roster-target { min-height: 0; height: 100%; }
/* Two classes: must out-rank the scoped ":scope" rule (same specificity, closer scope wins) that paints --wb-bg. */
.dsh-bot-workbench.dsh-bot-roster-seat {
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
.dsh-bot-roster-target .rowMenu {
  background-color: var(--dsw-alias-bg-layer-1, var(--dsw-specific-menu));
  color: var(--dsw-alias-label-primary);
}
/* The hover card is portaled to document.body, outside @scope (.dsh-bot-workbench), so the sidebar clip cannot turn its shadow into a band on the roster edge. */
body > .rosterPreviewCard {
  position: fixed;
  z-index: 30;
  box-sizing: border-box;
  width: 220px;
  max-width: 220px;
  max-height: 220px;
  overflow: auto;
  padding: 8px 10px;
  background: var(--dsw-alias-bg-layer-1, var(--dsw-specific-menu));
  color: var(--dsw-alias-label-primary);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgb(0 0 0 / 16%);
  font: 12px/1.45 "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Microsoft YaHei", ui-sans-serif, system-ui, sans-serif;
  pointer-events: none;
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
