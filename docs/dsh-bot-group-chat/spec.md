# dsh-bot-group-chat Spec

> Version: 0.1.0 | Date: 2026-08-30 | Status: Ready 可执行
>
> 本文件是本需求的**唯一事实源**。三期包:在工作台(`../dsh-bot-workbench/spec.md`)之上加「多 bot 小组对话」。
> 参考产品小组形状只读:`../dsh-bot-workbench/reference-ui-notes.md` 与仓外 `../reference`(禁拷代码/文案/品牌)。
>
> 填写三态规则:每个表格单元格只允许三种内容——
> 1. 验证过的事实(注明来源命令);2. 显式假设 `ASM-xxx`;3. `待勘察`。

---

## 0. 一页纸人话摘要

- **给谁 / 场景**:已经在 DSH Bot 工作台里建了多个人设(例如 DSH Bot 和「诗人小北」)的使用者。现在每个人设只能各聊各的;他们想要 Grok Bot 那种**小组对话**——几个 bot 坐在同一个 conversation 里,你说一句,他们按身份轮流接话。
- **做什么**:在工作台左栏增加「小组」这种名单行(拼贴头像 + 成员名)。点进去是**一个共享房间**:用户气泡仍在右侧;每个 bot 的回复带自己的头像和名字。默认全员各回一轮;`@名字` 只让被点到的 bot 开口。增减成员、删除小组都不动原来的 1:1 人设和私聊。
- **改哪里**:只改本仓。host 新增小组注册表和轮次引擎;工作台 roster/对话面识别小组;1:1 人设、`dsh_bot_ask`、页签 iframe 不动。
- **怎么算做完**:新建一个含两个人设的小组 → 发「你们是谁?」→ 同一条 transcript 里先后出现两个人设、口吻不同、头像不同;@其中一个则只有他回;删小组后两人设私聊还在。
- **不做什么**:不把多个 DSH 人设塞进官方的同一个 agent 会话(平台一人设一会话);不做跨用户共享房间;不复刻参考产品的 SendMessage 工具和远程房间。

---

## 1. 事实基线与假设

### 1.1 需求与运行模式

| 项 | 结论 |
|---|---|
| 原始需求 | 「这个交互好像没做,规划一下」——指 Grok Bot 式**不同 bot 的小组对话**(同一 conversation,多名成员),不是已交付的 1:1 隔离切换 |
| 输入类型 | description(对话反馈 + 工作台已落地 + 参考产品只读形状) |
| Mode | oneclick(新包;工作台包保持 Done,本包增量) |
| 置信度 | 高(工作台 API/会话链已实机;参考产品小组轮次/点名/人数上限已读形状;DSH 单会话单 preset 是既有事实) |
| 输出目录 | `docs/dsh-bot-group-chat/` |

### 1.2 任务类型路由

| 维度 | 结论 |
|---|---|
| 任务类型 | backend(小组注册表 + 轮次引擎)+ frontend(roster 小组行 + 多作者 transcript) |
| 主要风险 | 轮次延迟(每成员一次模型调用);隐藏成员会话漏进 1:1 列表;把 1:1 history 形状改坏 |
| 行号引用策略 | 既有文件 symbol+rg;新建文件标「新建」 |
| 必需验收方式 | browser 真实点击 + RPC/CLI 取证 + host/ui 单测 |
| 必须覆盖用户场景 | UF-301 建组、UF-302 全员一轮、UF-303 @点名、UF-304 增减成员、UF-305 删组、UF-306 1:1 零回归 |

### 1.3 勘察事实清单

| 事实 | 来源命令 | 输出摘要 |
|---|---|---|
| 工作台 1:1 已交付:左栏 roster + 右栏独立 conversation,按 bot 隔离 | 本会话打开 `http://127.0.0.1:3084/dsh-bot/ui`;`POST /dsh-bot/listBots` 返回种子 `dsh-bot` | 小组是**新的名单实体**,不是把两个 1:1 会话叠在一起 |
| 人设注册表行无 `kind`/`memberIds`:`BotRegistryRow = {id,name,avatar,presetId,modelOverride?,createdAt}`,人设文本不入库 | Read `packages/dsh-bot-host/src/bots.ts` L47-55 | 小组不宜塞进 bots[] 以免弄坏现解析器;用独立 `groups.json` |
| 工作台会话:`createBotSession` → 网关 `session.create {agentPreset,cwd}` + marks `[kind:dsh-bot, bot:<id>]`;`history` 项只有 `kind: message\|thinking\|tool`,**无 author** | Read `packages/dsh-bot-host/src/workbench-sessions.ts` L49-98 | 小组 transcript 必须带作者;1:1 项保持无 author 也要能渲染 |
| 工作台 RPC 现有:`listBots/createBot/updateBot/deleteBot/createBotSession/listBotSessions/history/prompt/reconcile` | Read `packages/dsh-bot-host/src/workbench-routes.ts` L167-188 | 小组 API 并列新增,v1/v2 方法保留 |
| `session.create` 仍无多 preset 参数(v1 勘察:`SessionToolCreateOptions` 无 agentPreset 以外的第二人设槽;工作台把 preset 经网关 `session.create` 单值传入) | Read `packages/dsh-bot-host/src/workbench-sessions.ts` L1-5;对照 v1 spec 1.3 | **不能**把两个 bot 装进同一个官方会话;成员发言必须各开(或复用)自己的 preset 会话 |
| 委托链样板已在:`askBot` create→marks→write→wait idle→read,隐藏标题 `~dsh-bot:` + `kind:hidden` | Read `packages/dsh-bot-host/src/ask.ts`;`marks.ts` L12-16 | 成员轮次复用这条链,再把答案写入**房间 transcript** |
| `listBotSessions` 默认排除 `kind:hidden` | Read `packages/dsh-bot-host/src/workbench-sessions.ts` L76-78 与 list 实现注释 | 成员轮次会话只要打 hidden,1:1 列表默认看不见 |
| 实机:默认 `listBotSessions` 0 条 hidden; `includeHidden` 才见 19 条 askBot `~dsh-bot:` 会话。网关 `createBotSession` 后改 `~dsh-bot-group:` + `kind:hidden` 的校准会话(`session-822eeff1-…`)默认列表不含;查找应走 `session-marks` `group-room:` 而非 listBotSessions | Task 1:`dsh-rpc-who.sh 3084`; `POST /dsh-bot/listBotSessions` 默认 count=64 hidden=0, includeHidden count=83 hidden=19; `listByKind("group-room:calibration")` 命中校准 id | ASM-301 消解为**按 (房间,成员) 复用隐藏会话** |
| 实机 1:1 `history` 项键为 `id/kind/role/seq/text`,**无 author**;加可选 `author` 不影响现投影 | Task 1:`POST /dsh-bot/history` session-5a0ca88e… 三项,`any author` false | 1:1 继续省略 author |
| 运行数据 `env/dsh-bot/` 已 gitignore | Read `.gitignore` L14 | 小组文件放同一目录即可 |
| 参考产品小组形状(只读):roster `isGroup`+`memberIds`;人数上限 6;禁止小组套小组;用户发言后按 @点名决定谁回,无点名则全员;成员轮次顺序按 round 旋转;成员可用 `(pass)` 跳过 | Read `../reference/.../source/host/groups/group-chat.ts` 与 `group-store.ts`(禁拷文案/实现) | 交互目标:同一房间、多作者、点名或全员、一轮接话 |
| 参考产品删组文案形状:删的是组和房间历史,成员 bot 仍可单独用 | Read `../reference/.../frontend/src/production/AgentDeleteConfirmation.tsx` | 对应 BR-306 |
| 工作台非目标已写明「群聊/共享房间不做」 | Read `docs/dsh-bot-workbench/spec.md` §2.8 | 本包是新合同,不回写改 v2 第 2 章;v2 行为保持 1:1 |

### 1.4 假设清单

| 假设 ID | 内容 | 风险 | 确认方式 |
|---|---|---|---|
| ASM-302 | 不引入 SendMessage 工具:成员隐藏会话里的**最后一段 assistant 文本**即为房间可见回复;空串或仅 `(pass)` 视为本轮跳过 | 成员把工具过程说进房间 → 投影只取最终 assistant 文本,thinking/tool 不进房间 | Task 7 单测:tool 行不写入房间 jsonl |
| ASM-303 | MVP **每个用户消息只跑一轮**(点名集合或全员各最多一句);不做参考产品的 3 round / 10 turn 上限循环 | 讨论不够来回 → 用户再发一条即可开下一轮 | 产品选择,Task 7 写死 1 round,README 说明 |

ASM-301 已消解(见 1.3 实机行与 `evidence/phase-0/calibration.md`):按 (房间,成员) 复用隐藏会话;隔离键为 `group-room:<roomId>` + `bot:<memberId>`;默认 `listBotSessions` 不含 hidden。

### 1.5 变更记录

| 日期 | 条目 | 原因 | 影响任务 |
|---|---|---|---|
| 2026-08-30 | ASM-301 消解 | Task 1 实机:默认列表 0 hidden; marks `group-room:` 可找回校准会话 | Task 1/2 完成; Task 7 按复用实现 |

---

## 2. 业务合同

> BR/UF/INV/EVD 唯一定义处。引用工作台合同时用路径 + 描述,不直写其条目编号(本包 ID 闭环)。

### 2.1 BR 业务规则

| 规则 ID | 规则 | 正例 | 反例 | 影响范围 | 验证方式 |
|---|---|---|---|---|---|
| BR-301 | 小组是工作台一等名单实体:存 `$DSH_HOME/dsh-bot/groups.json`,行 `{id,name,memberIds,createdAt}`;**没有自己的 agent preset / persona 文件**;名单与 1:1 bot 合并展示,小组行可区分(拼贴头像) | 重启后小组还在;bots.json 不出现 memberIds | 给小组生成 `dsh-bot--group-xxx` preset | dsh-bot-host | Task 3 单测 + 重启 |
| BR-302 | 成员约束:2–6 个**已有 1:1 bot id**;去重;禁止成员里再放小组 id;创建/改成员时成员必须仍在 bot 注册表 | 选 DSH Bot + 诗人小北成功 | 1 人成组;小组套小组;已删 bot 仍留在成员里 | host + UI 表单 | Task 3/5/12 |
| BR-303 | 一个小组一次只展示**一个房间 transcript**(可「新开对话」另开房间);每条房间消息 `speaker: user \| {kind:member, botId}`;用户右侧、成员左侧且**必须**显示该成员头像+名字 | 同一屏出现两个不同头像的成员回复 | 成员回复看起来都像同一个「助手」 | workbench-ui | UF-302 截图 |
| BR-304 | 用户发送后的一轮:`@姓名`/`@all`/`@everyone` 决定回应者(无点名 = 全员);按 `memberIds` 顺序**串行**各调用该成员 preset 一次;界面显示「{名} 正在发言」;跳过空/(pass);任一轮次失败则房间留下错误条(点名成员+错误码),已成功的成员回复保留 | 「你们是谁?」两人各一句;「@小北 作一首」只有小北 | 两人并行写同一房间文件导致交错损坏;失败吞掉已成功回复 | host 轮次引擎 | UF-302/303 + 失败分支 |
| BR-305 | 成员轮次会话:`kind:hidden` + `kind:dsh-bot` + `bot:<memberId>` + `group:<groupId>` + `group-room:<roomId>`;标题 `~dsh-bot-group:`;**默认不出现**在该成员的 1:1 `listBotSessions` | 开关「包含隐藏」才可能看见 | 诗人小北的 1:1 下拉里出现小组轮次会话 | marks + listBotSessions | Task 1/7 |
| BR-306 | 删小组只删 `groups.json` 行、该组房间 transcript、该组隐藏轮次会话标记目标(尽力归档/不在工作台展示);**不删**成员 bot、其 preset、其 1:1 会话 | 删组后 roster 无该组,两人设私聊仍在 | 删组把诗人小北 preset 目录删掉 | host | UF-305 |
| BR-307 | 1:1 工作台与 v1 委托零回归:`dsh_bot_ask`、单 bot 发消息、页签 iframe、默认 preset 会话行为不变;history 对 1:1 仍可不带 author | 切回 DSH Bot 私聊只见自己的历史 | 1:1 气泡突然出现别人头像 | 全仓 | UF-306 + v1 抽验 |
| BR-308 | 红线延续:不从 `../reference` 拷代码/文案/品牌;轮次系统提示必须**新写**;凭据与 `groups.json`/房间文件不入 git | `rg -i 'anysphere\|sand://' packages/` 空 | 把参考产品 `buildGroupMemberSystemPrompt` 贴进仓 | 全仓 | Task 17 |
| BR-309 | 发送中禁发、loading 防重;小组草稿按 `groupId` 隔离(与 botId 草稿互不串) | 切到 1:1 看不到小组未发送草稿 | 小组草稿出现在诗人小北私聊输入框 | workbench-ui | UF-302/306 |

### 2.2 UF 用户验收场景(索引)

| 场景 ID | Given | When | Then | 角色 | 验证方式 | Evidence |
|---|---|---|---|---|---|---|
| UF-301 | 至少两个人设 | 点「新建小组」、勾选两人、命名、创建 | roster 出现拼贴头像小组行并自动选中,进入空房间 | 本机用户 | browser | EVD-301 |
| UF-302 | 小组已打开(两人) | 不点名发送「你们是谁?」 | 两人按成员顺序各回一句,气泡带各自头像/名字,口吻符合各自人设 | 本机用户 | browser + 房间导出 | EVD-302 |
| UF-303 | 同上 | 发送「@诗人小北 作一句诗」 | 只有小北回复;DSH Bot 本轮无气泡 | 本机用户 | browser | EVD-303 |
| UF-304 | 小组已有两人 | 加人设 3 / 移出一人 | Header 成员条即时变;下一轮按新成员集回应;被移出者 1:1 不受影响 | 本机用户 | browser | EVD-304 |
| UF-305 | 小组存在且聊过 | 删除小组(确认框) | roster 无该组;两人设仍在且私聊还在 | 本机用户 | browser + listBots | EVD-305 |
| UF-306 | 小组与 1:1 都有历史 | 切回某 1:1 bot 发一条 | 只见该 bot 私聊;无小组成员气泡;v1 `dsh_bot_ask` 仍可用 | 本机用户 | browser + RPC | EVD-306 |

### 2.3 核心业务流程(步骤级交互脚本)

#### UF-301: 新建小组

**前置状态**:工作台已开;存在 ≥2 个 1:1 人设。

**成功主路径**:

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 点 roster「+ 新建小组」(或「新建」菜单里的小组) | 弹出表单:名字 + 成员多选(已有 bot) | — | 至少勾 2 人才能提交 |
| 2 | 勾选两人,填「编辑室」,点创建 | 按钮 loading 防重 | `createGroup` 写 groups.json | roster 出现「编辑室」拼贴头像行,自动选中 |
| 3 | — | 右侧进入空房间 | `createGroupSession` 建房间 id | Header 显示组名 + 两成员芯片;composer「给 编辑室 发消息」 |

**失败分支**:

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 成员不足 | 只勾 1 人 | 行内校验,不发请求 | — | 再勾一人 |
| 重名空名 | 名字空 | 行内校验 | — | 补名 |
| 写入失败 | groups.json 不可写 | 表单错误条,roster 无残行 | 不写半行 | 修权限后重试 |

**界面状态机**:

```text
表单 idle → 提交中 → 成功(切入空房间)
      |         |
      v         v
   行内校验   错误条(零残留)
```

**入口接线清单**:

- roster 顶部「+ 新建小组」(`Roster.tsx` 增入口,Task 5)
- `POST /dsh-bot/createGroup`(Task 4)

#### UF-302: 全员一轮发言

**前置状态**:UF-301 成功,空房间。

**成功主路径**:

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 输入「你们是谁?」回车 | 用户气泡上屏;发送禁用 | 房间 append user 消息;解析回应者=全员 | — |
| 2 | — | 「诗人小北 正在发言」(按 memberIds 序) | 隐藏会话 write/wait/read 该成员 preset | 左侧出现小北头像+名+回复 |
| 3 | — | 「DSH Bot 正在发言」 | 同上,下一成员 | 再出现 DSH Bot 气泡,口吻不同 |
| 4 | — | 发送恢复 | 一轮结束 | 工作中点灭 |

**失败分支**:

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 某成员模型失败 | 该成员 override 非法/上游 4xx | 该成员位置错误条(码+名);已成功成员气泡保留 | 不回滚整轮 | 修模型后重发 |
| 网关死 | boot 停 | 错误条 web-unreachable,草稿保留 | 不写损坏 jsonl | 起网关重试 |

**界面状态机**:

```text
idle → 用户已发送 → 成员i发言中 → … → idle
                         |
                         v
                      成员错误(其余已落盘,可再发)
```

**入口接线清单**:

- 小组选中时 composer `groupPrompt`(Task 8/9)
- 轮次引擎 `runGroupRound`(Task 7)

#### UF-303: @点名

**前置状态**:小组两人在房间。

**成功主路径**:

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 输入 `@` 弹出成员列表,选「诗人小北」,补「作一句诗」发送 | 用户气泡含点名 | 回应者={小北} | 只有小北一轮回复 |
| 2 | 发送 `@all 都自我介绍` | — | 回应者=全员 | 行为同 UF-302 |

**失败分支**:

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 点名不存在 | `@幽灵` | 当无有效点名 → 全员(并 toast「未匹配成员,已发给全员」) | 不静默 | 用户改用列表点选 |
| 点名已移出成员 | `@旧成员` | 忽略该 handle | 只问仍在组内的匹配 | — |

**界面状态机**: composer `@` 菜单 open/close;发送后同 UF-302 子集。

**入口接线清单**:

- Composer `@` 菜单(Task 11)
- `parseMentions`(Task 7/11)

#### UF-304: 增减成员

**前置状态**:小组两人。

**成功主路径**:

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | Header「成员」或行菜单「编辑成员」 | 弹出多选,当前两人勾选 | — | — |
| 2 | 再勾人设 3,保存 | 按钮 loading | `updateGroup` 写 memberIds | Header 三芯片;拼贴头像更新 |
| 3 | 再发一条不点名 | 三人轮次 | 按新列表 | 第三人也开口 |
| 4 | 移出人设 3 | 芯片减少 | 下一轮不再问他 | 人设 3 的 1:1 历史不动 |

**失败分支**:

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 减到 1 人 | 只留 1 勾选 | 校验拒绝保存 | 不写盘 | 至少 2 人 |
| 进行中改成员 | 一轮未结束 | 保存禁用或排队到本轮结束后应用 | 本轮仍用开始时快照 | 等一轮结束 |

**界面状态机**: idle ⇄ 编辑成员 ⇄ 保存中。

**入口接线清单**: Header 成员条 / 行菜单(Task 12)+ `POST /dsh-bot/updateGroup`。

#### UF-305: 删除小组

**前置状态**:小组有房间消息。

**成功主路径**:

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 行菜单「删除小组」 | 确认框:组删掉、成员 bot 保留 | — | — |
| 2 | 确认 | roster 移除该行,选中回退到某 1:1 | 删 groups 行 + 房间文件 | 两人设仍在;私聊还在 |

**失败分支**:

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 取消 | 点取消 | 无变化 | — | — |
| 删除失败 | 文件锁 | 错误条,行仍在 | 不半删 | 重试 |

**界面状态机**: 确认 → 删除中 → 已移除 | 错误。

**入口接线清单**: roster 行菜单(Task 5/13)+ `deleteGroup`。

#### UF-306: 1:1 零回归

**前置状态**:小组与 DSH Bot 私聊都有历史。

**成功主路径**:

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 点 roster「DSH Bot」 | Header 回到单身份;transcript 无私聊以外的成员气泡 | 走既有 `listBotSessions/history/prompt` | 私聊连续 |
| 2 | 发一条 | 单 bot 回复,助手侧无第二头像 | 不跑轮次引擎 | 与工作台交付时一致 |
| 3 | 官方会话里调 `dsh_bot_ask` | 工具卡片完成 | v1 链 | 答案返回 |

**失败分支**: 网关死 / 无凭据 — 沿用工作台 1:1 既有错误态,本包不改语义。

**界面状态机**: 选中 1:1 时不进入 group composer。

**入口接线清单**: 既有 roster `onSelect`(Task 9 分支: `item.kind === 'group'` 才走小组面)。

### 2.4 INV 不变量

| 不变量 ID | 内容 | 关联 BR/UF | 验证方式 |
|---|---|---|---|
| INV-301 | 工作台 1:1:选中非小组行时 API/UI 与 `../dsh-bot-workbench/spec.md` 交付行为一致 | BR-307, UF-306 | Task 13/16 |
| INV-302 | v1 `dsh_bot_ask` / `dsh-bot.model` / 页签 id `dsh-bot:sessions` / `:3084` 一口 | BR-307 | Task 16 v1 抽验 |
| INV-303 | 不改邻仓;不改官方 DSH npm 包 | BR-308 | Task 17 porcelain |
| INV-304 | `groups.json`、房间 jsonl、隐藏轮次会话数据不入 git | BR-308 | gitignore + status |

### 2.5 EVD 证据清单

| 证据 ID | 类型 | 期望证据 | 保存位置 |
|---|---|---|---|
| EVD-301 | screenshot | 建组后 roster 拼贴行 + 空房间 Header 芯片 | `evidence/UF-301/create-group.png` |
| EVD-302 | screenshot+json | 全员一轮两作者气泡 + 房间导出 | `evidence/UF-302/round.png` + `room-export.json` |
| EVD-303 | screenshot | @点名后仅一成员回复 | `evidence/UF-303/mention.png` |
| EVD-304 | screenshot | 加人前后 Header 芯片 | `evidence/UF-304/members.png` |
| EVD-305 | screenshot+log | 删组后 listBots 仍含成员 | `evidence/UF-305/delete.png` + `list-bots.txt` |
| EVD-306 | screenshot+log | 1:1 私聊无小组成员气泡;`dsh_bot_ask` pong | `evidence/UF-306/one-on-one.png` + `v1-ask.log` |
| EVD-307 | log | build/typecheck/test/standard:check | `evidence/phase-4/final-regression.log` |

### 2.6 角色与权限矩阵

单一本机用户,loopback,无权限差异。会话边界仍由 session-tool caller fence 承担。

### 2.7 负向 / 破坏性场景

| 场景 | Given | When | Then | Evidence |
|---|---|---|---|---|
| 成员不足 | 表单只勾 1 人 | 创建/保存 | 校验拒绝 | `evidence/UF-301/too-few.md` |
| 一轮中途失败 | 第二成员上游错误 | 全员发送 | 第一成员气泡保留 + 错误条 | `evidence/UF-302/member-fail.md` |
| 网关死 | boot 停 | 发送 | web-unreachable,草稿保留 | `evidence/UF-302/gateway-down.md` |
| 重复提交 | 连点发送 | 一轮进行中 | 第二次不发 | `evidence/UF-302/double-submit.md` |
| 旧数据 | 无 groups.json | 首次打开工作台 | 仅 1:1 名单,不报错 | `evidence/UF-301/first-run.md` |

### 2.8 非目标

- **官方单会话多人设**:平台 `session.create` 只带一个 preset,不改官方包。
- **跨用户共享房间 / 远程成员**:参考产品 `sharedRoom`/`remoteMembers`,本机单用户不做。
- **多轮自动辩论**(3 round):MVP 用户每发一条开一轮。
- **SendMessage 专有工具 / (pass) 文案照抄**:语义可跳过空回复,文案自写。
- **token 流式、群 reactions、Computer 面**:沿工作台非目标。

---

## 3. 技术方案

### 3.1 架构 Before / After

```text
Before(工作台 v2):
  bots.json ── 1:1 bot ── session.create(preset) ── transcript(无 author)
  roster 全是 bot 行

After:
  bots.json 不变
  groups.json ── 小组 {memberIds}
  房间 jsonl ── speaker user|member
  用户发送 ── 轮次引擎 ── 对每个回应者:
       隐藏 session(该成员 preset) write/wait/read
       把最终 assistant 文本 append 进房间 jsonl
  roster = bot 行 + group 行(拼贴头像)
  选中 group → 小组对话面(多作者气泡)
  选中 bot  → 既有 1:1 面
```

### 3.2 模块改造

| 模块 | 职责 | 改造说明 |
|---|---|---|
| `packages/dsh-bot-host/src/groups.ts` | groups.json 读写、成员校验、房间文件 | 新建;原子写;2–6 成员;禁嵌套 |
| `packages/dsh-bot-host/src/group-engine.ts` | 点名解析 + 一轮串行 + pass 跳过 | 新建;系统提示原创 |
| `packages/dsh-bot-host/src/workbench-routes.ts` | 增 group CRUD / groupSession / 小组走 prompt 分支 | 扩展 dispatch |
| `packages/dsh-bot-host/src/workbench-sessions.ts` | HistoryItem 可选 `author`;1:1 不填 | 扩展,测 1:1 不回归 |
| `packages/dsh-bot-host/src/marks.ts` | `groupMark` / `groupRoomMark` | 扩展 |
| `packages/workbench-ui/src/Roster.tsx` | 小组行 + 新建小组入口 | 扩展 |
| `packages/workbench-ui/src/GroupForm.tsx` | 创建/编辑成员 | 新建 |
| `packages/workbench-ui/src/Transcript.tsx` | group 模式渲染 author 头像+名 | 扩展 |
| `packages/workbench-ui/src/Conversation.tsx` | 选中 group 走小组 session API | 扩展 |
| `packages/workbench-ui/src/Composer.tsx` | `@` 菜单;group 草稿 key | 扩展 |
| `scripts/manual-test.sh` | createGroup→prompt→mention→delete | 扩展 |
| `.gitignore` | `env/dsh-bot/groups.json` 已在目录忽略下 | 核对 |

### 3.3 三段式定位清单

| 文件 | 稳定定位 | 搜索定位 | 行号 hint | 备注 |
|---|---|---|---|---|
| `packages/dsh-bot-host/src/bots.ts` | `export interface BotRegistryRow` | `rg "BotRegistryRow" packages/dsh-bot-host/src/bots.ts` | L48 | 既有:不要往 bots[] 塞小组 |
| `packages/dsh-bot-host/src/workbench-sessions.ts` | `export interface WorkbenchHistoryItem` | `rg "WorkbenchHistoryItem" packages/dsh-bot-host/src/workbench-sessions.ts` | L90 | 既有:加可选 author |
| `packages/dsh-bot-host/src/workbench-routes.ts` | `dispatchWorkbenchApi` | `rg "dispatchWorkbenchApi" packages/dsh-bot-host/src/workbench-routes.ts` | L162 | 既有:并列 case |
| `packages/dsh-bot-host/src/ask.ts` | `export async function askBot` | `rg "export async function askBot" packages/dsh-bot-host/src/ask.ts` | — | 样板:隐藏委托链 |
| `packages/dsh-bot-host/src/marks.ts` | `export function botMark` | `rg "function botMark" packages/dsh-bot-host/src/marks.ts` | L22 | 既有:仿写 groupMark |
| `packages/workbench-ui/src/Roster.tsx` | `export function Roster` | `rg "export function Roster" packages/workbench-ui/src/Roster.tsx` | L42 | 既有:增 kind |
| `packages/workbench-ui/src/Transcript.tsx` | `function TranscriptRow` | `rg "function TranscriptRow" packages/workbench-ui/src/Transcript.tsx` | L63 | 既有:group 显示 author |
| `packages/workbench-ui/src/Conversation.tsx` | `export function Conversation` | `rg "export function Conversation" packages/workbench-ui/src/Conversation.tsx` | L49 | 既有:按 kind 分支 |
| `packages/workbench-ui/src/api.ts` | `export async function workbenchCall` | `rg "workbenchCall" packages/workbench-ui/src/api.ts` | L17 | 既有:加 group 方法 |
| `packages/dsh-bot-host/src/groups.ts` | 新建:`readGroups` | 建成后 `rg -F "groups.json" packages/dsh-bot-host/src/groups.ts` | 新建 | Task 3 |
| `packages/dsh-bot-host/src/group-engine.ts` | 新建:`runGroupRound` | 建成后 `rg -F "runGroupRound" packages/dsh-bot-host/src/group-engine.ts` | 新建 | Task 7 |

### 3.4 API / 数据 / 权限 / 路由影响

| 类型 | 是否影响 | 说明 | 兼容策略 |
|---|---|---|---|
| API | 新增 | `listGroups/createGroup/updateGroup/deleteGroup/createGroupSession/listGroupSessions`;`history/prompt` 若 session 是房间则走引擎 | 旧方法不变 |
| 数据 | 新增 | `groups.json`;`env/dsh-bot/rooms/<roomId>.jsonl`;marks `group:` | 运行数据 gitignore |
| 权限 | 否 | loopback | — |
| 路由 | 否 | 仍 :3084 `/dsh-bot/*` | — |

---

## 4. Phase 计划与任务详情

> Phase 依赖链:

```text
P0 校准隐藏会话与 history 扩展点 → P1 注册表+roster 空组
  → P2 轮次引擎+多作者对话面 → P3 点名/成员/1:1 回归 → P4 5.2 收尾
```

> 实现任务数 ≥ 8 → `tasks.csv`。状态枚举:待开始 / 进行中 / 已完成 / 已阻塞:原因。

### Phase 0: 校准

> 你在哪里:工作台 1:1 可用,无小组。
> 做完之后:ASM-301 有结论;history 扩展策略写进 1.3。

### Task 1: 校准隐藏轮次会话与 history 形状

- **关联**:ASM-301 / BR-305 / BR-307(UF 无:校准)
- **前置任务**:无
- **风险等级**:P1

**为什么做**:轮次会话若漏进 1:1 列表,产品直接错;history 加 author 若弄坏 1:1 单测也会回归失败。

**涉及文件与定位**:`workbench-sessions.ts` `listBotSessions`;`ask.ts` 隐藏会话。

**具体操作**:

1. 用现网关建一个 `kind:hidden` + `bot:dsh-bot` 会话,确认默认 `listBotSessions` 不含它、勾选包含隐藏才见。
2. 读 1:1 `history` 响应样例,确定可选 `author` 字段向后兼容。
3. 结论回写 1.3,消解 ASM-301 或改「每轮新建」。

**验证**:`dsh-rpc.sh`/`curl listBotSessions` 默认不含 hidden → 期望空匹配

**Evidence**:`evidence/phase-0/calibration.md`

**注意事项**:打 RPC 前 `dsh-rpc-who.sh 3084`。

### Task 2: 执行 Phase 0 回归验证

- **关联**:本 Phase 全部
- **前置任务**:1

**验证**:校准文存在且 ASM-301 已消解或改写

**Evidence**:`evidence/phase-0/phase-summary.md`

### Phase 1: 小组注册表与空房间壳

> 你在哪里:机制校准完。
> 做完之后:能建空小组并在 roster 看到,还不能群聊。

### Task 3: groups 注册表

- **关联**:BR-301 / BR-302 / BR-306
- **前置任务**:2
- **风险等级**:P0

**为什么做**:小组身份与成员集的唯一事实源。

**涉及文件与定位**:新建 `packages/dsh-bot-host/src/groups.ts`;不要改 `BotRegistryRow` 形状。

**具体操作**:

1. `$DSH_HOME/dsh-bot/groups.json` 原子写;缺省 `[]`。
2. create:校验 2–6、去重、成员都是现存 bot、不是 group id;slug id。
3. update 成员同样校验;delete 只去组行(房间文件删除在 Task 13 可复用这里)。
4. 单测:不足/嵌套/缺 bot/默认文件损坏不崩。

**验证**:`pnpm --filter dsh-bot-host test` 含 groups 用例全绿

**Evidence**:`evidence/phase-1/groups-unit.log`

**注意事项**:损坏 json 报错不覆盖 bots.json。

### Task 4: host 小组 HTTP API

- **关联**:BR-301 / UF-301
- **前置任务**:3
- **风险等级**:P1

**为什么做**:UI 入口。

**涉及文件与定位**:`workbench-routes.ts` `dispatchWorkbenchApi`;`index.ts` 服务面。

**具体操作**:

1. POST `listGroups/createGroup/updateGroup/deleteGroup/createGroupSession/listGroupSessions`,wire 仍 `{args}/{ok,value|error}`。
2. `createGroupSession` 分配 roomId,建空 jsonl。
3. 单测 stub fs。

**验证**:boot 后 curl createGroup → listGroups 含新行

**Evidence**:`evidence/phase-1/api.log`

**注意事项**:未知 method 仍回落 v1 switch。

### Task 5: roster 小组行与创建表单

- **关联**:BR-301 / BR-302 / UF-301 / BR-309
- **前置任务**:4
- **风险等级**:P1

**为什么做**:用户看见「这是小组不是人设」。

**涉及文件与定位**:`Roster.tsx`、新建 `GroupForm.tsx`、`App.tsx` 合并 listBots+listGroups、`avatar.ts` 拼贴。

**具体操作**:

1. 行:`kind:group` 时 2–4 个小圆拼贴;名字;预览;时间。
2. 「+ 新建小组」→ 成员多选 + 名字;loading 防重;校验 2–6。
3. 选中小组进入空 Conversation 壳(先可空态,发消息下一 Phase)。
4. 组件单测。

**验证**:`pnpm --filter workbench-ui test` 全绿;浏览器建组见拼贴行

**Evidence**:`evidence/UF-301/create-group.png`(可先壳)+ `evidence/phase-1/roster-unit.log`

**注意事项**:不要改 1:1 行的选中/菜单默认 bot 禁删。

### Task 6: 执行 Phase 1 回归验证

- **关联**:UF-301 主路径壳
- **前置任务**:5

**验证**:`pnpm -r test` + 浏览器建组空房间

**Evidence**:`evidence/phase-1/phase-summary.md`

### Phase 2: 房间与轮次

> 你在哪里:空组能建。
> 做完之后:发一条,房间里出现两个身份的回复。

### Task 7: 轮次引擎

- **关联**:BR-304 / BR-305 / BR-308 / ASM-302 / ASM-303
- **前置任务**:6
- **风险等级**:P0

**为什么做**:小组对话的后端本体。

**涉及文件与定位**:新建 `group-engine.ts`;复用 `ask.ts` 隐藏链形状,不复制参考产品 prompt。

**具体操作**:

1. `runGroupRound({roomId, userText})`:append user;resolve responders;for 每成员:确保隐藏会话(ASM-301 结论)→ 原创系统/轮次提示(成员名、同伴名、房间最近 N 条、轮到你)→ wait idle → 取最后 assistant 文本。
2. 空/(pass)(大小写)跳过;失败抛该成员错误但不丢已 append 的消息。
3. 一轮即停(ASM-303)。
4. 单测 stub sessionTool:全员两句、点名一句、pass 跳过、tool 行不进房间、失败保留先成功。

**验证**:`pnpm --filter dsh-bot-host test` 引擎用例全绿

**Evidence**:`evidence/phase-2/engine-unit.log`

**注意事项**:禁止把参考树 `buildGroupMemberSystemPrompt` 贴进来。

### Task 8: 小组 prompt/history 接线

- **关联**:BR-303 / BR-304 / UF-302
- **前置任务**:7
- **风险等级**:P0

**为什么做**:HTTP 与文件落地。

**涉及文件与定位**:`workbench-routes.ts`;history 对 roomId 读 jsonl;prompt 识别房间走引擎。

**具体操作**:

1. 房间 jsonl 原子 append。
2. `WorkbenchHistoryItem.author?: {botId,name,avatar}`。
3. 1:1 history 不加 author。
4. curl:createGroupSession→group prompt→history 含两条 member。

**验证**:curl history 两条不同 botId

**Evidence**:`evidence/phase-2/session-api.log`

**注意事项**:并发 prompt 同房间排队(已有 promptLocks 可按 roomId 扩)。

### Task 9: 对话面多作者与工作中

- **关联**:BR-303 / BR-304 / BR-309 / UF-302
- **前置任务**:8
- **风险等级**:P1

**为什么做**:用户看见「这是小组 conversation」。

**涉及文件与定位**:`Conversation.tsx`、`Transcript.tsx`、`Composer.tsx`。

**具体操作**:

1. 选中 group:Header 组名+成员芯片;「新开对话」新房间。
2. Transcript:member 消息左侧头像+名;user 仍右侧;「{名} 正在发言」。
3. 一轮中禁发;草稿 key=`group:<id>`。
4. 组件单测 fixture 两作者。

**验证**:`pnpm --filter workbench-ui test` + 浏览器 UF-302 主路径

**Evidence**:`evidence/UF-302/round.png`

**注意事项**:1:1 助手侧仍不画大头像(沿用工作台对话呈现契约)。

### Task 10: 执行 Phase 2 回归验证

- **关联**:UF-302
- **前置任务**:9

**验证**:`pnpm -r test` + 两人设口吻可区分的导出

**Evidence**:`evidence/phase-2/phase-summary.md` + `evidence/UF-302/room-export.json`

### Phase 3: 点名、成员、回归

### Task 11: @点名

- **关联**:BR-304 / UF-303
- **前置任务**:10
- **风险等级**:P1

**具体操作**:Composer `@` 菜单列成员;解析姓名/去空格/首词;@all/@everyone=全员;无匹配 toast 后全员。

**验证**:浏览器 UF-303;单测 parseMentions

**Evidence**:`evidence/UF-303/mention.png`

**注意事项**:中文名 `@诗人小北` 要能匹配。

### Task 12: 增减成员

- **关联**:BR-302 / UF-304
- **前置任务**:11
- **风险等级**:P1

**具体操作**:Header/菜单打开 GroupForm 编辑;一轮进行中禁用保存;保存后芯片与下一轮集合更新。

**验证**:UF-304 截图

**Evidence**:`evidence/UF-304/members.png`

**注意事项**:本轮用开始快照,避免中途成员集变化。

### Task 13: 删除小组与 1:1/v1 回归

- **关联**:BR-306 / BR-307 / UF-305 / UF-306 / INV-301 / INV-302
- **前置任务**:12
- **风险等级**:P1

**具体操作**:确认框文案自写(成员保留);删组;核对 1:1 历史与 `dsh_bot_ask`。

**验证**:listBots 仍有成员;私聊截图;ask 工具成功

**Evidence**:`evidence/UF-305/` + `evidence/UF-306/`

**注意事项**:禁止删 `dsh-bot--` 成员 preset。

### Task 14: 执行 Phase 3 回归验证

- **关联**:UF-301–306 主路径
- **前置任务**:13

**验证**:`pnpm -r run build && pnpm -r test` + 六条主路径复现

**Evidence**:`evidence/phase-3/phase-summary.md`

### Phase 4: 收尾与真实验收

### Task 15: standards、manual-test、README

- **关联**:BR-308 / INV-304
- **前置任务**:14
- **风险等级**:P2

**具体操作**:manual-test 增 createGroup→prompt→mention→delete;`standard:check` 仍 0 FAIL;README 写小组入口、一轮语义、@all、删组不影响私聊。

**验证**:`pnpm run standard:check`;`bash scripts/manual-test.sh --no-write` 含新步

**Evidence**:`evidence/phase-4/standard-check.log` + `manual-test.log` + `docs-diff.md`

### Task 16: 执行 spec 5.2 真实场景全套测试

- **关联**:全部用户可见 UF
- **前置任务**:15
- **风险等级**:P0

**验证**:5.2 矩阵逐行回放全过;二次 `validate_package.py docs/dsh-bot-group-chat`

**Evidence**:`evidence/UF-301/`…`UF-306/`

### Task 17: 执行 Phase 4 回归验证(总收尾)

- **关联**:INV-301–304 / BR-308
- **前置任务**:16

**验证**:build/typecheck/test/standard:check;邻仓 porcelain;红线 rg;无运行数据入 git

**Evidence**:`evidence/phase-4/phase-summary.md`

---

## 5. 验收与 Review 协议

> 命令级只是入场券。5.2 全过才算完成。

### 5.1 命令级验证(入场券)

| 验证项 | 命令 | 期望 | Evidence |
|---|---|---|---|
| 构建 | `pnpm -r run build` | 全包成功 | EVD-307 |
| 类型 | `pnpm -r run typecheck` | 0 error | EVD-307 |
| 单测 | `pnpm -r test` | 全绿 | EVD-307 |
| 标准面 | `pnpm run standard:check` | 0 FAIL | EVD-307 |
| 包校验 | `python3 ~/.agents/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-group-chat` | 0 FAIL | EVD-307 |

### 5.2 真实场景全套测试(Real-Run,完成的唯一标准)

**环境准备**:

| 项 | 值 |
|---|---|
| 启动命令 | `cd <本仓> && pnpm -r run build && sh env/boot.sh`(已起则先核 `dsh-rpc-who.sh 3084`) |
| 访问入口 | `http://127.0.0.1:3084/dsh-bot/ui`;RPC `dsh-rpc.sh 3084`;`POST /dsh-bot/<method>` |
| 测试账号/数据 | 至少两个人设(可现场新建「诗人小北」);模型凭据沿用 v1 env |
| 干净状态定义 | 不必清空全部 1:1;小组相关 `groups.json`/rooms 可单独清 |
| 可用测试工具 | chrome-devtools MCP / Playwright;RPC 直跑 |

**执行矩阵**:

| UF | 执行方式 | 操作来源 | 必须核对的点 | Evidence |
|---|---|---|---|---|
| UF-301 主路径 | browser | 2.3 UF-301 | 拼贴行+空房间芯片 | `evidence/UF-301/create-group.png` |
| UF-301 成员不足 | browser | 2.3 失败分支 | 校验不发请求 | `evidence/UF-301/too-few.md` |
| UF-301 首次无组 | browser | 2.7 旧数据 | 仅 1:1,不报错 | `evidence/UF-301/first-run.md` |
| UF-302 主路径 | browser | 2.3 UF-302 | 两作者气泡+口吻 | `evidence/UF-302/round.png` + `room-export.json` |
| UF-302 成员失败 | 配坏第二成员模型或 stub | 2.3 失败 | 第一句保留+错误条 | `evidence/UF-302/member-fail.md` |
| UF-302 网关死 | 停 boot | 2.3 | web-unreachable 留草稿 | `evidence/UF-302/gateway-down.md` |
| UF-302 防重 | browser | 2.7 | 连点一轮 | `evidence/UF-302/double-submit.md` |
| UF-303 主路径 | browser | 2.3 UF-303 | 仅被点名者回复 | `evidence/UF-303/mention.png` |
| UF-303 未匹配 | browser | 2.3 | toast 后全员 | `evidence/UF-303/unmatched.md` |
| UF-304 主路径 | browser | 2.3 UF-304 | 芯片与下一轮集合 | `evidence/UF-304/members.png` |
| UF-304 减到 1 人 | browser | 2.3 | 拒绝保存 | `evidence/UF-304/too-few.md` |
| UF-305 主路径 | browser | 2.3 UF-305 | 组消失、私聊在 | `evidence/UF-305/delete.png` + `list-bots.txt` |
| UF-306 主路径 | browser+RPC | 2.3 UF-306 | 1:1 无他人气泡;ask 成功 | `evidence/UF-306/one-on-one.png` + `v1-ask.log` |

**通过标准**:矩阵全部行通过且 evidence 齐全。

### 5.3 Evidence 目录结构与命名

```text
docs/dsh-bot-group-chat/evidence/
  phase-0/ … phase-4/
  UF-301/ … UF-306/
```

### 5.4 Review 专项检查清单

- [ ] 房间里两成员头像/名字可分,不是同一个助手气泡
- [ ] 隐藏轮次会话默认不在 1:1 下拉
- [ ] 删组不删成员 preset
- [ ] 1:1 助手侧仍无大头像
- [ ] 轮次提示文案非参考树拷贝
- [ ] 5.2 全过;入口接线可达
- [ ] BR/UF/INV 对照第 2 章核销
