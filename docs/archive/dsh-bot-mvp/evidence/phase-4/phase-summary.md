# Phase 4 Summary

时间: 2026-08-29  
网关: `dsh-rpc-who.sh 3084` → `DSH_HOME=<本仓>/env`（Task 19/20 多次重启后仍为本仓 gb）

## 完成任务
- Task 17 建 standards 标准面（先前已完成）
- Task 18 manual-test / README / GitHub（先前已完成）
- Task 19 spec 5.2 真实场景全套测试（21/21 evidence 路径落盘）
- Task 20 Phase 4 回归验证（总收尾）

## 验证命令
| 命令 | 结果 | 日志 |
|---|---|---|
| `pnpm -r run build` | 退出码 0 | `task20-commands.log` |
| `pnpm -r run typecheck` | 退出码 0 | `task20-commands.log` |
| `pnpm -r test` / `pnpm test` | 6 files / 47 tests 全绿 | `task20-commands.log` |
| `pnpm run standard:check` | 0 FAIL | `standard-check.log` |
| `validate_package.py docs/dsh-bot-mvp` | 0 FAIL / 21 PASS | 二次跑包（Task 19 证据审计） |

## 用户路径 / API 验证
| UF/API | 结果 | Evidence |
|---|---|---|
| UF-001 主路径 | preset=dsh-bot，grok-4.6 流式回复「我是 DSH Bot」 | `../UF-001/success.png` `session-history.json` |
| UF-001 无凭据 | MISSING_CREDENTIAL 点名 `BOT_MISSING_KEY`，切回免重启恢复 | `../UF-001/missing-key.md` |
| UF-001 上游失败 | 本地 401 端点，会话保留 | `../UF-001/upstream-error.md` |
| UF-002 主路径 | 工具卡片完成、marks kind:dsh-bot、官方栏无 `~dsh-bot:` | `../UF-002/tool-call.md` `marks.txt` `rail-check.png` |
| UF-002 网关不可达 | CLI `web-unreachable` / fetch failed | `../UF-002/gateway-down.md` |
| UF-002 超时 | `askTimeoutMs=200` → wait-timeout 附会话 id | `../UF-002/timeout.md` |
| UF-002 并发 | A/B 独立会话，答案不串 | `../UF-002/concurrent.md` |
| UF-003 主路径 | 页签列表/跳转/新建 | `../UF-003/tab-list.png` `create-jump.png` |
| UF-003 RPC 失败 | 「无法加载会话列表」+ 重试 | `../UF-003/rpc-error.png` |
| UF-003 空数据 | 「还没有 DSH Bot 会话」+ 新建引导 | `../UF-003/empty.png` |
| UF-004 | marks list 主路径 + `(no marks)` 空分支 | `../UF-004/marks-list.txt` |
| UF-005 会话内切换 | grok-4.6 → deepseek-v4-flash | `../UF-005/switch-in-session.md` |
| UF-005 默认切换→委托 | 新委托 header=`deepseek-official/deepseek-v4-flash` | `../UF-005/default-switch.md` |
| UF-005 缺凭据 | MISSING_CREDENTIAL 点名 BOT_MISSING_KEY | `../UF-005/missing-cred.md` |
| UF-006 override 开 | 插件会话 override；GUI 直建仍全局 | `../UF-006/override-on.md` |
| UF-006 清空 | 回 global-default anthropic/grok-4.6 | `../UF-006/override-off.md` |
| UF-006 非法 | `override-invalid` 点名 no-such-provider | `../UF-006/override-invalid.md` |

## Task 19 修复
session-tool `durableCreate`/`session.create` 不带 model，live `settings.update agent-default-model` 后 RPC 直建会话已跟新默认，但 `dsh_bot_ask` 经 HTTP create 的委托会话仍落在旧默认。`applyModelOverride` 在 override 为空时改为把会话 `selectModel` 钉到当前 `snapshotGlobalDefault()` 再 restore（UF-005 次路径）。单测与真跑 header 已对齐。

## 不变量
- INV-001：未改 session-tool / vibee / genoffice 文件。session-tool 与 genoffice `git status --porcelain` 为空；vibee 仅预存 `?? .vibee/`（本仓未写入）。
- INV-003：本仓只听 3084。
- INV-004 / BR-005：`env/.env`、`settings.yaml`、sessions、storages、credentials 未入 git。
- BR-006：`packages/` `env/` `scripts/` 无 `anysphere` / `sand://`。
- BR-001：packages 源码无硬编码 xai/openai provider。

## closer 收口
- `final-regression.log`：`pnpm -r run build/typecheck` + `pnpm -r test` + `pnpm run standard:check` 全 EXIT 0（2026-08-29T15:46:40Z）。
- `review-report.md` + `final-summary.md` 已写。
- UF-003 `tab-list.png` / `create-jump.png` 与 UF-002 `rail-check.png` 由 closer 在本仓 :3084 GUI 重截（官方栏展开后无 `~dsh-bot:`）。

## 剩余风险
- 官方 GUI 会话栏仍不按标题 `~` 过滤；隐藏依赖 `workspace.archiveSession`（INV-002 已记录）。
- vibee 邻仓预存未跟踪 `.vibee/`，非本仓引入。
- `session.history` 默认窗口可能截掉 `agent-preset/selected`（P2，见 review-report BUG-001）。
