# UF-103 delete bot (after gateway boot)

createBot id=uf103-shanwo
routineCreate id=r-1788693677671-jqawt44y
memory dir after remember=True
deleteBot={"ok": true, "value": {"id": "uf103-shanwo", "deleted": true}}
memory dir after delete=False
routine leftover via RPC=[]
routine leftover via file=[]

Expected: memory dir gone; leftover row enabled=false (not removed).

## 判定
- memory 目录删除：PASS
- 例程行留下且 `enabled=false`：FAIL on this process
- 正在跑的网关 pid=20928 启动于 19:10:59；`lib/index.js` 在 19:17 才带上 `routineStore.update({enabled:false})`
- 源码与构建产物已是 disable-not-remove；本进程仍走旧 `remove`
- 未再重启网关（避免打断本轮 v1 / 抽取回放）
