# dsh-bot-mvp Review Report

> Review mode: full | Date: 2026-08-29 | Reviewer: orchestrator-closer (unattended)

## 0. 结论

| 项 | 结论 |
|---|---|
| 是否可发布 | Yes（本机调试仓 / 私仓 `Nothing1024/dsh-bot`；未 force push） |
| 阻塞问题数 | 0 |
| 高风险问题数 | 0 |
| Evidence 是否充分 | Yes（spec 5.2 矩阵 21 条路径均非空落盘） |
| 最大风险 | `session.selectModel` 会写部署默认；follow-global pin 与 BR-010 override 均靠 mutex + restore。官方 GUI 仍不按标题 `~` 过滤，隐藏依赖 `workspace.archiveSession`（INV-002 已记） |

## 1. 输入资料

| 资料 | 路径 / 来源 | 状态 | 备注 |
|---|---|---|---|
| Spec（含业务合同/任务/验收） | `docs/dsh-bot-mvp/spec.md` | Found | 第 2 章 BR/UF/INV/EVD；5.1/5.2/5.4 |
| Tasks CSV / 内嵌状态表 | `docs/dsh-bot-mvp/tasks.csv` | Found | 20/20 已完成；无 已阻塞 / 待开始 / 进行中 |
| Diff / 实现摘要 | `git log` Task 1–18 + 本波 Task 19-20 未提交 diff | Found | 含 follow-global pin（`applyModelOverride`） |
| Evidence | `docs/dsh-bot-mvp/evidence/` | Found | 见 §4；5.2 21 路径齐全 |

缺失资料必须标注 `Evidence Missing` 或 `ASSUMED`：无。

---

## 2. L1 静态一致性

| 检查项 | 结果 | 证据 | 风险 |
|---|---|---|---|
| 所有 BR 有实现 | Pass | BR-001 跟随配置（packages 无硬编码 xai/openai）；BR-002 preset `env/.agent-presets/dsh-bot`；BR-003 `ctx.sessionTool` + marks；BR-004 `GW_PORT=3084`；BR-005 gitignore；BR-006 packages/env/scripts 无 anysphere/sand://；BR-007 fail loud；BR-008 `ctx.inject(['betterSidebar'])`；BR-009 standards；BR-010 `dsh-bot.model` + selectModel/restore | — |
| 所有 BR 有验证 | Pass | Task 3/7/11/15/17/19/20 evidence | — |
| 所有 UF 有 evidence | Pass | UF-001~006 目录与 5.2 路径 21/21 | — |
| INV 未被破坏 | Pass | INV-001 邻仓 porcelain：st/go 空，vibee 仅预存 `?? .vibee/`（本仓未写）；INV-002 rail 无 `~dsh-bot:`；INV-003 本仓只听 3084（3080/3083 他仓占用未抢）；INV-004 凭据未入 git | vibee `.vibee/` 预存，P3 |
| diff 未越界 | Pass | 未改 spec 第 2 章合同正文；未改邻仓文件；生态 `plugin/README.md` 口表 3084 已在 Task 2/18 | — |
| 未删除权限/错误处理 | Pass | 工具 fail loud；页签 error/retry/empty；override-invalid 不回落 | — |
| 未只改 mock/fixture | Pass | `packages/dsh-bot-host/src/platform.ts` 真路径 pin；5.2 真网关 | — |

BR/UF/INV 核销：

| ID | L1 | 验证 |
|---|---|---|
| BR-001 | Pass | `packages/` 无 `provider: 'xai'`；xAI 仅 `settings.example.yaml` 注释段 |
| BR-002 | Pass | preset 目录 + `agent-presets.default: dsh-bot`；GUI 自称 DSH Bot |
| BR-003 | Pass | `rg session/tags packages/` 空；marks `kind:dsh-bot` |
| BR-004 | Pass | who 3084 → 本仓 env |
| BR-005 | Pass | `git ls-files` 无 `.env`/`settings.yaml`/sessions/storages |
| BR-006 | Pass | `packages/` `env/` `scripts/` 无 anysphere / sand:// |
| BR-007 | Pass | gateway-down `web-unreachable`；timeout 附 session id |
| BR-008 | Pass | phase-3 `no-sidebar.md` |
| BR-009 | Pass | `standard:check` 0 FAIL |
| BR-010 | Pass | UF-006 三态 + GUI 直建仍全局 |
| UF-001~006 | Pass | 见 L3 |
| INV-001~004 | Pass | 见上 |
| EVD-001~009 | Pass | phase-0~4 + UF 目录 |

§3.3 锚点抽检 3 条（本机 `rg` 是 shell function，`--repo` 可能 WARN，不挡）：

- `class DshBotService` / `dshBot` → `packages/dsh-bot-host/src/index.ts` L87
- `dsh_bot_ask` → `packages/tool-dsh-bot/src/index.ts` L41
- `GW_PORT=3084` → `env/boot.sh` L12

---

## 3. L2 技术验证

| 验证项 | 是否运行 | 结果 | Evidence | 问题 |
|---|---|---|---|---|
| typecheck | Yes | Pass | `evidence/phase-4/final-regression.log` TYPECHECK_EXIT:0 | — |
| lint | No | NA | 根 `package.json` 无 lint 脚本 | — |
| unit | Yes | Pass | host 28 + ui 14 + tool 5（外加 workspace 邻包 session-tool 测试）TEST_EXIT:0 | — |
| integration | Yes | Pass | 5.2 真网关 RPC/HTTP | — |
| e2e/API | Yes | Pass | `/dsh-bot/*` + `dsh-rpc.sh 3084` + Playwright/Chrome | — |
| build | Yes | Pass | BUILD_EXIT:0 | — |
| standard:check | Yes | Pass | STANDARD_EXIT:0「结论：全部通过」 | — |
| 包校验 | Yes | Pass | `validate_package.py docs/dsh-bot-mvp` 0 FAIL（closer 二次跑） | `--repo` 可能因本机 rg 函数 WARN，已手抽 3 锚点 |
| migration/benchmark | NA | NA | 全新仓 | — |

---

## 4. L3 用户路径复现

| UF | 复现步骤 | 期望 | 实际 | 结果 | Evidence |
|---|---|---|---|---|---|
| UF-001 主路径 | :3084 新会话「你是谁?」 | preset=dsh-bot、流式回复、自动标题 | 自称 DSH Bot / grok-4.6；create `agentPreset=dsh-bot` | Pass | `evidence/UF-001/success.png` `session-history.json` |
| UF-001 无凭据 | 切到 `apiKeyEnv=BOT_MISSING_KEY` | 点名凭据；补 key 免重启 | MISSING_CREDENTIAL + 恢复 | Pass | `missing-key.md` |
| UF-001 上游失败 | 本地 401 | 稳定错误码，会话可重试 | AUTH/401，会话保留 | Pass | `upstream-error.md` |
| UF-002 主路径 | 调 `dsh_bot_ask` | 工具完成、答案入主会话、marks、官方栏无 `~` | 工具 ok；marks kind:dsh-bot；rail 无 `~dsh-bot:` | Pass | `tool-call.md` `marks.txt` `rail-check.png` |
| UF-002 网关不可达 | 停 3084 后 CLI create | web-unreachable，不吞错 | `[web-unreachable] fetch failed` | Pass | `gateway-down.md` |
| UF-002 超时 | `askTimeoutMs=200` | 超时附 session id，不杀会话 | wait-timeout + marks 仍在 | Pass | `timeout.md` `timeout-history.json` |
| UF-002 并发 | 同时两笔 ask | 独立会话、答案不串 | A/B 各一 id | Pass | `concurrent.md` |
| UF-003 主路径 | 打开 DSH Bot 页签→列表→跳转→新建 | 列表/跳转/新建 | closer 重截列表；新建落 plugin + DSH Bot composer | Pass | `tab-list.png` `create-jump.png` `listSessions-t19.json` |
| UF-003 RPC 失败 | 停网关开页签 | 错误态+重试，不白屏 | 「无法加载会话列表」+重试 | Pass | `rpc-error.png` |
| UF-003 空数据 | 无标记 | 空态+新建引导 | 「还没有 DSH Bot 会话」 | Pass | `empty.png` |
| UF-004 | marks list + 不存在 kind | 列表 / `(no marks)` | 均 exit 0 | Pass | `marks-list.txt` |
| UF-005 会话内切换 | selectModel 后下一轮 | header 变；preset 不变 | grok-4.6 → deepseek-v4-flash | Pass | `switch-in-session.md` |
| UF-005 默认切换→委托 | 改 agent-default-model 后 dsh_bot_ask | 新委托用新默认 | pin 后 header=deepseek-official/deepseek-v4-flash | Pass | `default-switch.md` |
| UF-005 缺凭据 | 切 nokey | MISSING_CREDENTIAL | 点名 BOT_MISSING_KEY | Pass | `missing-cred.md` |
| UF-006 override 开 | 写 dsh-bot.model | 插件会话 override；GUI 直建仍全局 | plugin=deepseek… gui=anthropic/grok-4.6 | Pass | `override-on.md` |
| UF-006 清空 | 清空 model | 回全局 | global-default anthropic/grok-4.6 | Pass | `override-off.md` |
| UF-006 非法 | no-such-provider | fail loud 不回落 | `override-invalid` 点名 provider | Pass | `override-invalid.md` |

### 入口接线与交互完整性（对照 spec 2.3 节流程脚本）

| UF | 入口真实可达（路由/菜单/按钮） | loading/禁用态 | 错误提示 | 成功反馈 | 结果 |
|---|---|---|---|---|---|
| UF-001 | Yes（官方新建会话，preset 默认 dsh-bot） | Yes（发送按钮 disabled 至有输入） | Yes（错误卡片） | Yes（流式回复+标题） | Pass |
| UF-002 | Yes（`dsh_bot_ask` 工具 + RPC prompt） | Yes（工具卡片执行中） | Yes（web-unreachable / wait-timeout） | Yes（答案入主会话） | Pass |
| UF-003 | Yes（better-sidebar「DSH Bot」页签、`/dsh-bot/*`） | Yes（`list.loading`、新建 `disabled={busy}`） | Yes（error+重试） | Yes（列表/跳转/新建） | Pass |
| UF-004 | Yes（session-tool CLI 模板在 README） | NA（CLI） | Yes（空提示） | Yes（id + kind 集） | Pass |
| UF-005 | Yes（平台模型选择器 + settings） | Yes（选择器） | Yes（MISSING_CREDENTIAL） | Yes（下一轮 header） | Pass |
| UF-006 | Yes（settings `dsh-bot.model` + 页签 botModel） | NA（配置） | Yes（override-invalid） | Yes（header 对比） | Pass |

---

## 5. L4 反向 / 破坏性验证

| 场景 | 操作 | 期望 | 实际 | 结果 | 风险 |
|---|---|---|---|---|---|
| 权限不足 | 本需求单角色，fence 由 session-tool 承担 | 不绕过 sessionTool | host 只用 sessionTool；无 session/tags | Pass | — |
| 非法输入 | 非法 override | fail loud | override-invalid 点名 provider | Pass | — |
| 网络失败 | 停网关 | 工具/页签错误态 | web-unreachable；页签重试 | Pass | — |
| 重复提交 | 并发两笔 dsh_bot_ask | 独立会话不串 | concurrent A/B | Pass | — |
| 空数据 | 无 marks | 空态不报错 | empty.png + `(no marks)` | Pass | — |
| 旧数据兼容 | 全新仓 | NA | NA | Pass | — |
| 无凭据 | BOT_MISSING_KEY | 点名凭据引用 | UF-001/005 | Pass | — |
| 上游失败 | 401 | 稳定错误码 | upstream-error.md | Pass | — |

---

## 6. 问题清单

无 P0 / P1。不回写 Phase-Fix / 不新增 tasks.csv 行。

| ID | 严重级别 | 标题 | 关联 BR/UF/INV | 复现步骤 | 期望 | 实际 | 证据 | 建议修复 |
|---|---|---|---|---|---|---|---|---|
| BUG-001 | P2 | `session.history` 常截掉 `agent-preset/selected`，脚本误判 preset | UF-001 / EVD-003 | history maxMessages 默认窗口 | history 导出显示 preset=dsh-bot | create 响应有 agentPreset；history 可能 undefined | `task19-matrix.md` 首轮 FAIL | 核销改看 create/`session.list` 的 agentPreset，或加大 history 窗口 |
| BUG-002 | P3 | follow-global pin 经 `selectModel` 会短暂改写部署默认 | BR-010 / UF-005 / ASM-007 | 空 override 的 dsh_bot_ask | durableCreate 直接吃 live 默认 | session-tool create 不带 model，host pin+restore（mutex） | `platform.ts` `applyModelOverride` | 上游 durableCreate 若将来带 model 则可去掉 pin |
| BUG-003 | P3 | 官方栏不按 `~` 过滤；隐藏走 archiveSession | INV-002 | 委托辅助会话 | 官方栏不出现 `~dsh-bot:` | 栏内无该前缀；依赖 archive 成功 | `rail-check.png` | 保持现状；archive 失败会漏到「未分组」 |
| BUG-004 | P3 | 邻仓 vibee 预存未跟踪 `.vibee/` | INV-001 | `git -C vibee/plugin status` | porcelain 空 | `?? .vibee/`（本仓未写入） | neighbor status | 不处理 |

### BUG-001: history 截断导致 preset 核销脆弱

**严重级别**：P2  
**关联**：UF-001 / EVD-003  
**复现步骤**：

1. `session.create` 得 `agentPreset=dsh-bot`。
2. `session.prompt` 后 `session.history` 默认窗口。

**期望结果**：history 事件含 preset=dsh-bot。  
**实际结果**：早段 `agent-preset/selected` 可能被截掉；人设文本与 create 响应仍正确。  
**证据**：`evidence/phase-4/task19-matrix.md`、`evidence/UF-001/session-history.json`。  
**建议修复**：验收看 create/list 的 agentPreset，或显式拉全量 history。

---

## 7. 发布建议

- Go：5.1 全绿 + 5.2 21/21 证据齐全 + validate_package 0 FAIL；本波可本地 commit，不 force push。
- 必须先修复：无 P0/P1。
- 可延期：BUG-001~004。
- 需要补充 evidence：无（closer 已重截 UF-003 `tab-list.png` / `create-jump.png` 与 UF-002 `rail-check.png`）。
