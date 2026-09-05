# dsh-bot-native-experience Spec

> Version: 0.1.0 | Date: 2026-09-02 | Status: Ready 可执行
>
> 本文件是本需求的**唯一事实源**：事实基线、业务合同、技术方案、任务计划、验收协议全部在此。
> 其他文件（handoff.md、tasks.csv）只引用本文件，不复制内容。
>
> 填写三态规则：每个表格单元格只允许三种内容——
> 1. 验证过的事实（注明来源命令）；2. 显式假设 `ASM-xxx`；3. `待勘察`。
> 禁止编造看似合理的命令、symbol、文件名。

---

## 0. 一页纸人话摘要

> 给人看的一节，**人签字以此为准**；机器闸门：缺失或超过 20 行正文 = FAIL。

- **给谁 / 场景**：要补齐 dsh-bot workbench-ui 贴合 dsh 特色的原生体验差距、让工作台更易用的执行方（人或 agent）。
- **做什么**：补上四项能力：轻量命令面板（Cmd+K，仅覆盖切换人设/小组的 dsh 概念，不做 workflow/MCP/文件等通用功能），全局快捷键系统（至少 Cmd+K 和可选的快捷键），emoji picker（composer 中），小组消息回复引用（轮次制发言时可引用房间内之前某条消息）。
- **改哪里**：前端 `packages/workbench-ui/src`（Command Palette 新组件 + 快捷键 hook + Composer 补 emoji UI + Transcript/Conversation 补 reply 逻辑），后端 `packages/dsh-bot-host/src/groups.ts`（仅评估是否需要 roomMessage 加 replyTo 字段，可能不改）。
- **怎么算做完**：四项都实现 + 前端真实场景测试通过（浏览器操作）+ 命令 build/typecheck/test 全绿。
- **不做什么**：消息内查找(Cmd+F)、roster 未读计数、SSE/推送替代轮询、composer slash-command(/开头)、文件上传、KaTeX/Mermaid 渲染、跨会话全局搜索、虚拟滚动、群聊人类在线状态、emoji reaction——这些均因投入产出比低或与 dsh-bot 定位（多人设轻量工作台）不符。

---

## 1. 事实基线与假设

### 1.1 需求与运行模式

| 项 | 结论 |
|---|---|
| 原始需求 | 对标 grok-bot 0.18 但排除不适用范围，筛选贴合 dsh-bot 定位的四项补完（2026-09-01 用户指令 + 两份 agent 核实） |
| 输入类型 | description（四项明确需求 + 排除清单） |
| Mode | oneclick（纯前端 + 可选后端评估） |
| 置信度 | 高（两份 agent 代码勘察完整，已有 spec 体系和工作代码可参考） |
| 输出目录 | `docs/dsh-bot-native-experience/` |

### 1.2 任务类型路由

| 维度 | 结论 |
|---|---|
| 任务类型 | frontend 主力（UI 组件 + hook + 快捷键） + 可选 backend 评估（groups.ts 数据模型评审） |
| 主要风险 | emoji picker 第三方库选型及包体积；reply 需求可能改后端数据模型（待勘察） |
| 行号引用策略 | 前端代码用 symbol + rg anchor + 行号 hint；后端评估用文件定位 |
| 必需验收方式 | browser real-run（打开工作台，执行流程脚本） + typecheck + test + build 全绿 |
| 必须覆盖用户场景 | UF-001 命令面板导航、UF-002 快捷键响应、UF-003 emoji picker 插入、UF-004 小组回复引用 |

### 1.3 勘察事实清单

| 事实 | 来源命令 | 输出摘要 |
|---|---|---|
| Composer 当前只有 Enter/Shift+Enter + @mention，无 emoji/slash-command/富文本 | `rg "onKeyDown" packages/workbench-ui/src/Composer.tsx`(L134-144) | textarea 纯文本，无其他快捷键；mention 弹窗已实现 |
| Transcript.tsx 已有 `TypingIndicator` 组件渲染 speaking 状态，不需补 | `rg "TypingIndicator" packages/workbench-ui/src/Transcript.tsx`(L70-113) | speaking indicator 已完整实现，不在本轮范围 |
| 小组消息存储在 `groups.ts` 的 `RoomMessage` 结构，目前只有 speaker/text，无 replyTo | `cat packages/dsh-bot-host/src/groups.ts` L67-74 | `readonly type: 'message'; readonly speaker; readonly text;` 无 reply 字段 |
| App.tsx 已有可被命令面板复用的 callback（选人设/小组/会话/清空），仅需补交互 UI | `rg "setForm|setSelectedId" packages/workbench-ui/src/App.tsx`(L588-726) | 所有动作已有 callback 钩子，只缺 keyboard shortcut 和 command palette UI。**注**：本行是既有 callback 的勘察事实，非面板范围；面板实际只接人设/小组 + 三个动作，界线以 ASM-103 / BR-001 为准 |
| 项目用 vitest + React 18 + tsx 编译，无第三方 UI 组件库 | `cat package.json` & `cat vitest.config.ts` | 纯手写 UI，无 shadcn/antd 依赖 |
| 当前模块结构：`packages/workbench-ui/src/`(前端SPA) + `packages/dsh-bot-host/src/`(网关) | `ls packages/workbench-ui/src/ && ls packages/dsh-bot-host/src/` | 前后端清晰分离 |

### 1.4 假设清单

| 假设 ID | 内容 | 风险 | 确认方式 |
|---|---|---|---|
| ASM-101 | emoji picker 用轻量自实现或已有小库（**阈值 <10KB gzipped**，全文以此为准），不引入 emoji-picker-element/emoji-mart（>80KB）| 已证实：静态子集、无新依赖，新文件 gzip ~3.7KB（evidence/phase-2/build-size.txt） | Task 4 `pnpm --filter workbench-ui build` |
| ASM-102 | 小组回复引用**不改后端数据模型**，reply 仅在前端 UI 层展示（点名消息编号），不持久化 | 已证实：RoomMessage 无 replyTo；不另开子包（evidence/phase-3/reply-backend-assessment.md） | Task 7 |
| ASM-103 | 命令面板是轻量**本地菜单**（只列当前已有的人设/小组 + 新建人设/新建小组/清空当前对话三个动作；**不含会话切换**，会话切换留在 Conversation 顶栏既有入口），不涉及搜索、历史、插件 | 范围泡胀 | spec 2.3 明确流程脚本，Task 2 按此界线实现 |

### 1.5 变更记录

| 日期 | 变更条目 ID | 原因 | 影响任务与处置 |
|---|---|---|---|
| 2026-09-02 | 初版 | — | — |
| 2026-09-03 | ASM-101 / ASM-102 | Task 4/7 证实：无新 emoji 依赖；不改 RoomMessage | 无第 2 章变更；3.3 新文件落盘 |
| 2026-09-03 | §0 / ASM-101 / ASM-103 / Task 9 | 人工 review：§0 范围漂移（「会话」「GroupForm」）、ASM-101 阈值双版本、10 处任务编号错位、Task 9 状态与验证标准不符 | 无 BR/UF 语义变更（§0 收敛为已交付范围）；Task 9 改判 `已阻塞`；详见「质量记录 / Stage 4」 |

---

## 2. 业务合同

### 2.1 BR 业务规则

| 规则 ID | 规则 | 正例 | 反例 | 影响范围 | 验证方式 |
|---|---|---|---|---|---|
| BR-001 | Cmd+K 打开命令面板，列出：「新建人设」「新建小组」「清空当前对话」加当前已有的人设/小组列表；选中后立即切换，无二次确认 | 输入 Cmd+K → 面板出现 → 按数字键或点击 → 立即切换 | 打开面板后等待 | 全工作台 | UF-001 真实场景 |
| BR-002 | Cmd+K 可随时打开/关闭；Escape 关闭面板；在 composer 中输入时 Cmd+K 不被 composer 的 onKeyDown 拦截 | Cmd+K 在 body 或 textarea focus 时都响应；@mention 弹窗不与面板共存（面板打开时关掉 mention 弹窗） | Cmd+K 在 textarea 中没反应，或与 mention 弹窗打架 | 全工作台 | UF-001 失败分支 |
| BR-003 | 快捷键无硬冲突：Composer 既有的 Enter(发送)/Shift+Enter(换行) 不变；新增全局 Cmd+K（命令面板）；其他快捷键可选（Cmd+N 新建人设等）为文档注释，不强制实现 | 既有快捷键照常工作，新快捷键补充 | 改了 Enter 行为，或全局快捷键和 Composer 冲突 | Composer + App 级 | UF-002 真实场景 |
| BR-004 | emoji picker 在 Composer 中提供「:」开头自动完成弹窗（可选），或单独 emoji 按钮，或二者都有 | 输入冒号 → 弹出 emoji 列表 → 选中 → 插入文本 | emoji UI 单独弹窗，与 @mention 体验不一致 | Composer | UF-003 真实场景 |
| BR-005 | 小组房间消息可经消息行菜单点「回复」，composer 顶部显示「回复: 某人: 摘要」卡片，可「×」清除；发送后该条用户消息在房间里显示指向被引用消息的标记（前端展示层，不改后端存储） | 点消息菜单「回复」→ composer 出现 reply 卡片 → 发送 → 房间该行显示「→ 诗人小北」 | 回复卡片发送后不清除；或为此改后端 RoomMessage 结构 | 小组对话 | UF-004 主路径 |
| BR-006 | 非目标与红线同步：本轮四项与既有功能无冲突；不破坏 dsh-bot-workbench 三期既有行为 | 本轮四项与既有功能无冲突 | 范围泡胀，加了不在需求内的功能；或破坏既有功能 | 全仓 | spec 完整性 |

### 2.2 UF 用户验收场景（索引）

| 场景 ID | Given | When | Then | 角色 | 验证方式 | Evidence |
|---|---|---|---|---|---|---|
| UF-001 | 工作台已打开；3 个人设 + 2 个小组可见 | 按 Cmd+K | 面板打开，列出「+ 新建人设」「+ 新建小组」「清空对话」+ 5 个可切换项（人设/小组） | 用户 | browser | EVD-001 |
| UF-002 | 在 Composer textarea focus 或 body | 按 Cmd+K、Escape、输入时 Cmd+K | 快捷键响应符合 BR-003；既有 Enter/Shift+Enter 不变 | 用户 | browser + console | EVD-002 |
| UF-003 | Composer 打开，小组或 1:1 对话中 | 输入冒号，或点 emoji 按钮（如有） | emoji 弹窗出现；选中后插入到 textarea | 用户 | browser | EVD-003 |
| UF-004 | 小组房间有多条成员发言 | 右键某条消息 → 「回复」 | Composer 顶部出现 reply 卡片；发送后房间显示树视图或箭头指向被引用消息 | 用户 | browser | EVD-004 |

### 2.3 核心业务流程（步骤级交互脚本）

#### UF-001: Cmd+K 命令面板打开与导航

**前置状态**：工作台已加载；左栏有多个人设和小组；当前选中某个人设。

**成功主路径**：

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 按 Cmd+K（Mac）或 Ctrl+K（Windows） | body 上 `keydown` 捕获，focus 无要求 | 触发命令面板打开逻辑 | 工作台中央或顶部出现半透明蒙层 + 面板列表 |
| 2 | 面板列出：「+ 新建人设」「+ 新建小组」「清空当前对话」加当前 bots/groups 列表（按 updatedAt 排序） | 每行可 hover 高亮；列表超出面板高度时可滚动 | 无后端请求，纯前端列表 | 用户看到所有可选项，按数字键(1-9)或点击选中 |
| 3 | 点击「诗人小北」(某人设) 或按数字键快速选中 | 按钮 highlight;面板立即关闭;左栏 roster 切到该人设 | `setSelectedId(id); setForm(null)` 立即执行 | 右侧 Conversation 切到该人设对话 |

**失败分支**：

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| Composer 中按 Cmd+K | textarea focus 且有文本 | 面板仍打开（Cmd+K 全局优先） | 不丢失 textarea 文本；@mention 弹窗关闭 | 用户可继续输入或关闭面板 |
| 面板列表为空 | 没有任何人设或小组 | 只显示「+ 新建人设」「+ 新建小组」「清空对话」 | 列表正常渲染，非错误态 | 提示「还没有人设」；引导新建 |
| Escape 键 | 面板打开中任意时刻 | 面板立即关闭 | 无副作用，选人设/小组操作取消 | 用户正常继续工作 |

**界面状态机**：

```text
idle → (Cmd+K) → panel-open
          ↓ (点选 / 数字键)
      switch-complete
          ↓ (自动)
       idle
          ↑
      (Escape 关闭)
```

**入口接线清单**：

- 全局 `window.addEventListener('keydown')` 或 App.tsx 级 useEffect（Task 2 选择）
- Cmd+K 路由到 `setSelectedId / setForm`（既有回调，无新接线）

---

#### UF-002: 快捷键系统与 Composer 共存

**前置状态**：工作台已加载；Composer 可见；无快捷键 hook 冲突。

**成功主路径**：

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | Composer textarea 中输入文本并 focus | 光标闪烁，文本可输入 | `onChange` 记录 draft | 文本出现在 textarea |
| 2 | 不改输入焦点的前提下按 Cmd+K | Cmd+K 被 `document.addEventListener` 捕获，不被 textarea 的 `onKeyDown` 拦截 | 全局 keyboard handler 优先，命令面板打开 | 面板打开，textarea 文本保留不丢失 |
| 3 | Composer 中按 Enter（无 Shift） | `composerInput 的 onKeyDown` 触发 send（既有逻辑） | 消息发送，draft 清空 | 消息出现在历史；Composer 复位 |
| 4 | Composer 中按 Shift+Enter | 不触发 send，输入换行 | `event.preventDefault()` 不调用，textarea 原生换行 | 换行符出现，消息不发送 |

**失败分支**：

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| Cmd+K 被 textarea 拦截 | onKeyDown 事件冒泡被阻止 | 命令面板不打开 | 快捷键未注册在全局或优先级低 | Task 2 用 `document.addEventListener` 确保全局优先 |
| Cmd+K 与浏览器快捷键冲突 | 浏览器原生快捷键（如 Mac 的 Cmd+K = 搜索） | 浏览器行为优先，面板不打开 | 需要 `event.preventDefault()` 抢先阻止 | 实现时测试，可能需要改绑定方式 |
| @mention 弹窗与命令面板同时打开 | Cmd+K 时 @mention 已开启 | 两个弹窗打架，UI 混乱 | 在 Cmd+K handler 中调 `setMentionOpen(false)` 关掉 | Task 2 在打开面板时清理 mention 状态 |

**界面状态机**：

```text
textarea-idle → (输入) → textarea-editing
                   ↓ (Cmd+K)
                command-panel-open
                   ↓ (选项或 Escape)
                textarea-editing (文本保留)
                   ↓ (Enter)
                sending → idle
```

**入口接线清单**：

- `document.addEventListener('keydown', (e) => { if (e.metaKey && e.key === 'k') ... })` (Task 2)
- Composer 的既有 onKeyDown 无改动

---

#### UF-003: Emoji Picker 插入

**前置状态**：Composer 打开；1:1 或小组对话中；text 为空或有文本。

**成功主路径**：

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 在 Composer textarea 中输入「:」 | 光标处弹出 emoji 列表弹窗（可选） | 匹配「:」字符，触发 emoji 查询 | 用户看到 emoji 候选（或按钮提示） |
| 2 | 用户点「😀」或输入「😀」，或按方向键+Enter 选中 | emoji 被插入到光标位置；弹窗关闭 | 调用 `insertEmoji(name)` 逻辑（类似 `insertMention`） | `:smile:` 或 emoji 字符出现在 textarea |
| 3 | 继续输入或直接发送 | 消息包含 emoji 文本 | `onSend` 送上服务器 | 消息历史显示 emoji |

**失败分支**：

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| emoji 列表过长 | emoji 数据库有数千个 | 弹窗需要虚拟滚动或分页，否则卡顿 | 实现时选简化方案（常用 emoji 子集） | Task 4 评估库方案 |
| 与 @mention 冲突 | 同时输入「:」和「@」 | 弹窗显示哪个？ | 可以同时打开；或用不同 key（「:」vs「@」）分离 | Task 4 明确优先级 |
| emoji 编码问题 | 复杂 emoji（skin tone 变体等） | 可能乱码或显示异常 | 使用 emojibase 等标准库，不手写编码 | Task 4 选库 |

**界面状态机**：

```text
textarea-idle → (:输入) → emoji-picker-open
                     ↓ (选择)
                emoji-inserted
                     ↓ (继续输入 / 发送)
                     idle
```

**入口接线清单**：

- Composer.tsx 的 `change` 回调检测「:」字符并打开弹窗，或 composerRow 内新增 emoji 按钮 (Task 4)

---

#### UF-004: 小组消息回复引用

**前置状态**：小组房间打开；至少有 3 条成员发言；房间对话可见。

**成功主路径**：

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 右键某条成员发言（或点行右侧「⋯」菜单） | 上下文菜单出现，选项包括「回复」「编辑」（如适用）「删除」（如权限） | `onContextMenu` 事件处理或菜单组件展示 | 用户看到「回复」选项 |
| 2 | 点「回复」 | Composer 顶部出现灰色卡片：「回复: 诗人小北: 某条消息内容」 | 前端状态 `setReplyTo({seq, speaker, text})` | Composer 上方显示被回复消息的摘要 |
| 3 | 在 Composer 输入新消息并发送 | 消息发送；房间显示新行带「→ 诗人小北」指示或树状展开 | `runGroupRound` 请求带 `replyTo` 标记（仅前端记录，不改后端存储） | 用户看到回复消息与原消息关联 |

**失败分支**：

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 评估发现需要持久化 replyTo | Task 7 确认历史/分享场景要求回复链落盘 | 前端行为不变；后端改造另开子包 | 需改 `groups.ts` 的 `RoomMessage` 与房间 jsonl 读写 | ASM-102 被证伪 → 走 shared-rules §12 变更协议 |
| 回复消息删除或过期 | 房间里消息被清理 | 引用失效，显示「原消息已删除」 | 消息 seq 检查可用性 | 降级显示，不报错 |
| 多人同时回复同一条 | 房间并发 | 每条回复独立维护 replyTo，无冲突 | 轮次制自然隔离 | 无特殊处理 |

**界面状态机**：

```text
idle → (右键 → 回复) → reply-mode
          ↓ (输入 + 发送)
       message-sent-with-reply
          ↓ (房间显示树)
          idle (reply 卡片清除)
          ↓ (Escape / 清除回复)
       cancel-reply
```

**入口接线清单**：

- Transcript.tsx 小组消息行的菜单入口 → `onReplyTo` 回调 (Task 5)
- Conversation.tsx 的 `replyTo` state → Composer 顶部 reply 卡片与「×」清除 (Task 6)

---

### 2.4 INV 不变量

| 不变量 ID | 内容 | 关联 BR/UF | 验证方式 |
|---|---|---|---|
| INV-001 | 既有快捷键 Enter(发送)/Shift+Enter(换行) + @mention 不改动；新快捷键（Cmd+K 等）与既有的不冲突 | BR-003, UF-002 | Task 2/3 的既有快捷键回归测试 |
| INV-002 | 命令面板列表的数据来自既有 App state（bots/groups），不新增后端请求；emoji picker 数据来自静态库或内存 | BR-001/004, UF-001/003 | Task 3/4 无网络请求；build 时检查没有新 RPC 调用 |
| INV-003 | 小组回复**不改后端数据模型**（unless ASM-102 被证伪），reply 仅前端展示，不写入 RoomMessage.replyTo；历史会话与小组消息记录不变 | BR-005, UF-004 | Task 7 确认后验证，若需改后端则升级为新 Task |
| INV-004 | 全仓规范遵循：BR-006 红线不破（不做消息搜索、未读计数、SSE、文件上传）；仓库干净（无新依赖、无多余文件） | — | Task 9 收尾验证 + `pnpm build && pnpm test` |

### 2.5 EVD 证据清单

| 证据 ID | 类型 | 期望证据 | 保存位置 |
|---|---|---|---|
| EVD-001 | screenshot + console | Cmd+K 打开面板：初始状态、列表内容、选项高亮、切换后关闭 | `evidence/UF-001/` |
| EVD-002 | screenshot + keylog | 快捷键响应：Cmd+K 打开、Escape 关闭、Composer focus 时 Enter 发送、Shift+Enter 换行、Cmd+K 不被拦截 | `evidence/UF-002/` |
| EVD-003 | screenshot + text-insertion-log | emoji picker：输入冒号弹窗、选中插入、文本出现在 textarea | `evidence/UF-003/` |
| EVD-004 | screenshot + room-message-tree | 小组回复：右键 → 回复、Composer 显示 reply 卡片、发送后房间显示树 | `evidence/UF-004/` |
| EVD-005 | build/test log | 命令级验证：`pnpm build`、`pnpm typecheck`、`pnpm test`、`pnpm standard:check` 全绿 | `evidence/phase-final/` |

### 2.6 角色与权限矩阵

单一本机用户，loopback :3084，无权限差异。

### 2.7 负向 / 破坏性场景

| 场景 | Given | When | Then | Evidence |
|---|---|---|---|---|
| 浏览器刷新 | 命令面板打开 | Ctrl+R / Cmd+R 刷新页面 | 工作台重新加载，面板关闭，数据恢复 | 无特殊，正常刷新行为 |
| 快捷键与浏览器冲突 | Cmd+K = 浏览器搜索栏 | 按 Cmd+K | 面板或浏览器行为优先；若优先级反，需改绑定 | Task 2 实现时测试 |
| emoji 库加载失败 | emoji 依赖缺失 | Composer 中输入「:」 | 弹窗不出现或降级为纯文本；不报 JS 错 | Task 4 确保兼容性 |
| 回复消息在房间里被删除 | replyTo 指向的 seq 不存在 | 查看引用 | 显示「原消息已删除」；树视图不展示 | Task 6 添加容错 |
| 网关重启中途 | 命令面板打开或 emoji picker 活跃 | 网关不可达 | 前端 UI 保持，无新请求；用户体感无差 | INV-002 确保无新后端请求 |

### 2.8 非目标

- 不做消息内查找 (Cmd+F)、roster 未读计数、真实 SSE 推送替代轮询、composer slash-command (/开头命令)、文件上传、KaTeX/Mermaid 渲染、跨会话全局搜索、虚拟滚动、群聊人类在线状态、emoji reaction 按钮——这些均在 BR-006 排除清单。
- 不改后端数据模型（除非 ASM-102 被证伪，小组回复需要真正持久化）；如确实需要改后端，单独评估升级为子包。

---

## 3. 技术方案

### 3.1 架构 Before / After

```text
Before: Composer 纯 textarea + @mention；无全局快捷键；无命令面板；无 emoji UI；小组消息无回复

After:  + 全局快捷键 hook（Cmd+K 主，可选补其他）
        + 命令面板组件（轻量列表，无搜索）
        + Composer 补 emoji picker（可选 :colon 触发或单独按钮）
        + Transcript 消息行补右键菜单 → 回复
        + 前端 reply 状态管理（`replyTo: {seq, speaker, text}` in App/Conversation state）
        + Composer 顶部显示 reply 卡片（灰色背景，带"清除"按钮）
        + 房间里回复消息显示「→ 原发言人」或树视图（纯前端渲染，不改后端存储）
```

### 3.2 模块改造

| 模块 | 职责 | 改造说明 |
|---|---|---|
| `packages/workbench-ui/src/useGlobalKeyboard.ts` | 新建：全局快捷键 hook | 监听 document 的 keydown；Cmd+K 打开命令面板；可选 Cmd+N/Cmd+L 等 |
| `packages/workbench-ui/src/CommandPalette.tsx` | 新建：命令面板 UI 组件 | 接收 open/onClose props；列表由 App 传入（bots/groups/actions）；支持数字快捷选择 |
| `packages/workbench-ui/src/Composer.tsx` | 改造：补 emoji picker | change() 检测冒号；可选补单独 emoji 按钮；选中后调 insertEmoji (类似 insertMention) |
| `packages/workbench-ui/src/Transcript.tsx` | 改造：消息右键菜单（小组） | 小组对话中每条成员消息加右键菜单；「回复」选项调 `onReplyTo(item)` 回调 |
| `packages/workbench-ui/src/Conversation.tsx` | 改造：reply 状态管理 | 添加 `replyTo` state；传给 Composer 和 Transcript；小组发言时附上 replyTo |
| `packages/workbench-ui/src/App.tsx` | 改造：补 CommandPalette 挂载 + useGlobalKeyboard 调用 | 传递 `open` 和 `onSelect`；快捷键 hook 在顶级 useEffect |
| `packages/dsh-bot-host/src/groups.ts` | 评估（可能无改）：小组消息数据模型 | ASM-102 验证后决定：若需回复持久化，加 replyTo 字段；否则无改 |

### 3.3 三段式定位清单

| 文件 | 稳定定位 | 搜索定位 | 行号 hint | 备注 |
|---|---|---|---|---|
| `packages/workbench-ui/src/Composer.tsx` | `const change = (value: string)` | `rg "const change" packages/workbench-ui/src/Composer.tsx` | L94-104 | @mention 逻辑，新增 emoji 检测可参考 |
| `packages/workbench-ui/src/Transcript.tsx` | `export function Transcript(props` | `rg "export function Transcript" packages/workbench-ui/src/Transcript.tsx` | L29-68 | 消息行渲染，补右键菜单 |
| `packages/workbench-ui/src/App.tsx` | `export function App()` | `rg "export function App" packages/workbench-ui/src/App.tsx` | L59-733 | 顶级 state 和 useEffect；补 CommandPalette 和 useGlobalKeyboard |
| `packages/workbench-ui/src/Conversation.tsx` | `export function Conversation(props` | `rg "export function Conversation" packages/workbench-ui/src/Conversation.tsx` | L1-100+ | reply 状态管理、小组消息处理 |
| `packages/dsh-bot-host/src/groups.ts` | `export interface RoomMessage` | `rg "export interface RoomMessage" packages/dsh-bot-host/src/groups.ts` | L67-74 | 数据模型；评估是否加 replyTo |
| `packages/workbench-ui/src/useGlobalKeyboard.ts` | `export function useGlobalKeyboard` | `rg "useGlobalKeyboard" packages/workbench-ui/src/App.tsx` | L23 | document capture Cmd/Ctrl+K |
| `packages/workbench-ui/src/CommandPalette.tsx` | `export function CommandPalette` | `rg "CommandPalette" packages/workbench-ui/src/App.tsx` | L1 | 本地列表，无搜索 |

### 3.4 API / 数据 / 权限 / 路由影响

无影响：本轮不新增后端 RPC（emoji picker/命令面板/快捷键均纯前端；小组回复不改持久化）。若 ASM-102 被证伪需改后端，单独评估。

---

## 4. Phase 计划与任务详情

> Phase 依赖链:
>
> ```text
> P0 勘察 (T1) → P1 命令面板 + 快捷键 (T2-T3) → P2 emoji + 回复菜单 (T4-T5，与 P1 无依赖，可并行) → P3 回复状态 + 验收 (T6-T9)
> ```

> 实现任务数 ≥ 8 → 用 tasks.csv；否则用下方内嵌表。

### 内嵌状态表

| 序号 | 任务 | 前置 | 验证命令 | 状态 | 备注 |
|---|---|---|---|---|---|
| 1 | 前置检查与勘察补完 | 无 | `python3 ~/.agents/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-native-experience --repo .` 0 FAIL | 已完成 | 豁免回归:P0 单实现任务，回归并入本任务验证 |
| 2 | 实现全局快捷键 hook (useGlobalKeyboard.ts) 与 Cmd+K 绑定 | 1 | `pnpm -w test packages/workbench-ui` 通过 + `pnpm typecheck` 通过 | 已完成 | |
| 3 | 实现轻量命令面板 UI (CommandPalette.tsx) 并接线 App | 2 | `pnpm -w test packages/workbench-ui` 通过 + UF-001 手动主路径可走通 | 已完成 | 豁免回归:P1 收尾任务，Phase 1 回归并入本任务验证 |
| 4 | Composer 补 emoji picker UI（:colon 或按钮，含库选型） | 1 | `pnpm -w test packages/workbench-ui` 通过 + `pnpm -r run build` 记录体积增量 | 已完成 | ASM-101 证实：无新依赖，新文件 gzip ~3.7KB |
| 5 | Transcript 补消息菜单与回复接线（小组） | 1 | `pnpm -w test packages/workbench-ui` 通过 + 菜单可出现且 onReplyTo 可达 | 已完成 | 豁免回归:P2 收尾任务，Phase 2 回归并入本任务验证 |
| 6 | Conversation + App 补 reply 状态管理与展示（reply 卡片） | 5 | `pnpm -w test packages/workbench-ui` 通过 + reply 卡片显示与清除正确 | 已完成 | |
| 7 | 后端 groups.ts 回复持久化评估（ASM-102 验证） | 6 | 结论落盘 `evidence/phase-3/reply-backend-assessment.md`；需改则按变更协议另开子包 | 已完成 | ASM-102 证实：不改 RoomMessage |
| 8 | 执行 spec 5.2 真实场景全套测试 | 6;7 | 5.2 执行矩阵 8 行全部通过并落 evidence | 已完成 | Playwright Chromium 回放：7 行跑通 + UF-003 降级行「不适用」（按 5.2 通过标准允许）；其中 UF-002 冲突行证据弱，见 `evidence/UF-002/no-conflict.md` 声明 |
| 9 | 执行 Phase 3 回归验证（收尾） | 8 | `pnpm -r run build && pnpm -r run typecheck && pnpm test && pnpm run standard:check` 全绿 | 已阻塞:`pnpm -r run typecheck` 未全绿 | build / `pnpm test`(32 files,238 tests) / standard:check / workbench-ui typecheck 均绿；**`pnpm -r run typecheck` FAIL**：`packages/ui-dsh-bot/tests/jump-bridge.spec.ts:190` TS2375 exactOptionalPropertyTypes。该文件属 session-nav 包未提交产物，**不在本包改动面内**（本包 0 文件改动于 ui-dsh-bot），本包无权修复；解除条件见下方 Task 9 「阻塞说明」 |

### Phase 0: 前置勘察

> 你在哪里：spec 骨架完成，待 Stage 1 闸门检查。
> 做完之后：代码定位确认无遗漏，可进入 Stage 2 展开。

### Task 1: 前置检查与 Stage 1 闸门验收

- **关联**：无 UF（编排开销），BR-001~006
- **前置任务**：无
- **风险等级**：P1

**为什么做**：确认 spec 第 3.3 定位清单中 `待勘察 + ASM` ≤ 30%；确保骨架可进入 Stage 2 展开。

**涉及文件与定位**：

- `docs/dsh-bot-native-experience/spec.md`（本文件）

**具体操作**：

1. 跑 `python3 ~/.agents/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-native-experience --repo .`，记录输出。
2. 检查定位清单（3.3 节）：7 行，其中「待勘察」2 行（useGlobalKeyboard.ts、CommandPalette.tsx）= 28.6% ≤ 30% ✓ 通过。
3. 若有 FAIL，补勘察；否则输出「Stage 1 pass」标记。

**验证**：校验脚本 0 FAIL；定位清单占比 ≤ 30%。

**Evidence**：`evidence/phase-0/stage1-validate.log`

**注意事项**：豁免回归（P0 单实现任务）。

---

### Phase 1: 命令面板与快捷键

### Task 2: 实现全局快捷键 hook 与 Cmd+K 绑定

- **关联**：BR-001/002, UF-001/002
- **前置任务**：1
- **风险等级**：P0

**具体操作**：

1. 新建 `packages/workbench-ui/src/useGlobalKeyboard.ts`：导出 `useGlobalKeyboard()` hook；监听 `document.keydown`；Cmd+K / Ctrl+K 触发 `onCommandPalette()` 回调；Escape 关闭；并发送事件到 App 级状态。
2. 在 App.tsx 中 `import { useGlobalKeyboard }` 并调用，传入 `setCommandPaletteOpen` 回调。
3. 确保 Composer 的 onKeyDown 优先级 ≤ 全局快捷键（document 事件优先）。

**验证**：`pnpm -w test packages/workbench-ui && pnpm -r run typecheck` 全绿 → 期望新增 hook 用例通过；`rg "useGlobalKeyboard" packages/workbench-ui/src/App.tsx` 命中

**Evidence**：`evidence/phase-1/shortcut-hook.log`

**注意事项**：必须用 `document.addEventListener` 保证全局优先于 textarea 的 onKeyDown（BR-002）；打开面板时要清掉 @mention 弹窗状态，禁止两个弹窗共存。

---

### Task 3: 实现轻量命令面板 UI (CommandPalette.tsx)

- **关联**：BR-001, UF-001
- **前置任务**：2
- **风险等级**：P0

**具体操作**：

1. 新建 `packages/workbench-ui/src/CommandPalette.tsx`：
   - Props：`open: boolean`, `items: CommandItem[]`, `onSelect: (id: string) => void`, `onClose: () => void`
   - 列表项：`{id, label, shortcut?, action?}`
   - 渲染：蒙层 + 居中面板 + 项目列表
   - 交互：支持上下箭头导航、Enter/数字键(1-9)快速选；Escape 关闭
2. 在 App.tsx 中传入 bots/groups 和 actions，生成命令列表。
3. 选中后调 `onSelect(id)` 触发相应动作（`setSelectedId`/`setForm`）。

**验证**：`pnpm -w test packages/workbench-ui && pnpm -r run typecheck` 全绿 → 期望新增面板用例通过；`rg "CommandPalette" packages/workbench-ui/src/App.tsx` 命中；手动走 UF-001 主路径（Cmd+K 打开 → 列表 → 数字键切换 → 面板关闭）

**Evidence**：`evidence/phase-1/command-palette-ui.log` + `evidence/phase-1/phase1-regression.log`

**注意事项**：豁免回归:P1 收尾任务，Phase 1 聚合回归并入本任务验证（Task 2+3 的命令级验证在此一次跑全）。

---

### Phase 2: Emoji 与基础回复

### Task 4: Composer 补 emoji picker UI

- **关联**：BR-004, UF-003
- **前置任务**：1
- **风险等级**：P1（库选型风险，ASM-101）

**具体操作**：

1. 调研轻量 emoji 库方案：`emojibase` (纯数据) 或自实现常用 emoji 子集。
2. 在 Composer.tsx 中：
   - change() 检测冒号「:」触发 emoji 弹窗；或新增单独 emoji 按钮。
   - 实现 `insertEmoji(name: string)` 方法（参考 `insertMention` 逻辑）。
   - 关闭 emoji 弹窗时恢复焦点。
3. 跑 `pnpm build` 检查包体积增量 < 10KB gzipped（ASM-101 验证）。

**验证**：`pnpm -w test packages/workbench-ui && pnpm -r run build` 全绿 → 期望 emoji 插入用例通过且体积增量 < 10KB gzipped（ASM-101）；`rg "insertEmoji" packages/workbench-ui/src/Composer.tsx` 命中

**Evidence**：`evidence/phase-2/emoji-picker.log` + `evidence/phase-2/build-size.txt`

**注意事项**：与 @mention 共用一套弹窗定位/键盘导航模式，禁止两套交互；「:」与「@」触发条件互斥，同一时刻只开一个弹窗。

---

### Task 5: Transcript 补消息菜单与回复接线（小组）

- **关联**：BR-005, UF-004
- **前置任务**：1
- **风险等级**：P1

**具体操作**：

1. 在 Transcript.tsx 的 `TranscriptRow` 中，给小组消息行加 `onContextMenu` 处理器。
2. 弹出右键菜单（可用简单 `<div className="rowMenu">` 或外部菜单库），选项包括「回复」「复制」「删除」（权限允许）。
3. 点「回复」时调 `onReplyTo?.(item)` 回调（由 Conversation 传入）。
4. 无需改后端；reply 信息由前端管理。

**验证**：`pnpm -w test packages/workbench-ui && pnpm -r run typecheck` 全绿 → 期望菜单与回调用例通过；`rg "onReplyTo" packages/workbench-ui/src/Transcript.tsx` 命中

**Evidence**：`evidence/phase-2/reply-menu.log` + `evidence/phase-2/phase2-regression.log`

**注意事项**：豁免回归:P2 收尾任务，Phase 2 聚合回归并入本任务验证（Task 4+5 一次跑全）。菜单入口沿用 Roster/SessionList 既有 `rowMenu` 样式与 document mousedown 关闭模式，不引入新交互范式。

---

### Phase 3: 回复完成与验收

### Task 6: Conversation + App 补 reply 状态管理与展示

- **关联**：BR-005, UF-004
- **前置任务**：5
- **风险等级**：P0

**具体操作**：

1. 在 Conversation.tsx 添加 `replyTo` state：`{seq: number, speaker: RoomSpeaker, text: string} | null`。
2. Transcript 的 `onReplyTo` 回调设置 `replyTo` 状态。
3. Composer 顶部显示灰色卡片：「回复: 诗人小北: [消息摘要]」；右侧加「×」清除按钮。
4. 发送消息时，若 `replyTo` 不空，传给 `runGroupRound` 请求（在 `PromptRequest` 或 `RunGroupRoundRequest` 中附 `replyTo` 字段作为前端上下文，不改后端存储）。
5. 房间显示层：消息行显示「→ 原发言人」指示或嵌套树（纯前端渲染）。

**验证**：`pnpm -w test packages/workbench-ui && pnpm -r run typecheck` 全绿 → 期望 reply 状态与卡片用例通过；`rg "replyTo" packages/workbench-ui/src/Conversation.tsx` 命中

**Evidence**：`evidence/phase-3/reply-state.log`

**注意事项**：发送成功后必须清除 `replyTo`（BR-005 反例）；被引用消息已不在房间时降级显示「原消息已删除」，不抛错。

---

### Task 7: 后端回复持久化评估（ASM-102 验证）

- **关联**：BR-005 / INV-003（UF: NA——评估任务，不产生用户可见变更）
- **前置任务**：6
- **风险等级**：P2（可能升级为单独子包）

**具体操作**：

1. 与后端确认：小组回复是否需要在 `groups.ts` 的 `RoomMessage` 中添加 `replyTo` 字段持久化。
2. 若不需要（前端暂存即可）：Task 6 完成即可，无后端改动。
3. 若需要（历史查询/分享场景）：记录差异为「新子包 dsh-bot-group-replies」，单独申请。

**验证**：确认对话记录；结论写入 `evidence/phase-3/reply-backend-assessment.md`。

**Evidence**：`evidence/phase-3/reply-backend-assessment.md`

---

### Task 8: 执行 spec 5.2 真实场景全套测试

- **关联**：UF-001~004, INV-001~004, BR-001~006
- **前置任务**：6/7
- **风险等级**：P0

**验证**：按 5.2 执行矩阵逐行回放全部通过；evidence 落盘后复跑 `python3 ~/.agents/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-native-experience`(证据审计)。

**Evidence**：`evidence/UF-001/` + `evidence/UF-002/` + `evidence/UF-003/` + `evidence/UF-004/`

---

### Task 9: 执行 Phase 3 回归验证（收尾）

- **关联**：BR-006 / INV-001 / INV-002 / INV-004（本 Phase 全部 BR/UF 聚合核销）
- **前置任务**：8

**验证**：

- `pnpm -r run build && pnpm -r run typecheck && pnpm test && pnpm run standard:check` 全绿
- 邻仓 porcelain 干净（vibee 既有 `.vibee/` 除外）
- `rg -i 'anysphere|sand://' packages/` 为空
- 总报告（含各任务完成状态、任何止损点、联合矩阵结果）写入 `evidence/phase-final/report.md`

**Evidence**：`evidence/phase-final/report.md` + `evidence/phase-final/final-regression.log`

**阻塞说明（2026-09-03）**：本任务状态为 `已阻塞`，不得按「已完成」对外汇报。

| 项 | 结论 |
|---|---|
| 已绿 | `pnpm -r run build`、`pnpm test`（32 files / 238 tests）、`pnpm run standard:check`、`pnpm --filter workbench-ui typecheck` |
| 未绿 | `pnpm -r run typecheck` → `packages/ui-dsh-bot/tests/jump-bridge.spec.ts:190` TS2375（`exactOptionalPropertyTypes`：`{ current: string \| undefined }` 不可赋给 `{ current?: string }`） |
| 归属 | 该文件 `git status` 为 `??`（未跟踪），属 **dsh-bot-session-nav** 包在途产物；本包全部 commit 未触碰 `packages/ui-dsh-bot/**`，无权在本包修复（越界即违反 handoff「不改无关文件」） |
| 影响面 | 仅阻断仓级 typecheck 聚合闸门；不影响本包 BR-001~006 / UF-001~004 的功能正确性与 5.2 回放结论 |
| 解除条件 | session-nav 包修好 `jump-bridge.spec.ts:190` 后，在本包重跑 `pnpm -r run typecheck` 转绿，本任务方可置 `已完成` |

---

## 5. 验收与 Review 协议

> **验收铁律：命令级验证（5.1）通过只是入场券，不是完成。** 用户可见的需求必须通过 5.2 真实场景全套测试才算完成。

### 5.1 命令级验证（入场券）

| 验证项 | 命令 | 期望 | Evidence |
|---|---|---|---|
| 构建/类型/单测/标准 | `pnpm -r run build && pnpm -r run typecheck && pnpm test && pnpm run standard:check` | 全绿 | EVD-005 |
| 本包校验 | `python3 ~/.agents/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-native-experience --repo .` | 0 FAIL | EVD-005 |

### 5.2 真实场景全套测试（Real-Run，完成的唯一标准）

**环境准备**：

| 项 | 值 |
|---|---|
| 启动命令 | `cd <本仓> && pnpm install && pnpm -r run build && sh env/setup.sh && sh env/boot.sh` (已起则 `dsh-rpc-who.sh 3084` 核身份) |
| 访问入口 | 工作台 `http://127.0.0.1:3084/dsh-bot/ui` 与官方 GUI 右栏「DSH Bot」页签 |
| 测试数据 | ≥3 人设 + ≥2 小组(各 2-4 成员) + 既有对话；凭据沿 `env/.env` |
| 干净状态 | 小组数据可单独清；老路径复跑用既有历史 |
| 可用工具 | Chrome DevTools (F12 console/network) + 手工操作 |

**执行矩阵**：

| UF | 执行方式 | 操作来源 | 必须核对的点 | Evidence |
|---|---|---|---|---|
| UF-001 主路径 | browser | 2.3 UF-001 成功主路径 1-3 | Cmd+K 打开 → 列表显示 → 按数字或点击切换 → 面板关闭 | `evidence/UF-001/cmd-k-open.png` + `evidence/UF-001/selection.png` |
| UF-001 失败分支 | browser | Composer 中按 Cmd+K | 文本保留，面板打开，@mention 弹窗关闭 | `evidence/UF-001/composer-focus.png` |
| UF-002 主路径 | browser + console | 按 Cmd+K、Escape、在 textarea 中 Enter/Shift+Enter | 快捷键响应、既有快捷键不变、文本保留 | `evidence/UF-002/shortcut-response.log` |
| UF-002 冲突测试 | browser | Cmd+K 与浏览器快捷键 | 面板打开，浏览器原生行为不触发 | `evidence/UF-002/no-conflict.md` |
| UF-003 主路径 | browser | 输入「:」→ 选 emoji → 继续输入/发送 | emoji 弹窗出现 → 选中插入 → 消息包含 emoji | `evidence/UF-003/emoji-insert.png` + `evidence/UF-003/sent-message.png` |
| UF-003 降级 | browser | emoji 库缺失或慢加载 | 纯文本输入仍可用，无 JS 错误 | `evidence/UF-003/fallback.md` (如适用) |
| UF-004 主路径 | browser | 小组房间 → 右键消息 → 「回复」→ 输入 + 发送 | 菜单出现 → reply 卡片显示 → 发送后房间显示树 | `evidence/UF-004/reply-menu.png` + `evidence/UF-004/reply-card.png` + `evidence/UF-004/tree-display.png` |
| UF-004 清除回复 | browser | 点 reply 卡片的「×」清除按钮 | 卡片消失；Composer 恢复正常 | `evidence/UF-004/clear-reply.png` |

**通过标准**：执行矩阵全部行通过（或按 2.7 标注 不适用-链条止损）且 evidence 齐全。

### 5.3 Evidence 目录结构与命名

```text
docs/dsh-bot-native-experience/evidence/
  phase-0/ (Stage 1 validate 输出)
  phase-1/ (T2/T3 完成证据)
  phase-2/ (T4/T5 完成证据)
  phase-3/ (T6/T7 完成证据)
  UF-001/ UF-002/ UF-003/ UF-004/ (5.2 矩阵证据)
  phase-final/ (Task 8/9 最终报告 + 命令日志)
```

### 5.4 Review 专项检查清单

- [ ] UF-001~004 全部通过，evidence 与第 2.5 节 EVD 清单一致
- [ ] 2.3 节每条流程的「入口接线清单」已实现（全局快捷键、菜单、按钮均可达）
- [ ] 快捷键与既有 Composer Enter/Shift+Enter 无冲突；命令面板与 @mention 不打架
- [ ] emoji picker 实现的包体积增量 < 10KB gzipped (ASM-101 验证)
- [ ] 小组回复不改后端数据模型（unless ASM-102 被验证为需要改，已单独评估）
- [ ] 四条命令 build/typecheck/test/standard:check 全绿；无 console/server error
- [ ] INV-001~004 无破坏：既有快捷键不变、无新后端请求、回复纯前端、规范遵循

---

## 质量记录

**Stage 1（勘察与骨架）**：`validate_package.py --repo .` → 0 FAIL / 0 WARN / 17 PASS；§3.3 定位清单 `待勘察+ASM` 占比 29%（2/7，两条为待建新文件）≤ 30% 闸门；`--repo` 全量核验 5 条 rg anchor 全部命中（代替人工抽查 3 条）。

**Stage 2（任务包展开）**：内嵌状态表 9 条（实现任务 6 条 < 8 → 按规则不生成 tasks.csv）；Phase 1/2 按 tasks-csv schema 豁免通道把聚合回归并入收尾任务（Task 3 / Task 5）并留 `豁免回归:` 痕；5.2 执行矩阵 8 行覆盖 UF-001~004 的主路径与失败分支，Evidence 列全为具体路径。

**Stage 3（交接层）**：`handoff.md` 已生成（executor `generic`，无浏览器工具按「手动脚本 + 用户回填」降级）；`evidence/README.md` 与 5.3 目录结构对齐；`spec-view.html` 由 `render_spec.py` 生成，是**只读投影**——任何修改一律回本文件再重渲染。终检 0 FAIL / 0 WARN / 17 PASS。

**遗留闸门**：证据审计已在 Task 8 完成后重跑 `validate_package.py --repo .` 通过（0 FAIL / 0 WARN / 17 PASS，12 条 5.2 evidence 路径全部命中）。

**Stage 4（Review 修订，2026-09-03）**：人工 review 发现并修正——①§0 与 ASM-103 的「会话」越界描述（命令面板实为人设/小组，`buildCommandItems` 只接 bots+groups）与「GroupForm」误指（实际接线在 Transcript/Conversation）；②10 处任务编号错位（INV-002 / INV-003 / INV-004、2.7 两行、UF-003 三条失败分支、UF-001 与 UF-002 各一条入口接线清单）；③ASM-101 阈值 10KB / 20KB 双版本（spec 三处 + handoff 一处），统一为 10KB（实测 3.7KB）；④Task 9 由 `已完成` 更正为 `已阻塞`（`pnpm -r run typecheck` 未全绿，见其阻塞说明）；⑤Task 8 备注与 `report.md` 的「8/8」更正为「7 跑通 + 1 N/A」；⑥`spec-view.html` 重渲染（此前停留在 9 条全 `待开始`，与 spec.md 完全脱节）。

**未闭合面（review 提出，本轮未处置）**：
- BR-003 / BR-004 含「可选」「或二者都有」措辞，非可证伪验收标准——留作下一包立项教训，不回改本包已交付行为。
- UF-002 冲突测试证据（`evidence/UF-002/no-conflict.md`）在 Playwright Chromium 下取得，该环境结构上不存在 Chrome 地址栏 Cmd+K 冲突，**等价于未验证**；如需真实结论应在带地址栏的 Chrome 手动回放。
- 5.2 访问入口列了「官方 GUI 右栏 DSH Bot 页签」，8 行矩阵全部只覆盖 `127.0.0.1:3084/dsh-bot/ui`；`useGlobalKeyboard` 在 capture 阶段 `preventDefault + stopPropagation` 吞 Cmd+K，嵌入宿主场景零覆盖。
- 2.3 两条失败分支（UF-001「面板列表为空」、UF-004「回复消息删除或过期」）已实现（后者见 `Transcript.tsx` `sourceMissing` + 「原消息已删除」）但无 5.2 矩阵行与 evidence。
- `markFor` / `pendingReply` 以**文本相等**匹配回复标记（`Transcript.tsx:40-43`、`Conversation.tsx:575`）：同一会话内重复发送相同文本、仅其一为回复时，两条都会渲染「→ 某人」。纯展示层、刷新即清，2.7 未覆盖此负向分支。
