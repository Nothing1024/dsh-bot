# Phase 3 Summary

## 完成任务
- Task 13 实现 host RPC 面：`POST /dsh-bot/listSessions`、`POST /dsh-bot/createSession`，body `{args}`，响应 `{ok, value|error}`；listSessions value 含 `sessions` + `botModel {provider, model, source}`
- Task 14 实现 ui-dsh-bot：照抄 ui-vibee `dsh.client` + 空 host `cordis.patch.yml` 挂载；`ctx.inject(['betterSidebar'])` 注册 `dsh-bot:sessions`；loading/空/错误/新建防重；面板收起停轮询；zh/en locale
- Task 15 gb 挂 `dsh-better-sidebar@0.13.0` + `ui-dsh-bot`；pluginInventory 全 active（消解 ASM-005）；Playwright UF-003 列表→点行跳转→新建；BR-008 去掉 sidebar bundle 后 host/tool/preset 仍 active
- Task 16 Phase 3 回归：`pnpm -r test` 全绿 + UF-001/002/003 复放（history 等到 assistant/tool 事件）

## 验证命令
| 命令 | 结果 | 日志 |
|---|---|---|
| `pnpm --filter dsh-bot-host build && test` | 27 tests 全绿 | `host-rpc-unit.log` |
| `pnpm --filter ui-dsh-bot build && test` | 14 tests 全绿 | `ui-unit.log` |
| `curl POST /dsh-bot/listSessions {"args":{}}` | `{"ok":true,"value":{sessions,botModel}}` | `rpc-samples/listSessions.response.json` |
| `dsh-rpc-who.sh 3084` | `DSH_HOME=<本仓>/env` | `rpc-who.txt` |
| `pluginInventory/list` | better-sidebar / dsh-bot-host / tool-dsh-bot / ui-dsh-bot 均 active | `plugin-inventory.json` |
| `pnpm run typecheck` | 0 error | — |
| `pnpm -r test` | EXIT 0 | `regression.log` |

## 用户路径 / API 验证
| UF/API | 结果 | Evidence |
|---|---|---|
| UF-003 主路径 | 列表含 UF-003 jump；点击 `dsh-bot-row-session-cb74c0e8-…` 跳转；「新建」落在工作区 plugin 的「新会话」，composer 可输入（无「选择一个工作区开始」） | `../UF-003/tab-list.png` `create-jump.png` `playwright.log` |
| UF-003 RPC 失败 | 停 :3084 后面板「无法加载会话列表」+「重试」，不白屏 | `../UF-003/rpc-error.png` |
| UF-003 空数据 | 清空 marks.jsonl 后空态文案 + 新建引导 | `../UF-003/empty.png` |
| BR-008 | 去掉 sidebar bundle 后 host/tool/ui-dsh-bot 仍 active，preset=dsh-bot 仍默认 | `no-sidebar.md` `plugin-inventory-no-sidebar.json` |
| UF-001 复放 | `session.create` preset=`dsh-bot`；history 含 `assistant/message` + `turn/end`，正文 `phase3 uf001 ok` | `uf001-replay-history.json` |
| UF-002 复放 | history 含 `tool/call` `dsh_bot_ask` + `tool/result` + `phase3 pong` | `uf002-replay-history.json` |
| ASM-005 | 证实：sidebar 0.13.0 × dsh 0.1.1-rc.2 全 active 且页签实渲染 | spec v0.3.5 |

## 剩余风险
- better-sidebar 自带 terminal chunk 在 0.1.1-rc.2 上会打 `client module system unavailable`（内置终端页）；DSH Bot 页签不受影响。
- INV-001：本波未编辑 session-tool / vibee / genoffice 源码。
- HTTP createSession 在 args 无 cwd 时默认 `dirname(DSH_HOME)`（仓根 workspace），使 CLI/curl 与页签新建都进 workspace 视图。
