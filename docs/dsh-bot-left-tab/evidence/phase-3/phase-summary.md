# Phase 3 Summary

日期：2026-09-08  
网关：`127.0.0.1:3084` pid `96178`，`DSH_HOME=.../dsh-grok-bot/plugin/env`。Task 19 落地后重建 `ui-dsh-bot`，`dsh-rpc-who.sh 3084` 核身份后杀旧 pid `91916`，再 `sh env/boot.sh`。

## 完成任务

- Task 8 步骤 6（BR-604）：`lastMessages` / `ensurePreview` 从 `historyOf` 取最后一句，名册行出现预览。`6443d8f`
- Task 17（BR-607）：`conversation.session.header.actions` 身份 chip，仅 bot 会话。`b7bd9e6`
- Task 18（BR-616）：记忆 / 例程 / 同事 / 人设 pill + 对话切换 + 新开对话。`7fec673`
- Task 19（BR-620）：`turnTail`「例程触发」标签；ASM-608 同源；host 不写 `origin`，`ensureWakes` 回退。`87f9a2f`
- Task 20：Phase 3 命令级 + 真机 UF-605 / UF-610 / UF-612。本 commit

## 验证命令

| 命令 | 结果 | 日志 |
|---|---|---|
| `pnpm run typecheck` | EXIT 0 | `commands.log` Task 20 |
| `./node_modules/.bin/vitest run packages/ui-dsh-bot/tests` | 21 files / 102 tests passed | 同上 |
| `pnpm --filter ui-dsh-bot run build` | EXIT 0；client 165 kB；purity OK | 同上 |
| `git diff --stat packages/dsh-bot-host/src` | 空 | 同上 |
| `python3 ~/.claude/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-left-tab --repo .` | 0 FAIL / 1 WARN / 21 PASS | 同上 |

## 用户路径 / API 验证

| UF/API | 结果 | Evidence |
|---|---|---|
| Task 8 预览 | Bot 名册「运维夜班」预览「记下了」；「校对阿宁」预览最后一句 | `roster-preview.png` |
| UF-605-1 | 诗人小北「来自 运维夜班」：chip + 记忆 0 / 例程 0 / 同事 0 / 人设 / 对话 ▾ / 新开对话（计数懒加载，未点开为 0） | `identity-bar.png` |
| UF-610 人设浮层 | 点「人设」：persona「你是一位诗人…」+ `preset dsh-bot--shiren-xiaobei` +「编辑人设」 | `popover.png` |
| UF-605-4 | 点身份条「新开对话」：诗人小北下挂 18→19，中栏进空会话 hero（预设「诗人小北」）。空白 hero 无 `header.actions`，身份条在有对话头的会话上仍在 | 同会话态 |
| UF-605-5 | 官方会话树打开 `standard`「gui stream ok」：顶栏「标准模式」，无 chip / pill | `plain-session.png` |
| UF-612 | 「例程 · 重启续跑」助手回合尾部「例程触发 · 重启续跑」 | `routine-tag.png` |
| ASM-608 | `/dsh-bot/history` seq 与官方 `TurnLocation` / `assistant/message` 同源；interval 匹配成立；host `origin` 空 | `../UF-612/seq-check.log` |

## ASM / 实现备注

- ASM-608 **证实同源**：`session-1923ea30` history assistant seq=36 ∈ turn `[5,38]`；wake user/message seq=8 同区间。已回写 spec §1.3 / §1.5，§1.4 删 ASM-608。
- host `projectWorkbenchHistory` 只在 assistant 文本以 `[routine]` 开头时写 `origin`，user wake 被 `isPlatformInjection` 丢掉。不改 host；客户端 `ensureWakes` 把官方 `[routine]` user/message seq 写入 `routineBySeq`（不进 `items`，以免污染名册预览）。
- `select` 同步 O(1) 查 `routineBySeq`；非 bot 会话永不命中。`apply()` 在 `${current}:${status}:${items.length}:${routineBySeqKeyCount}` 变化时重挂 `turnTail`，避免 UF-612 标签因 select-before-mount 永不出现。
- `react-dom` 无 `@types/react-dom`：shim 必须放 `src/client/react-dom-shim.d.ts`（顶层 `src/*.d.ts` 被 gitignore）。
- 双转型 `client.sessions as unknown as SessionListFace`、coarse&&!fine 悬停禁用、B 路 overview、BR-621 ⌘K 获焦抑制：本批未改。

## 剩余风险

- 默认「DSH Bot」行预览可能是 JSON 转储（最后一条 `kind==='message'` 文本即是）；小组行预览仍空（按 BR-604 不动）。
- 空白官方 hero（无 `header.actions`）上看不到身份条；有对话头的 bot 会话正常。
- pill 计数首次点开才请求，截图里常为 0。
- 未做 Task 21–23（Phase 4）。
