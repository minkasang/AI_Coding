# R-27｜主工作台可消费的唯一整车快照与 PoseRun（候选）

- 任务：R-27 / displayCode 03.29《可被工作台消费的唯一整车快照与PoseRun》
- 状态：`CANDIDATE_NOT_FROZEN`，只读候选，不是冻结 Schema
- 日期：2026-11-15
- 实现：`src-experiments/vehicle-snapshot-v1/`
- 主产物：`fixtures/vehicle-snapshot.json`（911 KB）
- 消费索引：`fixtures/vehicle-snapshot.consumer.json`（SHA-256 前 16 位 `f60d977efc2f5aef`）
- 实跑摘要：`agent-workspace/agents/deepseek/reports/R-27-results.json`
- 个人回报：`agent-workspace/agents/deepseek/reports/R-27.md`

## 1. 结论先说

R-27 把 R-21 对照表、R-22 的 278 实例整合、R-23 的 9 帧运动流收成**一份只读快照**，并给出明确的消费规则。它解决了“工作台要读哪份数据”的问题，但没有假装三份夹具已经是同一辆实车。

| 关键结果 | 事实 |
|---|---|
| 整车树 | 13 系统 / 53 子系统 / 108 总成定义 / 37 总成实例 / 493 零件定义 / 278 零件实例 / 37 安装 Frame / 35 REF |
| 几何 | 278/278 `NO_GEOMETRY`，0 个 sourced 几何；仅 1 个 `PI-30-006-FL` 的 `DEMO_SUBSTITUTE` 轮毂 GLB |
| 变型 | `VAR-R16-BOF-ICE` 与 R-17 `VV-A-SWB-STD` **未对齐**，`alignmentStatus=BLOCKED_PENDING_ADJUDICATION` |
| 身份 | `PI-*` 是唯一选择键；R-21 只映射 13/278，其余 265 保留为 R-16 规范节点 |
| 数量 | 每个 PI 一件；12 项声明冲突与派生冲突逐项一致；20 个螺柱不能算成 100 |
| 位姿 | R-18/R-23 的 5 个角色：**3 个刚性零件位姿 + 1 个轮毂角色标记 + 1 个必需但暂缓的外拉杆** |
| 运行 | R-23 `inputRevision=3` vs 快照 `revision=1` → 严格 `poseRun` 为 `STALE`、0 个当前帧；9 帧只在带徽标的 DEMO 视图里 |
| 冲突 | 24 项保留：9 个 R-21 + 10 个 R-22 + 5 个 R-27；9 条 R-27 决策全部待 GPT-6 |
| R-26 | 状态 `ready`、无输出；快照保留全部冲突，不自动裁决 |

## 2. 输入索引

| 角色 | 文件 | SHA-256（前 16 位） | 声明状态 |
|---|---|---|---|
| R16_TREE | `docs/research/R-16-vehicle-skeleton.fixture.json` | `20af8ba0444c68b7` | `CANDIDATE_NOT_FROZEN` |
| R17_FIXTURE | `src-experiments/domain-contract-v1/fixtures/fl-wheel-end.json` | `18f5b4034ac67936` | `carlab.domain-contract/0.1.0-proposal` |
| R21_MAPPING | `docs/research/R-21-vehicle-tree-mapping.fixture.json` | `b8ba7d22e6310246` | `CANDIDATE_NOT_FROZEN` |
| R22_INTEGRATION | `src-experiments/vehicle-integration-v1/fixtures/integration-output.json` | `169a9f29c749bd61` | `CANDIDATE_NOT_FROZEN` |
| R23_MOTION | `src-experiments/mechanism-stream-v1/motion-stream.json` | `2976e40f48c81d96` | `DEMO_ASSUMPTION / FICTIONAL_FIXTURE` |
| R25_CAD_WHITELIST | `workbench-v2/experiments/vehicle-structure-adapter/known-cad-map.mjs` | `cc7f219212136f20` | `DEMO_WHITELIST` |
| R26_DECISIONS | `agent-workspace/agents/qwen4/tasks/R-26.md` | `c545f1fce4cc8f1c` | `ready`，无输出 |

`run-checks.mjs` 每次重新计算这些文件的 SHA-256；任一输入改动而 pin 未更新，`verifyInputHashes` 返回 `SNAP-E-INPUT-HASH`。R-26 没有 `R-26-*` 输出，快照的 `r26.decisionPolicy` 固定为 `MISSING_OUTPUT_PRESERVE_ALL_CONFLICTS`。

## 3. 快照结构与消费入口

`vehicleSnapshot` 的核心字段：

```text
schemaVersion / snapshotId / projectId / revision=1 / status / readOnly
inputs[]                    输入文件与 SHA-256
variant                     变型与对齐状态
counts                      所有计数（由数组重算，不接受手填）
tree.systems                67 个节点（VEH 根 + 13 系统 + 53 子系统）
tree.assemblyDefinitions    108
tree.assemblyInstances      37，无父实例关系时 parentStatus=UNSPECIFIED_IN_R16
tree.partDefinitions        493，带占位/名称漂移/证据冲突标记
tree.partInstances          278，带 R-21 投影（仅 13 个）
tree.references             35，countedInBom=false
tree.mountFrames            37 个 canonical + 21 个 projection
indexes                     ID → 数组下标的唯一索引
workbenchTree               13 个系统 → 37 个总成实例 → 278 个零件实例
geometry                    278 NO_GEOMETRY + 1 个 DEMO_SUBSTITUTE 白名单
qty                         物理件计数、12 项冲突、螺柱反例
bindingMatrix               5 个 R-18 角色的 R-21/R-22/R-23/R-27 对照
poseRun                     严格 STALE，0 个当前帧
demoMotionView              9 帧、5 角色/帧、带 STALE+DEMO 徽标
conflictRegister            24 项，全部保留来源
decisions                   9 条 R-27 决策，待 GPT-6
sourceRegistry              输入哈希 + 46 个未重开来源引用
consumerContract            只读消费规则与禁止事项
```

**唯一索引**：`indexes.byPartInstanceId`、`byPartDefinitionId`、`byAssemblyInstanceId`、`bySystemId`、`byMountFrameId`、`byRole` 都是 `ID → 数组下标`。不复制大对象，避免“主数据 + 索引”两份不同步。

**消费索引**：`vehicle-snapshot.consumer.json` 只放入口、计数、徽标、禁止事项和主快照 SHA-256，给 Composer R-29 做快速加载与完整性校验。

## 4. 身份、变型与父级

### 4.1 身份政策

| 对象 | 规范字段 | 值域 | 说明 |
|---|---|---|---|
| 零件实例 | `partInstanceId` | `PI-*` | 唯一选择/持久化键；不取自 GLB 节点名 |
| 零件定义 | `partDefinitionId` | `PART-*` | 一个实体一个定义 |
| 总成实例 | `assemblyInstanceId` | `AI-*` | 不与总成定义 `ASSY-*` 混用 |
| R-17 零件别名 | `projection.r17PartInstanceId` | `INST-*` | 仅投影字段，不是选择键 |
| R-17 总成别名 | `projection.r17AssemblyInstanceId` | `ASM-*` | 同上 |

R-21 的 13 个已映射实例在快照里带 `projection` 块；其余 265 个 `projection=null`，但仍是完整规范节点，不删除、不伪造。R-22 的 `INST-*` 不是第二身份。

### 4.2 变型

- R-16：`VAR-R16-BOF-ICE`，`PROPOSED_NOT_APPROVED`，10 个选择组；
- R-17：`VV-A-SWB-STD`，`PF-DEMO-BOF-01`，只设 `CG-HUB=GEN1`；
- 代际一致（GEN1），但变型 ID 不同、无对齐声明；
- 快照：`alignmentStatus=BLOCKED_PENDING_ADJUDICATION`、`sameVehicleClaim=false`；
- 禁止动作：`CLAIM_SAME_VEHICLE`、`FREEZE_VARIANT`、`USE_PROJECTION_AS_PRODUCTION`。

### 4.3 R-21 差异保留

| R-21 冲突 | 快照处理 |
|---|---|
| CF-01 6 个占位总成 | `isPlaceholder=true`、`canonicalName` 保留 RP-01 名、`semanticBroadening=true`；不回写名称 |
| CF-02 assemblyId 双命名空间 | 快照只用 `assemblyDefinitionId` / `assemblyInstanceId` |
| CF-03 4 个名称漂移 | `name` + `canonicalName` + `projectionName` 并列 |
| CF-04 2 个证据降级 | `evidenceProjection` 并列 R-16/R-17/RP-01，不取平均 |
| CF-05 Frame 粒度 27 vs 37 | 37 canonical + 21 FL projection，另 6 个 R-17 车架 Frame 不入本纵切 |
| CF-06 6 个父级漂移 | `projection.parentLevelMismatch` 标出，不重写 R-16 父级 |
| CF-07 14 个非零原点 | FL 夹具实际 11 个；全部 `DEMO_ASSUMPTION`，见第 8 节 |
| CF-08 卡钳支架 | `PART-40-048` 标 `VARIANT_UNDECIDED`；R-17 的 `INST-CALIPER-BRACKET-FL` 是投影专用假设 |
| CF-09 变型未对齐 | 见 4.2 |

## 5. 数量口径

R-16 的 `qtyPerCorner` 是“每角几个物理实例”，不是“每个实例自身数量”。R-27 的规则：

1. 每个 `partInstanceId` 的 `quantity.perAssembly=1`；
2. `sourceQtyPerCorner` 只保留追溯，不参与整车总数；
3. 整车总数 = 物理实例计数；
4. BOM 按父实例聚合，R-22 已生成 190 条 BOM 行；
5. 与继承总数不一致的 12 项保持 OPEN。

螺柱反例：

| 读法 | 结果 |
|---|---:|
| `20 个实例 × qtyPerCorner 5` | **100**（错） |
| 物理实例计数 | **20**（正确） |
| R-16 继承总数 | **20** |

重算后派生冲突 12 项，与 R-16 `qtyConflicts` 的 12 项完全相同：`PART-40-034/035/036/037/038/039/040/041/042/043/044/046`。`qty.auditStatus=CONSISTENT`，没有隐藏的第 13 项。

## 6. 位姿绑定矩阵（3 + 1 + 1）

| 角色 | R-21 | R-22 | R-23 | R-27 | 目标 | attachTo |
|---|---|---|---|---|---|---|
| 上摆臂 | BOUND | BOUND | BOUND | `BOUND_RIGID_PART` | `PI-20-001-FL` | PART |
| 下摆臂 | BOUND | BOUND | BOUND | `BOUND_RIGID_PART` | `PI-20-008-FL` | PART |
| 转向节 | BOUND | BOUND | BOUND | `BOUND_RIGID_PART` | `PI-20-016-FL` | PART |
| 轮毂 | BOUND | BOUND | **UNBOUND_NO_HUB_BODY** | `CANDIDATE_ROLE_BINDING` | `PI-30-006-FL` | ROLE_MARKER |
| 外拉杆端 | DEFERRED | UNBOUND | DEFERRED | `REQUIRED_DEFERRED_NO_INSTANCE` | 无 | NONE |

### 6.1 轮毂差异为什么保留

R-21 和 R-22 都把 R-18 hub 位姿按角色映射到 `PART-30-006` / `PI-30-006-FL`（独立轮毂法兰）。R-23 的 SLA 运动流没有把轮毂本体放进纵切，返回 `UNBOUND_NO_HUB_BODY`，理由是“R-16 纵切没有单独实例化的轮毂本体；`PI-30-031-FL` 是制动盘定位螺钉，不能当轮心”。

R-27 的判断：

- `PI-30-006-FL` 确实是该角色最合适的规范实例；
- 但 R-18 的 hub 位姿是 **wheelCenter + spindleAxis** 的角色位姿，不能证明它就是 `PART-30-006` 法兰的局部坐标系；
- 因此只允许 `attachTo=ROLE_MARKER`、`notARigidPartPose=true`，不把它当成第 4 个刚性零件位姿。

这不是在 4/5 与 3/5 之间取平均，而是明确两者在**语义层级**上不同。

### 6.2 外拉杆端不是“不存在”

`PART-20-075` 在 R-16 是 `DEFERRED`，但 `optionality=required`，原因只是锥柄尺寸/来源未闭合。快照给它：

```json
{
  "status": "REQUIRED_BUT_DEFERRED",
  "optionality": "required",
  "qtyVehicleTotal": 2,
  "handedness": "MIRROR_REGENERATE",
  "downstreamMustNotOmit": true
}
```

下游不得因为它没有实例就省略这个零件，也不得给它的位姿伪造一个 `PI-20-075-FL`。

### 6.3 卡钳支架不是“没有”

`PART-40-048` 的 `variantFlag=caliperFixedOrFloating` 未裁决：浮动式必有支架，固定式可能直接螺接转向节。快照标 `VARIANT_UNDECIDED`，R-17 的 `INST-CALIPER-BRACKET-FL` 只作为“假设浮动式”的投影实例，不进入 R-16 快照的 278 个规范实例。

## 7. PoseRun、修订与 DEMO 视图

### 7.1 严格 PoseRun

| 字段 | 值 |
|---|---|
| `runId` | `RUN-SLA-FL-DEMO-001` |
| `sourceRevision` | 3（R-23） |
| `snapshotRevision` | 1（R-22/R-27） |
| `status` | **`STALE`** |
| `reason` | `SOURCE_REVISION_MISMATCH` |
| `playbackAllowed` | `false` |
| `frames` | `[]` |
| `sourceFrameCount` | 9 |
| `sourceRunHash` | `d3c7fd...6732c0` |
| 力 | `N/A` / 无证据 |

`consumePoseRun(snapshot, {revision, frameId})` 的行为：

- 消费方 revision ≠ 1 → `STALE`；
- 消费方 frame ≠ `FR-VEHICLE` → `BLOCKED`；
- 消费方 revision = 1 但源 run revision = 3 → `STALE`，但提示 `demoViewAvailable=true`；
- 只有源 run 与快照 revision 一致时才可能返回 `CURRENT`（活性测试已覆盖把 R-23 `inputRevision` 临时改成 1 的情况）。

### 7.2 DEMO 运动视图

`demoMotionView` 是给工作台“能看见运动”的降级视图，不是生产结果：

- 9 帧、每帧 5 个角色；
- 每帧 3 个 `attachTo=PART` 的刚性位姿（上/下摆臂、转向节）；
- 1 个 `attachTo=ROLE_MARKER` 的轮毂角色（`PI-30-006-FL`，`notARigidPartPose=true`）；
- 1 个 `attachTo=NONE`、`published=false` 的外拉杆（保留 `observedPositionM` 供追溯）；
- `badge=DEMO_ONLY_STALE_SOURCE_REV_3`、`requiresDemoMode=true`、`publishAsCurrent=false`；
- 所有已发布位姿：m、Y-up、`scale=[1,1,1]`、4×4 刚性矩阵、行列式 +1、平移与位置一致；
- 未发布位姿：`instanceId=null`、`matrixWorld=null`。

### 7.3 R-28 的下一步

R-28 应发布绑定快照 revision 的新运动流（或显式 rebase 并给新 hash），并让外拉杆/轮毂的绑定状态与 R-21 对照表一致。在此之前，工作台只能播放带双徽标的 DEMO 视图。

## 8. Frame、单位与显示

### 8.1 Canonical 37 Frame

- 全部 `anchorStatus=UNANCHORED_UNKNOWN`、`origin=null`、`rotation=null`、`units=null`；
- 不输出任何生产显示矩阵；
- 不能因为 R-17 夹具里有 `[0.84, 0.32, 1.23]` 就把 R-16 Frame 填上数值。

### 8.2 Projection Frame 范围

R-21 在两个 R-17 夹具中共映射 **27** 个 Frame；R-27 只纳入 FL 轮端夹具的 **21** 个（R-22/R-23 使用的那一份），其余 6 个属于 R-17 vehicle-skeleton 夹具，不入本运动纵切。

非零数值原点：

- FL 夹具实际 **11** 个；
- R-21 的 `hasNonZeroNumericOrigin` 统计跨两份夹具为 **14** 个（多出 `FR-WHEEL-END-FR/RL/RR`）；
- 两者差异已登记 `R27-CF-05`，不把 11 悄悄写成 14，也不把 6 个未纳入 Frame 丢掉不报。

所有 projection Frame 标 `valueBasis=DEMO_ASSUMPTION`、`notCanonical=true`、`numericOriginUnverified=true`。

### 8.3 数值冲突

`FR-WHEEL-END-FL` 原点 `[0.84, 0.32, 1.23]` m 与 R-23 在 travel=0 的 hub 位姿 `[0.72, ~0, ~0]` m 相差：

- delta `[0.12, 0.32, 1.23]` m；
- 模长 **1.276597 m**；
- `status=DO_NOT_MERGE`。

### 8.4 mm / m 与镜像

- 工程输入 mm、运行时 m，显式换算 0.001；
- `globalScale=1`、`implicitGlobalScale=false`、`negativeScaleAllowed=false`；
- 不发布右侧位姿，不生成负缩放副本；
- R-18 M05 的独立镜像求解（leftX 0.72 / rightX -0.72）仍只是 DEMO 证据。

## 9. 几何与来源

### 9.1 几何

- 278/278 `NO_GEOMETRY`，`inspectable=false`；
- 0 个 sourced 几何、0 个可生产渲染实例；
- 仅 1 个 `DEMO_SUBSTITUTE`：

| instanceId | 别名 | 资源 | 规则 |
|---|---|---|---|
| `PI-30-006-FL` | `INST-HUB-FL` | `wheel_hub_assembly.glb` | 只能在 DEMO 徽标下显示；`copyToOtherInstances=false`；不改变 `NO_GEOMETRY` |

- `geometry.bulkCadBindingForbidden=true`；把 3 片轮端 GLB 贴到 278 实例会被 `SNAP-E-CAD-BULK` 拒绝。

### 9.2 来源

- 7 个输入文件全部有 SHA-256，`verifyInputHashes` 通过；
- R-16 的 46 个外部来源引用保持 `UNVERIFIED_REFERENCE`；
- 没有 `SOURCED`/OEM 等级；
- 伪造 `SOURCED` 但 `verificationStatus != HASH_VERIFIED` → `SNAP-E-SOURCE`；
- 字符串出现不等于来源已核验。

## 10. 冲突登记与决策

### 10.1 24 项冲突

| 来源 | 数量 | 处理 |
|---|---:|---|
| R-21 | 9 | 全部原样保留，带 `decisionRef` |
| R-22 | 10 | 全部原样保留 |
| R-27 | 5 | 新增：轮毂绑定差异、运行 revision 不匹配、13/278 覆盖差、R-26 缺失、R-17 Frame 范围 21 vs 27 |

R-27 新增冲突：

- `R27-CF-01` P0：轮毂角色绑定差异（R-21/R-22 绑定，R-23 未绑定）；
- `R27-CF-02` P1：R-23 revision 3 ≠ 快照 revision 1；
- `R27-CF-03` P1：R-21 只覆盖 13/278；
- `R27-CF-04` P1：R-26 输出缺失，冲突不自动裁决；
- `R27-CF-05` P2：R-17 Frame 范围 21 vs 27，非零原点 11 vs 14。

### 10.2 9 条 R-27 决策

| 决策 | 内容 |
|---|---|
| D-R27-01 | 快照变型采用 R-16 `VAR-R16-BOF-ICE`；R-17 `VV-A-SWB-STD` 只是投影夹具；对齐 BLOCKED |
| D-R27-02 | 严格 PoseRun STALE；轮毂只作角色标记；外拉杆必需但暂缓；DEMO 视图带徽标 |
| D-R27-03 | 278 实例 NO_GEOMETRY；37 canonical Frame 无锚点；只有 DEMO 帧有显示矩阵 |
| D-R27-04 | `PI-*` 唯一选择键；`INST-*`/`ASM-*` 只作显式投影别名；13/278 覆盖差保留 |
| D-R27-05 | 数量按物理 PI 实例；不乘 `qtyPerCorner`；12 项冲突 OPEN |
| D-R27-06 | R-21 占位/名称/父级/Frame 粒度差异保留，不改写 RP-01 |
| D-R27-07 | 来源不升级；DEMO 资产不变成 OEM；伪造来源 fail closed |
| D-R27-08 | R-26 缺失时保留全部冲突，不自动补齐 |
| D-R27-09 | 快照对 R-29 只读；R-27 不修改生产工作台 |

## 11. 覆盖范围（不假装已统一）

| 维度 | 数值 |
|---|---:|
| R-16 零件实例 | 278 |
| R-21 已映射实例 | 13 |
| R-21 未映射实例 | 265 |
| R-22 可执行纵切实例 | 4 |
| R-23 已绑定刚性角色 | 3 |
| R-27 刚性零件位姿 | 3 |
| R-27 轮毂角色标记 | 1 |
| R-27 必需但暂缓角色 | 1 |
| 有 sourced 几何的实例 | 0 |
| 有 sourced 硬点的总成实例 | 0 |
| 有 DEMO 硬点的总成实例 | 4 |
| 可生产渲染实例 | 0 |

结论：这份快照是**整车工程数据 + 局部 DEMO 运动**的只读视图，不是完整整车 CAD、真实多体动力学或已冻结生产接口。

## 12. 验证与负例

```text
node src-experiments/vehicle-snapshot-v1/run-checks.mjs
node --test src-experiments/vehicle-snapshot-v1/tests/snapshot.test.mjs
```

实跑：

- `run-checks`：0 错误、0 警告；7 个输入哈希全部匹配；
- Node 测试：**36/36 通过**（15 个正向/口径、18 个负例、3 个活性对照）；
- 关键负例：

| 类别 | 实测码 |
|---|---|
| 重复 PI | `SNAP-E-DUP-PI` |
| 数量二次乘 | `SNAP-E-QTY-DOUBLE` |
| 虚构几何 | `SNAP-E-GEOMETRY` |
| 变型冲突 | `SNAP-E-VARIANT` |
| STALE 当当前 | `SNAP-E-RUN-STALE` |
| 错误坐标/单位 | `SNAP-E-UNIT` |
| 反射/缩放矩阵 | `SNAP-E-DISPLAY` |
| 伪造 SOURCED | `SNAP-E-SOURCE` |
| 未绑定姿态被发布 | `SNAP-E-POSE-UNBOUND` |
| 批量贴 GLB | `SNAP-E-CAD-BULK` |
| INST 当规范 ID | `SNAP-E-ALIAS` |
| 丢失冲突 | `SNAP-E-CONFLICT` |
| 无 R-26 自动裁决 | `SNAP-E-R26` |
| 别名当消费键 | `SNAP-E-CONTRACT` |
| 汇总过期 | `SNAP-E-COUNTS` |
| canonical Frame 被锚定 | `SNAP-E-FRAME` |
| 丢失必需暂缓标记 | `SNAP-E-PART-DEFERRED` |
| 假设卡钳支架存在 | `SNAP-E-VARIANT` |
| 隐藏轮毂差异 | `SNAP-E-POSE-UNBOUND` |

活性对照：

1. 改 R-23 hub 位姿，DEMO 视图随之变化；
2. 把 R-23 `inputRevision` 改成 1，构建出 9 帧 `CURRENT` 严格视图并通过校验（证明 revision 规则不是写死 STALE）；
3. 从 R-22 删一个实例，快照计数变为 277，校验以 `SNAP-E-COUNTS` 拒绝“树与 R-21 覆盖不一致”。

## 13. 待 GPT-6 裁决

1. D-R22-01：`PI-*` 作为唯一命名空间是否正式冻结；
2. D-R22-07 / D-R27-05：`qtyPerCorner` 语义与 12 项数量冲突政策；
3. D-R27-01：变型 `VAR-R16-BOF-ICE` 与 `VV-A-SWB-STD` 是否允许声明候选对齐，或保持分离；
4. D-R27-02：轮毂角色位姿是否允许绑定 `PI-30-006-FL` 作为 DEMO 角色；R-28 何时提供同 revision 运行；
5. R-21 CF-01/CF-06：占位总成与父级层级规范；
6. R-21 CF-04：R-17 的证据降级是否回写 RP-01；
7. R-21 CF-07 + R27-CF-05：R-17 Frame 数值原点的 valueBasis 与范围；
8. R-26 缺失期间，是否允许工作台以“冲突保留”模式展示。

## 14. R-29 可直接执行的消费步骤

1. 读取 `fixtures/vehicle-snapshot.consumer.json`，校验主快照 SHA-256；
2. 读取 `vehicle-snapshot.json`，用 `workbenchTree` 构建 13 系统 → 37 总成实例 → 278 零件实例的对象树；
3. 节点文本统一带 `geometryStatus=NO_GEOMETRY` 徽标；选中键用 `partInstanceId`；
4. 不渲染 37 个 canonical Frame；只有 4 个 FL demo 位姿和 1 个轮毂角色标记可在 DEMO 模式下预览；
5. 播放前检查 `poseRun.status`：当前为 `STALE`，只允许 `demoMotionView` 并显示 `DEMO_ONLY_STALE_SOURCE_REV_3`；
6. 轮毂 GLB 只允许绑定 `PI-30-006-FL`，标 `DEMO_SUBSTITUTE`，不得复制；
7. 变型、冲突、必需暂缓零件分别显示 `VARIANT_NOT_ALIGNED`、`OPEN`、`REQUIRED_NOT_INSTANTIATED`；
8. 不修改快照文件；若字段不够，向 R-27 回消息补字段，不自行改语义。

## 15. 不做什么

- 不修改 `workbench-v2/`、`src/main.js`、其它模型文件；
- 不新开端口或独立页面；
- 不冻结快照 Schema；
- 不把 278 个数据节点说成 278 个 CAD；
- 不把 R-17/R-18/R-23 的 DEMO 值升级为 OEM；
- 不把 R-23 revision 3 的结果当当前快照播放；
- 不把轮毂角色标记说成已证实的法兰局部坐标系；
- 不把外拉杆说成可选或不存在。
