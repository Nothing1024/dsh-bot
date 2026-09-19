# Wave P4 docs (Tasks 16-17)

Date: 2026-08-30. Gateway: profile `gb` :3084, `DSH_HOME=<root>/env`. Review findings: none.

## Dual gate

| Gate | Result |
|---|---|
| `python3 ~/.agents/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-workbench` | 0 FAIL / 0 WARN / 21 PASS |
| `pnpm run standard:check` | 0 FAIL（全部通过） |
| `bash scripts/manual-test.sh --no-write` | 44 通过 / 0 失败（`manual-test.log`） |

Task 18/19 不在本波。无 host/client 代码改动，未重启 boot。

## Task 16

- `host-descriptor.json` 增 `x-nothing1024.dsh-bot.workbench/v1alpha1` + kind `WorkbenchUi`。
- `adapter-baseline.json` 记 `workbench-ui: []`；`validate.mjs` 对有 `src/` 的包即使零触点也入表。
- `packages/workbench-ui` 是纯构建产物 SPA，不可挂载：`standards/README.md` 记账，不补 fixtures。
- `manual-test.sh` 工作台链：createBot → createBotSession → prompt(--write) → history 有回复 → deleteBot；`--no-write` 跳过 prompt。

## Task 17

- `README.md`「日常使用」：双入口、人设 CRUD、编辑只对新会话、GUI 对账、隐藏会话默认不显示、v1 页签 iframe（id `dsh-bot:sessions`）。
- `env/README.md` 文档 `$DSH_HOME/dsh-bot/`。核对见 `docs-diff.md`。

## Not committed here

`.grok/` / `.cursor/` / `.vscode/` untracked. env runtime (`bots.json`, `dsh-bot--*`, sessions) gitignored. 邻仓 porcelain 空（vibee 预存在 `?? .vibee/`）。
