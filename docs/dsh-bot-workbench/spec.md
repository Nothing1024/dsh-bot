# dsh-bot-workbench Spec

> Version: 0.1.0 | Date: 2026-08-30 | Status: Ready 可执行(机制已实机验证;剩余 ASM 由 P0 校准消解)
>
> 本文件是本需求的**唯一事实源**。二期包:在 v1(`../dsh-bot-mvp/spec.md`,已 Done)之上加「多人设工作台」。
> 设计素材:`reference-ui-notes.md`(参考产品 UI 结构调研,只读设计形状,禁拷代码)。
>
> 填写三态规则:每个表格单元格只允许三种内容——
> 1. 验证过的事实(注明来源命令);2. 显式假设 `ASM-xxx`;3. `待勘察`。

---

## 0. 一页纸人话摘要

- **给谁 / 场景**:DSH Bot 的使用者(v1 已交付单人设 bot)。v1 验收反馈:bot 身份只有徽标级呈现,不够;想要参考产品那种体验——**多个 bot 人设各有独立对话,conversation 有专属展示面**。
- **做什么**:交付「DSH Bot 工作台」——一个由本插件自己服务的网页(`/dsh-bot/ui`):
  1. **左栏人设名单(roster)**:每个人设有头像、名字、最后消息预览、时间、工作中状态点;可新建/编辑/删除人设(名字 + 人设文本 + 头像 + 可选专属模型);
  2. **右侧独立对话面**:头部显示当前 bot 头像与名字,消息按角色分侧,思考/工具调用折叠展示,生成中有"工作中"指示;每个 bot 的草稿互相隔离;
  3. 人设 1 和人设 2 **各自的对话完全隔离**(不同人设、不同历史、互不串);
  4. 工作台既嵌在右侧栏页签里(iframe),也能**直接开浏览器标签独立使用**。
- **改哪里**:只在本仓——扩展 `dsh-bot-host`(人设注册表 + 工作台 API + 静态页服务)、新增 `workbench-ui` 网页包、`ui-dsh-bot` 页签改为 iframe 嵌入。每个人设落地为一个自动管理的 agent preset。
- **怎么算做完**:页签或浏览器打开工作台 → 新建"人设2"并对话,与默认 DSH Bot 的对话身份、历史、草稿互不串;编辑人设后新对话生效;在官方 GUI 直建的 bot 会话也会出现在对应人设的对话列表(v1 验收缺口修复);5.2 真实场景矩阵全过且 v1 功能零回归。
- **不做什么**:token 级流式(MVP 为消息级刷新 + 工作中指示)、头像图片上传(emoji/色块)、reactions/群聊/频道/Computer 面(参考产品桌面能力)、官方会话栏行为改动。

---

## 1. 事实基线与假设

### 1.1 需求与运行模式

| 项 | 结论 |
|---|---|
| 原始需求 | 「也没有徽标,我希望他能够参考 reference 里面的去实现 UI 效果,比如 bot 人设1和人设2分别的对话,以及 conversation,可以做一个独立的展示」 |
| 输入类型 | description(v1 验收反馈 + 参考产品 UI 调研) |
| Mode | oneclick(新包;v1 包已 Done 不再改) |
| 置信度 | 高(承重机制全部实机验证,见 1.3) |
| 输出目录 | `docs/dsh-bot-workbench/` |

### 1.2 任务类型路由

| 维度 | 结论 |
|---|---|
| 任务类型 | frontend(工作台 SPA 为主)+ backend(注册表/API/preset 管理)+ infra(静态服务/页签接线) |
| 主要风险 | 会话→preset 反查通道(补标对账);iframe 内轮询的性能;preset 文件程序化改写的健壮性 |
| 行号引用策略 | 既有文件 symbol+rg;新建文件标「新建」 |
| 必需验收方式 | browser 真实点击(chrome-devtools MCP 可用,本会话已用)+ RPC/CLI 取证 + 单测 |
| 必须覆盖用户场景 | UF-201 打开工作台、UF-202 新建人设并对话、UF-203 双人设隔离、UF-204 编辑人设、UF-205 会话管理与补标、UF-206 删除人设 |

### 1.3 勘察事实清单

> 本轮实际执行命令(含浏览器实测)+ 两份调研的已抽验结论。路径相对本仓根。

| 事实 | 来源命令 | 输出摘要 |
|---|---|---|
| 参考产品布局:两栏(roster 280px/折叠 88px + 对话舞台)+ 按需 320px info 面;roster 行 = 头像+名字+预览(draft→waiting→lastMessage 优先序)+相对时间+状态点;身份呈现集中在 roster 行/Chat Header/Composer 占位符,气泡旁不重复大头像 | 子代理调研,报告落盘 `reference-ui-notes.md`(§A/B/D,文件路径逐条附) | 设计形状可直接采用 |
| 参考产品人设最小集 = name + title + description;头像 = 照片 → 程序化 shape×color(id 哈希回退);新建 = `createAgent({name,description,…})` 后立即进入空对话 | `reference-ui-notes.md` §B3/C2(agent-info/settings/model.ts、onboarding) | 二期人设模型按此裁剪 |
| 页签内嵌 iframe 已有生态实证:genoffice 自注册页签组件用 `useRef<HTMLIFrameElement>` 嵌外部页;sidebar 内置浏览器 tab 拒绝 localhost,但**自有页签组件不受限** | `rg iframe ../../dsh-genoffice/plugin/packages/tab-genoffice/src/`(control-mode.tsx);Read gb node_modules 的 dsh-better-sidebar README | iframe 方案可行 |
| host 经 `webServer` 注入服务 HTTP 路由与 SSE 已有实证(vibee-viz `static inject` 含 webServer;`/vibee/events` EventSource) | `rg webServer ../../vibee/plugin/packages/vibee-viz/src/index.ts`(L55);v1 调研 runs-client.ts L126 | 静态页 + API 同通道服务 |
| 网关 `session.create` 支持显式 `agentPreset` 参数(实测拿 minimal 建会话成功回显) | `dsh-rpc.sh 3084 session.create '{"cwd":…,"agentPreset":"minimal"}'`(2026-08-30 00:57) | 每人设一 preset 的创建通道成立 |
| v1 已建成并验收通过:`dsh-bot-host`(Service L87、webServer 注入 L121、askBot/createSession/listSessions、`platform.ts` 网关调用封装、`routes.ts` 挂 `/dsh-bot/<method>` L108)、`ui-dsh-bot` 页签、marks `kind:dsh-bot` 体系、`dsh-bot` preset(persona 行) | `rg 'class DshBotService' packages/dsh-bot-host/src/index.ts`;本会话验收实测(GUI 对话/委托/页签截图取证) | 二期在其上扩展,不推倒 |
| v1 验收缺口(本包要修):GUI 直建的 preset 会话不打 `kind:dsh-bot` 标记,页签列表看不到 | 本会话验收:RPC 建会话 `session-4eb8a30c…` 未出现在 `/dsh-bot/listSessions` | BR-203 双通道归属 |
| preset 目录在 `env/.agent-presets/<id>/`,roster 每次调用重新扫描(免重启发现);人设文本在 `agent.cordis.yml` 的 `- id: persona` 行 `config.text`;`agentPreset.copy/remove` RPC 在(v1 Task 6 用过 copy) | v1 勘察(dsh-agent-presets README)+ `rg dsh-persona env/.agent-presets/dsh-bot/agent.cordis.yml` | 人设 CRUD 的落地面 |
| 会话历史读取:`sessionTool.read` 本地投影(离线可用)与网关 `session.history`(事件+投影)都可用;working 判定可由 turn/start 未闭合推导 | v1 设计文档 + 本会话 `dsh-rpc.sh 3084 session.history` 实测(events 嵌套 `{"event":{…}}`) | transcript 数据源成立 |
| 页签轮询模式已实证(vibee 2s 轮询 + 面板收起暂停;v1 页签同款) | v1 调研 runs-client.ts(L11 POLL_MS) | 工作台 MVP 用轮询,SSE 列为非目标 |
| 网关口 3084/profile gb 运行中,身份属本仓;模型面 anthropic/grok-4.6(用户中转)可用 | `dsh-rpc-who.sh 3084`;本会话 GUI 实测回复 | 环境就绪 |

### 1.4 假设清单

| 假设 ID | 内容 | 风险 | 确认方式 |
|---|---|---|---|
| ASM-201 | 存在可行的「会话 → agentPreset」反查通道供补标对账:候选 ① `session.list` RPC 行携带 preset 字段;② 对未知会话逐个 `session.history {maxMessages:1}` 读 header(有界:只对新增未标会话);③ `workspace.list`/其他投影携带 | 若 ①③ 均无,走 ②(成本可控,缓存已判会话);②也不可行则 GUI 直建会话仅按「未归属」列示,BR-203 相应收缩 | Task 1 勘察点名字段与调用形状 |
| ASM-202 | host 程序化生成/改写 bot preset 文件安全可行:以本仓自有 `env/.agent-presets/dsh-bot/agent.cordis.yml` 为模板(整文件生成,persona 文本经 YAML 安全转义,不做原地 YAML surgery),roster 免重启发现新 preset | 生成文件不可加载 → roster 列 broken;由「写后立即 `agentPreset.list` 校验非 broken + 失败回滚删除目录」兜底 | Task 5 实现即验证(写后校验是任务验证项) |
| ASM-203 | iframe 内页面对同源 `/dsh-bot/*` 的 fetch 不受页签沙箱限制(genoffice iframe 同款场景已跑通其 API) | 若受限,改为页签直开浏览器标签为主入口(BR-204 仍成立) | Task 2 骨架页在 iframe 内 fetch listBots 实测 |

### 1.5 变更记录

(首次生成,暂无。)

---

## 2. 业务合同

> BR/UF/INV/EVD 唯一定义处。v1 合同见 `../dsh-bot-mvp/spec.md`(引用 v1 条目时用描述性名称 + 该路径,不直写其条目编号——校验器要求本包编号闭环)。

### 2.1 BR 业务规则

| 规则 ID | 规则 | 正例 | 反例 | 影响范围 | 验证方式 |
|---|---|---|---|---|---|
| BR-201 | 人设注册表单一事实源:bot 清单存 `$DSH_HOME/dsh-bot/bots.json`(host 独有读写),行形状 `{id, name, avatar:{emoji?,color}, presetId, modelOverride?, createdAt}`;**人设文本不入注册表**,唯一事实源是该 bot 的 preset 文件 persona 行;首次启动种子默认 bot(id `dsh-bot`,绑既有 `dsh-bot` preset) | 重启后 roster 不变;删注册表文件后重启只剩种子 bot | 人设文本在 registry 和 preset 两处各存一份 | dsh-bot-host | Task 5 单测 + 重启验证 |
| BR-202 | 一人设一 preset:新建人设 → 以 `dsh-bot` preset 为模板生成 `env/.agent-presets/dsh-bot--<slug>/`(id 前缀 `dsh-bot--` 标识自动管理)并写 persona;写后立即 `agentPreset.list` 校验非 broken,失败回滚;编辑人设 = 重写该文件(平台代际规则:只影响其后新会话);删除人设 = 注册表移除 + preset 目录删除 | 新建后 `agentPreset.list` 出现 `dsh-bot--<slug>` 非 broken | 手改官方随附 preset;编辑后声称对进行中会话生效 | dsh-bot-host + env | Task 5 + UF-202/204 矩阵 |
| BR-203 | 会话归属双通道:工作台创建的会话经网关 `session.create {agentPreset, cwd}` + marks `[kind:dsh-bot, bot:<id>]`;**GUI 直建**的 bot preset 会话由 host 对账补标(按 ASM-201 通道反查 preset → 补 marks;打开工作台与定时触发);对账幂等 | GUI 新建 dsh-bot 会话后打开工作台,出现在默认 bot 对话列表 | 重复补标产生重复行;把非 bot preset 会话误标 | dsh-bot-host | Task 8/12 + UF-205 矩阵 |
| BR-204 | 独立面等价性:工作台页面由 host `webServer` 服务于 `GET /dsh-bot/ui`(loopback-only);右栏页签 = iframe 嵌同一 URL;**两个入口功能等价**(roster/对话/人设 CRUD 全可用) | 浏览器直开与页签内操作产生同样的会话与标记 | 页签里可用、直开缺功能(或反之) | workbench-ui + ui-dsh-bot | UF-201 矩阵双入口行 |
| BR-205 | 对话呈现契约(按 `reference-ui-notes.md` §D 裁剪):Header = 当前 bot 头像+名字+working 态;消息按角色分侧,assistant 侧不重复大头像;thinking 与工具调用折叠为一行摘要;生成中显示三点/工作中;composer 占位「给 `{name}` 发消息」、按 bot 隔离草稿、running 时禁发;**消息级刷新(轮询 ≤2s)**,token 级流式为非目标 | 发消息后 ≤2s 内看到用户气泡,回复落地后 ≤2s 上屏 | 工具调用原文全量刷屏;A bot 的草稿出现在 B bot | workbench-ui | UF-202/203 矩阵 |
| BR-206 | 身份视觉:头像 = emoji(可选)或「首字 + 确定性色块」(botId 哈希→8 色板);名字出现在 roster 行/Header/composer 占位符;roster 行含最后消息预览与相对时间、working 点 | 两个 bot 在 roster/Header 一眼可分 | 所有 bot 同一头像;头像需上传图片才可用 | workbench-ui | UF-203 矩阵 + 截图 |
| BR-207 | 红线延续(v1 的凭据纪律与参考只读红线,原文见 `../dsh-bot-mvp/spec.md` 第 2.1 节):不拷参考树代码/品牌;凭据不入 git;不改官方 DSH 包与邻仓;工作台新增面全部 loopback | `rg -i 'anysphere\|sand://' packages/` 为空 | — | 全仓 | Task 19 终检 |
| BR-208 | v1 兼容:`dsh_bot_ask`、`dsh-bot.model` override、marks CLI、默认 preset 会话链路零回归;v1 页签的「会话列表」职能由工作台取代,页签 id 保留、内容换 iframe;委托隐藏会话(kind:hidden)在工作台默认不显示(开关可见) | v1 spec 5.2 矩阵主路径复跑全过 | 改坏 askBot/override | 全仓 | Task 19 回归 |

### 2.2 UF 用户验收场景(索引)

| 场景 ID | Given | When | Then | 角色 | 验证方式 | Evidence |
|---|---|---|---|---|---|---|
| UF-201 | 网关已起,工作台已挂载 | 经右栏页签与浏览器直开两个入口打开工作台 | 双入口均见 roster(含默认 DSH Bot)与对话面,功能等价 | 本机用户 | browser | EVD-201 |
| UF-202 | 工作台已打开 | 点「新建人设」填名字/人设/头像 → 立即对话 | roster 出现新 bot 并自动进入其空会话;发消息后以新人设口吻回复,Header/占位符显示新 bot 身份 | 本机用户 | browser + RPC 取证 | EVD-202 |
| UF-203 | 存在人设 A(默认)与人设 B | 在 A、B 之间切换并各自对话 | 两侧历史/人设口吻/草稿完全隔离;roster 预览与时间各自更新;working 点只亮在生成中的 bot | 本机用户 | browser + `session.export` 对比 | EVD-203 |
| UF-204 | 人设 B 已有会话 | 编辑 B 的人设文本与名字/头像 | 名字/头像即时反映;人设文本对**其后新会话**生效(旧会话保持原口吻),UI 有此提示 | 本机用户 | browser + RPC 取证 | EVD-204 |
| UF-205 | 官方 GUI 直建了一个 dsh-bot preset 会话 | 打开工作台(触发对账) | 该会话出现在默认 bot 的对话列表;同一 bot 可「新开对话」并在历史对话间切换 | 本机用户 | browser + marks CLI | EVD-205 |
| UF-206 | 人设 B 存在且有会话 | 删除人设 B(确认对话框) | roster 移除 B,其 preset 目录删除;B 的历史会话保留(官方 GUI 仍可见),工作台不再显示 | 本机用户 | browser + `agentPreset.list` | EVD-206 |

### 2.3 核心业务流程(步骤级交互脚本)

#### UF-201: 打开工作台(双入口)

**前置状态**:`sh env/boot.sh` 已起(:3084);工作台已随 profile 挂载。

**成功主路径**:

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 右栏「+」→ DSH Bot 页签 | 页签打开,iframe 加载工作台 | iframe src=`/dsh-bot/ui`;页面 fetch listBots | 左 roster(默认 DSH Bot 行:头像/名字/预览/时间)+ 右对话面 |
| 2 | 浏览器新标签直开 `http://127.0.0.1:3084/dsh-bot/ui` | 同一工作台完整渲染 | 同上 | 与页签内容一致(BR-204) |
| 3 | 点 roster 的 DSH Bot 行 | 行高亮选中 | 加载其最新会话历史 | 对话面 Header 显示 DSH Bot 身份与历史消息 |

**失败分支**:

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 网关死 | boot 未起/重启中 | 页面加载失败或 roster 错误态 + 重试按钮 | fetch 失败 → 错误态(不白屏) | boot 后重试按钮恢复 |
| 空注册表异常 | bots.json 损坏 | roster 显示错误态与说明 | host 按损坏文件兜底(报错不崩,提示重建种子) | 按提示重置注册表 |

**界面状态机**:

```text
loading → roster+对话(idle) ⇄ 轮询刷新
   |
   v
 错误态(重试)
```

**入口接线清单**:

- 右栏页签(ui-dsh-bot registerTab → iframe,Task 3)
- 浏览器直开 URL(host 静态路由,Task 2)
- README「日常使用」节写明两个入口(Task 17)

#### UF-202: 新建人设并对话

**前置状态**:工作台已打开。

**成功主路径**:

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 点 roster 顶部「+ 新建人设」 | 弹出表单(名字、人设文本多行、头像选择、可选模型) | — | 表单就绪,头像默认按名字首字+色块预览 |
| 2 | 填「诗人小北 / 你是一位…(人设)」点「创建」 | 按钮 loading 防重 | `createBot`:生成 preset(BR-202)→ 校验非 broken → 注册表落盘 | roster 出现「诗人小北」行并自动选中,进入空会话 |
| 3 | 在 composer 输入「你是谁?」回车 | 用户气泡上屏,出现三点工作中 | `createBotSession {botId}`(带 preset+marks)→ `prompt` | ≤2s 轮询内出现回复,口吻为新人设;Header 显示「诗人小北」 |

**失败分支**:

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 名字/人设为空 | 提交空必填 | 表单行内校验提示,不发请求 | — | 补填 |
| preset 生成失败 | 写盘/校验 broken | 表单错误条:点名原因;roster 不出现残行 | host 回滚删除 preset 目录与注册表行(BR-202) | 改名/重试 |
| 模型失败 | 上游 4xx/超时 | 对话面错误卡片,可重发 | turn 失败,错误码呈现 | 重试或换模型 |

**界面状态机**:

```text
表单 idle → 提交中 → 成功(切入新 bot 空会话)
      |         |
      v         v
   行内校验   错误条(可重试,零残留)
```

**入口接线清单**:

- roster「+ 新建人设」按钮(Task 6)→ `POST /dsh-bot/createBot`(Task 5)
- 新会话链:`POST /dsh-bot/createBotSession` → prompt(Task 8/10)

#### UF-203: 双人设各自对话(隔离)

**前置状态**:存在默认 DSH Bot 与「诗人小北」,各有 ≥1 条会话。

**成功主路径**:

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 选中 DSH Bot,输入草稿不发送 | composer 留有草稿 | 草稿按 botId 隔离存储 | — |
| 2 | 切到「诗人小北」 | Header/历史切换为小北 | 加载小北最新会话 | composer 为空(A 的草稿不串) |
| 3 | 问小北「你是谁?」 | 三点工作中(仅小北 roster 行亮点) | prompt → 轮询 | 小北人设口吻回复;DSH Bot 行无变化 |
| 4 | 切回 DSH Bot | 草稿恢复;历史仍是 DSH Bot 的 | — | 两侧身份/历史/草稿互不串 |

**失败分支**:

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 同时生成 | A、B 都在跑 | 两行各自 working 点;切换不阻塞 | 会话独立(v1 并发边界:互不写同会话) | 各自完成各自落地 |
| 会话加载失败 | 该会话被外部删除 | 对话面错误态 + 「新开对话」引导 | history 读取失败呈现 | 新开对话 |

**界面状态机**:

```text
bot A(idle/working) ⇄ 切换 ⇄ bot B(idle/working)   // 状态互不影响
```

**入口接线清单**:

- roster 行点击切换(Task 6)+ 草稿隔离(Task 10)+ working 点(Task 9)

#### UF-204: 编辑人设

**前置状态**:「诗人小北」存在且有历史会话。

**成功主路径**:

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | roster 行菜单/Header →「编辑人设」 | 侧滑面板:名字/人设文本(从 preset 读回显)/头像/模型 | `GET`(listBots + persona 读取) | 表单带当前值 |
| 2 | 改名字与人设文本,保存 | 保存 loading;成功后面板收起 | `updateBot`:重写 preset persona + 注册表(名字/头像) | roster 与 Header 即时显示新名;提示条「人设对之后的新对话生效」 |
| 3 | 「新开对话」发一句 | 新会话 | 新会话按新代际组装 | 回复呈现新人设口吻;旧会话继续旧口吻(BR-202) |

**失败分支**:

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 写盘失败 | 磁盘/权限异常 | 面板错误条,原值不变 | preset 文件回滚(临时文件替换法) | 重试 |
| 校验 broken | 生成文件不可加载 | 错误条点名原因 | 回滚旧文件(BR-202) | 修正人设文本重试 |

**界面状态机**:

```text
面板 idle → 保存中 → 成功(收起+提示生效边界)
                |
                v
              错误条(原值保留)
```

**入口接线清单**:

- roster 行菜单 + Header 身份区点击(Task 6/13)→ `POST /dsh-bot/updateBot`(Task 5)

#### UF-205: 会话管理与 GUI 会话补标

**前置状态**:官方 GUI(:3084 主界面)直建过一个 dsh-bot preset 会话并聊过;工作台此前未打开。

**成功主路径**:

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 打开工作台 | roster 加载 | 打开时触发补标对账(ASM-201 通道):发现未标的 bot preset 会话 → 补 `kind:dsh-bot, bot:<id>` | 默认 bot 的对话列表含该 GUI 会话 |
| 2 | Header 的「对话」下拉 | 列出该 bot 全部会话(时间倒序,隐藏会话不列) | listBotSessions {botId} | 可切换历史会话 |
| 3 | 点「新开对话」 | 空对话面 | createBotSession | 新会话就绪可聊 |

**失败分支**:

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 反查通道缺失 | ASM-201 三候选全不可行 | GUI 会话列入「未归属」分组并有说明 | BR-203 收缩(按变更协议) | 文档写明边界 |
| 对账中途网关重启 | boot 重启 | 列表错误态可重试 | 对账幂等,下次打开补齐 | 重试 |

**界面状态机**:

```text
打开 → 对账中(不阻塞渲染) → 列表就绪 ⇄ 切换会话/新开
```

**入口接线清单**:

- 工作台打开时对账钩子(Task 12)+ Header 会话下拉与「新开对话」(Task 8/9)

#### UF-206: 删除人设

**前置状态**:「诗人小北」存在且有会话。

**成功主路径**:

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 行菜单「删除人设」 | 确认对话框:写明「历史对话保留,仅移除人设与其 preset」 | — | 二次确认 |
| 2 | 确认 | 行消失;若正选中则切回默认 bot | 注册表移除 + preset 目录删除(`agentPreset.remove` 或等价文件删除);marks 保留 | roster 无小北;`agentPreset.list` 无 `dsh-bot--xiaobei` |

**失败分支**:

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 删默认 bot | 对默认 bot 触发删除 | 菜单置灰/提示不可删 | 默认 bot 受保护(种子) | — |
| preset 删除失败 | 文件系统异常 | 错误条;注册表不变 | 先删 preset 成功再落注册表(顺序保证零半删) | 重试 |

**界面状态机**:

```text
确认框 → 删除中 → 完成(切回默认) / 错误条(状态不变)
```

**入口接线清单**:

- roster 行菜单(Task 6)→ `POST /dsh-bot/deleteBot`(Task 5)

### 2.4 INV 不变量

| 不变量 ID | 内容 | 关联 BR/UF | 验证方式 |
|---|---|---|---|
| INV-201 | v1 全部用户可见行为不回归:`dsh_bot_ask` 委托、`dsh-bot.model` override 三态、marks CLI、GUI 直建会话默认 preset(v1 spec 5.2 主路径矩阵) | BR-208 | Task 19 复跑 v1 关键行 |
| INV-202 | 官方 DSH 包与邻仓零改动;官方会话栏行为不变(工作台建的可见会话正常显示、`~` 隐藏会话不显示) | BR-207 | `git -C ../../session-tool/plugin status --porcelain` 三连 + 官方栏截图 |
| INV-203 | 一口一仓不变:仍只有 :3084,工作台不自开端口 | BR-204 | `lsof` + `dsh-rpc-who.sh` |
| INV-204 | 数据纪律:bots.json 在 `$DSH_HOME/dsh-bot/` 下(gitignore 的 env 运行数据);自动 preset 目录同属 env 运行数据不入 git | BR-201/202 | `git status --porcelain` 为空 |

### 2.5 EVD 证据清单

| 证据 ID | 类型 | 期望证据 | 保存位置 |
|---|---|---|---|
| EVD-201 | screenshot+log | 双入口(页签 iframe / 浏览器直开)工作台渲染截图 + listBots 请求样例 | `evidence/UF-201/` |
| EVD-202 | screenshot+log | 新建人设表单、roster 新行、新人设口吻回复截图 + 该会话 `session.export` | `evidence/UF-202/` |
| EVD-203 | screenshot+log | A/B 切换四步截图(草稿隔离、working 点)+ 两会话 export 对比 | `evidence/UF-203/` |
| EVD-204 | screenshot+log | 编辑面板、生效提示、新旧会话口吻对比 | `evidence/UF-204/` |
| EVD-205 | log+screenshot | GUI 直建会话补标前后 `marks list` 输出对比 + 工作台列表截图 | `evidence/UF-205/` |
| EVD-206 | screenshot+log | 删除确认、roster 移除、`agentPreset.list` 前后对比 | `evidence/UF-206/` |
| EVD-207 | log | 单测/构建/standard:check/回归命令输出 | `evidence/phase-0/`…`evidence/phase-4/` |

### 2.6 角色与权限矩阵

单一角色(本机用户);会话/preset 操作全在本机 loopback 网关内,无新权限面。

### 2.7 负向 / 破坏性场景

| 场景 | Given | When | Then | Evidence |
|---|---|---|---|---|
| 依赖失败 | 网关重启中 | 工作台任意操作 | 错误态可重试,不白屏不丢草稿 | `evidence/UF-201/gateway-down.png` |
| 非法输入 | 人设名超长/空、人设文本含 YAML 注入字符(`"""`、`!!js` 等) | 创建/编辑 | 行内校验或安全转义,生成的 preset 永不 broken(broken 即回滚) | `evidence/UF-202/invalid-input.md` |
| 重复提交 | 连点「创建」 | createBot | 防重(loading 锁),注册表无重复行 | `evidence/UF-202/double-submit.md` |
| 并发生成 | 两 bot 同时对话 | 各自轮询 | 互不干扰(v1 并发边界延续) | `evidence/UF-203/concurrent.md` |
| 空数据 | 全新 env 首次打开 | 工作台 | 种子默认 bot 在位,空会话引导 | `evidence/UF-201/first-run.png` |
| 旧数据兼容 | v1 已产生的 `kind:dsh-bot` 会话(无 `bot:` 标) | 打开工作台 | 对账归入默认 bot(其 preset 即 dsh-bot),不丢不重 | `evidence/UF-205/v1-sessions.md` |

### 2.8 非目标

- **token 级流式**:MVP 为 ≤2s 消息级刷新 + 工作中指示;网关推流的接入列为后续增强(不在本包)。
- **SSE**:轮询已满足页签实证;SSE 通道不做。
- **头像图片上传、reactions、群聊/共享房间、频道(Slack 等)、Computer/VNC 面、语音**:参考产品桌面能力,不做(`reference-ui-notes.md` §E 砍项)。
- **官方会话栏/官方 conversation 视图改造**:不动;工作台是独立面。
- **多用户/鉴权**:loopback 单用户。

---

## 3. 技术方案

### 3.1 架构 Before / After

```text
Before(v1):
dsh-bot-host ── /dsh-bot/{listSessions,createSession} ──> ui-dsh-bot 页签(React 列表)
     │                                                        (跳转官方会话视图)
     └─ askBot(sessionTool)· marks kind:dsh-bot · settings dsh-bot.model

After(v2):
dsh-bot-host ─┬─ 静态:GET /dsh-bot/ui(workbench-ui 构建产物,单页应用)
              ├─ API:POST /dsh-bot/{listBots,createBot,updateBot,deleteBot,
              │        listBotSessions,createBotSession,history,prompt,reconcile}
              ├─ bots 注册表($DSH_HOME/dsh-bot/bots.json;种子默认 bot)
              ├─ preset 工厂(模板生成 env/.agent-presets/dsh-bot--<slug>/;写后校验)
              └─ 补标对账(ASM-201 通道;打开时+幂等)
workbench-ui(新包,浏览器 SPA):roster(280px)+ 对话面(Header/Transcript/Composer)
ui-dsh-bot 页签:内容替换为 <iframe src="/dsh-bot/ui">(genoffice 模式;tab id 不变)
会话链:createBotSession → 网关 session.create{agentPreset,cwd}(platform.ts 扩展)
        + marks [kind:dsh-bot, bot:<id>] → prompt/read 沿 v1 通道
```

### 3.2 模块改造

| 模块 | 职责 | 改造说明 |
|---|---|---|
| `packages/dsh-bot-host/src/bots.ts` | 注册表 + preset 工厂 + 校验回滚 | 新建;模板源 = 本仓 `env/.agent-presets/dsh-bot/agent.cordis.yml`(整文件生成,persona 经 YAML 安全字符串化) |
| `packages/dsh-bot-host/src/platform.ts` | 网关调用封装 | 扩展:`session.create` 携带 `agentPreset`(实测已支持);会话→preset 反查(ASM-201 结论) |
| `packages/dsh-bot-host/src/workbench-routes.ts` | 工作台 API + 静态服务 | 新建;沿 `routes.ts` 的 `{args}`/`{ok,value|error}` wire;静态文件读 workbench-ui 构建产物 |
| `packages/dsh-bot-host/src/reconcile.ts` | 补标对账 | 新建;幂等,新增会话增量处理 |
| `packages/workbench-ui/` | 工作台 SPA(React,tsdown 浏览器构建,产物含 index.html+bundle) | 新建;布局/交互按 `reference-ui-notes.md` §A/B/D 与 §E 裁剪表 |
| `packages/ui-dsh-bot/src/client/DshBotTab.tsx` | 页签内容 | 改造:列表 UI 替换为 iframe(保留 tab id/badge;样板 genoffice control-mode.tsx) |
| `env/` | 运行数据 | 新增 `$DSH_HOME/dsh-bot/bots.json`(运行时生成,不入 git);自动 preset 目录同 |
| `scripts/manual-test.sh` | 验收矩阵 | 扩展:workbench API 矩阵(createBot→createBotSession→prompt→history→deleteBot) |

### 3.3 三段式定位清单

> 锚点书写约定同 v1:裸 `rg "pattern" <相对路径>` 行参与 `--repo` 真跑;新建文件与含 `@`/`~` 路径的行写 `rg -F` 形式(校验器按设计跳过)。

| 文件 | 稳定定位 | 搜索定位 | 行号 hint | 备注 |
|---|---|---|---|---|
| `packages/dsh-bot-host/src/index.ts` | `class DshBotService` | `rg "class DshBotService" packages/dsh-bot-host/src/index.ts` | L87 | 既有:服务本体与 webServer 注入(L121) |
| `packages/dsh-bot-host/src/routes.ts` | `/dsh-bot/<method>` 挂载 | `rg "dsh-bot/" packages/dsh-bot-host/src/routes.ts` | L108 | 既有:wire 形状样板,v2 API 沿用 |
| `packages/dsh-bot-host/src/platform.ts` | 网关调用封装 | `rg "session.create" packages/dsh-bot-host/src/platform.ts` | — | 既有:v2 扩展 agentPreset 参数 |
| `packages/dsh-bot-host/src/marks.ts` | marks 合并助手 | `rg "kind:dsh-bot" packages/dsh-bot-host/src/marks.ts` | — | 既有:v2 增 `bot:<id>` token |
| `packages/ui-dsh-bot/src/client/DshBotTab.tsx` | 页签组件 | `rg "DshBotTab" packages/ui-dsh-bot/src/client/DshBotTab.tsx` | — | 既有:改 iframe |
| `../../dsh-genoffice/plugin/packages/tab-genoffice/src/tabs/control-mode.tsx` | `HTMLIFrameElement` | `rg "HTMLIFrameElement" ../../dsh-genoffice/plugin/packages/tab-genoffice/src/tabs/control-mode.tsx` | — | 样板:页签内 iframe |
| `../../vibee/plugin/packages/vibee-viz/src/index.ts` | `static inject` 含 webServer | `rg "webServer" ../../vibee/plugin/packages/vibee-viz/src/index.ts` | L55 | 样板:host 服务 HTTP 面 |
| `env/.agent-presets/dsh-bot/agent.cordis.yml` | `- id: persona` 行 | `rg "dsh-persona" env/.agent-presets/dsh-bot/agent.cordis.yml` | L24-28 | 既有:preset 模板源 |
| `docs/dsh-bot-workbench/reference-ui-notes.md` | 布局/数据形状/裁剪表 | `rg "整体布局图" docs/dsh-bot-workbench/reference-ui-notes.md` | §A-E | 设计素材(本包内) |
| `docs/dsh-bot-mvp/spec.md` | v1 合同(相对仓根) | `rg "dsh-bot-mvp Spec" docs/dsh-bot-mvp/spec.md` | 第 2 章 | v1 兼容基线 |
| `packages/dsh-bot-host/src/bots.ts` | 新建:注册表+preset 工厂 | 建成后 `rg -F "bots.json" packages/dsh-bot-host/src/bots.ts` | 新建 | Task 5 |
| `packages/dsh-bot-host/src/workbench-routes.ts` | 新建:API+静态 | 建成后 `rg -F "/dsh-bot/ui" packages/dsh-bot-host/src/workbench-routes.ts` | 新建 | Task 2/5/8 |
| `packages/dsh-bot-host/src/reconcile.ts` | 新建:补标对账 | 建成后 `rg -F "reconcile" packages/dsh-bot-host/src/reconcile.ts` | 新建 | Task 12 |
| `packages/workbench-ui/src/App.tsx` | 新建:SPA 根 | 建成后 `rg -F "roster" packages/workbench-ui/src/App.tsx` | 新建 | Task 2/6/9/10 |

### 3.4 API / 数据 / 权限 / 路由影响

| 类型 | 是否影响 | 说明 | 兼容策略 |
|---|---|---|---|
| API | 新增 | `/dsh-bot/ui` 静态 + 9 个 POST 方法(3.1 列表);v1 `/dsh-bot/listSessions|createSession` 保留 | 新增面;wire 形状与 v1 一致 |
| 数据 | 新增 | `$DSH_HOME/dsh-bot/bots.json`;marks 新 token `bot:<id>`;自动 preset 目录 `dsh-bot--*` | 普通 marks;运行数据不入 git |
| 权限 | 否 | loopback 内单用户 | — |
| 路由(口) | 否 | 全部经 :3084 既有网关 | — |

---

## 4. Phase 计划与任务详情

> Phase 依赖链:

```text
P0 勘察与骨架(T1-T4) → P1 人设注册表(T5-T7) → P2 对话面(T8-T11)
  → P3 身份与对账(T12-T15) → P4 收尾与真实验收(T16-T19)
```

> 实现任务数 12 ≥ 8 → 状态板用 `tasks.csv`。状态列严格枚举;每完成一条立即更新。

### Phase 0: 勘察与骨架

> 你在哪里:v1 可用;工作台不存在。
> 做完之后:空壳工作台双入口可开(roster 空态),三条 ASM 全消解。

### Task 1: 勘察校准——会话反查通道/turn 状态/iframe 行为

- **关联**:ASM-201 / ASM-203;支撑 BR-203/205(UF 无:校准)
- **前置任务**:无
- **风险等级**:P1

**为什么做**:补标对账(BR-203)与 working 判定(BR-205)的实现路径取决于这三条机制事实。

**涉及文件与定位**:运行中 :3084 网关(dsh-plugin-debug 工具);`../../session-tool/plugin/packages/session-tool-local/src/`(list 投影字段参考)

**具体操作**:

1. `dsh-rpc.sh 3084 session.list '{}'` 看行字段:有无 agentPreset(ASM-201 候选①);无则测 `session.history {maxMessages:1}` 读 header preset 的成本(候选②),点名最终通道。
2. 用运行中的会话核 `session.history` 尾页投影/事件序列,确定「working」的判定条件(turn/start 未闭合或 sessionStats 状态字段),写明字段名。
3. 写一个最小 HTML 临时挂上 host 路由,在页签 iframe 内 fetch `/dsh-bot/listSessions` 实测同源可达(消解 ASM-203;临时物不入 git)。
4. 结论回写 1.3/1.4。

**验证**:三条 ASM 在 1.4 消解或按风险栏改写 → 期望零残留

**Evidence**:`evidence/phase-0/calibration.md`

**注意事项**:打 RPC 前先 `dsh-rpc-who.sh 3084` 核身份。

### Task 2: workbench-ui 包骨架与静态服务

- **关联**:BR-204 / UF-201
- **前置任务**:1
- **风险等级**:P1

**为什么做**:独立展示面的载体;先上空壳,后续任务往里填。

**涉及文件与定位**:

- 新建 `packages/workbench-ui/`(package.json、tsconfig、src/App.tsx、src/main.tsx、src/api.ts、index.html、styles);tsdown 浏览器构建出 `lib/`(index.html + bundle.js + css)
- 新建 `packages/dsh-bot-host/src/workbench-routes.ts` 静态部分:`GET /dsh-bot/ui`(html)与 `GET /dsh-bot/ui/*`(资产),读 workbench-ui 构建产物(经 node require.resolve 包内路径)
- 样板:`../../vibee/plugin/packages/vibee-viz/src/index.ts`(webServer 注入)

**具体操作**:

1. SPA 骨架:两栏布局(roster 280px + 对话面,`reference-ui-notes.md` §A 尺寸),roster 空态与错误态,`api.ts` 封装 `{args}` POST(v1 rpc.ts 同款 wire)。
2. host 静态路由挂载(webServer 可选注入内,与既有 routes.ts 并列);Content-Type 正确,禁目录穿越(路径白名单)。
3. profile 重建重启,浏览器直开与 iframe 内(Task 1 的临时挂载点)各验一次渲染。

**验证**:`pnpm --filter workbench-ui run build && pnpm --filter dsh-bot-host run build` 全绿;`curl -s http://127.0.0.1:3084/dsh-bot/ui | head -1` → 期望 `<!doctype html>` 开头

**Evidence**:`evidence/phase-0/skeleton.png` + `evidence/phase-0/static-route.log`

**注意事项**:资产路径只允许构建产物目录内(防穿越);iframe 高度 100% 撑满页签。

### Task 3: 页签替换为 iframe 嵌入

- **关联**:BR-204 / BR-208 / UF-201
- **前置任务**:2
- **风险等级**:P2

**为什么做**:页签是日常入口;v1 列表职能由工作台取代。

**涉及文件与定位**:

- 修改 `packages/ui-dsh-bot/src/client/DshBotTab.tsx`(列表替换为 iframe;保留 tab id 常量与 badge 逻辑)
- 样板:`../../dsh-genoffice/plugin/packages/tab-genoffice/src/tabs/control-mode.tsx`(iframe ref/加载态)

**具体操作**:

1. Tab 组件改为 `<iframe src="/dsh-bot/ui">` + 加载态/网关死错误态;移除旧列表渲染(rpc.ts 保留给 badge 计数用)。
2. 重建 client 重启,页签实测(强刷浏览器,注意 boot rev 缓存)。

**验证**:`pnpm --filter ui-dsh-bot run build && pnpm --filter ui-dsh-bot test` 全绿;页签内见工作台空壳 → 期望与直开一致

**Evidence**:`evidence/phase-0/tab-iframe.png`

**注意事项**:iframe 不加 `allow-same-origin` 削减(自有页面同源即可);badge 轮询保留面板收起暂停。

### Task 4: 执行 Phase 0 回归验证

- **关联**:本 Phase 全部条目 + INV-203
- **前置任务**:2;3

**验证**:重启 boot 后双入口空壳复现 + `pnpm -r run build && pnpm -r test` + v1 页签→工作台切换无 console error

**Evidence**:`evidence/phase-0/phase-summary.md`

### Phase 1: 人设注册表与 roster

> 你在哪里:空壳工作台。
> 做完之后:能新建/编辑/删除人设,roster 按参考形状渲染。

### Task 5: host 人设注册表与 preset 工厂

- **关联**:BR-201 / BR-202 / UF-202 / UF-204 / UF-206
- **前置任务**:4
- **风险等级**:P0(核心)

**为什么做**:多人设的数据与生命周期核心;preset 生成的健壮性决定整个产品可靠性。

**涉及文件与定位**:

- 新建 `packages/dsh-bot-host/src/bots.ts`;扩展 `workbench-routes.ts`(listBots/createBot/updateBot/deleteBot);`packages/dsh-bot-host/src/index.ts` 服务面扩展
- 模板源:`env/.agent-presets/dsh-bot/agent.cordis.yml`(persona 行 L24-28)

**具体操作**:

1. `bots.ts`:注册表读写(`$DSH_HOME/dsh-bot/bots.json`,原子写:临时文件+rename);种子默认 bot(id `dsh-bot`,presetId `dsh-bot`,受删除保护);slug 生成(`[a-z0-9-]`,冲突追号)。
2. preset 工厂:读模板文件 → 替换 persona 行 `config.text`(整文件文本生成,persona 用 YAML 单引号安全转义,拒绝控制字符)→ 写 `env/.agent-presets/dsh-bot--<slug>/`(agent.cordis.yml + preset.yml 带名字)→ `agentPreset.list` 校验非 broken,broken 即删目录回滚并报错(BR-202/2.7 非法输入)。
3. update:名字/头像/模型进注册表;persona 重写 preset(同校验回滚);delete:先删 preset 目录再落注册表(顺序防半删),默认 bot 拒绝。
4. persona 读回:从 preset 文件解析 persona 行文本(编辑表单回显)。
5. 单测:种子/CRUD/slug 冲突/YAML 注入字符转义/broken 回滚/默认保护(stub agentPresets 校验)。

**验证**:`pnpm --filter dsh-bot-host run build && pnpm --filter dsh-bot-host test` → 期望全绿

**Evidence**:`evidence/phase-1/bots-unit.log`

**注意事项**:modelOverride 语义沿 v1 的 bot 专属模型规则(空=跟随全局;创建会话时经 platform 应用;原文见 `../dsh-bot-mvp/spec.md` 2.1 节);注册表损坏按 2.7 兜底报错不崩。

### Task 6: roster UI 与人设表单

- **关联**:BR-205 / BR-206 / UF-202 / UF-204 / UF-206
- **前置任务**:5
- **风险等级**:P1

**为什么做**:用户可见的人设管理面;行结构照参考形状。

**涉及文件与定位**:

- 扩展 `packages/workbench-ui/src/`(Roster.tsx、BotForm.tsx、avatar.ts、api.ts 增四方法)
- 设计依据:`reference-ui-notes.md` §B1(行字段)/§D(呈现位)/§E(裁剪:emoji/首字色块、扁平列表)

**具体操作**:

1. roster 行:头像(emoji 或首字+8 色板哈希)+ 名字 + 最后消息预览 + 相对时间(`now/Nm/Nh/Nd`)+ working 点 + 选中态;顶部「+ 新建人设」。
2. BotForm(新建/编辑复用):名字、人设文本多行、emoji/色块选择、可选模型(下拉数据来自 v1 listSessions 的 botModel 面或 settings 说明);行内校验;提交 loading 防重;错误条。
3. 行菜单:编辑/删除(确认框,默认 bot 禁删);双击名字快速改名(参考 C3)。
4. 组件单测(stub api)。

**验证**:`pnpm --filter workbench-ui run build && pnpm --filter workbench-ui test` → 期望全绿

**Evidence**:`evidence/phase-1/roster-unit.log`

**注意事项**:预览优先序照参考(草稿→最后消息);头像禁上传(非目标)。

### Task 7: 执行 Phase 1 回归验证

- **关联**:本 Phase 全部 BR/UF
- **前置任务**:6

**验证**:`pnpm -r run build && pnpm -r test` + 浏览器实操:新建「诗人小北」出现在 roster、`agentPreset.list` 出现 `dsh-bot--shiren-xiaobei` 非 broken、编辑/删除各走一遍

**Evidence**:`evidence/phase-1/phase-summary.md`

### Phase 2: 对话面

> 你在哪里:人设可管理,还不能在工作台里聊。
> 做完之后:每个人设可开会话、发消息、看到人设口吻回复与工具/思考折叠。

### Task 8: 会话归属与创建链

- **关联**:BR-203 / UF-202 / UF-205
- **前置任务**:7
- **风险等级**:P0

**为什么做**:人设↔会话的绑定是"人设1和人设2分别对话"的地基。

**涉及文件与定位**:

- 扩展 `packages/dsh-bot-host/src/platform.ts`(session.create 带 agentPreset——实测已支持)、`marks.ts`(`bot:<id>` token)、`workbench-routes.ts`(createBotSession/listBotSessions/history/prompt)

**具体操作**:

1. `createBotSession {botId, title?}`:网关 `session.create {agentPreset: bot.presetId, cwd}` → marks `[kind:dsh-bot, bot:<id>]` → 应用 modelOverride(v1 机制)→ 回 sessionId。
2. `listBotSessions {botId}`:marks `listByKind('bot:<id>')` ∩ 会话元数据(v1 listSessions 管道复用),时间倒序,隐藏(kind:hidden)默认排除。
3. `history {sessionId, sinceSeq?}`:经 sessionTool.read 投影为工作台消息形状(role/text/thinking/tool 摘要/seq);`prompt {sessionId, text}`:经 sessionTool.write(fence caller 沿 v1 路由的 caller 处理方式)。
4. 单测:归属标记、隐藏排除、投影形状。

**验证**:`pnpm --filter dsh-bot-host run build && pnpm --filter dsh-bot-host test` 全绿;`curl createBotSession` 回显 sessionId 且 marks 含 `bot:<id>` → 期望齐全

**Evidence**:`evidence/phase-2/session-api.log`

**注意事项**:每会话独立,不并发写同会话(v1 边界);history 投影不含未脱敏调试字段。

### Task 9: transcript 渲染与轮询

- **关联**:BR-205 / UF-202 / UF-203
- **前置任务**:8
- **风险等级**:P1

**为什么做**:对话面主体;呈现契约(BR-205)全在这。

**涉及文件与定位**:

- 扩展 `packages/workbench-ui/src/`(Conversation.tsx、Transcript.tsx、useSessionPoll.ts)
- 设计依据:`reference-ui-notes.md` §B2(消息形状)/§C1(流式/折叠)

**具体操作**:

1. Header:当前 bot 头像+名字+working 态;「对话」下拉(listBotSessions)+「新开对话」。
2. Transcript:user 右/assistant 左;thinking 折叠行(默认收起,可展开);tool-call 一行摘要折叠;时间分隔;自动滚底(用户上滚时暂停)。
3. 轮询:选中会话 2s(生成中 1s)拉 history(sinceSeq 增量);working = Task 1 勘察的判定条件;页面隐藏(document.hidden)暂停。
4. 组件单测(fixture 投影)。

**验证**:`pnpm --filter workbench-ui run build && pnpm --filter workbench-ui test` → 期望全绿

**Evidence**:`evidence/phase-2/transcript-unit.log`

**注意事项**:消息级刷新即可(非目标:token 流式);长输出折叠不刷屏。

### Task 10: composer 与发送链

- **关联**:BR-205 / UF-202 / UF-203
- **前置任务**:9
- **风险等级**:P1

**为什么做**:输入侧交互契约(草稿隔离/防重/错误呈现)。

**涉及文件与定位**:

- 扩展 `packages/workbench-ui/src/Composer.tsx`(占位「给 `{name}` 发消息」;localStorage 草稿 keyed by botId)

**具体操作**:

1. 发送:入队用户气泡(pending 态)→ `prompt` → 轮询接管;running 时禁发并显示工作中;失败错误卡片可重发(草稿保留)。
2. 草稿隔离与恢复(切 bot 保存/恢复);Enter 发送/Shift+Enter 换行。
3. 单测:草稿隔离、禁发态、失败保留。

**验证**:`pnpm --filter workbench-ui test` → 期望全绿

**Evidence**:`evidence/phase-2/composer-unit.log`

**注意事项**:错误文本透传 host 错误码(web-unreachable/模型错误),不吞错(v1 委托工具 fail-loud 契约同款精神)。

### Task 11: 执行 Phase 2 回归验证

- **关联**:本 Phase 全部 BR/UF
- **前置任务**:10

**验证**:`pnpm -r run build && pnpm -r test` + 浏览器实测 UF-202 主路径全程(新建人设→对话→人设口吻回复)

**Evidence**:`evidence/phase-2/phase-summary.md`

### Phase 3: 身份细节、对账与双入口

> 你在哪里:单人设对话已通。
> 做完之后:双人设隔离验证过,GUI 会话补标生效,双入口等价。

### Task 12: GUI 直建会话补标对账

- **关联**:BR-203 / UF-205;消解 v1 验收缺口
- **前置任务**:8
- **风险等级**:P1

**为什么做**:v1 验收发现的名实不符;roster 预览与对话列表的完整性依赖它。

**涉及文件与定位**:

- 新建 `packages/dsh-bot-host/src/reconcile.ts`;接 `workbench-routes.ts`(打开工作台触发 + `reconcile` 显式方法)

**具体操作**:

1. 按 Task 1 的 ASM-201 结论实现反查:未标会话 → preset 属注册表 → 补 `[kind:dsh-bot, bot:<id>]`;已判非 bot 会话缓存跳过(增量)。
2. v1 旧会话兼容:已有 `kind:dsh-bot` 无 `bot:` 标的 → 归默认 bot(2.7 旧数据兼容)。
3. 幂等单测 + 增量缓存单测。

**验证**:GUI 直建会话 + 打开工作台 → `marks list --kind bot:dsh-bot`(CLI)出现该会话 → 期望补标成功

**Evidence**:`evidence/UF-205/`(EVD-205 主体)

**注意事项**:对账不阻塞页面首屏(异步);绝不删既有 marks。

### Task 13: 双人设隔离与身份打磨

- **关联**:BR-205 / BR-206 / UF-203 / UF-204 / EVD-203/204
- **前置任务**:11;12
- **风险等级**:P1

**为什么做**:这是用户点名的核心体验("人设1和人设2分别的对话"),必须真实走全。

**具体操作**:

1. 浏览器走全 UF-203 四步脚本与 UF-204 编辑流(截图留证)。
2. 身份细节打磨:working 点只亮对应行、composer 占位符随 bot 切换、编辑后生效提示条。
3. 两 bot 并发对话实测(2.7 并发行)。

**验证**:UF-203/204 脚本逐步一致,export 对比人设口吻差异明显 → 期望隔离成立

**Evidence**:`evidence/UF-203/` + `evidence/UF-204/`

**注意事项**:发现串扰(草稿/历史/口吻)即 P0 缺陷,先修后进。

### Task 14: 双入口等价与独立可用性

- **关联**:BR-204 / UF-201 / EVD-201
- **前置任务**:11
- **风险等级**:P2

**具体操作**:

1. 浏览器直开与页签 iframe 各走一遍核心操作(选 bot/发消息/新建人设),核对等价;gateway-down 错误态实测。
2. 首次运行空态(临时 DSH_HOME 或清运行数据)截图。

**验证**:UF-201 主路径+失败分支全过 → 期望双入口等价

**Evidence**:`evidence/UF-201/`

**注意事项**:iframe 内剪贴板/焦点等浏览器差异如有,记录到 README 边界。

### Task 15: 执行 Phase 3 回归验证

- **关联**:本 Phase 全部 BR/UF
- **前置任务**:13;14

**验证**:`pnpm -r run build && pnpm -r test` + UF-201/202/203/204/205 主路径复现

**Evidence**:`evidence/phase-3/phase-summary.md`

### Phase 4: 收尾与真实验收

> 你在哪里:功能全量在,标准面与文档未更新,未做全量真实验收。
> 做完之后:standard:check 全绿、文档与 manual-test 覆盖 v2、5.2 矩阵全过、v1 零回归。

### Task 16: standards 与 manual-test 扩展

- **关联**:BR-207 / v1 标准面规则延续(双 manifest 与 standards 四件套)
- **前置任务**:15
- **风险等级**:P2

**具体操作**:

1. standards:host-descriptor 增 workbench 能力描述;adapter-baseline 增新 import 触点;fixtures 补 workbench-ui 包 manifest 正反例(若该包可挂载;纯构建产物包则在 README 记账说明)。
2. manual-test.sh 增 workbench 矩阵:createBot → createBotSession → prompt(--write)→ history 有回复 → deleteBot 清理;`--no-write` 跳过 prompt。

**验证**:`pnpm run standard:check` 0 FAIL;`bash scripts/manual-test.sh --no-write` 全步通过

**Evidence**:`evidence/phase-4/standard-check.log` + `evidence/phase-4/manual-test.log`

### Task 17: 文档更新

- **关联**:UF-201/205 边界说明;BR-208
- **前置任务**:15
- **风险等级**:P3

**具体操作**:

1. README:工作台双入口用法、人设管理说明、「编辑人设只对新会话生效」「GUI 会话经对账归属」「委托隐藏会话默认不显示」边界、v1 页签行为变化说明。
2. env/README 增 `$DSH_HOME/dsh-bot/` 运行数据说明。

**验证**:README 含上述四点(人工核对) → 期望齐全

**Evidence**:`evidence/phase-4/docs-diff.md`

### Task 18: 执行 spec 5.2 真实场景全套测试

- **关联**:全部用户可见 UF(UF-201~206)+ 2.7 负向场景
- **前置任务**:16;17
- **风险等级**:P0

**验证**:按 5.2 执行矩阵逐行回放全部通过;每行 evidence 落盘后复跑 `python3 ~/.agents/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-workbench`(证据审计)

**Evidence**:`evidence/UF-201/`…`evidence/UF-206/`(全量)

**注意事项**:浏览器自动化 MCP 本会话已实证可用;逐行截图。

### Task 19: 执行 Phase 4 回归验证(总收尾)

- **关联**:本 Phase 全部条目 + INV-201/202/203/204 + BR-207/208 终检
- **前置任务**:18

**验证**:`pnpm -r run build && pnpm -r test && pnpm run standard:check` 全绿;v1 spec 5.2 主路径行复跑(GUI 对话/委托/页签三条至少各一行);三邻仓 `git status --porcelain` 为空;`rg -i 'anysphere|sand://' packages/` 为空;本仓 `git status` 无运行数据泄漏

**Evidence**:`evidence/phase-4/phase-summary.md`

---

## 5. 验收与 Review 协议

> **验收铁律:命令级验证(5.1)只是入场券;5.2 真实场景全套测试是完成的唯一标准。**

### 5.1 命令级验证(入场券)

| 验证项 | 命令 | 期望 | Evidence |
|---|---|---|---|
| 构建 | `pnpm -r run build` | 全包成功 | EVD-207 |
| 类型 | `pnpm -r run typecheck` | 0 error | EVD-207 |
| 单测 | `pnpm -r test` | 全绿 | EVD-207 |
| 标准面 | `pnpm run standard:check` | 0 FAIL | EVD-207 |
| 包校验 | `python3 ~/.agents/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-workbench` | 0 FAIL | EVD-207 |

### 5.2 真实场景全套测试(Real-Run,完成的唯一标准)

**环境准备**:

| 项 | 值 |
|---|---|
| 启动命令 | `cd <本仓> && pnpm install && pnpm -r run build && sh env/setup.sh && sh env/boot.sh` |
| 访问入口 | 工作台 `http://127.0.0.1:3084/dsh-bot/ui`(直开)与右栏「DSH Bot」页签(iframe);官方 GUI `http://127.0.0.1:3084`;RPC `dsh-rpc.sh 3084`;marks CLI(命令模板见 `../dsh-bot-mvp/spec.md` 2.3 节 CLI 流程) |
| 测试账号/数据 | `env/settings.yaml` 现有模型路由 + `env/.env` 凭据(v1 已消解);种子默认 bot |
| 干净状态定义 | 停网关 → 清 `env/sessions/`、`env/session-tool/marks.jsonl`、`env/dsh-bot/`、`env/.agent-presets/dsh-bot--*` → 重启 boot |
| 可用测试工具 | 浏览器自动化 MCP(本会话已实证)执行 GUI 行并截图;RPC/CLI 行直接执行留档;不可用时按 2.3 步骤表手动回填 |

**执行矩阵**:

| UF | 执行方式 | 操作来源 | 必须核对的点 | Evidence |
|---|---|---|---|---|
| UF-201 主路径(双入口) | browser | 2.3 UF-201 步骤 1-3 | 页签与直开渲染一致;roster 含默认 bot | `evidence/UF-201/tab.png` + `evidence/UF-201/standalone.png` |
| UF-201 网关死分支 | browser(停 boot) | 2.3 UF-201 失败分支 1 | 错误态 + 重试,不白屏 | `evidence/UF-201/gateway-down.png` |
| UF-201 首次空态 | browser(干净状态) | 2.7 空数据 | 种子 bot 在位,空会话引导 | `evidence/UF-201/first-run.png` |
| UF-202 主路径 | browser + RPC 取证 | 2.3 UF-202 步骤 1-3 | 新 bot 入 roster;preset 非 broken;回复为新人设口吻;Header 身份正确 | `evidence/UF-202/create-and-chat.png` + `evidence/UF-202/session-export.json` |
| UF-202 非法输入分支 | browser | 2.3 UF-202 失败分支 1-2 + 2.7 非法输入 | 行内校验;YAML 注入字符被安全处理,零残留回滚 | `evidence/UF-202/invalid-input.md` |
| UF-202 防重分支 | browser | 2.7 重复提交 | 连点仅创建一个 | `evidence/UF-202/double-submit.md` |
| UF-203 主路径 | browser | 2.3 UF-203 四步 | 历史/口吻/草稿三隔离;working 点归属正确 | `evidence/UF-203/isolation.png` + `evidence/UF-203/exports/` |
| UF-203 并发分支 | browser | 2.7 并发生成 | 两 bot 同时生成互不干扰 | `evidence/UF-203/concurrent.md` |
| UF-204 主路径 | browser + RPC 取证 | 2.3 UF-204 步骤 1-3 | 名字即时生效;人设只对新会话生效且有提示 | `evidence/UF-204/edit-persona.png` |
| UF-204 写盘失败分支 | 模拟(只读目录)或代码级 fixture | 2.3 UF-204 失败分支 | 错误条 + 原值保留 | `evidence/UF-204/write-fail.md` |
| UF-205 主路径 | browser + GUI + CLI | 2.3 UF-205 步骤 1-3 | GUI 直建会话经对账入列;marks 补 `bot:` 标;会话切换/新开可用 | `evidence/UF-205/reconcile.png` + `evidence/UF-205/marks-diff.txt` |
| UF-205 v1 旧会话分支 | CLI 取证 | 2.7 旧数据兼容 | v1 遗留 kind:dsh-bot 会话归默认 bot | `evidence/UF-205/v1-sessions.md` |
| UF-206 主路径 | browser + RPC 取证 | 2.3 UF-206 步骤 1-2 | roster 移除;preset 目录删;历史会话官方 GUI 仍可见 | `evidence/UF-206/delete.png` + `evidence/UF-206/preset-list-diff.txt` |
| UF-206 默认保护分支 | browser | 2.3 UF-206 失败分支 1 | 默认 bot 不可删 | `evidence/UF-206/default-protected.png` |
| v1 回归抽验 | browser + RPC | v1 spec 5.2 的 GUI 对话与委托两条主路径行 | 委托与默认 preset 会话零回归 | `evidence/phase-4/v1-regression.md` |

**通过标准**:矩阵全部行通过且 evidence 齐全;任何一行失败回对应任务修复重跑。

### 5.3 Evidence 目录结构与命名

```text
docs/dsh-bot-workbench/evidence/
  phase-0/ … phase-4/
  UF-201/ … UF-206/
```

### 5.4 Review 专项检查清单

- [ ] BR-202:任意非法人设文本都不产生 broken preset 残留(注入字符样例实测)
- [ ] BR-203:对账幂等(连开三次工作台 marks 无重复膨胀)
- [ ] BR-204:双入口功能等价清单逐项核(选 bot/聊/建/编/删)
- [ ] BR-205:2.3 各脚本的界面反馈逐步一致(loading/禁发/错误条/工作中)
- [ ] BR-208/INV-201:v1 主路径复跑记录在案
- [ ] 红线终检:`rg -i 'anysphere|sand://'` 为空;参考素材仅 `reference-ui-notes.md` 设计形状
- [ ] INV-204:`git status` 无 bots.json/自动 preset/会话数据
