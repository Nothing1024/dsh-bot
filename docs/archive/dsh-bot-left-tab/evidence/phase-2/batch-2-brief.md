# 任务：dsh-bot-left-tab 第二批 —— Phase 2 名册内容与打开会话（Task 6–16）

第一批（Task 1–5）已由协调者审查通过：typecheck / 42 测 / build / validate 全过，真机截图属实，五条 ASM 消解干净。继续在同一仓库、同一分支 main、当前 worktree 做第二批。spec 已升到 v0.3.1（commit e9d4550），**先 git pull 无需——本地即最新，但要重新读 spec**，因为 BR-607 文案和 Task 8/17 注意事项变了。

## 必读
1. docs/dsh-bot-left-tab/spec.md：§2.1 BR-604/605/608/609/610/612/613/614/615/617/618/619/621、§2.3 UF-603/UF-606/UF-607/UF-608/UF-609/UF-610/UF-611、§3.2/§3.3、§4 Task 6–16 详情（逐条读，含注意事项）、§5.2。
2. docs/dsh-bot-left-tab/handoff.md 的禁止事项与执行循环。
3. docs/dsh-bot-left-tab/evidence/phase-1/phase-summary.md「真机排障」——slot 组件渲染期不能读未 inject 的服务（betterSidebar），本批 Task 8/11/12 都要用 activateTab，必须在 `ctx.inject(['betterSidebar'], …)` 回调里取引用再经 props/闭包传入。

## 本批范围（按 tasks.csv 前置顺序）
- Task 6 抽共享逻辑包 `packages/dsh-bot-shared`（roster-sections / avatar / session-binding + RPC 类型；workbench-ui 改 import，零行为变更；`pnpm install` 让两包 `workspace:*` 依赖生效；确认 tsdown 把它内联进 lib/client.js）。
- Task 7 roster-rpc 数据层。**ASM-607 已查：host 没有 `case 'overview'`，走 B 路**——`listBots` + `listGroups` + 选中 bot 懒拉 `listBotSessions`，SSE `/dsh-bot/events` 触发刷新、断开回落 2s 轮询；补齐 createBot/updateBot/deleteBot/createGroup/updateGroup/deleteGroup/createGroupSession/markRead/updateBotLayout/memoryList/routineList/peerLog/historyOf。并在 spec §1.5 追加一行「Task 7 走 B 路，overview 落地后切 A」。
- Task 8 名册渲染（分组/行/搜索/已隐藏/rail 头像列/红「@」pending 徽章 BR-619）。
- Task 9 点人设三分支打开官方会话 / 下挂会话 / 新开对话 / markRead。
- Task 10 ⋯ 菜单（置顶/移组/标已读/隐藏/静音；编辑/删除留位给 Task 12）。
- Task 11 点小组 → activateTab + postMessage `dsh-bot:select-group`；workbench-ui App.tsx 加接收（该文件有其他人的历史改动已提交，正常改即可）。
- Task 12 shell.overlay 模态：新建/编辑/删除人设与小组 + 名册头部按钮 + 菜单编辑/删除。
- Task 13 关系图 overlay + 小组「+ 新开房间」。
- Task 14 悬停预览卡。
- Task 15 ⌘K 命令面板。
- Task 16 Phase 2 回归：`pnpm run typecheck && pnpm test && pnpm run build` 全过；`git diff --stat packages/dsh-bot-host/src` 为空；真机 UF-603 步骤 1–6 与 UF-608 步骤 1–2 截图到 evidence/phase-2/。
- 不做 Task 17 及以后。

## 硬约束（与第一批相同）
- 不改 packages/dsh-bot-host；不改 env/profiles/gb/node_modules；客户端不 value-import @deepseek-ai/* UI 包。
- 视觉按 BR-617 对照 docs/prototypes/dsh-bot-left-tab.html 对应 class（行号见 spec §3.3 末行）。
- 改客户端代码后重建 + 按 §5.2 环境准备重启 :3084 再真机验证。
- 每完成一条 Task：更新 tasks.csv 状态 → commit（点名 Task/BR），只 add 相关文件；禁止 git add -A / stash / checkout / restore。

## 完成标准
- tasks.csv 6–16 全部「已完成」（做不到的如实「已阻塞:{原因}」）。
- `python3 ~/.claude/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-left-tab --repo .` 0 FAIL。
- evidence/phase-2 有 commands.log、roster.png、open-session.png、overlay-form.png、graph.png、palette.png、phase-summary.md。
- worker_done 汇报：改了哪些文件、每条 Task 的验证结果、真机截图路径、spec 需要回写的发现、剩余风险。成功 --outcome succeeded；任一没做到 --outcome failed 并说明。

只有遇到必须由人决定的事才 ask；不要问「是否继续」。
