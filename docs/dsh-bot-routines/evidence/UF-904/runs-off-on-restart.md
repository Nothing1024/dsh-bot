# UF-904 switch + restart live

- off wait 120s: runs 0 → 0 (expect same) — earlier remaining-pass / mop
- on wait ≤130s: runs grew — earlier remaining-pass / mop
- restart rearm (this process): recycled :3084 (`sh env/boot.sh`, pid 5302 / node 5337, DSH_HOME this repo `env`)
  - before restart: `r-1788703764909-hba0u1c9` 重启续跑 `@every 1m` enabled, runs=0
  - after boot: enabled, runs=0 (`rearm-after-boot.json`)
  - after 64s: runs 0→1 lastOutcome=spoke ms=14519 (`rearm-after-wait.json`)
  - constructor `rearmAll()` armed the enabled row; first due fire spoke

See `rearm-before.json`, `rearm-before-restart.json`, `rearm-after-boot.json`, `rearm-after-wait.json`.
