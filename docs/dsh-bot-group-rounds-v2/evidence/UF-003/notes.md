# UF-003 继续讨论（浏览器实点）

房间 `room-e23155ef-c329-4188-9507-96cd5e853068`。

- idle + 有成员发言：按钮可点，title「不发新消息，让成员接着刚才的话题再聊一场」。
- 点击后：出现 `role=separator` 分隔线「继续讨论」；头部「第 1/3 轮 · 诗人小北 正在发言」；按钮 disabled，title「讨论进行中」（`disabled-working.png`）。
- 结束后：用户气泡数 3 → 3（没有新用户气泡），消息 8 → 12（成员接着发言），按钮恢复可点（`success.png`）。
- 空房间（新开房间）：按钮 disabled，title「先发一条消息开始讨论」（`disabled.png`）。
- 房间文件 speaker 序列：['user', 'member', 'user', 'member', 'member', 'member', 'member', 'user', 'system', 'member', 'member', 'member', 'member']（只多一条 system，没有多出 user 行）。
