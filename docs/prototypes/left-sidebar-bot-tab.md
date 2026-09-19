# 官方左栏 Bot 选项卡：调研与原型改进

日期：2026-09-07。对照：`real-dsh-ui-survey.md`、官方 `slots.d.ts`、现有 4 份 HTML 原型、线上 `ui-dsh-bot`。

## 问题

当前产品与多数原型把 **Bot 产品面整块塞进 better-sidebar 右栏 iframe**（`dsh-bot:sessions` → `/dsh-bot/ui`）。官方左栏仍是工作区会话树，中栏仍是官方对话/轨迹。结果是两套壳：

- 官方：品牌 / 新会话 / 会话树 / 对话 / 轨迹 / composer
- 插件：名册 / 自绘对话 / 人设 / 记忆 / 例程

用户要的是 **界面融合**：左侧官方侧边栏有一个 **Bot 切换选项卡**，点人设后对话走官方中栏，而不是再开一套 sidebar 工作台。

## 官方左栏真实座位（不能编）

`dsh-client-ui-sidebar` 声明的左栏洞：

| slot | kind | 谁占 | 能不能加选项卡 |
|---|---|---|---|
| `sidebar.brand.mark` / `name` | single | 鱼标 +「deepseek HARNESS」 | 否 |
| 新会话按钮 | 壳自带，无 slot | 官方 | 否 |
| `sidebar.workspaces` | **single** | ui-workspace 整棵会话树 | **注册 = 换掉整棵树**，不能加法叠一层 tab |
| `sidebar.footer.action` | **list** | 空着 | 只能加底行按钮（native-surface 的 🤖） |
| `sidebar.settings` | single | 设置 | 否 |

**没有** `sidebar.tab` / `sidebar.mode` /「会话 | Bot」分段座位。  
`dsh-integrated.html` 画的顶部分段、`native-surface.html` 的 56px 假 rail，都是编的。

## 现有原型各自错在哪

> 2026-09-08：下表四份原型与 `dsh-bot-complete.html` 已移入 `../archive/prototypes/`（理由见 `../archive/README.md`）；本目录只保留 `dsh-bot-left-tab.html` 与真实 GUI 调研材料。

| 文件 | 策略 | 为什么不对 |
|---|---|---|
| `dsh-bot-grok-parity.html` | Bot 中心整页住在右栏 overlay | 完全依赖 better-sidebar，官方左栏与中栏闲置 |
| `dsh-bot-on-real-shell.html` | 底栏 🤖 打开右栏 iframe | 入口在 footer，不是选项卡；产品面仍在 sidebar |
| `dsh-integrated.html` | 左栏「会话 \| Bot」分段 | 分段座位不存在；且中栏仍画了一套假 Chat 壳 |
| `native-surface.html` | 56px 宿主 rail + 插件三栏 | 不是官方 sidebarCol；对话面又是自绘 |
| 线上 workbench | iframe 完整 roster+Conversation | 与官方对话面重复 |

`dsh-bot-native-surface` 曾走 footer.action + 标题栏身份标，用户 2026-09-06 判定「切成几个小座位产生不了 Bot 中心」而搁置。本次方向不同：**选项卡在官方左栏，名册替换会话树，对话交还官方中栏**。这是 Bot 中心（左栏切身份）+ 官方对话面（中栏不重画）。

## 落地约束（给实现，不是给原型）

要在官方左栏出现「会话 | Bot」选项卡，**只能占 `sidebar.workspaces`（single）**：自绘一层 segmented control，会话态把官方树的行为复刻或把 ui-workspace 嵌回来，Bot 态渲染名册。点人设 → `sessions.open` / `sessions.create`（preset `dsh-bot--<slug>`），中栏保持 `conversation`。

不要：

- 用 `sidebar.footer.action` 冒充选项卡
- 继续把 1:1 对话画在 iframe
- 注册 `root` / `sidebar` 整列（会阴影官方壳）

小组房间仍不是官方 session，只在 Bot 态进房间。1:1 绑定官方 session（`sessions.open` / preset `dsh-bot--<slug>`），但 **Bot 态中栏 chrome 不是官方「会话标题 + 对话/轨迹」**。

## Bot 态 ≠ 会话树（对照 grok-bot `workbench-ui`）

`packages/workbench-ui/src/Roster.tsx` / `Conversation.tsx` / `roster-sections.ts` / `session-binding.ts` 才是 Bot 产品面。行是**身份**（人设或小组），不是会话：

| | 会话 tab（官方） | Bot tab（grok-bot） |
|---|---|---|
| 左栏头 | 工作区 / 搜索会话 | **人设** + 关系图 + 新建人设 + 新建小组 |
| 分组 | 工作区文件夹 | **置顶 / 工作 / 生活**（小组混在同一名册） |
| 行 | 会话标题 + 时间 | 气泡脸 / 马赛克 + 名字 + **最后一句预览** + 未读 + 会话数 |
| 会话放哪 | 树本身 | 只在**当前选中身份**下挂绑定会话；顶栏「对话」切换器也能切 |
| 中栏 | 会话标题 + 对话/轨迹 + 官方 composer | 身份顶栏 + 记忆/例程/同事 + 「对话」切换 + 人设 composer |
| 新建 | 新会话 → 官方 hero | 新建人设 → BotForm；新开对话 → 该身份空会话 |

不要把 Bot 态画成「bot 当文件夹、底下展开会话、小组单独一节」——那是把人设名册做成了第二棵会话树。

## 完整原型（A 已锁定，可直接演示）

打开 `dsh-bot-left-tab.html`。真实壳（16px / `#151517` / 鱼标）。「会话 | Bot」占 `sidebar.workspaces`。

底栏是 **10 个分镜**，数字键 `1–9` / `0` 或左右方向键切换：

| 键 | 分镜 | 看什么 |
|---|---|---|
| 1 | 会话 | 官方工作区树 + 官方对话/轨迹 |
| 2 | 新会话 | 官方「+」→ 探索未至之境 |
| 3 | 名册 | grok 人设名册：置顶/工作/生活，小组马赛克 |
| 4 | 审查 | 人设台 + 工具/思考节点 |
| 5 | 审批 | 审批卡 / 提问卡（仍绑定官方 session） |
| 6 | 巡检 | 例程主动来消息，未读挂在人名上 |
| 7 | 小组 | 插件房间，成员轮次发言 |
| 8 | 记忆 | 顶栏浮层：记忆 / 例程 / 同事 |
| 9 | 关系图 | 谁和谁在一组 |
| 0 | 新建 | 中栏表单；Bot 态「+」= 新开对话 |

可点交互：名册 ⋯ 菜单、搜索、发送、⌘K 跳转、主题、新建/编辑/删除人设与小组。`B` / `C` 只在底栏备选，不是主路径。`?debug=1` 才显示状态 JSON。

共用规则：会话 tab 仍是官方树 + 官方对话/轨迹。Bot tab 点 1:1 → 绑定官方 session，chrome 是人设台；点小组 → 插件房间面。官方壳「+」在 Bot 态变成「新开对话 / 新开房间 / 新建人设」，不再打开「探索未至之境」。

从「1 会话」直接点左栏 **Bot** 选项卡也会带上上次人设（默认代码审查官），不会落到空中栏。数字键切分镜会回滚未读 / 审批卡，方便来回讲。

## 源码核对（2026-09-07）

今天线上仍是第二套壳：`ui-dsh-bot` 的 `apply()` 只给 better-sidebar 注册 `dsh-bot:sessions` iframe（`/dsh-bot/ui`），`inject.ts` 只要 `sessions` + `locale`，**没有 slots / contributes**。1:1 已是官方 session（`platform.createSession` + `dsh-bot--<slug>` + `bot:<id>` marks），但画在 iframe Transcript 里，除非 `sessions.open` 跳出去。小组是插件 jsonl，`roomId ≠ sessionId`。

`sidebar.workspaces` 是 ui-sidebar 声明、ui-workspace `WorkspaceBrowser` 占用的 **root-scoped single**。再 `register()` 会阴影官方树；没有 `sidebar.tab`。`sidebar.footer.action` 只适合底行按钮，不能冒充选项卡。不要占 `root` / `sidebar` / `conversation`。Variant A 落地：占 `sidebar.workspaces`，自绘「会话 | Bot」，会话态复刻或回嵌官方树，Bot 态画 grok 名册；1:1 用 `sessions.open` / `POST /dsh-bot/createBotSession`，小组仍走插件房间。

## 落地记录（2026-09-08）

实现合同：[`docs/archive/dsh-bot-left-tab/spec.md`](../archive/dsh-bot-left-tab/spec.md) v0.3.4。`docs/prototypes/dsh-bot-left-tab.html` 只作方向，本文件不再改 HTML 原型。

与原型的四条偏差：

- **分段条只在 Bot 态**：底栏「Bot」用 `priority: -1` 遮蔽 `sidebar.workspaces` 后，才在左栏顶画「会话 | Bot」。会话模式注销遮蔽，官方树原样回来，不在官方树上叠一层分段条。
- **官方「+」不变**：Bot 模式不拦截、不改写官方「+ 新会话」。新开 bot 对话的入口在名册选中身份下方和身份条上。
- **小组不进中栏**：点小组走右栏「DSH Bot」页签（`activateTab` + `dsh-bot:select-group`），中栏不画房间面。
- **会话态不复刻官方树**：切回会话 = dispose 遮蔽注册，不自绘、不 CSS 隐藏、不回嵌一棵假树。

v0.3.3 平台约束（非缺陷）：

- 官方空 hero（新会话尚未发消息）没有 `conversation.session.header.actions` 座位，身份条只能在首条消息后、官方对话头出现时渲染。
- host 不给例程 wake 写 `origin`；客户端 `ensureWakes` 只读消费官方 `POST /api/session.history`，把 `[routine]` user/message 的 seq 补进 `routineBySeq`。
