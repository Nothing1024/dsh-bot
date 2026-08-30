# Phase 4 Summary

## 完成任务
- Task 16 standards 与 manual-test 扩展（前序已完成）
- Task 17 文档更新（前序已完成）
- Task 18 执行 spec 5.2 真实场景全套测试（15 行矩阵 + 证据审计 0 FAIL）
- Task 19 Phase 4 回归验证（build / typecheck / test / standard:check + v1 抽验 + 红线 rg）

## 验证命令
| 命令 | 结果 | 日志 |
|---|---|---|
| Playwright 5.2 矩阵（:3084 this-warehouse + :3184 临时 first-run） | 15/15 主核对通过；v1 页签定位器第一次失败后已补跑 | `task18-matrix.md` `task18-realrun.mjs` `task18-v1.mjs` |
| `python3 ~/.agents/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-workbench` | 0 FAIL / 0 WARN / 21 PASS | Task 18 标完成后复跑 |
| `pnpm -r run build` | 全包 ✔ | `task19-commands.log` |
| `pnpm -r run typecheck` | 0 error | `task19-commands.log` |
| `pnpm -r test` | workbench-ui 43、dsh-bot-host 76、ui-dsh-bot 11、tool-dsh-bot 5 全绿 | `task19-commands.log` |
| `pnpm run standard:check` | 全部通过 | `task19-commands.log` |
| `dsh-rpc-who.sh 3084` | pid=34032 DSH_HOME=本仓 env | 未劫持 3080/3083 |
| packages 内 `anysphere` / `sand://` / `com.anysphere.sand` | 0 命中 | 手查 grep |

## 用户路径 / API 验证
| UF/API | 结果 | Evidence |
|---|---|---|
| UF-201 双入口 | 直开 roster 含 DSH Bot；底部「+」页签 iframe `/dsh-bot/ui` 同源 | `../UF-201/tab.png` `standalone.png` |
| UF-201 网关死 | roster「无法加载工作台」+ 重试；随后 SIGTERM 3084 curl 000 再 `sh env/boot.sh` 拉起 | `../UF-201/gateway-down.png` `gateway-down-kill.md` |
| UF-201 首次空态 | 临时 DSH_HOME :3184 仅种子 bot +「还没有对话」CTA + 包含隐藏默认关 | `../UF-201/first-run.png` |
| UF-202 新建并对话 | UI 建「诗人小北」；回复「我是诗人小北 / 君问姓名何所似 / 北窗一砚对青灯」 | `../UF-202/create-and-chat.png` `session-export.json` |
| UF-202 非法输入 | 空名/空人设行内校验；`""" !!js` 转义非 broken；测完回滚 | `../UF-202/invalid-input.md` |
| UF-202 防重 | 连点创建仅 1 行 | `../UF-202/double-submit.md` |
| UF-203 隔离 | 草稿「草稿给DSH Bot不发送」不串小北；working 点只亮小北 | `../UF-203/isolation.png` `exports/` |
| UF-203 并发 | 两点同时亮；export 无串扰 | `../UF-203/concurrent.md` `concurrent.png` |
| UF-204 编辑 | 改名「说书人小北」；hint「人设对之后的新对话生效」；新会话评书口吻 | `../UF-204/edit-persona.png` `voice-compare.md` |
| UF-204 写盘失败 | live chmod 0555 `updateBot` ok=false 原 persona 保留；vitest rollback 绿 | `../UF-204/write-fail.md` |
| UF-205 补标 | `session.create agentPreset=dsh-bot` 无标 → reconcile `bot:dsh-bot`；二次 labeled=0 | `../UF-205/reconcile.png` `marks-diff.txt` |
| UF-205 v1 leftover | `POST /dsh-bot/createSession` 仅 kind:dsh-bot → 归默认 bot | `../UF-205/v1-sessions.md` |
| UF-206 删除 | roster 移除；`dsh-bot--shiren-xiaobei` 目录删；marks 保留 | `../UF-206/delete.png` `preset-list-diff.txt` |
| UF-206 默认保护 | 删除人设 disabled；`deleteBot dsh-bot` → bot-protected；bundled preset 仍在 | `../UF-206/default-protected.png` |
| v1 回归 | GUI 对话 preset=dsh-bot「我是 DSH Bot…」；`dsh_bot_ask` → `dsh bot pong t18`；页签 iframe | `v1-regression.md` `v1-gui-chat.png` `v1-tab-iframe.png` |
| v1 HTTP | `POST /dsh-bot/listSessions` `{ok:true}` 仍可用 | `v1-regression.md` |

## 不变量
- BR-208 / INV-201：`dsh_bot_ask`、默认 `dsh-bot` preset 会话、页签 id `dsh-bot:sessions`、v1 listSessions/createSession 未改契约。
- INV-203：一口仍 :3084；first-run 用 :3184 临时 home，拍完已杀。
- INV-204：`env/.env` `env/dsh-bot/` `env/sessions/` `env/.agent-presets/dsh-bot--*` gitignored；未提交。bundled `env/.agent-presets/dsh-bot/` 未删。
- BR-207：本仓 `packages/` 无 anysphere / sand://；未改邻仓文件。
- INV-202：session-tool / genoffice `git status --porcelain` 空。vibee 在 Task 19 命令窗口出现并发改动（mtime 19:18:57，本仓 workspace 不含 vibee，本波未 write 邻仓）；仅预存 `?? .vibee/` 属允许项。

## 剩余风险
- 超长名字（65×N）UI 未做行内截断，host `NAME_MAX=64`；矩阵后残留行已 `deleteBot` 清掉。
- 真停 boot 时静态与 API 同口，整页无法加载；产品错误态截图走 fetch abort，kill 证据在 `gateway-down-kill.md`。
- 打开工作台对账异步，首屏 listBotSessions 可能短暂看不到刚直建的 GUI 会话（epoch 后入列）。Review-fix 用打开 `/dsh-bot/ui` 触发 reconcile，不再 POST `/dsh-bot/reconcile`。
- Review-fix：UF-203 sidA 非空 + 诗人小北 export；UF-205 官方 GUI composer + 打开工作台才补标；UF-206 official-rail.png 仍见 t18fix-poet-hist；v1-gui-chat.png 为官方对话面。
- 本波 review-fix 后按 dual-gate 做一次本地 commit。
