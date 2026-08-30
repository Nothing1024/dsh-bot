# Phase 0 Task 1 Calibration

Date: 2026-08-30. Gateway: profile `gb` port 3084. Commands run from仓根.

## 0. Identity

```
~/.agents/skills/dsh-plugin-debug/scripts/dsh-rpc-who.sh 3084
127.0.0.1:3084  pid=39260  DSH_HOME=/Users/nothing/workspace/dsh/plugin/dsh-grok-bot/plugin/env  cwd=/Users/nothing/workspace/dsh/plugin/dsh-grok-bot/plugin
```

本仓 env。未动 3080/3081/3083。

## 1. ASM-201 会话 → agentPreset 反查（BR-203）

### 候选① `session.list`（采用）

`dsh-rpc.sh 3084 session.list '{}'` 75 行。每行顶层字段：

`sessionId`, `updatedAt`, `running`, `blank`, `cwd`, `agentPreset`, `projections`

`agentPreset` 实测取值：`dsh-bot`（67）、`standard`（7）、`minimal`（1）。

**BR-203 反查通道（点名）**：网关 RPC `session.list` → `value.items[].agentPreset`（string）。对账：未打 `bot:<id>` 的会话，若 `agentPreset` 落在注册表 presetId 上则补标。不需要逐会话 history。

### 候选② `session.history {maxMessages:1}`（备用，不必走）

会话 `session-5384934e-28ca-4585-a6fb-31ee0ff078d3`，耗时 **0.013s**。返回 `{events, hasMore, projections}`。`projections.values` 无 `agentPreset`。`maxMessages=1` 只给尾部 `assistant/chunk`，读不到 `request/header`。成本低但字段不够，不作为对账主通道。

### 候选③ `workspace.list`（否）

`dsh-rpc.sh 3084 workspace.list '{}'` → `{items, archivedSessionIds}`。items 为 workspace 行（`workspaceId/path/title/sessionIds`），**不含** `agentPreset`。

## 2. Working 判定（BR-205）

### 列表廉价信号（roster 工作中点）

`session.list` 行顶层 **`running: boolean`**。本轮 75 行全为 `false`（无进行中会话）。

`projections.values.sessionStats` 字段：`turns`, `steps`, `llmMs`, `toolMs`, `ttftMs`, `ttftSteps`, `decodeMs`, `decodeTokens`。**没有** running/status。

`projections.values.delegation.status`：`idle` | `completed`（委托会话）；`sessionListMetadata`: `{blank, lastPromptAt}`。

### 事件序列（transcript 工作中）

`session.history` 事件嵌套 `{"event":{type,seq,time,data}}`。与 turn 相关：

| type | data |
|---|---|
| `turn/start` | `{turn: number}` |
| `step/start` | `{turn, step}` |
| `step/end` | `{turn, step}` |
| `turn/end` | `{turn, reason}` |

**判定**：存在 `turn/start` 且同一 `data.turn` 尚无匹配的 `turn/end` ⇒ working。闭合会话末事件为 `turn/end`。

工作台实现：roster 用 `session.list.running`；对话面用未闭合 `turn/start`（或 list `running` 同源）。

## 3. ASM-203 iframe 同源 fetch

临时 GET `/dsh-bot/calib`（内联 HTML，不入 git；证据采集后从 host 源码删除）在 iframe `#probe` 内 `POST /dsh-bot/listSessions` `{args:{}}`。

Playwright Chromium/Chrome headless：

```json
{"url":"http://127.0.0.1:3084/dsh-bot/calib","calibText":"listSessions ok=true","calibOk":"true","iframeCount":2}
```

同一源骨架 `/dsh-bot/ui` 嵌在 iframe 内 fetch `listSessions` 后 `data-status=idle`（`iframe-fetch.json`）。页签 iframe `src=/dsh-bot/ui` 同样 idle（`tab-iframe.json`）。**同源 fetch 不受页签沙箱限制。**

## 4. 回写

- spec 1.3 增补上列事实。
- spec 1.4：ASM-201 / ASM-203 删除（已是事实）。ASM-202 改写为 Task 5 实现风险（P0 未做 preset 文件生成）。
