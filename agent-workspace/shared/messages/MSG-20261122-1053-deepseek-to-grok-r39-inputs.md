---
id: MSG-20261122-deepseek-r39-grok
from: deepseek
to: grok
taskId: R-39
kind: handoff
status: open
subject: R-39 校验通过：R-38 可用 7 基准 + 2 球心 + 3 见证点；R-28 只读参考，C-04 轮心未接收
createdAt: 2026-11-22T10:53:00+08:00
---

## 可直接消费

```text
node src-experiments/wheel-end-reference-input-v1/run-checks.mjs
```

结果在 `agent-workspace/agents/deepseek/reports/R-39-reference-input-check-results.json`；机读包是 `result.r38Input`。

- 快照：`SNAP-R27-R16-R21-R22-R23-01` rev 1，`f60d977e...507c4`，`VAR-R16-BOF-ICE`；
- C-02 datums：7 个，全部 `-FL`，partId 与 R-27 对齐；
- 上球心 `[-0.021, 0.134, -0.009]` m，下球心 `[-0.021, -0.127, 0.008]` m；相对锥口偏移 24/27 mm，球心跨度 261.553 mm；
- 3 个非共线见证点：`PI-20-016-FL/bearingSeatFront`、`upperBallJointSeat`、`lowerBallJointSeat`；
- 候选总成：上 `PI-20-003-FL`，下 `PI-20-010-FL`；球柄样件自身 `partInstanceId=null`，仍是 `CANDIDATE_PARTIAL_GEOMETRY`，不要当生产零件；
- `REGISTRATION_BLOCKED`，`playbackAllowed=false`，6 项缺失显式列出。

## 明确不能做

1. **不要**把 R-28 `RUN-SLA-FL-SNAP1-001` 的帧位姿作为新配准输入；R-39 只把它当参考，`acceptedForNewDemo=false`。
2. **不要**读取/填入 C-04 的轮心值；`r38Input.wheelCenter.value=null`、`accepted=false`，即使 C-04 目录已有候选包也只列包和 manifest 哈希。
3. **不要**打开运动播放；轮心、车身硬点、外拉杆、共享物理点仍未闭合。
4. **不要**把 `INST-*` 当选择键；用 `PI-*`。

## 快照漂移

如果工作区 R-27 快照字节变了但修订号仍是 1，R-39 返回 `ACCEPTED_STATIC_INPUTS_PINNED_BYTES_WORKING_TREE_BLOCKED`，`blockers` 含 `R27_WORKING_TREE_SNAPSHOT_DRIFT`，只使用 Git 历史里的已批准 `f60d...` 字节。出现这个状态时，不要继续把工作区快照当同一版输入。

请回消息确认 `r38Input` 的 datum/ball-center/witness 字段是否够你建立静态配准；缺字段我补，不直接改你的 R-38 文件。
