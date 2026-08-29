# EVD-002 模型基线冒烟（Task 3）

时间: 2026-08-29  
网关: `dsh-rpc-who.sh 3084` → `DSH_HOME=/Users/nothing/workspace/dsh/plugin/dsh-grok-bot/plugin/env`  
配置: `env/settings.yaml`（gitignore）默认 `agent-default-model: {provider: anthropic, model: grok-4.6, reasoningEffort: xhigh}`；另有 `llm-deepseek` / `session.models` 组 `deepseek-official`。  
凭据: `setup.sh` 从 `~/.dsh/.env` 种子到 `env/.env`（600）；本文件不含明文 key。

## ASM-001 冒烟（RPC）

`session.create` + `session.prompt` + `session.history`:

| 项 | 值 |
|---|---|
| sessionId | `session-d7e02ad6-a600-4877-a88b-1766be2214e5` |
| request/header.config | `{provider: anthropic, model: grok-4.6, reasoningEffort: xhigh}` |
| assistant/message | `model smoke ok` |

原始: `smoke-history.json`

## EVD-002 GUI 一次真实回复 + UF-005 会话内选择器（复查）

工作区 `workspace.create {path: <仓根>}` 后 GUI 不再停在「选择一个工作区开始」。

Playwright（Chrome channel=chrome）:

1. 打开 `http://127.0.0.1:3084` → composer 绑定工作区 `plugin`，触发器 `grok-4.6 Xhigh`（`gui-composer-ready.png` / `gui-home.png`）。
2. 点击 `aria-label=选择模型，当前 grok-4.6，推理等级 Xhigh` → 一级菜单「模型 / 推理等级」（`gui-model-selector.png`）。
3. 点「模型」→ 列出 DeepSeek + Anthropic（`gui-model-menu-l2.png`）。
4. 点 DeepSeek-V4-Flash。GUI 发出:

```
session.selectModel
payload: {sessionId:"session-bf460816-85ee-4492-a349-5c73e44c7919", provider:"deepseek-official", model:"deepseek-v4-flash"}
```

（`gui-api-calls.json`；**provider 与 model 均变更**，不是只改 reasoningEffort。）

5. 发送 `Reply with exactly the three words: gui stream ok`。流式回复上屏，composer 显示 `DeepSeek-V4-Flash Max`（`gui-stream-reply.png`）。

`session.history` 该会话:

| 项 | 值 |
|---|---|
| request/header.config | `{provider: deepseek-official, model: deepseek-v4-flash, reasoningEffort: max, maxTokens: 256000}` |
| assistant 文本 | `gui stream ok` |
| message.source | `{provider: deepseek-official, model: deepseek-v4-flash}` |

`session.selectModel` 同时把部署默认改成 DeepSeek；测完已 `settings.update` 恢复 `anthropic / grok-4.6 / xhigh`。

## ASM-006 默认切换免重启

`agent-default-model.applies = live`。`settings.update` 只改 `reasoningEffort: high` 后不重启，新会话 header 为 high。已恢复 xhigh。

另：GUI 路径已把 **provider/model** 从 anthropic/grok-4.6 切到 deepseek-official/deepseek-v4-flash。

## 结论

- ASM-001 **证实**。
- ASM-006 **证实**（新建免重启 + GUI 选择器切 provider/model）。
- BR-001 基线成立。
