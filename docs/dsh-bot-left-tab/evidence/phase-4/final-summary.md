# Phase 4 Summary（final）

日期：2026-09-08  
网关：`127.0.0.1:3084`（最终 pid `19215`），`DSH_HOME=.../dsh-grok-bot/plugin/env`。§5.2 第二轮全部在最终 bundle **14d797c** 上重放（`pnpm --filter ui-dsh-bot run build` → `dsh-rpc-who.sh 3084` 核身份 → `kill` → `sh env/boot.sh`）。  
执行方式：第一轮 omp worker（Task 8/18 小修、Task 21、Task 22 首轮回放）；worker 停用后由协调者直接执行审查、修复与第二轮回放；cursor-ide-browser MCP 中途掉线，按 §5.2 工具顺序退到 Playwright（playwright-core 1.50.1 + 缓存 chromium-1155，脚本在 `/tmp/lt-pw/`，不入库）。

## 完成任务

- Task 8 小修（BR-604 v0.3.3）：预览跳过 JSON 转储。`d0c5557`
- Task 18 小修（BR-616 v0.3.3）：chip 挂载预取三类计数、未到只显标签。`ac687ab`
- Task 21：README「左栏 Bot 模式」入口行 + `left-sidebar-bot-tab.md` 落地记录。`dacf553`
- Task 22：§5.2 执行矩阵 28 行回放；第一轮失败 7 处修复并重跑（见下）。`da290b2`（evidence）
- Task 23：全仓回归 + INV 核对 + 本文件。

### 第一轮回放暴露并修复的缺陷（各自单独 commit，全部在 14d797c 上重放通过）

| 行 | 缺陷 | 修复 | commit |
|---|---|---|---|
| UF-609 | 关系图 SVG 超出卡片、描边过粗、无图例 | 原型 420×340 viewBox、non-scaling 描边、图例文案 | `19ff37b`（Task 13 / BR-617 / BR-618） |
| BR-617 视觉对照 | 名册头部「人设」换行、按钮标签折行 | `.rosterHead` nowrap、按钮整体换行 | `36e003d`（Task 8 / BR-617） |
| BR-617 视觉对照 | 行 grid 3 列 4 子元素，「⋯」掉到下一行 | 第三列容器：数字叠放、⋯ 悬停才显 | `aaa3812`（Task 8 / BR-617） |
| UF-610 | 悬停预览卡被官方侧栏 overflow 裁掉 | 卡片 portal 到 body，按行 rect 定位、近底翻转 | `2762df2`（Task 14 / BR-617） |
| UF-606 | 右栏页签关闭 / 面板折叠时 `activateTab` 是 no-op | `openTab({type, url})` 先落地再 `activateTab` | `33f630f`（Task 10 / BR-608） |
| BR-604 会话数 | B 路未选中的行会话数恒 0 | 按官方 `sessions.list` preset 计数，`listBotSessions` 到达后覆盖 | `e8c62a5`（Task 7 / BR-604） |
| UF-604 失败分支 | rail 态忽略 `rosterState`，无警示图标 | rail + error → 一个「!」警示按钮，title「名册加载失败」，点击展开并重试 | `14d797c`（Task 8 / BR-610） |

## 命令级（Task 23，HEAD 14d797c 代码）

| 验证项 | 结果 | 备注 |
|---|---|---|
| `pnpm run typecheck` | 14d797c 提交时 EXIT 0（20:24Z）；20:56Z 起 EXIT 2（87 错，全部在 `packages/dsh-bot-host/src`） | 外部漂移：邻仓 `session-tool/plugin/packages/session-tool/node_modules/@deepseek-ai/dsh-session` 在 04:56（本地）被 `/Users/nothing/worktrees/parity-lane-b` 的 pnpm 安装改链到 `dsh-session@0.1.0-rc.7`，本仓 tsconfig `paths` 把 `session-tool` 映射到该邻仓源码。用 `/tmp/lt-tsconfig.json` 把邻仓源码里的 `@deepseek-ai/dsh-session`、`@deepseek-ai/cordis` 钉回本仓副本 → EXIT 0。未动邻仓（§2.8）。**邻仓恢复后需重跑一次。** |
| `pnpm test` | 64 文件 / 436 测全过 | INV-606 |
| `pnpm run build` | 5 包全过，ui-dsh-bot purity 无报错 | INV-603 |
| `pnpm run standard:check` | 全部通过（adapter 审计无未评审触点） | — |
| `git diff --stat packages/dsh-bot-host/src` | 空 | INV-602 |
| `git status --short env/profiles` | 空 | INV-605 |
| `validate_package.py docs/dsh-bot-left-tab --repo .` | 0 FAIL / 1 WARN（P0 豁免留痕）/ 21 PASS；§3.3 30 anchor 命中 | — |
| `git status --short` vs `phase-0/git-status-before.txt` | 仍是 `.grok/`、`.vscode/`、`env/attachments/`（phase-0 目录已入库） | INV-604 |

## §5.2 执行矩阵总表（28 行）

| 行 | 结果 | Evidence（bundle） |
|---|---|---|
| UF-601 主路径 | 通过 | `UF-601/bot-mode.png`、`after-reload.png`、`console.log`（14d797c；console.error/pageerror 0） |
| UF-601 失败分支 网关拒绝 | 通过 | `UF-601/load-error.png` + `load-error-recovered.png`（14d797c） |
| UF-601 失败分支 空名册 | **N/A 不可达**（v0.3.4） | `UF-601/BLOCKED.md`：host 种子受保护 DSH Bot；空态由 `tests/bot-region.spec.tsx` 覆盖 |
| UF-602 主路径 | 通过 | `UF-602/sessions-restored.png`、`console.log`（14d797c；slots=1、无分段条、footer 未按下、搜索可用） |
| UF-603 主路径 | 通过 | `UF-603/open-existing.png`（14d797c）；`create-new.png`、`createBotSession.json`（ac687ab） |
| UF-603 失败分支 创建失败 | 通过 | `UF-603/create-failed.png`（ac687ab） |
| UF-603 失败分支 会话已归档 | 通过 | `UF-603/archived-fallback.png`（ac687ab） |
| UF-604 主路径 | 通过 | `UF-604/rail.png`、`expanded.png`（14d797c） |
| UF-604 失败分支 名册未加载 | 通过（修复后） | `UF-604/rail-error.png`（14d797c） |
| UF-605 主路径 | 通过 | `UF-605/identity-bar.png`（计数已到：记忆 0 / 例程 24 / 同事 6）、`memory-popover.png`、`plain-session.png`（14d797c） |
| UF-605 失败分支 preset 无匹配 | 通过 | `UF-605/orphan-preset.png`（ac687ab） |
| UF-606 主路径 | 通过（修复后） | `UF-606/group-jump.png`（14d797c，1680×1000） |
| UF-606 失败分支 页签未就绪 | 通过（修复后，53ms） | `UF-606/tab-cold.png`（14d797c） |
| UF-607 主路径 | 通过 | `UF-607/unread.png`（sendToPeer 后 2.5s 徽章 1、会话数 30→31、预览更新）、`read.png`（14d797c） |
| UF-607 失败分支 SSE 断开 | 通过 | `UF-607/poll-fallback.log`（ac687ab） |
| UF-608 主路径 | 通过 | `UF-608/create-bot.png`、`created-selected.png`、`delete-confirm.png`、`createBot.json`（ac687ab） |
| UF-608 失败分支 校验 | 通过 | `UF-608/validation.png`（ac687ab） |
| UF-608 失败分支 RPC 失败 | 通过 | `UF-608/rpc-error.png`（ac687ab） |
| UF-609 主路径 | 通过（修复后） | `UF-609/graph.png`、`node-select.png`、`new-room.png`（14d797c） |
| UF-609 失败分支 无小组 | 通过（修复后） | `UF-609/no-groups.png`（14d797c；groups.json 备份→置空→还原 diff 为空） |
| UF-610 主路径 | 通过（修复后） | `UF-610/hover-bot.png`、`hover-group.png`、`persona-panel.png`（14d797c） |
| UF-610 失败分支 rail 态 | 通过 | `UF-610/rail-no-card.png`（ac687ab） |
| UF-611 主路径 | 通过 | `UF-611/palette.png`、`filtered.png`（14d797c） |
| UF-611 失败分支 iframe 获焦 | 通过 | `UF-611/iframe-focus-no-palette.png`（ac687ab） |
| UF-612 主路径 | 通过 | `UF-612/mention-badge.png`、`badge-cleared.png`（14d797c）；`routine-tag.png`、`seq-check.log`（Phase 3） |
| BR-617 视觉对照 | 通过（修复后） | `UF-601/visual-diff.png`（原型分镜 3 vs 真机并排 + 量测；非颜色差异：无预览句行 48 vs 57、分段条 -11px 容器内边距） |
| 2.7 热重载 | 通过 | `phase-4/hmr.png`（重建 + 重载后 `[data-slot="sidebar.workspaces"]` = 1）+ `phase-0/calibration.md` |

标注 ac687ab 的文件是第一轮 worker 在修复前 bundle 上拍的，其核对点与本轮 7 处修复无关（名册行外观是旧版）。

## 5.4 Review 专项检查清单

- [x] `sidebar.workspaces` 只注册一次且 `priority: -1`：`region-registration.ts` L70–72；无 `root` / `sidebar` / `conversation*` single 槽注册（`index.ts` 只有 `sidebar.footer.action`、`conversation.session.header.actions`、`conversation.chat.turnTail`、`shell.overlay`）
- [x] 会话模式只剩官方一条：`UF-602/sessions-restored.png`，slots=1、无分段条；无 CSS 隐藏官方树
- [x] 客户端无消息流 / composer 渲染：`rg "Transcript|Composer" packages/ui-dsh-bot/src/client` 无命中
- [x] 官方「+ 新会话」未被拦截：所有截图官方「+ 新会话」在位；UF-603 官方「+」进 hero
- [x] `shell.overlay` 无模态返 null、`role="dialog"`、Esc 可关：`OverlayHost.tsx`；`tests/overlay-forms.spec.tsx`
- [x] 删除有确认框、protected DSH Bot 无删除项：`UF-608/delete-confirm.png`；`tests/overlay-forms.spec.tsx`
- [x] 尺寸与原型一致只差颜色 token：`UF-601/visual-diff.png`（两处非颜色差异已登记）
- [x] turnTail `select` 同步、非命中不挂载：`RoutineTurnTail.tsx matchRoutineTurn`（第三批审查）；`tests/routine-turn-tail.spec.tsx`
- [x] ⌘K 在 iframe / 输入框获焦时放行：`palette-hotkey.ts`；`UF-611/iframe-focus-no-palette.png`
- [x] host 零 diff、`env/profiles` 未写：命令级表
- [x] session-nav 在飞改动仍在：`git status` 与 phase-0 基线一致
- [x] 5.2 全部行：27 通过 + 1 N/A（不可达），evidence 与 §2.5 EVD 清单一致
- [x] 2.3 入口接线：每条 UF 都从真实入口（底栏 Bot / 名册行 / 身份条 / ⌘K / 官方树）走通并截图
- [x] loading / 禁用 / 错误 / 成功反馈：`load-error.png`、`rail-error.png`、`create-failed.png`、`validation.png`、`rpc-error.png`、`tab-cold.png`
- [x] BR / UF / INV 可对照 §2 核销：spec v0.3.4 §1.5 已登记全部偏差

## spec 需回写（已在 v0.3.4 完成）

§1.3 四条新事实（host 种子、`activateTab` 语义、hero 无右栏面板、沙箱外写触发审批）；§1.5 v0.3.4 七项；§1.6 第四批复跑记录（含 typecheck 邻仓漂移）；BR-608 改 `openTab`；§5.2 UF-601 空名册行 N/A、UF-606 前置、UF-612 触发手段。

## 收尾与残留

- 已删测试人设 `左栏测试`（zuolan-ceshi）、`左栏空会话`（zuolan-konghui-hua-2）；`bots.json` = worker 03:34 备份减 左栏测试；`groups.json` 与备份 diff 为空；`rm ~/lt-approval-probe.txt`。
- 测试留下的官方会话与消息：两个已删人设的会话仍在官方会话列表（正是 UF-605 orphan-preset 场景）；`校对阿宁` / `运维夜班` / `DSH Bot` 各有 1–2 条探针消息；编辑室、校对组各新增 1 个房间（`rooms.json`）。均为 env 测试数据，不在 git 内。

## 剩余风险

1. **typecheck 邻仓漂移**：`pnpm run typecheck` 依赖 `../../session-tool/plugin` 源码及其 node_modules；只要其他 worktree 的 pnpm 安装改链 `session-tool` 的 `@deepseek-ai/dsh-session`，本仓 typecheck 就会报 host 侧 brand 错误。本包未动邻仓；建议单独立项把 `session-tool` 的类型依赖收回本仓（或改 `paths` 指向本仓 node_modules 的发布版）。
2. BR-604 会话数在 B 路是「官方 `sessions.list` 里能看到的会话」计数，可能与 host `listBotSessions`（含归档/其他工作区）不一致；选中后以 host 为准。
3. 1280 宽下展开右栏会让官方把左栏收成 rail（UF-606 主路径截图用 1680 才三栏同框）；属官方布局行为。
4. 会话空 hero 未选工作区时身份条 / 右栏面板都不可用（§1.3），首条消息后恢复。
