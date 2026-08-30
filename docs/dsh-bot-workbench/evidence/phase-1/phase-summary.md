# Phase 1 Summary

## 完成任务
- Task 5 host 人设注册表与 preset 工厂：`$DSH_HOME/dsh-bot/bots.json` 原子写；种子 bot `dsh-bot` 绑既有 preset 且受删保护；人设文本只写 preset persona 行；整文件模板生成 `dsh-bot--<slug>/`，YAML 单引号转义，`agentPreset.list` 非 broken 校验，失败删目录零残留。
- Task 6 roster UI（280px）与人设表单：头像 emoji/首字+8 色板、预览草稿优先、相对时间 now/Nm/Nh/Nd、working 点、选中态、新建/编辑/删除确认、默认 bot 禁删、双击改名、提交 loading 防重与错误条。
- Task 7 浏览器实操：新建「诗人小北」→ roster 出现；`agentPreset.list` 含 `dsh-bot--shiren-xiaobei` 且无 `broken`；编辑改名为「诗人小北改」并出现生效提示；删除后 roster 与 preset 名单均消失。

## 验证命令
| 命令 | 结果 | 日志 |
|---|---|---|
| `pnpm --filter dsh-bot-host run build && pnpm --filter dsh-bot-host test` | 构建成功；51 tests 全绿 | `bots-unit.log` |
| `pnpm --filter workbench-ui run build && pnpm --filter workbench-ui test` | 构建成功；16 tests 全绿 | `roster-unit.log` |
| `pnpm -r run build && pnpm -r test` | 全包构建+测试全绿 | 终端 |
| Playwright 直开 `/dsh-bot/ui` 新建/编辑/删除 | 创建/编辑/删除截图齐全 | `create-shiren.png` `edit-shiren.png` `delete-shiren.png` `browser-crud.json` |
| `dsh-rpc.sh 3084 agentPreset.list` | 创建后含 `dsh-bot--shiren-xiaobei`（无 broken）；删除后该 id 消失 | `preset-list.json` `preset-list-after-delete.json` |

## 用户路径 / API 验证
| UF/API | 结果 | Evidence |
|---|---|---|
| POST `/dsh-bot/listBots` | 种子 DSH Bot 在位；人设来自 bundled persona 行 | 终端 curl |
| POST `/dsh-bot/listSessions` | v1 `{ok,value:{sessions,botModel}}` 仍可用 | 终端 curl |
| UF-202 新建「诗人小北」 | roster 新行；preset id `dsh-bot--shiren-xiaobei` 非 broken | `create-shiren.png` `preset-list.json` |
| UF-204 编辑 | 名字即时变为「诗人小北改」；提示「人设对之后的新对话生效」 | `edit-shiren.png` |
| UF-206 删除 | roster 移除；`agentPreset.list` 无 `dsh-bot--shiren-xiaobei` | `delete-shiren.png` `preset-list-after-delete.json` |
| BR-201 | `bots.json` 无 persona 字段 | `env/dsh-bot/bots.json`（gitignore） |
| BR-202 回滚 | 单测 broken create/update 零残留 | `bots-unit.log` / `bots.spec.ts` |

## 剩余风险
- 对话面（createBotSession / transcript / composer）仍是 P2；本 Phase roster 预览与 working 点已接线，数据源待 Task 8/9。
- 双人设串扰隔离是 P0，但按计划属后续 Phase，本波未做。
- Playwright 控制台有一条 404（多半 favicon），不影响 CRUD。
- ASM-202 已由 Task 5 写后校验+回滚单测覆盖；真机 `agentPreset.list` 新建非 broken。
