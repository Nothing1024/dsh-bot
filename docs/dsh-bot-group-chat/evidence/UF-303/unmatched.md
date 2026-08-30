# UF-303 未匹配点名

Date: 2026-08-30

发送 `@幽灵 你好` 后界面即时出现 toast：「未匹配成员,已发给全员」。
同时「DSH Bot 正在发言」(memberIds 顺序的全员一轮)，composer 禁发。

与 `parseMentions` 单测一致：无有效 @handle 时 `unmatched: true` 且 responderIds = 全员。
