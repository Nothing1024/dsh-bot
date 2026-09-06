# INV-103 porcelain snapshot

Refreshed 2026-09-06T22:36:53. Neighbors were not edited by this repo. Verdict: 已阻塞.
Allowed vibee exemption is only `?? .vibee/`. Current vibee dirty set is review/evidence leftovers.

## dsh-grok-bot (144 porcelain lines)

kinds: {' M': 37, '??': 107}

Working repo; expected dirty while living-master close-out is open. `env/dsh-bot` is not in porcelain.

```
 M docs/dsh-bot-group-chat/spec.md
 M docs/dsh-bot-living-master/evidence/phase-final/memory-board.md
 M docs/dsh-bot-living-master/evidence/phase-final/report.md
 M docs/dsh-bot-living-master/evidence/phase-final/routines-board.md
 M docs/dsh-bot-living-master/spec.md
 M docs/dsh-bot-memory/evidence/UF-801/panel.png
 M docs/dsh-bot-memory/evidence/UF-801/profile.md
 M docs/dsh-bot-memory/evidence/UF-802/cordis-after-inject.yml
 M docs/dsh-bot-memory/evidence/UF-803/after-forget.png
 M docs/dsh-bot-memory/evidence/UF-803/log.jsonl
 M docs/dsh-bot-memory/evidence/UF-805/before-after-wc.txt
 M docs/dsh-bot-memory/evidence/UF-805/question-mark.txt
 M docs/dsh-bot-memory/evidence/phase-2/real-run.md
 M docs/dsh-bot-memory/tasks.csv
 M docs/dsh-bot-routines/evidence/UF-901/routines.json
 M docs/dsh-bot-routines/evidence/UF-901/wake-session-history.json
 M docs/dsh-bot-routines/evidence/UF-904/corrupt-note.md
 M docs/dsh-bot-routines/evidence/UF-904/routines.json.bak
 M docs/dsh-bot-routines/evidence/UF-904/runs-off-on-restart.md
 M docs/dsh-bot-routines/evidence/phase-2/real-run.md
 M docs/dsh-bot-routines/evidence/phase-2/wake-error.log
 M docs/dsh-bot-routines/tasks.csv
 M docs/dsh-bot-session-nav/handoff.md
 M docs/dsh-bot-session-nav/spec.md
 M docs/dsh-bot-session-nav/tasks.csv
 M packages/dsh-bot-host/src/ask.ts
 M packages/dsh-bot-host/src/group-engine.ts
 M packages/dsh-bot-host/src/index.ts
 M packages/dsh-bot-host/tests/ask.spec.ts
 M packages/ui-dsh-bot/src/client/DshBotTab.tsx
 M packages/ui-dsh-bot/src/client/session-jump.ts
 M packages/ui-dsh-bot/tests/tab.spec.tsx
 M packages/workbench-ui/src/App.tsx
 M packages/workbench-ui/src/BotForm.tsx
 M packages/workbench-ui/src/Conversation.tsx
 M packages/workbench-ui/src/GroupForm.tsx
 M packages/workbench-ui/src/styles.css
?? .grok/
?? .vscode/
?? EXPERIENCE_ANALYSIS.md
?? IMPLEMENTATION_GUIDE.md
?? docs/dsh-bot-living-master/evidence/UF-101/cordis-empty-memory.yml
?? docs/dsh-bot-living-master/evidence/UF-101/empty-create.json
?? docs/dsh-bot-living-master/evidence/UF-101/empty-history.json
?? docs/dsh-bot-living-master/evidence/UF-101/empty-pass.md
?? docs/dsh-bot-living-master/evidence/UF-101/empty-routine.json
?? docs/dsh-bot-living-master/evidence/UF-101/empty-run.json
?? docs/dsh-bot-living-master/evidence/UF-101/wake-no-memory.png
?? docs/dsh-bot-living-master/evidence/UF-101/wake-with-name.png
?? docs/dsh-bot-living-master/evidence/UF-102/pinned.png
... +94 more

```

## session-tool (139 porcelain lines)

kinds: {' M': 5, ' D': 131, '??': 3}

Pre-existing dirty tree (docs deletions + README). 邻仓零改 — not touched.

```
 M README.md
 D docs/EVOLUTION-SUMMARY.md
 D docs/design.md
 D docs/discuss-dsh-bot-gaps/RESPONSE.md
 D docs/discuss-dsh-bot-gaps/session-tool-evolution-roadmap.md
 D docs/discuss-vibee-gaps/RESPONSE.md
 D docs/dsh-0-1-2-upgrade/evidence/README.md
 D docs/dsh-0-1-2-upgrade/evidence/UF-001/conversation.png
 D docs/dsh-0-1-2-upgrade/evidence/UF-001/fail-inject.log
 D docs/dsh-0-1-2-upgrade/evidence/UF-001/sidebar.png
 D docs/dsh-0-1-2-upgrade/evidence/UF-001/success.log
 D docs/dsh-0-1-2-upgrade/evidence/UF-001/tools.png
 D docs/dsh-0-1-2-upgrade/evidence/UF-002/fail-401.log
 D docs/dsh-0-1-2-upgrade/evidence/UF-002/sidebar.png
 D docs/dsh-0-1-2-upgrade/evidence/UF-002/success.log
 D docs/dsh-0-1-2-upgrade/evidence/UF-003/collect-timeout.log
 D docs/dsh-0-1-2-upgrade/evidence/UF-003/wait-success.log
 D docs/dsh-0-1-2-upgrade/evidence/UF-004/hide.log
 D docs/dsh-0-1-2-upgrade/evidence/UF-005/boot-stdout.log
 D docs/dsh-0-1-2-upgrade/evidence/UF-005/boot.log
 D docs/dsh-0-1-2-upgrade/evidence/UF-005/ui.png
 D docs/dsh-0-1-2-upgrade/evidence/UF-006/dead-web.log
 D docs/dsh-0-1-2-upgrade/evidence/phase-0/notes.md
 D docs/dsh-0-1-2-upgrade/evidence/phase-0/pin.log
 D docs/dsh-0-1-2-upgrade/evidence/phase-0/test-after-pin.log
 D docs/dsh-0-1-2-upgrade/evidence/phase-0/test-baseline.log
 D docs/dsh-0-1-2-upgrade/evidence/phase-0/typecheck-after-isolation.log
 D docs/dsh-0-1-2-upgrade/evidence/phase-0/typecheck-before.log
 D docs/dsh-0-1-2-upgrade/evidence/phase-1/build.log
 D docs/dsh-0-1-2-upgrade/evidence/phase-1/import.log
 D docs/dsh-0-1-2-upgrade/evidence/phase-1/notes.md
 D docs/dsh-0-1-2-upgrade/evidence/phase-1/typecheck.log
 D docs/dsh-0-1-2-upgrade/evidence/phase-2/hide.log
 D docs/dsh-0-1-2-upgrade/evidence/phase-2/http-auth.log
 D docs/dsh-0-1-2-upgrade/evidence/phase-2/in-process.log
 D docs/dsh-0-1-2-upgrade/evidence/phase-2/phase-2-regression.log
 D docs/dsh-0-1-2-upgrade/evidence/phase-2/selector.log
 D docs/dsh-0-1-2-upgrade/evidence/phase-2/typecheck.log
 D docs/dsh-0-1-2-upgrade/evidence/phase-2/wait.log
 D docs/dsh-0-1-2-upgrade/evidence/phase-3/unit.log
 D docs/dsh-0-1-2-upgrade/evidence/phase-4/build.log
 D docs/dsh-0-1-2-upgrade/evidence/phase-4/no-apiproxy.rg
 D docs/dsh-0-1-2-upgrade/evidence/phase-4/regression.log
 D docs/dsh-0-1-2-upgrade/evidence/phase-4/standard-check.log
 D docs/dsh-0-1-2-upgrade/evidence/phase-4/test.log
 D docs/dsh-0-1-2-upgrade/evidence/phase-4/typecheck.log
 D docs/dsh-0-1-2-upgrade/evidence/phase-4/validate-package.log
 D docs/dsh-0-1-2-upgrade/evidence/phase-5/cleanup.log
 D docs/dsh-0-1-2-upgrade/evidence/phase-5/deps-check.log
 D docs/dsh-0-1-2-upgrade/evidence/phase-5/rerun-5.2.log
 D docs/dsh-0-1-2-upgrade/evidence/phase-5/ui.png
 D docs/dsh-0-1-2-upgrade/evidence/phase-5/validate-package.log
 D docs/research.md
 D docs/session-delegation/evidence/README.md
 D docs/session-delegation/evidence/UF-001/fail-child.log
 D docs/session-delegation/evidence/UF-001/fail-create.log
 D docs/session-delegation/evidence/UF-001/success.log
 D docs/session-delegation/evidence/UF-002/fail-auth.log
 D docs/session-delegation/evidence/UF-002/success.log
 D docs/session-delegation/evidence/UF-003/success.log
 D docs/session-delegation/evidence/UF-004/console.log
 D docs/session-delegation/evidence/UF-004/restart.png
 D docs/session-delegation/evidence/UF-004/success.png
 D docs/session-delegation/evidence/UF-005/workflow.log
 D docs/session-delegation/evidence/UF-006/backends.log
 D docs/session-delegation/evidence/UF-007/all.log
 D docs/session-delegation/evidence/UF-007/n.log
 D docs/session-delegation/evidence/UF-007/timeout.log
 D docs/session-delegation/evidence/overview-top.png
 D docs/session-delegation/evidence/phase-0/apiproxy-test.log
 D docs/session-delegation/evidence/phase-0/baseline.md
 D docs/session-delegation/evidence/phase-0/decisions.md
 D docs/session-delegation/evidence/phase-0/env-test.log
 D docs/session-delegation/evidence/phase-0/plugin-test.log
 D docs/session-delegation/evidence/phase-1/apiproxy-full.log
 D docs/session-delegation/evidence/phase-1/attribution.log
 D docs/session-delegation/evidence/phase-1/durable-depth.log
 D docs/session-delegation/evidence/phase-1/wait.log
 D docs/session-delegation/evidence/phase-2/collect.log
 D docs/session-delegation/evidence/phase-2/constraints.log
 D docs/session-delegation/evidence/phase-2/list-filter.log
 D docs/session-delegation/evidence/phase-2/projection.log
 D docs/session-delegation/evidence/phase-2/restart.log
 D docs/session-delegation/evidence/phase-2/wait-tool.log
 D docs/session-delegation/evidence/phase-3/ecosystem.log
 D docs/session-delegation/evidence/phase-3/phase3-regression.log
 D docs/session-delegation/evidence/phase-3/session-run.log
 D docs/session-delegation/evidence/phase-3/structured.log
 D docs/session-delegation/evidence/phase-4/phase4-regression.log
 D docs/session-delegation/evidence/phase-4/retire.log
 D docs/session-delegation/evidence/phase-5/checklist.log
 D docs/session-delegation/evidence/phase-5/final-acceptance.log
 D docs/session-delegation/evidence/phase-5/verification.md
 D docs/session-delegation/overview.html
 D docs/session-marks/evidence/README.md
 D docs/session-marks/evidence/UF-001/fail-web.txt
 D docs/session-marks/evidence/UF-001/marks.jsonl
 D docs/session-marks/evidence/UF-001/success.txt
 D docs/session-marks/evidence/UF-002/empty.txt
 D docs/session-marks/evidence/UF-002/success.txt
 D docs/session-marks/evidence/UF-003/empty.txt
 D docs/session-marks/evidence/UF-003/success.txt
 D docs/session-marks/evidence/UF-004/fail-empty.txt
 D docs/session-marks/evidence/UF-004/success.txt
 D docs/session-marks/evidence/UF-005/plain.txt
 D docs/session-marks/evidence/UF-005/success.txt
 D docs/session-marks/evidence/UF-005/unit.log
 D docs/session-marks/evidence/UF-006/empty.txt
 D docs/session-marks/evidence/UF-006/overlong.txt
 D docs/session-marks/evidence/UF-006/success.txt
 D docs/session-marks/evidence/UF-007/success.txt
 D docs/session-marks/evidence/UF-008/miss.txt
 D docs/session-marks/evidence/UF-008/success.txt
 D docs/session-marks/evidence/phase-2/list-notes.txt
 D docs/session-marks/evidence/phase-2/list.log
 D docs/session-marks/evidence/phase-2/write-notes.txt
 D docs/session-marks/evidence/phase-2/write.log
 D docs/session-marks/evidence/phase-3/delegated-notes.txt
 D docs/session-marks/evidence/phase-3/delegated.log
 D docs/session-marks/evidence/phase-3/marks-cli-notes.txt
 D docs/session-marks/evidence/phase-3/marks-cli.log
 D docs/session-marks/evidence/phase-4/remove-rg.txt
 D docs/session-marks/evidence/phase-4/test.log
 D docs/session-marks/evidence/phase-5/notes.txt
 D docs/session-marks/evidence/phase-6/build.log
 D docs/session-marks/evidence/phase-6/cli-profile-st.txt
 D docs/session-marks/evidence/phase-6/ids.json
 D docs/session-marks/evidence/phase-6/matrix-summary.txt
 D docs/session-marks/evidence/phase-6/summary.txt
 D docs/session-marks/evidence/phase-6/test.log
 D docs/session-marks/evidence/phase-6/validate.log
 D docs/session-marks/evidence/phase-6/vendor-rg.txt
 M packages/session-tool-local/src/http-rpc.ts
 M packages/session-tool-local/src/index.ts
 M packages/session-tool-local/src/session-client-in-process.ts
 M packages/session-tool-local/tests/http-auth.spec.ts
?? .grok/
?? packages/session-tool-local/src/live-events.ts
?? packages/session-tool-local/tests/live-events.spec.ts
```

## vibee (14 porcelain lines)

kinds: {' M': 8, '??': 6}

Allowed exemption is only `?? .vibee/`. Current dirty set is review/evidence leftovers, not `.vibee/`.

```
 M docs/vibee-node-ops/review-report.md
 M packages/tool-vibee/tests/tool.spec.ts
 M packages/vibee-host/src/executor.ts
 M packages/vibee-host/tests/engine-v2.spec.ts
 M packages/vibee-host/tests/engine.spec.ts
 M packages/vibee-host/tests/flow-nodes.spec.ts
 M packages/vibee-host/tests/kind.spec.ts
 M packages/vibee-host/tests/service.spec.ts
?? docs/vibee-canvas-dify-visual/evidence/review-0903/
?? docs/vibee-canvas-dify-visual/review-report.md
?? docs/vibee-canvas-next/
?? docs/vibee-graph-paradigm/handoff-closeout.md
?? docs/vibee-node-ops/evidence/chrome-live/
?? docs/vibee-node-ops/evidence/review-0901/
```
