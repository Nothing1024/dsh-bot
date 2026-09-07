# Wave P1 (Tasks 6–8)

时间: 2026-08-29  
网关: `dsh-rpc-who.sh 3084` → `DSH_HOME=<本仓>/env`（pid=79642，本仓，未改口）

## 本波产物
- `env/.agent-presets/dsh-bot/`：`agentPreset.copy` from standard，只改 persona + `preset.yml`
- `agent-presets.default: dsh-bot`：`settings.example.yaml`、现场 `settings.yaml`、`setup.sh` 邻仓种子后 stamp
- UF-001：`evidence/UF-001/success.png` + `session-history.json`
- Phase 回归：`phase-summary.md`；官方栏非 `~` 会话仍在

## Review p1 修补
- Task 6：unattended 指定原文已落盘；`persona.md` 是事后改写入口，不是完成门闩。未改 spec 第 2 章 BR/UF。
- BR-002 第一跑：`setup.sh` 从邻仓拷 settings 后写入 `agent-presets.default: dsh-bot`。干跑见 `setup-default.md`。

## Dual-gate
| 门 | 结果 |
|---|---|
| `python3 ~/.agents/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-mvp` | 0 FAIL / 0 WARN / 21 PASS |
| `pnpm test` | vitest 无 `packages/*/tests/**/*.spec.ts`（P2 尚未建包），exit 1 预期，不构成本波门闩 |
| setup stamp 干跑 | 邻仓拷贝无 `agent-presets` → 写入 `default: dsh-bot`；幂等；现场 settings 未改字节 |
| `session.create {}` | `agentPreset: dsh-bot` |

未 commit 凭据 / `env/settings.yaml` / sessions / storages。未 push。
