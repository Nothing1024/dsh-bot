# Evidence Directory — dsh-bot-interaction-master

本目录保存母包(统筹层)执行与联合验收证据。子包各自证据在其包内 `evidence/`,此处不重复。

## 结构

```text
evidence/
  phase-0/preflight.md            # T1 双子包校验输出 + 环境核身 + 启动器就位
  phase-1/nav-board.md            # T2 四期板面终态快照 + 二次 validate 输出
  phase-2/rounds-board.md         # T3 五期板面终态快照 + 二次 validate 输出
  phase-final/report.md           # T5 总报告(完成范围/止损点/两级 5.2 结果)
  phase-final/final-regression.log
  UF-601/jump-round-session.png filter.md during-discussion.md
  UF-602/roster-live.png network.png degraded.md
  UF-603/v1-ask.log v2-isolation.png v3-single-round.png
```

## 命名

- EVD ID 必须能在 `spec.md` 第 2.5 节找到。
- 板面快照直接粘贴 tasks.csv 终态 + validate 命令完整输出。
- 联合矩阵有行不适用时,在对应文件里写明「不适用-链条止损:{原因}」。
