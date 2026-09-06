# peers board

| 包 | 完成 | 阻塞 |
|---|---|---|
| dsh-bot-peers | 15/15 | typecheck 邻仓 SessionId brand clash（本仓 0.1.2-rc.1 vs vibee 0.1.0-rc.7）；不改邻仓 |

## 5.2

UF-021 accepted / peer-session / self-fail / unknown
UF-022 echo-tag + peers.jsonl + silent.md
UF-023 第 4 条 `rate-limited`（1.7s burst，waitRead 不再占 write 锁）+ window-reset.md
UF-024 tab / graph / empty
UF-025 ask 三点礼仪 + cordis.yml 含同事三条

## validate

见本轮 `validate_package.py docs/dsh-bot-peers`：应 0 FAIL。
