# dsh-bot-mvp Spec

> Version: 0.3.5 | Date: 2026-08-29 | Status: Done 已验收（状态板 100%，5.2 证据齐全；2026-09-08 梳理时改标） (P0–P3 已消解 ASM-001/002/003/005/006/007;INV-002 官方栏隐藏改走 archiveSession)
>
> 本文件是本需求的**唯一事实源**:事实基线、业务合同、技术方案、任务计划、验收协议全部在此。
> 其他文件(tasks.csv)只引用本文件,不复制内容。
>
> 填写三态规则:每个表格单元格只允许三种内容——
> 1. 验证过的事实(注明来源命令);2. 显式假设 `ASM-xxx`;3. `待勘察`。
> 禁止编造看似合理的命令、symbol、文件名。

---

## 0. 一页纸人话摘要

- **给谁 / 场景**:本机 DSH 插件生态的使用者。想要一个「**DSH Bot**」——一个常驻对话 agent(产品形态参考开源重建的 Grok Bot 桌面应用),能在 DSH 网页界面里直接聊,能被其他 agent 一句话委托提问,它的会话独立管理、不弄乱官方会话栏。
- **做什么**:新建插件仓交付四件事:
  1. **模型跟随 DSH 配置**——bot 用什么模型由 DSH 自己的模型配置决定(默认模型 + 官方设置/会话内选择器可切换),插件不绑定任何厂商,xAI 直连只作为注释示例附带;另有 **bot 专属默认模型**:settings 里写一行 `dsh-bot.model`,只作用于经本插件创建的 bot 会话(委托/页签新建),清空即回全局默认;
  2. **DSH Bot 人设**——一个 agent preset(人设提示词 + 编码工具集),本仓环境里新会话默认就是它;
  3. **委托工具 `dsh_bot_ask`**——任何 agent 都能调用,后台开一个隐藏的 bot 会话完成问答并返回答案,会话经 session-tool 管理并打 `kind:dsh-bot` 标记;
  4. **侧栏「DSH Bot」页签**——列出全部 bot 会话,可新建、可跳转。
- **改哪里**:只在本仓(`~/workspace/dsh/plugin/dsh-grok-bot/plugin`;本机目录不改名,未来 GitHub 仓名定为 `Nothing1024/dsh-bot`——用户已拍板);不改官方 DSH 包,不改 session-tool / vibee / genoffice 邻仓。本仓独占调试口 **3084**、profile 名 **`gb`**。
- **怎么算做完**:`sh env/boot.sh` 起网关后——在 `http://127.0.0.1:3084` 新建会话即是 DSH Bot 人设、以当前配置的模型流式回复;在设置/选择器里切模型后新轮次与新委托即用新模型;任意会话里模型调 `dsh_bot_ask` 能拿到答案且后台会话带标记、不出现在官方会话栏;侧栏页签能列出/新建/跳转 bot 会话;`pnpm run standard:check` 与第 5.2 节真实场景矩阵全部通过。
- **不做什么**:不绑定模型厂商(不写适配器、不强制 xAI);不复刻参考产品的 MCP 连接器、Docker 沙箱、多 provider Router 界面、桌面 Electron/VNC;不拷贝逆向重建源码的任何代码与品牌标识(法务红线,见 BR-006)。

---

## 1. 事实基线与假设

### 1.1 需求与运行模式

| 项 | 结论 |
|---|---|
| 原始需求 | 「阅读 `../` 的 grok bot 源码,让 DSH 结合插件生态实现一个 grok bot;session 管理走我实现的 session-tool;先调研再规划」;2026-08-29 用户拍板:①模型走 DSH 自身配置、设置可切换 ②命名改 DSH Bot ③人设方案(全新撰写+过目)确认 |
| 输入类型 | description(用户口头需求 + 只读参考源码树 + 两轮决策) |
| Mode | oneclick(调研 → 骨架 → 任务包;本包即产物,v0.2 为变更重跑) |
| 置信度 | 中高(方向、约束、命名已定;剩余讨论项见 1.4) |
| 输出目录 | `docs/dsh-bot-mvp/`(v0.1 目录 `grok-bot-mvp` 已随命名变更迁移) |

### 1.2 任务类型路由

| 维度 | 结论 |
|---|---|
| 任务类型 | infra(仓库/环境/profile 组装)+ backend(host 服务与 agent 工具)+ frontend(better-sidebar 页签) |
| 主要风险 | `durableCreate` 是否吃默认 preset;better-sidebar 与 DSH 0.1.1-rc.2 兼容性;gb 环境复现用户现有模型配置 |
| 行号引用策略 | 样板锚点用 symbol + rg,行号仅 hint;新建文件标「新建」 |
| 必需验收方式 | 命令级(build/typecheck/test/standard:check)+ 网关 RPC 取证 + 浏览器真实点击(工具可用时)/手动脚本回填 |
| 必须覆盖用户场景 | UF-001 GUI 对话、UF-002 委托、UF-003 侧栏页签、UF-004 CLI 标记查询、UF-005 模型切换 |

### 1.3 勘察事实清单

> 每条事实来自本轮实际执行的命令(Read/rg/ls 等),或后台调研子代理报告且已按路径抽验。路径相对本仓根(`docs/dsh-bot-mvp/spec.md` 的上两级);`../../` 指插件生态伞目录。

| 事实 | 来源命令 | 输出摘要 |
|---|---|---|
| 参考产品是 Cursor 系桌面沙箱 agent(代号 Sand),默认模型 `grok-4.5`,经 api2 后端而非直连 x.ai;Router(Claude/Codex/OpenRouter)是重建版扩展 | 子代理通读 `../reference/extracted/grok-bot-0.18-reconstructed-main/`;自验 `rg grok ../reference/.../source/shared/agents/agent-model.ts` | `SAND_DEFAULT_MODEL_ID = "grok-4.5"`(L3) |
| 参考源码**只读**:不 install/不运行/不拷贝,无上游许可 | Read `../reference/security-scan-report.md` | `safe_as_static_reference=true`,`safe_to_install_or_run=false`,实现必须全新编写 |
| DSH 模型配置面:settings `agent-default-model: {provider, model, reasoningEffort}` 决定新会话默认模型;`llm-pi-ai.providers.*` 声明路由;GUI 有会话内模型选择器与模型设置页(`dsh-client-ui-model-selection` / `dsh-client-ui-settings-models` 在包清单中) | Read `../../session-tool/plugin/env/settings.yaml`;`ls .../node_modules/@deepseek-ai/` | 本机 st 环境实测经中转路由跑 `grok-4.6`(anthropic-messages 协议) |
| `llm-pi-ai` 配置免重启生效(settings 分节按 provider 合并,「接入…都属于配置而非改代码」);内置 catalog 含 `xai` provider(`grok-4.5`/`grok-4.3`,端点 `https://api.x.ai/v1`,凭据 `XAI_API_KEY`)可作直连示例 | Read `.../dsh-llm-pi-ai/README.zh.md`;`python3` 读 `.../@earendil-works/pi-ai/dist/providers/data/xai.json` | 三个 grok 模型 + `xai: "XAI_API_KEY"` |
| agent preset = 目录 + `agent.cordis.yml`;随附 preset 有 `standard/cordis/code/minimal`;人设由 `@deepseek-ai/dsh-persona` 行 `config.text` 承载(支持 `{{model}}`/`{{cwd}}`,即人设可模型无关) | `cat ~/.npm/_npx/1e7f6d9597241db0/node_modules/@deepseek-ai/dsh/config/agent-presets/standard/agent.cordis.yml` | persona 行在 identity 段;工具行 tool-bash/fs/fs-search/jobs/skill 等 |
| 可写 preset 根 = `$DSH_HOME/.agent-presets`(默认追加);默认 preset 是用户设置 `agent-presets: default: <id>`,每次解析时读取 | Read `.../dsh-agent-presets/README.zh.md` | settings 层叠覆盖部署默认 |
| 网关 `session.create` 支持 `agentPreset` 参数;另有 `agentPreset.list/select/read/copy/remove` RPC 域;空白会话才可切 preset | `rg agentPreset .../dsh-host-apiproxy/README.zh.md` | GUI 天然有 preset 选择器 |
| `ctx.sessionTool` 契约:create/read/write/list/wait/collect/rename + workspace 四动词;`create` 选项 = title/parentSessionId/tags/workspacePath(**无 agentPreset、无 model 参数**);write=经网关 `session.prompt` 对话 | Read `../../session-tool/plugin/packages/session-tool/src/index.ts`(`SessionToolCreateOptions` L31 起) | preset/模型只能靠 profile 默认值或 GUI 传参 |
| marks 体系:`$DSH_HOME/session-tool/marks.jsonl`,`RESERVED_MARKS = ['kind:vibee','kind:delegated','kind:hidden','ui:aux']`,保留名只是普通合法 token;查询 `listByKind` | `rg RESERVED_MARKS ../../session-tool/plugin/packages/session-marks/src/index.ts`(L19) | 新增 `kind:dsh-bot` 是普通 token,无需改 session-tool |
| 消费 session-tool 的活样板(vibee):`static inject = ['sessionTool']`;执行链 create→mark→write→wait(idle)→read | `rg "static inject" ../../vibee/plugin/packages/vibee-host/src/index.ts`(L20);`rg sessionTool ../../vibee/plugin/packages/vibee-host/src/executor.ts`(L106/120/126/150/164) | 逐行核验 |
| agent 工具注册样板:`defineTool`(来自 `@deepseek-ai/dsh-tools`)+ `export const inject = ['tools','sessionTool']` + `ctx.tools.register(...)` | `rg defineTool ../../session-tool/plugin/packages/tool-session/src/index.ts`(L16/22/55) | 逐行核验 |
| bundle 挂载形状:包 `package.json` 声明 `dsh.bundle.patch` → `cordis.patch.yml` 顶层 `- insert:` 具名行列表 | Read `../../session-tool/plugin/packages/tool-session/cordis.patch.yml` | 两行:session-tool-local(config 含 webUrl)+ tool-session |
| profile 接线形状:`env/profiles/st/package.json` 的 `dsh.profile.bundles = [dsh-base, dsh-web-app, tool-session]` + 本地包 `link:` 提升 | Read `../../session-tool/plugin/env/profiles/st/package.json` | 照抄换名即可 |
| boot 形状:`npx --yes @deepseek-ai/dsh@0.1.1-rc.2 --profile st --port 3081 --no-open`,前置 `gateway_refuse_foreign` 身份自检 | Read `../../session-tool/plugin/env/boot.sh`(L45) | 换 gb/3084 即可 |
| 生态口表:3080=官方/genoffice、3081=session-tool、3083=vibee;新仓建议 3082/3084;调试走 `dsh-plugin-debug` skill(`dsh-rpc-who.sh`/`dsh-rpc.sh`) | Read `../../README.md`;Read `~/.agents/skills/dsh-plugin-debug/SKILL.md` | 一口一仓;3084 为 skill 示例推荐口 |
| better-sidebar 页签样板(client 半身):`ctx.inject(['betterSidebar'], …)` 可选注入 + `registerTab({id,title,icon,order,badge,component})`;client↔host RPC = HTTP `POST /vibee/<method>`(body `{args}`)+ SSE 降级轮询 | Read `../../vibee/plugin/packages/ui-vibee/src/client/index.ts`(L179-204);Read `.../runs-client.ts`(L39-64) | 逐行核验;genoffice 亦用 `dsh-better-sidebar@0.13.0` |
| web-app 组合把 agent 平面(tool-bash/fs/skill 等)移入 preset,host 平面保留注册表/沙箱/持久化/**模型路由** | `sed -n '290,380p' .../dsh-web-app/cordis.patch.yml` | preset 行 `default: standard`,随附根只读、可写根在 DSH_HOME |
| 平台**无 MCP 支持包**(`@deepseek-ai/` 命名空间无 dsh-mcp) | `ls .../node_modules/@deepseek-ai/ \| rg -i mcp` | 空结果;MCP 列为非目标 |
| PRD 校验闸门清单(18 项) | `python3 ~/.agents/skills/prd-workflow/scripts/validate_package.py --list` | 本包按其产出 |
| gb env 复用 st 的 `agent-default-model` + `llm-pi-ai.providers.anthropic`(中转 `grok-4.6`)后,真实 `session.prompt` 流式回复;`request/header.config` = `{provider: anthropic, model: grok-4.6, reasoningEffort: xhigh}` | Task 3:`dsh-rpc-who.sh 3084`;`session.create` + `session.prompt` + `session.history`;证据 `evidence/phase-0/model-smoke.md` | ASM-001 证实;assistant 文本 `model smoke ok` |
| `agent-default-model` 的 `settings.describe.applies = live`;`settings.update` 改 `reasoningEffort: high` 后**不重启**,新会话 `session.models.current` 与首轮 `request/header.config` 均为 high | Task 3:`settings.update` + 新 `session.create`/`session.history` | ASM-006 新建免重启 证实 |
| 会话内切模型的官方 RPC 是 `session.selectModel {sessionId, provider, model, reasoningEffort?}`;GUI `dsh-client-ui-model-selection` 两入口都走它;`session.prompt` / `session.create` / durableCreate **都不带** model;preset 行无模型字段 | Read `dsh-host-apiproxy` schema(`sessionSelectModelRequestSchema`);Task 3 实测下一轮 header `medium`;Task 4 对照 `agentPreset.list` | ASM-007 点名 API;GUI 设置「模型」页可见 DeepSeek/Anthropic(`gui-settings-models.png`) |
| `session.selectModel` **同时写入部署默认** `agent-default-model`(无 session-only 开关)。BR-010 应对插件会话 selectModel 后若全局被改写则 `settings.update` 恢复 | Task 3:selectModel 后 `settings.describe` 的 `agent-default-model.value.reasoningEffort` 变成 medium,再恢复 xhigh | Task 9 override 实现约束 |
| `session.create`(及 session-tool CLI/`durableCreate`)不传 `agentPreset` 时,响应与 `session.list` 行的 `agentPreset` 均为 profile 默认(`standard.isDefault=true`) | Task 4:`dsh-session session create --title 校准`;`session.list`;`agentPreset.list`;CLI 空白会话 history 无 `agent-preset` 事件 | ASM-002 机制证实(人设仍是 standard,等 Task 7 改默认) |
| loopback 3084 仅本仓 gb 网关;`DSH_HOME=<仓根>/env` | Task 4:`lsof -nP -iTCP:3084 -sTCP:LISTEN` + `dsh-rpc-who.sh 3084` | ASM-003 证实;口表保持 3084 |
| `settings.describe` 无 `dsh-bot` namespace(P0 尚未注册);UF-006 图形入口依赖 Task 9 | Task 4:`dsh-rpc.sh 3084 settings.describe '{}'` | 摘要 `settings-describe-summary.json` |
| session-tool list 的 `hiddenPrefixes=['~']` 生效(默认 list 丢掉 `~校准隐藏`,`--include-hidden` 可见);官方 0.1.1-rc.2 GUI **不按**标题 `~` 过滤(非 blank 的 `~校准隐藏` 出现在「未分组」);官方分组栏隐藏走 `workspace.archiveSession {sessionId}` | Task 4:CLI `~` 会话 + `gui-rail-after-tilde.png`;复查 `workspace.archiveSession` 后 `gui-rail-after-archive.png` 无该标题 | 插件 list 仍靠 hiddenPrefixes;UF-002 官方栏「不出现」的实现闸是 archiveSession(Task 9 接线) |
| `dsh-better-sidebar@0.13.0` 与 `@deepseek-ai/dsh@0.1.1-rc.2` 兼容:gb 挂载后 `pluginInventory/list` 中 `include:better-sidebar`/`include:ui-dsh-bot`/`include:dsh-bot-host`/`include:tool-dsh-bot` 均为 `fiberPhase=active`;右侧 + 菜单可开「DSH Bot」页签并渲染列表 | Task 15:boot gb + Playwright UF-003;`evidence/phase-3/plugin-inventory.json` + `evidence/UF-003/tab-list.png` | ASM-005 证实;无需 conversation.view 降级 |

### 1.4 假设清单

> 假设被证实后:事实回写 1.3 节并从本表删除该行;被证伪后走变更协议(shared-rules §12)。

| 假设 ID | 内容 | 风险 | 确认方式 |
|---|---|---|---|
| （无） | P0–P3 假设已全部回写 1.3(ASM-001/002/003/005/006/007) | — | — |

### 1.5 变更记录

| 日期 | 变更条目 ID | 原因 | 影响任务与处置 |
|---|---|---|---|
| 2026-08-29 | BR-001 v0.2(模型跟随 DSH 配置,xAI 降为示例);全局命名 Grok Bot→DSH Bot(BR-002/003/007、UF-001~004、preset id `dsh-bot`、marks `kind:dsh-bot`、工具 `dsh_bot_ask`、包名 `dsh-bot-host`/`tool-dsh-bot`/`ui-dsh-bot`、路由 `/dsh-bot/*`);新增 UF-005/EVD-008;删除 ASM-004(商标风险随改名消解);改写 ASM-001/006;包目录 `grok-bot-mvp`→`dsh-bot-mvp` | 用户拍板三条:走 DSH 自己的模型配置(设置可切)、命名 dsh bot、人设方案确认 | 全部任务尚未开工,无状态回退;Task 3(重写为模型基线)、Task 4(追加 override 勘察)、Task 6/7/9/10/11/13/14/15/18(改名与描述同步);tasks.csv 全量刷新 |
| 2026-08-29(v0.3) | 新增 BR-010(bot 专属默认模型)、UF-006/EVD-009、ASM-007;讨论-A 定案为「要做」、讨论-B 定案为「本机目录不动,GitHub 仓名 dsh-bot」并从 1.4 移除;完善:Task 6 改用 `agentPreset.copy` 创作正路、Task 2 增生态口表登记、Task 4 增 settings GUI 呈现勘察、Task 18 manual-test 补模型切换步骤 | 用户拍板:要 bot 专属默认模型(双模型日常);命名仓名定案;并要求审视完善空间 | Task 4/9/13/14/18/19 描述更新;5.2 矩阵增 UF-006 三行;状态板同步 |
| 2026-08-29(v0.3.1) | 完整性终审落 5 项执行层修补:Task 2 补 `env/cli.patch.yml`;Task 6 RPC 方法名改点号域形态(`agentPreset.copy/list`);Task 4 增「~ 隐藏机制在官方组合在位」校验项;Task 14 增 client 挂载三件套勘察步骤与 locale 词条;Task 18 增 GitHub 建仓推送与生态清单登记。合同条目零变化 | 用户要求终审「是否完全」;审出执行层小洞 | 仅任务详情更新,无状态回退;拆包评估结论:单包不拆(见对话记录),Phase 即分期 |
| 2026-08-29(v0.3.2) | oneclick 增量重跑收口:§3.3 锚点可执行化(去 `\|` 转义改单模式、`@`/`~` 路径与新建行改 `rg -F` 文档形式并写明约定)、首次通过 `--repo` 全量锚点真跑;5.2 矩阵补「UF-002 并发委托」行(封闭 2.7 场景到执行的缺口);evidence/README 的 phase-0 清单对齐(xai-smoke→model-smoke)。合同条目零变化 | 用户指令:走 prd-workflow oneclick 完善 | 仅 §3.3/5.2/evidence README 更新;包内首个 git commit 建立基线 |
| 2026-08-30(验收备注) | 执行后人工验收:全链路实测通过(GUI 对话/委托/页签/CLI,附截图与 RPC 取证);发现两缺口移交二期包 `../dsh-bot-workbench/`:①GUI 直建的 preset 会话不打 `kind:dsh-bot` 标记,页签列表名实不符;②bot 身份呈现仅徽标级,用户要求参考产品级的多人设 roster + 独立对话面。本包合同不再变更,状态转 Done | 用户实测反馈 + 本会话复验 | v1 包收口;后续需求走新包 |
| 2026-08-29(v0.3.3) | P0 校准消解 ASM-001/002/003/006/007:事实回写 1.3(gb 冒烟 grok-4.6、默认 live 免重启、`session.selectModel` 点名且会写部署默认、durableCreate 吃默认 preset=standard、3084 本仓、官方 GUI 不藏 `~` 标题)。合同 BR/UF/INV 正文未改;INV-002 官方栏藏 `~` 记为后续风险(calibration.md) | Task 3/4 真跑网关 :3084 | 1.4 仅余 ASM-005;Task 9 必须按 selectModel+必要时恢复全局默认实现 BR-010 |
| 2026-08-29(v0.3.4) | 变更协议 INV-002:0.1.1-rc.2 官方 GUI 不按 `hiddenPrefixes`/`~` 过滤标题(Task 4 证伪);官方分组栏隐藏的既有闸是 `workspace.archiveSession`。UF-002 Then「官方栏不出现」不变;BR-003 正例不变;Task 9 委托链补 archiveSession。复查 Task 3:GUI 选择器实切 DeepSeek-V4-Flash,`request/header` provider/model 变更并有流式回复截图 | P0 review p1(UF-005 GUI 未切模型;INV-002 合同与证据矛盾) | Task 9 接线;1.3 事实改写;证据 `gui-stream-reply.png` / `gui-rail-after-archive.png` |
| 2026-08-29(v0.3.5) | P3 消解 ASM-005:`dsh-better-sidebar@0.13.0` 在 `@deepseek-ai/dsh@0.1.1-rc.2` gb 组合中 `pluginInventory` 全 active,UF-003 页签实渲染。合同 BR/UF/INV 正文未改 | Task 15 真跑网关 :3084 + Playwright | 1.4 无剩余假设;无需 conversation.view 降级 |

---

## 2. 业务合同

> 本章是 BR/UF/INV/EVD 的唯一定义处。任务、review 一律引用 ID,不复制表格。

### 2.1 BR 业务规则

| 规则 ID | 规则 | 正例 | 反例 | 影响范围 | 验证方式 |
|---|---|---|---|---|---|
| BR-001 | 模型跟随 DSH 自身配置:bot 的供应商/模型完全由 DSH 既有配置面决定——默认取 `agent-default-model`,可经官方设置与会话内模型选择器切换;插件代码不写模型适配器、不硬编码 provider/model;`settings.example.yaml` 仅附**注释掉的 xAI 直连示例段**(`llm-pi-ai.providers.xai` + `XAI_API_KEY`)供直连场景启用 | 改默认模型后,新 bot 会话与新委托的 `request/header` 用新模型 | 代码里出现 `provider: 'xai'` 之类硬编码;或仓内自写 fetch 模型端点 | env 配置 + dsh-bot-host | Task 3 冒烟 + `rg "provider.*:.*'" packages/` 人工复核 + UF-005 |
| BR-002 | 人设走 preset:DSH Bot 人设由 `env/.agent-presets/dsh-bot/`(`dsh-persona` 行 `config.text`,**全新撰写、模型无关**,用 `{{model}}`/`{{cwd}}` 变量)承载;gb profile 以 `agent-presets: default: dsh-bot` 指向它;不改随附 standard preset | 新会话 `session.history` 可见 preset=dsh-bot 且首请求含人设段 | 人设写进官方 preset 目录,或文本抄自重建仓,或人设里写死某模型名 | preset + settings | Task 7 GUI 验证 + 文本人工比对 |
| BR-003 | 会话管理走 session-tool:bot 会话创建/写入/等待/读取一律经 `ctx.sessionTool`(带 caller fence);标记一律走 marks(交互会话 `kind:dsh-bot`;委托辅助会话另加 `kind:hidden` 且标题 `~dsh-bot:` 前缀);禁止写官方 `session/tags`、禁止绕过 fence 直接 `ctx.sessions.create` | `dsh_bot_ask` 产生的会话在 `marks.jsonl` 有 `kind:dsh-bot`,官方会话栏不出现 | 直接调 `ctx.sessions` 或官方 tags 服务 | dsh-bot-host | Task 11 链路取证 + `rg 'session/tags' packages/` 为空 |
| BR-004 | 一口一仓:本仓独占 loopback **3084**;`boot.sh` 写死口并先跑 `gateway_refuse_foreign` 身份自检;绝不与 3080/3081/3083 抢口 | `dsh-rpc-who.sh 3084` 显示 `DSH_HOME=<本仓>/env` | boot 起在 3080 或不核身份直接起 | env/boot.sh | Task 2/5 取证 |
| BR-005 | 凭据纪律:模型凭据只经 `~/.dsh/.env` 由 setup.sh 种子到 `env/.env`(600 权限、gitignore);仓内任何入 git 文件不含明文 key,settings 只写 `apiKeyEnv` 引用 | `git status` 不含 env/.env;`rg -i 'api[-_]?key' env/settings.example.yaml` 只命中 `apiKeyEnv` 引用 | settings.example.yaml 写字面 key | env | Task 2 + Task 20 复查 |
| BR-006 | 参考只读红线:不从 `../reference` 拷贝任何代码/文案/品牌;仓内不得出现 `com.anysphere.sand`、`sand://`、上游 DSN/Statsig key/OAuth client id;参考仅限契约形状笔记 | `rg -i 'anysphere\|sand://' packages/ env/ scripts/`(除本 spec 引文)为空 | 复制 provider-session.ts 片段进实现 | 全仓 | Task 20 终检 |
| BR-007 | 委托工具契约:`dsh_bot_ask(prompt, title?)` 在受 fence 的隐藏 bot 会话里完成 create→write→wait(idle)→read,返回 bot 最终回答文本;session-tool 未挂载、网关不可达、模型失败时工具必须返回明确错误(fail loud),禁止静默空串 | 任意会话模型调 `dsh_bot_ask` 得到回答;停掉网关后调用返回 `web-unreachable` 类错误文本 | 失败时返回空字符串或吞错 | tool-dsh-bot | Task 11 + 5.2 失败分支 |
| BR-008 | 侧栏可选注入:`ui-dsh-bot` 经 `ctx.inject(['betterSidebar'], …)` 注册页签;无 better-sidebar 的组合里 preset/工具功能不受影响(不硬 inject) | 从 profile 去掉 sidebar 后 boot,其余行仍 active | 硬 inject 导致整组 pending/failed | ui-dsh-bot | Task 15 降级实验 |
| BR-009 | 标准面对齐:可挂载包带官方 `dsh.plugin.json` + 社区 `dsh-plugin.json` 双 manifest;`standards/` 含 Host Descriptor(profile gb/:3084)、协商检查、fixtures、adapter 审计;`pnpm run standard:check` 0 FAIL;**不写 `provides`**(等上游 RFC 0003) | standard:check 输出全绿 | manifest 缺失或写了 provides | packages + standards | Task 17 |
| BR-010 | bot 专属默认模型:插件注册 `dsh-bot` settings namespace,含可空的 `model {provider, model, reasoningEffort?}`;为空 ⇒ 完全跟随全局默认;非空 ⇒ **经本插件创建**的 bot 会话(dsh_bot_ask 委托 + 页签新建)在首次投递前应用该模型(机制按 ASM-007 勘察结论);变更热生效免重启;override 指向未注册路由或缺凭据时 fail loud,禁止静默回落全局。**边界**:GUI 直接新建的会话不受 override 影响(跟随全局,可会话内手动切) | 设 override 后新委托 `request/header` 用 override;清空后回全局 | override 悄悄失败回落全局;GUI 新会话被 override 改写 | dsh-bot-host + settings | Task 9/11 + UF-006 矩阵 |

### 2.2 UF 用户验收场景(索引)

| 场景 ID | Given | When | Then | 角色 | 验证方式 | Evidence |
|---|---|---|---|---|---|---|
| UF-001 | gb 网关已起(:3084),DSH 模型配置可用 | 用户在 GUI 新建会话并发送消息 | 会话以 dsh-bot preset 组装,以当前配置模型流式回复,自动生成标题 | 本机用户 | browser(工具可用)/手动回填 + RPC 取证 | EVD-003 |
| UF-002 | 任意会话进行中(工具已挂载) | 模型调用 `dsh_bot_ask("<问题>")` | 后台建 `~dsh-bot:` 隐藏会话(kind:dsh-bot + kind:hidden)完成问答,工具返回答案;官方会话栏不出现该会话 | 任意 agent | CLI/RPC 取证 + browser 复核会话栏 | EVD-004 |
| UF-003 | 网关已起且存在 ≥1 个 bot 会话 | 用户打开右侧「DSH Bot」页签 | 列出 kind:dsh-bot 会话(标题/时间),点条目跳转会话视图;点「新建」创建 bot 会话并跳转 | 本机用户 | browser(工具可用)/手动回填 | EVD-005 |
| UF-004 | 存在已标记会话 | 运行 `dsh-session marks list --kind kind:dsh-bot` | 输出会话 id 与标记集(不 boot profile,直读 marks.jsonl) | 运维/CLI | CLI 直跑 | EVD-006 |
| UF-005 | DSH 已配置 ≥2 条可用模型路由 | 用户经会话内选择器或设置切换模型 | 当前会话下一轮次 / 其后新建会话与新委托,`request/header` 用新模型;preset 与人设不变 | 本机用户 | browser + RPC 取证 | EVD-008 |
| UF-006 | 已配置 ≥2 条路由,`dsh-bot.model` 当前为空 | 用户在 settings 写入 bot 专属模型,触发新委托/页签新建;随后清空 | override 期间经插件创建的 bot 会话用 override 模型;清空后回全局默认;全程 GUI 直建会话不受影响 | 本机用户 | settings 编辑 + RPC 取证 | EVD-009 |

### 2.3 核心业务流程(步骤级交互脚本)

#### UF-001: GUI 与 DSH Bot 对话

**前置状态**:已执行 `sh env/setup.sh && sh env/boot.sh`;浏览器打开 `http://127.0.0.1:3084`;`env/settings.yaml` 已含可用模型路由(Task 3 接线),对应凭据在 `env/.env`。

**成功主路径**:

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 点击「新建会话」 | 出现空白会话视图与输入框 | `session.create`(preset 缺省 → `agent-presets.default = dsh-bot`) | 新会话就绪;preset 指示为 DSH Bot |
| 2 | 输入「你是谁?」并回车 | 消息上屏,回复区出现流式光标 | `session.prompt` → agent loop 按 `agent-default-model` 路由调模型 | DSH Bot 以人设口吻流式回复(人设可报出 `{{model}}` 解析的当前模型) |
| 3 | — | 标题从「未命名」变为自动摘要 | session-title 服务生成标题 | 侧栏出现带标题的会话 |

**失败分支**:

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 无凭据 | 当前路由的 `apiKeyEnv` 在 env/.env 缺失 | 回复区出现明确错误(点名缺失凭据引用),不静默 | 适配器以 `MISSING_CREDENTIAL` fail loud | 补 key 后直接重发,无需重启(凭据按请求解析) |
| 上游失败 | 模型端点 401/429/超时 | 错误卡片呈现稳定错误码,会话可重试 | `LlmError(AUTH/RATE_LIMIT/TIMEOUT)` 记入 turn 失败 | 修正凭据/稍后重试,或经 UF-005 切换到另一路由 |

**界面状态机**:

```text
空会话 → 发送中(流式) → 就绪(可继续发)
              |
              v
           错误卡片(会话保留,可重发)
```

**入口接线清单**(本流程从哪些真实入口可达):

- 浏览器 `http://127.0.0.1:3084` → 官方 GUI「新建会话」按钮(平台自带,无需本仓接线)
- 人设与模型基线的接线点:`env/settings.yaml`(`agent-presets.default` + 模型路由分节)→ Task 3/7 负责

#### UF-002: 任意 agent 委托 dsh_bot_ask

**前置状态**:gb 网关已起;`tool-dsh-bot` bundle 已挂载(pluginInventory 中 active);用户在任一会话中。

**成功主路径**:

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 对当前会话说「用 dsh_bot_ask 问一下:量子纠缠是什么」 | 模型开始响应 | agent loop 产生 `dsh_bot_ask` tool-call | 会话里出现工具调用卡片 |
| 2 | — | 工具卡片显示执行中 | dsh-bot-host:`sessionTool.create`(title `~dsh-bot: <摘要>`,marks 含 `kind:dsh-bot`+`kind:hidden`)→ 官方 `workspace.archiveSession`(分组栏隐藏)→ `write(prompt)` → `wait(idle)` → `read` | — |
| 3 | — | 工具卡片完成 | 工具返回 bot 最终回答文本 + 后台会话 id | 主会话模型引用答案继续作答;官方会话栏**没有**新增 `~` 会话 |

**失败分支**:

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 网关不可达 | web 网关死/webUrl 配错 | 工具卡片显示明确错误(`web-unreachable`) | sessionTool 传输层错误透传,工具 fail loud(BR-007) | 起网关/修 webUrl 后重试 |
| 模型失败 | 上游 4xx/超时 | 工具卡片带稳定错误码 | bot 会话 turn 失败,`read` 回传含失败说明,工具返回错误文本 | 主会话可再次调用,或先经 UF-005 换路由 |
| 等待超时 | bot 会话长时间不 idle | 工具在配置时限后返回超时错误并附会话 id | `wait` 超时中断,不杀 bot 会话 | 用户可稍后经 UF-003/UF-004 找到该会话查看 |

**界面状态机**(工具卡片,CLI 同构):

```text
tool-call 出现 → 执行中 → 成功(答案入会话)
                    |
                    v
                 错误(错误码 + bot 会话 id,可重调)
```

**入口接线清单**:

- 任意会话 composer(模型自主或用户点名调用)→ `dsh_bot_ask` 工具(Task 10 注册,Task 11 挂进 gb 组合)
- 直接验证入口:`dsh-rpc.sh 3084 session.prompt`(dsh-plugin-debug skill)驱动一个会话调工具

#### UF-003: 侧栏「DSH Bot」页签

**前置状态**:gb 网关已起,浏览器打开 :3084;已存在 ≥1 个 `kind:dsh-bot` 会话;`dsh-better-sidebar` + `ui-dsh-bot` 已挂载。

**成功主路径**:

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 点击右侧栏「DSH Bot」页签图标 | 面板展开,列表 loading | client 调 `POST /dsh-bot/listSessions`(host 经 marks `listByKind` + sessionTool 元数据) | bot 会话列表:标题/时间;隐藏辅助会话默认折叠显示开关 |
| 2 | 点击某条会话 | 该条高亮 | client 调平台会话跳转(仿 vibee `jumpToSession`) | 主视图切到该会话对话 |
| 3 | 点击「新建 DSH Bot 会话」 | 按钮 loading、防重复点击 | client 调 `POST /dsh-bot/createSession` → host 经 sessionTool 建可见 bot 会话(marks `kind:dsh-bot`) | 主视图切到新会话,可直接开聊 |

**失败分支**:

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| RPC 失败 | host 路由未挂/网关重启中 | 面板显示错误态 + 重试按钮,不白屏 | fetch 非 2xx/网络错误 → 客户端错误态(仿 vibee degraded) | 点重试;boot 恢复后自动可用 |
| 空数据 | 无任何标记会话 | 面板显示空态文案 +「新建」引导 | listSessions 返回空数组 | 点新建走主路径 3 |

**界面状态机**:

```text
loading → 列表(idle) ⇄ 刷新
   |          |
   v          v
 错误态(重试) 空态(引导新建)
```

**入口接线清单**:

- 右侧栏页签注册:`ui-dsh-bot` client `apply()` 内 `ctx.inject(['betterSidebar'], …).registerTab(...)`(Task 14)
- 页签数据接线:host `/dsh-bot/*` HTTP 路由(Task 13)
- 组合接线:profile bundles 加 `dsh-better-sidebar` 与 `ui-dsh-bot` 所在 bundle(Task 15)

#### UF-004: CLI 查询 DSH Bot 会话标记

**前置状态**:存在已标记会话;终端在 session-tool 仓可执行 `dsh-session`(邻仓 CLI,零改动)。

**成功主路径**:

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 运行 `DSH_HOME=<本仓>/env node ../../session-tool/plugin/packages/session-tool-cli/lib/bin.js marks list --kind kind:dsh-bot` | — | 直读本仓 `env/session-tool/marks.jsonl`(不 boot) | 每行输出 `session-id  [kind:dsh-bot, …]` |

**失败分支**:

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 无标记 | marks.jsonl 无该 kind | 输出空列表提示 | listByKind 命中 0 | 先跑 UF-002/003 产生会话 |
| DSH_HOME 指错 | 环境变量缺失/指向他仓 | 输出空或他仓数据 | 读错文件 | 按命令模板显式传 `DSH_HOME=<本仓>/env` |

**界面状态机**(CLI):

```text
执行 → 输出列表 / 空提示 / 报错退出(非零码)
```

**入口接线清单**:

- 命令模板写入本仓 README「运维」节(Task 18);CLI 本体是 session-tool 既有产物,本仓零实现

#### UF-005: 切换 bot 使用的模型

**前置状态**:gb 网关已起;`env/settings.yaml` 配置 ≥2 条可用模型路由(如中转 grok-4.6 与 deepseek 路由);当前在一个 DSH Bot 会话中。

**成功主路径**(会话内切换):

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 点击 composer 的模型选择器 | 下拉列出已配置的 provider/模型 | GUI 读 `llm.listProviders/listModels` | 看到全部已配置模型 |
| 2 | 选择另一模型 | 选择器显示新模型名 | 会话调用配置更新(preset/人设不变) | — |
| 3 | 发送一条消息 | 流式回复 | 该轮 `request/header` 记录新 provider/model | 回复来自新模型(RPC 取证可核) |

**次路径**(默认切换 → 作用于其后的新会话与新委托):

| 步骤 | 用户动作 | 系统行为 | 核对点 |
|---|---|---|---|
| 1 | 修改 `env/settings.yaml` 的 `agent-default-model` 分节(或经官方设置页等价操作) | 设置层叠覆盖默认值 | — |
| 2 | 新建会话或触发一次 `dsh_bot_ask` | 新会话按新默认组装模型路由 | 新会话/委托会话 `request/header` 用新模型(ASM-006 语义,Task 3 校准) |

**失败分支**:

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 只有一条路由 | settings 未配第二模型 | 选择器只有单一选项,无从切换 | — | 按 1.3 键形在 settings 增路由(免重启生效) |
| 切到缺凭据的路由 | 新路由 `apiKeyEnv` 未配 | 下一轮明确报 `MISSING_CREDENTIAL`,点名凭据引用 | 请求前凭据解析失败,fail loud | 切回原模型即恢复,或补 key |

**界面状态机**:

```text
选择器 idle → 展开 → 选中新模型 → 下一轮次生效
                          |
                          v
                凭据缺失报错(可切回/补 key)
```

**入口接线清单**:

- 会话 composer 模型选择器(平台 `dsh-client-ui-model-selection` 自带;本插件零实现,负责验证其对 dsh-bot preset 会话可用)
- `env/settings.yaml` 模型分节(默认值入口,Task 3 接线;`settings.example.yaml` 附注释版 xAI 直连示例)
- 委托侧约束:`dsh-bot.model` 为空时,dsh-bot-host 创建会话**不携带**模型参数,天然跟随默认(Task 9 的接线纪律,BR-001;非空时走 UF-006)

#### UF-006: 设置 bot 专属默认模型

**前置状态**:gb 网关已起;`env/settings.yaml` 配置 ≥2 条可用路由;`dsh-bot` 分节当前为空(跟随全局);ASM-007 已由 Task 4 消解(机制明确)。

**成功主路径**:

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 在 `env/settings.yaml` 写入 `dsh-bot: { model: { provider: <路由>, model: <模型> } }`(官方设置页若呈现该 namespace 则等价图形操作,见 Task 4 勘察) | — | settings namespace 热生效(与 llm-pi-ai 同款语义) | 页签「当前 bot 模型」显示 override 值 |
| 2 | 任意会话触发 `dsh_bot_ask`,或页签「新建 DSH Bot 会话」并发一句 | 工具卡片/新会话正常 | dsh-bot-host 创建会话后按 override 应用模型(ASM-007 机制),再投递 | bot 会话 `request/header` 用 override 模型 |
| 3 | 清空 `dsh-bot.model` | — | 回退为不携带模型参数 | 其后新委托/新建会话回到全局默认模型 |

**失败分支**:

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| override 指向未注册路由/模型 | provider 或 model 在 llm 注册表不存在 | 委托工具/新建返回明确错误,点名 provider/model | 请求前或首轮 fail loud(`NO_ADAPTER`/`UNKNOWN_MODEL` 类),不静默回落全局(BR-010) | 更正 override 或清空回退 |
| override 路由缺凭据 | 该路由 `apiKeyEnv` 未配 | 明确 `MISSING_CREDENTIAL` 类错误,点名凭据引用 | 请求前凭据解析失败 | 补 key 或清空 override |

**界面状态机**(配置生效链):

```text
override 未设(跟随全局) → 写入 override → 其后经插件创建的会话用 override
                                  |
                                  v
                        override 非法 → fail loud(可更正/清空回退)
```

**入口接线清单**:

- `env/settings.yaml` 的 `dsh-bot:` 分节(Task 9 注册 namespace,热生效)
- 官方设置页对该 namespace 的呈现(Task 4 勘察确认;有则免编 yaml)
- 页签「当前 bot 模型」显示(Task 14 接线,只读,来源 `/dsh-bot/listSessions` 响应的 botModel 字段)
- 语义边界(GUI 直建会话不受 override 影响)写入 README(Task 18)

### 2.4 INV 不变量

| 不变量 ID | 内容 | 关联 BR/UF | 验证方式 |
|---|---|---|---|
| INV-001 | 不修改官方 DSH npm 包与邻仓:session-tool / vibee / dsh-genoffice 三仓 `git status` 保持干净 | BR-001/003 | Task 20:`git -C ../../session-tool/plugin status --porcelain` 等三连为空 |
| INV-002 | 官方会话栏对非 bot 会话行为不变;本插件自建辅助会话(`~dsh-bot:`)从官方分组栏消失走平台既有 `workspace.archiveSession`(0.1.1-rc.2 客户端不按标题 `~` 过滤;blank 会话默认不出现);插件 session-tool list 另经 `hiddenPrefixes`(`~`)+`kind:hidden` | BR-003, UF-002 | 5.2 矩阵:普通会话照常显示;委托辅助会话 archive 后官方栏不出现 |
| INV-003 | 生态口表不被破坏:3080/3081/3083 归属不变,本仓只听 3084(或 ASM-003 证伪后的 3082,须同步生态 README) | BR-004 | `dsh-rpc-who.sh` 扫描输出 |
| INV-004 | 凭据与会话数据不进 git:`env/.env`、`env/sessions/`、`env/storages/`、`env/settings.yaml` 均 gitignore(与 session-tool 同款纪律) | BR-005 | `git status --porcelain` + `.gitignore` 内容检查 |

### 2.5 EVD 证据清单

| 证据 ID | 类型 | 期望证据 | 保存位置 |
|---|---|---|---|
| EVD-001 | log | boot 输出 + `dsh-rpc-who.sh 3084`(DSH_HOME=本仓 env)+ `pluginInventory/list` 快照 | `evidence/phase-0/boot.log`、`evidence/phase-0/rpc-who.txt`、`evidence/phase-0/plugin-inventory.json` |
| EVD-002 | log/screenshot | 模型基线冒烟:GUI 一次真实回复 + `request/header` 的 provider/model 与配置一致 | `evidence/phase-0/model-smoke.md` |
| EVD-003 | screenshot+log | UF-001 主路径三件套(截图/回填 + `session.history` 导出显示 preset 与流式回复)+ 两条失败分支记录 | `evidence/UF-001/` |
| EVD-004 | log+screenshot | UF-002:主会话工具卡片记录、bot 会话 `session.export`、`marks list` 输出、官方会话栏无 `~` 会话的截图/回填 | `evidence/UF-002/` |
| EVD-005 | screenshot+log | UF-003:页签列表/跳转/新建截图或回填 + console 无新增 error + RPC 请求样例 | `evidence/UF-003/` |
| EVD-006 | log | UF-004:CLI 完整命令与输出 | `evidence/UF-004/marks-list.txt` |
| EVD-007 | log | `standard:check`、`pnpm -r build/typecheck/test`、各 Phase 回归命令输出 | `evidence/phase-1/`…`evidence/phase-4/` |
| EVD-008 | log/screenshot | UF-005:会话内切换前后两轮 `request/header` 对比;默认切换后新委托会话 header | `evidence/UF-005/` |
| EVD-009 | log | UF-006:override 生效/清空回退前后的委托会话 header 对比;非法 override 的错误文本 | `evidence/UF-006/` |

### 2.6 角色与权限矩阵

单一角色(本机开发者/使用者),无权限差异;会话访问边界由 session-tool 既有 caller fence 承担(BR-003),不另设矩阵。

### 2.7 负向 / 破坏性场景

| 场景 | Given | When | Then | Evidence |
|---|---|---|---|---|
| 无凭据 | 当前路由 apiKeyEnv 未配 | UF-001 发消息 / UF-002 调工具 / UF-005 切到该路由 | 明确 `MISSING_CREDENTIAL` 类错误,点名凭据引用,不吞错 | `evidence/UF-001/missing-key.md` |
| 依赖失败(网关死) | 停掉 gb 网关 | UF-002 工具调用 / UF-003 页签打开 | 工具返回 `web-unreachable` 类错误;页签显示错误态可重试 | `evidence/UF-002/gateway-down.md`、`evidence/UF-003/rpc-error.png` |
| 上游失败 | 模型端点 401/429/超时 | UF-001/002 进行中 | 稳定错误码呈现,会话保留可重试 | `evidence/UF-001/upstream-error.md` |
| 重复提交/并发 | 同时发起多个 dsh_bot_ask | 各自创建独立 bot 会话 | 互不干扰(每次委托独立会话;不并发写同一会话——session-tool T17 已知边界,本插件按设计规避) | `evidence/UF-002/concurrent.md` |
| 空数据 | 无任何标记会话 | UF-003 打开页签 / UF-004 CLI | 空态文案/空列表提示,不报错 | `evidence/UF-003/empty.png`、`evidence/UF-004/marks-list.txt` |
| 旧数据兼容 | 不适用:全新仓,无历史数据需迁移 | — | — | — |

### 2.8 非目标

- **模型厂商绑定**:插件不绑定/不强制任何 provider(含 xAI);xAI 直连只是 `settings.example.yaml` 里的注释示例。
- **对 GUI 直建会话自动应用 bot override**:不做(BR-010 边界);仅当 Task 4 发现 preset 层可承载模型时另走变更协议升级。
- **MCP 连接器**:平台无 MCP 包(1.3 已验证),不在本插件内自建 MCP 宿主;如需要,另立 RFC/子包。
- **Docker/远程沙箱复刻**:执行隔离沿用平台 host 组合既有沙箱栈,不复刻参考产品的 box 体系。
- **多 provider Router 界面与用量面板**:模型切换/配置沿用官方 settings-models 与 model-selection UI(UF-005 即验证此路);token 用量沿用平台 token-meter/session-stats。
- **桌面壳**:不做 Electron/VNC/Computer Use/automations/channels/org-chart。
- **上游品牌与协议**:不接 api2.cursor.sh,不复用上游标识(BR-006)。
- **公开分发包**:MVP 只交付本机一口一仓调试环境;npm 发布、preset 随包分发(roots 覆盖)留待后续。

---

## 3. 技术方案

### 3.1 架构 Before / After

```text
Before(现状):
~/workspace/dsh/plugin/
├── session-tool/plugin   (:3081, ctx.sessionTool + marks + dsh-session CLI)
├── vibee/plugin          (:3083, 消费 sessionTool 的样板)
├── dsh-genoffice/plugin  (:3080, better-sidebar 样板)
└── dsh-grok-bot/
    ├── reference/        (只读逆向参考树)
    └── plugin/           (空,仅本 spec;目录改名议题见 讨论-B)

After(MVP 完成):
dsh-grok-bot/plugin  (:3084, profile gb, DSH 0.1.1-rc.2)
├── packages/
│   ├── dsh-bot-host     # ctx.dshBot 服务:askBot/listSessions/createSession
│   │                    #   inject sessionTool;marks kind:dsh-bot;/dsh-bot/* HTTP RPC
│   ├── tool-dsh-bot     # bundle:dsh_bot_ask 工具 + cordis.patch.yml(挂 host + 工具行)
│   └── ui-dsh-bot       # client 半身:better-sidebar「DSH Bot」页签
├── env/                 # 本仓 DSH_HOME
│   ├── setup.sh / boot.sh(:3084)/ gateway-id.sh
│   ├── settings.example.yaml → settings.yaml(模型路由沿用用户现有配置 + 注释版 xAI 示例 + 默认 preset)
│   ├── .agent-presets/dsh-bot/    # 人设 preset(standard 副本 + 新 persona 文本,模型无关)
│   └── profiles/gb/     # bundles: dsh-base + dsh-web-app + dsh-better-sidebar + tool-session + tool-dsh-bot
├── standards/           # 双 manifest 校验 + host-descriptor(gb/3084) + fixtures + adapter 审计
├── scripts/manual-test.sh
└── docs/dsh-bot-mvp/    # 本包
        推理链:GUI/工具 → agent loop → ctx.llm → 用户配置的路由(llm-pi-ai 等)→ 对应端点
        会话链:dsh_bot_ask → ctx.sessionTool → web 网关(durableCreate/prompt)→ 持久化 + marks
        模型切换:官方选择器/settings(agent-default-model)→ 新轮次/新会话生效(本插件零实现,只验证)
        bot 专属模型:settings `dsh-bot.model`(可空)→ dsh-bot-host 对经插件创建的会话应用(ASM-007 机制)
```

### 3.2 模块改造

| 模块 | 职责 | 改造说明 |
|---|---|---|
| 仓根(package.json/pnpm-workspace/tsconfig) | monorepo 骨架 | 新建;仿 session-tool 根(pnpm + tsdown + vitest + standard:check 脚本) |
| `packages/dsh-bot-host` | `ctx.dshBot` 契约 + Provider(Service, `static inject = ['sessionTool']`,可选 `webServer`/`settings`):askBot 委托链、listSessions(marks listByKind ∩ sessionTool.list)、createSession;注册 `/dsh-bot/*` HTTP 路由;注册 `dsh-bot` settings namespace(BR-010 override,空=跟随全局) | 新建;委托链仿 vibee-host executor.ts,路由仿 genoffice relay-launch 的 webServer 用法,settings 注册仿 llm-pi-ai 模式 |
| `packages/tool-dsh-bot` | 可挂载 bundle:`defineTool` 注册 `dsh_bot_ask`;`cordis.patch.yml` insert dsh-bot-host 行 + 本工具行;双 manifest | 新建;仿 tool-session(工具注册)+ vibee(bundle 拆分) |
| `packages/ui-dsh-bot` | client 半身:betterSidebar 可选注入 registerTab;列表/新建/跳转;HTTP RPC client(fetch `/dsh-bot/<method>`,`{args}` 包裹)+ 轮询刷新 | 新建;仿 ui-vibee client/index.ts + runs-client.ts(MVP 不做 SSE,轮询即可) |
| `env/` | 本仓 DSH_HOME 与调试环境 | 新建;boot 口 3084、profile gb;settings 沿用用户现有模型配置 + 注释版 xAI 示例 + 默认 preset;`.agent-presets/dsh-bot/` 入仓 |
| `standards/` | 社区标准静态面 | 新建;host-descriptor 按 gb/:3084;requires 含 SessionTool 契约坐标(`x-nothing1024.session-tool/v1alpha1`) |
| `scripts/manual-test.sh` | UF 矩阵半自动回放 | 新建;仿 session-tool 版(先 gateway_require 再打 RPC/CLI) |

### 3.3 三段式定位清单

> 行号只是 hint;漂移时以 symbol + rg anchor 为准。本需求为绿地新仓:**「新建」行给出目标路径与建成后锚点**;「样板」行是既有文件,全部已实际读取核验(命令见 1.3)。
> 锚点书写约定:`rg "pattern" <相对路径>` 形式(裸 rg + 双引号模式)的行参与 `validate_package.py --repo` 自动真跑(路径相对本仓根);**新建文件与含 `@`/`~` 路径的行刻意写成 `rg -F` 形式**,校验器按设计跳过(建成后/人工核验),不是笔误。

| 文件 | 稳定定位 | 搜索定位 | 行号 hint | 备注 |
|---|---|---|---|---|
| `../../session-tool/plugin/packages/session-tool/src/index.ts` | `interface SessionToolCreateOptions` | `rg "SessionToolCreateOptions" ../../session-tool/plugin/packages/session-tool/src/index.ts` | L31 | 样板:服务契约(无 agentPreset/model 参数,ASM-002 由此来) |
| `../../session-tool/plugin/packages/session-marks/src/index.ts` | `export const RESERVED_MARKS` | `rg "RESERVED_MARKS" ../../session-tool/plugin/packages/session-marks/src/index.ts` | L19 | 样板:marks 纯库(listByKind/put/get) |
| `../../vibee/plugin/packages/vibee-host/src/executor.ts` | `sessionTool.create` 调用链 | `rg "sessionTool.create" ../../vibee/plugin/packages/vibee-host/src/executor.ts` | L106-L164 | 样板:askBot 委托链逐行参照(write/wait/read 同文件) |
| `../../vibee/plugin/packages/vibee-host/src/index.ts` | `static inject = ['sessionTool']` | `rg "static inject" ../../vibee/plugin/packages/vibee-host/src/index.ts` | L20 | 样板:服务注入声明 |
| `../../session-tool/plugin/packages/tool-session/src/index.ts` | `defineTool` / `export const inject` | `rg "defineTool" ../../session-tool/plugin/packages/tool-session/src/index.ts` | L16/L22/L55 | 样板:工具注册(inject 声明同文件 L22) |
| `../../session-tool/plugin/packages/tool-session/cordis.patch.yml` | `- insert:` 行列表 | `rg "insert" ../../session-tool/plugin/packages/tool-session/cordis.patch.yml` | L9 | 样板:bundle patch 形状(webUrl 字段须随仓改 3084) |
| `../../vibee/plugin/packages/ui-vibee/src/client/index.ts` | `ctx.inject(['betterSidebar']` | `rg "betterSidebar" ../../vibee/plugin/packages/ui-vibee/src/client/index.ts` | L179-L204 | 样板:页签可选注入 + registerTab 描述符 |
| `../../vibee/plugin/packages/ui-vibee/src/client/runs-client.ts` | `async function typertCall` | `rg "typertCall" ../../vibee/plugin/packages/ui-vibee/src/client/runs-client.ts` | L39 | 样板:client→host HTTP RPC(`{args}` 包裹)与错误/降级态 |
| `../../session-tool/plugin/env/boot.sh` | `npx --yes @deepseek-ai/dsh@0.1.1-rc.2` | `rg "npx --yes" ../../session-tool/plugin/env/boot.sh` | L45 | 样板:boot 与身份自检(换 gb/3084) |
| `../../session-tool/plugin/env/profiles/st/package.json` | `"dsh": { "profile": { "bundles"` | `rg "bundles" ../../session-tool/plugin/env/profiles/st/package.json` | L13-L21 | 样板:profile 组合与 link 提升 |
| `../../session-tool/plugin/env/settings.yaml` | `agent-default-model:` / `llm-pi-ai:` | `rg "agent-default-model" ../../session-tool/plugin/env/settings.yaml` | 前 40 行 | 样板:settings 键形与用户现有模型路由(本仓沿用;llm-pi-ai 分节同文件) |
| `../../session-tool/plugin/env/profiles/st/node_modules/@earendil-works/pi-ai/dist/providers/data/xai.json` | `"grok-4.5"` 条目 | `rg -F "grok-4.5" ../../session-tool/plugin/env/profiles/st/node_modules/@earendil-works/pi-ai/dist/providers/data/xai.json` | — | 事实:xAI catalog(注释示例的依据;路径含 `@`,人工核验) |
| `~/.npm/_npx/1e7f6d9597241db0/node_modules/@deepseek-ai/dsh/config/agent-presets/standard/agent.cordis.yml` | `- id: persona` 行 | `rg -F "dsh-persona" ~/.npm/_npx/1e7f6d9597241db0/node_modules/@deepseek-ai/dsh/config/agent-presets/standard/agent.cordis.yml` | 首屏 | 事实:随附 preset 组装与 persona 承载(npx 缓存路径,机器本地,人工核验) |
| `packages/dsh-bot-host/src/index.ts` | 新建:`class DshBotService`(`super(ctx, 'dshBot')`) | 建成后 `rg -F "dshBot" packages/dsh-bot-host/src/index.ts` | 新建 | Task 9 |
| `packages/dsh-bot-host/src/routes.ts` | 新建:`/dsh-bot/listSessions` 等路由注册 | 建成后 `rg -F "dsh-bot/" packages/dsh-bot-host/src` | 新建 | Task 13 |
| `packages/tool-dsh-bot/src/index.ts` | 新建:`dsh_bot_ask` defineTool | 建成后 `rg -F "dsh_bot_ask" packages/tool-dsh-bot/src/index.ts` | 新建 | Task 10 |
| `packages/tool-dsh-bot/cordis.patch.yml` | 新建:insert dsh-bot-host + tool-dsh-bot 行 | 建成后 `rg -F "dsh-bot-host" packages/tool-dsh-bot/cordis.patch.yml` | 新建 | Task 10 |
| `packages/ui-dsh-bot/src/client/index.ts` | 新建:`apply(ctx)` + registerTab | 建成后 `rg -F "registerTab" packages/ui-dsh-bot/src/client/index.ts` | 新建 | Task 14 |
| `env/.agent-presets/dsh-bot/agent.cordis.yml` | 新建:persona 行文本替换 | 建成后 `rg -F "dsh-persona" env/.agent-presets/dsh-bot/agent.cordis.yml` | 新建 | Task 6 |
| `env/settings.example.yaml` | 新建:模型路由(沿用现配置)+ 注释版 xAI 示例 + 默认 preset | 建成后 `rg -F "agent-default-model" env/settings.example.yaml` | 新建 | Task 3/7 |
| `env/boot.sh` | 新建:GW_PORT=3084 + gateway_refuse_foreign | 建成后 `rg -F "3084" env/boot.sh` | 新建 | Task 2 |

### 3.4 API / 数据 / 权限 / 路由影响

| 类型 | 是否影响 | 说明 | 兼容策略 |
|---|---|---|---|
| API | 新增 | host 侧新增 `/dsh-bot/listSessions`、`/dsh-bot/createSession` HTTP 路由;新增 agent 工具 `dsh_bot_ask` | 全部为本仓新增面;不改官方 RPC |
| 数据 | 新增 | `env/session-tool/marks.jsonl` 新增 `kind:dsh-bot` 标记行;bot 会话按平台既有 JSONL 持久化 | 复用 session-tool 格式,零新事件类型 |
| 权限 | 否 | 会话访问沿用 sessionTool caller fence;无新权限面 | — |
| 路由(口) | 新增 | loopback 3084 归本仓(ASM-003) | 撞口回退 3082 并同步生态 README |

---

## 4. Phase 计划与任务详情

> Phase 依赖链:

```text
P0 环境与模型基线 → P1 人设 preset → P2 委托工具(session-tool 集成) → P3 侧栏 UI → P4 标准面与真实验收
```

> 实现任务数 13(不含校准/回归)≥ 8 → 状态板用同目录 `tasks.csv`。
> 状态列严格枚举:待开始 / 进行中 / 已完成 / 已阻塞:原因;每完成一条立即更新。

### Phase 0: 环境与模型基线

> 你在哪里:空仓,只有本 spec;gb 环境不存在。
> 做完之后:`:3084` 网关身份属于本仓,GUI 能以用户现有 DSH 模型配置真实对话,模型切换语义经校准;关键假设消解。

### Task 1: 搭建仓库 monorepo 骨架

- **关联**:BR-006 / INV-001 / INV-004(UF 无:纯基建,不面向用户)
- **前置任务**:无
- **风险等级**:P2

**为什么做**:所有后续包与环境都长在这套骨架上;gitignore 纪律必须从第一个 commit 就正确。

**涉及文件与定位**:

- 新建 `package.json`、`pnpm-workspace.yaml`(`packages/*`)、`tsconfig.base.json`、`tsconfig.json`、`vitest.config.ts`、`.gitignore`、`README.md` 雏形
- 样板:`../../session-tool/plugin/` 同名文件(1.3 已核)

**具体操作**:

1. `git init`;按 session-tool 根形状写 monorepo 配置(pnpm、tsdown、vitest、`standard:check` 占位脚本)。
2. `.gitignore` 首批就位:`env/.env`、`env/sessions/`、`env/storages/`、`env/settings.yaml`、`node_modules`、`lib`、`env/profiles/*/node_modules`。
3. `pnpm-workspace.yaml` 除 `packages/*` 外,加邻仓相对路径:`../../session-tool/plugin/packages/session-marks|session-tool|session-tool-local`(vibee 同款)。

**验证**:`pnpm install` 退出码 0,`git status` 不含任何应忽略路径 → 期望干净

**Evidence**:`evidence/phase-0/scaffold.log`

**注意事项**:易错点——workspace 相对路径写错导致邻仓包解析失败;禁止把平台包写成 `latest`。

### Task 2: 搭建 env 调试环境(profile gb,口 3084)

- **关联**:BR-004 / BR-005 / INV-003 / INV-004(UF 无:基建)
- **前置任务**:1
- **风险等级**:P1

**为什么做**:一口一仓是生态硬规则;env/ 是本仓 DSH_HOME,后续一切验证都打这个口。

**涉及文件与定位**:

- 新建 `env/setup.sh`、`env/boot.sh`、`env/gateway-id.sh`、`env/cli.patch.yml`(headless CLI 打 3084 用,Task 4/11 的 session-tool CLI 依赖它)、`env/profiles/gb/package.json`、`env/profiles/gb/cordis.patch.yml`、`env/README.md`
- 样板:`../../session-tool/plugin/env/` 同名文件(boot.sh L45 换 `--profile gb --port 3084`)

**具体操作**:

1. 复刻 session-tool env 三脚本,替换 profile=gb、口=3084、包钉 `@deepseek-ai/dsh@0.1.1-rc.2`。
2. `profiles/gb/package.json`:bundles 先只挂 `@deepseek-ai/dsh-base` + `@deepseek-ai/dsh-web-app` + `tool-session`;dependencies link `tool-session`/`session-tool`/`session-tool-local`/`session-marks`(邻仓)。
3. `profiles/gb/cordis.patch.yml`:overlay `session-tool-local` 行 config,把 `webUrl` 指到 `http://127.0.0.1:3084`(整段重述保留字段——patch 是整体替换)。
4. `setup.sh` 从 `~/.dsh/.env` 种子凭据到 `env/.env`(600)。
5. 在生态根 `../../README.md` 口表登记本仓一行(`dsh-bot | gb | 3084 | 0.1.1-rc.2`),先占口防撞(INV-003)。

**验证**:`sh env/setup.sh && sh env/boot.sh` 起网关;`~/.agents/skills/dsh-plugin-debug/scripts/dsh-rpc-who.sh 3084` → 期望 `DSH_HOME=<本仓>/env`;`dsh-rpc.sh 3084 pluginInventory/list` 中 `tool-session`/`session-tool-local` 行 active

**Evidence**:`evidence/phase-0/boot.log`、`evidence/phase-0/rpc-who.txt`、`evidence/phase-0/plugin-inventory.json`(EVD-001)

**注意事项**:易错点——cordis overlay 替换整段 config,漏抄字段会静默丢配置;boot 前先 `gateway_refuse_foreign`。

### Task 3: 接通 DSH 模型配置基线并冒烟

- **关联**:BR-001 / BR-005 / UF-001 / UF-005 / EVD-002;消解 ASM-001、ASM-006
- **前置任务**:2
- **风险等级**:P0(模型链路是一切上层功能的地基)

**为什么做**:bot 的模型完全跟随 DSH 配置(用户拍板);必须先证明 gb 环境能复现用户现有模型配置、且切换语义(免重启、作用范围)与 UF-005 设计一致。

**涉及文件与定位**:

- 新建 `env/settings.example.yaml`(setup.sh 复制为 `env/settings.yaml`)
- 键形与现值样板:`../../session-tool/plugin/env/settings.yaml`(1.3 已核)

**具体操作**:

1. `settings.example.yaml` 写入:模型分节沿用用户现有配置形状(`agent-default-model` + `llm-pi-ai.providers` 现有路由,占位符指向 `env/.env` 的 apiKeyEnv 引用);**附注释掉的 xAI 直连示例段**(`providers.xai: {apiKeyEnv: XAI_API_KEY}`,启用条件写明)。
2. setup.sh 增加「settings.yaml 不存在则从 example 复制」;用户按需把 st 环境的真实模型分节拷入本仓 `env/settings.yaml`(不进 git)。
3. 重启 boot;GUI 或 `dsh-rpc.sh 3084` 建会话发一句话,确认按配置模型真实流式回复(消解 ASM-001)。
4. 校准 UF-005 语义(消解 ASM-006):改 `agent-default-model` → 新建会话看 `request/header` 是否用新值、是否免重启;GUI 会话内模型选择器实际切一次、发一轮、取证 header。
5. 结论回写 1.3,消解对应 ASM。

**验证**:`dsh-rpc.sh 3084 session.history` → 期望回复存在且 `request/header` 的 provider/model 与配置一致;切换后新会话 header 变化

**Evidence**:`evidence/phase-0/model-smoke.md`(EVD-002)

**注意事项**:禁止把字面 key 写进任何入 git 文件(BR-005);settings.yaml 本体 gitignore,example 是唯一入 git 的配置模板。

### Task 4: 勘察校准——durableCreate 默认 preset、口占用与模型 override 机制

- **关联**:ASM-002 / ASM-003 / ASM-007;支撑 UF-002/006 设计(UF 无:校准)
- **前置任务**:2
- **风险等级**:P1

**为什么做**:Phase 2 委托会话的人设依赖 ASM-002;口归属是生态硬规则;BR-010(bot 专属模型)的实现路径完全取决于 ASM-007 的机制勘察结论。

**涉及文件与定位**:

- 勘察对象:运行中的 gb 网关 + `../../session-tool/plugin/packages/session-tool-local/src/`(必要时读 durableCreate 客户端实现)

**具体操作**:

1. `lsof -i :3084` 确认仅本仓网关监听(消解 ASM-003;撞口则改 3082 并同步 `../../README.md` 口表)。
2. 用 session-tool CLI 对 :3084 建会话:`node ../../session-tool/plugin/packages/session-tool-cli/lib/bin.js session create --title 校准 …`(webUrl patch 指 3084)。
3. `dsh-rpc.sh 3084 session.history '{"sessionId":"<id>"}'` 查 header/`agent-preset` 事件,确认该会话组装的 preset id(消解 ASM-002;此时默认 preset 仍是 standard,看机制即可)。
4. **勘察 ASM-007(BR-010 的地基)**:找出对空白会话设置模型的官方机制——依次排查 GUI 会话内选择器实际调用的 RPC(浏览器 devtools 抓 `/api` 请求或读 `dsh-client-ui-model-selection` 的 client 源码)、`session.prompt`/durableCreate 是否受理调用配置、preset 组装能否携带模型行;点名可用机制与调用形状,回写 1.3 并消解 ASM-007。
5. 顺手确认官方设置页是否自动呈现插件注册的 settings namespace(`settings.describe` 里 `dsh-bot` 是否出现)——决定 UF-006 有无免编 yaml 的图形入口。
6. 建一个 `~` 前缀标题的校准会话,确认官方 GUI 会话栏**不显示**它(hiddenPrefixes 隐藏机制在官方 0.1.1-rc.2 组合中在位——UF-002 的隐藏语义依赖此;若缺失,则在 profile overlay 补 hiddenPrefixes 配置并回写 spec)。
7. 结论回写 spec:证实 → 1.3 加事实、删对应 ASM;证伪 → 变更协议(ASM-002 伪:UF-002 注明「委托会话人设以 profile 兜底或接受默认组装」;ASM-007 伪:BR-010 按其风险栏收缩,Task 9 相应调整)。

**验证**:ASM-002/003/007 均有明确结论并回写 spec → 期望 1.4 表相应行消解或改写

**Evidence**:`evidence/phase-0/calibration.md`

**注意事项**:打 RPC 前先 `dsh-rpc-who.sh` 核口——插错口=对别人的网关做事。

### Task 5: 执行 Phase 0 回归验证

- **关联**:本 Phase 全部 BR(BR-001/004/005)
- **前置任务**:3;4

**验证**:重启 boot 后复跑——`dsh-rpc-who.sh 3084` 身份对 + 模型冒烟可复现 + `git status` 干净(无凭据泄漏)

**Evidence**:`evidence/phase-0/phase-summary.md`

### Phase 1: DSH Bot 人设 preset

> 你在哪里:GUI 能按配置模型对话,但人设是平台默认 coding agent。
> 做完之后:本仓环境新会话默认即 DSH Bot 人设,GUI preset 选择器可见可切。

### Task 6: 编写 dsh-bot agent preset

- **关联**:BR-002 / BR-006 / UF-001
- **前置任务**:5
- **风险等级**:P1

**为什么做**:人设是「DSH Bot」区别于裸模型的产品本体;preset 是平台正路(会话级组装、GUI 可选、可复制创作)。

**涉及文件与定位**:

- 新建 `env/.agent-presets/dsh-bot/agent.cordis.yml`、`env/.agent-presets/dsh-bot/preset.yml`
- 样板:`~/.npm/_npx/1e7f6d9597241db0/node_modules/@deepseek-ai/dsh/config/agent-presets/standard/agent.cordis.yml`(persona 行,1.3 已核)

**具体操作**:

1. 走平台创作正路:`dsh-rpc.sh 3084 agentPreset.copy '{"from":"standard","agentPreset":"dsh-bot","name":"DSH Bot"}'`(点号域裸参数,dsh-rpc.sh 自动选 envelope;或 GUI 等价操作)——整目录副本与随附集合同源,平台升级时的组装漂移由 copy 机制承担,**不手工誊写**。
2. 编辑副本 `env/.agent-presets/dsh-bot/agent.cordis.yml`:只改 `- id: persona` 行 `config.text` 为**全新撰写**的 DSH Bot 人设(直率、乐于查证、承认不确定;**模型无关**,用 `{{model}}`/`{{cwd}}` 变量报当前模型与工作区;禁止照抄参考产品或上游任何文案);工具行保持副本原样。
3. 核对/补写 `preset.yml`(`name: DSH Bot` 与一句描述;copy 会保留来源描述,需改写)。
4. 人设文本提交前贴给用户过目(用户已确认此流程)。

**验证**:`dsh-rpc.sh 3084 agentPreset.list` 或 GUI 设置页可见 `dsh-bot` 且非 broken → 期望名单含 dsh-bot、trust=user

**Evidence**:`evidence/phase-1/preset-list.json`

**注意事项**:preset 目录名即 id(`[a-z0-9-]`);组装文件里的服务行必须在 isolate realm 内(照 standard 底本即不会踩);人设是产品文案,措辞先过用户。unattended 波若给出指定原文,以该原文落盘,并把副本写入 `evidence/phase-1/persona.md` 供事后改写——那不是完成门闩。

### Task 7: 接线默认 preset 并在 GUI 验证

- **关联**:BR-002 / UF-001 / EVD-003;INV-002
- **前置任务**:6
- **风险等级**:P1

**为什么做**:默认值接线让「新会话即 DSH Bot」成立,同时是 ASM-002 链路(sessionTool 建会话吃默认)的消费端。

**涉及文件与定位**:

- 修改 `env/settings.example.yaml`(Task 3 建):追加 `agent-presets: { default: dsh-bot }`
- 修改 `env/setup.sh`:邻仓 `settings.yaml` 种子后必须写入 `agent-presets.default: dsh-bot`(邻仓拷贝不含该键)

**具体操作**:

1. settings 追加默认 preset 分节;重启 boot。
2. GUI 新建会话发「你是谁?」,核对人设口吻与 preset 指示;GUI 切换 preset 到 standard 再切回,确认选择器可用(空白会话)。
3. `setup.sh` 无论从邻仓还是 example 种子 `settings.yaml`,都 stamp `agent-presets.default: dsh-bot`,使 clone + setup 的第一跑新会话仍是 dsh-bot(BR-002),而不是 standard。

**验证**:`session.history` 显示新会话 preset=dsh-bot;回复体现人设 → 期望两点齐全

**Evidence**:`evidence/UF-001/`(截图/回填 + history 导出,构成 EVD-003 主体)

**注意事项**:切 preset 仅限空白会话(平台规则);已产出内容的会话报 `agent-preset-locked` 属预期。只改进 git 的 `settings.example.yaml` 不够——`setup.sh` 优先拷邻仓 settings,必须在种子后 stamp 默认 preset。

### Task 8: 执行 Phase 1 回归验证

- **关联**:BR-002 / UF-001 / INV-002
- **前置任务**:7

**验证**:重启后 UF-001 主路径复现;普通(非 `~`)会话在官方栏正常显示(INV-002 前半)

**Evidence**:`evidence/phase-1/phase-summary.md`

### Phase 2: 委托工具与 session-tool 集成

> 你在哪里:GUI 单聊已成;其他 agent 还无法委托 DSH Bot,bot 会话无标记体系。
> 做完之后:任意会话可调 `dsh_bot_ask` 拿答案;bot 会话带 `kind:dsh-bot` 标记;辅助会话隐藏不扰官方栏。

### Task 9: 实现 dsh-bot-host 服务包

- **关联**:BR-001 / BR-003 / BR-007 / BR-010 / UF-002 / UF-006
- **前置任务**:5(ASM-002/007 结论);8
- **风险等级**:P0(核心逻辑)

**为什么做**:委托链与标记管理是本插件唯一的「真后端逻辑」,集中在一个 Service 便于工具与 RPC 共用。

**涉及文件与定位**:

- 新建 `packages/dsh-bot-host/`(package.json、src/index.ts、src/ask.ts、tests/)
- 样板:`../../vibee/plugin/packages/vibee-host/src/index.ts`(L20 inject)与 `src/executor.ts`(L106-L164 委托链)、`../../session-tool/plugin/packages/session-marks/src/index.ts`(put/listByKind)

**具体操作**:

1. `class DshBotService extends Service`,`super(ctx, 'dshBot')`,`static inject = ['sessionTool']`(`settings` 可选注入);`declare module '@deepseek-ai/cordis'` 挂 `ctx.dshBot` 类型。
2. 注册 `dsh-bot` settings namespace(仿 llm-pi-ai 模式,以 bundle 行 config 为 base):`model?: {provider, model, reasoningEffort?}` + `askTimeoutMs` 等;每次操作时读取(热生效,BR-010)。
3. `askBot(caller, {prompt, title?})`:`sessionTool.create(caller, { title: '~dsh-bot: <截断摘要>', tags: ['kind:dsh-bot','kind:hidden'], parentSessionId: caller })` → `session-marks.put` 兜底合并 → 官方 `workspace.archiveSession` 将该辅助会话移出分组栏(INV-002;0.1.1-rc.2 不按 `~` 过滤标题)→ **若 `dsh-bot.model` 非空,按 Task 4 的 ASM-007 机制对该空白会话应用模型,失败 fail loud 不静默回落(BR-010)** → `write` → `wait {until:'idle', timeoutMs 可配}` → `read {maxBlocks}` 提取答案返回 `{sessionId, answer}`;全程错误透传(BR-007)。
4. 答案提取规则:取最后一个 assistant 文本块序列聚合;若末轮无 assistant 文本(如以工具调用/失败收尾),返回明确错误并附会话 id,不返回空串。
5. `createSession(caller, {title?})`(UF-003 用):可见 bot 会话——title 不带 `~`,tags 仅 `['kind:dsh-bot']`;同样应用 override;创建默认带调用方 cwd(session-tool 既有行为),使会话进 workspace 视图。
6. `listSessions()`:`session-marks.listByKind('kind:dsh-bot')` 交 `sessionTool.list` 元数据(title/status/created_at),含 `includeHidden` 开关;marks 有而会话已删的条目从结果剔除(交集语义)。
7. vitest 单测:stub `ctx.provide('sessionTool', …)`(vibee 测试同款),覆盖成功链、web-unreachable 透传、wait 超时、marks 合并、override 应用与非法 override fail loud、答案提取空态。

**验证**:`pnpm --filter dsh-bot-host run build && pnpm --filter dsh-bot-host test` → 期望全绿

**Evidence**:`evidence/phase-2/host-unit.log`

**注意事项**:Config 必含 `webUrl`(默认 3084)与 `askTimeoutMs`;不要在服务里直接 fetch 网关——一律经 sessionTool;每次委托独立会话,禁止复用会话并发写(session-tool T17 边界)。

### Task 10: 实现 tool-dsh-bot 工具包(bundle)

- **关联**:BR-007 / BR-009 / UF-002
- **前置任务**:9
- **风险等级**:P1

**为什么做**:工具是 agent 侧入口;bundle patch 是它挂进网关的唯一通道。

**涉及文件与定位**:

- 新建 `packages/tool-dsh-bot/`(src/index.ts、cordis.patch.yml、dsh.plugin.json、dsh-plugin.json、tests/)
- 样板:`../../session-tool/plugin/packages/tool-session/src/index.ts`(L16/22/55)与同目录 `cordis.patch.yml`、两份 manifest

**具体操作**:

1. `export const inject = ['tools', 'dshBot']`;`ctx.tools.register(defineTool({ name: 'dsh_bot_ask', … card: 'generic' }))`,参数 `{prompt: string, title?: string}`,实现转调 `ctx.dshBot.askBot`。
2. `package.json` 声明 `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`;patch `- insert:` 两行:`dsh-bot-host`(config: webUrl/askTimeoutMs)+ `tool-dsh-bot`。
3. 双 manifest:官方 `dsh.plugin.json`(engines dsh >=0.1.1-rc.2);社区 `dsh-plugin.json`(id `io.github.nothing1024.tool-dsh-bot`,requires 含 ToolRegistry 与 `x-nothing1024.session-tool/v1alpha1`,**无 provides**)。
4. 工具 schema/渲染单测。

**验证**:`pnpm --filter tool-dsh-bot run build && pnpm --filter tool-dsh-bot test` → 期望全绿

**Evidence**:`evidence/phase-2/tool-unit.log`

**注意事项**:工具名避开平台 `task_*`/`session_*`/`job_*` 前缀;渲染意图 `generic`、无 locations(session-tool 同款零特判约定)。

### Task 11: profile 接线并真实跑通委托链路

- **关联**:UF-002 / BR-003 / BR-007 / INV-002 / EVD-004
- **前置任务**:10
- **风险等级**:P0

**为什么做**:「组件写好没接线 = 未完成」;本任务把工具挂进 gb 组合并用真实 agent 走通全链。

**涉及文件与定位**:

- 修改 `env/profiles/gb/package.json`(bundles 追加 `tool-dsh-bot`;dependencies link `tool-dsh-bot`/`dsh-bot-host`)
- 修改 `env/profiles/gb/cordis.patch.yml`(如需 overlay dsh-bot-host 的 webUrl)

**具体操作**:

1. link 本地包进 profile,`pnpm install`(profile 目录),重启 boot。
2. `pluginInventory/list` 确认 `dsh-bot-host`/`tool-dsh-bot` 行 active。
3. GUI 在普通会话让模型「用 dsh_bot_ask 问:…」,走通 UF-002 主路径;导出 bot 会话、抓 marks 输出;核对官方会话栏无 `~dsh-bot:` 条目。
4. 失败分支真实演练:停网关调工具(经 CLI headless 场景)与断 key 调工具,记录错误文本。

**验证**:`node ../../session-tool/plugin/packages/session-tool-cli/lib/bin.js marks list --kind kind:dsh-bot`(DSH_HOME=本仓 env)输出 ≥1 行;主会话拿到答案 → 期望链路与标记齐全

**Evidence**:`evidence/UF-002/`(EVD-004 主体)

**注意事项**:bundle 行与 profile overlay 不要重复 insert 同一行(session-tool env README 明训);委托会话 parent 必须是 caller,否则 fence 拒绝。

### Task 12: 执行 Phase 2 回归验证

- **关联**:本 Phase 全部 BR/UF(BR-003/007、UF-002)
- **前置任务**:11

**验证**:`pnpm -r run build && pnpm -r test` + UF-002 主路径复现 + UF-001 不回归(preset 会话仍正常)

**Evidence**:`evidence/phase-2/phase-summary.md`

### Phase 3: 侧栏「DSH Bot」页签

> 你在哪里:bot 会话有了标记但只能靠 CLI/官方栏找;缺专属展示面。
> 做完之后:右侧栏页签可列出/新建/跳转 bot 会话,sidebar 缺席时其余功能不受影响。

### Task 13: 实现 host RPC 面(/dsh-bot/*)

- **关联**:UF-003 / BR-003
- **前置任务**:12
- **风险等级**:P1

**为什么做**:client 半身在浏览器,拿 marks/会话数据必须有 host 侧 HTTP 面。

**涉及文件与定位**:

- 新建 `packages/dsh-bot-host/src/routes.ts`(挂 `webServer` 可选 inject)
- 样板:`../../vibee/plugin/packages/ui-vibee/src/client/runs-client.ts`(L39-L64 的 `{args}` 请求形状,host 侧按其对偶实现)

**具体操作**:

1. dsh-bot-host 增加可选 `webServer` 注入;注册 `POST /dsh-bot/listSessions`、`POST /dsh-bot/createSession`(body `{args}`,响应 `{ok, value|error}` 与 vibee wire 同构)。
2. `listSessions` 响应附 `botModel` 元字段:当前生效的 bot 模型与来源(`override` / `global-default`),供页签只读展示(UF-006 接线)。
3. 错误映射:sessionTool 错误码原样进 `error.code`;未知异常 `internal`。
4. 单测:路由 handler 直调(stub dshBot)。

**验证**:boot 后 `curl -s -X POST http://127.0.0.1:3084/dsh-bot/listSessions -H 'Content-Type: application/json' -d '{"args":{}}'` → 期望 `{"ok":true,"value":[…]}`

**Evidence**:`evidence/phase-3/rpc-samples/`(request/response 各存一份)

**注意事项**:路由只绑 loopback 网关进程,不自开端口;命名空间前缀 `/dsh-bot/` 避免与官方 `/api`、genoffice `/dsh-artifact/*` 冲突。

### Task 14: 实现 ui-dsh-bot 侧栏页签

- **关联**:UF-003 / BR-008
- **前置任务**:13
- **风险等级**:P1

**为什么做**:这是用户日常入口;必须按 2.3 UF-003 脚本实现 loading/空态/错误态/新建防重。

**涉及文件与定位**:

- 新建 `packages/ui-dsh-bot/`(package.json 声明 `dsh.client`、src/client/index.ts、src/client/DshBotTab.tsx、src/client/rpc.ts、tests/)
- 样板:`../../vibee/plugin/packages/ui-vibee/src/client/index.ts`(L179-L204)与 `runs-client.ts`

**具体操作**:

0. 开工前先勘察 vibee ui 包的挂载三件套并照抄形状:`ui-vibee/package.json` 的 `dsh` 字段(client 入口声明)、有无自带 cordis.patch.yml、`env/profiles/vb/package.json` 如何引用——client 半身的挂载形状以活样板为准,不自创。
1. `rpc.ts`:fetch `/dsh-bot/<method>`(`{args}` 包裹)+ 轮询 observable(vibee 简化版,不做 SSE)。
2. `index.ts` `apply(ctx)`:`ctx.inject(['betterSidebar'], …)` 注册页签 `dsh-bot:sessions`(title「DSH Bot」、icon、badge=会话数);**不硬 inject**(BR-008)。
3. `DshBotTab.tsx`:列表(标题/时间)、`包含隐藏` 开关、条目点击 → 会话跳转(仿 vibee `jumpToSession` 经 `ctx.sessions`)、「新建 DSH Bot 会话」按钮(loading 防重 → createSession → 跳转)、页脚只读显示「当前 bot 模型:<botModel>(override/全局)」(UF-006)。
4. 空态/错误态/loading 全按 2.3 UF-003 状态机;面板收起时暂停轮询(vibee 的 panelOpen 订阅同款);文案经 `ctx.locale` 注册 zh/en 词条(ui-vibee 同款);组件单测(stub rpc)。

**验证**:`pnpm --filter ui-dsh-bot run build && pnpm --filter ui-dsh-bot test` → 期望全绿

**Evidence**:`evidence/phase-3/ui-unit.log`

**注意事项**:client 代码不 import host 运行时(浏览器半身纪律);client facet 的社区 manifest 声明等 RFC 0002,先在 standards/README 记账(BR-009)。

### Task 15: 页签接线与 sidebar 兼容校准

- **关联**:UF-003 / BR-008 / EVD-005;消解 ASM-005
- **前置任务**:14
- **风险等级**:P1

**为什么做**:better-sidebar 在 0.1.1-rc.2 上属首次组合,必须实机确认;同时完成 UF-003 全脚本接线验证。

**涉及文件与定位**:

- 修改 `env/profiles/gb/package.json`:dependencies 加 `dsh-better-sidebar@0.13.0` 与 `ui-dsh-bot`(link),bundles 追加两者

**具体操作**:

1. 挂载重启;`pluginInventory/list` 全 active(消解 ASM-005;失败则按假设降级方案改 `conversation.view` slot 并回写 spec 变更)。
2. 浏览器走 UF-003 主路径 + 两失败分支(停网关看错误态;清空标记看空态)。
3. BR-008 降级实验:临时去掉 sidebar bundle 重启,确认 preset/工具功能不受影响,再恢复。

**验证**:UF-003 三步真实通过 + 降级实验通过 → 期望截图/回填与 console 无新增 error

**Evidence**:`evidence/UF-003/`(EVD-005 主体)+ `evidence/phase-3/no-sidebar.md`

**注意事项**:页签 id 用稳定常量(vibee `VIBEE_RUNS_TAB_ID` 同款做法);浏览器按 boot rev 缓存,改 client 后重建并强刷。

### Task 16: 执行 Phase 3 回归验证

- **关联**:本 Phase 全部 BR/UF(BR-008、UF-003)
- **前置任务**:15

**验证**:`pnpm -r run build && pnpm -r test` + UF-001/002/003 主路径全部复现

**Evidence**:`evidence/phase-3/phase-summary.md`

### Phase 4: 标准面、运维面与真实验收

> 你在哪里:功能齐了,但标准面/运维脚本/文档缺位,未做全量真实验收。
> 做完之后:standard:check 全绿、manual-test 可复跑、README 齐全,5.2 矩阵全过,包收口。

### Task 17: 建 standards 标准面并过检

- **关联**:BR-009
- **前置任务**:16
- **风险等级**:P2

**为什么做**:生态三仓均已对齐社区 Draft v0.15;新仓入列必须同规格,否则后续 Registry 映射无从做起。

**涉及文件与定位**:

- 新建 `standards/`(README.md、validate.mjs、host-descriptor.json、fixtures/valid|invalid/、adapter-baseline.json)
- 样板:`../../session-tool/plugin/standards/`(1.3 生态 README 已核其四件套构成)

**具体操作**:

1. host-descriptor 按 profile gb/:3084,capabilities 含 SessionTool(consumer 侧)。
2. fixtures 覆盖 tool-dsh-bot 的 manifest 正反例;adapter-baseline 登记对 `@deepseek-ai/*` 与 session-tool 包的 import 触点。
3. 根 package.json 接 `standard:check`;RFC 0002(client facet)/0003(provides)缺口在 standards/README 记账。

**验证**:`pnpm run standard:check` → 期望 0 FAIL

**Evidence**:`evidence/phase-4/standard-check.log`(EVD-007 之一)

**注意事项**:社区 manifest id 命名空间用 `io.github.nothing1024.*`,私有契约坐标 `x-nothing1024.*`(生态既定)。

### Task 18: manual-test 脚本与 README 文档

- **关联**:UF-004 / BR-004 / EVD-006
- **前置任务**:16
- **风险等级**:P2

**为什么做**:生态惯例——每仓自带半自动验收脚本与指路 README(含 dsh-plugin-debug 调试指引),后续任何 agent 进仓即可自举。

**涉及文件与定位**:

- 新建 `scripts/manual-test.sh`;完善 `README.md`、`env/README.md`
- 样板:`../../session-tool/plugin/scripts/manual-test.sh`(gateway_require 起手)

**具体操作**:

1. manual-test:gateway_require(3084)→ UF-001 建会话冒烟(`--no-write` 支持)→ UF-002 CLI 驱动委托 → UF-006 override 设置/清空各驱动一次委托并核 header → UF-004 marks 查询 → 结果写 `env/manual-test-last.txt`。
2. README:定位、口表(3084)、日常起停、UF-004 命令模板、`dsh-plugin-debug` skill 指路行(生态标准两行)、模型说明(UF-005 跟随 DSH 配置 + UF-006 override 语义与「GUI 直建会话不受 override 影响」边界)、非目标与 BR-006 红线声明。
3. 建 GitHub 私仓并推送:`gh repo create Nothing1024/dsh-bot --private`(用户已定名;需本机 gh 已登录)→ push → 在生态根 `../../README.md` 的 GitHub 表与清单表补本仓行(口表行已在 Task 2 登记)。

**验证**:`bash scripts/manual-test.sh --no-write` → 期望脚本全步通过;`marks list --kind kind:dsh-bot` 输出与 UF-004 一致存证

**Evidence**:`evidence/UF-004/marks-list.txt`(EVD-006)+ `evidence/phase-4/manual-test.log`

**注意事项**:脚本先核身份再打 RPC(打错口 = 对别人网关做事)。

### Task 19: 执行 spec 5.2 真实场景全套测试

- **关联**:全部用户可见 UF(UF-001/002/003/004/005/006)+ 2.7 负向场景
- **前置任务**:17;18
- **风险等级**:P0

**为什么做**:命令级通过只是入场券;本任务按 5.2 执行矩阵逐行回放,是完成的唯一标准。

**验证**:按 5.2 执行矩阵逐行回放,全部通过;每行 evidence 落盘后复跑 `python3 ~/.agents/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-mvp`(第二次运行,证据审计)

**Evidence**:`evidence/UF-001/`、`evidence/UF-002/`、`evidence/UF-003/`、`evidence/UF-004/`、`evidence/UF-005/`、`evidence/UF-006/`(全量)

**注意事项**:GUI 步骤若浏览器自动化不可用,按 5.2 环境准备的手动脚本逐步执行并回填;任何一行失败回对应 Task 修复后重跑。

### Task 20: 执行 Phase 4 回归验证(总收尾)

- **关联**:本 Phase 全部条目 + INV-001/002/003/004 + BR-005/006 终检
- **前置任务**:19

**验证**:`pnpm -r run build && pnpm -r test && pnpm run standard:check` 全绿;三邻仓 `git status --porcelain` 为空;`rg -i 'anysphere|sand://' packages/ env/ scripts/` 为空;本仓 `git status` 无应忽略文件

**Evidence**:`evidence/phase-4/phase-summary.md`

---

## 5. 验收与 Review 协议

> **验收铁律:命令级验证(5.1)通过只是入场券,不是完成。** 用户可见的需求必须通过 5.2 真实场景全套测试才算完成。

### 5.1 命令级验证(入场券)

| 验证项 | 命令 | 期望 | Evidence |
|---|---|---|---|
| 安装 | `pnpm install` | 退出码 0 | EVD-007 |
| 构建 | `pnpm -r run build` | 全包成功 | EVD-007 |
| 类型 | `pnpm -r run typecheck` | 0 error | EVD-007 |
| 单测 | `pnpm -r test` | 全绿 | EVD-007 |
| 标准面 | `pnpm run standard:check` | 0 FAIL | EVD-007 |
| 包校验 | `python3 ~/.agents/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-mvp` | 0 FAIL | EVD-007 |

### 5.2 真实场景全套测试(Real-Run,完成的唯一标准)

**环境准备**:

| 项 | 值 |
|---|---|
| 启动命令 | `cd <本仓> && pnpm install && pnpm -r run build && sh env/setup.sh && sh env/boot.sh` |
| 访问入口 | `http://127.0.0.1:3084`(GUI);`~/.agents/skills/dsh-plugin-debug/scripts/dsh-rpc.sh 3084 <method>`(RPC);session-tool CLI(UF-004 命令模板见 2.3) |
| 测试账号/数据 | `env/settings.yaml` 内 ≥2 条模型路由 + `env/.env` 内对应凭据(ASM-001,Task 3 消解后为事实);无其他账号 |
| 干净状态定义 | 停网关 → 清 `env/sessions/` 与 `env/session-tool/marks.jsonl` → 重启 boot(仅测试环境数据,勿动邻仓) |
| 可用测试工具 | 浏览器自动化 MCP(chrome-devtools-proxy,若会话内可用)执行 GUI 行;不可用时按 2.3 各 UF 步骤表输出手动脚本请用户执行并回填截图/结果;RPC/CLI 行一律直接执行留档 |

**执行矩阵**(每条 = 2.3 节流程脚本的真实回放;Evidence 列为具体路径):

| UF | 执行方式 | 操作来源 | 必须核对的点 | Evidence |
|---|---|---|---|---|
| UF-001 主路径 | browser/手动回填 | 2.3 UF-001 成功主路径 | preset=dsh-bot、按配置模型流式回复、自动标题;console 无新增 error | `evidence/UF-001/success.png` + `evidence/UF-001/session-history.json` |
| UF-001 无凭据分支 | browser/手动回填 | 2.3 UF-001 失败分支 1 | 错误点名凭据引用;补 key 后免重启恢复 | `evidence/UF-001/missing-key.md` |
| UF-001 上游失败分支 | browser/手动回填 | 2.3 UF-001 失败分支 2 | 稳定错误码呈现,会话可重试 | `evidence/UF-001/upstream-error.md` |
| UF-002 主路径 | browser + RPC 取证 | 2.3 UF-002 成功主路径 | 工具卡片完成、答案入主会话、marks 含 kind:dsh-bot、官方栏无 `~` 会话 | `evidence/UF-002/tool-call.md` + `evidence/UF-002/marks.txt` + `evidence/UF-002/rail-check.png` |
| UF-002 网关不可达分支 | CLI/RPC | 2.3 UF-002 失败分支 1 | 工具返回 web-unreachable 类错误,不吞错 | `evidence/UF-002/gateway-down.md` |
| UF-002 等待超时分支 | RPC + 配置缩短时限 | 2.3 UF-002 失败分支 3 | 超时错误附会话 id,bot 会话未被杀 | `evidence/UF-002/timeout.md` |
| UF-002 并发委托 | RPC/CLI(同时两笔) | 2.7「重复提交/并发」场景 | 两笔委托各建独立会话,答案互不串;marks 各自登记两行 | `evidence/UF-002/concurrent.md` |
| UF-003 主路径 | browser/手动回填 | 2.3 UF-003 成功主路径 | 列表/跳转/新建三步与脚本一致;badge 计数正确 | `evidence/UF-003/tab-list.png` + `evidence/UF-003/create-jump.png` |
| UF-003 RPC 失败分支 | browser(停网关) | 2.3 UF-003 失败分支 1 | 错误态 + 重试按钮,不白屏 | `evidence/UF-003/rpc-error.png` |
| UF-003 空数据分支 | browser(清标记) | 2.3 UF-003 失败分支 2 | 空态文案 + 新建引导 | `evidence/UF-003/empty.png` |
| UF-004 主路径+空分支 | CLI | 2.3 UF-004 全部 | 输出格式与空提示符合脚本 | `evidence/UF-004/marks-list.txt` |
| UF-005 会话内切换 | browser/手动回填 + RPC 取证 | 2.3 UF-005 成功主路径 | 切换后下一轮 `request/header` 的 provider/model 变更;preset/人设不变 | `evidence/UF-005/switch-in-session.md` |
| UF-005 默认切换→委托 | CLI/RPC | 2.3 UF-005 次路径 | 新委托会话 header 用新默认模型 | `evidence/UF-005/default-switch.md` |
| UF-005 缺凭据分支 | browser/手动回填 | 2.3 UF-005 失败分支 2 | MISSING_CREDENTIAL 点名凭据;切回恢复 | `evidence/UF-005/missing-cred.md` |
| UF-006 override 生效 | settings 编辑 + RPC 取证 | 2.3 UF-006 主路径步骤 1-2 | 新委托/页签新建会话 header 用 override;页签 botModel 显示 override;GUI 直建会话不受影响 | `evidence/UF-006/override-on.md` |
| UF-006 清空回退 | settings 编辑 + RPC 取证 | 2.3 UF-006 主路径步骤 3 | 其后新委托 header 回全局默认 | `evidence/UF-006/override-off.md` |
| UF-006 非法 override 分支 | settings 编辑 + CLI | 2.3 UF-006 失败分支 | fail loud 点名 provider/model 或凭据,不静默回落 | `evidence/UF-006/override-invalid.md` |

**通过标准**:执行矩阵全部行通过且 evidence 齐全。任何一行失败 = 本需求未完成,回到对应任务修复后重跑。

### 5.3 Evidence 目录结构与命名

```text
docs/dsh-bot-mvp/evidence/
  phase-0/ … phase-4/   # 各 Phase 命令输出与 summary
  UF-001/ … UF-006/     # 截图/回填记录/导出,文件名含 UF 编号与状态
```

- EVD ID 必须能在第 2.5 节找到;截图命名 `UF-001-success.png` 式。

### 5.4 Review 专项检查清单

- [ ] BR-006 红线:全仓 `rg -i 'anysphere|sand://'` 为空;人设文本人工确认非上游文案
- [ ] BR-001:代码中无硬编码 provider/model(`rg` 复核);xAI 仅存在于 settings.example.yaml 注释段
- [ ] BR-010:override 生效/清空/非法三态与 UF-006 矩阵一致;GUI 直建会话确未被 override 波及
- [ ] BR-005/INV-004:git 历史中从未出现凭据与 env 运行数据
- [ ] ASM 清单全部消解或按变更协议改写
- [ ] 5.2 执行矩阵全部通过,evidence 与 2.5 EVD 清单一致
- [ ] 2.3 每条流程的「入口接线清单」已实现——真实入口可达,非孤立组件
- [ ] 界面交互与 2.3 脚本逐步一致(loading、空态、错误态、防重复点击都存在)
- [ ] 所有 BR/UF/INV 可对照第 2 章逐条核销;生态 README 口表已补 3084 行(若 ASM-003 改口则同步)
