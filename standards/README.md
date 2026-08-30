# standards/ —— dsh-community-standard v0.15 对齐面

对齐 [oh-my-dsh/dsh-community-standard](https://github.com/oh-my-dsh/dsh-community-standard)（社区 Draft v0.15，非官方标准）。策略是**先采其纪律、后接其契约**：manifest 静态化、协商前置、fixture 文化、上游触点显式化现在就做；标准坐标等 Registry 定案后做一次映射替换。

```sh
pnpm run standard:check          # = node standards/validate.mjs
node standards/validate.mjs --update-baseline   # 评审后固化 adapter 基线
```

## 内容

| 文件 | 作用 |
|---|---|
| `validate.mjs` | 自包含检查器：manifest 校验 + 纯函数协商 + fixtures 自检 + adapter 审计 |
| `dsh-plugin.schema.json` / `host-descriptor.schema.json` | 上游 schema 本地快照（仅参考；本仓权威校验在 validate.mjs） |
| `host-descriptor.json` | profile `gb` 的部署描述（:3084，DSH 0.1.1-rc.2） |
| `adapter-baseline.json` | packages/*/src 的上游 import 基线（有 src 的包即使零触点也入表；新增触点须评审） |
| `fixtures/` | 合法/非法 manifest 样本；valid 含 `tool-dsh-bot.json` 正例，invalid 覆盖 v0.15 每条必须规则 |

manifest 本体在 `packages/<可挂载包>/dsh-plugin.json`（标准文件名带连字符；与官方装载用的 `dsh.plugin.json` 是两份文件、两套生态，互不覆盖）。本仓可挂载包：`tool-dsh-bot`（工具 bundle）、`ui-dsh-bot`（host 占位行 + 浏览器半身）。`dsh-bot-host` 是 `ctx.dshBot` 服务库，经 tool-dsh-bot 的 cordis patch insert，不独立挂载、无社区 manifest。

### workbench-ui（纯构建产物，不可挂载）

`packages/workbench-ui` 是工作台 SPA 的构建产物（React + tsdown → `lib/index.html` + `workbench.js` + `workbench.css`），由 `dsh-bot-host` 经 `GET /dsh-bot/ui` 静态服务。它：

- **没有** `dsh-plugin.json` / `dsh.plugin.json` / `cordis.patch.yml`，不进 pluginInventory，不是 Cordis 插件
- adapter 扫描无 `@deepseek-ai/*` / `cordis` / `schemastery` / `session-tool` / `session-marks` 触点（基线记 `workbench-ui: []`）
- 因此 **不** 补 `fixtures/valid|invalid` 的 workbench-ui 包 manifest 正反例——该包不可挂载，不是社区 manifest 主体

工作台部署能力在 Host Descriptor 声明为 `x-nothing1024.dsh-bot.workbench/v1alpha1` + kind `WorkbenchUi`（`GET /dsh-bot/ui` + 工作台 POST 方法；v1 `listSessions`/`createSession` 仍在 `/dsh-bot/` 前缀）。

## 本仓私有契约坐标（x- 命名空间，未经 Registry 登记）

| 坐标 | kind | 语义 | 提供方 |
|---|---|---|---|
| `x-nothing1024.dsh.tools/v1alpha1` | ToolRegistry | `ctx.tools` 工具注册 | DSH 宿主 |
| `x-nothing1024.dsh.session-stack/v1alpha1` | SessionStack | `ctx.sessions` + 持久化/投影/title | DSH 宿主 |
| `x-nothing1024.dsh.system-prompt/v1alpha1` | SystemPrompt | `ctx.systemPrompt` | DSH 宿主 |
| `x-nothing1024.dsh.web-gateway/v1alpha1` | WebGateway | `dsh web` HTTP carrier（`Config.webUrl`） | web 进程 |
| `x-nothing1024.dsh.web-server/v1alpha1` | WebServer | `ctx.webServer`（挂 `/dsh-bot/*`） | DSH 宿主 |
| `x-nothing1024.dsh.workspace/v1alpha1` | WorkspaceRegistry | `ctx.workspaceRegistry`（archiveSession） | DSH 宿主 |
| `x-nothing1024.session-tool/v1alpha1` | SessionTool | `ctx.sessionTool` 服务契约 | 邻仓 session-tool 的 tool-session bundle |
| `x-nothing1024.dsh-bot.workbench/v1alpha1` | WorkbenchUi | `GET /dsh-bot/ui` 静态工作台 + `POST /dsh-bot/{listBots,createBot,updateBot,deleteBot,listBotSessions,createBotSession,history,prompt,reconcile,listGroups,createGroup,updateGroup,deleteGroup,createGroupSession,listGroupSessions}` | 本仓 `dsh-bot-host` |

跨仓消费方：本仓 `dsh-bot-host` / `tool-dsh-bot` 以 required 契约声明 `SessionTool`（consumer 侧）。按 v0.15 规则 `provides` 被拒绝，所以提供关系只在 descriptor 侧表达（部署能力），等 RFC 0003（插件间 service 组合）定案后再迁移为 provides/requires.services。

## 已知缺口（对应上游延期 RFC）

- **RFC 0002（client facet）**：`ui-dsh-bot` 的浏览器半身（better-sidebar「DSH Bot」页签，经 `package.json` 的 `dsh.client` 发现；页签内容现为 iframe `/dsh-bot/ui`）在 v0.15 里**不可声明**（`client` 是保留 facet 名），manifest 只描述其 host 半身（空 apply 占位行）。工作台 SPA（`workbench-ui`）不是 client facet、也不可挂载。等 RFC 0002 定案后补 `ui-dsh-bot` client facet 声明。
- **RFC 0003（插件间 service）**：`ctx.sessionTool` 的提供/消费关系、`ctx.dshBot` 由 dsh-bot-host 提供给 tool-dsh-bot，都是 provides/requires.services 的活案例；v0.15 里提供关系只在 descriptor 侧表达。**不写 `provides`**（BR-009）。
- **Adapter 层**：`adapter-baseline.json` 记录的上游触点（含邻仓 `session-tool` / `session-marks`）是未来抽取版本化 adapter 包的清单；基线只增不减为异常，收敛为常态。
