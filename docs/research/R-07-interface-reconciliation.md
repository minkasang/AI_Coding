# R-07｜整车数据接口冲突与兼容方案（DeepSeek）

> 状态：**SUBMITTED**（待 GPT-6 裁决；未自行冻结任何共享 Schema）
> 任务卡：`agent-workspace/agents/deepseek/tasks/R-07.md`
> 日期：2026-11-14
> 输入：R-01（Qwen4）、R-02（DeepSeek）、R-03（Gemini Flash）、R-04（Grok）、RP-01/RP-02、`AUDIT_2026-11-14` 与 `AUDIT_2026-11-14_BATCH2`
> 性质：**跨模型接口映射提案**，不是生产 Schema，不是车规认证，不是真实车型数据。

---

## 0. 结论摘要

R-02 的装配数据契约是四份研究里最完整的“身份 + 实例 + 关节 + 资产 + 验证”基线，适合作为统一候选；但它不能直接吞并另外三份研究，因为存在 **6 个 P0 冲突**：

1. **坐标/轴向**：R-03 声明 CAD `+X 右、+Y 前、+Z 上`，并映射到 WebGL `X=+0.001x, Y=+0.001z, Z=-0.001y`；现有运行时实测是 `+X 左、+Y 上、+Z 前`。同一 57.15 mm 样例点在两种映射下相差 **114.3 mm**，会把左右轮端/卡钳装反。
2. **规范 partId**：R-03 用 `SYS-30-HUB-001`，RP-01/R-02 用 `PART-30-006`；同一物理件不能有两个主键。
3. **revision 语义**：R-03 的 `revision` 是 16-hex 内容哈希，R-02 的 `revision` 是人可读不可变版本 `r001`；直接互换会让 `partId@r001` 解析失败。
4. **qty 语义**：RP-01 的 `qty=20` 是四角/整车总数，R-02 的 `qty=5` 是每个父总成实例数量；直接复制会放大 4 倍。
5. **Joint/约束类型不足**：R-04 需要定长距离约束、上点沿滑柱线、轮心高度作为输入、减振器长度作为输出；R-02 当前没有 `DISTANCE`、`POINT_ON_LINE`、`PRESCRIBED_POSITION`、`forceElement`。
6. **真实性/来源/验证三类字段混淆**：R-01 `claimedValidation`、R-03 `modeling_fidelity`、R-04 `tests`、R-02 `fidelityClaim/evidence/verification` 语义不同；把任一个直接当另一个都会过度声明。

本报告交付：

- 46 条跨模型字段映射（`docs/research/R-07-schema-mapping.example.json`）。
- 18 项冲突（6 个 P0、8 个 P1、4 个 P2）。
- 18 个可计算反例（含 R-03 的 114.3 mm 左右换侧、R-01 的 4× 数量放大、R-03 revision 断链等）。
- 15 项需要 GPT-6 裁决的问题。
- 一个小型对照校验器：`agent-workspace/agents/deepseek/tools/r07_mapping_check.mjs`；实际运行 **25/25 检查通过**。

**建议**：以 R-02 为基线，补 4 个字段/类型（`contentFingerprint`、`externalIds`、`DISTANCE`/`POINT_ON_LINE`/`PRESCRIBED_POSITION`/`forceElement`、`fidelityTarget`），统一世界坐标，明确 `qty` 语义；在这些裁决前**不冻结生产 Schema**。

---

## 1. 输入与边界

### 1.1 已读输入

| 输入 | 关键事实 |
|---|---|
| R-01 `R01-PF-0.1` | `platformFamilies`、`vehicleVariants`；`familyRef`（平台家族）、`params`（PD-WB/PD-FT/PD-RT/PD-TW）、`fixedHardpoints`（含 `immutable:true`）、`parametricDimensions`、`moduleSlots`、`claimedValidation`、`valueBasis`；mm；`PROPOSED_NOT_APPROVED` |
| R-02 `carlab.data-contract/0.1.0-proposal` | PartFamily/PartDefinition/PartVariant/PartRevision/PartInstance/Assembly/BOM/Joint/MountInterface/Material/AssetManifest/Frame/VehicleVariant；20/20 + 3/3 结构测试；Frame/partId/BOM/fidelity 仍为提案 |
| R-03 `asset-manifest.v1` | `part_id`/`revision`(16-hex)/`instances[]`/`mount_frames[]`/`mass_properties_assumption`/`modeling_fidelity`；CAD→WebGL 矩阵 `X=+0.001x, Y=+0.001z, Z=-0.001y`；9 节点 GLB extras 100% |
| R-04 `carlab.r04.kinematicsFixture.v1` | `+X 左/+Y 上/+Z 前`，m/rad；`hardpoints` 虚构夹具；SLA/麦弗逊约束模型；`drivenCoordinate=wheelCenter.y`；减振器长度是输出；21 项测试通过 |
| RP-01 `RP01-PBS-0.1` | `PART/ASSY/FAM/REF` 规范身份；一个实体一个节点；`qty` 为产品树数量；`geomBasis`/`targetLevel`；禁止预填质量/公差 |
| RP-02 `carlab.interface-graph/0.1.0-proposal` | 六类接口、端口/边、Frame、evidence/validation、render/visualOnly；42 节点/86 边 |
| 审核 | 单 Frame、`fidelity/evidence/verification` 三分、`partId/familyId/instanceId` 统一；493 件零件几何来源仍严重不足；没有单一生产 Schema |

### 1.2 边界

- 只写本任务允许的 `docs/research/R-07-*`、个人 `reports/R-07.md`、个人 `tools/` 与公共消息。
- 不修改 R-01/R-02/R-03/R-04 的文件，不改 `MASTER_PLAN`、共享 Schema、CAD/`src/`。
- 不裁决“谁的字段更权威”；只列冲突、选项、建议与证据，交 GPT-6 决定。
- 不把 R-03 的演示质量、R-04 的虚构硬点、R-02 的示例值当真实车型数据。

---

## 2. 统一候选契约（基于 R-02，最小增量）

### 2.1 身份层

```text
PartFamily(partFamilyId, RP-01 FAM-*)
  └─ PartDefinition(partId, RP-01 PART-*) ── PartVariant(variantId) ── PartRevision(partId@rNNN)
        ├─ externalIds[]        // R-03 SYS-*、pipeline ID、旧 ID
        ├─ contentFingerprint   // R-03 16-hex 内容哈希
        └─ PartInstance(instanceId, ASM-*) ── Frame / MountInterface / Joint
AssemblyDefinition(assemblyId, RP-01 ASSY-*) ── BOMLine ── PartInstance / AssemblyInstance / REF
VehicleVariant(vehicleVariantId) ── platformFamilyRef / parameters / moduleSelections
```

**最小增量**：

| 字段 | 为什么需要 | 映射来源 |
|---|---|---|
| `externalIds[]` | 保留 R-03 `SYS-30-HUB-001` 等外部 ID，同时不让它当第二主键 | R-03 `part_id`/`instance_id` |
| `contentFingerprint` | 区分“人可读 revision”与“内容哈希” | R-03 `revision` |
| `immutable` | R-01 固定硬点不可覆盖 | R-01 `fixedHardpoints[].immutable` |
| `compatibility` | R-01 `moduleSlots.options.compatibleArchitectures/Powertrains` | R-01 |
| `vehicleTotalQty` | 保留 RP-01 整车/四角总数，同时让 BOM qty 按父总成实例 | RP-01 `qty` |
| `fidelityTarget` | R-01 `claimedValidation.targetLevel` 是目标，不是已达成 | R-01 |
| `provenance` | R-04 `FICTIONAL_FIXTURE`、R-03 `DEMO_SUBSTITUTE` 必须保留 | R-03/R-04 |

### 2.2 Frame/单位层

- **世界 Frame**：`FR-VEHICLE`，`+X 左、+Y 上、+Z 前`，m，右手系。依据：`vehicleWorld.js:180-188`、`chassis.js:285-291`、R-04 `frame`。
- **工程 Frame**：`FR-ENGINEERING`，`x 前、y 左、z 上`，`p_E=[zR,xR,yR]`。
- **CAD**：`mm`；局部 z 可以是轮端轴线；实例 Frame 必须带 `sourceFrameId`、`unitScale=0.001`、rotation。
- **R-03 变换必须修正**：
  - R-03 声称：`X=+0.001x, Y=+0.001z, Z=-0.001y`；
  - 现有运行时要求：`x_R=-0.001·x_CAD, y_R=+0.001·z_CAD, z_R=+0.001·y_CAD`；
  - 同一 CAD 点 `[57.15, 0, 14] mm`：R-03 → `[0.05715, 0.014, 0] m`；正确 → `[-0.05715, 0.014, 0] m`；差 **0.1143 m**。
  - 若 R-03 的 CAD 源实际不是 `+X 右/+Y 前/+Z 上`，则必须改声明与测试，不能保留“声明与变换各说一套”。

### 2.3 Joint/约束层

在 R-02 现有类型上补：

| 新类型/字段 | 用途 | R-04 来源 |
|---|---|---|
| `DISTANCE` | 两点间定长约束（主销长度、拉杆长度、转向节三点距离） | `constraintModel.sla`、`upright three distances`、`tie-rod length` |
| `POINT_ON_LINE` | 上点沿滑柱线运动（麦弗逊） | `constraintModel.macpherson` |
| `driver.type=PRESCRIBED_POSITION` | 轮心高度作为输入 | `drivenCoordinate=wheelCenter.y` |
| `SPRING_DAMPER.forceElement=true` | 减振器长度是输出，不是刚性杆 | `shock length is output` |
| `forceElement` 标志 | 区分“运动约束”与“力元” | 同上 |

如果缺少这些，R-04 的机构会被错误地降成“固定连接 + 动画”，或把减振器当刚性杆锁死垂向自由度。

### 2.4 真实性/来源/验证层

| 字段 | 回答 | 允许值 | 不负责 |
|---|---|---|---|
| `valueBasis` | 这个数值/声明从哪来 | EVIDENCE/LOCAL_MEASUREMENT/SOURCED/DERIVED/ENGINEERING_DERIVATION/DEMO_ASSUMPTION/OPEN/DEFERRED/NOT_APPLICABLE | 不表示模型能力 |
| `evidence` | 证据等级 | EVIDENCE/ENGINEERING_DERIVATION/ASSUMPTION/OPEN | 不表示测试通过 |
| `fidelityClaim` | 实际模型能力 | FID-V/G/K/D1/D2 | 不由 evidence/verification 自动提升 |
| `fidelityTarget` | 目标能力 | FID-V/G/K/D1/D2 | 不是已达成 |
| `verification` | 测试/复核 | UNTESTED/PASS/FAIL/BLOCKED + reviewStatus | PASS≠APPROVED |
| `claimedValidation` | R-01 兼容性声明 | 只映射到 verification/fidelityTarget | 不能直接写 fidelityClaim |

---

## 3. 各模型字段清单（只列会影响映射的）

### 3.1 R-01（平台/变体）

- `platformFamilies[]`：`id`、`architectureRef`、`fixedHardpoints[]`、`parametricDimensions[]`、`moduleSlots[]`、`interfaceContracts[]`、`rules`、`propagation`。
- `fixedHardpoints[]`：`id`、`kind`、`value_mm`、`valueBasis`、`designDecision`、`immutable`。
- `parametricDimensions[]`：`id`（PD-WB/PD-FT/…）、`min/max`、`unit=mm`、`derivation`、`affects`。
- `moduleSlots[]`：`id`、`selectionKind`（SWAPPABLE/PARAMETRIC_REGENERATE）、`interfaceContractRef`、`rp01Ref`、`options[]`（`compatibleArchitectures/Powertrains`）。
- `vehicleVariants[]`：`id`、`familyRef`（PF-*）、`powertrain`、`params`、`moduleSelections`、`claimedValidation`（geometricCompatibility/kinematicCompatibility/massProperties/strengthAndDurability/regulatoryCompliance/targetLevel）、`expected`/`derivedExpected`。
- `valueBasis`：DEMO_ASSUMPTION/LOCAL_MEASUREMENT/SOURCED/OPEN。
- **注意**：`familyRef` 是平台家族，不是 RP-01 零件家族；R-02 之前用 `platformFamilyRef`，R-01 实际字段是 `familyRef`。这是命名冲突，不是字段缺失。

### 3.2 R-03（资产）

- `parts[]`：`part_id`（SYS-*）、`family`、`revision`（16-hex）、`assets.step/stl`、`mass_properties_assumption`、`mount_frames[]`、`modeling_fidelity`、`instances[]`（`instance_id`、`transform_mm`）、`instantiation_mode`。
- `mount_frames[]`：`frame_id`、`origin_mm`、`axis`、`mating_specs`（PCD/N/d_h）。
- `coordinate_conventions`：CAD +X 右/+Y 前/+Z 上/mm；Blender +Y 上/-Z 前/m；browser +Y 上/+Z 前/m。
- `composite_assets`：`assembly_step`、`assembly_glb`、`glb_file_size_bytes`。
- `cache_manifest`：`fingerprint`、`volume_mm3`、`bbox_size_mm`、`updated_at`。
- **注意**：`revision` 是内容哈希，不是 `r001`；`mount_frames` 把 Frame 与 MountInterface 混在一起；`modeling_fidelity` 是包络/名义圆柱，不是 FID-G。

### 3.3 R-04（悬架）

- `frame`：`x=left, outboard on left wheel`、`y=up`、`z=forward`、m/rad。与 R-02 世界 Frame 一致。
- `hardpoints`：`upperAxisA/B`、`upperBall`、`lowerAxisA/B`、`lowerBall`、`tieInner/Outer`、`wheelCenter`、`spindleAxis`、`shockChassis`、`diffOutput`、`strutTop`。
- `constraintModel`：`sla`、`macpherson`、`shock`（长度是输出）、`drivenCoordinate=wheelCenter.y`。
- `sweepTravel_m`、`slaSweep`、`macphersonSweep`、`tests`（21 项，passCount=21）。
- `provenance=FICTIONAL_FIXTURE`、`notAProductionVehicle=true`。
- **注意**：硬点是虚构；约束不是 PartDefinition/PartInstance/Joint 结构；需要 R-02 新增 `DISTANCE`/`POINT_ON_LINE`/`PRESCRIBED_POSITION`/`forceElement`。

### 3.4 RP-01 / RP-02

- RP-01：`PART/ASSY/FAM/REF` 规范身份；一个实体一个节点；`qty` 是产品树数量；`geomBasis`/`targetLevel`；禁止预填质量/公差。
- RP-02：端口/边、`Frame`、`evidence.level`、`validation.requiredLevel`、`render.visualOnly`；`validation.requiredLevel` 实际是证据等级，不是验证状态。

---

## 4. 映射分组（完整 46 条在 JSON）

### 4.1 身份/版本

| 映射 | 来源 → 目标 | 结论 |
|---|---|---|
| M-14—M-17 | RP-01 `PART/ASSY/FAM/REF` → R-02 规范身份 | 直接沿用 |
| M-21 | R-03 `SYS-*` → R-02 `partId` + `externalIds` | R-03 ID 只能作 externalId |
| M-22 | R-03 `revision`（16-hex）→ `contentFingerprint` | 不能替换 `revision` |
| M-18 | RP-01 `qty` → `BOMLine.qty` + `vehicleTotalQty` | 20 是四角总数，单角 qty=5 |
| M-24 | R-03 `#inst_N` → R-02 `INST-*` | 迁移映射，不双主键 |
| M-29 | R-03 `assembly_id` → RP-01 `ASSY-30-001` + externalId | 总成身份统一 |

### 4.2 平台/变体

| 映射 | 来源 → 目标 | 结论 |
|---|---|---|
| M-01—M-03 | R-01 `platformFamilies/vehicleVariants/params` → R-02 `VehicleVariant` | mm；`familyRef`→`platformFamilyRef` |
| M-04 | R-01 `fixedHardpoints[]` → R-02 `Frame`+`MountInterface` | `immutable` 需新增 |
| M-05 | R-01 `parametricDimensions[]` → `parameterRules`/`variantDependencies` | min/max/derivation/affects |
| M-06 | R-01 `moduleSlots/options` → `compatibility` | 架构/动力兼容 |
| M-07 | R-01 `claimedValidation` → `verification`+`fidelityTarget` | targetLevel≠fidelityClaim |
| M-09 | R-01 `derivedExpected` → `derivedDimensions`+`testRefs` | 派生值不是参数 |
| M-12 | R-01 `propagation/affects` → `variantDependencies` | 与 RP-02 影响图对齐 |

### 4.3 坐标/Frame

| 映射 | 来源 → 目标 | 结论 |
|---|---|---|
| M-28 | R-03 `coordinate_conventions` → R-02 Frame | 必须修正符号；见 C-01 |
| M-32 | R-04 `frame` → `FR-VEHICLE` | 完全一致 |
| M-33 | R-04 `hardpoints` → `Frame` | `DEMO_ASSUMPTION`+`FICTIONAL_FIXTURE` |
| M-42 | RP-02 `Frame` → R-02 `Frame` | 同契约 |
| M-25 | R-03 `mount_frames` → `Frame`+`MountInterface` | 拆分；缺 CB/fit 标 OPEN |

### 4.4 Joint/约束

| 映射 | 来源 → 目标 | 结论 |
|---|---|---|
| M-34/M-35 | R-04 摆臂圆/主销/拉杆 → `REVOLUTE`+`DISTANCE` | 新增 DISTANCE |
| M-36 | R-04 `wheelCenter.y` → `driver PRESCRIBED_POSITION` | 新增 driver |
| M-37 | R-04 减振器 → `SPRING_DAMPER.forceElement=true` | 不是刚性杆 |
| M-38 | R-04 麦弗逊滑柱 → `POINT_ON_LINE`/`PRISMATIC` | 新增 POINT_ON_LINE |
| M-45 | RP-02 机械边 → `Joint`+`MountInterface` | 一条边可对应两者，不重复 |

### 4.5 资产/真实性

| 映射 | 来源 → 目标 | 结论 |
|---|---|---|
| M-23 | R-03 assets/composite → `AssetManifest` | 补 sha256/bytes/unitScale |
| M-26 | R-03 `mass_properties_assumption` → `Material`/massProperties | DEMO_ASSUMPTION，不 SOURCED |
| M-27 | R-03 `modeling_fidelity` → `fidelityClaim` | envelope/nominal → FID-V |
| M-30 | R-03 cache fingerprint → `contentFingerprint`/cacheMetadata | 不是工程 revision |
| M-31 | R-03 GLB extras → render metadata | 不是 B-rep |
| M-44 | RP-02 `render.visualOnly` → `mappingStatus`/fidelity | 渲染不等于工程 |
| M-39—M-41 | R-04 tests/derived → verification/derivedDimensions | FID-K 仅夹具 |
| M-43 | RP-02 `validation.requiredLevel` → `evidence.requiredLevel` | 重命名；verification 独立 |

---

## 5. 冲突登记（18 项；完整表在 JSON）

### 5.1 P0（6 项）

| ID | 冲突 | 观察 | 建议 |
|---|---|---|---|
| C-01 | 坐标/轴向与 R-03 变换 | R-03 CAD +X 右/+Y 前/+Z 上，映射 `X=+0.001x, Y=+0.001z, Z=-0.001y`；运行时 +X 左/+Y 上/+Z 前 | 以运行时为世界；R-03 改 `x_R=-0.001x_CAD, y_R=+0.001z_CAD, z_R=+0.001y_CAD`；补正反测试 |
| C-02 | 规范 partId | R-03 `SYS-30-HUB-001` vs RP-01 `PART-30-006` | RP-01 为唯一主键；R-03 作 externalId |
| C-03 | revision vs 内容哈希 | R-03 16-hex vs R-02 `r001` | revision=`rNNN`；contentFingerprint=16-hex；sha256=64-hex |
| C-04 | qty 语义 | RP-01 20（四角）vs R-02 5（单角） | BOM qty per parent + vehicleTotalQty |
| C-05 | Joint 类型不足 | R-04 需 DISTANCE/POINT_ON_LINE/PRESCRIBED_POSITION/forceElement | 扩展 R-02 Joint/driver；减振器标 forceElement |
| C-06 | 真实性字段混淆 | R-01 claimedValidation、R-03 modeling_fidelity、R-04 tests、R-02 fidelity/evidence/verification | 固定三字段；claimed/modeling/tests 只映射 verification/evidence |

### 5.2 P1（8 项）

| ID | 冲突 | 建议 |
|---|---|---|
| C-07 | `familyRef` 同名异义（RP-01 零件家族 vs R-01 平台家族） | 改名 `partFamilyRef` vs `platformFamilyRef` |
| C-08 | R-03 MountFrame 混合 Frame 与 MountInterface | 拆分；`mating_specs`→fastenerPattern；缺 CB/fit 标 OPEN |
| C-09 | valueBasis 三套枚举 | 合并并集 + 别名；不自动等同等级 |
| C-10 | R-03 modeling_fidelity 不能当 FID-G | envelope/nominal → FID-V |
| C-11 | R-03 质量属性是假设 | 标 DEMO_ASSUMPTION；材料标准/实测才升级 |
| C-12 | R-04 FICTIONAL_FIXTURE 不能进生产 | `DEMO_ASSUMPTION` + `provenance=FICTIONAL_FIXTURE` |
| C-13 | R-03 instanceId 格式 | `#inst_N` 作 externalId；R-02 `INST-*` 为规范 |
| C-14 | R-01 targetLevel vs fidelityClaim | targetLevel→fidelityTarget；PASS→verification |

### 5.3 P2（4 项）

| ID | 冲突 | 建议 |
|---|---|---|
| C-15 | R-03 assembly_id vs RP-01 ASSY | 映射 RP-01 + externalId |
| C-16 | R-01 derivedExpected vs R-02 derivedDimensions | 派生值 + testRefs，不当参数 |
| C-17 | RP-02 validation.requiredLevel 命名 | 重命名 evidence.requiredLevel；verification 独立 |
| C-18 | RP-01 REF vs R-03 instances | REF 唯一跨系统指针；instances 只作物理放置 |

---

## 6. 反例与数值验证

对照校验器：`agent-workspace/agents/deepseek/tools/r07_mapping_check.mjs`
运行：

```bash
node agent-workspace/agents/deepseek/tools/r07_mapping_check.mjs \
  docs/research/R-07-schema-mapping.example.json \
  agent-workspace/agents/deepseek/reports/R-07-mapping-check-results.json
```

实际结果：`EXIT=0`；46 条映射、18 项冲突（6 P0）、18 个反例、15 项裁决请求、25/25 检查通过。

### 6.1 关键反例

| 反例 | 输入/观察 | 错误后果 |
|---|---|---|
| CE-01 | R-03 声称 `[57.15,0,14] mm → [0.05715,0.014,0] m`；正确应为 `[-0.05715,0.014,0] m` | 左右换侧 **114.3 mm**（= PCD 半径×2） |
| CE-02 | R-03 把 CAD +Y 前向映射到 WebGL `-Z`；运行时 +Z 前 | 车头方向反转 |
| CE-03 | R-03 16-hex `revision` 直接当 R-02 `revision` | `partId@r001` 解析失败 |
| CE-04 | R-03 `SYS-30-HUB-001` 直接当规范 `partId` | 与 `PART-30-006` 双主键 |
| CE-05 | RP-01 `qty=20` 直接用于单角 BOM | 数量放大 **4×**（应单角 5） |
| CE-06 | R-04 约束缺 `DISTANCE`/`POINT_ON_LINE` | 杆长丢失；麦弗逊被做成双叉臂 |
| CE-07 | R-04 减振器当刚性杆 | 锁死垂向自由度 |
| CE-08 | R-01 `targetLevel=GEOMETRY` 当 `fidelityClaim` | 目标当已达成 |
| CE-09 | R-03 `GEOMETRIC_ENVELOPE_ONLY` 当 FID-G | 包络当精确几何 |
| CE-10 | R-04 `FICTIONAL_FIXTURE` 当 SOURCED | 虚构夹具进入生产 |
| CE-11 | R-03 质量假设当 SOURCED | 质量/惯量污染 |
| CE-12 | RP-01 零件 `familyRef` 与 R-01 平台 `familyRef` 合并 | 家族类型错配 |
| CE-13 | R-01 targetLevel=GEOMETRY 当 FID-D2 | 过度声明动力学 |
| CE-14 | R-03 16-hex revision 与 R-02 r001 混用 | 版本引用断裂 |
| CE-15 | R-04 provenance 丢失 | 夹具当生产数据 |
| CE-16 | R-04 轮心高度缺 PRESCRIBED_POSITION | 求解器不知道输入 |
| CE-17 | R-02 qty 缺 vehicleTotalQty | 丢失整车总数 |
| CE-18 | R-03 MountFrame 不拆分 | PCD/CB/公差无法校验 |

### 6.2 为什么这些不是“文字游戏”

- CE-01、CE-05、CE-06/07 都有可计算的数值或自由度后果；不是术语偏好。
- CE-01 的 114.3 mm 正好是 PCD 半径的两倍；不是任意误差。
- CE-05 的 4× 来自 20 个/四角 ÷ 5 个/单角；可直接复算。
- CE-06/07 的后果是运动学自由度变化，不是命名问题。
- CE-08/09/10/11 的后果是证据等级被抬高，属于“真实性声明”错误。

---

## 7. 需要 GPT-6 裁决的问题

| ID | 问题 | 建议 | 阻塞 |
|---|---|---|---|
| D-01 | 世界 Frame 是否采用现有运行时 `+X 左/+Y 上/+Z 前`，要求 R-03 修正变换？ | 是 | 所有左右/前后零件方向 |
| D-02 | 规范 `partId` 是否以 RP-01 `PART-*` 为唯一主键？ | 是；R-03 作 externalId | BOM/装配/变更 |
| D-03 | `revision` 与内容哈希如何分离？ | `rNNN` + `contentFingerprint` + 文件 sha256 | 版本引用/缓存 |
| D-04 | `qty` 是否采用每个父总成实例数量，整车总数另记？ | 是 | 5 vs 20 螺柱 |
| D-05 | 是否扩展 `DISTANCE`/`POINT_ON_LINE`/`PRESCRIBED_POSITION`/`forceElement`？ | 是 | 悬架运动学/减振器 |
| D-06 | 是否固定 `fidelityClaim/fidelityTarget`、`evidence`、`verification` 三字段？ | 是 | 真实性/验收声明 |
| D-07 | `familyRef` 是否改名 `partFamilyRef` / `platformFamilyRef`？ | 是 | 平台/零件家族 |
| D-08 | R-03 MountFrame 是否拆成 Frame + MountInterface？ | 是 | PCD/CB/公差 |
| D-09 | R-03 envelope/nominal 是否只能到 FID-V？ | 是 | 资产真实性 |
| D-10 | R-03 质量假设是否标 DEMO_ASSUMPTION？ | 是 | 质量/惯量 |
| D-11 | R-04 FICTIONAL_FIXTURE 是否保留 provenance、只用于回归？ | 是 | 生产硬点 |
| D-12 | R-03 `#inst_N` 是否映射到 R-02 `INST-*`？ | 是 | 实例选择/BOM |
| D-13 | R-01 `targetLevel` 是否映射到 `fidelityTarget`？ | 是 | 变体真实性 |
| D-14 | RP-02 `validation.requiredLevel` 是否重命名？ | 是；保留 0.1.0 别名 | 接口图/契约一致 |
| D-15 | 以上裁决前是否冻结任何生产 Schema？ | 否 | 生产 Schema/批量资产 |

---

## 8. 不能冻结/不能声称的内容

- 不能冻结生产 Schema；本报告只是候选映射。
- 不能把 R-03 的 493 件/演示零件当真实几何；审核已指出可核实尺寸严重不足。
- 不能把 R-04 的虚构硬点当量产悬架参数；`FICTIONAL_FIXTURE` 必须保留。
- 不能把 R-03 的质量/密度假设当材料实测。
- 不能把 GLB `extras` 100% 当 B-rep/配合验证。
- 不能把 R-01 `claimedValidation=PASS` 当独立验收或 `fidelityClaim`。
- 不能把 R-02 的示例 `DEMO_SUBSTITUTE` 当 `PART-30-006` 真实几何。
- 不能在未做 CAD 干涉、K&C、材料/热/疲劳之前声称整车工程正确。

---

## 9. 与 R-02 / RP-01 / RP-02 / RP-03 的关系

- **R-02**：作为基线；需补 `externalIds`、`contentFingerprint`、`immutable`、`compatibility`、`vehicleTotalQty`、`fidelityTarget`、`provenance`、`DISTANCE`/`POINT_ON_LINE`/`PRESCRIBED_POSITION`/`forceElement`。
- **RP-01**：规范身份/REF/qty/geomBasis 不变；R-02 需要把 qty 语义写清。
- **RP-02**：Frame 直接复用；`validation.requiredLevel` 重命名并拆分 verification；机械边 ↔ Joint+MountInterface 一对一/一对二映射。
- **RP-03**：FID-V/G/K/D1/D2 作为 `fidelityClaim`/`fidelityTarget`；R-03 envelope → FID-V；R-04 夹具 → FID-K。
- **R-01**：`familyRef`→`platformFamilyRef`；`params`→`parameters`；`claimedValidation`→verification/target；`fixedHardpoints`→Frame+MountInterface；`moduleSlots`→compatibility。
- **R-03**：part_id/revision/instance/mount_frames/asset manifest 全部需要映射；坐标变换必须修正。
- **R-04**：hardpoints→Frame；constraintModel→Joint 扩展；tests→verification；fiction provenance 保留。

---

## 10. 下一步

1. GPT-6 对 D-01—D-06 先做 P0 裁决；尤其 D-01（坐标）、D-02/D-03（身份/版本）、D-05（Joint 扩展）。裁决后由 R-07 映射表生成 `carlab.interface-reconciliation/0.2.0` 候选。
2. 选一个真实纵切样板（轮端/制动/悬架角）把 R-02 的 Part/Instance/Frame/Joint、R-03 的资产、R-04 的运动学放进同一份夹具；先做 FID-G/FID-K，不声称 FID-D2。
3. 向 Gemini/Grok 发送公共消息确认 CAD 轴/part_id/revision、R-04 约束和减震器物性；在收到回复前保持 OPEN。
4. 不冻结生产 Schema，不批量生成 493 件零件。

---

## 附录 A：文件与复现

| 文件 | 作用 |
|---|---|
| `docs/research/R-07-interface-reconciliation.md` | 本报告 |
| `docs/research/R-07-schema-mapping.example.json` | 46 条映射、18 项冲突、18 个反例、15 项裁决 |
| `agent-workspace/agents/deepseek/tools/r07_mapping_check.mjs` | 对照校验器 |
| `agent-workspace/agents/deepseek/reports/R-07-mapping-check-results.json` | 实跑结果 |
| `agent-workspace/agents/deepseek/reports/R-07.md` | 个人主任务回报 |
| `agent-workspace/shared/messages/MSG-20261114-*-deepseek-to-*.md` | 跨模型消息 |

复现：

```bash
node agent-workspace/agents/deepseek/tools/r07_mapping_check.mjs \
  docs/research/R-07-schema-mapping.example.json \
  agent-workspace/agents/deepseek/reports/R-07-mapping-check-results.json
# 期望 EXIT=0；25/25 检查通过
```

## 附录 B：来源

- R-01：`docs/research/R-01-platform-family-report.md`、`R-01-platform-family-example.json`
- R-02：`docs/research/R-02-data-contract-report.md`、`R-02-example-assembly.json`
- R-03：`docs/research/R-03-cad-asset-pipeline-report.md`、`R-03-asset-manifest.example.json`、`docs/planning/evidence/R-03-pipeline-evidence.json`
- R-04：`docs/research/R-04-suspension-physics-report.md`、`R-04-kinematics-fixture.json`
- RP-01/RP-02：`docs/planning/reports/RP-01-vehicle-product-tree.md`、`docs/planning/evidence/RP-01-tree-*.json`、`docs/planning/reports/RP-02-interface-graph.md`
- 审核：`docs/command/reviews/AUDIT_2026-11-14.md`、`AUDIT_2026-11-14_BATCH2.md`
- 运行时坐标：`src/physics/vehicleWorld.js:180-188`、`src/parts/chassis.js:285-291`
