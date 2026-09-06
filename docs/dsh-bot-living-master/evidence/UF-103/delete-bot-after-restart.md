# UF-103 delete bot after gateway restart

pid after boot: see gateway-id
createBot id=uf103-shanwo-2
routineCreate id=r-1788694505445-desfnsm4
memory dir after delete=False
leftover RPC=[{"id": "r-1788694505445-desfnsm4", "botId": "uf103-shanwo-2", "name": "删我例程2", "schedule": "@every 60m", "instruction": "不要说话", "enabled": false, "notify": false, "createdAt": 1788694505445, "runs": []}]
leftover file=[{"id": "r-1788694505445-desfnsm4", "botId": "uf103-shanwo-2", "name": "删我例程2", "schedule": "@every 60m", "instruction": "不要说话", "enabled": false, "notify": false, "createdAt": 1788694505445, "runs": []}]

Expected: memory dir gone; leftover row enabled=false (not removed).

## 判定
- memory 目录删除：PASS
- 例程行留下且 `enabled=false`：PASS（新进程 pid 33601 加载了 19:34 的 host lib）
