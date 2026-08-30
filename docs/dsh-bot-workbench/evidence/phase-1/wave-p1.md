# Wave P1 (Tasks 5-7)

Review p1 已修：

- BR-202 多人设文本改为 YAML `|-` 字面块（单行仍单引号），js-yaml 引擎 round-trip 与 `readPersonaText` 一致；不再把换行写成字面 `\\n`。
- UF-202 创建防重：BotForm `submitLock` + App `submitLock` 同步闩，连点只发一次 `createBot`。
- UF-206 删除/改名失败走 roster 行内错误条（`workbench-action-error`），不吞、不切网关死页。
- UF-204 `updateBot` 在 `saveRegistry` 失败时回滚 preset 文件。

## 验证

| 命令 | 结果 |
|---|---|
| `pnpm --filter dsh-bot-host test` | 52 passed |
| `pnpm --filter workbench-ui test` | 19 passed |
| `pnpm -r test` | 全包绿 |
| `python3 validate_package.py docs/dsh-bot-workbench` | 0 FAIL / 21 PASS |

Evidence：`bots-unit.log` `roster-unit.log` `phase-summary.md` `create-shiren.png` `preset-list.json`。
