# docs/archive — 已归档文档

归档 = 已验收跑完的任务包、已被后续决策取代、已明确搁置、或结论已并入其他文档的材料。**只读快照，不再更新**；需要引用时写明「已归档」。归档文件内部的相对路径（如 `../prototypes/real/…`、`../dsh-bot-memory/`）仍按它们**原始位置**（`docs/<原目录>/`）书写，未做改写。

已验收（Done）或用户明确搁置的任务包也在这里。它们仍是已交付（或明确未做）功能业务合同的定义处，可引用、不再改。活索引见 `../README.md`。

| 归档项 | 原位置 | 归档日期 | 为什么归档 | 被什么取代 |
|---|---|---|---|---|
| `dsh-bot-mvp/` | `docs/dsh-bot-mvp/` | 2026-09-08 | Done 20/20，v1 已交付 | 后续包在其上叠加；合同仍有效 |
| `dsh-bot-group-chat/` | `docs/dsh-bot-group-chat/` | 2026-09-08 | Done 17/17 | `dsh-bot-group-rounds/` 原计划在其上做多轮（2026-09-13 同归档，未执行） |
| `dsh-bot-memory/` | `docs/dsh-bot-memory/` | 2026-09-08 | Done 13/13 | — |
| `dsh-bot-routines/` | `docs/dsh-bot-routines/` | 2026-09-08 | Done 14/14 | — |
| `dsh-bot-living-master/` | `docs/dsh-bot-living-master/` | 2026-09-08 | Done 5/5，母包联合回放完成 | — |
| `dsh-bot-live-transcript/` | `docs/dsh-bot-live-transcript/` | 2026-09-08 | Done 16/16 | — |
| `dsh-bot-peers/` | `docs/dsh-bot-peers/` | 2026-09-08 | Done 15/15 | — |
| `dsh-bot-roster/` | `docs/dsh-bot-roster/` | 2026-09-08 | Done 15/15 | `dsh-bot-left-tab/` 复用其分组/绑定逻辑 |
| `dsh-bot-alive-master/` | `docs/dsh-bot-alive-master/` | 2026-09-08 | Done 6/6，母包联合回放完成 | — |
| `dsh-bot-native-experience/` | `docs/dsh-bot-native-experience/` | 2026-09-08 | Done 9/9 | — |
| `dsh-bot-native-surface/` | `docs/dsh-bot-native-surface/` | 2026-09-08 | 用户 2026-09-06 判定「把 Bot 面拆到官方壳的几个小座位上产生不了 Bot 中心」，包状态 Deferred，0/N 未执行；其 BR-703 已撤回 | 方向由 `dsh-bot-left-tab/`（左栏模式切换 + 官方中栏）接替；表面层的身份/入口部分由 `dsh-bot-native-experience/` 实现 |
| `dsh-bot-workbench/` | `docs/dsh-bot-workbench/` | 2026-09-13 | iframe 工作台已交付（18/19）。T18 UF-205 env 阻塞窗口被后续 BR-208 / left-tab BR-609 取消。用户收口归档 | 合同仍有效；1:1 主面由 `dsh-bot-left-tab/` 接替 |
| `dsh-bot-session-nav/` | `docs/dsh-bot-session-nav/` | 2026-09-13 | 跳转桥 4/14 已落地；收纳/起题/overview 未做且与 left-tab 主路径冲突。用户收口归档 | 跳转被 left-tab `sessions.open` 覆盖；其余见 `../remaining-prd-decision.md` |
| `dsh-bot-group-rounds/` | `docs/dsh-bot-group-rounds/` | 2026-09-13 | 0/15 未开工。用户收口归档 | 小组仍是 `dsh-bot-group-chat/` 一轮广播 |
| `dsh-bot-interaction-master/` | `docs/dsh-bot-interaction-master/` | 2026-09-13 | 0/5 未开工，子包范围已不定。用户收口归档 | — |
| `dsh-bot-left-tab/` | `docs/dsh-bot-left-tab/` | 2026-09-13 | Done 23/23，1:1 交官方中栏 | 当前产品主面 |
| `prototypes/dsh-bot-complete.html` | `docs/prototypes/` | 2026-09-08 | 按 slot 名推想的「官方壳」，与真实 GUI 逐项对照后多数为编造（品牌、分段、hero 文案、composer 按钮、右栏五 tab、主题） | `../prototypes/real-dsh-ui-survey.md` §B 保留了逐项对照结论 |
| `prototypes/dsh-bot-grok-parity.html` | `docs/prototypes/` | 2026-09-08 | Bot 中心整页住在右栏 overlay，官方左栏与中栏闲置；曾是 memory / routines / live-transcript / peers / roster 五包的原型输入，这些包均已验收 | 五包 spec 已落地其内容；左栏方向见 `../prototypes/dsh-bot-left-tab.html` |
| `prototypes/dsh-bot-on-real-shell.html` | `docs/prototypes/` | 2026-09-08 | 入口在 footer 打开右栏 iframe，产品面仍在 sidebar；是 native-surface 的原型 | 随 native-surface 一同归档 |
| `prototypes/dsh-integrated.html` | `docs/prototypes/` | 2026-09-08 | 画了不存在的左栏「会话 \| Bot」分段座位，中栏又是一套假 Chat 壳 | `../prototypes/dsh-bot-left-tab.html`（真实壳 + 真实座位） |
| `prototypes/native-surface.html` | `docs/prototypes/` | 2026-09-08 | 56px 假 rail + 插件三栏，不是官方 sidebarCol，对话面自绘 | 同上 |
| `EXPERIENCE_ANALYSIS.md` | 仓根 | 2026-09-08 | 2026-09-01 对 grok-bot 0.18 的体验差异分析，结论已分别进入 memory / routines / peers / roster / live-transcript / group-rounds 各包 §1.1 | 各包 spec |
| `IMPLEMENTATION_GUIDE.md` | 仓根 | 2026-09-01 写就，2026-09-08 归档 | 带完整代码示例的实现指南，早于 oneclick 任务包体系；代码示例已被各包 §3 技术方案与实际实现取代 | 各包 spec §3 / `packages/*` 源码 |

## 归档规则

- 进入归档的依据四种：任务包已验收（状态板 100%、5.2 证据齐全、Status Done）、被用户明确搁置（Deferred）、被后续原型/调研证伪、结论已全部并入其他单一事实源。
- 归档动作用 `git mv`，保留历史；不删除。
- 归档后要回头修活文档里的路径（`rg -n "<旧路径>" docs README.md --glob '!docs/archive/**'`）。2026-09-08 两轮 + 2026-09-13 第三轮：五个剩余活跃包（workbench / session-nav / group-rounds / interaction-master / left-tab）移入后，根 README、`docs/README.md`、`docs/prototypes/` 中的 `docs/dsh-bot-<x>/` 改指 `archive/`。归档包内部互相引用仍按**原始位置**书写，不改写。
