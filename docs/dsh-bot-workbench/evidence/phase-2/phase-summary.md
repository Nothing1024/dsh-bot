# Phase 2 Summary

## 完成任务
- Task 8 会话归属与创建链：`createBotSession {botId,title?}` 走网关 `session.create {agentPreset,cwd}`，marks `[kind:dsh-bot, bot:<id>]`，再应用 v1 `applyModelOverride`；`listBotSessions {botId}` 为 `bot:<id>` ∩ 会话元数据、时间倒序、默认排除 `kind:hidden`；`history`/`prompt` 经 sessionTool.read/write。v1 `listSessions`/`createSession` 保留。
- Task 9 transcript：Header 头像+名字+工作中；对话下拉 + 新开对话；user 右 / assistant 左、无大头像；thinking 默认折叠一行；工具一行摘要；2s/1s 轮询，`document.hidden` 暂停。working = 未闭合 `turn/start`（或 list `running`）。
- Task 10 composer：占位「给 {name} 发消息」；草稿 `localStorage` keyed by botId；Enter 发送 / Shift+Enter 换行；pending 气泡 → prompt → 轮询；running 禁发；失败展示 host 错误码并保留草稿。
- Task 11 Phase 2 回归：`pnpm -r run build/typecheck/test` 全绿；浏览器 UF-202 主路径（新建「诗人小北」→ 对话 → Header 身份与口吻回复）。

## 验证命令
| 命令 | 结果 | 日志 |
|---|---|---|
| `pnpm --filter dsh-bot-host run build && test` | 68 tests 全绿（含稳定 history id） | `session-api.log` |
| `curl POST /dsh-bot/createBotSession` | `ok:true` sessionId；marks `bot:dsh-bot,kind:dsh-bot`；`session.list.agentPreset=dsh-bot` | `session-api.log` |
| `pnpm --filter workbench-ui test` | 35 tests 全绿（含 inclusive sinceSeq 不重复、禁发到 turn idle、unselected working 点） | `transcript-unit.log` `composer-unit.log` |
| `pnpm -r run build && typecheck && test` | 全包成功 | `typecheck.log` `repo-test.log` |
| Playwright `/dsh-bot/ui` UF-202 | 新建诗人小北；Header/占位符身份；回复「我是诗人小北」+ 五言 | `uf-202-chat.png` `uf-202-browser.json` |

## 用户路径 / API 验证
| UF/API | 结果 | Evidence |
|---|---|---|
| POST `/dsh-bot/createBotSession` | 回显 sessionId + presetId；marks 含 `bot:<id>` | `session-api.log` |
| POST `/dsh-bot/listBotSessions` | 仅该 bot、newest first、hidden 默认排除 | `session-api.log` |
| POST `/dsh-bot/history` / `prompt` | 投影 role/text/thinking/tool；注入上下文已过滤 | `session-export.json` |
| v1 `/dsh-bot/listSessions` | 仍 `{ok,value:{sessions,botModel}}` | `session-api.log` |
| UF-202 新建人设并对话 | roster「诗人小北」；preset `dsh-bot--shiren-xiaobei`；Header 身份；口吻回复 | `uf-202-created.png` `uf-202-chat.png` `uf-202-browser.json` |
| BR-205 呈现 | user 右/assistant 左；思考折叠；占位「给 诗人小北 发消息」 | `uf-202-chat.png` |

## 剩余风险
- GUI 直建会话补标（Task 12 / UF-205）尚未做；v1 缺口仍在。
- 双人设草稿/历史隔离的浏览器四步脚本属 Task 13。
- history 过滤了 runtime-context / system-reminder；若平台再换注入前缀需补模式。
- Playwright 控制台仍有 favicon 404，不影响对话。
- Review 修复：inclusive `sinceSeq` 按 seq 整页替换 + 稳定 `${kind}-${seq}-${n}`；prompt 后 `awaitingTurn` 禁发直到 turn idle；roster working 点由 `listBotSessions.working` 轮询，unmount 只摘 overlay。
