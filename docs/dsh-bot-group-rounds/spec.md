# dsh-bot-group-rounds Spec

> Version: 0.1.0 | Date: 2026-09-01 | Status: Ready 可执行
>
> 本文件是本需求的**唯一事实源**。五期包:在小组对话(`../dsh-bot-group-chat/spec.md`,Done)之上做「多轮讨论与房间管理」。
> 由母包 `../dsh-bot-interaction-master/spec.md` 统筹(先 `../dsh-bot-session-nav/` 后本包)。
> 参考树 `../../../reference` 只读:轮次上限/轮转等**数值与调度形状**可对齐,实现与提示词必须自写,禁拷代码/文案/品牌。
>
> 填写三态规则:每个表格单元格只允许三种内容——
> 1. 验证过的事实(注明来源命令);2. 显式假设 `ASM-xxx`;3. `待勘察`。

---

## 0. 一页纸人话摘要

- **给谁 / 场景**:已在用工作台小组对话的用户。现在的小组是"广播":你说一句,每个成员各回一句就散了——成员之间没有来回;发言时看不到谁排在后面;某个成员失败只能整轮重发;房间连名字都没有(叫「房间 822eeff1」)。
- **做什么**:把小组对话升级成"开会":
  1. **多轮讨论**:小组可设 1-3 轮(默认 1 轮不变)。第 2 轮起成员会针对同伴刚说的话接着聊;每轮发言起点轮换;全员没新话说就提前散会;
  2. **继续讨论**:房间里加一个按钮,不用你再说话也能让他们再聊一轮;
  3. **看得见的队列**:成员芯片显示 已发言✓/正在发言/排队中 和轮次进度;
  4. **讨论中也能打字**:进行中发送会排队,本轮结束自动送出(可取消);
  5. **单成员重试**:谁失败点谁重试,不用整轮重来;
  6. **回复即点名**:点某条成员发言的「回复」,下一轮优先他接话;
  7. **房间有名字**:首条消息自动起题,可重命名、可删除房间;roster 上小组"工作中"状态是真的。
- **改哪里**:只改本仓——`dsh-bot-host`(轮次引擎/队列/房间元数据)、`workbench-ui`(队列指示/回复/排队/房间管理)。
- **怎么算做完**:两人小组设 2 轮,发「你们讨论下这个标题好不好」→ 同一房间先后出现 4 条成员发言,第二轮明显在回应第一轮;讨论中排队一条消息轮末自动送出;删房间不伤 1:1;默认 1 轮时行为与三期验收完全一致;5.2 矩阵全过。
- **不做什么**:成员并行发言(保持串行,讨论才连贯)、SendMessage 专有工具、跨用户共享房间、token 流式(后续包)。

---

## 1. 事实基线与假设

### 1.1 需求与运行模式

| 项 | 结论 |
|---|---|
| 原始需求 | 「涉及到 conversation 小组讨论的,是不是还需要优化」+ 调研结论:参考产品是 3 轮内自动接话的会议,我们是一轮广播(2026-09-01 会话) |
| 输入类型 | description(用户反馈 + 调研报告 + 参考产品调度形状) |
| Mode | oneclick(新包;v3 包保持 Done 不改) |
| 置信度 | 高(引擎/房间/隐藏会话链全部是本仓已交付代码;剩余 3 条 ASM 由 P0 校准消解) |
| 输出目录 | `docs/dsh-bot-group-rounds/` |

### 1.2 任务类型路由

| 维度 | 结论 |
|---|---|
| 任务类型 | backend(多轮调度/队列/房间元数据)+ frontend(队列指示/回复/排队/房间管理) |
| 主要风险 | 多轮延迟叠加(每成员每轮一次模型调用);排队与既有 per-session 锁的交互;旧房间 jsonl 兼容 |
| 行号引用策略 | 既有文件 symbol+rg,行号仅 hint;新建文件标「新建」 |
| 必需验收方式 | browser 真实点击 + 房间导出对比 + RPC/CLI 取证 + host/ui 单测 |
| 必须覆盖用户场景 | UF-501 多轮、UF-502 继续讨论、UF-503 引用回复、UF-504 轮内排队、UF-505 单成员重试、UF-506 房间管理、UF-507 零回归 |

### 1.3 勘察事实清单

> 本轮实际执行命令(2026-09-01 本会话)。路径相对本仓根。

| 事实 | 来源命令 | 输出摘要 |
|---|---|---|
| 现引擎一次 `prompt` = 一轮,成员按名单序**串行**;`runGroupRound`(L306)、pass 判定 `isSkipReply`(L158)、正文净化 `toRoomSpeech`(L215)、房间上下文喂给成员 `ROOM_TRANSCRIPT_MAX = 24`(L32) | `rg -n 'ROOM_TRANSCRIPT_MAX\|export async function runGroupRound\|toRoomSpeech\|isSkipReply' packages/dsh-bot-host/src/group-engine.ts` | 多轮调度器在此扩展 |
| 点名解析在 host:`parseMentions`(L122,`@[^\s@]+` 全局匹配;无点名/未匹配 → 全员) | `rg -n 'parseMentions' packages/dsh-bot-host/src/group-engine.ts` | 引用回复的解析优先级挂这里 |
| 房间数据形状:`GroupRegistryRow`(L22)、`GroupRoomRow`(L51)、`RoomMessage`(L67)、`RoomHeader`(L76,`{type,roomId,groupId,createdAt}` 无 title)、`RoomState`(L83)、`GroupsRuntime`(L88);成员 2-6(`GROUP_MEMBER_MIN/MAX` L14-15) | `rg -n 'export (function\|async function\|interface\|const)' packages/dsh-bot-host/src/groups.ts` | 房间标题需新增行类型(append-only,见 BR-507) |
| 房间在 UI 的标题是硬拼占位:`roomsToSessions` 生成 `房间 {roomId 前 8 位}`,`working: false` 写死;App 对未选中小组同样 `working: false` | Read `packages/workbench-ui/src/Conversation.tsx`(L85-96);Read `packages/workbench-ui/src/App.tsx`(L188-197) | UF-506 起题与 working 真值的改造对象 |
| 发言指示已有:`TypingIndicator` 显示「(发言人名) 正在发言」(L70-73);成员 chips 有 `isSpeaking` 态 | `rg -n 'function TranscriptRow\|author\|speaking' packages/workbench-ui/src/Transcript.tsx`;Read `Conversation.tsx`(memberChips 区) | 队列可视化在 chips 上扩展 |
| composer 已有 `@` 菜单(`mentionQuery` L6)与按 group 隔离草稿(`storageKey` L20-84) | `rg -n 'draftStorageKey\|mention\|storageKey' packages/workbench-ui/src/Composer.tsx` | 回复 pill 与排队挂 composer |
| 每会话写锁 `promptLocks`(L42-47)按 sessionId 串行;房间 prompt 经 `runGroupRound` | `rg -n -i 'lock' packages/dsh-bot-host/src/workbench-sessions.ts` | 排队底座;房间级锁行为待实测(ASM-501) |
| workbench API 现有 group 面:`createGroupSession`(L215)、`listGroupSessions`(L220) | `rg -n "case '" packages/dsh-bot-host/src/workbench-routes.ts` | 新方法并列追加 |
| 成员轮次走隐藏会话(`~dsh-bot-group:` + `kind:hidden` + `group-room:` marks),复用按 (房间,成员);隐藏会话 wake 写入"同伴刚说的话",无协议标识;不出现在 1:1 列表(含 includeHidden) | `../dsh-bot-group-chat/spec.md` 1.3 实机行与其变更记录(2026-08-31 三条) | 多轮 = 复用同一链,每轮再 wake 一次 |
| 参考产品调度形状(只读,数值可对齐、实现自写):`GROUP_MAX_ROUNDS = 3`、`GROUP_MAX_MEMBER_TURNS = 10`、`GROUP_MAX_MESSAGES_PER_TURN = 2`、`GROUP_PROMPT_HISTORY_LIMIT = 24`;每轮起点轮转 `orderRoundSpeakers`(round 偏移取模) | `rg -n 'GROUP_MAX_ROUNDS\|orderRoundSpeakers' ../reference/extracted/grok-bot-0.18-reconstructed-main/source/host/groups/group-chat.ts`(相对仓外参考树) | 本包取 rounds≤3、总发言 ≤10、轮转;每成员每轮 1 条(差异见 BR-501 备注) |
| 房间 jsonl 消息行形状 `{type:'message', id, seq, speaker, text, createdAt}`,speaker = `user \| member \| error` | `../dsh-bot-group-chat/spec.md` 3.2 与其 Task 8(已验收) | title/resolved 新行类型按 append-only 追加 |
| 网关 :3084/profile gb、浏览器 MCP、Playwright 全部在 v2/v3 验收实证可用 | `../dsh-bot-workbench/spec.md` 5.2 环境准备(已验收) | 5.2 环境沿用 |

### 1.4 假设清单

| 假设 ID | 内容 | 风险 | 确认方式 |
|---|---|---|---|
| ASM-501 | 讨论进行中对同一房间再次 `prompt` 的现行为是"排队或拒绝"而非交错写入(UI 侧 `composerLocked` 已禁发,host 侧行为未实测);轮内排队将实现为 host 内存 `roundQueue`(FIFO ≤3,网关重启即清空,合同写明边界) | 若 host 现状允许交错 → 先加房间级锁再做队列 | Task 1 连发两条实测 + 读 prompt 分发代码 |
| ASM-502 | 引擎运行态(当前轮/发言人/队列/进度)经四期包 `overview` 暴露给 roster(母包保证四期先行);四期被阻时降级为本包独立 `groupStatus {roomId}` 方法,UI 两通道等价 | 四期 overview 形状不合 → 用独立方法,roster 接入点不变 | Task 1 查四期板面与 overview 字段 |
| ASM-503 | 房间 jsonl 读取/投影对未知行类型向后兼容(忽略非 message 行),新增 `title`/`resolved` 行不会破坏旧读取器 | 白名单式读取 → Task 8 同步放宽读取器并补旧文件回归单测 | Task 1 读 `groups.ts` 投影实现 + 构造混合行 fixture 实测 |

### 1.5 变更记录

| 日期 | 变更条目 ID | 原因 | 影响任务与处置 |
|---|---|---|---|
| 2026-09-01 | 初版 | — | — |

---

## 2. 业务合同

> BR/UF/INV/EVD 唯一定义处。引用既有包合同用路径 + 描述(本包编号闭环)。

### 2.1 BR 业务规则

| 规则 ID | 规则 | 正例 | 反例 | 影响范围 | 验证方式 |
|---|---|---|---|---|---|
| BR-501 | 多轮讨论:小组行新增 `rounds`(1-3,缺省 1,存 groups.json 向后兼容);一次讨论 = 解析回应者集合(点名集或全员,整场固定)→ 第 1..R 轮,每轮回应者按轮转起点(`round` 偏移取模)串行各发**最多 1 条**可见消息;第 2 轮起仅"自己上次发言后房间有新内容"的成员发言;空/pass 跳过,连续一整轮全员 pass 提前散会;全场可见成员发言总数 ≤10 硬上限;每轮成员 wake 只带其上次发言以来的新消息(沿三期机制)。**与参考差异**:每成员每轮 1 条(参考为 2,因其有 SendMessage 多次出口,我们无),README 写明 | 2 人 2 轮 →最多 4 条成员发言,第二轮回应第一轮 | 第二轮成员复读第一轮;pass 后仍占轮次;超 10 条不停 | dsh-bot-host | Task 2 单测 + UF-501 矩阵 |
| BR-502 | 继续讨论:房间 idle 时提供「让他们继续聊」;触发一次**不追加用户消息**的讨论(回应者=全员,轮数=组设置);进行中该控件禁用;讨论语义与 BR-501 相同 | 用户不说话,成员接着上文再聊一轮 | 继续讨论重复注入上一条用户消息 | dsh-bot-host + workbench-ui | Task 3/5 + UF-502 矩阵 |
| BR-503 | 队列可视化:讨论进行中,成员 chips 呈现三态(已发言✓/正在发言(动效沿现有)/排队中),Header 显示轮次进度 `第 r/R 轮`;pass 的成员即时归为已发言;讨论结束全部复位 | 一眼看出还有谁没说、现在第几轮 | 只有「工作中」一个字;chips 状态与实际顺序不符 | workbench-ui | Task 5 + UF-501 矩阵 |
| BR-504 | 单成员重试:房间 error 行携带 `botId`;行内「重试该成员」对该成员按当前房间上下文补跑一次发言(计入 ≤10 上限);成功后 append 其正文 + append `resolved` 行指向原 error(投影为灰显已解决);重试进行中禁发/禁再点;再次失败错误行保留可再试 | 第二成员失败 → 点重试只补他一句 | 重试整轮重跑;错误行凭空消失 | dsh-bot-host + workbench-ui | Task 11 + UF-505 矩阵 |
| BR-505 | 引用回复:成员气泡 hover「回复」→ composer 出现引用 pill(`{成员名}: {正文截 ≤60 字}`,可清除);发送时回应者解析优先级 = 显式 `@` > 引用目标 > 全员;被引成员的 wake 文以自写自然语言携带引用句(禁止 `[Group chat]`/`【】` 类协议标识,沿三期净化纪律);pill 只在 group 模式出现 | 点「回复」诗人小北 → 只有小北接话且明显针对被引句 | 1:1 出现回复按钮;wake 里出现协议标记 | workbench-ui + dsh-bot-host | Task 6 + UF-503 矩阵 |
| BR-506 | 轮内排队:讨论进行中 composer 不再禁发,提交进入 host 内存 `roundQueue`(FIFO,≤3 条,满则拒绝并提示);transcript 底部显示排队行(内容+「排队中」+取消);当前讨论结束后逐条按正常讨论语义(含点名/引用解析)依序触发;取消即出队;网关重启队列清空(README 写明);排队与草稿互不影响 | 讨论中发第二问 → 轮末自动开新讨论 | 排队消息交错写进当前轮;取消后仍被发送 | dsh-bot-host + workbench-ui | Task 3/7 + UF-504 矩阵 |
| BR-507 | 房间管理:房间标题为 jsonl 追加行 `{type:'title', title, at}`(取最后一条生效,append-only 零迁移);首条用户消息自动起题(≤20 字,规则与四期 `deriveSessionTitle` 一致);行菜单可重命名;「删除房间」二次确认后删 jsonl 并尽力归档该房间隐藏轮次会话,成员 bot/preset/1:1 私聊零影响;旧房间(无 title 行)回退显示 `房间 {id 前 8 位}`;`listGroupSessions` 返回各房间真实 `running`(引擎运行态),roster 小组行 working 不再依赖选中 overlay | 新房间叫「你们讨论下这个标题…」;删房间后 1:1 都在 | 改写 jsonl 首行 header;删房间连带删成员 preset | dsh-bot-host + workbench-ui | Task 9/10 + UF-506 矩阵 |
| BR-508 | 兼容与红线:`rounds` 缺省 1 时讨论行为与三期验收**逐步一致**(一轮、串行、点名、pass、隐藏会话复用全不变);1:1 面零群功能泄漏(无回复按钮/无排队/无继续讨论);v1 `dsh_bot_ask`、v2 工作台、隐藏轮次会话过滤零回归;轮次/引用提示词全部自写,不拷参考树(`rg -i 'anysphere\|sand://' packages/` 为空);运行数据不入 git | 不改设置的老小组用起来和三期一模一样 | 默认行为悄悄变成多轮;1:1 出现排队行 | 全仓 | Task 2 单测 + Task 15 终检 |

### 2.2 UF 用户验收场景(索引)

| 场景 ID | Given | When | Then | 角色 | 验证方式 | Evidence |
|---|---|---|---|---|---|---|
| UF-501 | 两人小组,rounds 设 2 | 发「你们讨论下这个标题好不好」 | 两轮串行发言(≤4 条),第 2 轮起点轮转且内容回应第 1 轮;chips 三态与轮次进度正确 | 本机用户 | browser + 房间导出 | EVD-501 |
| UF-502 | 房间有历史,idle | 点「让他们继续聊」 | 不加用户消息,全员按组设置轮数接着聊;进行中按钮禁用 | 本机用户 | browser | EVD-502 |
| UF-503 | 房间有小北的发言 | 点其气泡「回复」补一句发送 | 仅小北接话且针对被引句;清除 pill 后恢复全员 | 本机用户 | browser | EVD-503 |
| UF-504 | 讨论进行中 | composer 发送第二条 | 进入排队行(可取消);当前讨论结束后自动触发;满 3 条拒绝 | 本机用户 | browser | EVD-504 |
| UF-505 | 某成员模型故障 | 全员讨论 → 点错误行「重试该成员」 | 已成功发言保留;仅该成员补跑;成功后错误行灰显已解决 | 本机用户 | browser + 配坏 override | EVD-505 |
| UF-506 | 新房间与三期旧房间并存 | 观察标题;重命名;删除房间 | 新房间自动起题、旧房间回退占位;重命名生效;删房间后成员 1:1 无恙;roster 小组 working 真值 | 本机用户 | browser + CLI | EVD-506 |
| UF-507 | 不改设置的老小组 + 1:1 | 按三期方式各聊一轮;官方会话调 `dsh_bot_ask` | 行为与三期验收逐步一致;1:1 无任何群控件;委托可用 | 本机用户 | browser + RPC | EVD-507 |

### 2.3 核心业务流程(步骤级交互脚本)

#### UF-501: 多轮讨论

**前置状态**:小组「编辑室」(DSH Bot + 诗人小北),编辑成员表单里 rounds 档位设为 2;空房间。

**成功主路径**:

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 发「你们讨论下这个标题好不好」 | 用户气泡上屏;Header 出现「第 1/2 轮」;chips:小北=排队中,DSH Bot=排队中 | 解析回应者=全员;round 1 起点=成员 1 | — |
| 2 | — | chips:发言者动效「正在发言」,说完变 ✓ | 逐成员 wake(带新消息)→ 取正文 append 房间 | 第 1 轮两条发言先后上屏 |
| 3 | — | Header 变「第 2/2 轮」;chips 复位为排队中,起点轮转到成员 2 | round 2 只让"有新内容可回应"者发言 | 第 2 轮发言明显回应第 1 轮同伴 |
| 4 | — | 进度消失,chips 复位,发送恢复 | 讨论结束(或全员 pass 提前散会) | 房间共 ≤4 条成员发言 |

**失败分支**:

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 某成员失败 | 上游 4xx/超时 | 该位置错误行(名+码);讨论继续下一成员 | 不回滚已成功发言 | UF-505 单成员重试 |
| 全员 pass | 第 2 轮无人有新话 | 进度直接收束,toast「他们没有更多要说的了」 | 提前散会 | 用户再发或继续讨论 |
| 网关死 | boot 停 | 错误条 web-unreachable,草稿保留 | 不写损坏 jsonl | 起网关重试 |

**界面状态机**:

```text
idle → 第1轮(成员i发言中→✓)… → 第2轮 … → idle
                    |                |
                    v                v
              成员错误(继续)     全员pass(提前收束)
```

**入口接线清单**:

- GroupForm rounds 档位(Task 5)→ `updateGroup {rounds}`(Task 2)
- 房间 prompt 走 `runGroupDiscussion`(Task 2/3)
- chips 三态 + 轮次进度(Task 5,数据来自 ASM-502 通道)

#### UF-502: 继续讨论

**前置状态**:上述房间讨论已结束,idle。

**成功主路径**:

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 点 Header 区「让他们继续聊」 | 按钮转 loading 并禁用;轮次进度出现 | `continueDiscussion {roomId}`:不 append 用户消息,全员按组轮数再聊 | 成员接着上文出新发言 |
| 2 | — | 结束后按钮恢复 | 同 BR-501 语义 | 房间多出一段接续讨论 |

**失败分支**:

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 进行中重复点 | 讨论未结束 | 按钮禁用点不动 | host 拒绝并发讨论 | 等待结束 |
| 空房间 | 房间无任何消息 | 按钮置灰 tooltip「先说点什么」 | 不触发 | 先发一条 |
| 网关死 | boot 停 | 错误条,按钮恢复 | — | 重试 |

**界面状态机**:`idle → 讨论中(按钮禁用) → idle | 错误(按钮恢复)`

**入口接线清单**:

- Header「让他们继续聊」按钮(Task 5)→ `POST /dsh-bot/continueDiscussion`(Task 3)

#### UF-503: 引用回复点名

**前置状态**:房间里有诗人小北的发言;idle。

**成功主路径**:

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | hover 小北气泡点「回复」 | composer 上方出现引用 pill「诗人小北: {截句}」,焦点回输入框 | UI 记录 `{botId, excerpt}` | — |
| 2 | 输入「这句能不能更短」发送 | 用户气泡带引用样式 | 解析:无显式 @ → 回应者={小北};wake 以自然语言携带被引句 | 只有小北接话且针对被引句 |
| 3 | 再点 pill 的 × 后发送另一条 | pill 消失 | 回应者=全员 | 全员一轮 |

**失败分支**:

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 被引成员已被移出 | 引用后编辑成员移除小北 | 发送时 toast「成员已不在小组,已发给全员」 | 回退全员 | — |
| 显式 @ 冲突 | pill 在且文本 `@DSH Bot` | 按优先级只回应 @ 集合 | BR-505 优先级 | 文档说明 |

**界面状态机**:`无引用 ⇄ 引用就绪(pill) → 发送(消费 pill) → 无引用`

**入口接线清单**:

- Transcript 成员气泡 hover「回复」(Task 6)
- Composer 引用 pill + 清除(Task 6)
- host 回应者解析优先级(Task 6 接 `parseMentions` 前段)

#### UF-504: 轮内排队

**前置状态**:两人小组讨论进行中(第 1 轮未结束)。

**成功主路径**:

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 讨论中输入「另外,配图呢?」回车 | transcript 底部出现排队行(正文+「排队中」+取消);composer 清空可继续输入 | host `roundQueue.push`(≤3) | 当前讨论不受干扰 |
| 2 | — | 当前讨论结束 | 队首出队按正常讨论语义触发 | 排队行转为正式用户气泡,新讨论开始 |

**失败分支**:

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 队列已满 | 已有 3 条排队 | 发送拒绝 + toast「排队已满,先取消一条」 | host 拒绝 | 取消或等待 |
| 用户取消 | 点排队行「取消」 | 行消失 | 出队 | — |
| 网关重启 | boot 重启 | 排队行消失(队列内存态) | 队列清空 | README 写明边界;重新发送 |

**界面状态机**:`讨论中+队列(0..3) → 讨论结束→队首触发 → …;取消→出队`

**入口接线清单**:

- Composer 进行中提交改排队(Task 7)→ `POST /dsh-bot/queuePrompt` / `cancelQueued`(Task 3)
- 排队行渲染与取消(Task 7)

#### UF-505: 单成员失败重试

**前置状态**:给诗人小北配一个非法 modelOverride(制造失败);两人小组全员讨论。

**成功主路径**:

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 发一条触发全员 | DSH Bot 正常发言;小北位置错误行(名+错误码)+「重试该成员」 | 引擎不回滚已成功发言 | 讨论收束 |
| 2 | 修好 override 后点「重试该成员」 | 该行 loading;其余禁发 | `retryMember {roomId, botId, errorSeq}`:该成员按当前上下文补跑一次 | 小北正文 append;原错误行灰显「已解决」 |

**失败分支**:

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 再次失败 | override 仍坏 | 错误行更新为最新错误,仍可重试 | append 新 error + resolved 指向旧 | 修配置再试 |
| 重试中重复点 | loading 中 | 按钮禁用 | host 拒绝并发重试 | — |

**界面状态机**:`error 行 → 重试中(禁发) → 已解决(灰显)+新正文 | 新 error 行`

**入口接线清单**:

- 房间 error 行「重试该成员」按钮(Task 11)→ `POST /dsh-bot/retryMember`(Task 11)

#### UF-506: 房间管理(起题/重命名/删除/working 真值)

**前置状态**:存在三期旧房间(无 title 行);新建一个房间。

**成功主路径**:

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 新房间发「你们讨论下这个标题好不好」 | — | host 首条用户消息自动 append `title` 行(≤20 字) | 会话列表/Header 该房间显示「你们讨论下这个标题…」;旧房间仍显示「房间 xxxxxxxx」 |
| 2 | 房间行菜单「重命名」输入「标题评审」 | 行内输入框 | append 新 `title` 行 | 显示「标题评审」 |
| 3 | 房间行菜单「删除房间」确认 | 确认框写明「只删这个房间,成员和私聊保留」 | 删 jsonl + 归档该房间隐藏轮次会话;当前房间则切下一个 | 房间消失;成员 1:1 与小组其他房间无恙 |
| 4 | 另开讨论时切到别的 bot | — | `listGroupSessions.running` 真值 | roster 小组行 working 点亮(未选中也亮) |

**失败分支**:

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 删除失败 | 文件锁/权限 | 错误条,行仍在 | 不半删 | 重试 |
| 讨论中删房间 | running | 菜单项禁用 | host 拒绝 | 等结束 |
| 旧 jsonl 混入未知行 | ASM-503 场景 | 正常渲染消息行 | 未知行忽略 | — |

**界面状态机**:`idle → 重命名中/删除确认 → 完成 | 错误(状态不变)`

**入口接线清单**:

- host 起题钩子挂 `groupPrompt` 首条(Task 9);`renameRoom`/`deleteRoom`(Task 9)
- 房间行菜单(Task 9);`listGroupSessions.running`(Task 10)→ roster working(Task 10)

#### UF-507: 默认一轮与 1:1 零回归

**前置状态**:不改 rounds 的老小组 + DSH Bot 1:1 私聊;官方会话可调工具。

**成功主路径**:

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 老小组发「你们是谁?」 | 全员各一句,与三期一致 | rounds 缺省 1 走单轮路径 | 无第二轮;无轮次进度条(单轮不显示) |
| 2 | 切 DSH Bot 1:1 发一条 | 单 bot 回复 | 不走讨论引擎 | 无回复按钮/排队/继续讨论控件 |
| 3 | 官方会话调 `dsh_bot_ask` | 工具卡完成 | v1 链 | 答案返回 |

**失败分支**:沿三期既有错误态(网关死/无凭据),本包不改语义;1:1 出现任何群控件即 P0 缺陷。

**界面状态机**:同三期(单轮)与 v2(1:1)。

**入口接线清单**:

- 既有 roster `onSelect` 分支(不改);群控件渲染以 `isGroup` 守卫(Task 5/6/7 各自守卫)

### 2.4 INV 不变量

| 不变量 ID | 内容 | 关联 BR/UF | 验证方式 |
|---|---|---|---|
| INV-501 | 缺省配置下(rounds=1)小组行为与三期验收逐步一致;1:1/v1/v2 用户可见行为零回归 | BR-508, UF-507 | Task 2 单测 + Task 14 抽验 |
| INV-502 | 隐藏轮次会话纪律不变:`kind:hidden`+`group-room:` 标记、不进 1:1 列表(含 includeHidden)、wake 无协议标识 | BR-501/505 | Task 2/6 单测 + CLI 取证 |
| INV-503 | 房间 jsonl append-only:不改写既有行;旧房间文件在新代码下可读可聊 | BR-507 | Task 8 旧文件回归单测 |
| INV-504 | 邻仓零改动;仍只有 :3084;`groups.json`/rooms/评测运行数据不入 git | BR-508 | Task 14 porcelain + git status |

### 2.5 EVD 证据清单

| 证据 ID | 类型 | 期望证据 | 保存位置 |
|---|---|---|---|
| EVD-501 | screenshot+json | 两轮四条发言截图 + 房间导出(轮转与回应可见) | `evidence/UF-501/` |
| EVD-502 | screenshot | 继续讨论前后对比 + 进行中禁用态 | `evidence/UF-502/` |
| EVD-503 | screenshot | 引用 pill、仅被引者接话、清除后全员 | `evidence/UF-503/` |
| EVD-504 | screenshot | 排队行/取消/轮末自动触发/满 3 拒绝 | `evidence/UF-504/` |
| EVD-505 | screenshot+log | 错误行 → 重试 → 灰显已解决 | `evidence/UF-505/` |
| EVD-506 | screenshot+log | 新旧房间标题对比、重命名、删除后 listBots/1:1 取证、roster working 真值 | `evidence/UF-506/` |
| EVD-507 | screenshot+log | 默认一轮逐步一致对比、1:1 无群控件、`dsh_bot_ask` 成功 | `evidence/UF-507/` |
| EVD-508 | log | 单测/构建/standard:check/回归输出 | `evidence/phase-0/`…`evidence/phase-4/` |

### 2.6 角色与权限矩阵

单一本机用户,loopback,无权限差异。

### 2.7 负向 / 破坏性场景

| 场景 | Given | When | Then | Evidence |
|---|---|---|---|---|
| 依赖失败 | 网关死 | 讨论/排队/重试任意操作 | 错误条可重试,jsonl 不损坏 | `evidence/UF-504/gateway-down.md` |
| 上限触顶 | rounds=3 且成员话多 | 全员讨论 | 可见发言到 10 条硬停,UI 提示已达上限 | `evidence/UF-501/turn-cap.md` |
| 重复提交 | 讨论中连点继续讨论/重试 | — | host 拒绝并发,UI 禁用 | `evidence/UF-502/double-submit.md` |
| 讨论中改成员 | 一轮进行中编辑成员 | 保存 | 沿三期:本场讨论用开始快照,保存禁用或排队生效 | `evidence/UF-501/member-lock.md` |
| 旧数据兼容 | 三期旧房间/旧 groups.json(无 rounds) | 打开并对话 | 正常读写;rounds 视为 1 | `evidence/UF-506/legacy.md` |

### 2.8 非目标

- **成员并行发言**:保持串行(上下文连贯是产品点)。
- **SendMessage 专有工具 / 每 turn 多条消息**:无该工具面;每成员每轮 1 条。
- **跨房间/跨用户共享**:单机单用户。
- **token 流式、reactions**:后续包。
- **1:1 会话导航(跳转/收纳/起题)**:四期 `../dsh-bot-session-nav/` 范围。

---

## 3. 技术方案

### 3.1 架构 Before / After

```text
Before(v3):
groupPrompt → runGroupRound(单轮,串行,点名/pass)→ 房间 jsonl(message 行)
房间无标题;roster 小组 working 靠选中 overlay;进行中禁发

After(v5):
groupPrompt/continueDiscussion/queue 出队 → runGroupDiscussion
  round 1..R(≤3): orderRoundSpeakers 轮转 → 逐成员 wake(新消息增量)→ append
  跳过无新内容者;全员 pass 早停;可见发言 ≤10
  失败 append error{botId};retryMember 补跑单人 + resolved 行
房间 jsonl 增 title/resolved 行(append-only,旧文件兼容)
roundQueue(内存 FIFO≤3)承接讨论中提交
listGroupSessions.running + 引擎态(轮/发言人/队列)→ overview(四期)或 groupStatus
UI:rounds 档位/轮次进度/chips 三态/回复 pill/排队行/房间管理菜单
```

### 3.2 模块改造

| 模块 | 职责 | 改造说明 |
|---|---|---|
| `packages/dsh-bot-host/src/group-engine.ts` | 多轮调度 | `runGroupRound` 泛化为 `runGroupDiscussion`(rounds/轮转/新内容判定/pass 早停/≤10);引用回复解析优先级;retryMember |
| `packages/dsh-bot-host/src/group-queue.ts` | 轮内排队 | 新建:每房间内存 FIFO(≤3)+ 出队触发 + 取消 |
| `packages/dsh-bot-host/src/groups.ts` | 房间元数据 | jsonl 增 `title`/`resolved` 行读写;groups.json 行增可选 `rounds`;读取器未知行忽略(按 ASM-503) |
| `packages/dsh-bot-host/src/workbench-routes.ts` | API | 增 `continueDiscussion/queuePrompt/cancelQueued/retryMember/renameRoom/deleteRoom/groupStatus(按 ASM-502)`;`updateGroup` 收 `rounds` |
| `packages/workbench-ui/src/GroupForm.tsx` | 组设置 | rounds 档位(1/2/3) |
| `packages/workbench-ui/src/Conversation.tsx` | 讨论指示 | 轮次进度、继续讨论按钮、chips 三态数据接入、房间管理菜单 |
| `packages/workbench-ui/src/Transcript.tsx` | 消息面 | 回复按钮(group 守卫)、error 行重试、resolved 灰显、排队行 |
| `packages/workbench-ui/src/Composer.tsx` | 输入面 | 引用 pill、讨论中排队提交 |
| `packages/workbench-ui/src/App.tsx` | roster | 小组 working 真值接入(running/overview) |
| `scripts/manual-test.sh` | 验收矩阵 | 增 rounds→discussion→queue→retry→renameRoom→deleteRoom 链 |

### 3.3 三段式定位清单

| 文件 | 稳定定位 | 搜索定位 | 行号 hint | 备注 |
|---|---|---|---|---|
| `packages/dsh-bot-host/src/group-engine.ts` | `export async function runGroupRound` | `rg "export async function runGroupRound" packages/dsh-bot-host/src/group-engine.ts` | L306 | 泛化为多轮 |
| `packages/dsh-bot-host/src/group-engine.ts` | `export function parseMentions` | `rg "parseMentions" packages/dsh-bot-host/src/group-engine.ts` | L122 | 引用优先级接点 |
| `packages/dsh-bot-host/src/group-engine.ts` | `isSkipReply` / `toRoomSpeech` | `rg "isSkipReply" packages/dsh-bot-host/src/group-engine.ts` | L158、L215 | pass/净化沿用 |
| `packages/dsh-bot-host/src/groups.ts` | `export interface RoomHeader` | `rg "RoomHeader" packages/dsh-bot-host/src/groups.ts` | L76 | title 行并列新增 |
| `packages/dsh-bot-host/src/groups.ts` | `export interface GroupRegistryRow` | `rg "GroupRegistryRow" packages/dsh-bot-host/src/groups.ts` | L22 | 增可选 rounds |
| `packages/dsh-bot-host/src/workbench-routes.ts` | `createGroupSession` case | `rg "createGroupSession" packages/dsh-bot-host/src/workbench-routes.ts` | L215 | 新 case 并列 |
| `packages/dsh-bot-host/src/workbench-sessions.ts` | `const promptLocks` | `rg "promptLocks" packages/dsh-bot-host/src/workbench-sessions.ts` | L42 | 排队/锁交互(ASM-501) |
| `packages/workbench-ui/src/Conversation.tsx` | `memberChips` | `rg "memberChips" packages/workbench-ui/src/Conversation.tsx` | L462 附近 | chips 三态/进度/按钮 |
| `packages/workbench-ui/src/Transcript.tsx` | `function TypingIndicator` | `rg "function TypingIndicator" packages/workbench-ui/src/Transcript.tsx` | L70 | 发言指示沿用 |
| `packages/workbench-ui/src/Composer.tsx` | `mentionQuery` import | `rg "mentionQuery" packages/workbench-ui/src/Composer.tsx` | L6 | 引用 pill/排队 |
| `packages/workbench-ui/src/GroupForm.tsx` | `roundLocked` prop | `rg "roundLocked" packages/workbench-ui/src/App.tsx` | L629 附近 | rounds 档位与锁 |
| `packages/workbench-ui/src/App.tsx` | rooms 映射 `working: false` | `rg "roomsToSessions" packages/workbench-ui/src/Conversation.tsx` | L85-96 | working 真值替换 |
| `packages/dsh-bot-host/src/group-queue.ts` | 新建:`roundQueue` | 建成后 `rg -F "roundQueue" packages/dsh-bot-host/src/group-queue.ts` | 新建 | Task 3 |
| `docs/dsh-bot-session-nav/spec.md` | 四期 overview 合同 | `rg "overview" docs/dsh-bot-session-nav/spec.md` | 第 2 章 | ASM-502 对接面(相对仓根) |

### 3.4 API / 数据 / 权限 / 路由影响

| 类型 | 是否影响 | 说明 | 兼容策略 |
|---|---|---|---|
| API | 新增 | `continueDiscussion/queuePrompt/cancelQueued/retryMember/renameRoom/deleteRoom(+groupStatus 按 ASM-502)`;`updateGroup` 增 rounds;既有方法不变 | wire 仍 `{args}/{ok,value\|error}` |
| 数据 | 新增 | groups.json 行可选 `rounds`;房间 jsonl 新行类型 `title`/`resolved`(append-only) | 旧文件零迁移,回退语义写明 |
| 权限 | 否 | loopback 单用户 | — |
| 路由(口) | 否 | 全部经 :3084 | — |

---

## 4. Phase 计划与任务详情

> Phase 依赖链:

```text
P0 校准(T1) → P1 多轮引擎与队列(T2-T4) → P2 讨论交互面(T5-T8)
  → P3 房间管理与重试(T9-T12) → P4 收尾与真实验收(T13-T15)
```

> 实现任务数 ≥ 8 → 状态板 `tasks.csv`。

### Phase 0: 校准

> 你在哪里:三期一轮引擎可用;三条 ASM 未消解。
> 做完之后:锁/排队底座、引擎态暴露通道、jsonl 兼容策略全部有实测结论。

### Task 1: 校准并发行为/引擎态通道/jsonl 兼容

- **关联**:ASM-501/502/503;支撑 BR-501/506/507(UF 无:校准)
- **前置任务**:无
- **风险等级**:P0

**为什么做**:排队实现、roster 接入点、房间元数据格式全取决于这三条。

**涉及文件与定位**:`packages/dsh-bot-host/src/group-engine.ts`(runGroupRound L306);`packages/dsh-bot-host/src/groups.ts`(RoomHeader L76,读取投影);`../dsh-bot-session-nav/`(四期板面)

**具体操作**:

1. 起网关,建两人小组;讨论进行中连发第二条 `prompt`(RPC 直打绕过 UI 禁发),记录现行为(交错/串行/报错)→ 消解 ASM-501,确定 roundQueue 挂点(房间级锁先行与否)。
2. 读 `groups.ts` 房间 jsonl 读取/投影代码:确认未知 type 行是否被忽略;构造含未知行的临时 jsonl 实测读取(临时物不入 git)→ 消解 ASM-503。
3. 查四期包 `tasks.csv` 板面与其 overview 字段(若已交付):确定引擎态(轮/发言人/队列/running)的暴露通道(overview 扩展 or 独立 groupStatus)→ 消解 ASM-502。
4. 顺带记录:现引擎 wake 组装函数与"新消息增量"游标形状(多轮复用依据),写入 1.3。
5. 结论回写 1.3/1.4。

**验证**:`evidence/phase-0/calibration.md` 存在且 ASM-501~503 全消解 → 期望零残留

**Evidence**:`evidence/phase-0/calibration.md`

**注意事项**:打 RPC 前 `dsh-rpc-who.sh 3084`;临时 jsonl/会话清理干净。豁免回归:P0 单实现任务,回归并入本任务验证。

### Phase 1: 多轮引擎与队列

> 你在哪里:机制校准完。
> 做完之后:host 侧多轮/继续讨论/排队全部可经 RPC 驱动,默认一轮零回归。

### Task 2: 多轮调度器 runGroupDiscussion

- **关联**:BR-501 / BR-508 / INV-501 / INV-502 / UF-501 / UF-507
- **前置任务**:1
- **风险等级**:P0(核心)

**为什么做**:小组从"广播"变"开会"的本体。

**涉及文件与定位**:

- `packages/dsh-bot-host/src/group-engine.ts`:`export async function runGroupRound`,L306;`parseMentions` L122;`isSkipReply` L158
- `packages/dsh-bot-host/src/groups.ts`:`GroupRegistryRow` L22(增可选 rounds,1-3 校验)

**具体操作**:

1. `runGroupDiscussion({roomId, userText?, responders?})`:回应者整场固定;`for round in 1..R`:起点轮转(自写取模);逐成员判断"自上次发言后有新房间消息"否则跳过;wake(沿三期增量机制)→ `toRoomSpeech` → append;`isSkipReply` 计 pass;整轮全 pass break;可见成员发言累计 ≥10 硬停并 append 系统提示行。
2. rounds 从 groups.json 读(缺省 1);`updateGroup` 收 `rounds`(1-3 校验)。
3. 轮次/引用提示词全部自写(自然语言,无协议标识,禁止参照参考树文案)。
4. 单测(stub sessionTool):默认 1 轮逐步等价三期(快照对比)、2 轮轮转与增量 wake、全 pass 早停、10 条硬停、点名集合多轮固定、成员失败不回滚。

**验证**:`pnpm --filter dsh-bot-host run build && pnpm --filter dsh-bot-host test` → 期望全绿(含"默认一轮等价"用例)

**Evidence**:`evidence/phase-1/engine-unit.log`

**注意事项**:INV-502:隐藏会话复用与 marks 零改动;禁止把 round 编号等元信息写进房间正文或 wake 协议标识。

### Task 3: 继续讨论与轮内排队(host)

- **关联**:BR-502 / BR-506 / UF-502 / UF-504
- **前置任务**:2
- **风险等级**:P1

**为什么做**:讨论的续航与"不打断"输入体验。

**涉及文件与定位**:

- 新建 `packages/dsh-bot-host/src/group-queue.ts`
- `packages/dsh-bot-host/src/workbench-routes.ts`:`createGroupSession` case,L215(并列新 case)

**具体操作**:

1. `continueDiscussion {roomId}`:房间非空且 idle 才触发;不 append 用户消息,回应者=全员;并发拒绝(复用 ASM-501 结论的房间锁)。
2. `group-queue.ts`:每房间 FIFO ≤3;`queuePrompt {roomId,text}`(讨论中才入队,idle 直接走正常 prompt)、`cancelQueued {roomId,queueId}`;讨论收束后出队逐条按正常语义触发;队列状态并入引擎态暴露(ASM-502 通道)。
3. 单测:并发拒绝、队满拒绝、取消、出队顺序、重启清空语义(构造)。

**验证**:`pnpm --filter dsh-bot-host test` → 期望全绿;RPC:讨论中 queuePrompt→结束自动触发

**Evidence**:`evidence/phase-1/queue-unit.log`

**注意事项**:出队触发失败不得丢队列其余条目;队列只存文本与解析所需字段。

### Task 4: 执行 Phase 1 回归验证

- **关联**:本 Phase 全部条目 + INV-501
- **前置任务**:3

**验证**:`pnpm -r run build && pnpm -r test` + RPC 驱动:rounds=2 讨论房间导出含两轮、默认组行为与三期一致、queue 链路可用

**Evidence**:`evidence/phase-1/phase-summary.md`

### Phase 2: 讨论交互面

> 你在哪里:host 全通,UI 还是一轮面。
> 做完之后:轮次进度/chips 三态/继续讨论/引用回复/排队全部可点。

### Task 5: 轮次进度、chips 三态与继续讨论按钮

- **关联**:BR-502 / BR-503 / UF-501 / UF-502
- **前置任务**:4
- **风险等级**:P1

**涉及文件与定位**:

- `packages/workbench-ui/src/Conversation.tsx`:`memberChips`,L462 附近;`packages/workbench-ui/src/GroupForm.tsx`(rounds 档位)
- 引擎态数据源:按 ASM-502 结论(overview 或 groupStatus)

**具体操作**:

1. GroupForm 增「讨论轮数」档位(1/2/3,默认 1),经 `updateGroup` 保存;进行中沿 `roundLocked` 禁改。
2. Header 讨论进行中显示「第 r/R 轮」(R=1 不显示,守 UF-507);「让他们继续聊」按钮(空房间置灰/进行中禁用)。
3. chips 三态:待发言(排队中)/正在发言(沿动效)/已发言✓;pass 归已发言;讨论结束复位。
4. 组件单测(fixture 引擎态)。

**验证**:`pnpm --filter workbench-ui run build && pnpm --filter workbench-ui test` → 期望全绿

**Evidence**:`evidence/phase-2/chips-unit.log`

**注意事项**:单轮组 UI 与三期视觉零差异;1:1 面不渲染任何新控件。

### Task 6: 引用回复(Transcript + Composer + host 解析)

- **关联**:BR-505 / UF-503
- **前置任务**:4
- **风险等级**:P1

**涉及文件与定位**:

- `packages/workbench-ui/src/Transcript.tsx`:`TypingIndicator` L70(同文件气泡区加 hover 回复,group 守卫)
- `packages/workbench-ui/src/Composer.tsx`:`mentionQuery` L6(pill 状态与提交携带)
- `packages/dsh-bot-host/src/group-engine.ts`:`parseMentions` L122(优先级:@ > 引用 > 全员)

**具体操作**:

1. 成员气泡 hover「回复」→ Composer 顶部引用 pill(名+截句 ≤60,×清除);发送携带 `replyTo {botId, excerpt}`。
2. host 解析优先级落地;被引成员已移出 → toast 回退全员;wake 以自写自然语言携带引用句。
3. 用户气泡渲染引用样式(小引用块)。
4. 单测:优先级矩阵、pill 生命周期、1:1 无回复按钮。

**验证**:`pnpm -r test` → 期望全绿

**Evidence**:`evidence/phase-2/reply-unit.log`

**注意事项**:引用文本入库前净化(截断/去换行);禁止协议标识。

### Task 7: 轮内排队 UI

- **关联**:BR-506 / UF-504
- **前置任务**:5
- **风险等级**:P1

**涉及文件与定位**:

- `packages/workbench-ui/src/Composer.tsx`(讨论中提交改走 queuePrompt);`packages/workbench-ui/src/Transcript.tsx`(排队行渲染)

**具体操作**:

1. 讨论进行中 composer 解禁:placeholder 变「讨论中,发送将排队」;提交 → queuePrompt;失败(满)toast。
2. transcript 底部排队行:正文+「排队中」徽标+「取消」;出队时行消失由正式用户气泡接替。
3. 单测:排队/取消/满 3/1:1 与 idle 群不走排队。

**验证**:`pnpm --filter workbench-ui test` → 期望全绿

**Evidence**:`evidence/phase-2/queue-ui-unit.log`

**注意事项**:排队行不是正式房间消息,刷新后从引擎态恢复渲染。

### Task 8: 执行 Phase 2 回归验证

- **关联**:本 Phase 全部条目
- **前置任务**:6;7

**验证**:`pnpm -r run build && pnpm -r test` + 浏览器:UF-501/502/503/504 主路径各走一遍

**Evidence**:`evidence/phase-2/phase-summary.md`

### Phase 3: 房间管理与重试

> 你在哪里:讨论体验完整,房间还是匿名的、失败还要整轮重来。
> 做完之后:房间有名可管;单成员可重试;roster working 真值。

### Task 9: 房间标题/重命名/删除

- **关联**:BR-507 / INV-503 / UF-506
- **前置任务**:8
- **风险等级**:P1

**涉及文件与定位**:

- `packages/dsh-bot-host/src/groups.ts`:`RoomHeader` L76(title 行读写);`packages/dsh-bot-host/src/workbench-routes.ts` 新 case
- `packages/workbench-ui/src/Conversation.tsx`(房间行菜单;`roomsToSessions` L85 占位替换)

**具体操作**:

1. jsonl 增 `{type:'title', title, at}` 行(最后一条生效);读取器未知行忽略(按 ASM-503 结论落地);首条用户消息自动起题(复用四期 `deriveSessionTitle` 规则,函数本包内实现或经共享模块,不跨包 import 私有文件)。
2. `renameRoom {roomId,title}`(清洗/空名拒绝)、`deleteRoom {roomId}`(running 拒绝;删 jsonl + 尽力归档该房间隐藏轮次会话;当前房间切下一个)。
3. UI:房间行/Header 菜单「重命名/删除房间」;确认框文案写明成员保留;旧房间回退占位标题。
4. 单测:title 行生效序、旧文件兼容、删除零半删、running 拒绝。

**验证**:`pnpm --filter dsh-bot-host test && pnpm --filter workbench-ui test` → 期望全绿

**Evidence**:`evidence/phase-3/rooms-unit.log`

**注意事项**:INV-503 append-only;删除不碰 groups.json 其他行、不碰成员 preset。

### Task 10: roster 小组 working 真值与引擎态接入

- **关联**:BR-507 / UF-506;ASM-502 落地
- **前置任务**:8
- **风险等级**:P2

**涉及文件与定位**:

- `packages/dsh-bot-host/src/workbench-routes.ts`:`listGroupSessions` case L220(返回 running);ASM-502 通道(overview 扩展或 groupStatus)
- `packages/workbench-ui/src/App.tsx`(rooms 映射 working 真值)、`Conversation.tsx`(引擎态消费统一)

**具体操作**:

1. `listGroupSessions` 行增 `running`(引擎运行态);按 ASM-502 把轮/发言人/队列并入 overview(四期在位)或 `groupStatus`。
2. App rooms 映射消费真值;未选中小组 working 点可亮。
3. 单测:运行态投影。

**验证**:`pnpm -r test` → 期望全绿;浏览器:讨论中切走,小组行 working 仍亮

**Evidence**:`evidence/phase-3/status-unit.log`

**注意事项**:两通道(overview/groupStatus)UI 行为必须等价;不得让 roster 恢复 O(N) 轮询(四期合同)。

### Task 11: 单成员失败重试

- **关联**:BR-504 / UF-505
- **前置任务**:9
- **风险等级**:P1

**涉及文件与定位**:

- `packages/dsh-bot-host/src/group-engine.ts`(error 行带 botId;retryMember);`packages/workbench-ui/src/Transcript.tsx`(错误行按钮/灰显)

**具体操作**:

1. error 行 payload 增 `botId`+`errorSeq`;`retryMember {roomId,botId,errorSeq}`:idle 才可;该成员按当前上下文补跑一次(计入 ≤10);成功 append 正文 + `{type:'resolved', target}` 行。
2. UI:错误行「重试该成员」(loading/禁发);resolved 灰显。
3. 单测:重试成功/再失败/并发拒绝/上限触顶拒绝。

**验证**:`pnpm -r test` → 期望全绿

**Evidence**:`evidence/phase-3/retry-unit.log`

**注意事项**:旧 error 行(无 botId)不显示重试按钮(兼容);重试也走隐藏会话复用链。

### Task 12: 执行 Phase 3 回归验证

- **关联**:本 Phase 全部条目 + INV-503
- **前置任务**:10;11

**验证**:`pnpm -r run build && pnpm -r test` + 浏览器:UF-505/506 主路径 + 三期旧房间实测可聊

**Evidence**:`evidence/phase-3/phase-summary.md`

### Phase 4: 收尾与真实验收

> 你在哪里:功能全量在。
> 做完之后:standards/文档/manual-test 覆盖 v5,5.2 全过,默认行为零回归。

### Task 13: standards、manual-test 与 README

- **关联**:BR-508
- **前置任务**:12
- **风险等级**:P2

**具体操作**:

1. standards:host-descriptor 增讨论/队列/房间管理能力;`pnpm run standard:check` 0 FAIL。
2. `scripts/manual-test.sh` 增:updateGroup rounds → 讨论(--write)→ queue → renameRoom → deleteRoom → 清理;`--no-write` 跳过讨论。
3. README:轮数档位与默认不变、继续讨论、排队边界(重启清空)、每成员每轮 1 条的参考差异、房间管理、重试语义。

**验证**:`pnpm run standard:check` 0 FAIL;`bash scripts/manual-test.sh --no-write` 全步通过

**Evidence**:`evidence/phase-4/standard-check.log` + `evidence/phase-4/manual-test.log` + `evidence/phase-4/docs-diff.md`

### Task 14: 执行 spec 5.2 真实场景全套测试

- **关联**:全部用户可见 UF(UF-501~507)+ 2.7 负向场景
- **前置任务**:13
- **风险等级**:P0

**验证**:按 5.2 执行矩阵逐行回放全部通过;每行 evidence 落盘后复跑 `python3 ~/.agents/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-group-rounds`(证据审计)

**Evidence**:`evidence/UF-501/`…`evidence/UF-507/`(全量)

**注意事项**:UF-505 需真实制造成员失败(坏 override);两轮讨论导出必须能看出"回应关系"。

### Task 15: 执行 Phase 4 回归验证(总收尾)

- **关联**:本 Phase 全部条目 + INV-501~504 + BR-508 终检
- **前置任务**:14

**验证**:`pnpm -r run build && pnpm -r run typecheck && pnpm -r test && pnpm run standard:check` 全绿;v1 委托/v2 工作台/三期一轮各抽验一行;邻仓 porcelain 干净(vibee 既有 `?? .vibee/` 除外);`rg -i 'anysphere|sand://' packages/` 为空;`git status` 无运行数据

**Evidence**:`evidence/phase-4/phase-summary.md` + `evidence/phase-4/final-regression.log`

---

## 5. 验收与 Review 协议

> **验收铁律:命令级验证(5.1)只是入场券;5.2 真实场景全套测试是完成的唯一标准。**

### 5.1 命令级验证(入场券)

| 验证项 | 命令 | 期望 | Evidence |
|---|---|---|---|
| 构建 | `pnpm -r run build` | 全包成功 | EVD-508 |
| 类型 | `pnpm -r run typecheck` | 0 error | EVD-508 |
| 单测 | `pnpm -r test` | 全绿 | EVD-508 |
| 标准面 | `pnpm run standard:check` | 0 FAIL | EVD-508 |
| 包校验 | `python3 ~/.agents/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-group-rounds` | 0 FAIL | EVD-508 |

### 5.2 真实场景全套测试(Real-Run,完成的唯一标准)

**环境准备**:

| 项 | 值 |
|---|---|
| 启动命令 | `cd <本仓> && pnpm install && pnpm -r run build && sh env/setup.sh && sh env/boot.sh`(已起则 `dsh-rpc-who.sh 3084` 核身份) |
| 访问入口 | 工作台 `http://127.0.0.1:3084/dsh-bot/ui` 与右栏「DSH Bot」页签;RPC `dsh-rpc.sh 3084`;`POST /dsh-bot/<method>` |
| 测试账号/数据 | ≥2 个人设(可现场建「诗人小北」);两人小组;模型凭据沿 `env/.env` |
| 干净状态定义 | 小组数据可单独清(`env/dsh-bot/groups.json`、`env/dsh-bot/rooms/`);1:1 无需清 |
| 可用测试工具 | chrome-devtools 类 MCP / Playwright(v2/v3 已实证);RPC 直跑留档 |

**执行矩阵**:

| UF | 执行方式 | 操作来源 | 必须核对的点 | Evidence |
|---|---|---|---|---|
| UF-501 主路径(2 轮) | browser + 导出 | 2.3 UF-501 步骤 1-4 | 轮转起点、第 2 轮回应性、chips 三态、进度条 | `evidence/UF-501/two-rounds.png` + `evidence/UF-501/room-export.json` |
| UF-501 成员失败分支 | browser | 2.3 失败分支 1 | 已成功保留+错误行 | `evidence/UF-501/member-fail.md` |
| UF-501 上限触顶 | browser/RPC | 2.7 上限触顶 | 10 条硬停+提示 | `evidence/UF-501/turn-cap.md` |
| UF-502 主路径 | browser | 2.3 UF-502 | 不加用户消息接着聊;进行中禁用 | `evidence/UF-502/continue.png` |
| UF-502 防重 | browser | 2.7 重复提交 | 连点只跑一场 | `evidence/UF-502/double-submit.md` |
| UF-503 主路径 | browser | 2.3 UF-503 步骤 1-3 | 仅被引者接话且针对引句;清除恢复全员 | `evidence/UF-503/reply.png` |
| UF-503 成员移出分支 | browser | 2.3 失败分支 1 | toast 回退全员 | `evidence/UF-503/removed-member.md` |
| UF-504 主路径 | browser | 2.3 UF-504 步骤 1-2 | 排队行/轮末自动触发 | `evidence/UF-504/queue.png` |
| UF-504 取消与满 3 | browser | 2.3 失败分支 | 取消出队;满 3 拒绝 | `evidence/UF-504/cancel-full.md` |
| UF-504 网关死 | 停 boot | 2.7 依赖失败 | 错误条,jsonl 不损坏 | `evidence/UF-504/gateway-down.md` |
| UF-505 主路径 | browser + 坏 override | 2.3 UF-505 步骤 1-2 | 只补该成员;错误行灰显已解决 | `evidence/UF-505/retry.png` |
| UF-506 主路径 | browser + CLI | 2.3 UF-506 步骤 1-4 | 新房自动起题/旧房回退/重命名/删除后 1:1 无恙/working 真值 | `evidence/UF-506/rooms.png` + `evidence/UF-506/legacy.md` |
| UF-507 零回归 | browser + RPC | 2.3 UF-507 步骤 1-3 | 默认一轮逐步一致;1:1 无群控件;ask 成功 | `evidence/UF-507/regression.png` + `evidence/UF-507/v1-ask.log` |

**通过标准**:矩阵全部行通过且 evidence 齐全;任何一行失败回对应任务修复重跑。

### 5.3 Evidence 目录结构与命名

```text
docs/dsh-bot-group-rounds/evidence/
  phase-0/ … phase-4/
  UF-501/ … UF-507/
```

### 5.4 Review 专项检查清单

- [ ] BR-501:默认一轮"逐步等价三期"有快照单测背书;两轮导出可见回应关系
- [ ] BR-505/INV-502:wake 文无任何协议标识;隐藏会话不进 1:1 列表
- [ ] BR-506:排队消息绝不交错进当前轮;取消即出队
- [ ] BR-507/INV-503:jsonl 只追加;旧房间可读可聊
- [ ] BR-508:1:1 面零群控件泄漏;轮次提示词非参考树拷贝
- [ ] 上限 ≤10 硬停实测在案
- [ ] 5.2 执行矩阵全部通过,evidence 与 2.5 一致
- [ ] 2.3 每条流程入口接线可达
