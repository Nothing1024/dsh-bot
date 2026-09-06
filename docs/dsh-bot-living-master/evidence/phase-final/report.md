# Living-master final report

This is not an “all done” report. Two child packages shipped; joint verbal paths were re-run after grok-4.6 recovered. Four commands and the workbench session switcher are still blocked.

## Memory package

**Shipped (commit `2135fe6`):** store, inject, extract hooks, panel, four RPCs. `composePersona` is the only composer. `bots.json.persona` is not rewritten on inject.

**5.2 without a model (earlier):** empty-inject strip, panel copy, forget toast, API-806, 📌 unit.

**5.2 after model recovery:** 运维夜班 memory panel shows two 「你标记的」 rows (name + pinned wake line). Auto-extract still not proven on a user turn this run.

**Still blocked**

- `listBotSessions` / `workspace/follow` HTTP 401 — switcher empty.
- `pnpm run typecheck` — SessionId brand clash.
- `pnpm test` — frozen lockfile vs neighbor session-tool; used `./node_modules/.bin/vitest` + `tsdown`.

## Routines package

**Shipped (commit `2660b81`):** store+cron, scheduler, wake (`sessionTool.write`, not `promptOwnedSession`), behavior section, seven RPCs, ⏰ panel, unread, notify helper, propose card.

**Follow-up fix (this run):** `wakeWaitFailed` — session-tool `until:'idle'` settles as `completed` on a finished turn. Treating only `idle` as success recorded every live wake as `error` even when the assistant had already said `Nothing，现在是 …`. `deleteBot` now `enabled=false` + disarm instead of `remove`.

**5.2 after model recovery**

- Empty copy / create / `@every 0m` / 🧠 left of ⏰ / API-907: already proven earlier.
- `routineRunNow` → `spoke` (7–8s) after the wait fix; unread incremented.
- Panel 「上次：… spoke」.
- 3× error system line is visible (`[routine-system]` no longer hidden as a wake cue).
- `(silent)` / Notification / live propose card: not re-driven this run (schedule disabled after spoke evidence).

## Joint UF-101/102/103

| UF | Result | Notes |
|---|---|---|
| UF-101 | PASS named wake + three-section preset | `Nothing，现在是 2026-09-06 19:12 CST。`; cordis 基础+记忆+规范; switcher 401 so no thread bubble screenshot |
| UF-102 | PASS pin + no auto extract + compose stable | `log.jsonl` two `explicit` rows after second spoke; no `source:auto`; 📌 row in MemoryPanel; save persona keeps order + pinned text; `bots.json.persona` base unchanged |
| UF-103 | PARTIAL | 编辑室「你们是谁？」 both members one round; v2 诗人小北 / 校对阿宁 isolated answers; memory tree has no hidden-session filenames; deleteBot removes memory dir. v1 `dsh_bot_ask` official tool card not finished (compose timeout). Live delete (old code) removed the routine row; fix now disables. |

## Four commands

Not green. typecheck: SessionId brand. `pnpm test`/`pnpm install`: frozen lockfile. `standard:check` not used as a gate. host `tsdown` succeeded after the wait fix. Red-line and validate remain 0 FAIL from the earlier T5 log.

## Neighbor / git hygiene

`env/dsh-bot/` stays untracked. Do not mix session-nav / group-chat leftovers into these commits.
