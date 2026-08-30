# dsh-bot-workbench Review Report

时间: 2026-08-30T20:45+08:00  
网关: `127.0.0.1:3084  pid=34032  DSH_HOME=<仓根>/env`（`dsh-rpc-who.sh 3084` 核身，未劫持 3080/3081/3083）  
状态板: `tasks.csv` — **已完成 18 / 已阻塞 1 / 进行中 0 / 待开始 0**（Task 18 为唯一阻塞）

本报告不是「全部完成」。Task 18 的 UF-205 官方 GUI「新会话」新 id 与无标窗口无法绑在同一 sessionId；其余 5.2 行 evidence 在盘，5.1 命令级全绿。

## L1 BR / UF / INV 覆盖

| ID | 结论 | 证据 / 锚点 |
|---|---|---|
| BR-201 | 通过 | `$DSH_HOME/dsh-bot/bots.json` 为清单；人设文本在 preset persona 行（`packages/dsh-bot-host/src/bots.ts`） |
| BR-202 | 通过 | 一人设一 `dsh-bot--<slug>`；写后 `agentPreset.list` 非 broken；失败回滚（UF-202 invalid / UF-204 write-fail / host `bots.spec.ts`） |
| BR-203 | **部分** | 工作台创建打 `[kind:dsh-bot, bot:<id>]`；`session.create agentPreset=dsh-bot` 无标 → 打开 `/dsh-bot/ui` 补标（closer 复验 `session-212c25a1…`）。官方 GUI「新会话」在本环境复用已标记 `dsh-bot-manual-*`，无法把「GUI 点新建产生的新 id」与「无 bot: 标」绑在同一会话 |
| BR-204 | 通过 | `UF-201/tab.png` iframe `src=/dsh-bot/ui`；`standalone.png` 直开同源 roster |
| BR-205 | 通过 | Header 身份 / 分侧气泡 / thinking 折叠 / 工作中 / 草稿按 bot 隔离 / 禁发（UF-202/203 截图 + composer 单测） |
| BR-206 | 通过 | emoji 或首字色块；roster / Header / composer 占位均含名字 |
| BR-207 | 通过 | `packages/` 内无 `anysphere` / `sand://` / `com.anysphere.sand`；README 仅作红线说明。未改邻仓文件 |
| BR-208 | 通过 | `dsh_bot_ask` 仍注册；页签 id `dsh-bot:sessions`；`POST /dsh-bot/listSessions` `{ok:true}`；v1-regression.md |
| UF-201 | 通过 | tab / standalone / gateway-down / first-run |
| UF-202 | 通过 | create-and-chat 诗人小北口吻 + invalid + double-submit |
| UF-203 | 通过 | isolation.png 草稿不串；exports 两侧口吻；concurrent.md |
| UF-204 | 通过 | edit-persona.png 提示「人设对之后的新对话生效」；voice-compare.md |
| UF-205 | **env 阻塞** | 用户可见「GUI 会话入列 + 下拉切换 + 新开对话」有 `gui-create.png` / `reconcile.png`；marks 补标在 `session.create` 空白会话上复验通过。官方「新会话」不产生新 unlabeled id |
| UF-206 | 通过 | delete.png roster 无小北；preset 目录删；official-rail 历史仍在；default-protected `bot-protected` |
| INV-201 | 通过 | v1 GUI 对话 / `dsh_bot_ask` pong / 页签 iframe（`evidence/phase-4/v1-regression.md`） |
| INV-202 | 通过* | session-tool / genoffice `git status --porcelain` 空。vibee 有并发脏（`StructuredCanvas.tsx` 等 + `?? .vibee/`），非本仓写入 |
| INV-203 | 通过 | 一口仍 :3084；first-run 用过 :3184 临时 home，拍完已杀 |
| INV-204 | 通过 | gitignore 含 `env/.env` `env/settings.yaml` `env/sessions/` `env/storages/` `env/dsh-bot/` `env/.agent-presets/dsh-bot--*` `bots.json`；本仓 `git status` 无运行数据 |
| EVD-201…207 | 路径在盘 | 见 L3 |

未改 spec 第 2 章。无 P0/P1 产品缺陷需开 Phase-Fix。UF-205 缺口记为 **P2 环境/官方 GUI 行为**，不写入 spec 第 4 章任务。

## L2 命令级闸门（5.1）

日志: `evidence/phase-4/final-regression.log`（2026-08-30T20:40:48+08）

| 项 | 结果 |
|---|---|
| `pnpm -r run build` | `build_exit=0` |
| `pnpm -r run typecheck` | `typecheck_exit=0` |
| `pnpm -r test` | `test_exit=0`（workbench-ui 43 / dsh-bot-host 76 / ui-dsh-bot 11 / tool-dsh-bot 5） |
| `pnpm run standard:check` | `standard_exit=0` |
| `validate_package.py docs/dsh-bot-workbench` | **0 FAIL / 0 WARN / 21 PASS**（Task 18 未标完成，证据审计按设计跳过；路径已手核） |
| `--repo` | 0 FAIL / 10 WARN：本机 `rg` 不在 PATH。手核 3 条 3.3 锚点：`class DshBotService`（host `index.ts`）、`HTMLIFrameElement`（genoffice `control-mode.tsx`）、`webServer`（vibee-viz `index.ts` L55）均命中 |

## L3 spec 5.2 矩阵（15 行）

| 行 | 结果 | Evidence |
|---|---|---|
| UF-201 双入口 | 通过 | `UF-201/tab.png` `standalone.png` |
| UF-201 网关死 | 通过 | `gateway-down.png` 错误态+重试；真停 boot 见 `gateway-down-kill.md` |
| UF-201 首次空态 | 通过 | `first-run.png` 种子 bot +「还没有对话」；临时 :3184 |
| UF-202 主路径 | 通过 | `create-and-chat.png` `session-export.json` |
| UF-202 非法输入 | 通过 | `invalid-input.md` 空名/YAML 注入非 broken |
| UF-202 防重 | 通过 | `double-submit.md` 连点仅 1 行 |
| UF-203 主路径 | 通过 | `isolation.png` `exports/` |
| UF-203 并发 | 通过 | `concurrent.md` |
| UF-204 主路径 | 通过 | `edit-persona.png` 生效提示 |
| UF-204 写盘失败 | 通过 | `write-fail.md` EACCES + vitest rollback |
| UF-205 主路径 | **env 阻塞** | `reconcile.png` `marks-diff.txt` `gui-create.png`；closer 复验 unlabeled→labeled 成功，GUI 新 id 失败 |
| UF-205 v1 旧会话 | 通过 | `v1-sessions.md` `kind:dsh-bot` → `bot:dsh-bot` reason=v1-legacy |
| UF-206 主路径 | 通过 | `delete.png` `preset-list-diff.txt` |
| UF-206 默认保护 | 通过 | `default-protected.png` + `bot-protected` |
| v1 回归抽验 | 通过 | `phase-4/v1-regression.md` `v1-gui-chat.png` `v1-tab-iframe.png` `v1-ask-history.json` |

无「未开工」行，故无「不适用-链条止损」。

## L4 负向路径（spec 2.7）

| 场景 | 结果 | Evidence |
|---|---|---|
| 依赖失败 / 网关死 | 通过 | roster「无法加载工作台」+ 重试，不白屏 |
| 非法输入 | 通过 | 行内校验；`""" !!js` 转义非 broken，测完回滚 |
| 重复提交 | 通过 | loading 锁，注册表无重复 |
| 并发生成 | 通过 | 两 bot 同时 working，export 无串扰 |
| 空数据 | 通过 | 种子默认 bot + 空会话 CTA |
| 旧数据兼容 | 通过 | v1 leftover 归默认 bot |
| 写盘失败 | 通过 | `updateBot` ok=false，原 persona 保留 |
| 删默认 bot | 通过 | disabled + `bot-protected` |

交互反馈（loading / 禁发 / 错误条 / 工作中 / 生效提示）均在对应 UF 截图或单测中出现，未跳过。

## 5.4 清单

- [x] BR-202 非法人设不残留 broken preset（invalid-input.md）
- [x] BR-203 对账幂等（host reconcile 单测 + v1 leftover labeled=1 / 二次 alreadyLabeled；GUI 新 id 窗口见 L3 阻塞）
- [x] BR-204 双入口等价（tab + standalone）
- [x] BR-205 界面反馈逐步一致
- [x] BR-208 / INV-201 v1 主路径复跑在案
- [x] 红线 `packages/` 无 anysphere / sand://
- [x] INV-204 git status 无 bots.json / 自动 preset / 会话数据

## 问题分级

| 级 | 项 | 处置 |
|---|---|---|
| P0 | 无 | — |
| P1 | 无 | — |
| P2 | UF-205：官方 GUI「新会话」复用已标记 dsh-bot 会话，测试无法把新 id 与无标绑在一起 | 保持 Task 18 `已阻塞:env:…`；产品侧打开工作台补标已复验 |
| P2 | 超长名字 UI 未截断（host `NAME_MAX=64`） | 矩阵后已 deleteBot；不阻断 |
| P2 | 真停 boot 时静态与 API 同口，整页无法加载 | 产品错误态用 fetch abort 截图；kill 证据另档 |
| 记录 | vibee 邻仓并发脏 | 非本仓；session-tool / genoffice 空 |

## 结论

命令级入场券已过。5.2 指定 evidence 文件齐全。真实场景任务 **不得** 标「已完成」：UF-205 官方 GUI 新会话补标窗口仍缺。无 P0/P1，不开 Phase-Fix。
