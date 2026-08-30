# Wave P2 (Tasks 8-11)

Date: 2026-08-30. Gateway: profile `gb` :3084, `DSH_HOME=<root>/env`.

## Dual gate

| Gate | Result |
|---|---|
| `python3 ~/.agents/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-workbench` | 0 FAIL (see this wave run) |
| `pnpm --filter dsh-bot-host test` | 68 passed |
| `pnpm --filter workbench-ui test` | 35 passed |
| `pnpm --filter dsh-bot-host/workbench-ui typecheck` | 0 error |

## Review fixes (p0/p1)

- **BR-205 P0** `sinceSeq` 增量：session-tool 含 `seq >= sinceSeq`。投影 id 改为每行每 kind 计数（`thinking-55-1` 在全量与 `sinceSeq=55` 页相同）；客户端按 seq 整页替换，不再按易变 id append。实机全量 `['message-8-1','thinking-55-1','message-55-1']` 与 `sinceSeq=55` `['thinking-55-1','message-55-1']` 对齐。
- **Task 10 P1** prompt 只 write、不 wait。成功后 `awaitingTurn` 直到 history `working` 见过再 idle，或出现更新的 assistant；`refresh()` 不全表清空。Composer `disabled={poll.working \|\| awaitingTurn}`。
- **UF-203 P1** roster working 点：App 每 2s `listBotSessions` 扫 `working`；选中 bot 的 overlay 乐观点亮；unmount 只删 overlay，不把生成中的点打灭。

## UF-202

浏览器新建「诗人小北」→ Header/占位符身份 → 回复「我是诗人小北」+ 五言。见 `uf-202-chat.png` / `uf-202-browser.json`。

## Not committed here

`.grok/` pre-existing untracked. env runtime (`bots.json`, `dsh-bot--*`, sessions) gitignored.
