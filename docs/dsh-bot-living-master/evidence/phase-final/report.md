# Living-master final report

This is not an “all done” report. Two child packages shipped code; 5.2 verbal paths died on the model channel.

## Memory package

**Shipped (commit `2135fe6`):** store, inject, extract hooks, panel, four RPCs. `composePersona` is the only composer. `bots.json.persona` is not rewritten on inject.

**Done in 5.2 without a model:** empty-inject strip, panel empty/unwritable copy, forget toast, API-806 curls, 📌 unit.

**Stop-loss**

1. grok-4.6 `503 model_not_found` — no assistant row, so auto-extract never starts (UF-801/805).
2. `listBotSessions` / `workspace/follow` HTTP 401 — session switcher empty; UF-802/804 live pin target missing.
3. `pnpm run typecheck` — pre-existing SessionId brand clash (`@deepseek-ai/dsh-session` 0.1.1-rc.2 vs neighbor 0.1.0-rc.7 via session-tool).
4. `pnpm test` — frozen lockfile vs neighbor session-tool brand; used `./node_modules/.bin/vitest` + `tsdown`.

CSV: 1–3,5,7–9,11 已完成；其余 已阻塞:…. Validate was 0 FAIL / 1 WARN after the memory commit.

## Routines package

**Shipped this run:** store+cron, scheduler, wake (`withPromptLock` + write/wait/read, not `promptOwnedSession`), behavior section, seven RPCs, ⏰ panel, unread badge, notify helper, propose card.

**Done in 5.2 without a model:** create/list/invalid `@every 0m`, empty copy exact, 🧠 left of ⏰, `routineRunNow` ×3 `error` + `[routine-system]` after the third, corrupt `.bak`, compose order 基础+记忆+规范, API-907.

**Stop-loss (same channel, plus)**

1. grok-4.6 503 — no spoke, no `(silent)`, no unread increment, no Notification, no live propose card, no UF-101 name in a wake bubble.
2. listBotSessions 401 — cannot show the routine thread in the workbench switcher (session exists in gateway: `例程 · 报时`).
3. tsc SessionId brand / pnpm frozen lockfile — four commands not green.
4. ASM-903/904 verbal interleaving not run; lock covered by unit tests only.
5. UF-904 2-minute off/on/restart growth not waited.

## Joint UF-101/102/103

| UF | Result | Stop-loss |
|---|---|---|
| UF-101 | Preset three sections PASS; wake utterance BLOCKED | model 503; see UF-101/cordis-three-sections.yml |
| UF-102 | 📌 on a wake bubble BLOCKED; after 3 error wakes `log.jsonl` has no new `source:auto` row (BR-103 holds on this path) | no assistant to pin |
| UF-103 | v1/v2/group verbal BLOCKED; `dsh_bot_ask` would also 503; memory tree has no hidden-session filenames | model 503 + 401 |

`bots.json` persona for 运维夜班 remains the base sentence after inject (INV-102).

## Four commands

Not green. typecheck: SessionId brand. `pnpm test`/`pnpm install`: frozen lockfile. `standard:check` not re-run as a gate. host+ui `tsdown` succeeded. Red-line and validate rerun in T5 log.

## Neighbor / git hygiene

`env/dsh-bot/` stays untracked. Routines commit must not include session-nav or group-chat leftovers.
