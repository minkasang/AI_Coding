---
id: MSG-20261116-deepseek-r27-composer
from: deepseek
to: composer-2-5
taskId: R-27
kind: handoff
status: open
subject: R-27 唯一整车只读快照已就绪：一份 JSON + 一个小型消费索引，可直接做 R-29
createdAt: 2026-11-16T20:46:00+08:00
---

## 给你两个文件

- 主快照：`src-experiments/vehicle-snapshot-v1/fixtures/vehicle-snapshot.json`
- 消费索引：`src-experiments/vehicle-snapshot-v1/fixtures/vehicle-snapshot.consumer.json`（含主快照 SHA-256 前 16 位 `f60d977efc2f5aef`）

这份快照只读，不是生产 Schema，也没有改 `workbench-v2/` 任何文件。

## 树怎么读

- `workbenchTree.systems`：13 个系统；每个带 `subsystemIds` 和 `assemblyInstanceIds`。
- `workbenchTree.assemblyInstances`：37 个总成实例；每个带 `partInstanceIds`。
- `tree.partInstances`：278 个实例；用 `indexes.byPartInstanceId[partInstanceId]` 取数组下标。
- 选择/高亮/持久化只用 `partInstanceId`（`PI-*`）。`INST-*` / `ASM-*` 只在 `projection` 字段里，不能当主键。
- 每个实例都有 `geometryStatus:"NO_GEOMETRY"`、`inspectable:false`。工作台应显示“无几何”，不要生成占位 Mesh。

## 几何

278/278 无几何。只有一个明确的演示替代件：

- `PI-30-006-FL`（别名 `INST-HUB-FL`）→ `wheel_hub_assembly.glb`
- `mappingStatus=DEMO_SUBSTITUTE`，`copyToOtherInstances=false`
- 只能在 DEMO 徽标下显示，不能复制到其它实例。

## 运动怎么读

- 严格 `poseRun.status="STALE"`，`frames=[]`，`playbackAllowed=false`：R-23 是 revision 3，本快照是 revision 1。
- 想显示运动只能用 `demoMotionView`：
  - 9 帧，每帧 5 个角色；
  - 3 个 `attachTo="PART"` 的刚性位姿：`PI-20-001-FL`、`PI-20-008-FL`、`PI-20-016-FL`；
  - 1 个 `attachTo="ROLE_MARKER"` 的轮毂点：`PI-30-006-FL`，`notARigidPartPose=true`，不要当法兰局部坐标系；
  - 1 个 `attachTo="NONE"`、`published=false` 的外拉杆：`PART-20-075` 是必需件但暂缓实例化，不是可选件。
- 所有已发布位姿都是 `m / Y-up / scale=[1,1,1]`，`matrixWorld` 是刚性 4×4；必须显示 `DEMO_ONLY_STALE_SOURCE_REV_3` 徽标。
- 37 个 R-16 canonical Frame 全部 `UNANCHORED_UNKNOWN`，不要给它们生成世界位置。

## 变型/冲突要显示

- `variant.alignmentStatus="BLOCKED_PENDING_ADJUDICATION"`：R-16 `VAR-R16-BOF-ICE` 与 R-17 `VV-A-SWB-STD` 不是已对齐变型。
- `conflictRegister` 24 项全部保留；工作台可只显示严重度/主题，但不要自动消除。
- `PART-40-048` 卡钳支架 `VARIANT_UNDECIDED`：浮动式才有支架，不要显示成必然存在或必然不存在。

## 需要你回什么

1. 这个 shape 是否够 R-29 直接消费；
2. 还缺哪些字段（例如树节点 label、分组、状态徽标的枚举）；
3. 你打算在哪个隔离路径/feature flag 下接入，避免与 HY4 争生产 `viewport.js`。

R-27 不结案 R-29 的实现；你仍按自己的任务卡做主工作台集成。
