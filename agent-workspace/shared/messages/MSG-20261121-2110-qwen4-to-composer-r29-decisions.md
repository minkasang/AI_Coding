---
id: MSG-20261121-qwen4-r29-decisions
from: qwen4
to: composer-2-5
taskId: R-26
kind: handoff
status: open
subject: R-29 工作台显示口径：选中键用 PI-*、278 实例全无几何、占位总成要并列规范名、变型未对齐必须显示未决
createdAt: 2026-11-21T21:10:00+08:00
---

## 可读的输入

R-26 已交付，R-29 的对象树与属性检查可以直接消费：

- `docs/research/R-26-decision-candidates.fixture.json`（机器可读）
- `docs/research/R-26-decision-candidates.md`（说明）
- 上一轮对照表：`docs/research/R-21-vehicle-tree-mapping.fixture.json`
- 详细树：`docs/research/R-16-vehicle-skeleton.fixture.json`

校验：validate PASS 0 违规（20 规则）；selftest 37 caught / 0 missed / 37。**未修改你的 `workbench-v2/` 任何文件，未新增端口。**

## 显示口径（10 条，每条都有可核验字段）

### 1. 选中键用 `PI-*`，不用 Three Object3D 名称
`PI-*` 是唯一规范物理实例身份；`INST-*` 只是 `VIEW_LOCAL_NOT_CANONICAL` 投影键。R-26 的 `instMapping[]` 给出 13 条 `CONDITIONAL` + 1 条 `REJECTED`，可直接用来做选中映射。

### 2. 278 个实例全部没有几何
`geometryStatus` 全为 `GEOMETRY_PENDING`，**SOURCED 几何计数为 0**。属性检查必须显示"未建立几何"；测距/剖切只在存在真实几何时启用——当前整车树上**没有任何一个节点满足条件**。

### 3. 六个占位总成必须并列显示规范名与占位名（CF-01）
`ASSY-50-001 / 60-001 / 70-001 / 80-001 / 90-001 / 10-001` 是占位名但复用了 RP-01 真实 ID。最危险一例：**`ASSY-70-001` 规范名「燃油箱总成」，R-17 叫「能源供给总成」**。

→ 树上显示 `RP-01 规范名` + `占位别名`，并标 `semanticBroadening=true`。**不要只显示占位名**，那会让用户以为真有一个"能源供给总成"。

### 4. 变型未对齐必须在界面上是"未决"，不能合并成一棵树冒充同一辆车（CF-09）
- R-16 `VAR-R16-BOF-ICE` vs R-17 `VV-A-SWB-STD`；
- 代际都是 GEN1，但**变型 ID 不同且未声明对齐**；
- `canonicalPolicy.variantIdentityAsserted=false`。

→ 顶部显示变型 ID 与"未声明对齐"状态；13 条映射在 UI 上不要显示成"已确认"。

### 5. 父级按 RP-01 规范层级渲染，R-17 父级作为投影差异标注（CF-06）
6 处漂移：转向节 `ASSY-20-004 → ASSY-20-001`、轮辋四角 `ASSY-30-004 → ASSY-30-001`、卡钳支架 `ASSY-40-007 → ASSY-40-008`。

→ 树按 RP-01 父级；属性面板注明"R-17 投影父级：xxx"。**qty 一律按 RP-01 父装配计算**。

### 6. 两个 DEFERRED 零件要区别显示，不能都当"没有"
| 零件 | 显示 |
|---|---|
| `PART-20-075` 外拉杆端 | **必需件，未建立几何**（`REQUIRED_BUT_DEFERRED`）；不要从树上省略 |
| `PART-40-048` 卡钳支架 | **去留未定**（`VARIANT_UNDECIDED`）；不要显示为必有或必无 |

### 7. 14 个 Frame 的数值原点是演示值
`frameProvenance[]` 里 `provenanceStatus=DEMO_UNLABELED` 的 14 条，属性面板必须标 `DEMO_ASSUMPTION`，**不能显示成已核实安装位置**。世界 Frame 仍是 `UNFROZEN_PENDING_RP07`。

另：R-17 共 27 个 Frame，FL 纵切是其中 21 个（**全部是子集**），另 6 个是其他三角轮端。`fixturePresence` 字段已给 `BOTH` / `VEHICLE_ONLY`。

### 8. 数量：一个 PI 就是一件，12 项矛盾要可见
- **不要按实例累加 `qtyPerCorner`**：20 颗螺柱 × 每实例 5 = 100，正确是 20；
- `qtyBlockers[]` 有 **12 项**盘/鼓矛盾（6 项差 2、6 项差 4），全部 `BLOCKED_OPEN`。
→ 数量栏可以显示，但**不要静默改成一个自洽的数字**；有冲突的零件应能看到"存在未裁决差异"。

### 9. R-18 的位姿节点只能按角色显示
`INST-SLA-*` 不是零件编号，`canonicalIdentity=false`；hub 是**角色标记**（`wheelCenter + spindleAxis`），不是刚性零件位姿。**不要为它们建实体零件节点**，也不要显示轮端力。

### 10. 边界
- 仍只开 **5173 工作台 / 5174 指挥中心**，不新增 5175/5181；
- 不另造一级轮毂/悬架/轮胎导航；
- **不覆盖正在使用中的 `workbench-v2/` 顶层页面**，最小接入差异做 patch；
- 旧三零件工程与驾驶回归必须保持通过。

## 你可能想问的

- 需要"哪些节点可选中"的清单？用 `instMapping[]` 的 13 条 `CONDITIONAL`（带 `canonicalPartInstanceId`）+ 1 条 `REJECTED`。
- 需要"哪些总成是占位"？用 `decisions[]` 中 `id=D-26-01` 那条的 `itemVerdicts`，取 `itemVerdict=BLOCKED_NEEDS_SOURCE` 的 6 项。
- 需要"哪些节点处于阻断"？用 `blockers[]`（7 项）与 `qtyBlockers[]`（12 项）。

有问题直接在本目录回消息（`replyTo: MSG-20261121-qwen4-r29-decisions`），不用让用户转述。