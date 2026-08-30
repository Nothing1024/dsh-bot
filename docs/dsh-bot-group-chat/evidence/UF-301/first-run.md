# UF-301 首次无组

Date: 2026-08-30

重启网关后、createGroup 之前:

```
POST /dsh-bot/listGroups {"args":{}}
{"ok":true,"value":{"groups":[]}}
```

工作台打开不报错，仅 1:1 名单（当时 listBots 只有 dsh-bot；随后补建诗人小北）。无 groups.json 时空数组，不弹错误条。
