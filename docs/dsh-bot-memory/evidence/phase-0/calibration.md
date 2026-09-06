# Task 1 校准 ASM-801~804

Date: 2026-09-06  
Gateway: `127.0.0.1:3084` pid=32077 `DSH_HOME=.../dsh-grok-bot/plugin/env`  
Commands: `POST /dsh-bot/*` + `~/.agents/skills/dsh-plugin-debug/scripts/dsh-rpc.sh 3084`

Preset files restored from `aning-persona.bak.yml`.  
`git status --porcelain env/.agent-presets` is empty (directory is gitignored).

## ASM-801 — 代际规则（改 preset 后新会话读新文本）

**操作**：把 `env/.agent-presets/dsh-bot--xiaodui-aning/agent.cordis.yml` persona 追加「你记得用户叫测试甲」，`createBotSession({botId:xiaodui-aning})`，再 `prompt`「我叫什么」。

**事实**：

- `createBotSession` 返回 `ok:true`，`presetId=dsh-bot--xiaodui-aning`。同 preset 的会话在 `session.list` 上带 `agentPreset: dsh-bot--xiaodui-aning`。
- 平台会为新会话挂上当时磁盘上的该 preset。**代际靶点存在**，注入可以写这个文件。
- 本轮模型未答出「测试甲」。`session.history` 里 `turn/end.reason.kind=error`，`llm/retry` 的 failure 是：

```
503: {"code":"model_not_found","message":"No available channel for model grok-4.6 under group svip (distributor)"}
```

随后重试耗尽，表面成 `TRANSPORT` / `Connection error.`。

**结论**：假设的**文件代际规则成立**（新会话绑定当前 preset 文件）。假设的「问我叫什么会答测试甲」**本轮无法用模型口头证实**，阻塞原因是 grok-4.6 渠道 503，不是 preset 没挂上。文件已恢复。

## ASM-802 — 隐藏会话抽取成本与 JSON 率

**操作**：工作台 `prompt` 走与 `askBot` 相同的模型路径；准备了 3 段「只输出 JSON」抽取样例。

**结论**：同样卡在 grok-4.6 `model_not_found`（见 ASM-801 事件）。单次 ≤20s / JSON≥95% **本轮无法计时**。抽取实现仍走隐藏会话 + 自写提示词；单测 `memory-extract.spec.ts` 覆盖解析与寒暄跳过。

## ASM-803 — GUI 直建会话能否被 reconcile / list 看见

**操作**：`dsh-rpc.sh 3084 session.create '{"title":"asm-803-gui","agentPreset":"dsh-bot--xiaodui-aning"}'`，然后 `POST /dsh-bot/reconcile` 与 `listBotSessions`。

**事实**（`asm803.json`）：

- `session.create` `ok:true`。
- `reconcile` `ok:true`：`scanned:149 labeled:1 alreadyLabeled:140 skippedCached:8`，`assigned[0]={sessionId:session-910d15b6-..., botId:xiaodui-aning, reason:preset}`。
- `listBotSessions` 返回 `web-unreachable` / `workspace/follow HTTP 401`。工作台列表这条路径本轮不可用；reconcile 仍能按 preset 贴上 `bot:<id>`。

**结论**：补扫能看见 GUI/RPC 直建的 bot preset 会话（`reason:preset`）。名册/工作台列出依赖的 `workspace/follow` 本轮 401，记为环境问题，不是 mark 逻辑不存在。

## ASM-804 — 4000 字 persona 会不会把 preset 打成 broken

**操作**：`replacePersonaText` 写入恰好 4000 字 persona，然后 `dsh-rpc.sh 3084 agentPreset.list`（点号方法；`agentPreset/list` 返回 `not found`）。

**事实**（`asm804.json`）：`persona_chars:4000`，`hit_id:dsh-bot--xiaodui-aning`，`broken:""`，`any_broken_ids:[]`。写完恢复原文件。

**结论**：假设成立。记忆段 4000 上限不必因为 YAML/broken 再前移。

## 对 BR-802 寒暄规则的校准说明

字面「<40 且无问号一律不抽」会丢掉 UF-801 的「我叫 Nothing，术语保留英文」。实现改为：寒暄词表，或短句且每个 token 都是寒暄才跳过；短事实和带问号仍抽。`shouldExtract` 单测覆盖该正反例。不改代际靶点。

## 总判

| ID | 结果 |
|---|---|
| ASM-801 | 代际靶点成立；口头问答被 grok-4.6 渠道 503 挡住 |
| ASM-802 | 被同一模型渠道挡住，未取得 3 次耗时 |
| ASM-803 | reconcile 按 preset 认 GUI 会话；`listBotSessions` 被 workspace/follow 401 挡住 |
| ASM-804 | 成立 |

母包 ASM-110（代际规则同时支撑记忆注入与例程规范段）：**靶点未证伪**。模型渠道与 `workspace/follow` 401 是后面 5.2 真机回放的止损点。
