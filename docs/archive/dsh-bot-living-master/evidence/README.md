# Evidence Directory

母包 dsh-bot-living-master 的证据目录。子包各自的证据在 `../../dsh-bot-memory/evidence/` 与 `../../dsh-bot-routines/evidence/`，本目录只放母包自己的前置检查、板面快照、联合回放与终检。

## 结构

```text
evidence/
  phase-final/   pre-validate.log   两子包开工前 validate 输出
                 baseline.md        开工前 git 基线（Task 3 diff 核对起点）
                 memory-board.md    记忆包收尾时 tasks.csv 快照
                 routines-board.md  例程包收尾时 tasks.csv 快照
                 final-commands.log 四命令 + 红线 + 三次 validate 输出
                 report.md          总报告（每子包完成/止损点）
  UF-101/ ~ UF-103/   联合回放截图 + 文件快照（文件名与 spec §5.2 Evidence 列逐字一致）
```

## 命名

- 文件快照直接 `cp` 真实文件，不手改；`wc`/`diff` 输出保存原文。
- 报告里任何止损点必须与对应子包 tasks.csv 的「已阻塞:原因」一致。