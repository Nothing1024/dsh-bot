# Task 1 baseline

Date: 2026-09-07 00:02:47
HEAD: e61aadb spec: 生成 live-transcript / peers / roster 三包与母包 alive-master

## gateway
```
127.0.0.1:3084  pid=3121  DSH_HOME=/Users/nothing/workspace/dsh/plugin/dsh-grok-bot/plugin/env  cwd=/Users/nothing/workspace/dsh/plugin/dsh-grok-bot/plugin
```

## git status --porcelain packages/
```
 M packages/dsh-bot-host/src/errors.ts
 M packages/dsh-bot-host/src/group-engine.ts
 M packages/dsh-bot-host/src/index.ts
 M packages/dsh-bot-host/src/platform.ts
 M packages/dsh-bot-host/src/routes.ts
 M packages/dsh-bot-host/src/workbench-routes.ts
 M packages/dsh-bot-host/src/workbench-sessions.ts
 M packages/dsh-bot-host/tests/routes.spec.ts
 M packages/dsh-bot-host/tests/workbench-routes.spec.ts
 M packages/dsh-bot-host/tests/workbench-sessions.spec.ts
 M packages/ui-dsh-bot/src/client/DshBotTab.tsx
 M packages/ui-dsh-bot/src/client/rpc.ts
 M packages/ui-dsh-bot/src/client/session-jump.ts
 M packages/ui-dsh-bot/tests/tab.spec.tsx
 M packages/workbench-ui/src/App.tsx
 M packages/workbench-ui/src/BotForm.tsx
 M packages/workbench-ui/src/Composer.tsx
 M packages/workbench-ui/src/Conversation.tsx
 M packages/workbench-ui/src/GroupForm.tsx
 M packages/workbench-ui/src/Transcript.tsx
 M packages/workbench-ui/src/api.ts
 M packages/workbench-ui/src/styles.css
 M packages/workbench-ui/src/useSessionPoll.ts
 M packages/workbench-ui/tests/composer.spec.tsx
 M packages/workbench-ui/tests/conversation.spec.tsx
 M packages/workbench-ui/tests/session-poll.spec.tsx
 M packages/workbench-ui/tests/transcript.spec.tsx
?? packages/dsh-bot-host/src/bot-events.ts
?? packages/dsh-bot-host/tests/bot-events.spec.ts
?? packages/ui-dsh-bot/tests/jump-bridge.spec.ts
?? packages/workbench-ui/src/useBotEvents.ts
?? packages/workbench-ui/tests/live-items.spec.ts
```

## validate
live-transcript / peers / roster / alive-master → 0 FAIL after composerWorking anchor update (BR-013 removed composerLocked).
