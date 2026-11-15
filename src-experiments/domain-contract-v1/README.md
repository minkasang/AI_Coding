# domain-contract-v1（隔离原型）

> 状态：PROPOSAL / 研究原型。不是生产 Schema，不接 5173 生产状态，不依赖 Three.js/CAD/物理引擎。

## 目的

验证 CARLAB 未来的最小工程领域模型能否：

- 用稳定 `instanceId` 选中整车/系统/总成/零件；
- 表达 `Project / VehicleVariant / System / AssemblyDefinition / Assembly / PartDefinition / PartInstance / MountFrame / Joint / Constraint / AssetRef / SourceEvidence / SimulationRunRef`；
- 把 `applicableWhen`、Gen1/Gen3 互斥、`evidenceInherited`、REF/BOM、qty、采购/展开边界、UNKNOWN 不升级、仿真结果过期合并成可执行规则；
- 明确从车辆局部坐标到 3D Y-up 视窗的转换边界。

## 运行

```bash
node src-experiments/domain-contract-v1/run-checks.mjs
node --test src-experiments/domain-contract-v1/tests/domain.test.mjs
```

`run-checks.mjs` 打印两份 fixture 的校验结果、计数、FAM-130-007 成员、仿真运行状态和第一个显示变换。测试覆盖正常装配、Gen1/Gen3 混配、别名/证据越权、重复实例、REF 重复计数、错误 Frame/单位、仿真过期等负例。

## 文件

- `domain.mjs`：纯数据模型与 `ProjectStore` 命令（add/move/selectVariant/serialize/restore/getRunStatus/toDisplayTransform）。
- `fixtures/vehicle-skeleton.json`：10 个系统、4 个轮端、主要总成占位、GEN1、真实 RP-01/R-06/R-11 片段。
- `fixtures/fl-wheel-end.json`：可动的左前轮端，5 个螺柱实例、REF 制动盘、Joint/Constraint、来源和一次仿真结果。
- `tests/domain.test.mjs`：14 个 Node 测试。

## 边界

- 不修改 `src/`、`workbench-v2/`、旧页面或其他模型目录。
- 不把旧 THREE Object3D 节点名当 `instanceId`；`instanceId` 必须稳定且独立。
- `PART-30-006` 等几何仍 `NEEDS_MEASUREMENT`；`PART-30-009` 仍是 `ASSUMPTION`，M14 只是 R-03 命名，不是已核实螺纹。
- 世界 Frame 仍待 RP-07 裁决；本目录的 `FR-VEHICLE` 只是候选，不宣布生产坐标冻结。
- `Joint` 与 `Constraint` 分开；R-04/R-09 的悬架约束仍是 `Constraint`，不是 Joint。
- 14/14 只证明模型规则可运行，不证明真实装配、尺寸、材料或物理性能。
