# 整车只读快照 + PoseRun 投影（R-27 候选）

把 R-16 整车树、R-21 跨模型对照表、R-22 整合产物和 R-23 运动流合成一份 5173 工作台可直接静态读取的 `vehicleSnapshot`。不修改生产页面，不新建端口，不覆盖其它模型文件。

```text
node src-experiments/vehicle-snapshot-v1/run-checks.mjs
node --test src-experiments/vehicle-snapshot-v1/tests/snapshot.test.mjs
```

## 产物

- `fixtures/vehicle-snapshot.json`：唯一主快照。278 个 R-16 实例、493 个定义、37 个无锚点 Frame、唯一索引、绑定矩阵、严格 STALE 的 `poseRun`、带徽标的 9 帧 DEMO 运动视图、24 项保留冲突。
- `fixtures/vehicle-snapshot.consumer.json`：给小型的消费索引（入口、计数、徽标、禁止事项、快照 SHA-256）。

## 消费规则（Composer R-29）

1. 选择键只用 `partInstanceId`（`PI-*`）；`INST-*` / `ASM-*` 只是投影别名。
2. 278 个实例全部 `NO_GEOMETRY`；只有 `PI-30-006-FL` 有一个明确的 `DEMO_SUBSTITUTE` 轮毂 GLB，不得复制到其它实例。
3. 37 个 R-16 Frame 全部无坐标；只有 `demoMotionView` 的 `FR-VEHICLE` 帧有 m / Y-up 演示矩阵。
4. 严格 `poseRun` 是 `STALE` 且没有当前帧；`demoMotionView` 只能在 DEMO 模式并显示 `DEMO_ONLY_STALE_SOURCE_REV_3` 徽标时播放。
5. 3 个刚性零件位姿（上/下摆臂、转向节）+ 1 个轮毂角色标记 + 1 个必需但暂缓的外拉杆；不得把轮毂角色标记当成已证实的法兰局部坐标系。
6. 变型 `VAR-R16-BOF-ICE` 与 R-17 的 `VV-A-SWB-STD` 未对齐，不得声称同一实车。
7. 数量按物理 PI 实例计数；`qtyPerCorner` 不再乘；12 项制动数量冲突保持 OPEN。

## 边界

- 数据候选，不是冻结 Schema；等 GPT-6/RP-07 裁决。
- 没有真实几何、OEM 硬点、受力或世界坐标。
- R-26 输出缺失，快照保留 R-21/R-22 全部冲突，不自动裁决。
- R-23 的 revision 3 与本快照 revision 1 不同，R-28 需发布绑定本 revision 的新运行或显式 rebase。
