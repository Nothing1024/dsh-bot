# Phase 1 Summary

## 完成任务
- Task 6 编写 dsh-bot agent preset：`agentPreset.copy` from `standard`，只改 `dsh-persona` `config.text`；`preset.yml` 改写 name/description
- Task 7 接线 `agent-presets.default: dsh-bot`（`settings.example.yaml` + 现场 `settings.yaml` + `setup.sh` 邻仓种子后 stamp）；GUI 新会话发「你是谁?」
- Task 8 重启 gb/:3084 后 UF-001 主路径复现；官方栏仍显示非 `~` 会话（INV-002 前半）

## 验证命令
| 命令 | 结果 | 日志 |
|---|---|---|
| `dsh-rpc.sh 3084 agentPreset.copy {from:standard,agentPreset:dsh-bot,name:DSH Bot}` | `ok` / `agentPreset=dsh-bot` | `preset-list.json` |
| `dsh-rpc.sh 3084 agentPreset.list` | 含 `dsh-bot`，`trust=user`，无 `broken` | `preset-list.json` / `preset-list-restart.json` |
| `session.create {}`（改默认后） | `agentPreset: dsh-bot` | `restart-create.json` |
| `session.prompt`「你是谁?」 | 回复自称 DSH Bot，header `anthropic/grok-4.6/xhigh`，system 含人设段 | `UF-001/session-history.json` / `restart-history.json` |
| `agentPreset.select` 空白会话 standard↔dsh-bot | 成功；已开聊会话 `agent-preset-locked` | `gui-preset-menu.png` / `gui-preset-standard.png` |
| `setup.sh` stamp 默认 preset | 邻仓拷贝无 `agent-presets` → 写入 `default: dsh-bot`；幂等 | `setup-default.md` |
| 重启 `sh env/boot.sh` + `dsh-rpc-who.sh 3084` | pid 新、`DSH_HOME=本仓 env` | `boot-restart.log` / `rpc-who-restart.txt` |

## 用户路径 / API 验证
| UF/API | 结果 | Evidence |
|---|---|---|
| UF-001 主路径 | GUI 新会话指示 **DSH Bot**，问「你是谁?」流式回复人设口吻；自动标题「询问你是谁」 | `../UF-001/success.png` + `../UF-001/session-history.json` |
| BR-002 默认 preset | 设置热加载后新会话 `isDefault=dsh-bot`；重启后 `session.create` 仍吃默认 | `gui-new-session.png` / `preset-list-restart.json` |
| 空白切 preset | GUI 菜单可见 standard/PTC/极简/创造/DSH Bot；切 standard 再切回 | `gui-preset-menu.png` / `gui-preset-standard.png` |
| INV-002 前半 | 重启后官方栏仍显示 `询问你是谁`、`gui stream ok`（非 `~`）；`~校准隐藏` 不在 plugin 分组栏 | `gui-rail-after-restart.png` |

## 剩余风险
- ASM-005 仍留 Task 15。
- 委托辅助会话官方栏隐藏仍走 `workspace.archiveSession`（Task 9）。
- 本机 `vibee/plugin` 有既有未跟踪 `.vibee/`，本波未改邻仓。
- UF-001 无凭据/上游失败两行属 5.2 全矩阵（Task 19），本 Phase 只做主路径。
- Task 6 人设为 unattended 指定原文；事后改写走 `persona.md`，不是完成门闩。
