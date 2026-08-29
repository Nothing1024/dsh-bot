# Task 4 校准（ASM-002 / ASM-003 / ASM-007 + hiddenPrefixes + settings namespace）

时间: 2026-08-29  
先 `dsh-rpc-who.sh 3084`，再打 RPC。

## ASM-003 口占用

```
lsof -nP -iTCP:3084 -sTCP:LISTEN
# node pid=26497  127.0.0.1:3084
dsh-rpc-who.sh 3084
# DSH_HOME=/Users/nothing/workspace/dsh/plugin/dsh-grok-bot/plugin/env
```

仅本仓网关监听。不改口、不改生态 README 口表（已登记 3084）。**证实，从 1.4 删除。**

## ASM-002 durableCreate / sessionTool.create 吃默认 preset

CLI（webUrl patch 指 3084）:

```
DSH_HOME=<repo>/env node ../../session-tool/plugin/packages/session-tool-cli/lib/bin.js \
  session create --title 校准 --profile headless --patch env/cli.patch.yml --format json
# {"session_id":"session-7a020d5b-9129-469c-bbf9-5e73f0b458fe"}
```

`session.history` 对该空白会话只有 `permission/preset`（权限 workspace-write）、`sandbox/mode`、`approval/policy`、`session/title`，**没有**名为 `agent-preset` 的事件。

preset id 的权威面:

| 面 | 观察 |
|---|---|
| `session.create` 响应 | `{sessionId, agentPreset: "standard"}`（RPC 直建与 CLI 同源网关 `session.create`） |
| `session.list` 行 | 每行带 `agentPreset: "standard"`（含 CLI `校准` 与 `~校准隐藏`） |
| `agentPreset.list` | `standard.isDefault = true`；另有 code/minimal/cordis |

`session-tool-local` `durableCreate` 只转发 `session.create({sessionId?, workspaceId?, cwd?})`，**不传** `agentPreset` / model，因此吃 profile/settings 默认 preset。当前默认是 `standard`（dsh-bot preset 尚未接线）。**机制证实，从 1.4 删除。**

## ASM-007 空白会话设模型的官方入口

依次排查:

| 候选 | 结论 |
|---|---|
| GUI 会话内选择器 | `dsh-client-ui-model-selection`：`session.models` 加载、`session.selectModel` 提交完整 `ModelSelection` |
| `session.prompt` | schema 仅 `{sessionId, mode: queue\|steer, content, clientTimeZone?}`，**无** model |
| `session.create` / durableCreate | create 仅 `{workspaceId?, cwd?, sessionId?, agentPreset?}`，**无** model；durableCreate 还不传 agentPreset |
| preset 层模型行 | `agentPreset.list` 行只有 id/trust/isDefault/name/description，**无** model |

**点名 API:**

```
session.selectModel
payload: { sessionId, provider, model, reasoningEffort? }
response: { selected: { provider, model, reasoningEffort? } }
```

实测: 对已有会话 `selectModel(..., reasoningEffort: medium)` 后下一轮 `request/header.config.reasoningEffort = medium`。

**副作用（BR-010 实现必须处理）:** 同一次 `selectModel` 会把 `settings` 的 `agent-default-model` 写成所选值（host-apiproxy README 亦写明「保存为部署默认值」）。无「只改会话、不改部署默认」的请求开关。Task 9 应对经插件创建的会话调用 `session.selectModel`，若全局默认被改写则立即 `settings.update` 恢复，避免波及 GUI 直建会话（BR-010 边界）。

**证实，从 1.4 删除。**

## settings.describe 与 `dsh-bot` namespace

`settings.describe {}` 命名空间含 `agent-default-model`、`llm-pi-ai`、`llm-deepseek`、`agent-presets` 等，**没有** `dsh-bot`。UF-006 图形入口要等 Task 9 注册 settings namespace；P0 只能编 yaml。摘要: `settings-describe-summary.json`。

## hiddenPrefixes / 官方栏 `~` 标题

session-tool CLI:

```
session create --title '~校准隐藏'  → session-39f2022a-6781-4de7-bd9c-6772061742ce
session list                         → 不含 ~校准隐藏
session list --include-hidden        → 含 ~校准隐藏
```

插件 list 的 `hiddenPrefixes` 默认 `['~']` **在位**。已把该字段显式写入 `env/profiles/gb/cordis.patch.yml` 与 `env/cli.patch.yml`（id 整段替换必须重述）。

官方 GUI 0.1.1-rc.2：对已非 blank 的 `~校准隐藏` 会话，侧栏「未分组」**仍然显示**（`gui-rail-after-tilde.png`）。`session.list` 官方 RPC 也返回该行。web-app 无 `hiddenPrefixes` 客户端过滤。blank 会话默认不出现（与 session-tool README「空会话官方栏不出现」一致，不能当成 `~` 前缀过滤）。

官方分组栏隐藏闸（复查）:

```
dsh-rpc.sh 3084 workspace.archiveSession '{"sessionId":"session-39f2022a-6781-4de7-bd9c-6772061742ce"}'
# {archivedSessionIds:["session-39f2022a-6781-4de7-bd9c-6772061742ce"]}
```

之后 Playwright `gui-rail-after-archive.png`：「未分组」**不再**列出 `~校准隐藏`（body `HAS_TILDE_TITLE=false`）。UF-002 Then「官方栏不出现」保持；实现走 `workspace.archiveSession`（INV-002 变更协议 v0.3.4），不是只靠 `~` 前缀。Task 9 `askBot` 在 create 后调用 archive。

## 结论回写

| ASM | 结论 |
|---|---|
| ASM-002 | 证实（默认 preset = standard，经 session.create / session.list.agentPreset） |
| ASM-003 | 证实（3084 = 本仓 env） |
| ASM-007 | 证实（API = `session.selectModel`；会写部署默认） |
| 官方栏 `~` | **证伪**「0.1.1-rc.2 GUI 按 hiddenPrefixes 藏 `~`」；官方闸 = `workspace.archiveSession`。INV-002 走变更协议，UF-002 Then 不变。 |
