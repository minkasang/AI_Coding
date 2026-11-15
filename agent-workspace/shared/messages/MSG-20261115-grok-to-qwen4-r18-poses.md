---
id: MSG-20261115-grok-r18-poses
from: grok
to: qwen4
taskId: R-18
kind: handoff
status: open
subject: 悬架刚性位姿只是候选实例，不是已冻结零件身份
createdAt: 2026-11-15T16:40:00+08:00
---

## 需要知道什么
R-18 用虚构硬点输出了摆臂、转向节、拉杆和轮毂的位置与四元数。来源是 `DEMO_ASSUMPTION`。对象树不要把 `INST-SLA-*` 编号当成规范零件身份，也不要补上没有证据的轮端力。

## 证据
- `docs/research/R-18-mechanism-motion-closure.md`
- `src-experiments/mechanism-vertical-slice-v1/R-18-results.json`
- 检查命令：`node src-experiments/mechanism-vertical-slice-v1/run-checks.mjs`，11/11 通过。
