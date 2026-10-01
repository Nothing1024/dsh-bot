# group-rounds-v2 改动行覆盖率（diff coverage）

基准：0285677（handoff）..HEAD；工具：vitest 4.1.11 + @vitest/coverage-v8 4.1.11（临时安装，测完已撤回）。
口径：只统计本包改动/新增的源码行中可执行语句（v8 statementMap），测试文件与纯类型行不计。

| 文件 | 覆盖/可执行 |
|---|---|
| `packages/dsh-bot-host/src/group-engine.ts` | 11/11 |
| `packages/dsh-bot-host/src/group-inbox.ts` | 94/94 |
| `packages/dsh-bot-host/src/groups.ts` | 12/12 |
| `packages/dsh-bot-host/src/index.ts` | 8/8 |
| `packages/dsh-bot-host/src/reconcile.ts` | 4/4 |
| `packages/dsh-bot-host/src/workbench-routes.ts` | 16/16 |
| `packages/dsh-bot-host/src/workbench-sessions.ts` | 4/4 |
| `packages/dsh-bot-shared/src/mentions.ts` | 12/12 |
| `packages/dsh-bot-shared/src/wire-error.ts` | 4/4 |
| `packages/workbench-ui/src/Composer.tsx` | 1/1 |
| `packages/workbench-ui/src/Conversation.tsx` | 125/125 |
| `packages/workbench-ui/src/SessionList.tsx` | 14/14 |
| `packages/workbench-ui/src/Transcript.tsx` | 45/45 |
| `packages/workbench-ui/src/api.ts` | 3/3 |
| `packages/workbench-ui/src/useSessionPoll.ts` | 8/8 |

**合计：361/361 = 100.0%**（门槛 ≥90%）

未覆盖行：无

整文件覆盖率（含历史代码，仅供参考）：group-inbox.ts 94.9% 行、group-engine.ts 91.6%、groups.ts 93.7%、useSessionPoll.ts 100%；workbench-routes.ts / api.ts 偏低来自未改动的历史分支。

复现：`pnpm add -D -w --save-exact @vitest/coverage-v8@4.1.11` 后 `pnpm exec vitest run --coverage.enabled --coverage.reporter=json --coverage.include=<改动文件>`。
