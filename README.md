# dsh-bot

DSH 插件「**DSH Bot**」：常驻对话 agent（人设 preset + 模型跟随 DSH 自身配置，可 bot 专属 override）+ 任意 agent 可调的 `dsh_bot_ask` 委托工具 + **DSH Bot 工作台**（多人设 roster + 独立 1:1 对话面 + **Grok Bot 式小组对话**）。better-sidebar「DSH Bot」页签（id `dsh-bot:sessions`）现在用同源 iframe 嵌入工作台，不再是 v1 的会话列表。

本仓独占 loopback **3084**，profile **`gb`**，平台包钉 `@deepseek-ai/dsh@0.1.1-rc.2`（与 session-tool 同针，不是 vibee/genoffice 的 0.1.0-rc.7）。GitHub 仓名 `Nothing1024/dsh-bot`；本机目录仍是 `dsh-grok-bot/plugin`。

会话经邻仓 session-tool 管理，标记 `kind:dsh-bot`。不要抢 3080 / 3081 / 3083。

## 一口一仓

| 谁 | profile | 口 | DSH 包 | `DSH_HOME` |
|---|---|---|---|---|
| 官方 `dsh web` / dsh-genoffice | 默认 / `go` | **3080** | 随官方 / `0.1.0-rc.7` | `~/.dsh` / genoffice env |
| session-tool | `st` | **3081** | `0.1.1-rc.2` | session-tool env |
| vibee | `vb` | **3083** | `0.1.0-rc.7` | vibee env |
| **dsh-bot（本仓）** | **`gb`** | **3084** | **`0.1.1-rc.2`** | **本仓 `env/`** |

CLI / 矩阵先核监听进程的 `DSH_HOME` 再打，口对但仓不对就失败。

## 日常起停

仓内 `env/` 就是这份仓库自己的 `DSH_HOME`，细节见 `env/README.md`。
模型 key 写在 `env/.env` / `env/.credentials.yaml`（git 忽略）。两者都不存在时，`sh env/setup.sh` 会从本机 DSH 默认目录 `~/.dsh/.env` 拷一份。

```sh
pnpm install && pnpm run build
sh env/setup.sh
sh env/boot.sh                 # loopback :3084；已起且身份对本仓则直接退出
```

前台：http://127.0.0.1:3084  
工作台：http://127.0.0.1:3084/dsh-bot/ui（也可从右栏「DSH Bot」页签进入）

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

## 日常使用

工作台是本插件自己服务的网页，**两个入口功能等价**（roster / 对话 / 人设 CRUD 全可用）：

| 入口 | URL | 说明 |
|---|---|---|
| 浏览器直开 | http://127.0.0.1:3084/dsh-bot/ui | host `webServer` 静态页 + 同源 `POST /dsh-bot/<method>` |
| 右栏页签 | 官方 GUI http://127.0.0.1:3084 → 「DSH Bot」 | 页签 id 仍是 `dsh-bot:sessions`（`DSH_BOT_SESSIONS_TAB_ID`）；内容为同源 iframe `src=/dsh-bot/ui` |

**v1 页签行为变化**：v1 页签是会话列表（点行跳官方 conversation）。现在同一 tab id 改为 iframe 工作台；v1 HTTP `POST /dsh-bot/listSessions` 与 `POST /dsh-bot/createSession` 保留。`dsh_bot_ask`、`dsh-bot.model` override、marks CLI、默认 `dsh-bot` preset 会话链路不变。

左栏是多人设 roster（头像 / 名字 / 预览 / 时间 / 工作中点），右侧是当前人设的对话面。首次打开会种子默认 bot（id `dsh-bot`，绑既有 bundled preset）。左栏也可以建**小组**（拼贴头像）：同一房间里多名成员按身份轮流回复。

### 小组对话

- **新建小组**：roster「+ 新建小组」，勾选 2–6 个已有 1:1 人设并命名。小组没有自己的 preset / 人设文件，只记成员名单（`$DSH_HOME/dsh-bot/groups.json`）。
- **一轮语义**：用户发一条，默认全员按成员顺序各回一句；空回复或 `(pass)` 视为本轮跳过。再发一条才开下一轮。
- **@点名**：composer 输入 `@` 弹出成员列表。`@诗人小北` 只让该成员开口；`@all` / `@everyone` 仍是全员。点名对不上现有成员时 toast「未匹配成员,已发给全员」。
- **删组**：确认后只去掉小组行和房间记录。成员 bot、其 `dsh-bot--*` preset、1:1 私聊都保留。
- **隐藏轮次会话**：成员发言走各自 preset 的隐藏会话（标题 `~dsh-bot-group:`，`kind:hidden`），默认不出现在该成员的 1:1 会话下拉。

### 人设管理

- **新建**：roster「+ 新建人设」填名字、人设文本、头像（emoji 或首字+色块）、可选专属模型。每人设生成一个自动 preset `$DSH_HOME/.agent-presets/dsh-bot--<slug>/`（写后校验，失败回滚零残留），并立刻进入空对话。
- **编辑**：行菜单或 Header「编辑人设」。名字 / 头像即时反映；**人设文本只对之后的新会话生效**（旧会话保持原口吻）。保存后工作台提示「人设对之后的新对话生效」。
- **删除**：二次确认后 roster 移除该行、删自动 preset 目录与该 bot 的记忆目录。默认 DSH Bot 不可删。历史会话在官方 GUI 仍可见，工作台不再列出。

### 例程

每个 bot 可建定时例程（`$DSH_HOME/dsh-bot/routines.json`）。会话头「⏰」打开列表；到点 host 在「例程 · 名称」线程里叫醒它，没事只回 `(silent)`，有事才落消息并计未读。窗口失焦时弹系统通知。

### 记忆

每个 bot 有一份跨会话记忆，存在 `$DSH_HOME/dsh-bot/memory/<botId>/`（`profile.md` 长期事实 + `log.jsonl` 日志/备注）。工作台会话头「🧠 N」打开面板，可忘记单条或清空。助理消息菜单有「📌 记住这条」。轮次闭合后自动抽取；寒暄不记。记忆只注入**之后新建**的会话，不改 `bots.json` 里填写的基础人设。关闭抽取：settings `dsh-bot.memory.enabled: false`。

边界：

- **编辑人设只对新会话生效**：平台 agent preset 代际规则；进行中的旧对话不会换口吻。
- **GUI 直建会话经对账归属**：在官方 GUI 用 bot preset 直接「新建会话」的对话，打开工作台时会补标 `kind:dsh-bot, bot:<id>`（幂等），归入对应人设的对话列表。v1 遗留只有 `kind:dsh-bot`、没有 `bot:` 的会话归默认 bot。
- **委托隐藏会话默认不显示**：`dsh_bot_ask` 委托会话带 `kind:hidden`（标题以 `~` 开头）。工作台会话下拉默认不列出；需要时打开「包含隐藏」。v1 `listSessions` 默认同样不含隐藏行，`includeHidden: true` 才包含。
- **iframe**：页签内与直开同源，`fetch /dsh-bot/*` 可用。剪贴板 / 焦点遵循浏览器 iframe 规则（同页粘贴可用；个别快捷键或系统剪贴板权限更严），功能面仍与直开等价。

## 运维：UF-004 标记查询

邻仓 CLI，本仓零实现。不 boot profile，直读 `$DSH_HOME/session-tool/marks.jsonl`。

```sh
DSH_HOME="$PWD/env" node ../../session-tool/plugin/packages/session-tool-cli/lib/bin.js marks list --kind kind:dsh-bot
```

每行 `session-id kind:dsh-bot,…`。无该 kind 时输出 `(no marks)`。务必显式传本仓 `DSH_HOME`，指错会读到他仓或空表。

## 模型（UF-005 / UF-006）

- **UF-005 跟随 DSH 配置**：bot 用什么模型完全由 DSH 既有配置面决定（`agent-default-model` + 官方设置 / 会话内选择器）。插件代码不写适配器、不硬编码 provider/model。`env/settings.example.yaml` 仅附**注释掉的** xAI 直连示例。
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

合同与真实场景证据：v1 `docs/dsh-bot-mvp/`；工作台 `docs/dsh-bot-workbench/`。
