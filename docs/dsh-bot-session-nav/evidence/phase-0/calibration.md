# Phase 0 Task 1 Calibration

Date: 2026-09-01. Gateway: profile `gb` port 3084. Commands from仓根. Temp tab/host probes **reverted, not in git**.

## 0. Identity

```
~/.agents/skills/dsh-plugin-debug/scripts/dsh-rpc-who.sh 3084
127.0.0.1:3084  pid=91307  DSH_HOME=/Users/nothing/workspace/dsh/plugin/dsh-grok-bot/plugin/env  cwd=/Users/nothing/workspace/dsh/plugin/dsh-grok-bot/plugin
```

本仓 env。3080/3081/3083 无人监听。RPC 均在 who 之后。

Calibration sessions (createBotSession `botId:dsh-bot`):

| 角色 | sessionId | 处理 |
|---|---|---|
| visible | `session-17bec9cb-14db-469e-9517-8a03ae4ac1d5` | 标题 `calib-nav-visible` |
| hidden | `session-974c0fc9-afa6-4a7c-a316-d0186ba7fd42` | `session.rename` → `~ calib-nav-hidden` + `session-marks.put` 加 `kind:hidden` |
| archived | `session-f3d91875-899a-4411-835c-4356c952d32c` | `workspace.archiveSession` → 进入 `archivedSessionIds` |
| 403 pin | `session-a9d4ea94-3b17-45ae-88f3-0dbfe2372c56` | 无标题创建 → rename `calib-nav-pinned-403` → 首轮 prompt |

## 1. ASM-401 `sessions.open` × 可见 / `~`+hidden / archived

页签 `ctx.sessions` 有原型方法 `open` / `openSubagent` / `subagentAddress`(不在 `Object.keys`)。对这三条校准会话 `subagentAddress(id)` 均为 `undefined`，`jumpToSession` 走 **`sessions.open(id)`** 而非 openSubagent。

Playwright(channel chrome) 经临时 `window.__dshBotNavSessions`（apply 钩子,已撤）实测 `list.getSnapshot().current`：

| 目标 | open 调用 | current 落地 | 证据 |
|---|---|---|---|
| visible | `used:"open"` jumped true | **是** `session-17bec9cb-…` | `calib-jump.json` + `asm401-visible-open.png` |
| `~` + `kind:hidden` | 同上 | **是** `session-974c0fc9-…` | `calib-jump.json` + `asm401-hidden-open.png` |
| archived | 调用发出(未抛) | **否**（`after`/`afterSync` 空，current 未切到归档 id） | `calib-jump.json` + `asm401-archived-open.png` |

官方侧栏未显示 `calib-nav-visible` / `~ calib-nav-hidden`（blank 会话轨显示「新会话」；隐藏标题不在未分组可见段）。**current id 已切**即官方 conversation 已指向该会话。归档会话 open 不能落地。

**结论 / BR-401 分支**:隐藏会话 **直接 `sessions.open`**,不必先显形。归档会话不能靠 open 直达；工作台默认列表本就应排除 archived,若要对归档跳转需先 unarchive。`jumpToSession` 可原样复用。

## 2. ASM-402 iframe `window.parent.postMessage` → 页签

同源 iframe `/dsh-bot/ui`（`data-testid=dsh-bot-iframe`）。在 iframe 里用 `contentWindow.Function` 执行 `window.parent.postMessage({type:'dsh-bot:calib-402'}, location.origin)`。页签组件所在 window 的临时 `message` 监听收到：

```json
{"origin":"http://127.0.0.1:3084","type":"dsh-bot:calib-402","sourceIsIframe":true}
```

证据: `calib-browser.json` step `asm402-iframe-fn` + `asm402-tab.png`（底栏 DSH Bot iframe 工作台可见）。

**结论 / BR-401 桥**:iframe → 页签 postMessage **可达**。实现必须校验 `event.origin === location.origin` 且 `event.source === iframe.contentWindow`。

## 3. ASM-403 显式 rename 后 DSH first-prompt 起题

无名 `createBotSession`（返回显示题「新对话」,history 当时无 `session/title`）→ `session.rename` 钉 `calib-nav-pinned-403`（`source.kind:"user"`, seq 3）→ `POST /dsh-bot/prompt` 首轮「请只用一个汉字回答：好。不要解释。」→ `turn/end`。

history 仍 **只有这一条** `session/title`,标题保持 `calib-nav-pinned-403`。`overwritten: false`。证据 `asm403-rename-turn.json`。

**结论 / BR-403**:host 显式 `renameSession` **会钉题**,随后首轮不会被 DSH first-prompt 覆盖。自动起题只可对仍是占位的标题动手。

## 4. ASM-404 archived 字段 + marks 摘除面

### sessionTool.list / 网关 list

- `session.list` 行顶层键:`sessionId, updatedAt, running, blank, cwd, agentPreset, projections`。**无** `archived` / `title`(题在 `projections.values.title`)。归档行仍出现在 `session.list`。
- host `listBotSessions` 行键:`sessionId, title, tags, status, createdAt, updatedAt, hidden, working`。**无 archived**。与 `SessionToolListRow` 一致。
- `workspace.list` 有 **`archivedSessionIds`**。`workspace.archiveSession` 成功,校准 id 进入该集合(31→32)。

证据:`asm404-fields.json` / `asm404-membership.json`。

### session-marks

导出:`get` / `put`(整集 last-wins 替换) / `listByKind` / `gc(knownIds)`。**无** `delete(sessionId)` / `removeTag(token)`。实测:put 加入 `kind:hidden`+探针 tag,再 put 去掉探针 tag,`kind:hidden` 保留。`listByKind("kind:hidden")` 命中。

证据:`marks-rewrite.json`。

**结论 / BR-404 分支**:**不要**把归档降级成「隐藏」。归档动作走 `platform.archiveSession`;工作台列表排除走 `workspace.list.archivedSessionIds`(或等价 registry 集)。显示/隐藏 toggling:改标题 `~` + `put(剩余 tags ± kind:hidden)`。

## 5. ASM-405 网关内 `ctx.on('session/event')`

临时在 `DshBotService` 的 plugin ctx 与 `ctx.root` 上订阅。GET `/dsh-bot/calib-405`(已撤) 在 403 那一轮 prompt 后:

- `subscribed: true`, `subscribeErrors: []`, ring `count: 80`
- 样例字段:`{at, via:"plugin"|"root", sessionId, type, seq, time}`
- 类型含 `assistant/chunk` / `assistant/message` / `step/end` / `turn/end`
- plugin 与 root **各收一份**(同 seq 双份)。Task 10 **只订 plugin ctx 一次**。

签名(dsh-session Events):`'session/event'(session: Session, event: SessionEvent)`。只读,不 `flush`/不 append。

证据:`asm405-events.json`。

**结论 / BR-406 分支**:采用候选① **只读 `session/event` 订阅**作 SSE 脏通知源。候选② 内部 ≤1s 扫描仅作订阅失败/断线兜底,两者对外仍合法。

## 6. 回写与分支一览

| 条目 | 选定实现分支 |
|---|---|
| BR-401 | 桥:origin+source+type;隐藏 **直接 open**;归档不直开(先 unarchive 或列表根本不提供) |
| BR-404 | 真归档(`archiveSession` + `archivedSessionIds` 排除);marks 用 `put` 重写。list 行无 archived 字段**不**降级。仅 `archive-unavailable` 才降级隐藏 |
| BR-406 | SSE 事件源 = `ctx.on('session/event')` 只读;扫描通道留作兜底 |

ASM-401/402/403/405 证实,对应合同句不改。ASM-404 证伪「行无 archived 字段 ⇒ 降级隐藏」:已走 shared-rules §12 变更协议改 BR-404 / UF-404 失败分支 / Task 7(spec 1.5, Version 0.2.0)。UF-404 Then「官方可寻回」不变。
