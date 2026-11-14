# R-02｜汽车零件、装配、运动副和车型数据契约研究（DeepSeek）

> 状态：**SUBMITTED**（待 GPT-6 审核；未自行 approved）
> 任务卡：`agent-workspace/agents/deepseek/tasks/R-02.md`
> 接续：已验收的 RP-02 跨系统接口研究；对齐 RP-01 `RP01-PBS-0.1` 与 R-01 `R01-PF-0.1`（后者仍为 `PROPOSED_NOT_APPROVED`）
> 日期：2026-11-14
> 性质：**数据契约设计稿（PROPOSAL）**，不是生产 Schema，不是量产零件标准，也不是任何真实车型的制造依据。
> 证据分级：`EVIDENCE` / `ENGINEERING_DERIVATION` / `DEMO_ASSUMPTION` / `OPEN` / `DEFERRED` / `NOT_APPLICABLE`。

---

## 0. 一句话结论

R-02 的目标不是“把零件画得更像”，而是让不同 AI 做出的螺栓、轮毂、悬架能被同一套规则**识别、引用、装配、替换和拒绝**。本报告给出：

- 一套以 RP-01 真实 `PART/ASSY/FAM/REF` 身份为骨架的实体模型：`PartFamily → PartDefinition → PartVariant → PartRevision → PartInstance`，以及 `AssemblyDefinition/AssemblyInstance`、`Joint`、`MountInterface`、`Material`、`AssetManifest`、`Frame`、`VehicleVariant`。
- 一套 **mm（CAD）→ m（运行时）** 的显式 Frame/单位/镜像规则；现有浏览器实测坐标是 **+X 左、+Y 上、+Z 前**。
- 一套不锁死 build123d 或 Cannon 的中性 Joint 抽象，以及 STEP/STL/GLB 的资产 manifest 规则。
- 一个使用 RP-01 真实 ID 的示例装配：**BOM → 轮毂法兰 → 5 个车轮螺柱 → 制动盘**，PCD 114.3 mm，5 个独立实例共享同一 `partId@revision`。
- 一个可运行校验器：基础示例 **0 错误**；**20/20** 自动用例通过；**3/3** 个刻意错误的 JSON 输入被预期错误码拒绝。

最重要的边界：**Schema 通过 ≠ 几何正确，更不等于物理正确。** 本报告只验证“声明是否自洽、引用是否完整、单位/坐标/配合声明是否匹配”；真实孔位、干涉、质量、强度、热、装配顺序必须靠 CAD B-rep / 实测 / 仿真，另行验证。

---

## 1. 输入、边界与既有成果

### 1.1 已核对的输入

| 输入 | 用途 | 关键事实 |
|---|---|---|
| `docs/planning/evidence/RP-01-tree-*.json` / `RP-01-vehicle-product-tree.md` | 身份与产品树 | `RP01-PBS-0.1`；ID 规则 `VEH/SYS/SUB/ASSY/PART/FAM/DAT/REF`；一个实体一个规范节点；其他系统用 REF；`familyRef` 必须指向 SYS-130 的 FAM；禁止预填质量/公差数值 |
| `docs/research/R-01-platform-family-example.json` / `R-01-platform-family-report.md` | 平台/变型字段 | `R01-PF-0.1`，`PROPOSED_NOT_APPROVED`；`PD-WB/PD-FT/PD-RT/PD-TW`、`FH-01..05`、`MS-*`、`VV-A-SWB-STD`；`platformFamilyRef` 在 vehicleVariants 中尚未显式出现 |
| `docs/planning/evidence/RP-02-interface-graph.example.json` / `RP-02-interface-graph.md` | 接口/Frame/证据 | 端口-边-能力、Frame、evidence/validation、工程接触 vs 渲染接触；42 节点/86 边；坐标仍为提案 |
| `docs/planning/evidence/RP-03-fidelity-matrix.json` | 真实性词汇 | `FID-V/FID-G/FID-K/FID-D1/FID-D2`；与 MASTER_PLAN 的 `VISUAL/GEOMETRY/KINEMATIC/DYNAMIC` 不是同一维度 |
| `docs/command/reviews/AUDIT_2026-11-14.md` | 审核 P0 冲突 | 单 Frame、`fidelity/evidence/verification` 三分、`partId/familyId/instanceId` 身份统一 |
| `cad/experiments/hello_flange/params.json` / `out/hello_flange_metadata.json` | 真实资产样例 | 148 mm 外径、16 mm 厚、PCD 114.3 mm、CB 67.1 mm、5 孔、孔径 14.5 mm；STEP/STL/GLB 存在；**这是演示法兰，不是 PART-30-006 的真实几何** |
| `src/physics/vehicleWorld.js:180-188`、`src/parts/chassis.js:285-291` | 运行时坐标实测 | FL(+X,+Z)、FR(-X,+Z)、RL(+X,-Z)、RR(-X,-Z)；即 +X 左、+Y 上、+Z 前 |
| `src/specs.js` | 演示尺寸 | wheelbase 2.46 m、halfTrack 0.84 m；仅作演示，不是量产参数 |

### 1.2 明确不做

- 不修改 `src/`、CAD 源、`MASTER_PLAN.md`、共享 schema 或其他模型任务卡。
- 不建立未审定的生产 `schema/` 目录；本报告只给设计稿和校验原型。
- 不把 `hello_flange` 演示法兰冒充 `PART-30-006` 的真实几何；示例中明确标 `DEMO_SUBSTITUTE`。
- 不为材料密度/弹性模量/强度、螺栓预紧、制动盘尺寸、卡钳活塞面积等填写没有来源的数值；一律 `null + OPEN`。
- 不声称 R-01 的平台家族字段已冻结；`platformFamilyRef` 的缺失/命名按待对齐项处理。

---

## 2. 实体模型与生命周期

### 2.1 实体总览

| 实体 | 回答的问题 | 身份键 | 关键引用 | 不应当成 |
|---|---|---|---|---|
| `PartFamily` | 这是哪一类可复用件？ | `familyId`（RP-01 FAM） | `parameterSchema`、`allowedVariants` | 不是具体零件，不是实例 |
| `PartDefinition` | 这个零件的规范定义是什么？ | `partId`（RP-01 PART） | `familyRef`、`variants`、`localFrameId`、`mounts`、`joints` | 不是放置实例，不是网格名 |
| `PartVariant` | 同一零件的哪个可选规格？ | `variantId` | `partId`、`revision`、`parameters` | 不是独立零件身份；左右/尺寸变体可在此表达 |
| `PartRevision` | 这个定义在哪个版本？ | `revisionId = partId@revision` | `variantId`、`assetRef`、`verification` | 不是可变草稿；RELEASED 后应不可变 |
| `PartInstance` | 这个零件被放在哪里？ | `instanceId` | `partRef`、`variantId`、`assemblyInstanceId`、`frameId` | 不是几何定义；多实例共享几何，不共享变换 |
| `AssemblyDefinition` | 这个总成的拓扑/BOM 是什么？ | `assemblyId`（RP-01 ASSY） | `bomLineIds`、`revision` | 不是放置实例，不是 REF |
| `AssemblyInstance` | 这个总成被放在哪里？ | `assemblyInstanceId` | `assemblyRef`、`parentAssemblyInstanceId`、`frameId` | 不是定义；可有多个实例 |
| `Joint` | 两个实例之间怎样约束运动？ | `jointId` | `frameA/frameB`、`type`、`axis*`、`limits` | 不是 build123d/Cannon 的 API 对象本身 |
| `MountInterface` | 两个零件怎样贴合/紧固？ | `mountId` | `frameA/frameB`、`pattern`、`pilot`、`fasteners` | 不是“网格贴合”；不是 Joint |
| `Material` | 材料属性是什么？ | `materialId` | `properties`、`sources` | 不是零件；未知值必须 null |
| `AssetManifest` | STEP/STL/GLB 怎样对应到零件？ | `assetId` | `partRef`、`sourceUnits`、`hash`、`transform` | 不是工程 B-rep 本体；GLB 不是 CAD 源 |
| `Frame` | 坐标/轴向/公差是什么？ | `frameId` | `parentFrameId`、`origin`、`rotation`、`units` | 不是渲染 Transform 的别名 |
| `VehicleVariant` | 这是哪套平台/车型配置？ | `vehicleVariantId` | `platformFamilyRef`、`parameters`、`moduleSelections` | 不是零件；不得用 `mesh.scale` 实现 |

### 2.2 身份规则（沿用 RP-01，不另造）

1. **一个实体零件一个规范节点**：`PART-30-006` 只在 SYS-30 的规范树中定义一次；SYS-40/SYS-20 需要它时用 `REF`，不复制实体。
2. **`partId` 与 `instanceId` 不同**：`partId` 是定义，`instanceId` 是放置。5 个车轮螺柱共享 `PART-30-009@r001`，但必须有 `INST-STUD-FL-1..5` 五个实例。
3. **`partId@revision` 唯一**：`revisionId` 必须等于 `partId@revision`；实例钉住具体 revision，不能引用浮动 `rLatest`。
4. **`familyRef` 只能是 FAM**：`PART-30-009.familyRef = FAM-130-007`；指向 `PART-30-001` 是错误（DC-E006）。
5. **`qty` 是每个父总成实例的数量**：`BL-30-002-STUD.qty=5` 与 5 个 `instanceIds` 必须一致（DC-E008）；整车总数量另记，不用 `qty` 冒充。
6. **REF 不是实体**：`REF-30-001` 指向 `ASSY-40-009@r001`；REF 不能再指向 REF，不能带几何/BOM（DC-E005）。
7. **功能/网络/环境节点不带 partId**：`NETWORK`/`ENVIRONMENT`/`HUMAN_INPUT` 不是零件；控制器若是实体 ECU 才可有 partId。
8. **左右镜像必须显式**：镜像件可以是独立 `partId`，或同一 `partId` 的 `mirror` 实例；必须有 `mirror.handednessFlip=true`、`mirrorOf*`，禁止用 `scale.x=-1` 伪造。

### 2.3 生命周期

```text
DRAFT → REVIEWED → RELEASED → DEPRECATED
```

- `DRAFT`：可编辑；示例全部是 DRAFT。
- `REVIEWED`：内容冻结，待工程/独立验证。
- `RELEASED`：不可变；任何修改产生新 revision。
- `DEPRECATED`：不再新选，但历史实例仍可解析。
- `verification.status`（UNTESTED/PASS/FAIL/BLOCKED）与 `reviewStatus`（NOT_REVIEWED/PENDING/APPROVED/REJECTED）分开；**PASS 不等于 APPROVED**。
- `fidelityClaim`（FID-V/G/K/D1/D2）是模型能力声明，不由 evidence 或 verification 自动提升。

---

## 3. 字段层级清单

> 下表中的“必填”指该实体在自己的 `kind` 下必须有；“单位”为 `null` 表示非数值/枚举字段。默认值只用于读取兼容，不用于伪造数值。

### 3.1 公共信封（所有实体共用）

| 字段 | 必填 | 类型 | 单位 | 默认 | 约束/错误码 |
|---|---|---|---|---|---|
| `status` | 是 | enum | — | `DRAFT` | DRAFT/REVIEWED/RELEASED/DEPRECATED |
| `valueBasis` | 建议 | enum | — | `OPEN` | SOURCED/LOCAL_MEASUREMENT/DERIVED/DEMO_ASSUMPTION/ENGINEERING_DERIVATION/EVIDENCE/OPEN/DEFERRED/NOT_APPLICABLE；非法 → DC-E060 |
| `evidence` | 建议 | enum | — | `OPEN` | EVIDENCE/ENGINEERING_DERIVATION/ASSUMPTION/OPEN |
| `fidelityClaim` | 建议 | enum | — | `FID-V` | FID-V/G/K/D1/D2；高等级未验证 → DC-W004 |
| `verification` | 是（revision/assembly） | object | — | `{status:UNTESTED,reviewStatus:NOT_REVIEWED,testRefs:[]}` | PASS 无 testRefs → DC-E064 |
| `sources` | 条件 | string[] | — | `[]` | SOURCED 必须非空 → DC-E061 |
| `unknowns` | 建议 | string[] | — | `[]` | 指向 `U-*`；OPEN 数值必须 null → DC-E062 |

### 3.2 PartFamily

| 字段 | 必填 | 类型 | 单位 | 约束/错误码 |
|---|---|---|---|---|
| `familyId` | 是 | string | — | RP-01 FAM；空/重复 → DC-E001/E002 |
| `name` / `partClass` | 是 | string | — | 与 RP-01 家族一致 |
| `parameterSchema` | 是 | array | — | 每个参数有 name/unit/type；用于生成变体 |
| `allowedVariants` | 否 | string[] | — | 每个 variant 必须存在 |
| `externalStandards` | 否 | string[] | — | 只写已核对的标准号；不得冒充全文 |

### 3.3 PartDefinition

| 字段 | 必填 | 类型 | 单位 | 约束/错误码 |
|---|---|---|---|---|
| `partId` | 是 | string | — | RP-01 PART；空 → DC-E001 |
| `kind` | 是 | `part` | — | 与 assembly 冲突 → DC-E009 |
| `name` / `partClass` | 是 | string | — | `partClass` 建议枚举：rotating/structure/fastener/friction/housing/seal/bearing/spring/sensor/fluid/... |
| `familyRef` | 否 | string/null | — | 非空必须是 FAM → DC-E006 |
| `geometryBasis` | 是 | enum | — | SOURCED/NEEDS_MEASUREMENT/DEMO_ASSUMPTION/DEFERRED/NOT_APPLICABLE（沿用 RP-01 `geomBasis`） |
| `defaultVariantId` / `variants` | 是 | string / string[] | — | 至少一个；variant.partId 必须回指 |
| `localFrameId` | 是 | string | — | 必须是 `PART_LOCAL` Frame → DC-E020 |
| `materialRef` | 否 | string/null | — | 必须存在；未知材料用 null + OPEN，不填假密度 |
| `mounts` / `joints` / `assets` | 否 | string[] | — | 每个引用必须存在 → DC-E003 |
| `parameters` | 否 | object | 按参数 | 放在 variant 上；不要在不同 variant 间共享可变对象 |

### 3.4 PartVariant

| 字段 | 必填 | 类型 | 单位 | 约束/错误码 |
|---|---|---|---|---|
| `variantId` | 是 | string | — | 唯一 |
| `partId` | 是 | string | — | 必须存在 → DC-E003 |
| `revision` | 是 | string | — | 必须解析到 `partId@revision` → DC-E003/E007 |
| `parameters` | 是 | object | 每参数自带 unit | 数值必须有单位（DC-E063）；单位必须可识别（DC-E021）；SOURCED 必须有 sources（DC-E061）；OPEN 必须 null（DC-E062） |
| `applicableVehicleVariants` | 否 | string[] | — | 与 R-01 vehicleVariants 对齐；不存在的变体只警告/待对齐 |
| `evidence` / `valueBasis` / `sources` / `unknowns` | 建议 | — | — | 同上 |

示例：`V-PART-30-006-5X1143` 的 `pcdMm=114.3`、`holeCount=5`、`centerBoreMm=67.1`、`boltHoleMm=14.5` 全部标 `DEMO_ASSUMPTION`，来源 `S35`（hello_flange 演示参数），**不是** `PART-30-006` 的真实测量。

### 3.5 PartRevision

| 字段 | 必填 | 类型 | 单位 | 约束/错误码 |
|---|---|---|---|---|
| `revisionId` | 是 | string | — | 必须等于 `${partId}@${revision}` → DC-E007 |
| `partId` / `variantId` | 是 | string | — | 必须存在；variant 必须属于该 part |
| `revision` / `status` | 是 | string/enum | — | DRAFT/REVIEWED/RELEASED/DEPRECATED |
| `assetRef` | 否 | string/null | — | 必须指向 AssetManifest |
| `supersedes` / `supersededBy` | 否 | string/null | — | 形成可追溯版本链 |
| `verification` | 是 | object | — | PASS 必须有 testRefs → DC-E064 |

### 3.6 PartInstance

| 字段 | 必填 | 类型 | 单位 | 约束/错误码 |
|---|---|---|---|---|
| `instanceId` | 是 | string | — | 全局唯一；重复 → DC-E004 |
| `partRef` | 是 | string | — | `partId@revision`，必须解析 → DC-E003 |
| `variantId` | 是 | string | — | 必须等于 revision.variantId → DC-E007 |
| `assemblyInstanceId` | 是 | string | — | 必须存在；父总成实例 |
| `frameId` | 是 | string | — | 必须是 `INSTANCE` Frame，单位 m → DC-E020/E022 |
| `patternIndex` | 否 | int | — | 用于 5 个螺柱等重复模式 |
| `mountInterfaceIds` / `jointIds` | 否 | string[] | — | 引用必须存在 |
| `refId` | 否 | string | — | 必须是 BOM 中的 REF；不得 REF→REF |
| `mirrorOfInstanceId` / `mirror` | 否 | string/object | — | 镜像必须显式；禁止隐式负缩放 |

### 3.7 AssemblyDefinition / AssemblyInstance / BOMLine

**AssemblyDefinition**：`assemblyId`（RP-01 ASSY）、`kind=assembly`、`name`、`revision`、`bomLineIds`（必须属于本总成）、`geometryBasis`、`verification`。`assemblyId` 与 `partId` 不得表示同一规范实体（DC-E009）。

**AssemblyInstance**：`assemblyInstanceId`、`assemblyRef=assemblyId@revision`、`parentAssemblyInstanceId`、`frameId`（ASSEMBLY/WORLD）、`vehicleVariantId`、`refId`。父链必须无环。

**BOMLine**：

| 字段 | 必填 | 类型 | 约束/错误码 |
|---|---|---|---|
| `bomLineId` | 是 | string | 唯一 |
| `assemblyDefId` | 是 | string | 必须存在；BOM 行必须属于它 |
| `partRef` / `assemblyRef` / `refId` | 三选一 | string | partRef 必须解析到 revision；assemblyRef 必须解析到 assemblyDef@rev；refId 必须唯一且 refTarget 不能是 REF |
| `qty` | 是 | int | 正整数；有 `instanceIds` 时必须等于实例数 → DC-E008 |
| `instanceIds` | 否 | string[] | 每个实例必须存在；其实例的父总成必须匹配本 BOM 的 assemblyDefId |
| `optionality` | 否 | enum | required/optional/alternative/catalog |
| `canonicalSystem` | 条件 | SYS-xx | REF 行必须写规范系统 |

### 3.8 Joint

| 字段 | 必填 | 类型 | 单位 | 约束/错误码 |
|---|---|---|---|---|
| `jointId` | 是 | string | — | 唯一 |
| `type` | 是 | enum | — | FIXED/REVOLUTE/SPHERICAL/PRISMATIC/UNIVERSAL/CYLINDRICAL/GEAR/CONTACT/SPRING_DAMPER/BELT；未知 → DC-E040 |
| `frameA` / `frameB` | 是 | string | — | 必须存在；同一 assembly root → DC-E042 |
| `axisA` / `axisB` | 条件 | number[3] | — | 转动/滑动类必须归一化 → DC-E023；方向一致 → DC-E042 |
| `limits` | 否 | object/null | rad 或 m | min≤max；单位匹配 → DC-E041；null 表示 OPEN |
| `zeroPose` | 否 | object | rad/m | 零位必须声明 |
| `stiffness` / `damping` / `preload` | 否 | object | N/m, N·s/m, N | 未知用 null + OPEN |
| `adapterHints` | 否 | object | — | build123d/Cannon 提示，不是规范本体；缺失只警告 DC-W006 |
| `valueBasis` / `evidence` / `unknowns` | 建议 | — | — | 同上 |

### 3.9 MountInterface

| 字段 | 必填 | 类型 | 单位 | 约束/错误码 |
|---|---|---|---|---|
| `mountId` | 是 | string | — | 唯一 |
| `type` | 是 | enum | — | BOLTED_CLAMPED/HUB_PILOTED_BOLTED/PRESS_FIT_SPLINE/CLAMPED/THREADED/ADHESIVE；未知 → DC-E033 |
| `frameA` / `frameB` | 是 | string | — | 必须存在；非压装类世界原点应在公差内 → DC-E034 |
| `pattern` | 条件 | object | mm | count/pcdMm/frameIds/matingFrameId；PCD/角间距/数量 → DC-E030/E031 |
| `pilot` | 条件 | object | mm | 中心孔直径/配合；与两侧 variant 的 centerBoreMm 一致 → DC-E032 |
| `fastenerPattern` | 条件 | object | mm/N·m | count/pcdMm/boltHoleMm/thread/torqueNm；孔数/PCD → DC-E030/E031；螺纹未知用 null+OPEN |
| `face` | 否 | object | mm | 法向/平面度；法向在 schema 只能查声明，真实平面度需 B-rep |
| `tolerance` | 是 | object | mm/deg | positionMm/angularDeg ≥0 |
| `valueBasis` / `evidence` / `unknowns` | 建议 | — | — | 同上 |

### 3.10 Material / AssetManifest / Frame / VehicleVariant

**Material**：`materialId`、`name`、`standardRef`、`properties`（densityKgM3/youngsModulusPa/poisson/yieldStrengthPa/specificHeatJkgK/thermalConductivityWmK），每项 `{value,unit,valueBasis,sources}`；未知一律 `null + OPEN`。示例 6 种材料全部 null，避免伪造。

**AssetManifest**：`assetId`、`partRef`、`mappingStatus`（EXACT/DEMO_SUBSTITUTE/PLACEHOLDER）、`sourceUnits`（mm/m）、`step/stl/glb`（path/sha256/bytes）、`transform`（unitScale/origin/rotation）、`generator`、`knownLosses`、`bboxMm`、`fidelityClaim`。规则见第 6 节。

**Frame**：`frameId`、`frameKind`（WORLD/ENGINEERING/ASSEMBLY/PART_LOCAL/INSTANCE/JOINT/MOUNT）、`parentFrameId`、`units`、`origin`、`rotation`（matrix/quaternion xyzw）、`handedness`、`mirror`、`tolerance`、`sourceFrameId`、`unitScale`。规则见第 4 节。

**VehicleVariant**：`vehicleVariantId`、`platformFamilyRef`、`architectureRef`、`powertrainRef`、`parameters`（至少 PD-WB/PD-FT）、`moduleSelections`、`fixedHardpointRefs`、`derivedDimensions`、`status`。R-01 字段对齐见第 10 节。

---

## 4. Frame、单位、坐标、镜像与安装接口

### 4.1 已实测的现有运行时坐标

从代码而不是记忆确认：

- `src/physics/vehicleWorld.js:180-188`：`[0: FL (+X,+Z), 1: FR (-X,+Z), 2: RL (+X,-Z), 3: RR (-X,-Z)]`。
- `src/parts/chassis.js:285-291`：FL `side=1`、FR `side=-1`、前轴 `z=+halfWB`。
- 结论：运行时世界 **+X 左、+Y 上、+Z 前**，右手系。

这与审核记录一致；也说明 RP-02 报告中的“现有 +Y 上/+Z 前”是正确但不完整的表述。

### 4.2 两套 Frame 与一个显式变换

| Frame | 轴向 | 单位 | 角色 |
|---|---|---|---|
| `FR-VEHICLE` | +X 左、+Y 上、+Z 前 | m | 运行时世界；Three.js/Cannon 使用 |
| `FR-ENGINEERING` | x 前、y 左、z 上 | m | 工程/CAD 阅读与外部标准术语；不是运行时默认 |

变换（两份都是右手系，只是循环换轴）：

```text
p_E = [xE,yE,zE] = [zR,xR,yR] = R_E_from_R · p_R
R_E_from_R = [[0,0,1],
              [1,0,0],
              [0,1,0]]        det = +1

p_R = [xR,yR,zR] = [yE,zE,xE] = R_R_from_E · p_E
R_R_from_E = transpose(R_E_from_R)
```

`R-01` 也实测了同样坐标（`M17`），但明确“世界 Frame 待 RP-07 统一裁决”。本报告的建议是：**运行时继续用 `FR-VEHICLE`；工程侧用 `FR-ENGINEERING`；只允许这一个变换，不在零件代码里散落轴交换。** 该选择仍待总控冻结。

### 4.3 局部 Frame 与轮端轴向

- CAD 零件局部 Frame 可以是 `mm`，且轮端零件常用 **局部 z 作为车轮轴**。
- 零件局部 Frame 不能直接当世界 Frame：实例 Frame 必须显式给出：
  - `sourceFrameId`（PART_LOCAL）；
  - `unitScale`（mm→m 时 0.001；m→m 时 1）；
  - `rotation`（局部轴→父 Frame 的旋转矩阵或四元数）；
  - `origin`（在父 Frame 中的位置）。
- 示例 `FR-HUB-INST-FL`：
  - `sourceFrameId=FR-HUB-LOCAL`（mm，z 为轴）；
  - `unitScale=0.001`；
  - `rotation=[[0,0,1],[1,0,0],[0,1,0]]`（局部 z→运行时 x 左；局部 x→运行时 y 上；局部 y→运行时 z 前）；
  - 行列式 +1，是旋转而不是镜像。

**禁止**：用 `mesh.scale` 或 Three.js `Object3D.scale` 做 mm→m、轴距、轮距或镜像；这些必须进入 Frame 链或变型参数。

### 4.4 镜像规则

镜像不是旋转（行列式 -1）。规则：

1. 若左右件几何不同（例如卡钳放气螺钉方向、轮胎方向性），使用不同 `partId`，不要强行共用。
2. 若同一几何镜像复用，实例必须带：
   ```json
   "mirror": { "axis": "x", "handednessFlip": true, "mirrorOfPartId": "PART-..." }
   ```
3. Frame 的旋转矩阵若为反射（det≈-1），必须有 `mirror.handednessFlip=true` 且 `mirrorOfFrameId`；否则 `DC-E024`。
4. 禁止 `scale.x=-1`；禁止把镜像后的 PCD/孔位当成原件的同一实例。
5. 镜像件的孔位/座面/螺纹旋向/放气口必须重新做 B-rep/装配检查，schema 只能查声明。

### 4.5 MountHardpoint 的字段与判定

- 局部坐标/朝向：`Frame` + `MountInterface.frameA/frameB`。
- 配对面：`face.normal`、`face.flatnessMm`（真实平面度需 B-rep）。
- 孔位：`fastenerPattern.count/pcdMm/boltHoleMm`；5×PCD 114.3 是示例。
- 中心孔/止口：`pilot.diameterMm/fit`；示例 67.1 mm，配合等级未知（null/OPEN）。
- 紧固件：`thread/grade/torqueNm/preloadN`；未知一律 null/OPEN；不得用“看起来像 M14”当规格。
- 公差：`tolerance.positionMm/angularDeg`；示例 0.05 mm/0.1° 是演示值。
- 来源：`valueBasis/sources/unknowns`；示例法兰参数来自 hello_flange，标 `DEMO_ASSUMPTION`。

### 4.6 Schema 可查 vs 必须 B-rep

| Schema 可查 | 必须 CAD B-rep / 实测 |
|---|---|
| PCD/count/CB 的声明值一致 | 孔的实际位置/圆度/位置度 |
| 两侧 variant 的 PCD/孔数/中心孔相同 | 孔轴与止口的真实配合/过盈 |
| Frame 父链/旋转行列式/单位 | 安装面真实平面度/接触面积 |
| Joint 轴归一化/限位单位 | 铰链轴线真实同轴度/间隙 |
| BOM qty 与实例数 | 螺栓预紧/夹紧力/防松 |
| Asset hash/单位/变换 | 质量/质心/惯量/材料强度 |
| REF 指向/重复实体 | 装配顺序/工具空间/干涉 |
| OPEN/null 规则 | 热/疲劳/碰撞/EMC/NVH |

---

## 5. Joint 的中性抽象

### 5.1 类型、自由度与单位

| 类型 | 自由度 | 轴/限位 | 说明 |
|---|---|---|---|
| `FIXED` | 0 | 无 | 螺栓/焊接/压装；预紧是 MountInterface，不是 Joint 限位 |
| `REVOLUTE` | 1 转动 | axis + angle limits（rad） | 轮毂轴承、铰链、转向器输入 |
| `SPHERICAL` | 3 转动 | 无平移；可有限位锥 | 球头 |
| `PRISMATIC` | 1 平移 | axis + displacement limits（m） | 浮动卡钳导向、滑轨 |
| `UNIVERSAL` | 2 转动 | 两个轴/角限位 | 万向节；不等于 CV 节的轴向滑移 |
| `CYLINDRICAL` | 1 转动 + 1 平移 | axis + 两类限位 | 花键/滑套；CV 节可近似 |
| `GEAR` | 1 耦合 | 齿数比/中心距 | 齿轮啮合；不是两个独立转动副 |
| `CONTACT` | 0 + 不等式 | 法向/摩擦 | 轮胎-路面、限位块；不是固定连接 |
| `SPRING_DAMPER` | 1 力元 | 刚度/阻尼/自由长度 | 悬架弹簧减振器；不是刚性杆 |
| `BELT` | 1 耦合 | 带轮比/张紧 | 附件驱动；不是齿轮 |

### 5.2 中性契约不锁死 API

- `Joint` 只描述：类型、两个 Frame、轴、零位、限位、驱动、刚度/阻尼、预紧、证据。
- `adapterHints` 只是提示：build123d 的 `RevoluteJoint/FixedJoint/...` 与 Cannon 的 `HingeConstraint/LockConstraint/...` 是**适配器实现**，不是契约本体。
- 不允许把 build123d 的 joint 对象或 Cannon 的 constraint 对象直接序列化成契约；也不要求两者 API 一一对应。
- 运动学求解器、动力学求解器、渲染动画都读同一 `Joint`，各自适配。

### 5.3 校验规则

- 轴必须归一化（长度≈1）→ `DC-E023`；转动/滑动的 A/B 轴必须同向或反向 → `DC-E042`。
- 限位 `min≤max`，单位必须匹配类型 → `DC-E041`；`limits=null` 表示 OPEN，不伪造行程。
- 两个 Frame 必须在同一 assembly root → `DC-E042`。
- 固定副不要求两个 Frame 原点重合；固定是“相对位姿不变”，不是“同一坐标”。
- 压装/过盈属于 MountInterface 的 fit/interference，不属于 Joint 限位。
- 高保真声明（FID-K/D1/D2）未验证 → 警告 `DC-W004`，不能自动当通过。

---

## 6. STEP / STL / GLB 资产映射

### 6.1 Manifest 规则

| 字段 | 作用 | 规则 |
|---|---|---|
| `assetId` | 资产身份 | 唯一；可被多个 revision 引用，但 revision 必须钉住 |
| `partRef` | 对应零件版本 | 必须解析到 `partId@revision` |
| `mappingStatus` | 资产与零件的映射 | `EXACT` / `DEMO_SUBSTITUTE` / `PLACEHOLDER` |
| `sourceUnits` | 源单位 | `mm` 或 `m`；mm 资产进运行时必须 `unitScale=0.001` |
| `step/stl/glb` | 文件 | 每项含 `path`、`sha256`、`bytes`；hash 不匹配 → `DC-E051`；文件缺失 → `DC-E054` |
| `transform` | 资产→零件 Frame | `fromAssetFrame`、`toPartFrame`、`unitScale`、`origin`、`rotation`；旋转必须 det=+1 |
| `generator` | 生成链 | build123d 版本、脚本、参数；保证可复现 |
| `knownLosses` | 已知损失 | STL 无装配层级/材料/公差；GLB 无 B-rep/精确孔轴；演示替代件不是真实零件 |
| `bboxMm` | 包围盒 | 只作 sanity check，不是尺寸来源 |
| `fidelityClaim` | 资产能声称的等级 | `DEMO_SUBSTITUTE` 不得声称 FID-K/D1/D2 |

### 6.2 本项目真实资产样例

`hello_flange` 的 STEP/STL/GLB 实际存在，hash 已写入示例：

| 文件 | 字节 | SHA-256 |
|---|---|---|
| `cad/experiments/hello_flange/out/hello_flange.step` | 28,713 | `127801b183d2a6fa043655f0a683d119dcc56d89de4545051bc47c68b4a1d316` |
| `cad/experiments/hello_flange/out/hello_flange.stl` | 177,484 | `93d86f2cb2e47cf6b3dce6591852d6e30fa7612cab68215453bd574a57ee255a` |
| `cad/experiments/hello_flange/out/hello_flange.glb` | 151,940 | `5531dc243cb9c6b08b96db6a27edc38f2ed04c69ebccd63bc5b19d0c224bc546` |

**必须说清楚**：这是 148 mm 演示法兰，被用作 `PART-30-006` 的 `DEMO_SUBSTITUTE`，**不是** RP-01 轮毂法兰的真实几何；`PART-30-006` 仍是 `NEEDS_MEASUREMENT`。GLB 只承担运行时显示，不承担 STEP 的 B-rep/装配基准。

### 6.3 哪些信息不能指望 STL/GLB

- STL：无装配层级、无材料、无公差、无孔轴配合语义；不要从 STL 反推 PCD/CB/ET。
- GLB：无 B-rep、无精确孔位/位置度、无质量属性；不要把 GLB 当 CAD 源。
- 零件 ID/revision/hash/单位/变换必须放在 JSON manifest，不能指望网格文件保留。
- 任何“从 GLB 量出来的尺寸”只能算 `VISUAL`/演示，不能升级为 `GEOMETRY` 证据。

---

## 7. 实例复用、BOM 与“5 个螺栓”

### 7.1 规则

1. **一个几何定义，多个实例**：5 个螺柱共享 `PART-30-009@r001`；几何只存一份，实例只存 Frame/引用。
2. **每个实例独立 Frame**：`INST-STUD-FL-1..5` 分别对应 `FR-STUD-FL-1..5`，PCD 114.3、72° 等分；不允许 5 个实例共享同一个 `Object3D.position`。
3. **BOM qty 与实例数一致**：`BL-30-002-STUD.qty=5`，`instanceIds` 5 个；否则 `DC-E008`。
4. **共享定义不共享变换**：运行时实例化时，每个实例必须有独立 transform；渲染层可以共享 geometry/material，但不能共享 placement。
5. **REF 不复制实体**：`REF-30-001` 指向 `ASSY-40-009@r001`；`SYS-40` 的盘总成只定义一次。
6. **左右件**：若几何不同，用不同 `partId`；若同几何镜像，用显式 `mirror`，不共享 placement。
7. **数量语义**：`qty` 是每个父总成实例的数量；整车 4 角总数量另记 `vehicleTotalQty`，不混用。

### 7.2 示例中的 5 个螺柱

- 定义：`PART-30-009@r001`，`familyRef=FAM-130-007`，几何 `NEEDS_MEASUREMENT`，螺纹/座型 `OPEN`。
- 实例：`INST-STUD-FL-1..5`，`assemblyInstanceId=ASM-HUB-BRG-FL`。
- 位置：PCD 114.3 mm，半径 57.15 mm，角度 0/72/144/216/288°；5 个 Frame 的原点由局部 mm 计算后显式写入，单元为 m。
- 安装：`MI-STUD-FLANGE-FL` 的 pattern 检查半径/角间距；`MI-STUD-FLANGE-FL-1..5` 表示每个压装点；`interferenceMm=null+OPEN`，不伪造过盈。
- 这证明了“同一零件多实例、PCD 孔/螺栓匹配、独立 Frame”三件事，不证明真实压装力或疲劳。

---

## 8. 示例接口图 JSON

### 8.1 文件与规模

- 示例：`docs/research/R-02-example-assembly.json`
- 校验器：`agent-workspace/agents/deepseek/reports/R-02-validator.mjs`
- 实跑结果：`agent-workspace/agents/deepseek/reports/R-02-validation-results.json`
- 规模：31 个 Frame、5 个 PartFamily、7 个 PartDefinition、7 个 PartVariant、7 个 PartRevision、11 个 PartInstance、4 个 AssemblyDefinition、4 个 AssemblyInstance、10 条 BOM、8 个 MountInterface、10 个 Joint、6 个 Material、4 个 AssetManifest、1 个 VehicleVariant、20 个校验用例、3 个错误输入。

### 8.2 真实 ID 映射

| 示例实体 | RP-01 规范 ID | 系统 | 说明 |
|---|---|---|---|
| 轮端总成 | `ASSY-30-001` | SYS-30 | 双叉臂前轮端深钻样例；每角 qty 1 |
| 轮毂轴承 Gen1 | `ASSY-30-002` | SYS-30 | 其 BOM 含轮毂法兰与 5 个螺柱 |
| 轮毂法兰 | `PART-30-006` | SYS-30 | 几何 `NEEDS_MEASUREMENT`；演示法兰仅占位 |
| 车轮螺柱 | `PART-30-009` | SYS-30 | 家族 `FAM-130-007`；5 实例 |
| 制动盘总成 | `REF-30-001` → `ASSY-40-009` | SYS-40 | 跨系统引用，不复制 |
| 卡钳总成 | `REF-30-002` → `ASSY-40-008` | SYS-40 | 跨系统引用，不复制 |
| 转向节 | `REF-30-003` → `PART-20-016` | SYS-20 | 跨系统引用，不复制 |
| 卡钳体 | `PART-40-034` | SYS-40 | 几何 `NEEDS_MEASUREMENT` |
| 卡钳支架 | `PART-40-048` | SYS-40 | 几何 `NEEDS_MEASUREMENT` |
| 通风制动盘 | `PART-40-046` | SYS-40 | 几何 `NEEDS_MEASUREMENT`；仅 PCD/CB/孔数为演示值 |
| 制动盘定位螺钉 | `PART-30-031` | SYS-30 | 家族 `FAM-130-002`；演示 |

### 8.3 关键摘录

5 个螺柱之一：

```json
{
  "instanceId": "INST-STUD-FL-3",
  "partRef": "PART-30-009@r001",
  "variantId": "V-PART-30-009-DEMO",
  "assemblyInstanceId": "ASM-HUB-BRG-FL",
  "frameId": "FR-STUD-FL-3",
  "patternIndex": 2,
  "mountInterfaceIds": ["MI-STUD-FLANGE-FL"],
  "jointIds": ["J-STUD-FLANGE-FL-3"],
  "valueBasis": "OPEN",
  "evidence": "OPEN",
  "unknowns": ["U-STUD-THREAD", "U-STUD-GEOMETRY"]
}
```

轮毂-制动盘安装接口：

```json
{
  "mountId": "MI-HUB-DISC-FL",
  "type": "HUB_PILOTED_BOLTED",
  "frameA": "FR-HUB-INST-FL",
  "frameB": "FR-DISC-INST-FL",
  "pilot": {
    "diameterMm": { "value": 67.1, "unit": "mm", "valueBasis": "DEMO_ASSUMPTION", "sources": ["S35"] },
    "fit": { "value": null, "unit": null, "valueBasis": "OPEN", "sources": [] }
  },
  "fastenerPattern": {
    "count": { "value": 5, "unit": "count", "valueBasis": "DEMO_ASSUMPTION", "sources": ["S35"] },
    "pcdMm": { "value": 114.3, "unit": "mm", "valueBasis": "DEMO_ASSUMPTION", "sources": ["S35"] },
    "boltHoleMm": { "value": 14.5, "unit": "mm", "valueBasis": "DEMO_ASSUMPTION", "sources": ["S35"] },
    "thread": { "value": null, "unit": null, "valueBasis": "OPEN", "sources": [] },
    "torqueNm": { "value": null, "unit": "N*m", "valueBasis": "OPEN", "sources": [] }
  },
  "tolerance": { "positionMm": 0.05, "angularDeg": 0.1 },
  "valueBasis": "DEMO_ASSUMPTION",
  "evidence": "ASSUMPTION",
  "unknowns": ["U-STUD-THREAD", "U-BRAKE-TORQUE"]
}
```

轮毂轴承转动副：

```json
{
  "jointId": "J-HUB-BRG-FL",
  "type": "REVOLUTE",
  "frameA": "FR-HUB-AXIS-FL",
  "frameB": "FR-KNUCKLE-AXIS-FL",
  "axisA": [1, 0, 0],
  "axisB": [1, 0, 0],
  "limits": null,
  "zeroPose": { "angleRad": 0 },
  "adapterHints": { "build123d": "RevoluteJoint", "cannon": "HingeConstraint" },
  "valueBasis": "DEMO_ASSUMPTION",
  "evidence": "ASSUMPTION",
  "unknowns": ["U-BEARING-PRELOAD"]
}
```

资产 manifest（演示法兰）：

```json
{
  "assetId": "ASSET-FLANGE-DEMO",
  "partRef": "PART-30-006@r001",
  "mappingStatus": "DEMO_SUBSTITUTE",
  "sourceUnits": "mm",
  "step": { "path": "cad/experiments/hello_flange/out/hello_flange.step", "sha256": "127801...", "bytes": 28713 },
  "stl": { "path": "cad/experiments/hello_flange/out/hello_flange.stl", "sha256": "93d86f...", "bytes": 177484 },
  "glb": { "path": "cad/experiments/hello_flange/out/hello_flange.glb", "sha256": "5531dc...", "bytes": 151940 },
  "transform": { "fromAssetFrame": "FR-CAD-MM", "toPartFrame": "FR-HUB-LOCAL", "unitScale": 0.001, "origin": [0,0,0], "rotation": [[1,0,0],[0,1,0],[0,0,1]] },
  "knownLosses": ["STL 不保留装配层级/材料/工程公差", "GLB 不保留 B-rep/精确孔轴配合", "该法兰是演示替代件，不是 PART-30-006 的真实几何"]
}
```

### 8.4 显式未知项

`U-HUB-FLANGE-GEOMETRY`、`U-STUD-THREAD`、`U-BRAKE-TORQUE`、`U-DISC-GEOMETRY`、`U-CALIPER-GEOMETRY`、`U-BEARING-GEOMETRY`、`U-MATERIALS`、`U-R01-FAMILY-LINK`。示例中所有材料属性均为 `null + OPEN`；所有几何资产除演示法兰外均为 `PLACEHOLDER`。

---

## 9. 校验器与测试

### 9.1 运行方式与结果

实际执行：

```bash
node agent-workspace/agents/deepseek/reports/R-02-validator.mjs \
  docs/research/R-02-example-assembly.json
```

实际结果：

```text
EXIT=0
基础示例: ok=true, errors=0
用例: 20 / 20 PASS
错误输入示例: 3 / 3 被预期错误码拒绝
基础警告: DC-W001 (OPEN/ASSUMPTION), DC-W002 (R-01 待对齐), DC-W003 (需 CAD B-rep), DC-W005 (占位资产)
```

完整结果：`agent-workspace/agents/deepseek/reports/R-02-validation-results.json`。

### 9.2 20 个用例

| 用例 | 注入 | 期望码 | 实际 |
|---|---|---|---|
| TC-01 | 基础示例 | 0 错误；W001 | PASS |
| TC-02 | 空 `partId` | E001 | PASS |
| TC-03 | 重复 `instanceId` | E004 | PASS（另命中 E020/E003） |
| TC-04 | `partRef=PART-30-006@r999` | E003 | PASS |
| TC-05 | 制动盘 PCD 112.0 | E030 | PASS |
| TC-06 | 制动盘孔数 4 | E031 | PASS |
| TC-07 | 制动盘中心孔 66.6 | E032 | PASS |
| TC-08 | 实例 Frame 用 mm | E022 | PASS |
| TC-09 | Joint 轴 [2,0,0] | E023 | PASS（另命中 E042） |
| TC-10 | Joint 限位 min>max | E041 | PASS |
| TC-11 | 旋转行列式 -1 无 mirror | E024 | PASS |
| TC-12 | `familyRef` 指向 PART | E006 | PASS |
| TC-13 | BOM qty 4 但 5 实例 | E008 | PASS |
| TC-14 | STEP hash 改为 deadbeef | E051 | PASS |
| TC-15 | asset `sourceUnits=null` | E050 | PASS |
| TC-16 | SOURCED 但 sources 为空 | E061 | PASS |
| TC-17 | OPEN 数值不为 null | E062 | PASS |
| TC-18 | 变体缺 `PD-WB` | E071 | PASS |
| TC-19 | 变体带 `globalScale` | E073 | PASS |
| TC-20 | PASS 但 `testRefs=[]` | E064 | PASS |

### 9.3 3 个刻意错误的 JSON 输入

示例 JSON 的 `invalidExamples` 是完整的**最小 JSON 文档**，不是口头描述：

| 示例 | 错误 | 预期码 | 实际 |
|---|---|---|---|
| `INVALID-PCD` | 制动盘 PCD 112.0 vs 轮毂 114.3 | E030 | PASS |
| `INVALID-DUP-INSTANCE` | 两个实例同 `instanceId` | E004 | PASS |
| `INVALID-JOINT-AXIS` | 转动副轴 [2,0,0] | E023 | PASS |

### 9.4 这些测试证明了什么、没证明什么

**证明**：
- 示例 JSON 可解析；实体引用/版本/BOM/实例/Frame/Joint/Mount/Asset 的声明能相互校验。
- PCD/孔数/中心孔、重复实例、单位、旋转/镜像、Joint 轴/限位、BOM qty、Asset hash、OPEN/SOURCED/PASS 规则能被稳定错误码拒绝。
- 基础示例本身 0 错误；异常用例的错误来自注入故障，不是基线本来坏。

**没证明**：
- 不证明孔的真实位置、配合、过盈、干涉、装配顺序、质量、强度、疲劳、热、EMC。
- 不证明 `PART-30-006` 的真实几何；演示法兰不是该零件。
- 不证明 R-01 平台变型已冻结；`platformFamilyRef` 仍是待对齐项。
- 不证明 5 个螺柱的压装力/预紧/疲劳；`U-STUD-THREAD`、`U-BRAKE-TORQUE` 仍是 OPEN。

---

## 10. 与 R-01 的待对齐字段（不得自行冻结）

R-01 当前是 `R01-PF-0.1 / PROPOSED_NOT_APPROVED`；R-02 只引用、不冻结。

| R-01 字段 | R-02 对应 | 现状/待决 |
|---|---|---|
| `platformFamilies[].id`（`PF-DEMO-BOF-01`） | `VehicleVariant.platformFamilyRef` | R-01 示例的 `vehicleVariants` 尚未显式写 `platformFamilyRef`；R-02 暂填 `PF-DEMO-BOF-01`，校验器只发 W002 |
| `PD-WB` / `PD-FT` / `PD-RT` / `PD-TW` | `VehicleVariant.parameters` | 单位 mm、`DEMO_ASSUMPTION`；R-02 要求至少 PD-WB/PD-FT（E071） |
| `FH-01..FH-05` | `fixedHardpointRefs` | R-02 加 `hardpointOverrides` 禁止覆盖固定硬点（E074）；R-01 尚未最终冻结哪些固定 |
| `moduleSlots` / `moduleSelections` | `VehicleVariant.moduleSelections` | 仅作兼容性检查（ICE 不得选 BEV 模块，BOF 不得选 UNI 轿车壳） |
| `valueBasis`（`DEMO_ASSUMPTION/LOCAL_MEASUREMENT/SOURCED/OPEN`） | R-02 `valueBasis` | 尚未与 RP-01 `geomBasis`、RP-02 `evidence.level` 合并；R-02 提案保留并加 `DERIVED/ENGINEERING_DERIVATION/DEFERRED/NOT_APPLICABLE` |
| `failureTypeEnum`（含 `GLOBAL_SCALE_FORBIDDEN`、`FIXED_HARDPOINT_OVERRIDE`） | `DC-E073/E074` | R-02 复用其语义；错误码前缀不同 |
| R-01 坐标说明（+X 左/+Y 上/+Z 前，世界 Frame 待 RP-07） | `FR-VEHICLE` | 与本次实测一致；仍需 RP-07 冻结 |
| `derive` 的派生尺寸（`propshaftLength_mm`、`lowerArmSpan_mm`） | `derivedDimensions` | R-02 只保存派生值+公式来源，不把派生值当测量 |

**冲突/待决**：
1. R-01 的 `vehicleVariants` 缺 `platformFamilyRef`；R-02 不能假装它已存在。
2. R-01 的 `valueBasis` 与 RP-01 的 `geomBasis` 是两套枚举；需要总控合并或明确映射。
3. R-01 用 `VISUAL/GEOMETRY/KINEMATIC/DYNAMIC`；RP-03 用 `FID-V/G/K/D1/D2`；R-02 建议采用 RP-03 的 FID 作为 `fidelityClaim`，把前者的四档保留为兼容别名，但**不允许自动合并**。
4. R-01 的 `globalScale` 禁令必须在 R-02 的 Frame/Asset/Assembly 层同样执行；目前只在变体层实现 E073，Frame/Asset 层有 E026/E052。
5. R-01 的固定/可变硬点最终清单未批；R-02 的 `Frame` 规则先按“显式父链+公差”设计，不假设具体硬点。

---

## 11. 与 RP-01 / RP-02 / RP-03 的对齐

### 11.1 与 RP-01

| RP-01 | R-02 | 对齐结论 |
|---|---|---|
| `RP01-PBS-0.1` ID 规则 | `partId/assemblyId/familyId/refId` | 直接沿用；未另造 ID |
| 一个实体一个规范节点 | `PartDefinition` 唯一；跨系统用 REF | 一致；示例 `REF-30-001/002/003` |
| `familyRef` 必须指向 SYS-130 FAM | `DC-E006` | 一致；示例 `FAM-130-007/001/002/036` |
| `qty` 是产品树数量 | BOM `qty` + `instanceIds` | R-02 明确 qty 是“每个父总成实例”的数量；RP-01 的 `qty=4/20` 是整车/多角数量，需在实例层换算 |
| `geomBasis` / `partClass` / `targetLevel` | `geometryBasis` / `partClass` / `fidelityClaim` | 沿用 `geomBasis`；`targetLevel` 与 FID 需映射，不直接等同 |
| 禁止预填质量/公差数值 | 材料属性全 null；公差仅演示值 | 一致；示例没有伪造质量 |
| `REF` 是叶子、不能指向 REF | `DC-E005` | 一致 |

### 11.2 与 RP-02

| RP-02 | R-02 | 对齐结论 |
|---|---|---|
| 端口/边/能力 | `Joint`/`MountInterface` 是接口的“约束/装配”视图 | Joint 不是接口边的替代；一个机械边可对应一个 Joint + 一个 MountInterface |
| `Frame`（origin/axes/tolerance） | `Frame` + `sourceFrameId`/`unitScale` | R-02 补了 CAD mm→m、局部 z 轴、镜像规则 |
| `evidence.level` / `validation` | `valueBasis`/`evidence`/`verification` | R-02 把“来源、证据等级、验证状态”拆开；RP-02 的 `validation.requiredLevel` 需改名/映射 |
| `render.visualOnly` | `AssetManifest.mappingStatus` / `fidelityClaim` | 一致：渲染资产不能当工程 B-rep |
| 42 节点接口图 | 示例装配节点 | 示例只覆盖轮端/制动纵切；不声称覆盖全车 |

### 11.3 与 RP-03

| RP-03 | R-02 | 对齐结论 |
|---|---|---|
| `FID-V/G/K/D1/D2` | `fidelityClaim` | 直接采用 |
| FID 不是阶段 P0–P5 | 独立字段 | 一致 |
| FID-K 需要硬点/约束求解 | Joint/Frame 提供输入，但不提供硬点数值 | 示例硬点仍是 OPEN |
| FID-D1/D2 需要来源/工况 | verification 分离 | 高等级未验证只警告，不自动通过 |

---

## 12. 错误码与 Schema/B-rep 边界

### 12.1 错误码注册（本原型已实现/保留）

| 组 | 码 | 含义 | 原型 |
|---|---|---|---|
| 身份 | `DC-E001` | 缺必填字段/空 ID | 已实现 |
| 身份 | `DC-E002` | 重复 ID（非 partInstance） | 已实现 |
| 身份 | `DC-E003` | 引用/版本无法解析 | 已实现 |
| 身份 | `DC-E004` | 重复 instanceId | 已实现 |
| 身份 | `DC-E005` | REF→REF / 重复 REF | 已实现 |
| 身份 | `DC-E006` | familyRef 非 FAM | 已实现 |
| 身份 | `DC-E007` | revision/变体不一致 | 已实现 |
| 身份 | `DC-E008` | BOM qty 与实例数/父总成不匹配 | 已实现 |
| 身份 | `DC-E009` | kind/规范身份冲突 | 已实现 |
| 身份 | `DC-E010` | 接口/实例互指错误 | 保留 |
| Frame | `DC-E020` | 缺 Frame / Frame 类型错 | 已实现 |
| Frame | `DC-E021` | 未知单位 | 已实现 |
| Frame | `DC-E022` | 单位/比例不匹配 | 已实现 |
| Frame | `DC-E023` | 轴未归一化 | 已实现 |
| Frame | `DC-E024` | 非刚体旋转/隐式镜像 | 已实现 |
| Frame | `DC-E025` | Frame 父缺失/成环 | 已实现 |
| Frame | `DC-E026` | globalScale/非刚体变换 | 已实现 |
| Frame | `DC-E027` | 负公差 | 已实现 |
| Mount | `DC-E030` | PCD 不匹配/孔位不在圆周 | 已实现 |
| Mount | `DC-E031` | 孔数/模式数量不匹配 | 已实现 |
| Mount | `DC-E032` | 中心孔/止口不匹配 | 已实现 |
| Mount | `DC-E033` | 不支持的安装类型/紧固件不兼容 | 已实现（类型） |
| Mount | `DC-E034` | 安装 Frame 世界距离超差 | 已实现 |
| Joint | `DC-E040` | 不支持的 Joint 类型 | 已实现 |
| Joint | `DC-E041` | 限位 min>max/单位错 | 已实现 |
| Joint | `DC-E042` | Frame 不同根/轴不共线 | 已实现 |
| Joint | `DC-E043` | Joint 引用实例不在总成 | 保留 |
| Joint | `DC-E045` | 重复约束 | 保留 |
| Asset | `DC-E050` | 资产缺 unit/path/hash/transform | 已实现 |
| Asset | `DC-E051` | hash 不匹配 | 已实现 |
| Asset | `DC-E052` | 资产变换非刚体 | 已实现 |
| Asset | `DC-E053` | 占位/演示资产越级声明 | 已实现 |
| Asset | `DC-E054` | 资产文件缺失 | 已实现 |
| Evidence | `DC-E060` | 非法 valueBasis | 已实现 |
| Evidence | `DC-E061` | SOURCED 无来源 | 已实现 |
| Evidence | `DC-E062` | OPEN 值非 null | 已实现 |
| Evidence | `DC-E063` | 数值无单位 | 已实现 |
| Evidence | `DC-E064` | PASS 无 testRefs | 已实现 |
| Variant | `DC-E070` | 缺 platformFamilyRef | 保留（当前按 W002 处理） |
| Variant | `DC-E071` | 缺 PD-WB/PD-FT | 已实现 |
| Variant | `DC-E072` | 模块/动力/架构不兼容 | 已实现 |
| Variant | `DC-E073` | globalScale | 已实现 |
| Variant | `DC-E074` | 覆盖固定硬点 | 已实现 |
| 警告 | `DC-W001` | OPEN/ASSUMPTION 存在 | 已实现 |
| 警告 | `DC-W002` | R-01 字段待对齐 | 已实现 |
| 警告 | `DC-W003` | 仍需 CAD B-rep 检查 | 已实现 |
| 警告 | `DC-W004` | 高 FID 未验证 | 已实现 |
| 警告 | `DC-W005` | 占位资产 | 已实现 |
| 警告 | `DC-W006` | Joint 缺 adapterHints | 已实现 |

### 12.2 Schema 不能替代的检查

| 检查 | 为什么 Schema 不够 |
|---|---|
| 孔的真实位置/位置度/圆度 | JSON 只声明 PCD/数量；真实几何在 B-rep |
| 中心孔与轴颈的配合/过盈 | 需要尺寸公差链和材料/压装工艺 |
| 制动盘与卡钳/轮辋的间隙 | 需要运动包络和 B-rep 干涉 |
| 螺栓预紧/夹紧力/防松 | 需要螺纹、摩擦系数、扭矩规范/试验 |
| 质量/质心/惯量 | 需要 CAD 材料属性或称重；示例全 null |
| 材料强度/疲劳/热 | 需要材料标准/试验；示例全 null |
| 焊接/粘接/密封 | 需要工艺规范与无损检测 |
| 装配顺序/工具空间 | 需要工艺规划与人体/工具包络 |
| 碰撞/EMC/NVH | 需要专门仿真/试验，超出本任务 |

---

## 13. 未决问题与需要总控裁定

1. **统一世界 Frame**：本报告建议 `FR-VEHICLE`（+X 左/+Y 上/+Z 前）为运行时世界，`FR-ENGINEERING`（x 前/y 左/z 上）为工程阅读 Frame；是否接受？
2. **`PartVariant` vs `PartRevision`**：变体是否允许跨 revision 复用参数？本报告要求 variant 钉住 revision；是否接受？
3. **`qty` 语义**：本报告定义为“每个父总成实例的数量”；RP-01 的 `qty=4/20` 是整车/多角数量，是否需要增加 `vehicleTotalQty`？
4. **REF 与规范实体**：跨系统引用是否统一用 `REF-xx` 节点，还是 BOM 行内 `refId` 即可？本报告两者都允许，但要求不复制实体。
5. **Joint 与 MountInterface 边界**：固定连接是否必须同时有 Joint(FIXED) 和 MountInterface？本报告允许 Joint 表达约束、Mount 表达贴合/紧固，二者可并存。
6. **`fidelityClaim` 词汇**：采用 RP-03 的 FID-V..D2，还是 MASTER_PLAN 的 VISUAL..DYNAMIC？本报告建议 FID，保留映射。
7. **`valueBasis` 合并**：RP-01 `geomBasis`、R-01 `valueBasis`、RP-02 `evidence.level` 三套枚举如何合并？本报告给了一个并集提案，但不能擅自冻结。
8. **R-01 `platformFamilyRef`**：R-01 示例缺该字段；R-02 暂填 `PF-DEMO-BOF-01`，只发 W002；是否由 R-01 补字段？
9. **镜像件身份**：左右件用不同 `partId` 还是同一 `partId` + `mirror`？本报告建议几何不同则不同 `partId`；同几何镜像才用 mirror。
10. **演示资产的使用边界**：`hello_flange` 作为 `DEMO_SUBSTITUTE` 是否允许出现在示例？本报告明确标注，不当作真实零件；请总控确认。

---

## 14. 结论与下一步

### 14.1 完成了什么

- 用 RP-01 真实 ID 定义了 PartFamily/PartDefinition/PartVariant/PartRevision/PartInstance/AssemblyDefinition/AssemblyInstance/BOM/Joint/MountInterface/Material/AssetManifest/Frame/VehicleVariant 的数据契约草案。
- 给出 CAD mm→运行时 m 的显式 Frame 链、轮端局部 z 轴处理、镜像规则和 MountHardpoint 字段。
- 给出中性 Joint 抽象与 build123d/Cannon 适配边界，避免把具体 API 锁进数据契约。
- 给出 STEP/STL/GLB manifest 规则、hash/单位/变换/已知损失，以及 5 个螺栓“同定义多实例”的示例。
- 交付 20 个自动用例、3 个错误 JSON 输入、可运行校验器；基础示例 0 错误，20/20 + 3/3 通过。
- 明确列出与 R-01 的待对齐字段和 Schema/B-rep 边界。

### 14.2 没完成/有争议

- 没有真实零件几何/材料/质量/预紧/热数据；示例中大量 `null + OPEN`。
- R-01 平台家族字段尚未冻结；`platformFamilyRef` 仍待对齐。
- 统一世界 Frame、FID 词汇、valueBasis 合并、qty 语义、REF 形式仍需总控裁定。
- 没有验证真实 B-rep 干涉、装配顺序、强度、疲劳、碰撞、EMC。
- `hello_flange` 只是演示替代件，不能当 `PART-30-006` 的真实几何。

### 14.3 下一步建议（两项）

1. **总控裁定第 13 节的 10 个未决项**，尤其是世界 Frame、`qty` 语义、`valueBasis` 合并和 R-01 `platformFamilyRef`；裁定后再决定是否把 `carlab.data-contract/0.1.0-proposal` 升级为 I-01 Schema。
2. **用 I-01 做一个轮端纵切样板**：以 `PART-30-006 + 5×PART-30-009 + PART-40-046 + ASSY-40-009` 为对象，补真实 STEP/测量/材料/预紧，跑 PCD/配合/干涉/运动学/质量属性；只有通过 B-rep 与实测的检查，才允许把 `DEMO_SUBSTITUTE` 升级为 `EXACT`。

---

## 附录 A：文件与复现

| 文件 | 作用 |
|---|---|
| `docs/research/R-02-data-contract-report.md` | 本报告 |
| `docs/research/R-02-example-assembly.json` | 示例装配 + 20 用例 + 3 错误输入 |
| `agent-workspace/agents/deepseek/reports/R-02-validator.mjs` | 可运行校验器（研究原型，不是生产代码） |
| `agent-workspace/agents/deepseek/reports/R-02-validation-results.json` | 实跑结果 |
| `agent-workspace/agents/deepseek/reports/R-02.md` | 个人主任务回报 |
| `docs/tasks/reports/R-02-report.md` | 任务书指定回报 |

复现：

```bash
node agent-workspace/agents/deepseek/reports/R-02-validator.mjs \
  docs/research/R-02-example-assembly.json
# 期望 EXIT=0；base.ok=true；20/20；3/3
```

## 附录 B：与任务书 7 个问题的对应

| 任务书问题 | 本报告位置 |
|---|---|
| 1. 实体身份/引用/版本/生命周期 | 第 2、3 节 |
| 2. mount hardpoint 表示 | 第 4.5 节 |
| 3. mm/m、右手坐标、局部变换、镜像、轴向 | 第 4 节 |
| 4. Joint 自由度/限位/框架，不锁死 API | 第 5 节 |
| 5. STEP/STL/GLB 映射与 manifest | 第 6 节 |
| 6. 重用零件与多实例 | 第 7 节 |
| 7. 未知/估计/参考/实测/仿真与验证等级 | 第 2.3、3.1、11.3、12 节 |

## 附录 C：证据来源

- RP-01：`docs/planning/evidence/RP-01-tree-core.json`、`RP-01-tree-chassis.json`、`RP-01-validation-map.json`、`docs/planning/reports/RP-01-vehicle-product-tree.md`
- R-01：`docs/research/R-01-platform-family-example.json`、`docs/research/R-01-platform-family-report.md`
- RP-02：`docs/planning/evidence/RP-02-interface-graph.example.json`、`docs/planning/reports/RP-02-interface-graph.md`
- RP-03：`docs/planning/evidence/RP-03-fidelity-matrix.json`
- 审核：`docs/command/reviews/AUDIT_2026-11-14.md`
- 法兰资产：`cad/experiments/hello_flange/params.json`、`out/hello_flange_metadata.json`、`out/hello_flange.step/.stl/.glb`
- 坐标实测：`src/physics/vehicleWorld.js:180-188`、`src/parts/chassis.js:285-291`
- 外部标准/文档：ISO 8855、SAE J670、ISO 273、build123d 0.13.0 API、Three.js glTF/GLB、glTF 2.0；详见示例 JSON 的 `sources`（S30–S42）
