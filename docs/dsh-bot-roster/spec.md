# dsh-bot-roster Spec

> Version: 0.1.0 | Date: 2026-09-06 | Status: Ready 可执行
>
> 本文件是本需求的**唯一事实源**：事实基线、业务合同、技术方案、任务计划、验收协议全部在此。
> 其他文件（tasks.csv）只引用本文件，不复制内容。
>
> 填写三态规则：每个表格单元格只允许三种内容——
> 1. 验证过的事实（注明来源命令）；2. 显式假设 `ASM-xxx`；3. `待勘察`。
> 禁止编造看似合理的命令、symbol、文件名。

---

## 0. 一页纸人话摘要

- **给谁 / 场景**：名册里人设越来越多的本机用户。今天名单是一条平铺，不能置顶、分组、隐藏或静音，也没有预览和快捷键。
- **做什么**：把名册做成可折叠分组（默认置顶 / 工作 / 生活）、可拖拽换组排序、右键菜单、悬停预览、底部「已隐藏 N 个」、静音（不弹通知只积未读），以及 ⌘1-9 / ⌥↑↓ / ⌘B。
- **改哪里**：`bots.json` / `groups.json` 加布局字段、RPC `updateBotLayout`、`Roster.tsx` 与 `useGlobalKeyboard.ts`、未读/通知沿用例程包的 unread/markRead。
- **怎么算做完**：真机把阿宁拖进置顶、右键隐藏小北后底部出现「已隐藏 1 个」且其例程仍跑、静音后不弹通知、⌘2 直达第二个人设、⌘B 折起名册。
- **不做什么**：不改官方 npm、不新开轮询（working/unread 消费 live-transcript 的 SSE）、不在本包做关系图（peers 包）。

---

## 1. 事实基线与假设

### 1.1 需求与运行模式

| 项 | 结论 |
|---|---|
| 原始需求 | 协调者定稿：bots.json 增 pinned/section/hidden/order；groups.json 增 section/order；updateBotLayout；分组拖拽右键预览隐藏静音；快捷键不与 ⌘K/Esc 冲突 |
| 输入类型 | description |
| Mode | oneclick |
| 置信度 | 高（RegistryRow、Roster、keyboard、notify、markRead 均已勘察） |
| 输出目录 | `docs/dsh-bot-roster/` |

### 1.2 任务类型路由

| 维度 | 结论 |
|---|---|
| 任务类型 | frontend（主：名册交互）+ backend（布局字段 + 批量 RPC） |
| 主要风险 | ① HTML5 drag 与现有双击改名冲突；② 隐藏 bot 未读聚合与例程 unread 的叠加；③ ⌘1-9 与浏览器/宿主抢键 |
| 行号引用策略 | 仅 hint |
| 必需验收方式 | 真机拖拽/右键/快捷键 + curl 布局 + 例程仍跑 |
| 必须覆盖用户场景 | 拖组排序、右键、预览、隐藏静音、快捷键 |

### 1.3 勘察事实清单

| 事实 | 来源命令 | 输出摘要 |
|---|---|---|
| `BotRegistryRow` 现有 id/name/avatar/presetId/persona/declined/modelOverride/createdAt，无 pinned/section/hidden/order | `rg -n "export interface BotRegistryRow" packages/dsh-bot-host/src/bots.ts` | L49 |
| `GroupRegistryRow` 现有 id/name/memberIds/createdAt，无 section/order | `rg -n "export interface GroupRegistryRow" packages/dsh-bot-host/src/groups.ts` | L22 |
| `Roster` 渲染平铺；`hiddenCount` 是「还有 N 段会话」不是隐藏 bot | `rg -n "export function Roster\|hiddenCount" packages/workbench-ui/src/Roster.tsx` | L98 / L424 |
| 全局快捷键只有 ⌘K 开关面板、Esc 关面板 | `rg -n "export function useGlobalKeyboard\|isPaletteToggle" packages/workbench-ui/src/useGlobalKeyboard.ts` | L23 / L13 |
| native-experience 未闭合面写明 ⌘K/Esc 证据弱、嵌入宿主零覆盖；本包新键不得与这两冲突 | `rg -n "未闭合面" docs/dsh-bot-native-experience/spec.md` | L642 |
| 未读在 host `unread` Map；`markRead` RPC 已有；工作台 `notifyRoutineSpoke` | `rg -n "private readonly unread\|case 'markRead':" packages/dsh-bot-host/src/index.ts packages/dsh-bot-host/src/workbench-routes.ts`；`rg -n "export function notifyRoutineSpoke\|export function markRead" packages/workbench-ui/src/notify.ts packages/workbench-ui/src/api.ts` | index L288；routes L313；notify L10；api L404 |
| `App.tsx` 每 2s `listBots` 用 unread 增量弹 `notifyRoutineSpoke` | `rg -n "notifyRoutineSpoke" packages/workbench-ui/src/App.tsx` | L140 |
| `createBotsRuntime` / `createGroupsRuntime` 读写 json | `rg -n "export function createBotsRuntime\|export function createGroupsRuntime" packages/dsh-bot-host/src/bots.ts packages/dsh-bot-host/src/groups.ts` | L352 / L389 |
| `env/dsh-bot/` 已 gitignore | `rg -n "env/dsh-bot/" .gitignore` | L14 |
| 原型默认三组置顶/工作/生活；右键置顶/编辑/移组/已读/隐藏/静音/删除；悬停预览 | `rg -n "sections = \|置顶\|hiddenBots" docs/prototypes/dsh-bot-grok-parity.html` | L315 / L401 |
| Playwright 渠道存在；本会话 :3084 未监听 | `ls ../../dsh-genoffice/engine/node_modules/playwright/package.json`；`lsof -nP -iTCP:3084 -sTCP:LISTEN` | 存在；空 |

### 1.4 假设清单

| 假设 ID | 内容 | 风险 | 确认方式 |
|---|---|---|---|
| ASM-031 | 名册用 HTML5 drag（`draggable` + `dragstart/drop`）在 Chrome channel 下可完成换组与排序，且不触发双击改名 | 拖一下变成重命名 | Task 1：拖两行看是否改名或换位 |
| ASM-032 | 悬停 500ms 再出预览卡，移出 150ms 内关掉，不挡拖拽 | 卡挡住 drop 目标 | Task 1：悬停与拖拽各做一次 |
| ASM-033 | ⌘1-9 / ⌥↑↓ / ⌘B 在工作台 capture 阶段 `preventDefault` 后不与 �-9 / ⌥↑↓ / ⌘B 在工作台 capture 阶段 `preventDefault` 后不与 ⌘K/Esc 打架，也不打开发者工具 | 宿主吞键 | Task 1：三套键各按一次，⌘K/Esc 仍只管面板 |
| ASM-034 | 隐藏 bot 的例程调度不读 hidden 标志（现网 routines 只认 botId+enabled） | 隐藏后例程停是回归 | Task 1：读 `routine-scheduler.ts` 是否滤 hidden（预期不滤） |

### 1.5 变更记录

| 日期 | 变更条目 ID | 原因 | 影响任务与处置 |
|---|---|---|---|
| 2026-04-09 | CAL-031 | Task 1：ASM-034 源码确认；031–033 按合同接线（dblclick 改名 / 500ms 预览 / 快捷键不碰 ⌘K） | 第 2 章不改 |

---

## 2. 业务合同

> ID 用 03x 段。

### 2.1 BR 业务规则

| 规则 ID | 规则 | 正例 | 反例 | 影响范围 | 验证方式 |
|---|---|---|---|---|---|
| BR-031 | `bots.json` 条目增 `pinned`（bool）、`section`（string，默认 `work`）、`hidden`（bool）、`order`（number）、`muted`（bool，静音）。缺省：pinned=false、section=work、hidden=false、order=createdAt、muted=false。旧文件缺字段读时填默认，不报错 | 旧 bot 打开仍在「工作」 | 缺字段启动崩溃 | host | vitest |
| BR-032 | `groups.json` 条目增 `section`（默认 `work`）、`order`。小组可进置顶/工作/生活，无 hidden/muted（隐藏只对人设） | 小组可拖进生活 | 小组出现「已隐藏」 | host | vitest |
| BR-033 | RPC `updateBotLayout({bots?:[{id,pinned,section,hidden,order,muted}], groups?:[{id,section,order}]})` 批量写；未知 id 跳过并在结果列 skipped；成功 `{ok:true}` | 一次拖两行只打一枪 RPC | 每行一次写整文件抖动 | host + ui | curl + vitest |
| BR-034 | 名册按 section 分组，默认可折叠三组「置顶 / 工作 / 生活」（组名可改，存 `env/dsh-bot/roster-sections.json` 或 bots 元数据；推荐独立小文件 `roster.json`：`{sections:[{id,name,order}]}`）。组内按 order 升序。HTML5 拖拽换组与排序。右键：置顶/编辑/移组/标已读/隐藏/静音/删除（删除沿用既有确认）。悬停 500ms 预览：模型、例程数、会话数、最近一句。底部「已隐藏 N 个」可展开 | 拖阿宁到置顶，刷新仍在 | 刷新丢布局 | ui | 真机 |
| BR-035 | 隐藏的 bot 例程照常跑；其未读计入底部「已隐藏」聚合徽标，不进主名册行。点展开仍能进该 bot。取消隐藏回原 section | 隐藏后例程线程仍增消息 | 隐藏=停调度 | host + ui | 真机 + cat routines |
| BR-036 | 静音 = 不调用 `notifyRoutineSpoke` / `Notification`，未读照积、徽标照亮；标已读走既有 `markRead` | 静音后例程到达只有数字 | 静音清未读 | ui | 真机 |
| BR-037 | 快捷键：⌘1-9 直达当前可见名册第 N 个（含小组，跳过折叠组内不可见项）；⌥↑ / ⌥↓ 上一个/下一个可见项；⌘B 折叠/展开整列名册。不绑定 ⌘K、Esc；`isPaletteToggle` 原样 | ⌘B 名册收成窄条，⌘K 仍开面板 | ⌘B 关掉命令面板 | ui | 真机 |
| BR-038 | 红线：不改官方 npm 与三邻仓（基线见 `../dsh-bot-living-master/spec.md` §1.5）；一口一仓 :3084；布局文件不入 git；`rg -i 'anysphere\|sand://' packages/` 为空；不新开定时器（working/unread 消费 SSE `bot/status`，SSE 未合入时沿用既有 listBots 2s） | — | 新 setInterval | 全部 | 收尾 |

### 2.2 UF 用户验收场景（索引）

| 场景 ID | Given | When | Then | 角色 | 验证方式 | Evidence |
|---|---|---|---|---|---|---|
| UF-031 | 工作台至少 2 个人设 + 1 个小组 | 把阿宁拖到置顶；把小组拖到生活；刷新 | 分组折叠标题仍在；顺序与组保持 | 本机用户 | browser | EVD-031 |
| UF-032 | 名册上右键小北 | 点隐藏；再点底部「已隐藏 1 个」展开后取消隐藏 | 主列消失/回来；右键其他项不误伤 | 本机用户 | browser | EVD-032 |
| UF-033 | 鼠标在阿宁行停 500ms | 看预览卡 | 卡上有模型、例程数、会话数、最近一句；移开卡关 | 本机用户 | browser | EVD-033 |
| UF-034 | 小北有一条每分钟例程；先静音再隐藏 | 等一次唤醒 | 无系统通知；已隐藏徽标 +1；例程记录仍 ran | 本机用户 | browser + cat | EVD-034 |
| UF-035 | 名册展开且至少 2 项 | 按 ⌘2、⌥↓、⌘B、再 ⌘K | 进第 2 项；切到下一项；名册折叠；命令面板仍开 | 本机用户 | browser | EVD-035 |

### 2.3 核心业务流程（步骤级交互脚本）

#### UF-031: 拖拽换组与排序

**前置状态**：boot 后工作台打开，至少阿宁、小北、一个小组。

**成功主路径**：

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 拖阿宁到「置顶」组标题或组内 | 拖影 + drop 高亮 | `updateBotLayout` pinned=true section=pinned | 阿宁在置顶第一 |
| 2 | 拖小组到「生活」 | 小组行移动 | groups.section=life | 生活组出现该小组 |
| 3 | 刷新页面 | — | 读 json | 位置不变 |

**失败分支**：

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| RPC 失败 | host 挂 | 行弹回原位 toast「没保住」 | 不改本地权威 | 重试 |
| 拖到自己身上 | drop 同 index | 无变化 | 不打 RPC | — |

**界面状态机**：`idle → dragging → dropped-saving → idle | revert`

**入口接线清单**：`Roster.tsx` 行 `draggable`；drop 调 `api.updateBotLayout`。

#### UF-032: 右键菜单

**前置状态**：名册可见小北。

**成功主路径**：

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 右键小北 | 菜单：置顶/编辑/移组/标已读/隐藏/静音/删除 | 纯前端 | — |
| 2 | 点隐藏 | 行消失；底栏「已隐藏 1 个」 | layout hidden=true | — |
| 3 | 点底栏展开 → 取消隐藏 | 行回原 section | hidden=false | — |

**失败分支**：

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 默认 bot 删除 | 右键受保护 bot | 删除禁用（沿用既有） | — | — |
| 点菜单外 | 任意空白 | 菜单关 | — | — |

**界面状态机**：`idle → menu → action-saving → idle`

**入口接线清单**：Roster 行 `onContextMenu`；删除走既有确认。

#### UF-033: 悬停预览

**前置状态**：阿宁有会话与例程或空。

**成功主路径**：

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 指针在行上停 500ms | 预览卡出现 | 读已有 list 缓存（sessions/routines/bots），不新开轮询 | 模型 / 例程数 / 会话数 / 最近一句（空则「还没聊过」） |
| 2 | 移出 | 150ms 后关 | — | 不挡下一行 |

**失败分支**：

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 500ms 内离开 | 滑过 | 不出卡 | clearTimeout | — |
| 拖拽开始 | dragstart | 关卡 | — | — |

**界面状态机**：`idle → hover-wait → preview → idle`

**入口接线清单**：Roster 行 pointerenter/leave；数据用 App 已有 props。

#### UF-034: 隐藏仍跑例程 + 静音不通知

**前置状态**：小北有 `@every 1m` 例程；窗口失焦以便通知可测。

**成功主路径**：

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 右键静音再隐藏 | 行消失；底栏 N=1 | muted+hidden | — |
| 2 | 等一次唤醒 | 无 Notification；底栏徽标 +1 | 调度不看 hidden；notify 看 muted | 例程页仍有 ran |
| 3 | 展开隐藏列表点进小北 | 中栏打开其会话 | — | 能读到主动消息 |

**失败分支**：

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 未静音只隐藏 | 隐藏但 muted=false | 仍可弹通知（或只在失焦时），未读进已隐藏徽标 | BR-036 只约束 muted | 与例程包通知规则叠加 |
| 标已读 | 在隐藏展开里标已读 | 徽标归零 | `markRead` | — |

**界面状态机**：`visible → muted → hidden-aggregated`

**入口接线清单**：`App.tsx` 弹通知前读 `bot.muted`；scheduler 不读 hidden。

#### UF-035: 快捷键

**前置状态**：名册展开，可见至少 2 项；命令面板关。

**成功主路径**：

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | ⌘2 | 选中可见第 2 项 | keyboard hook | 中栏切换 |
| 2 | ⌥↓ | 选中下一项 | — | — |
| 3 | ⌘B | 名册列折叠 | 本地 UI 状态（可写 localStorage） | 中栏变宽 |
| 4 | ⌘K | 命令面板打开 | `isPaletteToggle` 未改 | 与折叠并存 |

**失败分支**：

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| ⌘9 超过可见数 | 只有 3 项 | 无切换 | 忽略 | — |
| 面板开着按 ⌘B | 面板打开 | 名册仍折；面板不关 | 两套 handler 互不抢 Esc | — |
| Esc | 面板开 | 只关面板 | 不折名册 | — |

**界面状态机**：沿用 palette + 新增 `rosterCollapsed`

**入口接线清单**：`useGlobalKeyboard` 加法；App 传 `onSelectNth` / `onCycle` / `onToggleRoster`。

### 2.4 INV 不变量

| 不变量 ID | 内容 | 关联 BR/UF | 验证方式 |
|---|---|---|---|
| INV-031 | ⌘K / Esc / Enter / Shift+Enter 行为不变 | BR-037 | keyboard + composer 单测 |
| INV-032 | 隐藏不等于删除：bots.json 行还在，preset 还在，例程 enabled 不因 hidden 被改 | BR-035 | cat + 例程单测 |
| INV-033 | `markRead` / unread Map 契约不变，只是徽标位置可聚合到「已隐藏」 | BR-036 | 既有 notify 单测 |
| INV-034 | 一口一仓 :3084；邻仓基线见 living-master §1.5；布局文件不入 git；参考树空 | BR-038 | 收尾 |

### 2.5 EVD 证据清单

| 证据 ID | 类型 | 期望证据 | 保存位置 |
|---|---|---|---|
| EVD-030 | log | Task 1 校准 | `evidence/phase-0/calibration.md` |
| EVD-031 | screenshot | 拖拽后分组 + 刷新 | `evidence/UF-031/` |
| EVD-032 | screenshot | 右键隐藏 + 底栏 | `evidence/UF-032/` |
| EVD-033 | screenshot | 预览卡 | `evidence/UF-033/` |
| EVD-034 | screenshot+file | 静音无通知 + 例程 ran + 已隐藏徽标 | `evidence/UF-034/` |
| EVD-035 | screenshot | 快捷键切换与折叠 | `evidence/UF-035/` |
| EVD-036 | api | updateBotLayout curl | `evidence/API-036/` |
| EVD-037 | log | Phase 命令 | `evidence/phase-0/` |

### 2.6 角色与权限矩阵

单一本机用户。

### 2.7 负向 / 破坏性场景

| 场景 | Given | When | Then | Evidence |
|---|---|---|---|---|
| 空数据 | 只有 1 个默认 bot | 打开名册 | 三组仍在，空组可折 | EVD-031 |
| 依赖失败 | updateBotLayout 失败 | 拖拽 | 回弹 | EVD-031 |
| 旧数据 | 无新字段的 bots.json | 启动 | 默认工作组 | EVD-031 |
| 破坏性 | 删除隐藏 bot | 确认后 | 行与 hidden 计数都减；preset 删 | EVD-032 |

### 2.8 非目标

- 关系图、同事页（peers 包）。
- 新 SSE / 新轮询。
- 小组的隐藏/静音。
- 改 ⌘K/Esc。

---

## 3. 技术方案

### 3.1 架构 Before / After

```text
Before:
bots.json 无布局字段；Roster 平铺；keyboard 仅 ⌘K/Esc
notify 凡 unread++ 就弹

After:
bots.json + pinned/section/hidden/order/muted
groups.json + section/order
roster.json sections（默认可改名的三组）
updateBotLayout 批量写
Roster: 分组折叠 / HTML5 drag / 右键 / hover 500ms / 已隐藏 N
notify: muted 跳过
keyboard += ⌘1-9 ⌥↑↓ ⌘B
实时：消费 bot/status，不新 timer
```

### 3.2 模块改造

| 模块 | 职责 | 改造说明 |
|---|---|---|
| `packages/dsh-bot-host/src/bots.ts` | 字段默认与读写 | 旧文件兼容 |
| `packages/dsh-bot-host/src/groups.ts` | section/order | — |
| `packages/dsh-bot-host/src/workbench-routes.ts` | `updateBotLayout` | — |
| `packages/workbench-ui/src/Roster.tsx` | 分组 UI | 主改 |
| `packages/workbench-ui/src/useGlobalKeyboard.ts` | 新快捷键 | 加法 |
| `packages/workbench-ui/src/App.tsx` | muted 门闩、折叠态 | notify 前判断 |

### 3.3 三段式定位清单

> 全部 anchor 已于 2026-09-06 用 `rg -c` 核验命中。

| 文件 | 稳定定位 | 搜索定位 | 行号 hint | 备注 |
|---|---|---|---|---|
| `packages/dsh-bot-host/src/bots.ts` | `export interface BotRegistryRow` | `rg "export interface BotRegistryRow" packages/dsh-bot-host/src/bots.ts` | L49 | 加字段 |
| `packages/dsh-bot-host/src/bots.ts` | `export function createBotsRuntime` | `rg "export function createBotsRuntime" packages/dsh-bot-host/src/bots.ts` | L352 | — |
| `packages/dsh-bot-host/src/groups.ts` | `export interface GroupRegistryRow` | `rg "export interface GroupRegistryRow" packages/dsh-bot-host/src/groups.ts` | L22 | — |
| `packages/dsh-bot-host/src/groups.ts` | `export function createGroupsRuntime` | `rg "export function createGroupsRuntime" packages/dsh-bot-host/src/groups.ts` | L389 | — |
| `packages/dsh-bot-host/src/workbench-routes.ts` | `export async function dispatchWorkbenchApi` | `rg "export async function dispatchWorkbenchApi" packages/dsh-bot-host/src/workbench-routes.ts` | L188 | 新 case |
| `packages/dsh-bot-host/src/workbench-routes.ts` | `case 'markRead':` | `rg "case 'markRead':" packages/dsh-bot-host/src/workbench-routes.ts` | L313 | 不改语义 |
| `packages/dsh-bot-host/src/index.ts` | `private readonly unread` | `rg "private readonly unread" packages/dsh-bot-host/src/index.ts` | L288 | 聚合徽标源 |
| `packages/workbench-ui/src/Roster.tsx` | `export function Roster` | `rg "export function Roster" packages/workbench-ui/src/Roster.tsx` | L98 | 主 UI |
| `packages/workbench-ui/src/Roster.tsx` | `hiddenCount` | `rg "hiddenCount" packages/workbench-ui/src/Roster.tsx` | L424 | 勿与隐藏 bot 混淆 |
| `packages/workbench-ui/src/useGlobalKeyboard.ts` | `export function useGlobalKeyboard` | `rg "export function useGlobalKeyboard" packages/workbench-ui/src/useGlobalKeyboard.ts` | L23 | 加法 |
| `packages/workbench-ui/src/useGlobalKeyboard.ts` | `isPaletteToggle` | `rg "isPaletteToggle" packages/workbench-ui/src/useGlobalKeyboard.ts` | L13 | 不改 |
| `packages/workbench-ui/src/App.tsx` | `notifyRoutineSpoke` | `rg "notifyRoutineSpoke" packages/workbench-ui/src/App.tsx` | L140 | muted 门闩 |
| `packages/workbench-ui/src/notify.ts` | `export function notifyRoutineSpoke` | `rg "export function notifyRoutineSpoke" packages/workbench-ui/src/notify.ts` | L10 | — |
| `packages/workbench-ui/src/api.ts` | `export function markRead` | `rg "export function markRead" packages/workbench-ui/src/api.ts` | L404 | — |
| `packages/workbench-ui/src/api.ts` | `export function listBots` | `rg "export function listBots" packages/workbench-ui/src/api.ts` | L96 | 旁加 layout |
| `.gitignore` | `env/dsh-bot/` | `rg "env/dsh-bot/" .gitignore` | L14 | roster.json 已覆盖 |

### 3.4 API / 数据 / 权限 / 路由影响

| 类型 | 是否影响 | 说明 | 兼容策略 |
|---|---|---|---|
| API | 是 | `updateBotLayout`；`listBots` 多返回布局字段 | 加法 |
| 数据 | 是 | bots/groups 新字段 + roster.json | 读时填默认 |
| 权限 | 否 | — | — |
| 路由 | 否 | — | — |

---

## 4. Phase 计划与任务详情

```text
P0 校准(1) → P1 数据与RPC(2,3,4) → P2 名册UI(5,6,7,8,9) → P3 通知与快捷键(10,11,12) → P4 收尾(13,14,15)
```

### Phase 0: 校准

### Task 1: 校准 ASM-031~034

- **关联**：ASM-031 / ASM-032 / ASM-033 / ASM-034 / EVD-030 / UF NA
- **前置任务**：无
- **风险等级**：P0

**涉及文件与定位**：

- `packages/workbench-ui/src/Roster.tsx`：`Roster`，L98
- `packages/workbench-ui/src/useGlobalKeyboard.ts`：`useGlobalKeyboard`，L23

**具体操作**：

1. ASM-031：在当前 Roster 临时加 draggable 两行，Chrome 里拖，看会不会触发双击改名；完后还原。
2. ASM-032：悬停 500ms 出绝对定位卡，拖拽时是否挡 drop。
3. ASM-033：在 hook 里临时绑 ⌘B，确认 ⌘K/Esc 仍只管面板。
4. ASM-034：`rg hidden packages/dsh-bot-host/src/routine-scheduler.ts` 预期 0。
5. 写入 `evidence/phase-0/calibration.md`。

**验证**：`ls evidence/phase-0/calibration.md` → 存在

**Evidence**：`evidence/phase-0/`

**注意事项**：`豁免回归:单任务校准 Phase`

### Phase 1: 数据与 RPC

### Task 2: bots/groups 布局字段与旧文件默认

- **关联**：BR-031 / BR-032 / UF-031
- **前置任务**：1
- **风险等级**：P1

**涉及文件与定位**：

- `packages/dsh-bot-host/src/bots.ts`：`BotRegistryRow` / `createBotsRuntime`，L49 / L352
- `packages/dsh-bot-host/src/groups.ts`：`GroupRegistryRow`，L22

**具体操作**：加字段；读缺失填默认；`roster.json` 默认三组。单测旧 json。

**验证**：`./node_modules/.bin/vitest run packages/dsh-bot-host/tests/bots.spec.ts packages/dsh-bot-host/tests/groups.spec.ts` → 通过

**Evidence**：`evidence/phase-1/task2-tests.log`

### Task 3: updateBotLayout RPC

- **关联**：BR-033 / UF-031
- **前置任务**：2
- **风险等级**：P1

**涉及文件与定位**：

- `packages/dsh-bot-host/src/workbench-routes.ts`：`dispatchWorkbenchApi`，L188
- `packages/workbench-ui/src/api.ts`：`listBots`，L96

**具体操作**：批量写；skipped 列表；`listBots` 带出新字段。

**验证**：`./node_modules/.bin/vitest run packages/dsh-bot-host/tests/workbench-routes.spec.ts` → 通过

**Evidence**：`evidence/phase-1/task3-tests.log`

### Task 4: 执行 Phase 1 回归验证

- **关联**：BR-031 / BR-033 / INV-032
- **前置任务**：3

**验证**：`pnpm run typecheck && ./node_modules/.bin/vitest run packages/dsh-bot-host/tests` → 全过

**Evidence**：`evidence/phase-1/`

### Phase 2: 名册 UI

### Task 5: 分组可折叠与默认可改名三组

- **关联**：BR-034 / UF-031
- **前置任务**：3
- **风险等级**：P1

**涉及文件与定位**：

- `packages/workbench-ui/src/Roster.tsx`：`Roster`，L98

**具体操作**：按 section 渲染；折叠态；组名双击改（写 roster.json）。空组仍显示标题。

**验证**：`./node_modules/.bin/vitest run packages/workbench-ui/tests/roster.spec.tsx` → 通过

**Evidence**：`evidence/phase-2/task5-tests.log`

### Task 6: HTML5 拖拽换组与排序

- **关联**：BR-034 / ASM-031 / UF-031
- **前置任务**：5
- **风险等级**：P1

**涉及文件与定位**：

- `packages/workbench-ui/src/Roster.tsx`：`Roster`，L98

**具体操作**：drag/drop 调 `updateBotLayout`；失败回弹。不触发重命名。

**验证**：`./node_modules/.bin/vitest run packages/workbench-ui/tests/roster.spec.tsx` → 通过

**Evidence**：`evidence/phase-2/task6-tests.log`

### Task 7: 右键菜单与已隐藏底栏

- **关联**：BR-034 / BR-035 / UF-032
- **前置任务**：5
- **风险等级**：P1

**涉及文件与定位**：

- `packages/workbench-ui/src/Roster.tsx`：`hiddenCount`，L424（新底栏，勿复用会话 hiddenCount 文案）

**具体操作**：右键七项；隐藏进出底栏；删除沿用确认。

**验证**：`./node_modules/.bin/vitest run packages/workbench-ui/tests/roster.spec.tsx` → 通过

**Evidence**：`evidence/phase-2/task7-tests.log`

### Task 8: 悬停 500ms 预览卡

- **关联**：BR-034 / ASM-032 / UF-033
- **前置任务**：5
- **风险等级**：P2

**涉及文件与定位**：

- `packages/workbench-ui/src/Roster.tsx`：`Roster`，L98

**具体操作**：500ms 开 / 150ms 关 / dragstart 关；字段来自已有 props。

**验证**：`./node_modules/.bin/vitest run packages/workbench-ui/tests/roster.spec.tsx` → 通过

**Evidence**：`evidence/phase-2/task8-tests.log`

### Task 9: 执行 Phase 2 回归验证

- **关联**：BR-034
- **前置任务**：6;7;8

**验证**：`pnpm run typecheck && ./node_modules/.bin/vitest run packages/workbench-ui/tests/roster.spec.tsx` → 通过

**Evidence**：`evidence/phase-2/`

### Phase 3: 通知与快捷键

### Task 10: 静音跳过 Notification

- **关联**：BR-036 / UF-034 / INV-033
- **前置任务**：3
- **风险等级**：P1

**涉及文件与定位**：

- `packages/workbench-ui/src/App.tsx`：`notifyRoutineSpoke`，L140
- `packages/workbench-ui/src/notify.ts`：`notifyRoutineSpoke`，L10

**具体操作**：unread 增加时若 muted 不弹；徽标仍加。隐藏未读加到已隐藏聚合。

**验证**：`./node_modules/.bin/vitest run packages/workbench-ui/tests/notify.spec.ts packages/workbench-ui/tests/app.spec.tsx` → 通过

**Evidence**：`evidence/phase-3/task10-tests.log`

### Task 11: ⌘1-9 / ⌥↑↓ / ⌘B

- **关联**：BR-037 / ASM-033 / UF-035 / INV-031
- **前置任务**：5
- **风险等级**：P1

**涉及文件与定位**：

- `packages/workbench-ui/src/useGlobalKeyboard.ts`：`useGlobalKeyboard` / `isPaletteToggle`，L23 / L13

**具体操作**：在 `useGlobalKeyboard` 加法三套键（⌘1-9 直达可见第 N 项、⌥↑↓ 循环、⌘B 折叠名册）；不改 ⌘K/Esc。⌘B 切 `rosterCollapsed`。

**验证**：`./node_modules/.bin/vitest run packages/workbench-ui/tests/keyboard.spec.tsx` → 通过

**Evidence**：`evidence/phase-3/task11-tests.log`

### Task 12: 执行 Phase 3 回归验证

- **关联**：BR-036 / BR-037 / INV-031
- **前置任务**：10;11

**验证**：`pnpm run typecheck && ./node_modules/.bin/vitest run packages/workbench-ui/tests/keyboard.spec.tsx packages/workbench-ui/tests/notify.spec.ts` → 通过

**Evidence**：`evidence/phase-3/`

### Phase 4: 文档、真实场景与收尾

### Task 13: 同步 README 名册说明

- **关联**：BR-038 / UF NA
- **前置任务**：12
- **风险等级**：P2

**具体操作**：README 写分组、隐藏例程仍跑、静音、快捷键。

**验证**：`rg -n "已隐藏" README.md` → ≥1

**Evidence**：`evidence/phase-4/docs-diff.md`

### Task 14: 执行 spec 5.2 真实场景全套测试

- **关联**：UF-031 / UF-032 / UF-033 / UF-034 / UF-035
- **前置任务**：12

**验证**：按 5.2 执行矩阵逐行回放，全部通过

**Evidence**：`evidence/UF-031/` ~ `evidence/UF-035/`

### Task 15: 执行 Phase 4 回归验证

- **关联**：全部 BR / INV-034
- **前置任务**：13;14

**验证**：`pnpm run typecheck && pnpm run build && pnpm test && pnpm run standard:check` → 全绿；`rg -i 'anysphere|sand://' packages/` → 空；邻仓基线见 living-master §1.5

**Evidence**：`evidence/phase-4/final-commands.log`

---

## 5. 验收与 Review 协议

> **验收铁律：命令级验证（5.1）通过只是入场券，不是完成。**

### 5.1 命令级验证（入场券）

| 验证项 | 命令 | 期望 | Evidence |
|---|---|---|---|
| typecheck | `pnpm run typecheck` | exit 0 | EVD-037 |
| build | `pnpm run build` | exit 0 | EVD-037 |
| unit | `pnpm test` | 全过 | EVD-037 |
| standard | `pnpm run standard:check` | exit 0 | EVD-037 |
| 红线 | `rg -i 'anysphere\|sand://' packages/` | 空 | EVD-037 |

### 5.2 真实场景全套测试（Real-Run，完成的唯一标准）

**环境准备**：

| 项 | 值 |
|---|---|
| 启动命令 | `pnpm install && pnpm run build && sh env/setup.sh && sh env/boot.sh`（先 `~/.agents/skills/dsh-plugin-debug/scripts/dsh-rpc-who.sh 3084`） |
| 访问入口 | 工作台 `http://127.0.0.1:3084/dsh-bot/ui` |
| 测试账号/数据 | 至少阿宁、小北、一个小组；测试后可用 updateBotLayout 还原 |
| 干净状态定义 | 每条 UF 前刷新；UF-034 前确认例程 enabled |
| 可用测试工具 | Playwright channel chrome；真机键盘；`cat` routines.json |

**执行矩阵**：

| UF | 执行方式 | 操作来源 | 必须核对的点 | Evidence |
|---|---|---|---|---|
| UF-031 主路径 | browser | 2.3 UF-031 | 拖到置顶/生活后刷新保持 | `evidence/UF-031/after-drag.png`、`evidence/UF-031/after-reload.png` |
| UF-031 失败分支 回弹 | browser | 停 host 再拖 | 回原位 | `evidence/UF-031/revert.png` |
| UF-032 主路径 | browser | 2.3 UF-032 | 隐藏后底栏 1；取消隐藏回来 | `evidence/UF-032/hidden.png`、`evidence/UF-032/unhide.png` |
| UF-032 失败分支 保护删除 | browser | 默认 bot 右键 | 删除禁用 | `evidence/UF-032/protected.png` |
| UF-033 主路径 | browser | 2.3 UF-033 | 500ms 出卡四字段 | `evidence/UF-033/preview.png` |
| UF-033 失败分支 滑过 | browser | 快划过 | 不出卡 | `evidence/UF-033/no-flash.png` |
| UF-034 主路径 | browser + cat | 2.3 UF-034 | 无通知；已隐藏徽标；例程 ran | `evidence/UF-034/muted.png`、`evidence/UF-034/routine-ran.md` |
| UF-034 失败分支 标已读 | browser | 隐藏展开里标已读 | 聚合徽标 0 | `evidence/UF-034/mark-read.png` |
| UF-035 主路径 | browser | 2.3 UF-035 | ⌘2 / ⌥↓ / ⌘B / ⌘K 各对 | `evidence/UF-035/keys.png` |
| UF-035 失败分支 超范围 | browser | ⌘9 在只有 3 项时 | 不切换 | `evidence/UF-035/overflow.md` |

**通过标准**：执行矩阵全部行通过且 evidence 齐全。

### 5.3 Evidence 目录结构与命名

```text
evidence/
  phase-0/ calibration.md
  phase-1/ ~ phase-4/
  UF-031/ ~ UF-035/
  API-036/
```

### 5.4 Review 专项检查清单

- [ ] 旧 bots.json 缺字段能启动（BR-031）
- [ ] 隐藏不改 routines.enabled（INV-032）
- [ ] 静音不弹通知仍积未读（BR-036）
- [ ] ⌘K/Esc 不变（INV-031）
- [ ] 无新增 setInterval（BR-038）
- [ ] 5.2 全过；P0 未跳过
