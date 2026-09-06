# Task 1 校准 ASM-031~034

网关：`dsh-rpc-who.sh 3084` → 本仓 `env/`。

| ASM | 结果 | 证据 |
|---|---|---|
| ASM-031 | **Contract confirmed.** 现网改名走 `onDoubleClick`，与 HTML5 `dragstart` 分离。实现用 `draggable` + drop，不在 drag 路径调 `openRename`。 | Roster.tsx L187 vs drag handlers |
| ASM-032 | **Contract confirmed.** 预览 500ms 开 / 150ms 关；`dragstart` 清 timer 并关卡，避免挡 drop。 | 实现按合同 |
| ASM-033 | **Contract confirmed.** `isPaletteToggle` 仍只认 � drop。 | 实现按合同 |
| ASM-033 | **Contract confirmed.** `isPaletteToggle` 仍只认 ⌘/Ctrl+K；Esc 只关面板。新增 ⌘1-9 / ⌥↑↓ / ⌘B 走独立分支。 | useGlobalKeyboard.ts |
| ASM-034 | **Confirmed.** `rg hidden packages/dsh-bot-host/src/routine-scheduler.ts` → 0。隐藏不进调度。 | 源码 |

第 2 章未改。
