# 真实 DSH GUI 调研

对照对象：`docs/archive/prototypes/dsh-bot-complete.html`（2026-09-08 归档，原位于 `docs/prototypes/`）（协调者按 slot 名推想的「官方壳」）。  
方法：逐张读仓库证据 PNG（macOS Vision OCR）+ 2026-09-06 本仓网关 `127.0.0.1:3084` 一手 a11y / DOM / Playwright。  
网关身份：`dsh-rpc-who.sh 3084` → `pid=32077`，`DSH_HOME=…/dsh-grok-bot/plugin/env`，已在跑，未改 `env/`。  
一手产物：`docs/prototypes/real/`。

材料分两类，不能混：

| 类型 | 代表图 | 实际是什么 |
|---|---|---|
| 官方壳 | `closer-gui-new.png`、`jump-visible.png`、`v1-gui-chat.png`、`gui-stream-reply.png`、`pw-*.png` | `@deepseek-ai/dsh-client-ui-*` 三栏 + hero / 对话 / 轨迹 |
| 插件工作台 | `live-conversation.png`、`bot-session-binding.png`、`standalone-fallback.png`、native-experience 全部 PNG | `/dsh-bot/ui` iframe（或独立页），自带人设名册 + 自绘对话面 |

---

## A. 真实官方界面逐区

### A1. 总壳

官方是 **三栏 AppFrame**，不是原型那种永远 264 / 1fr / 320 的固定网格。

- 根：`#root` → `[data-slot="root"]` → `.pI_x6G_frame`
- 三列 class：`.pI_x6G_sidebarCol` / `.pI_x6G_centerCol` / `.pI_x6G_detailsCol`
- 折叠标记：`data-sidebar-collapsed`、`data-details-collapsed`
- 左栏收起后仍留 **56px rail**（官方文档与活页一致）
- 右栏 `details` **默认关到 0 宽**；hero / 切会话也会把它收掉
- 另有一层 **better-sidebar**（`[data-dsh-better-sidebar]`）：IDE 页签条，不是 `details`

截图：`docs/prototypes/real/pw-landing.png`、`docs/archive/dsh-bot-workbench/evidence/phase-4/closer-gui-new.png`

### A2. 左侧栏（`data-slot="sidebar"`）

自上而下，活页 + `closer-gui-new.png` / `asm401-*.png` / `pw-new-session.png`：

1. **品牌行**：鱼标 + 文案 **「deepseek HARNESS」**（不是「DSH」）。slot：`sidebar.brand.mark`、`sidebar.brand.name`
2. **新会话** 按钮（`aria-label="新建会话"`）
3. **工作区** 头：搜索（`搜索会话…`）、视图选项、添加工作区
4. **会话树** `role="tree"`（`sidebar.workspaces`）
   - 工作区节点：`plugin`（可展开）
   - 其下会话行：标题 + 相对时间（「6天」「刚刚」）
   - 「展开其余 N 个会话」折叠
   - 分组 **「未分组」**
5. **底栏只有「设置」**（`sidebar.settings` / `settings.trigger`）
6. `sidebar.footer.action` **座位在，当前为空**——没有「🤖 DSH Bot」底按钮，也没有 ⌘K 搜索行

收起态 rail：打开侧边栏 / 新建会话 / 添加工作区 / 搜索 / 设置，约 56px。

**没有**「会话 | Bot」分段开关，**没有**人设名册、头像、未读徽章。名册只存在于插件 iframe。

### A3. 顶部标题栏（仅会话阶段）

hero 时 header 隐藏（`.wSkVaW_header.wSkVaW_headerHidden`）。打开会话后：

- 左：面包屑「会话层级」，当前 title（如 `v1 leftover t18`）
- `conversation.session.header.actions`：官方 Agent 预设标 **「DSH Bot」**（三角鱼标 + 文案，不是 Bot 头像）
- `conversation.session.header.utilities`：**Session log** 按钮
- 其下同一条 chrome：**「对话」|「轨迹」** 两个 `role="tab"`
  - class：`.wSkVaW_tab` / `.wSkVaW_tabActive`
  - 中文，不是 Chat / Trajectory
- **没有** 房间页签、成员条、记忆/例程 pill、分叉按钮、详情开关画在标题栏右侧

截图：`docs/prototypes/real/pw-session-open.png`、`docs/archive/dsh-bot-session-nav/evidence/phase-1/jump-visible.png`

### A4. 会话视图 tab —— 存在，但不是原型画的

| 真实 | 原型 |
|---|---|
| 「对话」（ui-conversation 自带） | Chat |
| 「轨迹」（ui-trajectory 注册到 `conversation.view`） | Trajectory |
| 无「房间」 | 小组才出现「房间」 |

轨迹页：`Duration / Turns / Calls / Input / Model / Tools` 过滤，按 `SYSTEM / USER / CONTEXT / ASSISTANT` 列事件。  
截图：`docs/prototypes/real/pw-trajectory.png`、`live-trajectory.png`

### A5. 新会话 hero（`data-phase="hero"`）

中栏垂直居中，**不是**「开始一段新对话」：

- 大标题 **「探索未至之境」**
- 角标 **「预览版」**
- 鱼标 seat：`conversation.hero.brand.mark`
- 一行两个 pill：工作区（`plugin`）+ Agent 预设（`DSH Bot`）
- **没有** 人设卡片网格
- composer **嵌在 hero 里**（`.wSkVaW_composerHero`），placeholder **「描述你想要构建的内容」**

截图：`docs/prototypes/real/pw-new-session.png`、`closer-gui-new.png`、`probe-gui.png`

### A6. 消息气泡（官方对话页）

活页量过几何：

- 用户：`.gdEzaW_userStack` + `.gdEzaW_bubble`，`align-items: flex-end` → **靠右气泡**
- 助手：不是对称左气泡，而是 **左对齐文档流**（段落 + 折叠行）
- **无头像、无「谁」标签**
- 用户气泡旁：时间（`8月30日 19:41`）、复制
- 助手后：复制 / 好的回答 / 有问题的回答 / 在新对话中分支 / 用时 / 首 token / tok/s
- 中间节点是折叠 disclosure，不是聊天气泡：
  - `上下文注入 · @deepseek-ai/dsh-system-prompt`
  - `上下文注入 · skill-catalog`
  - `Think · …`
  - 工具行（有则点开进 `details`）

流容器：`[data-conversation-scroll]`，节点 `conversation.chat.node`。

### A7. Composer（官方）

会话中 placeholder：**「给智能体发消息」**（不是「给 Bot 发消息」）。

底栏从左到右：

1. **命令**（`+`，slash launcher，不是附件）
2. **访问模式**：「Workspace Write」
3. 模型 seat：`grok-4.6 · Xhigh`（`conversation.input.model`）
4. 上下文环：「上下文已用 1%」
5. 发送（空草稿 disabled）

其下 sticky 统计 dock：`1 轮 · 1 步 | LLM 7.9s | 首 token 平均 3.5s · 66 tok/s | 缓存命中 0% | 输入 11.4K tok · 输出 290 tok`

**没有** 可见的「排队 | 打断」分段。繁忙态 Enter 是设置项 `ui-conversation.busyEnter`（Queue/Steer），不画在 bar 上。  
**没有** 官方 📎 / @ / 🙂。`conversation.input.left` / `right` 是空座位。

### A8. 右侧两套面板（原型合成了一套）

**① 官方 `details`（`data-slot="details"`）**

- 标题「详情」，空态：「点击消息流中的工具行查看详情」
- 工具行详情，不是插件工作台

**② better-sidebar（`[data-dsh-better-sidebar]`）**

- IDE 页签条：`.nArs4W_tabBar` / `.nArs4W_tab` / `.nArs4W_tabActive` / 关闭 / `+`
- `+` 菜单（活页）：**文件、源代码管理、DSH Bot、任务管理、终端、浏览器**
- Files：路径框 + 文件树 + 「按文件名搜索…」
- **DSH Bot** 页签 = iframe `http://127.0.0.1:3084/dsh-bot/ui`，里面才是人设名册

截图：`docs/prototypes/real/live-session-files.png`、`live-dsh-bot-tab.png`、`pw-dsh-bot-tab.png`  
历史：`jump-tab-open.png`、`asm402-tab.png`

### A9. 颜色 / 字体

| | 真实 | 原型 |
|---|---|---|
| 深色底 | `rgb(21,21,23)` `#151517` | `#12151a` |
| 浅色 | 中栏白，左栏 `#f9fafb`，跟系统 | 自绘一套 |
| 字体 | **16px** system-ui / PingFang SC | **13px** |
| 品牌字 | deepseek HARNESS | 「DSH」 |

活页曾在 light 下打开，Playwright 独立 Chrome 落到 dark。两套都是官方主题，不是插件做的。

### A10. 插件工作台（不要当成官方壳）

`live-conversation.png` / `bot-session-binding.png` / native-experience：

- 左：**人设** +「+ 新建人设 / + 新建小组」+ 名册行（编辑室、校对组、诗人小北…）
- 顶：人设名、「对话 ▾ 新对话」、新开对话
- composer：「给 DSH Bot 发消息」+ **表情** + 发送
- 小组：插件自己的「对话 / 房间」、回复引用条
- Cmd+K：插件命令面板（新建人设/小组、清空对话…），不是官方 `sessions.search`
- `standalone-fallback.png`：没有 deepseek HARNESS 左栏，整页都是插件

`jump-visible.png` 证明：官方左栏会话树里能看到被 marks 标过的会话；跳转菜单「在 DSH 打开」在插件名册上（`roster-jump-menu.png`）。

---

## B. 与 `dsh-bot-complete.html` 逐项对照

| 项目 | 原型里画的 | 真实是什么 | 结论 |
|---|---|---|---|
| 三栏壳 | 264 / 1fr / 320，右栏常开 | 左栏默认可宽，收起 56px rail；`details` 默认 0 宽；另有 better-sidebar | **部分属实** |
| 品牌 | 「DSH」色块 | 鱼标 +「deepseek HARNESS」 | **编的** |
| 左栏顶部分段 | 「会话 \| Bot」 | 只有工作区会话树 | **编的** |
| 左栏列表 | 会话行 + 身份 chip / 名册头像 | 官方只有标题+时间；名册在 iframe | **编的**（chip/名册）/ 会话树 **属实** |
| 左栏底 | DSH Bot 徽章 + 跳转 ⌘K + 设置 | 只有设置；`sidebar.footer.action` 空着 | **部分属实**（设置、座位） |
| 标题栏 | 身份区 + 记忆/例程 pill + 模型 + 分叉 + ⋯ + 详情 | title + 预设标 + Session log；模型在 composer | **编的**（多数按钮）/ 标题 **属实** |
| 视图 tab | Chat / Trajectory / 房间 | 对话 / 轨迹；无房间 | **部分属实** |
| 成员条 | 小组成员 chip | 官方无 | **编的** |
| Hero 文案 | 「开始一段新对话」 | 「探索未至之境」「预览版」 | **编的** |
| Hero 人设卡 | preset 卡片网格 | 工作区 + 预设两个下拉 | **编的** |
| 用户气泡 | 右对齐气泡 | 右对齐 `.gdEzaW_bubble` | **属实** |
| 助手气泡 | 左气泡 + who/头像 | 左文档流，无头像 | **部分属实** |
| Think / 工具卡 | 可展开卡片 | 折叠 disclosure + 工具行进 details | **部分属实** |
| Composer 文案 | 「给 Bot 发消息…」 | hero「描述你想要构建的内容」；会话「给智能体发消息」 | **编的** |
| Composer 按钮 | 📎 @ 🙂 / 排队\|打断 / 发送↵ | +命令、Workspace Write、模型、发送；无分段 | **编的** |
| 统计条 | 无 / 弱 | composer 下官方 token/轮次条 | **编的**（漏画） |
| 右栏页签 | 人设/记忆/例程/同事/任务，原生 React | IDE 页签：Files / DSH Bot(iframe) / 终端 / … | **编的** |
| `details` | 当成 better-sidebar | 工具详情空态，与 better-sidebar 分离 | **编的** |
| 主题 | 固定暗色 `#12151a` 13px | 明暗两套，暗色 `#151517`，16px | **编的** |
| Cmd+K | 官方+Bot 统一面板 | 官方搜索在左栏「搜索会话」；插件自己有命令面板 | **编的** |

---

## C. 真实 DOM 结构摘要

完整 JSON：`docs/prototypes/real/pw-new-session.dom.json`、`pw-session-open.dom.json`、`pw-dsh-bot-tab.dom.json`、`pw-trajectory.dom.json`、`dom-summary.md`。

```
#root
└─ [data-slot="root"]
   └─ .pI_x6G_frame  data-sidebar-collapsed?  data-details-collapsed?
      ├─ .pI_x6G_sidebarCol
      │    [data-slot="sidebar"]
      │      sidebar.brand.mark / sidebar.brand.name
      │      新建会话
      │      sidebar.workspaces (+ directoryFlow)
      │      sidebar.footer.action   ← 空
      │      sidebar.settings
      ├─ .pI_x6G_centerCol
      │    [data-slot="conversation"]
      │      .wSkVaW_root[data-phase="hero"|"active"]
      │        conversation.session.header
      │          lineage / actions / utilities
      │          .wSkVaW_tab「对话」「轨迹」  ← conversation.view
      │        [data-conversation-scroll]
      │          conversation.session → conversation.view
      │            conversation.chat.node…
      │            conversation.chat.turnTail
      │        conversation.composer
      │          hero.* （仅 hero）
      │          conversation.composer.bar
      │            input.overlay / attachments / plan / left / right / model
      │          conversation.composer.dock   ← 统计
      ├─ .pI_x6G_detailsCol
      │    [data-slot="details"]   「详情」
      └─ .pI_x6G_overlayLayer
           [data-slot="shell.overlay"]
           [data-dsh-better-sidebar]
             .nArs4W_tabBar  Files | DSH Bot | +
             iframe[src="/dsh-bot/ui"]  title="DSH Bot"
```

可见 hashed class（会随构建变）：`pI_x6G_*` 布局、`hHd-Xa_*` 侧栏、`qDHVXG_*` 工作区树、`wSkVaW_*` 会话壳、`uV2eYG_*` 输入卡、`gdEzaW_*` 用户泡、`nArs4W_*` better-sidebar、`SVAs4q_*` 预设标。认 **`data-slot` / `data-phase` / `data-dsh-better-sidebar`**，不要认 hash。

---

## D. 在真实界面上叠加插件的重绘建议

按**真实座位**画，不要再画一套假壳。

| 想贡献的能力 | 真实落点 | 不要画成 |
|---|---|---|
| 人设名册 / 小组 / 新开对话 | **better-sidebar →「DSH Bot」页签**（已是 iframe） | 左栏「Bot」分段、右栏「人设」原生 tab |
| 左栏入口 | 空着的 `sidebar.footer.action`，或官方会话树 marks | 再做一套 ⌘K 底栏 |
| 新会话选人设 | `conversation.hero.agentPreset`（已是「DSH Bot」下拉） | hero 卡片墙 |
| 会话身份 | `conversation.session.header.actions`（已有预设标） | 记忆/例程 pill |
| 额外工具按钮 | `header.utilities` 或 `header.actions` | 假的分叉/详情钮（官方 fork 在助手气泡「在新对话中分支」） |
| 房间 / 成员 / 回复引用 | **只存在于 iframe 对话面**；官方没有 `conversation.view` 房间 | 官方中栏再加「房间」tab |
| 表情 / @ | `conversation.input.left`（官方空着） | 覆盖官方 +命令 |
| 排队/打断 UI | 不要画分段；官方已用 Enter 偏好 | 原型 `modeSel` |
| 记忆 / 例程 / 同事 | iframe 内页或 better-sidebar **另一个页签** | 把 `details` 改成这些 tab |
| 文件 / 终端 | 官方 better-sidebar 已有，别复刻 | — |
| 主题 / 字号 | 跟宿主 `color-scheme` + 16px | `#12151a` / 13px 暗壳 |

重绘优先级：

1. **官方中栏保持官方**（对话/轨迹/hero/composer）。插件只往已声明 slot 塞小控件。
2. **Bot 产品面继续长在 better-sidebar iframe**，按 `live-conversation.png` 那种名册+对话，不要假装它是官方右栏原生 React。
3. 若要「长在官方壳上」的下一版原型：左栏照 `pw-new-session.png`，中栏照 `pw-session-open.png`，右/底栏照 Files + DSH Bot 页签条。把 `dsh-bot-complete.html` 里的 Chat/Trajectory 英文、人设卡、排队分段、右栏五 tab 全部丢掉。
