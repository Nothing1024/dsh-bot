# Phase 2 回归摘要

日期：2026-09-08  
网关：`127.0.0.1:3084` pid `19777`，`DSH_HOME=.../dsh-grok-bot/plugin/env`。客户端重建后杀旧 pid `94795` 再 `sh env/boot.sh`。

## 命令级

见同目录 `commands.log` Task 8–16 段：

- `pnpm run typecheck` → EXIT 0
- `pnpm test` → 59 files / 400 tests passed
- `pnpm run build` → EXIT 0（ui-dsh-bot purity 无报错）
- `git diff --stat packages/dsh-bot-host/src` → 空
- `python3 ~/.claude/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-left-tab --repo .` → 0 FAIL / 1 WARN / 21 PASS（§3.3 锚点改指 `dsh-bot-shared`）

Task 6–7 已在本批开工前落地（`b2e129d` / `97def82`）。Task 8–15 本批提交：`c263b5c` … `fb5ed6f`。

## 真机（UF-603 步骤 1–6，UF-608 步骤 1–2）

环境无「代码审查官」；用「诗人小北」（多段绑定会话）与新建「左栏测试」（0 段）走同一状态机。

| 步骤 | 结果 | 截图 |
|---|---|---|
| UF-601 切 Bot | 底栏 `aria-pressed=true`；`[data-testid=dsh-bot-region][data-wide=1]` 分段条 + 名册（置顶/工作/生活、搜索、关系图/新建人设/新建小组） | `roster.png` |
| UF-603-1/2 点「诗人小北」 | 行选中；下挂 ≤8 段 + 「+ 新开对话」；`sessions.open` 打开官方中栏「诗人小北」对话 + composer | `open-session.png` |
| UF-603-3 点下挂「来自 运维夜班」 | 该行 `data-current=1`；标题切到「来自 运维夜班」 | （同会话态） |
| UF-603-5 「+ 新开对话」 | 新建 `session-23647450-…` 出现在下挂顶部并打开 | （同会话态） |
| UF-603-6 官方「+ 新会话」 | 不被拦截，中栏进「探索未至之境」 | overlay-form 背景可见 hero |
| UF-608-1 「+ 新建人设」 | `shell.overlay` 模态：名字/人设/头像/颜色/模型；焦点在「名字」；保存禁用 | `overlay-form.png` |
| UF-608-2 保存「左栏测试」 | 模态关闭；名册出现并选中；中栏未自动开会话 | 行 `dsh-bot-row-zuolan-ceshi` `data-selected=1` |
| UF-603-4 点 0 会话「左栏测试」 | `createBotSession` → 中栏打开空官方会话（hero + 预设「左栏测试」） | 标题「左栏测试」 |
| UF-609 关系图 | 节点 + 同组虚线 + 图例「编辑室 / 校对组」 | `graph.png` |
| UF-611 ⌘K | 面板列出人设/小组/当前会话/切到会话模式；输入框获焦 | `palette.png` |

收尾：`deleteBot(zuolan-ceshi)` 已删掉真机临时人设。console 无新增 error。

## ASM / 实现备注

- Task 7 走 B 路（host 无 `case 'overview'`），已在 spec §1.5 记一行。
- `activateTab` 只在 `ctx.inject(['betterSidebar'], …)` 回调里取，经 `sidebarFace` observable 传给 region / overlay / `openGroup`，未再踩 inject 墙。
- 根 `pnpm run typecheck` 要求 `client.sessions as unknown as SessionListFace`（官方 `list.getSnapshot().byId` 尚未声明 `pendingInteraction`）。
- 悬停预览在 jsdom 里 `matchMedia('(pointer: coarse)')` 会误匹配，实现改为 coarse&&!fine 才禁用。

## 剩余风险

- 名册预览句（最后一句）本批未接 history 懒加载，行预览多为空，悬停卡仍有模型/例程/会话数。
- ⌘K 在输入框获焦时按设计不触发；真机需先 blur 中栏 composer。
- 未做 Task 17+（身份条 / turnTail / README）。
