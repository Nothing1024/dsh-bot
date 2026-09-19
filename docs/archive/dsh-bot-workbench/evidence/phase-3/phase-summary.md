# Phase 3 Summary

## 完成任务
- Task 12 GUI 直建会话补标对账：`reconcile.ts` 经 ASM-201 `session.list.items[].agentPreset` 反查注册表；未标 bot preset 会话补 `[kind:dsh-bot, bot:<id>]`；v1 `kind:dsh-bot` 无 `bot:` 归默认 bot；非 bot 会话增量 skip cache；幂等、不删既有 marks。打开工作台异步 `POST /dsh-bot/reconcile`（不挡首屏）+ 显式方法 + 30s 定时。
- Task 13 双人设隔离与身份打磨：UF-203 四步草稿/历史/口吻隔离；working 点只亮生成中 bot；composer 占位随 bot；UF-204 编辑提示「人设对之后的新对话生效」、新会话评书口吻 / 旧会话诗人口吻；A+B 并发生成互不干扰。
- Task 14 双入口：浏览器直开与页签 iframe 均可选 bot / 对话 / 新建人设；gateway-down 错误态+重试不白屏；首次空态用临时 DSH_HOME :3184 实拍（仅种子 bot + CTA）。
- Task 15 Phase 3 回归：`pnpm -r run build/typecheck/test` 全绿；UF-201~205 主路径复现。
- Review 修复：BR-208 工作台「包含隐藏」开关（默认关）；UF-203 roster 预览优先未发送草稿；iframe 路径重放 `页签复核`；`browser.json` iframe.ok=true。

## 验证命令
| 命令 | 结果 | 日志 |
|---|---|---|
| `pnpm --filter dsh-bot-host test` | 76 passed（含 reconcile 7） | `repo-test.log` |
| `pnpm --filter workbench-ui test` | 43 passed（includeHidden 开关 / 草稿预览 / empty CTA） | `repo-test.log` |
| `pnpm -r run build && typecheck && test` | 全包成功 | `repo-test.log` |
| `POST /dsh-bot/reconcile` | GUI `session-f626f8c1` reason=preset；二次 labeled=0；v1 leftover reason=v1-legacy | `../UF-205/marks-diff.txt` `v1-sessions.md` |
| Playwright `/dsh-bot/ui` + iframe 页签 | UF-201/203/204/205 截图 | `../UF-201/` `../UF-203/` `../UF-204/` `../UF-205/` `browser.json` |

## 用户路径 / API 验证
| UF/API | 结果 | Evidence |
|---|---|---|
| UF-205 GUI 直建补标 | `session.create agentPreset=dsh-bot` 无标 → reconcile 后 `bot:dsh-bot,kind:dsh-bot`；列表含「GUI直建补标」 | `../UF-205/reconcile.png` `marks-diff.txt` |
| UF-205 v1 leftover | createSession 仅 `kind:dsh-bot` → 归默认 bot | `../UF-205/v1-sessions.md` |
| UF-203 四步隔离 | 草稿 A 不串 B；roster 预览显示未发送草稿；占位随名字；working 只亮小北 | `../UF-203/isolation.png` `four-steps.json` `exports/` |
| UF-203 并发 | 两点同时亮；回复各是 DSH Bot / 诗人小北 | `../UF-203/concurrent.png` `concurrent.md` |
| UF-204 编辑 | 表单 hint；新会话「说书人小北」；旧会话诗人口吻 | `../UF-204/edit-persona.png` `voice-compare.md` `write-fail.md` |
| UF-201 直开 | roster 含默认 bot + 入口直开对话 | `../UF-201/standalone.png` |
| UF-201 页签 iframe | 右栏 DSH Bot 页签 iframe `/dsh-bot/ui`；新建「页签复核」并回复 | `../UF-201/tab.png` `tab.json` `browser.json` |
| UF-201 gateway-down | roster 错误态 + 重试，不白屏 | `../UF-201/gateway-down.png` |
| UF-201 空态 | 临时 DSH_HOME :3184 实拍：仅种子 bot + 「还没有对话」CTA + 包含隐藏默认关 | `../UF-201/first-run.png` `first-run.md` `first-run.json` |
| UF-202 回归 | 直开新建「入口直开」对话「测试助手」；既有诗人小北路径仍在 | `../UF-201/standalone.png` `../phase-2/uf-202-chat.png` |
| v1 listSessions/createSession | 仍 `{args}` wire；createSession 仍只打 kind:dsh-bot | `v1-sessions.md` |

## 剩余风险
- 全量 5.2 矩阵（含 UF-206 删除）属 Task 18；本 Phase 未删人设。
- iframe 内剪贴板/焦点差异记到 README（Task 17），本轮页签内 CRUD 已实证等价。
- gateway-down 截图走 fetch abort（静态与 API 同口，真停 boot 则整页无法加载）；错误态 UI 已拍到。
- 打开工作台触发的对账是异步的，首屏 listBotSessions 可能短暂看不到刚直建的 GUI 会话，epoch 刷新后入列。
