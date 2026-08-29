# Task 19 5.2 矩阵

时间: 2026-08-29（首轮 RPC `15:27Z`；UF-005 次路径补跑 `15:38Z`；closer GUI 复核 `15:49Z`）
网关: `dsh-rpc-who.sh 3084` → `DSH_HOME=/Users/nothing/workspace/dsh/plugin/dsh-grok-bot/plugin/env`

通过 **21 / 21**（首轮脚本 18/21，3 行后补证据；无 不适用-链条止损）

## 首轮脚本（task19-realrun.mjs）

playwright 包未装入本仓 `node_modules`（`Cannot find package 'playwright'`），GUI 行改走既有 PNG + 本机 Chrome MCP 复核。RPC/CLI 行直跑。

首轮判定失败 3 行，处置如下：

| 行 | 首轮脚本 | 处置 |
|---|---|---|
| UF-001 主路径 | FAIL `preset=undefined`（history 早段 `agent-preset/selected` 被 maxMessages 截掉），但 create 响应 `agentPreset=dsh-bot`，header=`anthropic/grok-4.6`，助手文本自称 DSH Bot | 以 create RPC + `success.png` + history 助手文本记 PASS |
| UF-005 会话内切换 | FAIL 同 preset 截断；header 已从 grok-4.6 → deepseek-v4-flash | `switch-in-session.md` 记 PASS |
| UF-005 默认切换→委托 | FAIL 委托会话仍落旧默认 anthropic/grok-4.6 | 实现 follow-global `selectModel` pin 后补跑，`default-switch.md` header=`deepseek-official/deepseek-v4-flash` PASS |

## 矩阵核销

- PASS UF-001 主路径: create `agentPreset=dsh-bot`；`success.png` 流式自称 DSH Bot / grok-4.6；`session-history.json` 含助手文本
- PASS UF-001 无凭据: MISSING_CREDENTIAL 点名 `BOT_MISSING_KEY`，切回免重启恢复 — `missing-key.md`
- PASS UF-001 上游失败: 本地 401 端点，会话保留 — `upstream-error.md`
- PASS UF-002 主路径: 工具完成、marks `kind:dsh-bot`、官方栏无 `~dsh-bot:` — `tool-call.md` `marks.txt` `rail-check.png`
- PASS UF-002 并发: 独立会话 A/B，答案不串 — `concurrent.md`
- PASS UF-003 createSession / list: HTTP ok，列表含 `UF-003 jump t19`
- PASS UF-003 GUI 列表: closer 重截 `tab-list.png`（页签列表 + badge 12 + 新建按钮 + botModel 全局）
- PASS UF-003 GUI 新建: closer 点「新建 DSH Bot 会话」后 `create-jump.png`（plugin 工作区、preset=DSH Bot、composer 可输入）
- PASS UF-004 主路径 + 空分支: `marks-list.txt`
- PASS UF-005 会话内切换: grok-4.6 → deepseek-v4-flash — `switch-in-session.md`
- PASS UF-005 默认切换→委托: 补跑 pin 后 header=deepseek-official/deepseek-v4-flash — `default-switch.md`
- PASS UF-006 override-on / off / invalid
- PASS UF-001 missing-key / upstream-error
- PASS UF-005 missing-cred
- PASS UF-002 timeout（wait-timeout 附会话 id，会话未杀）
- PASS UF-003 empty rpc + `empty.png`（「还没有 DSH Bot 会话」+ 新建引导）
- PASS UF-002 gateway-down: CLI `web-unreachable` / fetch failed；演练后 boot 恢复本仓 :3084
- PASS UF-003 rpc-error.png: 「无法加载会话列表」+ 重试

网关身份多次重启后仍为本仓 gb。
