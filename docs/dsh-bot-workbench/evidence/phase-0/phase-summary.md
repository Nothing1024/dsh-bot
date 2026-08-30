# Phase 0 Summary

## 完成任务
- Task 1 勘察校准：`session.list.items[].agentPreset` 为 BR-203 反查通道；working = `running` 或未闭合 `turn/start`；iframe 同源 POST `/dsh-bot/listSessions` 成功。ASM-201/203 消解，ASM-202 改写为 Task 5 实现风险。
- Task 2 `workbench-ui` SPA 骨架（roster 280px + 对话面，空/错态）+ host `GET /dsh-bot/ui` 静态服务（require.resolve，禁穿越）。
- Task 3 `DshBotTab` 改为 iframe `src=/dsh-bot/ui` + 加载/超时错误/重试；tab id `dsh-bot:sessions` 与 badge 轮询（面板收起暂停）保留。
- Task 4 杀本仓 3084 后 reboot；双入口空壳复现；`pnpm -r run build && pnpm -r test` 全绿；页签切入工作台无 console error。

## 验证命令
| 命令 | 结果 | 日志 |
|---|---|---|
| `dsh-rpc-who.sh 3084` | DSH_HOME=本仓 env | `calibration.md` / `static-route.log` |
| `dsh-rpc.sh 3084 session.list '{}'` | 75 行均有 `agentPreset` | `calibration.md` |
| Playwright `/dsh-bot/calib` iframe fetch listSessions | `calibOk=true`（临时路由已删） | `calib-iframe.json` |
| `curl -s http://127.0.0.1:3084/dsh-bot/ui \| head -1` | `<!doctype html>` | `static-route.log` |
| `pnpm --filter workbench-ui/dsh-bot-host/ui-dsh-bot test` | 全绿 | 终端 |
| `pnpm -r run build && pnpm -r test` | 7 workspace 构建+测试全绿 | 终端 |
| Playwright 直开 + 页签 iframe | 双入口 idle 空 roster；console errors=[] | `dual-entry.json` / `tab-iframe.png` / `skeleton.png` |

## 用户路径 / API 验证
| UF/API | 结果 | Evidence |
|---|---|---|
| GET `/dsh-bot/ui` | 200 text/html，首行 doctype | `static-route.log` |
| GET `/dsh-bot/ui/workbench.js` | 200 javascript | `static-route.log` |
| v1 POST `/dsh-bot/listSessions` | 仍 `{ok,value:{sessions,botModel}}` | `static-route.log` |
| UF-201 双入口空壳 | 直开与页签 iframe 同为空 roster | `skeleton.png` `tab-iframe.png` |
| 页签切换无 console error | errors=[] | `dual-entry.json` |
| 页签 id | `DSH_BOT_SESSIONS_TAB_ID = dsh-bot:sessions` | apply-sidebar 单测 |

## 剩余风险
- ASM-202 仍在 1.4：preset 整文件生成 + 写后校验回滚（Task 5）。
- P0 roster 为空态（尚无 listBots）；身份/对话/CRUD 在后续 Phase。
- `pnpm -r run build` 会构建 workspace 内邻仓 session-tool 包；其 `lib/` 被 gitignore，邻仓 porcelain 未脏。
