# docs — 任务包索引

每个 `dsh-bot-*/` 目录是一个 prd-workflow 任务包：`spec.md` 唯一事实源（§0 人话摘要 → §5 验收协议）、`tasks.csv` 或内嵌状态表、`evidence/` 证据、`spec-view.html` 只读投影、按需 `handoff.md`。看进度：`python3 ~/.claude/skills/prd-workflow/scripts/board.py docs/archive/<包>`；校验：`python3 ~/.claude/skills/prd-workflow/scripts/validate_package.py docs/archive/<包> --repo .`。

**活跃包：`dsh-bot-group-rounds-v2/`**（2026-09-30，Ready 0/17）：小组引用即点名、轮内排队可取消、继续讨论、删房间；取代 `archive/dsh-bot-group-rounds`。其余任务包已移入 `archive/`（已验收 / 被后续决策取代 / 搁置），索引见 `archive/README.md`。原型与真实 GUI 调研仍在 `prototypes/`。2026-09-13 收口对照见 `remaining-prd-decision.md`。仓级现状调研见 `project-research.md`。2026-09-30 删除两个放弃包（interaction-master、native-surface），记录见 `archive/README.md`「已删除」。

## 交付脉络（按 spec 首次入库日期）

```text
08-29 mvp ─▶ 08-30 workbench ─▶ 08-30 group-chat
   ├─▶ 09-01 session-nav / group-rounds / interaction-master(母包，已删除)
   ├─▶ 09-02 native-experience
   └─▶ 09-06 转向「Bot 中心」：memory ─▶ routines ─▶ living-master(母包；native-surface 同日搁置，已删除)
                               └─▶ live-transcript ─▶ peers ─▶ roster ─▶ alive-master(母包)
09-08 left-tab（1:1 交官方中栏）
09-13 五个剩余活跃包整体归档（见 archive/README.md）
```

## 已归档（`archive/`）

| 包 | 进度 | 一句话 |
|---|---|---|
| `archive/dsh-bot-mvp` | 20/20 | v1：单人设 bot、preset、marks、better-sidebar 页签 |
| `archive/dsh-bot-workbench` | 19/19 | iframe 工作台 `/dsh-bot/ui`。T18 UF-205 窗口被后续合同取消，2026-09-30 关单 |
| `archive/dsh-bot-group-chat` | 17/17 | 小组广播对话、插件房间 jsonl |
| `archive/dsh-bot-session-nav` | 14/14（收缩） | 跳转桥已交付；收纳/起题/归档/overview 2026-09-30 拍板不做 |
| `archive/dsh-bot-group-rounds` | 0/15（被取代） | 代码已有多轮（默认 3 轮）/ 重试 / 房间标题 / working；余项由活跃包 `dsh-bot-group-rounds-v2` 接手 |
| `archive/dsh-bot-memory` | 13/13 | 三层记忆 + 自动抽取 + 注入 |
| `archive/dsh-bot-routines` | 14/14 | 例程调度、主动来消息、未读 |
| `archive/dsh-bot-living-master` | 5/5 | 母包：memory + routines 联合回放 |
| `archive/dsh-bot-live-transcript` | 16/16 | SSE、排队/打断、思考/工具/审批卡 |
| `archive/dsh-bot-peers` | 15/15 | 同事异步传话、礼仪、关系图 |
| `archive/dsh-bot-roster` | 15/15 | 名册分组/拖拽/隐藏/静音/快捷键 |
| `archive/dsh-bot-alive-master` | 6/6 | 母包：live-transcript + peers + roster 联合回放 |
| `archive/dsh-bot-native-experience` | 9/9 | 官方壳上的身份 / 入口 / 导航表面层 |
| `archive/dsh-bot-left-tab` | 23/23 | 官方左栏 Bot 模式 + 中栏身份条；2026-09-30 主面改认嵌工作台，仅作历史基线 |

这些包的业务合同仍是已交付（或明确未做）功能的定义处：引用写 `../archive/dsh-bot-<x>/spec.md`，不回头改动它们。未完成条目的处置见 `remaining-prd-decision.md`；要重开先走变更协议，不要按旧 `tasks.csv` execute。

## 约定

- 新包命名 `dsh-bot-<feature>`，小写 kebab-case。BR/UF/INV/EVD 编号**只在包内唯一**（已有多包共用 0xx，left-tab 用 6xx）；跨包引用不要写裸 ID（校验脚本会当作本包未定义），写「`<包>` 的 Task N / §2.1「规则名」」这种描述式引用。
- 包验收（状态板 100% + 5.2 证据齐全 + Status 改 Done）后整体 `git mv` 进 `archive/`，并把活文档里的路径改指 `archive/`；归档包不再改动业务合同，发现旧包事实过期时在**新包** §1.3 记录。用户明确搁置的未完成包同样进 `archive/`。
- 归档收四类：已验收 / 被取代 / 被搁置 / 已并入，规则见 `archive/README.md`。
