# UF-204 write-fail (preset/registry rollback)

Date: 2026-08-30. Task 13. Code-level fixture (spec 5.2: 只读目录或代码级 fixture).

Host `packages/dsh-bot-host/tests/bots.spec.ts` already hard-verifies BR-202 rollback.

## 1. Registry write fail after rewrite (chmod 0555 on `$DSH_HOME/dsh-bot`)

```
it('rolls back the preset if the registry write fails after rewrite')
chmodSync(join(home, 'dsh-bot'), 0o555)
await expect(bots.updateBot({ id, persona: '新人设' })).rejects.toThrow()
persona file still '旧人设'; listBots persona still '旧人设'
```

UI: `updateBot` returns `{ok:false,error}` → BotForm `data-testid=bot-form-error` keeps the original fields (`busy` unlocks, submit lock clears). Roster row is unchanged.

## 2. Broken preset after rewrite

```
it('rolls back a broken update and keeps the previous composition')
gate.list marks the managed preset broken → updateBot throws preset-broken
composition restored to '旧人设'
```

## 3. Live host

`pnpm --filter dsh-bot-host test` 76 passed, including the two rollback cases above.
No half-written persona and no registry mutation on failure.

## 4. UI contract

`BotForm` shows `formError` from `updateBot` and does not close the panel (`setForm(null)` only on ok).
Original name/persona stay in the inputs (controlled state is not reset).
