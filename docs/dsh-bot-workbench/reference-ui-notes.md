# Grok Bot 0.18 前端 UI 结构调研报告（设计形状）

> 范围：`frontend/src/recovered/features/` 等可读重建源；论断均附相对 zip 根路径。产品代码仅作契约参考，不可拷贝。

---

## A. 整体布局图（ASCII）

**默认两栏 + 可开关右栏**（非常驻三栏）。左栏 roster，中栏对话舞台，右栏 `info pane` 按需叠开（Agent Settings / Channels / Computer / Group Members / Routines 互斥）。

尺寸来自 `frontend/src/recovered/features/conversation/workspace/sidebar-layout-state.ts`：

| 区域 | 默认 | 边界 |
|------|------|------|
| Roster 展开 | **280px** | 240–400；折叠 **88px** |
| Info pane | **320px**，默认关闭 | 280–480 |
| Title drag 区 | 高 **52px** | `window-chrome/view.css` |

```
┌─────────────────────────────────────────────────────────────────────────┐
│ [drag 52px / mac traffic lights]     [WorkspaceIndicator] [StatusBadge] │
├────────────────┬────────────────────────────────────┬───────────────────┤
│ ROSTER         │ CONVERSATION STAGE                 │ INFO PANE (opt)   │
│ ~280 / 88px    │ flex column, minmax(0,1fr)         │ ~320px overlay    │
│                │                                    │                   │
│ [+] New        │ ┌ Chat Header ──────────────────┐  │ Avatar / Name     │
│ [Search]       │ │ Avatar+Name [Working]         │  │ Title/Description │
│                │ │     Computer | Channels | …   │  │ Notifications     │
│ ┌ AgentItem ─┐ │ └────────────────────────────────┘  │ Edit avatar      │
│ │◉ name      │ │                                    │ Channels list     │
│ │  preview   │ │ Transcript (scroll)                │ Computer preview  │
│ │       2h ● │ │  · user bubbles (data-role=user)   │ Members (group)   │
│ └────────────┘ │  · assistant prose                 │ Routines…         │
│ [Pinned…]      │  · thinking / tool outline rows    │                   │
│ [Sections…]    │  · reactions / cards               │                   │
│                │                                    │                   │
│ ─────────────  │ ┌ Composer dock ─────────────────┐ │                   │
│ Plugins        │ │ [+]  Message {name}      [mic]↑ │ │                   │
│ Account menu   │ └────────────────────────────────┘ │                   │
└────────────────┴────────────────────────────────────┴───────────────────┘
```

**壳层装配**：`frontend/src/production/ProductionRenderer.tsx`（`sand-shell` + `gridTemplateColumns: sidebar | main`）。  
**窗口装饰**：`frontend/src/recovered/features/window-chrome/`（非业务栏）。

**截图** `docs/assets/router-settings.png`：暗色两栏主壳被居中 **Settings → Router** 模态盖住；背景可见左栏 Search + agent 行（头像色块/形状脸）、选中高亮；对话区 Header 有 bot 名、中央 “Reconnecting” 胶囊；Composer 占位 `Message {name}`、左侧 `+`、右侧 mic。侧栏底 Plugins + 用户账号。该图偏路由设置，不是完整 info pane。

---

## B. 数据形状（TS / props）

### B1. Roster item / Agent

核心类型在 `frontend/src/recovered/features/conversation/workspace/model.ts` 的 `ConversationAgentSummary`，生产投影 `RendererAgent` 在 `frontend/src/production/model.ts`。侧栏扩展：`SidebarAgent`（`conversation/workspace/sidebar.tsx`）。

```ts
// ConversationAgentSummary — conversation/workspace/model.ts
{
  id: string;
  name: string;                    // 缺省投影为 "New chat"
  updatedAt: number;
  isPinned?: boolean;
  isRunning?: boolean;
  isComposingMessage?: boolean;
  title?: string;                  // 职位/一句话角色，非对话标题
  isSharedRoom?: boolean;
  avatarDataUrl?: string | null;   // 自定义照片优先
  avatarVersion?: string | null;
  avatarShape?: string | null;     // blob|pebble|… 8 种
  avatarColor?: string | null;     // black|brown|red|… 调色板 id
  currentActivity?: unknown | null;
  memberIds?: readonly string[];
  awaitingUserResponse?: unknown | null;
  waitingReason?: string;          // → "Needs attention"
  draftPrompt?: string;            // 预览优先于 lastMessage
  lastEntry?: ConversationAgentLastEntry | null;
  lastMessageId?: string | null;
  lastMessagePreview?: string | null;
  lastMessage?: string;
}

// ConversationAgentLastEntry
| { kind: "text"; text: string }
| { kind: "attachment"; count: number; kinds: Record<string, number> }
| { kind: "link"; url: string }

// SidebarAgent 额外 — conversation/workspace/sidebar.tsx
& { description?: string; hasUnread?: boolean; isGroup?: boolean; raw?: { isSharedRoom?: boolean } }

// RendererAgent 额外 — production/model.ts
& {
  description?: string;
  hasUnread?: boolean;
  isGroup: boolean;
  isHidden: boolean;
  memberIds: string[];
  conversationPartnerIds: string[];
  awaitingUserResponse: unknown | null;
  lastEntry: RendererAgentLastEntry | null;
  raw: RendererAgentRaw;
}
```

**选中态**：`frontend/src/recovered/features/roster/selection-state.ts`  
`{ currentAgentId: string | null; isLoadPending: boolean }`（按账号持久化 `selection.last-agent`）。

**Roster 空/错态**（非 item）：`roster/status.tsx` — `loading | empty | all-hidden | error`。  
**隐私阻断**：`roster/privacy-blocked.tsx`（全屏对话框，非行内）。  
**重连条**：`roster/reconnect-notice.tsx`。

**行 UI 呈现**（`AgentSidebarItem`）：头像 + 角标状态点；名字；预览优先序 `draftPrompt` → `Waiting for you: {waitingReason}` → `lastMessage`；右侧相对时间 `now|Nm|Nh|Nd`；Working 时用 `SidebarAgentActivity`。选中：`data-active` / `aria-current="page"`。折叠只留头像。

> 注意：`features/roster/` **没有列表组件**；名单 UI 在 `conversation/workspace/sidebar.tsx`。

### B2. Conversation / Transcript

```ts
// ComposerDraft — conversation/workspace/model.ts
{ prompt; attachments: DraftAttachment[]; richText?; replyToId?; isFork? }
// DraftAttachment: { path; name; size?; mimeType? }  上限 COMPOSER_ATTACHMENT_LIMIT = 6

// TranscriptMessage
{
  kind: "message"; id; role: "user" | "assistant"; author: string;
  text; richText?; timestampMs; attachments?; delivery?: "sent"|"pending"|"queued"|"failed";
  isStreaming?; replyToId?; reactions?; myReactions?; images?; channel?; adjacency?; …
}

// TranscriptToolCall / TranscriptThinking / …
{ kind: "tool-call"; id; name; status; summary?; toolResult?: ToolResultCardSnapshot }
{ kind: "thinking"; id; text; durationMs?; timestampMs }
// 另有 notice | timeline-event | time-separator | unread-divider |
// computer-handoff | local-tool-permission | permission-request | card entries
```

**Tool result 卡**：`conversation/tool-results/model.ts`  
`{ kind: "file-edit"|"file-write"|"shell"; status; path; command; summary; output; diff; isStreaming; … }`

**Reactions**：`conversation/cards/transcript-card/reaction-actions.ts`  
`{ emoji; by }`；快捷 `👍👎❤️😂🎉😮`；自身 `by === "me"`。

### B3. Agent 人设 / Info

```ts
// AgentSettingsProfile — agent-info/settings/model.ts
{ name: string; title?: string; description: string }
// + notifyOnUpdatesEnabled（非 group）

// OnboardingDraft — onboarding/signed-in/model.ts（首建身份）
{ name; description; color; shape; pickedTemplateId }
```

Avatar 编辑：`agent-info/avatar-editor/model.ts` — 颜色 11、形状 8；可上传裁剪 PNG（输出 256px）。

---

## C. 关键交互流

### 1) 选中 bot → 看对话 → 发消息 → 流式回复

1. 点击 `AgentSidebarItem` → `onOpenAgent(id)`；选中 store `select` → `isLoadPending`，settle 后清 pending（`roster/selection-state.ts`）。
2. Root 切 `activeAgentId`，加载该 agent 的 transcript；Header 显示该 bot 头像/名（`chat-header.tsx`）。
3. Composer `scopeKey = accountSlot:agentId`，草稿按 agent 隔离；placeholder `Message ${name}`（`ProductionRenderer.tsx`）。
4. Submit → 用户消息入 transcript（可 `pending/queued/failed`）；assistant `isStreaming`：空文时三点 `StreamingMessage`，有文时 prose 流式（`transcript.tsx`）。
5. Thinking / tool-call 为可折叠 `sand-outline-item`；完成后 tool 可挂 `ToolResultCard`。
6. Hover：Reply / Start thread / Copy / Reaction pills。

快捷：`Cmd/Ctrl+N` 新建；`Alt+↑/↓` 切 agent；`1–9` 聚焦第 N 个（`window-chrome/root-shell-state.tsx`）。

### 2) 新建 bot

| 路径 | 行为 | 路径 |
|------|------|------|
| 侧栏 **New (+)** / 快捷键 | `createAgent({ name: "New chat", description: "", origin: "user", … })` 后打开 | `ProductionRenderer.tsx` |
| 首次 Onboarding | 选 color/shape、填 Name、可选模板建议 → `createAgent` 带人设 | `onboarding/signed-in/view.tsx` |

新建后立即进入该 agent 空对话；人设可后续在 Settings 改。

### 3) 改名 / 换人设

| 操作 | 入口 | 数据 |
|------|------|------|
| 快改名 | 侧栏双击 → `AgentNameEditor` → `updateAgent({ profile: { name, description } })` | `sidebar.tsx` + `ProductionRenderer` `renameAgent` |
| 完整人设 | Header 点身份 / 行菜单 Profile → Info pane：Name / Title / Description + Notifications | `agent-info/settings/view.tsx` |
| 换头像 | Info pane「Edit agent avatar」：形状/颜色 或上传图 | `agent-info/avatar-editor/` |

**人设在 UI 上的承载**：`name`（列表/Header/Composer）；`title`（预览 tag，非 group）；`description`（Settings 多行，「What this agent is for」）——**对话区不渲染 description 正文**，人设主要通过身份字段 + 独立会话历史体现。

---

## D. Bot 身份呈现清单

| 位置 | 渲染 | 文件 |
|------|------|------|
| Roster 行 | Avatar(md) + name + preview + time + 状态点 | `sidebar.tsx`, `agent-avatar.tsx`, `sidebar-agent-status.ts` |
| Hover 预览 | Avatar(xs) + title tag + Working/Needs attention/Unread | `sidebar-agent-preview-header.tsx` |
| Chat Header | Avatar(md) + name；`isRunning` → “Working” | `chat-header.tsx` |
| Composer placeholder | `Message {name}` | `ProductionRenderer.tsx` |
| Transcript | `data-role=user\|assistant`；assistant 用 `author`（a11y，常 hidden）；**气泡旁不重复大头像** | `transcript.tsx` |
| 流式 | 三点动画；avatar persona 可随 activity 动画（thinking/working/…） | `transcript.tsx`, `agent-avatar.tsx` |
| Info pane | 可编辑 name/title/description；头像编辑器 | `agent-info/settings/`, `avatar-editor/` |
| Group | 多成员拼贴头像；shared-room 地球图标 | `agent-avatar.tsx` |

**头像优先级**（刻意无 initials）：`dataUrl` 照片 → shared-room 图标 → group 拼贴 → **确定性 shape+color 程序化角色**（`agentId` 哈希回退）。调色板/形状：`onboarding/signed-in/character.tsx`、`avatar-editor/model.ts`。

**状态语义**：

- Unread → 信息蓝点 / “Unread activity”
- Waiting → “Needs attention”（blocked）
- Running → Working / 角标环或点；列表预览切 activity 行

---

## E. DSH 插件二期：等效 UI 建议

### 必做（信息架构核心）

1. **左栏多 bot roster + 选中绑定独立 conversation**（一 bot 一 thread 状态）。
2. **行结构**：头像 + 名字 + 最后预览 + 相对时间 + 未读/忙碌点；清晰选中态。
3. **中栏**：Header（身份）+ Transcript（user/assistant 分角色）+ Composer（按 bot 草稿隔离）。
4. **人设最小集**：`name` + `description`（系统提示/人设）+ 简单视觉身份（色块或 emoji 即可）。
5. **流式态**：生成中三点/占位；可选 “Working” 文案。
6. **新建入口**：侧栏 `+`；新建后立即切入空会话。

### 可简化

| 原产品 | DSH 建议 |
|--------|----------|
| 程序化 SVG 角色引擎 + 8 形×11 色 | Emoji / 色圆 + 首字，或固定插画集 |
| Sections / Pin / 多选批量 / Drag | 扁平列表 + 置顶即可 |
| Info pane 多页（Channels/Computer/Routines/Async） | 单页「人设编辑」抽屉/面板 |
| Reactions、线程、Find-in-chat、富文本 Tiptap | 纯文本先；reactions 可后置 |
| Tool outline / shell diff 卡 | 折叠「工具调用」一行摘要即可 |
| 折叠 88px rail、精细 resize | 固定宽或简单折叠 |
| Broadcast / Org-chart network | 不做 |

### 依赖桌面 / 平台做不了或应砍

- **Computer / VM / Teach recording**（`computer/shell/`）
- **本地 voice 转写**、附件本地 path、Electron bridge
- **Channels 接 Slack 等**（`agent-info/channels/`）— 除非 DSH 另有通道
- **Privacy Mode / Cursor 账号 / Plugins 商店 / 本地 CLI Router**
- **Coordinator 重连「your computer」**— 改为平台连接态即可
- **Shared room / Group agents**— 二期单人设 bot 可忽略

### 推荐 DSH 信息架构草图

```
[ Bot 列表 ] | [ 当前 Bot 对话面 ]
     +       |   Header: 头像+名 [人设]
             |   Messages…
             |   Composer
```

人设编辑：列表菜单或 Header 进入侧滑/弹层（name + system prompt/description + 头像），**不要**复制 Grok 的 Computer/Channels 右栏复杂度。

---

## 关键文件索引（相对 zip 根）

| 主题 | 路径 |
|------|------|
| 壳/布局装配 | `frontend/src/production/ProductionRenderer.tsx` |
| Roster UI | `frontend/src/recovered/features/conversation/workspace/sidebar.tsx` |
| 布局数值 | `…/conversation/workspace/sidebar-layout-state.ts` |
| 选中持久化 | `…/roster/selection-state.ts` |
| Agent/消息类型 | `…/conversation/workspace/model.ts`, `frontend/src/production/model.ts` |
| 头像 | `…/conversation/workspace/agent-avatar.tsx`, `…/onboarding/signed-in/character.tsx` |
| Header / Composer / Transcript | `chat-header.tsx`, `composer.tsx`, `transcript.tsx` |
| 人设面板 | `…/agent-info/settings/{model,view}.tsx`, `…/avatar-editor/` |
| 新建人设 | `…/onboarding/signed-in/{model,view}.tsx` |
| Reactions / Tools | `…/cards/transcript-card/reaction-actions.ts`, `…/tool-results/` |
| 截图 | `docs/assets/router-settings.png` |
| 重建边界说明 | `README.md`, `docs/ARCHITECTURE.md` |
