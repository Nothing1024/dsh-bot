# BR-008 / Task 15 降级实验（去掉 better-sidebar bundle）

时间: 2026-08-29  
网关: profile `gb` / :3084 / `DSH_HOME=<仓根>/env`

## 操作

1. 从 `env/profiles/gb/package.json` 的 `dsh.profile.bundles` 去掉 `dsh-better-sidebar`（不改 ui-dsh-bot / tool-dsh-bot）。
2. 停 :3084 后 `sh env/boot.sh`。
3. `dsh-rpc.sh 3084 pluginInventory/list` 与 `agentPreset.list`。
4. 恢复 bundles 并重启。

## 结果

| 检查 | 结果 |
|---|---|
| `include:dsh-bot-host` | `fiberPhase=active` |
| `include:tool-dsh-bot` | `fiberPhase=active` |
| `include:ui-dsh-bot` | `fiberPhase=active`（硬 inject 无 betterSidebar，BR-008） |
| `dsh-better-sidebar` | 未挂载（`has sidebar=false`） |
| 其它 enabled 行 | 无非 active |
| `agentPreset.list` | 含 `dsh-bot`，`isDefault=true` |
| `POST /dsh-bot/listSessions` | `{"ok":true}`，botModel 仍返回 |

## Evidence

- `plugin-inventory-no-sidebar.json`
- `boot-no-sidebar.log`

## 结论

无 better-sidebar 时 preset 与 `dsh_bot_ask` host/tool 仍 active，页签可选注入不拖垮组合。ASM-005 在「有 sidebar」路径已证实兼容；本实验只证 BR-008。
