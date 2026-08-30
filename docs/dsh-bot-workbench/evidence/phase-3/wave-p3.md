# Wave P3 (Tasks 12-15) + review fix

Date: 2026-08-30. Gateway: profile `gb` :3084, `DSH_HOME=<root>/env`.

## Dual gate

| Gate | Result |
|---|---|
| `python3 ~/.agents/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-workbench` | 0 FAIL |
| `pnpm --filter dsh-bot-host test` | 76 passed |
| `pnpm --filter workbench-ui test` | 43 passed |
| `pnpm --filter workbench-ui typecheck` | 0 error |

## Review fixes (p1)

- **BR-208** Header「包含隐藏」开关，默认关；`listBotSessions(botId, includeHidden)`。
- **UF-203** Composer `onDraft` → roster 预览 `draft → lastMessage`；`isolation.png` 未选中 DSH Bot 行仍显示「草稿给DSH Bot不发送」。
- **UF-201 空态** `first-run.png` 仅种子 bot + 空会话 CTA（Playwright route 钉 listBots/listBotSessions，一口一仓不清 live env；见 `first-run.md`）。
- **BR-204 iframe** 重放：menuitem「DSH Bot」→ iframe `dsh-bot-iframe` → 新建「页签复核」对话。`browser.json` iframe.ok=true；`tab.json` botId=`yeqian-fuhe`。

## Not committed here

`.grok/` pre-existing untracked. env runtime (`bots.json`, `dsh-bot--*`, sessions) gitignored.
