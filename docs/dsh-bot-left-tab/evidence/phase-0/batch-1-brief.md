# 任务：dsh-bot-left-tab 第一批 —— Phase 0 校准 + Phase 1 左栏模式切换骨架（Task 1–5）

你在仓库 /Users/nothing/workspace/dsh/plugin/dsh-grok-bot/plugin（当前 worktree，分支 main）。这是一个 prd-workflow 任务包的执行，不是自由发挥。

## 必读（先读完再动手）
1. docs/dsh-bot-left-tab/handoff.md —— 交付 Prompt，含执行环境假设、禁止事项、执行循环、完成标准。
2. docs/dsh-bot-left-tab/spec.md —— 唯一事实源。本批重点：§0、§1.3 事实、§1.4 假设 ASM-601~605、§2.1 BR-601/602/603/610/611、§2.3 UF-601/UF-602/UF-604 流程脚本、§3.3/§3.5 定位、§4 Task 1–5 详情、§5.2 环境准备。
3. docs/dsh-bot-left-tab/tasks.csv —— 状态板，只做 Task 1–5。
4. ~/.claude/skills/prd-workflow/references/execute-mode.md（如存在）—— 执行循环规范。

## 本批范围
- Task 1：校准 ASM-601~605（priority -1 遮蔽 spike）。产出 evidence/phase-0/calibration.md + shadow-on.png + shadow-off.png + git-status-before.txt。任一假设证伪 → 停下，状态板标「已阻塞:{原因}」，用 worker_done --outcome failed 汇报，不要自行改方案。
- Task 2：sidebar-mode.ts + region-registration.ts（ctx.slots.inject('sidebar.workspaces', ...) priority -1，disposer 化）+ 单测。
- Task 3：BotRegion 壳（分段条 / loading-error-empty 三态 / wide-rail）+ CSS modules + 词条 + 单测。
- Task 4：sidebar.footer.action「Bot」开关行 + 单测 + build。
- Task 5：Phase 1 回归：pnpm run typecheck && ./node_modules/.bin/vitest run packages/ui-dsh-bot/tests && pnpm --filter ui-dsh-bot run build 全过；真机 UF-601 步骤 1/5、UF-602 步骤 1-3 走通并截图到 evidence/phase-1/。
- 不做 Task 6 及以后。

## 环境
- 网关 :3084、profile gb。改客户端代码后：pnpm run build → ~/.agents/skills/dsh-plugin-debug/scripts/dsh-rpc-who.sh 3084 核身份 → kill <pid> → sh env/boot.sh → 刷新 http://127.0.0.1:3084。
- 真机回放优先用你可用的浏览器工具；没有则邻仓 Playwright（../../dsh-genoffice/engine/node_modules/playwright，channel chrome）截图；再没有就写逐步手动脚本进 evidence 并在汇报里说明。
- 官方包只读：env/profiles/gb/node_modules/@deepseek-ai/* 一个字都不改。packages/dsh-bot-host 不改。
- 客户端 bundle 纯度：不能 value-import 任何 @deepseek-ai/* UI 包（tsdown 会拒绝），继续用鸭子类型。

## Git 纪律
- 每完成一条 Task 就更新 tasks.csv 状态并 commit（scope 前缀 + 点名 Task/BR 编号，中文），只 git add 本包相关文件；禁止 git add -A、stash、checkout、restore。
- 开工第一步：git status --short > docs/dsh-bot-left-tab/evidence/phase-0/git-status-before.txt。

## 完成标准
- tasks.csv 1–5 全部「已完成」（或 Task 1 证伪时如实「已阻塞」）。
- python3 ~/.claude/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-left-tab --repo . 仍 0 FAIL。
- evidence/phase-0、evidence/phase-1 按 spec §5.3 落盘。
- 用 worker_done 汇报：改了哪些文件、五条 ASM 结论、验证命令结果、真机截图路径、剩余风险。成功 --outcome succeeded；任何一条没做到 --outcome failed 并说明。

不要中途问「是否继续」；只有 Task 1 证伪或遇到必须由人决定的事才用 ask。
