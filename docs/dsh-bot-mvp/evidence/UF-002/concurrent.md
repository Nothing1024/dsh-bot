# UF-002 并发委托

时间: 2026-08-29  
两笔 `session.prompt` 同时要求调用 `dsh_bot_ask`（tag A / tag B）。

## 结果

| 主会话 | 工具答案 | 串扰 |
|---|---|---|
| `session-31895962-2802-46d7-b56f-0a18ea770a4d` | `concurrent A`（isError false） | 不含 B |
| `session-38fa804e-83b3-485f-ad41-5d25dad9adc9` | `concurrent B`（isError false） | 不含 A |

marks 新增两行（各自独立会话，不复用）：

```
session-747f1342-5c76-4d9a-9cea-cd8913318e28 kind:delegated,kind:dsh-bot,kind:hidden
session-be2f46a2-7b03-4fd9-b949-3a3f0383c3ce kind:delegated,kind:dsh-bot,kind:hidden
```

原始历史：`concurrent-raw.json`。
