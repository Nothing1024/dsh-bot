# Wave 2-4 / P1 closer

Date: 2026-09-01. No commit.

## Board

- Tasks 2–3 `已完成`
- Task 4 `已阻塞:{UF-401 ~dsh-bot: hidden sessions.open 不落地 list.current}`
- Tasks 5–14 still `待开始` (this wave is 2–4 only)

## Residue that this pass closed

- `jumpToSession` now always `sessions.open` (no `openSubagent`).
- Bridge `executeJump` then ack. If `list.getSnapshot().current !== sessionId` → `ok:false` `会话不存在或已删除`.
- Tab stores last result on `window.__dshBotJumpLast` so live evidence is not `Frame was detached`.
- Visible jump: `current=session-91293f51-…` and official conversation title matches (`jump-visible.png`).
- Deleted id `session-missing-nav-p1`: `deleted-jump.json` `{ok:false, reason:会话不存在或已删除}`.
- Roster nested ⋯「在 DSH 打开」; group `enableJump:false`.

## Residue that remains (honest block)

Workbench includeHidden rows today are `~dsh-bot:` delegated (`session-5384934e-…` 委托成功四字回复). After `sessions.open`:

```json
{"type":"dsh-bot:jump-result","ok":false,"reason":"会话不存在或已删除"}
```

`list.current` does not become that id (unlike ASM-401 calib `~ calib-nav-hidden`, which did). Official chrome is the empty workspace (`jump-hidden.png`), same as `phase-0/asm401-hidden-open.png` visually, but **current does not land** so UF-401 hidden-reach is not met for the hidden rows the workbench can list. `revealSession` is Task 7; this wave must not fake success.

## Evidence

`live-jump.json` summary: visibleOk/rosterMenu/standaloneCopy/deletedOk true; hiddenOk false.
`deleted-jump.json`, `jump-visible.png`, `jump-hidden.png`, `roster-jump-menu.png`, `standalone-fallback.png`.
