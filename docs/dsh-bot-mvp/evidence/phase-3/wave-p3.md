# Wave P3 (Tasks 13–16)

时间: 2026-08-29  
网关: `dsh-rpc-who.sh 3084` → `DSH_HOME=<本仓>/env`

## 本波产物
- `packages/dsh-bot-host` HTTP `/dsh-bot/listSessions|createSession`；createSession 带 cwd/workspacePath（默认 `dirname(DSH_HOME)`）
- `packages/ui-dsh-bot` better-sidebar「DSH Bot」页签；新建把当前会话/工作区 cwd 交给 host
- gb profile：`dsh-better-sidebar@0.13.0` + `ui-dsh-bot`
- ASM-005 证实并回写 spec 1.3 / 清空 1.4

## Dual-gate
| 门 | 结果 |
|---|---|
| `python3 ~/.agents/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-mvp` | 见本波末次运行 |
| `pnpm run typecheck` + `pnpm -r test` | typecheck 0 error；regression.log EXIT 0 |

## Review 修补
- UF-003 新建不再落到「选择一个工作区开始」：host/client 都带 cwd，create-jump.png 为 plugin 工作区可聊 composer。
- Playwright 主路径点击列表行 `dsh-bot-row-session-cb74c0e8-…`（playwright.log）。
- UF-001/002 history 等到 `assistant/message` / `tool/result`，不再把用户 prompt 字符串当成功。

未 commit 凭据 / `env/.env` / `env/settings.yaml` / sessions / storages。未 push。
