# 任务：dsh-bot-left-tab 第四批 —— Phase 4 文档、真实场景与收尾（Task 8 / 18 小修 + Task 21–23）

第三批（Task 8 步骤 6 + Task 17–20）已由协调者审查通过：typecheck 0 错、`vitest run packages/ui-dsh-bot/tests packages/dsh-bot-shared/tests packages/workbench-ui/tests` 47 文件 238 测全过、ui-dsh-bot bundle 纯度通过、host / env 零 diff、validate 0 FAIL / 30 anchor 命中；ASM-608 消解按协议回写 §1.3 / §1.5；`matchRoutineTurn` 同步查表、turnTail 重挂全程 disposer 化。继续在同一仓库、同一分支 main、当前 worktree 做第四批。spec 已升到 **v0.3.3**（commit 1ffd694），本地即最新，**重新读 spec**：§1.5 首行登记了四项，其中两项是代码小修（本批步骤 0），两项是文案 / 登记（无代码）。

协调者对第三批的判定与登记（已写进 spec，这里只点名）：
- ① BR-604：默认 DSH Bot 的最后一条 message 是工具回执 JSON，名册行预览成了 JSON 转储 → 预览要跳过 JSON 转储文本（Task 8 步骤 6 文案已改，**本批补**）。
- ② BR-616 / Task 18 步骤 1：原「首次点开才请求」导致未加载时显示「记忆 0」，与真实 0 不可区分 → chip 挂载即预取三类计数（各一次调用，按 bot 缓存 30s），未返回前 pill 只显示标签不显示 N（**本批补**）。
- ③ UF-605 步骤 4：官方空 hero 没有 `header.actions` 座位，新开对话后看不到身份条是平台约束，非缺陷；文案已改（§1.3 新增一行、§2.3 步骤 4、§5.2 UF-605 行）。**无代码**。
- ④ §3.4 已登记 `ensureWakes` 对官方 `POST /api/session.history` 的只读消费。**无代码**。

## 必读
1. docs/dsh-bot-left-tab/spec.md：§1.5 首行（v0.3.3）、§1.3 末两行（ASM-608 / hero 约束）、§2.1 BR-604（v0.3.3 文案）/ BR-616、§4 Task 8 步骤 6（v0.3.3 文案）、Task 18 步骤 1（v0.3.3 文案）、Task 21 / 22 / 23 详情（逐条读，含注意事项）、**§5 全部**（5.1 入场券、5.2 环境准备 + 执行矩阵 30 行、5.3 目录结构、5.4 检查清单）。
2. docs/dsh-bot-left-tab/handoff.md 禁止事项与执行循环。
3. docs/dsh-bot-left-tab/evidence/phase-2/phase-summary.md 与 phase-3/phase-summary.md 的「ASM / 实现备注」——你自己记的（B 路、inject 墙、`as unknown as SessionListFace`、matchMedia、hero 无 header.actions、host 不写 origin），本批继续适用。
4. docs/dsh-bot-left-tab/evidence/README.md（命名规则 + Phase Summary 模板）。

## 本批范围（按顺序）

### 0a. Task 8 小修：预览跳过 JSON 转储（BR-604 v0.3.3）
- `roster-rpc.ts` `ensurePreview`：从 `items` 末尾向前取第一条满足「`kind === 'message'` && `text` 非空 && 非 JSON 转储」的条目。JSON 转储判定：`text.trim()` 以 `{` 或 `[` 开头且 `JSON.parse` 不抛 → 跳过继续向前；全部跳过则留空。
- `tests/bot-roster-preview-source.spec.tsx` 加两例：最后一条是 JSON 转储时取前一条正文；全是 JSON 时留空。
- tasks.csv Task 8 改回「已完成」（备注写明 6443d8f + 本次 commit）→ commit（点名 Task 8 / BR-604）。

### 0b. Task 18 小修：pill 计数预取 + 未加载不显 N（BR-616 v0.3.3）
- `IdentityBar.tsx`：chip 挂载（bot 匹配成功）即预取记忆 / 例程 / 同事三类计数，各一次调用，按 `botId` 缓存 30s（沿用现有缓存）；计数未返回前 pill 只渲染「记忆」「例程」「同事」标签，不渲染 N；返回后显示 N（含真实 0）；失败仍走浮层内红字 + 重试，pill 上不显示错误数。
- 浮层正文仍是点开才展示（列表内容可复用预取结果，不必二次请求）。
- `tests/identity-bar-popovers.spec.tsx` 加例：挂载后立即有三次计数调用；数据到达前 pill 文本无数字；到达后出现 N；30s 内切回同 bot 不重拉。
- tasks.csv Task 18 改回「已完成」（备注 7fec673 + 本次 commit）→ commit（点名 Task 18 / BR-616）。

### Task 21：README「左栏 Bot 模式」+ 原型文档落地记录
- 按 spec Task 21 两步。`README.md` 入口表新增行（`rg "右栏页签" README.md` 定位 L71 附近）；`docs/prototypes/left-sidebar-bot-tab.md` 末尾追加「落地记录（2026-09-08）」：链接 `docs/dsh-bot-left-tab/spec.md`，写明四条偏差（分段条只在 Bot 态 / 官方「+」不变 / 小组不进中栏 / 会话态不复刻官方树），再补 v0.3.3 的两条平台约束（hero 无身份条；host 不写 origin → 官方 session.history 回退）。
- **不改 `docs/prototypes/dsh-bot-left-tab.html`**。
- 验证：`rg -n "左栏 Bot 模式" README.md`、`rg -n "落地记录" docs/prototypes/left-sidebar-bot-tab.md` 都命中 → 写 `evidence/phase-4/commands.log` → tasks.csv Task 21 已完成 → commit。

### Task 22：5.2 真实场景全套测试（P0，本需求完成的唯一标准）
- 先按 §5.2 环境准备：步骤 0a/0b 改了客户端代码，必须 `pnpm run build` 后 `~/.agents/skills/dsh-plugin-debug/scripts/dsh-rpc-who.sh 3084` 核身份、`kill <pid>`、`sh env/boot.sh`。干净状态：清三个 localStorage 键后刷新。
- **执行矩阵 30 行逐行回放**，每行的截图 / console / RPC 样例文件名与矩阵 Evidence 列**一字不差**，落到 `evidence/UF-601/` … `evidence/UF-612/`、`evidence/phase-4/hmr.png`。工具顺序：浏览器工具优先 → 邻仓 Playwright（channel chrome）→ 手动脚本 + 回填。第三批 phase-3 下已有的截图不能直接改名充数：UF-605 / UF-610 / UF-612 的矩阵行要在 0a/0b 之后的新构建上重新截（identity-bar.png 必须体现「计数到达后显示 N」或「未到只显标签」之一，并在 summary 里写清是哪种）。
- **破坏性行的保护措施**（矩阵写的操作照做，但先备份再还原）：
  - 「空名册」「删除一个 bot」「删光小组」「移除模型凭据」这些行，操作前 `cp env/dsh-bot/bots.json /tmp/lt-bots.json.bak`、`cp env/dsh-bot/groups.json /tmp/lt-groups.json.bak`（凭据同理），该行截完立即还原并重启网关，还原后 `git status --short` 里 `env/dsh-bot/*` 不得出现（本仓这两个文件若受版本控制则 diff 必须为空；若不受控则与备份 `diff` 为空）。
  - 「删除一个 bot」优先用矩阵指定的临时人设 `左栏测试`（UF-603 步骤里建的那个），不要删现有人设；protected 的 DSH Bot 绝不能碰。
  - 「杀网关」用 `dsh-rpc-who.sh 3084` 核身份后再 kill，测完 `sh env/boot.sh` 拉回。
  - 「DevTools 阻断 /dsh-bot/events」只在浏览器侧阻断，不改 host。
- 任一行失败 → 回到对应 Task 修代码（遵守硬约束）→ 重建重启 → 重跑该行；修复要单独 commit 并点名 Task / BR。**不允许**为了让行通过而改 spec 的核对点；spec 若确有错，在 summary「spec 需回写」列出，等协调者定。
- 确实做不到的行（工具缺失、环境不具备）：写 `evidence/UF-6xx/BLOCKED.md` 说明原因与已尝试的替代方案，tasks.csv Task 22 标「已阻塞:{原因}」，不要伪造截图。
- 完成后 `python3 ~/.claude/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-left-tab --repo .` → 0 FAIL；tasks.csv Task 22 状态 → commit（evidence 文件只 add 本批产出）。

### Task 23：Phase 4 回归 + 收尾
- `pnpm run typecheck && pnpm test && pnpm run build && pnpm run standard:check` 全过，命令与退出码进 `evidence/phase-4/commands.log`。
- `git diff --stat packages/dsh-bot-host/src` 为空（INV-602）；`env/profiles` 未被写入（INV-605）。
- `git status --short` 与 `evidence/phase-0/git-status-before.txt` 对比：`.grok/`、`.vscode/`、`env/attachments/` 三个未跟踪项仍在、无被回退或删除（INV-604）；除此之外工作区应干净。
- 清理测试残留：`左栏测试` 人设已删、bots.json / groups.json 与备份一致、临时小组已删。
- `evidence/phase-4/final-summary.md`：按 README 模板 + 一张 5.2 矩阵 30 行的「行 → 通过/阻塞 → evidence 路径」总表 + 5.4 检查清单逐条勾选（每条给出核对方式）+ 「spec 需回写」+ 剩余风险。
- tasks.csv Task 23 已完成 → commit。

## 硬约束（不变）
- 不改 packages/dsh-bot-host；不改 env/profiles/gb/node_modules；客户端不 value-import @deepseek-ai/* UI 包。
- slot 组件渲染期不得读未 inject 的服务——在 `ctx.inject([...], …)` 回调里取引用经 props 传入。
- 不在任何地方渲染消息流 / composer（BR-606）；不拦截官方「+ 新会话」（BR-609）。
- 每完成一条 Task：更新 tasks.csv → commit（点名 Task/BR），只 add 相关文件；禁止 git add -A / stash / checkout / restore。
- 上下文吃紧时先把当前 Task 的 evidence 与 tasks.csv 落盘并 commit，再继续；不要把半截状态留在工作区。

## 完成标准
- tasks.csv Task 8 / 18 / 21 / 22 / 23 全部「已完成」（做不到的如实「已阻塞:{原因}」）。
- `python3 ~/.claude/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-left-tab --repo .` 0 FAIL。
- evidence/UF-601 … UF-612 按矩阵齐全；evidence/phase-4 有 commands.log、hmr.png、final-summary.md。
- 工作区只剩 phase-0 基线里的三个未跟踪目录。
- worker_done 汇报：每条 Task 验证结果、5.2 矩阵通过 / 阻塞行数与阻塞原因、修复过的行及其 commit、真机截图路径、spec 需要回写的发现、剩余风险。全部通过 --outcome succeeded；任一未通过或阻塞 --outcome failed 并说明。

只有遇到必须由人决定的事才 ask；不要问「是否继续」。
