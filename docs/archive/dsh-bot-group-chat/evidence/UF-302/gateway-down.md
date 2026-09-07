# UF-302 网关死

Date: 2026-08-30

小组「网关死测」打开、composer 填 `gateway-down-draft-keep` 后杀掉 :3084 本仓 pid。

界面：

- composer 错误条 `unavailable: Failed to fetch`
- 输入框仍保留 `gateway-down-draft-keep`
- 发送按钮可点（可重试）

对应 BR-304 失败分支：网关不可达不写损坏 jsonl，草稿保留。
