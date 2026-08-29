# Phase 2 Summary

## 完成任务
- Task 9 实现 dsh-bot-host：`DshBotService`（`ctx.dshBot`）、settings namespace `dsh-bot`（live）、askBot create→marks merge→archiveSession→ASM-007 selectModel+restore→write→wait idle→read
- Task 10 实现 tool-dsh-bot：`dsh_bot_ask` generic 卡片、`cordis.patch.yml` insert `dsh-bot-host` 然后 `tool-dsh-bot`、双 manifest、无 provides
- Task 11 gb profile 接线 `tool-dsh-bot` + link `dsh-bot-host`（overlay 不再 insert 同行）；pluginInventory 两行 active；UF-002 真链
- Task 12 Phase 2 回归：`pnpm -r build/test` + UF-001/UF-002 复放

## 验证命令
| 命令 | 结果 | 日志 |
|---|---|---|
| `pnpm --filter dsh-bot-host run build && test` | 14 tests 全绿 | `host-unit.log` |
| `pnpm --filter tool-dsh-bot run build && test` | 5 tests 全绿 | `tool-unit.log` |
| `dsh-rpc-who.sh 3084` | `DSH_HOME=<本仓>/env` pid=32559 | `rpc-who.txt` |
| `pluginInventory/list` | `include:dsh-bot-host` / `include:tool-dsh-bot` fiberPhase=active | `plugin-inventory.json` |
| `pnpm -r run build && pnpm -r test` | 全绿（含邻仓 workspace 包单测） | `regression.log` |
| `pnpm -r run typecheck` | 0 error | `regression.log` |

## 用户路径 / API 验证
| UF/API | 结果 | Evidence |
|---|---|---|
| UF-002 主路径 | 模型调用 `dsh_bot_ask`，工具返 `dsh bot pong.`；marks `kind:dsh-bot`+`kind:hidden`；`workspace.archiveSession`；官方栏无 `~dsh-bot:` | `../UF-002/tool-call.md` `marks.txt` `rail-check.png` |
| UF-002 等待超时 | `askTimeoutMs=200` → `wait-timeout` 附会话 id，marks 仍在 | `../UF-002/timeout.md` |
| UF-002 并发 | A/B 各建独立会话，答案不串 | `../UF-002/concurrent.md` |
| UF-002 网关不可达 | **真停** `:3084` 后 CLI headless `session create` 与 `askBot` 均 `web-unreachable` | `../UF-002/gateway-down.md` `gateway-down.log` |
| UF-002 断 key | 工具卡 `missing-credential: MISSING_CREDENTIAL … BOT_MISSING_KEY` | `../UF-002/missing-key.md` |
| UF-001 复放 | 新会话 `agentPreset=dsh-bot`，「你是谁?」有回复 | `uf001-replay-history.json` |
| UF-002 复放 | `dsh_bot_ask` 返 `phase2 pong`，`isError` false | `uf002-replay-history.json` |
| BR-010 非法 override | `no-such-provider/no-such-model` fail loud，不静默回落 | `../UF-002/override-invalid-history.json` |
| settings `dsh-bot` | `applies=live`；空 model 跟随全局 | plugin boot 后 `settings.describe` |

## Review p1 修补
- `askBot` 失败从 `turn/end.reason.error` 抽出 `MISSING_CREDENTIAL` 并点名凭据；`wait.lastTurnEndReason` 写入错误文本。
- `applyModelOverride` 进程内互斥，并发委托不会把别人的 override 写回 `agent-default-model`。
- `gateway-down.md` 改为真停 gb 网关 + `dsh-session` headless + `askBot` 打死口 3084。

## 剩余风险
- ASM-005（better-sidebar × 0.1.1-rc.2）仍留 Task 15。
- Task 13 才挂 `/dsh-bot/*` HTTP；本 Phase 委托入口是 agent 工具。
- INV-001：本波未编辑 session-tool / vibee / genoffice。session-tool 与 genoffice `git status --porcelain` 为空；vibee 有既有 canvas-revamp 脏文件（Phase 1 已记账），非本波写入。
- `env/settings.yaml` 被 settings.update 写入了 `dsh-bot:` 分节（gitignore，未入 git）。
- 官方栏截图时主会话标题可能仍显示「新会话」；核对点是 **没有** `~dsh-bot:` 标题（`HAS_TILDE_TITLE=false`）。
