Was blocked on grok-4.6 503. Re-run after the model recovered:

- First live `routineRunNow` still `error` because wake treated session-tool `completed` as failure (see routines fix).
- After `wakeWaitFailed` (accept `idle`|`completed`), scheduled + `routineRunNow` both `spoke`.
- Named utterance: `Nothing，现在是 2026-09-06 19:12 CST。`
- `listBotSessions` / `workspace/follow` HTTP 401 remains; thread not listed in the switcher.
