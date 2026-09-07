# UF-302 成员失败保留已成功回复

Host 单测 `runGroupRound keeps the first reply when a later member fails`:

- 诗人小北先写入房间
- DSH Bot wait status=failed → 房间追加 `speaker.kind=error` 行
- 不回滚已成功的成员气泡

见 `packages/dsh-bot-host/tests/group-engine.spec.ts` 与 `evidence/phase-2/engine-unit.log`。
