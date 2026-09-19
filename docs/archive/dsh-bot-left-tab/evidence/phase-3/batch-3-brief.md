# 任务：dsh-bot-left-tab 第三批 —— Phase 3 中栏身份条（Task 8 步骤 6 补漏 + Task 17–20）

第二批（Task 6–16）已由协调者审查通过：typecheck 0 错、全仓 59 文件 400 测全过、ui-dsh-bot bundle 纯度通过、host 零 diff、validate 0 FAIL / 30 anchor 命中，evidence/phase-2 六张真机截图属实。继续在同一仓库、同一分支 main、当前 worktree 做第三批。spec 已升到 **v0.3.2**（commit 9c9fb5f），本地即最新，**重新读 spec**：BR-604 补了预览数据源，Task 8 加了步骤 6。

你自报的两条残余，协调者判定：
- 「⌘K 在输入框获焦时不触发」= BR-621 明文要求，**不是缺陷，不要改**。
- 「名册预览句恒为空」= **真缺口**，根因是 spec 之前没写数据源（iframe 工作台的预览来自 Transcript 组件 `onPreview` 回调，左栏没有那个组件）。现已写进 BR-604 与 Task 8 步骤 6，本批第一件事就是补它。

## 必读
1. docs/dsh-bot-left-tab/spec.md：§1.5 首行（v0.3.2 变更）、§2.1 BR-604（新文案）/ BR-605 / BR-606 / BR-607 / BR-611 / BR-612 / BR-616 / BR-617 / BR-620、§2.3 UF-605 / UF-610 / UF-612、§4 Task 8 步骤 6、Task 17 / 18 / 19 / 20 详情（逐条读，含注意事项）、§1.4 ASM-608。
2. docs/dsh-bot-left-tab/handoff.md 禁止事项与执行循环。
3. docs/dsh-bot-left-tab/evidence/phase-2/phase-summary.md「ASM / 实现备注」——你自己记的四条（B 路、inject 墙、`as unknown as SessionListFace`、matchMedia coarse&&!fine），本批继续适用。

## 本批范围（按顺序）

### 0. Task 8 步骤 6：名册预览数据源（BR-604 v0.3.2）
- `roster-rpc.ts` 新增 `lastMessages: ObservableHandle<Readonly<Record<string, string>>>` 与 `ensurePreview(botId, sessionId, updatedAt)`：缓存键 `${sessionId}:${updatedAt}`，未命中才 `historyOf(sessionId)`，取 `items` 里最后一条 `kind === 'message' && text` 非空的条目，`text.trim().slice(0, 80)` 写入；并发上限 2；`setActive(false)` 后中止未发请求。
- `BoundRoster`（或等价接线处）：`useSyncExternalStore(sessions.list)` 拿 `byId`，对每个可见非隐藏 bot 按 BR-607 规则（`agentPreset` 为 `dsh-bot` 或 `dsh-bot--<slug>` 且匹配该 bot 的 `presetId`）筛出会话，取 `updatedAt` 最大者调 `ensurePreview`，把 `lastMessages` 快照传给 `BotRoster` 的 `lastMessages` prop（`buildRosterRows` 已支持，见 `rg "lastMessages\?:" packages/ui-dsh-bot/src/client/roster-items.ts`）。
- 小组行预览不动。
- 单测 `tests/bot-roster-preview-source.spec.tsx`：同缓存键不重复拉；`updatedAt` 变化重拉；无 message 条目留空；`setActive(false)` 后不再发请求。
- 完成后 tasks.csv Task 8 改回「已完成」并 commit（点名 Task 8 / BR-604）。

### Task 17：header.actions 身份 chip
- 按 spec Task 17。**preset 匹配同时认 `dsh-bot` 与 `dsh-bot--` 前缀**（spec 步骤 2 的 `startsWith('dsh-bot--')` 是旧文案，以注意事项与 BR-607 v0.3.1 为准）。
- 非 bot 会话 / preset 无匹配 / 名册未加载 → `return null`，不留占位。
- 幂等 `markRead`（session 作用域条目随会话切换重挂载）。

### Task 18：四枚 pill 浮层 + 对话切换 + 新开对话
- 「记忆 N」「例程 N」「同事 N」懒加载首次点开才请求、缓存 30s；第四枚「人设」浮层 + 「编辑人设」→ `overlay.open({ kind: 'edit-bot', id })`（`overlay-store.ts` 已有 `'edit-bot'` kind）；chip 本身 onClick 同样打开编辑。
- 「对话 ▾」列 `sessionsOf(botId)`，点一条 → `jumpToSession(sessions, sessionId)`（`session-jump.ts` L50，open-only 语义，不走 openSubagent）；「+ 新开对话」→ `createBotSession` → open，请求期间禁用。
- 浮层 portal 到 `document.body`，z-index 高于官方 header 低于官方 `shell.overlay`；Esc / 点外关闭；失败红字 + 重试。
- 样式对照原型 `.floatPanel`（L121）/ `.memoryPill`（BR-617）。

### Task 19：turnTail「例程触发」标签
- **第一步先做 ASM-608 核对**：在一条有例程发言的 bot 会话上，同时打印 `historyOf(sessionId)` 的 `origin === 'routine'` 条目 `seq` 与官方 `TurnLocation.start/end.seq`，写入 `evidence/UF-612/seq-check.log`。同源 → 区间匹配；不同源 → 按 `createdAt` 时间窗匹配，并在 spec §1.5 追加一行记录证伪。
- `select` 必须同步 O(1) 查表（history 预建 seq 索引，Task 7 的 `bySeq` 已在），不在 select 里发请求。
- 非 bot 会话永不命中。

### Task 20：Phase 3 回归
- `pnpm run typecheck && ./node_modules/.bin/vitest run packages/ui-dsh-bot/tests && pnpm --filter ui-dsh-bot run build` 全过。
- 真机：按 §5.2 环境准备重建 + 重启 :3084（`dsh-rpc-who.sh 3084` 核身份再 kill）。UF-605 步骤 1–5 走通并截图：`evidence/phase-3/identity-bar.png`（chip + 四 pill + 对话切换 + 新开对话）、`evidence/phase-3/popover.png`（记忆或人设浮层）、`evidence/phase-3/plain-session.png`（普通会话顶栏无身份条）、`evidence/phase-3/routine-tag.png`（若环境里有例程发言的会话；没有就用 `dsh-rpc.sh 3084 routineRunNow` 造一条，做不到则写明）、`evidence/phase-3/roster-preview.png`（步骤 0 的成果：名册行出现最后一句）。
- `evidence/phase-3/phase-summary.md` 按 evidence/README.md 模板。
- 不做 Task 21 及以后（Phase 4 单独一批）。

## 硬约束（不变）
- 不改 packages/dsh-bot-host；不改 env/profiles/gb/node_modules；客户端不 value-import @deepseek-ai/* UI 包。
- slot 组件渲染期不得读未 inject 的服务（betterSidebar 等）——在 `ctx.inject([...], …)` 回调里取引用经 props 传入。
- 不在任何地方渲染消息流 / composer（BR-606）；不拦截官方「+ 新会话」（BR-609）。
- 每完成一条 Task：更新 tasks.csv → commit（点名 Task/BR），只 add 相关文件；禁止 git add -A / stash / checkout / restore。

## 完成标准
- tasks.csv Task 8 与 17–20 全部「已完成」（做不到的如实「已阻塞:{原因}」）。
- `python3 ~/.claude/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-left-tab --repo .` 0 FAIL。
- evidence/phase-3 有 commands.log、上述截图、phase-summary.md；evidence/UF-612/seq-check.log 存在。
- worker_done 汇报：改了哪些文件、每条 Task 验证结果、ASM-608 结论、真机截图路径、spec 需要回写的发现、剩余风险。成功 --outcome succeeded；任一没做到 --outcome failed 并说明。

只有遇到必须由人决定的事才 ask；不要问「是否继续」。