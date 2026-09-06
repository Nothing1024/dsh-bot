# Phase 0 calibration (ASM-901~904)

Date: 2026-09-06. Executor: generic. Gateway identity: `DSH_HOME=.../dsh-grok-bot/plugin/env` on :3084.

## ASM-901 host tick / settings hot-reload

Not left in `packages/`. Constructor calls `scheduler.rearmAll()` once; `installSettingsSection({ onChange: () => scheduler.rearmAll() })`; `ctx.on('dispose', disarmAll)`. Scheduler tests cover rearmAll idempotency and disable-zero-fire.

Live `setInterval(..., 60000) × 3` plus a settings rewrite was **not** run this pass (time-box; model/gateway already occupied by 5.2). No leftover tick remains (`rg setInterval packages/dsh-bot-host/src` is empty of debug ticks).

## ASM-902 write/wait/read

Ran `bash scripts/manual-test.sh --no-write` → 46 通过 / 6 失败. Failures: UF-006 listBotSessions override fields, WB-listBotSessions-含新会话 (workspace/follow 401). createSession / createBot / write path probes that do not wait on the model succeeded. Log: evidence/phase-0/manual-test-no-write.log.

## ASM-903 silent rate

**Blocked.** Workbench prompts to grok-4.6 return `503 model_not_found` / no assistant row. Cannot count exact `(silent)` verbal replies. Unit coverage: `routine-wake.spec.ts` (`isSilentReply` exact `(silent)` only).

## ASM-904 lock interleaving

**Blocked.** Same model 503: cannot overlap a long user turn with a live wake write. Code path uses exported `withPromptLock` around `sessionTool.write/wait/read` (not `promptOwnedSession`). Scheduler `running` set blocks reentry. Unit: `routine-scheduler.spec.ts` reentry + `routine-wake.spec.ts`.

## Leftover

`git diff --stat packages/` at commit time must not contain a debug tick.
