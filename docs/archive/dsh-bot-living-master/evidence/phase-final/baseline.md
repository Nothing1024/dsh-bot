# Living-master T1 baseline

Date: 2026-09-06
HEAD: `c741e6c2508a8850ecf2e96fea5a95b4239a5335`
Message: spec: 生成母包 dsh-bot-living-master（BR-101~105 顺序/共享面/抽取边界/闸门，UF-101~103 联合回放，Task 1-5，含 handoff）
Branch: main

## Gateway

```
127.0.0.1:3084  pid=32077  DSH_HOME=/Users/nothing/workspace/dsh/plugin/dsh-grok-bot/plugin/env  cwd=/Users/nothing/workspace/dsh/plugin/dsh-grok-bot/plugin
```

Identity matches this repo `env/`. Port 3084 is already listening.

## Child-package validate (pre)

- `docs/dsh-bot-memory --repo .` → 0 FAIL / 1 WARN / 21 PASS
- `docs/dsh-bot-routines --repo .` → 0 FAIL / 1 WARN / 21 PASS
- `docs/dsh-bot-living-master --repo .` → 0 FAIL / 0 WARN / 17 PASS

Full logs: `pre-validate.log`

## packages/ porcelain at T1 (do not mix into memory/routines commits)

Pre-existing dirty work from session-nav / group-chat / workbench, not part of this master run:

```
 M packages/dsh-bot-host/src/ask.ts
 M packages/dsh-bot-host/src/group-engine.ts
 M packages/dsh-bot-host/src/index.ts
 M packages/dsh-bot-host/src/workbench-sessions.ts
 M packages/dsh-bot-host/tests/ask.spec.ts
 M packages/dsh-bot-host/tests/group-engine.spec.ts
 M packages/dsh-bot-host/tests/workbench-sessions.spec.ts
 M packages/ui-dsh-bot/src/client/DshBotTab.tsx
 M packages/ui-dsh-bot/src/client/session-jump.ts
 M packages/ui-dsh-bot/tests/tab.spec.tsx
 M packages/workbench-ui/src/BotForm.tsx
 M packages/workbench-ui/src/GroupForm.tsx
 M packages/workbench-ui/tests/roster.spec.tsx
?? packages/ui-dsh-bot/tests/jump-bridge.spec.ts
```

Plus docs/README/env/settings.example.yaml and untracked `.grok/`, `.vscode/`, analysis markdown, prototypes.

Memory/routines implementation must commit only its own files on top of this baseline.
