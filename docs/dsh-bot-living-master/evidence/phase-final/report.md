# Living-master final report

This is not an “all done” report. Two child packages shipped; joint verbal paths were re-run after grok-4.6 recovered. Four commands and the workbench session switcher are still blocked.

## Memory package

**Shipped (commit `2135fe6`):** store, inject, extract hooks, panel, four RPCs. `composePersona` is the only composer. `bots.json.persona` is not rewritten on inject.

**5.2 without a model (earlier):** empty-inject strip, panel copy, forget toast, API-806, 📌 unit.

**5.2 after model recovery:** 运维夜班 memory panel shows two 「你标记的」 rows (name + pinned wake line).

**5.2 after gateway replay (bg_7 / :3084):** user turn on `uf103-auto-extract` produced `source:auto` log + two profile facts (`living-master-replay`, CST). Hidden worker title `~dsh-bot-memory: yunwei-yeban` is not a memory directory.

**Still blocked**

- v1 `listSessions` still `workspace/follow` HTTP 401. Workbench `listBotSessions` now falls back to official `session.list`.
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
| UF-101 | PASS named wake + switcher | `Nothing，现在是 2026-09-06 19:12 CST。`; cordis 基础+记忆+规范; switcher shows `例程 · 报时` (`evidence/UF-101/session-switcher.png`) |
| UF-102 | PASS pin + no auto extract + compose stable | `log.jsonl` two `explicit` rows after second spoke; no `source:auto`; 📌 row in MemoryPanel; save persona keeps order + pinned text; `bots.json.persona` base unchanged |
| UF-103 | PASS v1/v2/group + auto-extract + delete leftover | v1 `dsh_bot_ask` → `dsh bot pong.`; hidden `~dsh-bot: uf103-v1-hidden` isolated. Auto-extract `source:auto`. After gateway restart (pid 33601) deleteBot leaves routine `enabled=false` and drops the memory dir. |

## Four commands

Not green. typecheck: SessionId brand. `pnpm test`/`pnpm install`: frozen lockfile. `standard:check` not used as a gate. host `tsdown` succeeded after the wait fix. Red-line and validate remain 0 FAIL from the earlier T5 log.

## Neighbor / git hygiene

`env/dsh-bot/` stays untracked. Do not mix session-nav / group-chat leftovers into these commits.


## After fallback + restart

Workbench `listBotSessions` no longer dies on `workspace/follow` 401: it intersects `bot:<id>` marks with official `session.list` titles (`listViaPlatform`). Evidence: `UF-103/listBotSessions-after-fallback.json`, `UF-101/session-switcher.png`.

`deleteBot` on the new process keeps the routine row at `enabled=false` (`UF-103/delete-bot-after-restart.md`).

Still not all-green: `pnpm run typecheck` SessionId brand (host 0.1.1-rc.2 vs workspace session-tool 0.1.2-rc.1); `pnpm test` frozen lockfile vs neighbor session-tool; v1 `listSessions` RPC still 401; `(silent)` / notification / live propose card not re-driven.
