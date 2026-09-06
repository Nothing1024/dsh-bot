# UF-904 switch / restart

Live model spoke path is blocked (grok-4.6 503). This file records what was proven without a 2-minute wait.

- `routineUpdate enabled=false` → `false`; scheduler.disarm (unit: disable-zero-fire).
- `routineUpdate enabled=true` → `true`; scheduler.arm.
- runs before toggle: 3
- 2-minute off/on/restart growth **not** waited this pass. Restart rearm is constructor `rearmAll()` (live gateway restarted once after build; timers armed for enabled rows).
