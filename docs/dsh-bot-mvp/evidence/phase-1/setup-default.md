# setup.sh stamps agent-presets.default (BR-002 / Task 7)

时间: 2026-08-29  
`sh -n env/setup.sh` 通过。未对现场 `env/settings.yaml` 做改写（已是 `default: dsh-bot`）。

## 第一跑模拟（邻仓拷贝，无 agent-presets）

`session-tool/plugin/env/settings.yaml` 不含 `agent-presets`。把该文件拷到临时路径后跑 `setup.sh` 内 `ensure_dsh_bot_preset_default`：

- 写入 `agent-presets.default: dsh-bot`（插在 `agent-default-model` 与 `llm-pi-ai` 之间）
- 模型路由键完整保留（`agent-default-model.provider/model`、`llm-pi-ai`）
- 再跑一次 stdout 为 `already dsh-bot`（幂等）

产物: `setup-default-neighbor-after.yaml`

`default: standard` 的残缺文档会被改写成 `dsh-bot`；已是 `dsh-bot` 的 `settings.example.yaml` / 现场 `settings.yaml` 不改字节。
