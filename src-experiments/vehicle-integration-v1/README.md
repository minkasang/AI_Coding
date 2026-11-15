# 整车对象 + 机构位姿整合（R-22 候选）

读取 R-16 候选整车树、R-17 领域合同和 R-18 虚构位姿，输出一个可追踪的 `VehicleProject + PoseRun` 候选，不覆盖任何原数据，也不启动网页服务。

```text
node src-experiments/vehicle-integration-v1/run-checks.mjs
node --test src-experiments/vehicle-integration-v1/tests/integration.test.mjs
```

## 产物

- `fixtures/integration-output.json`：完整整合候选（R-16 的 13 系统 / 53 子系统 / 108 总成定义 / 493 零件定义 / 278 零件实例 / 37 Frame；R-17 交叉映射；R-18 的 4 个已绑定位姿 + 1 个未绑定位姿）。
- `fixtures/domain-view-fl-sla.json`：FL 双叉臂纵切的 R-17 可执行投影，原 `validateProject` 直接通过；`INST-*` 只是视图局部别名，`engineeringInstanceId` 才是 R-16 的规范 `PI-*`。

## 硬边界

- 278 个实例全部 `NO_GEOMETRY`；没有 Mesh、GLB 或伪几何。
- 37 个 R-16 安装 Frame 全部 `UNANCHORED_UNKNOWN`；不输出整车生产显示矩阵。
- 只有 R-18 的 `FR-VEHICLE` 虚构演示帧有 4 个可复核的 m / Y-up 刚性显示矩阵，`production:false`。
- 4 个 R-18 位姿绑定到 R-16 实例；`INST-SLA-TIEROD-FL` 因 R-16 `PART-20-075` 为 `DEFERRED` 而保持未绑定、不发布。
- `Joint` 是装配关系，`Constraint` 是解算方程，减振器长度是 `OUTPUT`。
- 所有来源引用保持 `UNVERIFIED_REFERENCE`，不自动升级为 OEM 证据。

## 关键尺寸口径

R-16 的 `qtyPerCorner` 表示“每角需要几个物理实例”，不是“每个实例自身数量”。20 个螺柱实例不能把 5 再乘一遍成 100；本整合把每个 `PI-*` 视为一个物理件。按实例数重算后，恰好只有 R-16 已声明的 12 个整车数量冲突，没有额外隐藏冲突。

## 校验

`run-checks.mjs` 重新计算输入 SHA-256、完整性与覆盖范围，要求 0 错误、0 警告；41 个测试覆盖至少 19 个负例和 3 个活性对照。详细设计见 `docs/research/R-22-integration-schema-and-decision-log.md`。
