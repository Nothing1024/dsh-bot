# Phase 0 Summary

## 完成任务
- Task 1 搭建 monorepo 骨架
- Task 2 搭建 env（gb / 3084 / 0.1.1-rc.2）；生态 README 口表已登记
- Task 3 模型基线冒烟；ASM-001/006；复查 GUI 选择器切 DeepSeek（provider/model 均变）
- Task 4 校准 preset/口/selectModel/hiddenPrefixes；官方栏 `~` 证伪后 INV-002 变更协议走 `workspace.archiveSession`
- Task 5 重启 boot 后身份/冒烟可复现；git 无凭据泄漏

## 验证命令
| 命令 | 结果 | 日志 |
|---|---|---|
| `pnpm install` | 0 | `scaffold.log` |
| `sh env/boot.sh` + who | DSH_HOME=本仓 env | `boot.log` / `rpc-who.txt` |
| RPC 冒烟 grok-4.6 | header anthropic/grok-4.6/xhigh | `model-smoke.md` |
| GUI 选择器 → DeepSeek-V4-Flash + 发送 | `session.selectModel` `{provider:deepseek-official, model:deepseek-v4-flash}`；header 同；回复 `gui stream ok` | `gui-stream-reply.png` / `gui-switch-history.json` / `gui-api-calls.json` |
| `workspace.archiveSession` | 官方「未分组」不再显示 `~校准隐藏` | `gui-rail-after-archive.png` |
| Task 5 重启冒烟 | grok-4.6/xhigh；`phase0 restart ok` | `restart-smoke.json` |

## 用户路径 / API 验证
| UF/API | 结果 | Evidence |
|---|---|---|
| UF-001 模型基线 | GUI 工作区绑定后可对话 | `gui-home.png` / `gui-stream-reply.png` |
| UF-005 会话内切换 | GUI 选择器切 **provider+model**（非只改 effort） | `gui-model-selector.png` / `gui-switch-history.json` |
| UF-005 默认切换 | live、免重启 | `model-smoke.md` |
| INV-002 官方栏 | `~` 前缀不够；`workspace.archiveSession` 后栏上消失 | `gui-rail-after-tilde.png` → `gui-rail-after-archive.png` |
| INV-003/004 | 3084 本仓；secrets gitignore | who + `git check-ignore` |

## 剩余风险
- ASM-005 留 Task 15。
- Task 9 必须：`session.selectModel` 后恢复全局默认；委托会话 `workspace.archiveSession`。
- 默认 preset 仍是 standard（Task 6/7）。
