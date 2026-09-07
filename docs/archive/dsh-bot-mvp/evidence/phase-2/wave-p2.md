# Wave P2 (Tasks 9–12)

时间: 2026-08-29  
网关: `dsh-rpc-who.sh 3084` → `DSH_HOME=<本仓>/env`（演练中曾停口，结束后已重启）

## 本波产物
- `packages/dsh-bot-host`：`ctx.dshBot`，BR-010 override（selectModel + 恢复全局，互斥），失败点名 `MISSING_CREDENTIAL`
- `packages/tool-dsh-bot`：`dsh_bot_ask` + bundle patch 两行 insert
- gb profile link/bundles 接线；UF-002 真链与失败分支证据在 `evidence/UF-002/`

## Dual-gate
| 门 | 结果 |
|---|---|
| `python3 ~/.agents/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-mvp` | 0 FAIL / 0 WARN / 21 PASS |
| `pnpm -r run build && pnpm -r test && pnpm -r run typecheck` | 全绿；host 17 tests / tool 5 tests | `regression.log` `host-unit.log` `tool-unit.log` |

未 commit 凭据 / `env/.env` / `env/settings.yaml` / sessions / storages。未 push。
