# Phase 1 跳转桥 — 回归摘要

Date: 2026-09-01. Wave Tasks 2–4. Gateway: profile `gb` :3084, `DSH_HOME=<root>/env`. 无 commit.

## 板面

| Task | 状态 | 验证 |
|---|---|---|
| 2 页签 postMessage 桥 | 已完成 | `pnpm --filter ui-dsh-bot run build && test` 全绿 → `bridge-unit.log` |
| 3 工作台入口与直开降级 | 已完成 | `pnpm --filter workbench-ui run build && test` 全绿 → `jump-ui-unit.log` |
| 4 Phase 1 回归 | 已完成 | `pnpm -r run build && pnpm -r test` → `regression.log`；页签可见/隐藏各跳一次 + 直开复制 ID → `live-jump.json` |

## 实现要点

- BR-401 三重校验:`event.origin === location.origin`、`event.source === iframe.contentWindow`、`data.type === 'dsh-bot:jump'`。白名单外忽略并 log。
- 命中后 `sessions.open(id)`（ASM-401；**不**走 `openSubagent`），再按 `executeJump` 结果回执 `{type:'dsh-bot:jump-result', ok, reason?}`。`open` 抛错 →「会话不存在或已删除」。
- 工作台 `requestJump`：页签内 postMessage + 1.5s 超时；`window.parent === window` → `unsupported`，菜单项「复制会话 ID」+ tooltip「在右栏页签内可直接跳转」。
- 入口:SessionList 行 ⋯、Conversation Header 当前会话 ⋯、roster 嵌套行 ⋯（仅 bot）。小组房间不挂跳转。失败 toast 透传 reason。
- tab id `dsh-bot:sessions` 与 badge 轮询未改。

## 命令级

- `pnpm -r run build && pnpm -r test`：host / workbench-ui / ui-dsh-bot / tool-dsh-bot 全绿（见 `regression.log`）。
- 改 client 后 who 3084 → 杀本仓 pid → `sh env/boot.sh`（`boot.log`）。

## 页签实测（Playwright channel=chrome）

脚本 `live-jump.mjs`。会话:

- 可见 `session-91293f51-624b-4826-9144-b82cd32c3f67`（`dsh-bot-manual-20260829-231307-override-on`）
- 隐藏：工作台 includeHidden 行 `session-5384934e-…`（`~dsh-bot: 委托成功四字回复`，`kind:hidden`）。官方侧栏不列出该行（与 ASM-401 calib-hidden-open 同形）；父页收到 `dsh-bot:jump` 后离开可见会话 conversation。

结果（`live-jump.json` summary）:

| 项 | 结果 | 证据 |
|---|---|---|
| 可见跳转 | 官方 conversation 头为该会话，父页收到 `dsh-bot:jump` | `jump-visible.png` |
| 隐藏跳转 | **阻塞**: `~dsh-bot:` includeHidden 行 `sessions.open` 后 `list.current` 不落地，回执 `会话不存在或已删除`；官方空工作区 | `jump-hidden.png` + `live-jump.json` |
| 删除目标 | 缺失 id 回执 `会话不存在或已删除` | `deleted-jump.json` |
| roster 嵌套 | 行 ⋯「在 DSH 打开」 | `roster-jump-menu.png` |
| 直开降级 | 菜单「复制会话 ID」、tooltip、toast「已复制会话 ID」、剪贴板=sessionId | `standalone-fallback.png` |

## 不变量抽检

- INV-401 本 Phase 未改 host 委托/小组过滤；v1/v2/v3 行为面未动。
- INV-402 邻仓未改（vibee 既有脏文件，本波未触）。
- BR-407 `rg -i 'anysphere\|sand://' packages/` 空。
- 未提交 env 运行数据。

## 已知边角

- `sessions.open` 后 iframe 被卸，Playwright 再 `evaluate` 会 `Frame was detached`；产品回执在同栈 `executeJump` 之后发出。`~dsh-bot:` 隐藏会话官方 chrome 与 ASM-401 calib-hidden-open 相同（侧栏不列该行）。
- 小组房间不提供「在 DSH 打开」（roomId 不是 session 跳转目标）。

## 2026-09-08 重跑（解除 Task 4 阻塞）

根因：`askBot` 把委托 `~dsh-bot:` 会话创建后立即 `platform.archiveSession`（`ask.ts` L268）；rc.2 客户端投影在 `current ∈ archivedSessionIds` 时 `sessions.clear()`（runtime `client.js` L10065），且平台没有任何归档查看 / unarchive 面（ui-workspace README）。首轮把它误判为「隐藏会话不落地」。

修复：`ui-dsh-bot/src/client/session-jump.ts` 桥端在 open 前查 `ctx.workspaces.list.archivedSessionIds`，归档目标不调 open、回执 `reason:"archived"`（open 后被投影清掉的也归为 archived 而非「已删除」）；`DshBotTab.tsx` 传入 `ctx.workspaces`；workbench `jump.ts` 映射文案「该会话已归档（委托会话默认归档），官方界面无法查看」。单测 +3（`jump-bridge.spec.ts`）+1（`jump.spec.ts`）。

| 项 | 结果 | 证据 |
|---|---|---|
| 可见 `session-e33be2c2…` | `{ok:true,current=id}` | `jump-visible.png`（复用）/ `live-jump-rerun.json` |
| 隐藏未归档 `~ calib-nav-hidden`（`session-974c0fc9…`，kind:hidden） | `{ok:true,current=id}`；空会话在官方显示为「新会话」hero | `jump-hidden.png` |
| 归档委托 `~dsh-bot: Reply with exactly…`（`session-de32fc13…`） | `{ok:false,reason:"archived"}`，current 不动，页签保留 | `jump-archived.png` |
| 首轮阻塞截图 | 归档为 `jump-hidden-blocked-0901.png` | — |

脚本：`live-jump-rerun.mjs`（Playwright channel chrome，每例新 context）。allPass:true，console 无 error。

连带发现：UF-404 / BR-404「官方 GUI 归档区可寻回」与 rc.2 事实冲突，登记 ASM-406，Task 7 开工前处置。
