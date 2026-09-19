# UF-204 写盘失败

时间: 2026-08-30T11:10:45.025Z
网关: `127.0.0.1:3084  pid=55016  DSH_HOME=/Users/nothing/workspace/dsh/plugin/dsh-grok-bot/plugin/env  cwd=/Users/nothing/workspace/dsh/plugin/dsh-grok-bot/plugin`


## 1. Live host（chmod 0555 on `$DSH_HOME/dsh-bot`）

`updateBot` → ok=false error={
  "code": "internal",
  "message": "EACCES: permission denied, open '/Users/nothing/workspace/dsh/plugin/dsh-grok-bot/plugin/env/dsh-bot/bots.json.55016.1788088328379.tmp'"
}

原 persona 保留: true

## 2. 代码级 fixture

`pnpm --filter dsh-bot-host exec vitest run tests/bots.spec.ts -t "rolls back"`

exit=0

```

 RUN  v4.1.11 /Users/nothing/workspace/dsh/plugin/dsh-grok-bot/plugin

 ✓ packages/dsh-bot-host/tests/bots.spec.ts (17 tests | 14 skipped) 18ms

 Test Files  1 passed (1)
      Tests  3 passed | 14 skipped (17)
   Start at  19:12:08
   Duration  146ms (transform 34ms, setup 0ms, import 62ms, tests 18ms, environment 0ms)



```

Host `bots.spec.ts`：registry write fail after rewrite 回滚；broken update 回滚。UI：`updateBot` `ok:false` 时 BotForm 不关面板、原值保留。

