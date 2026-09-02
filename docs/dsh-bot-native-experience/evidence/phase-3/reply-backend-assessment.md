# Task 7 — ASM-102 后端回复持久化评估

Date: 2026-09-03

## 问题

小组「回复」是否需要在 `packages/dsh-bot-host/src/groups.ts` 的 `RoomMessage` 上增加 `replyTo` 并写入房间 jsonl。

## 勘察

- `export interface RoomMessage` 字段为 `type / id / seq / speaker / text / createdAt`，无 `replyTo`。
- 全仓 `packages/dsh-bot-host/src` 对 `replyTo` 的 rg 结果为空。
- 工作台 `prompt()` 仍只传 `{ sessionId, text }`；回复标记只存在 Conversation 的 `replyMarks` 前端 state。
- 历史回放 / 分享 / 跨刷新的回复链不在本轮 UF-004 范围（BR-005 / INV-003：前端展示层）。

## 结论

**ASM-102 证实**：本轮不改后端数据模型，不新开 `dsh-bot-group-replies` 子包。

若后续需要「刷新后仍显示 → 原发言人」或房间导出带回复链，再按 spec 1.5 + shared-rules §12 另开子包，而不是在本包顺手改 jsonl。
