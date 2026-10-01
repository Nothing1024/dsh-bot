# dsh-bot

DSH 插件「**DSH Bot**」：常驻对话 agent（人设是插件内部配置，模型跟随 DSH 自身配置，可 bot 专属 override）+ 任意 agent 可调的 `dsh_bot_ask` 委托工具 + **DSH Bot 工作台**（多人设 roster + 独立 1:1 对话面 + **Grok Bot 式小组对话**）。工作台走官方 slots（左栏名册 + 中栏对话），不再挂 `dsh-better-sidebar`。

本仓独占 loopback **3084**，profile **`gb`**，平台包版本是 `@deepseek-ai/dsh@0.2.0-rc.1`（npm `latest` 是 `0.1.7-rc.2`，`next` 是 `0.2.0-rc.1`）。GitHub 仓名 `Nothing1024/dsh-bot`；本机目录仍是 `dsh-grok-bot/plugin`。

会话经邻仓 session-tool 管理，标记 `app:dsh-bot`（过渡期双写 `kind:dsh-bot`）+ `form:plugin`。不要抢 3080 / 3081 / 3083。

## 一口一仓

| 谁 | profile | 口 | DSH 包 | `DSH_HOME` |
|---|---|---|---|---|
| 官方 `dsh web` / dsh-genoffice | 默认 / `go` | **3080** | 随官方 / `0.2.0-rc.1` | `~/.dsh` / genoffice env |
| session-tool | `st` | **3081** | `0.2.0-rc.1` | session-tool env |
| vibee | `vb` | **3083** | `0.2.0-rc.1` | vibee env |
| **dsh-bot（本仓）** | **`gb`** | **3084** | **`0.2.0-rc.1`** | **本仓 `env/`** |

CLI / 矩阵先核监听进程的 `DSH_HOME` 再打，口对但仓不对就失败。

## 日常起停

仓内 `env/` 就是这份仓库自己的 `DSH_HOME`，细节见 `env/README.md`。
模型 key 与共享路由来自 `~/workspace/dsh/plugin/.shared/`（git 忽略）。`sh env/setup.sh` 会 apply 到本仓 `env/`。

```sh
pnpm install && pnpm run build
sh env/setup.sh
sh env/boot.sh                 # loopback :3084；已起且身份对本仓则直接退出
```

前台：http://127.0.0.1:3084  
工作台：http://127.0.0.1:3084/dsh-bot/ui（官方 GUI 顶栏「Bot」也是同一套）

网关起来后半自动 CLI 矩阵（UF-001 建会话冒烟、UF-002 委托、UF-006 override、UF-004 marks、工作台 createBot → createBotSession → prompt(--write) → history → createGroup → deleteGroup → deleteBot）：

```sh
bash scripts/manual-test.sh                 # 含模型写入（走当前配置的路由）
bash scripts/manual-test.sh --no-write      # 只建会话 / 设 override / 查 marks / 工作台建删人设与小组；跳过 prompt
# 或：pnpm env:test
```

`--profile gb` 是正在跑的 web（:3084），不要再 boot。CLI 一律 `--profile headless --patch env/cli.patch.yml`（webUrl 也是 :3084）。矩阵会先核网关 `DSH_HOME` 是本仓 `env/`。

### 调试（网关内部状态）

用 `dsh-plugin-debug` skill（`~/.agents/skills/dsh-plugin-debug/`）：

```sh
# 确认 :3084 的 DSH_HOME 是本仓 env/（别人占口会失败）
~/.agents/skills/dsh-plugin-debug/scripts/dsh-rpc-who.sh 3084
~/.agents/skills/dsh-plugin-debug/scripts/dsh-rpc.sh 3084 pluginInventory/list
```

先 who 再 RPC。网关没起时 `dsh-session-cat.sh <DSH_HOME> <session_id>` 直接读磁盘。

## 工作台实时

工作台通过同一 :3084 的 `GET /dsh-bot/events`（SSE）桥接平台 `events.mux` / `events.host`，只转发 `bot:` / `group-room:` 会话。

- 工作中输入框不灰；发送键变为「停止」（`sessions.cancel`）；回车仍可排队 `sessions.prompt({mode:'queue'})`。
- 小组「停止」中止正在进行的讨论，把这场讨论的用户消息标为「已取消」，并清空房间排队（toast「已停止，排队的 N 条未发送」）。已完成回复保留，取消的请求不再作为后续轮次的新输入。旧版本未保存取消结果的消息不追溯补标。
- Transcript 显示可折叠思考/工具卡，以及可点的审批/提问卡。
- 兼容旧 `assistant/chunk` 和当前 DSH 的 `agent/assistant-stream`：正文按片段显示，思考片段不作为正文展示；完成时保留文字直到历史接替，重试与取消清理未完成片段。小组按房间、当前成员及本轮序号匹配，避免串到其他房间或重播上一轮。
- SSE `ready` 后私聊停止定时拉历史；小组改为每 5 秒拉一次完整房间状态以识别成员切换与取消。名册与小组房间列表 SSE 在线时 15 秒、断线时 2 秒；补标 `reconcile` 60 秒一次。标签页隐藏时全部暂停（浏览器允许通知时名册仍 15 秒一次，供例程通知），回到前台立即补拉一次。切换对话会中止旧请求，迟到结果丢弃。
- 长文限制阅读宽度；输入框随草稿自动增高。向上阅读时不强制追到底部，可点「最新消息」回到末尾。小组中的例程提议显示为可读建议，需到成员私聊设置，不会自动建立例程。

## 日常使用

工作台是本插件自己服务的网页，**两个入口功能等价**（roster / 对话 / 人设 CRUD 全可用）：

| 入口 | URL | 说明 |
|---|---|---|
| 浏览器直开 | http://127.0.0.1:3084/dsh-bot/ui | host `webServer` 静态页 + 同源 `POST /dsh-bot/<method>`；需先用启动时打印的带 token 链接登录过一次（与官方 GUI 共用登录 Cookie） |
| 官方 GUI | http://127.0.0.1:3084 → 顶栏「Bot」 | 左栏名册 + 中栏工作台。原来的官方会话走「在官方会话打开」或侧栏「会话协作」。官方「+ 新会话」不变。 |

`dsh_bot_ask`、`dsh-bot.model` override、marks CLI 不变。官方 GUI「+ 新会话」跟随平台默认 preset，**不再**列出 DSH Bot。`gb` 不再装 `dsh-better-sidebar`（右栏文件 / 终端 / 侧边对话一并卸掉）。

`/dsh-bot/*`（RPC 与 SSE）与官方 `/api` 同一道门：Host/Origin 校验 + 浏览器登录 Cookie（`ctx.connection`）。例外只有本机非浏览器客户端（socket 来自 loopback、Host 是 loopback、无 Origin / Fetch-Metadata），供 CLI 与 `scripts/manual-test.sh` 使用。请求体须为 `application/json`（≤ 8 MiB）。`history` / `prompt` / `cancel` / 审批与提问应答只接受带 Bot 标记（`app:` / `kind:dsh-bot`、`bot:`、`group-room:`）的会话。

左栏是多人设 roster（头像 / 名字 / 预览 / 时间 / 工作中点），右侧是当前人设的对话面。首次打开会种子默认 bot（id `dsh-bot`，人设在 `bots.json`）。左栏也可以建**小组**（拼贴头像）：同一房间里多名成员按身份轮流回复。

### 小组对话

- **新建小组**：roster「+ 新建小组」，勾选 2–6 个已有 1:1 人设并命名。小组没有自己的 preset / 人设文件，只记成员名单（`$DSH_HOME/dsh-bot/groups.json`）。
- **多轮讨论**：用户发一条后，成员按顺序轮流发言，默认 3 轮（小组设置可改 1–99，0 = 不限；一场最多 10 条成员发言）。第 2 轮起只叫上次发言后房间有新内容的成员；一整轮没人发言就提前结束。空回复或 `(pass)` 视为跳过。
- **@点名与引用**：composer 输入 `@` 弹出成员列表，支持带空格的完整姓名。回应者优先级：显式 `@成员` > 被引用的成员 > 全员。在成员气泡上点「回复」且不写 `@`，只有该成员回答；`@all` / `@everyone` 仍是全员；引用自己的消息或被引成员已移出小组时回退全员。输入框下方「本次回应」与服务端用同一套规则。点名无效或存在重名时保留草稿、不发送；重名候选插入唯一 ID。
- **讨论中再发**：讨论进行中发送的消息先进排队（每个房间最多 3 条，显示在对话底部，可单条取消），本场结束后按顺序自动开下一场；第 4 条提示「排队已满」并保留草稿。排队只在网关内存里：排队期间不写房间文件，**重启网关后排队消息丢失**，需要重新发送。成员重试进行中仍直接提示忙，不排队。
- **让他们继续聊**：房间空闲且已有成员发言时，头部按钮让成员接着上文再聊一场，不追加用户消息；房间里留一条灰色「继续讨论」分隔线。讨论中或还没有成员发言时按钮不可点。
- **删房间**：房间切换器行菜单「删除房间」，二次确认后只删该房间记录（`rooms/<roomId>.jsonl` 与 `rooms.json` 对应行）。成员人设、1:1 私聊、成员的隐藏轮次会话和其他房间都保留。讨论中、有排队或重试中时拒绝删除，先停止再删。
- **删组**：确认后只去掉小组行和房间记录。成员 bot、其 1:1 私聊都保留。
- **隐藏轮次会话**：成员发言走 session-tool 隐藏会话（标题 `~dsh-bot-group:`，`hide()` 双写 `hidden` / `kind:hidden`），默认不出现在该成员的 1:1 会话下拉。这些会话不归档：DSH 0.2.0-rc.1 会拒绝在已归档会话上开新一轮，旧版本归档过的会在下次发言时自动取消归档。口吻由 host 在 write 时注入，不是 DSH preset。

### 名册

左侧名册默认三组：**置顶 / 工作 / 生活**（空组标题仍在，可折叠）。拖到组标题换组，刷新后保持。右键：置顶、编辑、移组、标已读、隐藏、静音、删除。名册不再下列历史会话；当前人设的对话在右上角切换。要看原来的官方会话，用对话菜单「在官方会话打开」，或侧栏「会话协作」（dsh-session-tool）「在会话协作中查看全部」。

浏览器允许存储时，刷新恢复当前标签页选中的人设或小组，以及该对象上次打开的对话或房间；其他标签页的选择不会覆盖当前页。全新标签页默认沿用最近一次选择；对象已删除时退回可用对象。若浏览器禁用标签页存储，只能退回多个页面共用的最近位置。

底部「已隐藏 N 个」展开后仍能进入该人设；**隐藏不停止例程**。静音后未读照加，窗口失焦也不弹系统通知。

快捷键：⌘1-9 跳到当前可见第 N 项（跳过折叠组）；⌥↑↓ 相邻切换；⌘B 折起名册列。⌘K / Esc 行为不变。

### 人设管理

- **新建**：roster「+ 新建人设」填名字、人设文本、头像（emoji 或首字+色块）、可选专属模型。人设只写入 `$DSH_HOME/dsh-bot/bots.json`，**不会**在 `.agent-presets/` 再生成一份 DSH preset。立刻进入空对话（session-tool create + marks `bot:<id>` + 人设快照）。
- **编辑**：行菜单或 Header「编辑人设」。名字 / 头像 / 人设文本都写回注册表；**新对话**用新人设，已有对话保持创建时的口吻。
- **删除**：二次确认后 roster 移除该行、删该 bot 的记忆目录。默认 DSH Bot 不可删。历史会话在官方 GUI 仍可见，工作台不再列出。

### 例程

每个 bot 可建定时例程（`$DSH_HOME/dsh-bot/routines.json`）。会话头「⏰」打开列表；到点 host 在「例程 · 名称」线程里叫醒它，没事只回 `(silent)`，有事才落消息并计未读。窗口失焦时弹系统通知。

创建面板可选每天的具体时间、时区、每小时整点或间隔分钟，并在保存前预览下次执行时间。高级表达式未指定 `CRON_TZ` 时按 UTC；既有例程保持原时间规则。列表显示实际已安排的下次时间、最近执行记录，以及暂停或删除失败信息。单网关进程内的例程读写按文件排队，包括执行结果与用户编辑，避免并发覆盖。

### 同事（`dsh_bot_send`）

任意 bot 可通过工具 `dsh_bot_send({toBot, text})` 给名册里**另一个** bot 捎一句。工具立刻 `{accepted:true}`，不在调用里等对方说完。

- 每 bot 每分钟最多 3 条成功投递；第 4 条失败，不是 accepted。
- 成功投递追加 `$DSH_HOME/dsh-bot/peers.jsonl`（`{from,to,ts,sessionId}`），该文件不入 git。
- 一次一个收件人，不广播、不接外部、不跨用户。
- 收件人同事会话标题「来自 <发件人名>」；非静默回复才写回发件人当前会话。
- 工作台详情「同事」页与 roster「关系图」只在打开时拉 `peerLog`，不新开定时器。

### 记忆

每个 bot 有一份跨会话记忆，存在 `$DSH_HOME/dsh-bot/memory/<botId>/`（`profile.md` 长期事实 + `log.jsonl` 日志/备注）。工作台会话头「🧠 N」打开面板，可忘记单条或清空。助理消息菜单有「📌 记住这条」。轮次闭合后自动抽取；寒暄不记。记忆随发送注入（不改 `bots.json` 里填写的基础人设）。关闭抽取：settings `dsh-bot.memory.enabled: false`。

边界：

- **编辑人设只对新会话生效**：创建会话时快照基础人设；进行中的旧对话不会换口吻。
- **官方 GUI 直建不是 Bot**：官方「+ 新会话」走平台默认 preset。遗留的 `dsh-bot` / `dsh-bot--*` 会话打开工作台时仍可补标 `app:dsh-bot` / `kind:dsh-bot` + `bot:<id>`。v1 遗留只有库存标、没有 `bot:` 的会话归默认 bot。
- **委托隐藏会话默认不显示**：`dsh_bot_ask` 委托会话走 `hide()`（标题以 `~` 开头）。工作台会话下拉默认不列出；需要时打开「包含隐藏」。v1 `listSessions` 默认同样不含隐藏行，`includeHidden: true` 才包含。

## 运维：UF-004 标记查询

邻仓 CLI，本仓零实现。不 boot profile，直读 `$DSH_HOME/session-tool/marks.jsonl`。

```sh
DSH_HOME="$PWD/env" node ../../session-tool/plugin/packages/session-tool-cli/lib/bin.js marks list --mark app:dsh-bot
# 过渡期精确匹配旧词（不是按 kind: 前缀查）：
DSH_HOME="$PWD/env" node ../../session-tool/plugin/packages/session-tool-cli/lib/bin.js marks list --kind kind:dsh-bot
DSH_HOME="$PWD/env" node ../../session-tool/plugin/packages/session-tool-cli/lib/bin.js marks list --prefix app:
```

每行 `session-id app:dsh-bot,…`。无该标时输出 `(no marks)`。`--kind` 仍是精确 token，不是按轴前缀查。务必显式传本仓 `DSH_HOME`，指错会读到他仓或空表。

## 模型（UF-005 / UF-006）

- **UF-005 跟随 DSH 配置**：bot 用什么模型完全由 DSH 既有配置面决定（`agent-default-model` + 官方设置 / 会话内选择器）。插件代码不写适配器、不硬编码 provider/model。活配置在 `~/workspace/dsh/plugin/.shared/settings.yaml`；`env/settings.example.yaml` 只是无 LAN / 无 key 的模板。
- **UF-006 bot 专属 override**：settings 命名空间 `dsh-bot.model`（`{provider, model, reasoningEffort?}`）。为空 ⇒ 完全跟随全局默认；非空 ⇒ **仅经本插件创建**的会话（`dsh_bot_ask` 委托、侧栏「新建」）在首次投递前应用该模型。变更热生效，免重启。指向未注册路由或缺凭据时 fail loud，禁止静默回落全局。
- **边界**：GUI 直接点「新建会话」产生的会话**不受 override 影响**（跟随全局，可会话内手动切）。

## 非目标与 BR-006 红线

不做：模型厂商绑定 / 自写适配器、参考产品的 MCP 连接器、Docker 沙箱、多 provider Router 界面、桌面 Electron/VNC。

参考树 `../reference` **只读**：不拷代码、文案、品牌。仓内不得出现 `com.anysphere.sand`、`sand://`、上游 DSN / Statsig key / OAuth client id。

## 开发

```sh
pnpm install
pnpm run build
pnpm test
pnpm run standard:check   # dsh-community-standard v0.15 对齐检查（见 standards/README.md）
```

## 社区标准对齐（standards/）

对齐 [dsh-community-standard](https://github.com/oh-my-dsh/dsh-community-standard) v0.15 的静态声明面：`packages/tool-dsh-bot/dsh-plugin.json` 与 `packages/ui-dsh-bot/dsh-plugin.json` 是标准 manifest（与官方装载用的 `dsh.plugin.json` 并存），`standards/` 内有部署 Host Descriptor（profile `gb` / :3084，含 `WorkbenchUi` 能力）、纯函数协商、fixtures 与上游触点基线（adapter 审计）。`packages/workbench-ui` 是纯构建产物 SPA（无社区 manifest、不可挂载），由 host 静态服务。私有坐标用 `x-nothing1024.*` 命名空间，Registry 定案后做映射替换。详见 `standards/README.md`。

合同与真实场景证据：v1 `docs/archive/dsh-bot-mvp/`；工作台 `docs/archive/dsh-bot-workbench/`；左栏 Bot 模式 `docs/archive/dsh-bot-left-tab/`；全部任务包索引见 `docs/README.md`，已归档材料见 `docs/archive/README.md`。
