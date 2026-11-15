# R-17｜整车工程领域模型候选 RFC（DeepSeek）

> 状态：**SUBMITTED**（待 GPT-6 审核；不是冻结生产 Schema）
> 任务卡：`agent-workspace/agents/deepseek/tasks/R-17.md`
> 实现：`src-experiments/domain-contract-v1/`
> 日期：2026-11-15
> 输入：R-02/R-07/R-10/R-12、RP-01、R-06、R-11、R-16 相关公共消息、`docs/planning/VEHICLE_BLUEPRINT_V1.md`（DRAFT）、`docs/command/CARLAB_RUNTIME.md`
> 性质：隔离研究原型。不是 5173 生产状态，不是真实车型工程，不是 RP-07 的接口冻结。

---

## 0. 结论

R-17 做出了一个**纯 Node、可运行、可序列化、可校验**的最小工程领域模型原型：

- 一份整车骨架 fixture：10 个系统、4 个轮端、15 个总成实例、14 个零件实例；包含 Gen1/Gen3 定义与 4 个轮端的稳定 ID。
- 一份可动 FL 轮端 fixture：11 个零件实例、5 个螺柱、3 个 Joint、6 个 Constraint/Output、3 个 REF、4 条 BOM；含一次可过期的 SimulationRun。
- 一个 `ProjectStore` 命令原型：新增实例、移动到总成、设置 Joint/Constraint、选择变型、校验、序列化/恢复、读取显示变换、查询仿真是否 `STALE`。
- 14 个 Node 测试全部通过；`run-checks.mjs` 两份 fixture 均 `ok=true`。

最重要的边界：**它证明“工程实体与规则能跑”，不证明“真实车辆能装/能算”。** 所有几何仍是 `NEEDS_MEASUREMENT`/`PLACEHOLDER`，螺柱仍是 `ASSUMPTION`，世界 Frame 仍是候选，Joint/Constraint 与错误码仍需 RP-07 裁决。

---

## 1. 目标与输入

### 1.1 目标

把现有 RP-01/R-06/R-11/R-02/R-07/R-10/R-12 的研究成果收敛成一个可执行的最小工程主数据原型，回答：

1. 工程对象如何组织，哪个字段是主事实，哪个只是显示/投影？
2. 四轮整车骨架与可动 FL 轮端能否在不完整几何下被选中/枚举？
3. R-12 的 `applicableWhen`/`evidenceInherited`/REF/qty/采购边界/UNKNOWN 规则能否进入领域模型？
4. 车辆局部坐标、CAD 局部 Frame、3D Y-up 视窗之间如何显式转换？
5. 参数改变后，旧仿真结果如何自动变成 `STALE`？
6. 最小命令 API 是否足够支撑未来 ProjectStore / RenderAdapter / SolverAdapter？

### 1.2 输入

- `docs/planning/VEHICLE_BLUEPRINT_V1.md`（DRAFT）：Project / Variant / PartDefinition / PartInstance / Assembly / MountFrame / Joint / Constraint / BOM；`ProjectStore`、`EngineeringRegistry`、`RenderAdapter`、`SolverAdapter` 的候选边界。
- `docs/command/CARLAB_RUNTIME.md`：5173 工作台 / 5174 指挥中心；对象树 ≠ 业务菜单；5175 停用。
- `docs/planning/evidence/RP-01-tree-chassis.json`：`ASSY-30-001/002/003`、`PART-30-006/009/017/029`、`REF-30-001..005`、`qty`、`CG-HUB`。
- `docs/research/R-06-minimal-assembly-bom.json`：60 BOM、12 blocked interfaces、`qtyPerCorner`、UNKNOWN 纪律。
- `docs/research/R-11-geometry-anchor-study.md`：M12 sourced 样本、M14 未确认、FAM-130-007 三个节点、无紧固架构选择组。
- `docs/research/R-12-conditional-adapter-report.md`：`applicableWhen`、`evidenceInherited`、REF/qty/采购边界。
- Qwen4 公共消息 `MSG-20261114-2330-qwen4-to-all-alias-evidence.md`、`MSG-20261115-0010-qwen4-to-deepseek-r12-qty.md`。

---

## 2. 候选实体与关系

### 2.1 实体

| 实体 | 身份 | 主事实 | 显示/投影 | 关键规则 |
|---|---|---|---|---|
| `Project` | `projectId` | 工程名、variant、revision、对象集合 | 页面选中/相机 | revision 增加使旧仿真过期 |
| `VehicleVariant` | `variantId` | `generation`（GEN1/GEN3）、platformFamilyRef、参数 | 变型下拉 | 只允许一个 generation |
| `System` | `systemId`（SYS-*） | 产品树节点 | 树展开 | parentSystemId 可空 |
| `AssemblyDefinition` | `assemblyId`（ASSY-*） | 总成定义 | 树标签 | 不直接放置 |
| `Assembly` | `assemblyId`（ASM-*） | 放置的总成实例、definitionRef、frame | 树节点 | parentAssemblyId 形成树 |
| `PartDefinition` | `partId`（PART-*） | familyRef、partClass、geometryBasis、evidence、applicableWhen | 属性面板 | 一个实体一个规范节点 |
| `PartInstance` | `instanceId`（INST-*） | partId、assemblyId、frame、variantId、quantity | 3D 选中/隐藏 | 稳定 ID，不用 Object3D 名 |
| `MountFrame` | `frameId`（FR-*） | origin/rotation/units/parent/mirror/tolerance | 显示变换 | 刚性/单位/镜像检查 |
| `Joint` | `jointId`（J-*） | 机构运动副（转动/固定/滑动等） | 约束图标 | 与 Constraint 分开 |
| `Constraint` | `constraintId`（CON-*） | 求解约束（DISTANCE/POINT_ON_LINE/PRESCRIBED_POSITION/OUTPUT） | 求解器输入 | 不自动成为 Joint |
| `AssetRef` | `assetId`（ASSET-*） | partId、contentFingerprint、sourceUnits、GLB、mappingStatus | 视窗加载 | 演示/占位不得越级声明 |
| `SourceEvidence` | `sourceId`（SRC-*） | kind、grade、path、supports、limitations | 属性证据 | SOURCED 必须有来源 |
| `SimulationRunRef` | `runId`（RUN-*） | inputRevision、solver、status、resultHash | 时间轴/结果 | revision 变化 → STALE |

### 2.2 关系

```text
Project 1─1 VehicleVariant
Project 1─* System (parentSystemId 形成树)
Project 1─* AssemblyDefinition
Project 1─* Assembly (definitionRef→AssemblyDefinition, parentAssemblyId→Assembly)
PartDefinition 1─* PartInstance (partId, applicableWhen/evidenceInherited)
Assembly 1─* PartInstance (assemblyId)
PartInstance 1─1 MountFrame (frameId)
Joint *─* MountFrame (frameA/frameB)
Constraint *─* MountFrame/Joint (输入/输出，不自动生成 Joint)
PartDefinition 1─* AssetRef
PartDefinition/PartInstance *─* SourceEvidence
Project 1─* SimulationRunRef (inputRevision 关联 revision)
```

**主事实 vs 投影**：

- 工程主事实是 `Project` 的对象集合、ID、Frame、Joint/Constraint、SourceEvidence、AssetRef。
- `RenderAdapter` 只消费 `snapshotForRender()` 的 `instanceId → matrixWorld/material/visibility`；它不能反向修改工程。
- `Selection` 只用 `instanceId`/`assemblyId`；不能用 Three `Object3D.name` 当 `instanceId`。
- `SimulationRunRef` 是结果，不是工程输入；旧结果只能以 `STALE` 展示。

---

## 3. 三层真值与证据继承

| 字段 | 回答 | 允许值 | 不负责 |
|---|---|---|---|
| `valueBasis` | 数值/声明从哪来 | EVIDENCE/LOCAL_MEASUREMENT/SOURCED/DERIVED/ENGINEERING_DERIVATION/DEMO_ASSUMPTION/ASSUMPTION/OPEN/DEFERRED/NOT_APPLICABLE | 不表示模型能力 |
| `evidenceInherited` | 这个对象继承的证据上限 | EVIDENCE/ASSUMPTION/UNKNOWN | 不表示测试通过 |
| `claimedEvidence` | 下游声称的证据等级 | 同上 | 不能超过 inherited |
| `fidelityTarget` | 目标几何/运动/动力学等级 | FID-V/G/K/D1/D2 | 不是已达成 |
| `verification` | 测试状态 | UNTESTED/PASS/FAIL/BLOCKED + reviewStatus | PASS≠APPROVED |

实现规则：

1. `claimedEvidence` 等级高于 `evidenceInherited` → `DOMAIN-E-EVIDENCE-UPGRADE`。
2. `claimedEvidence=SOURCED` 但没有 `sourceEvidenceIds` → `DOMAIN-E-SOURCE-MISSING`。
3. `geometryBasis=UNKNOWN` 且 `geometryValue` 非空 → `DOMAIN-E-UNKNOWN-VALUE`。
4. `applicableWhen` 不匹配当前 variant generation → `DOMAIN-E-GEN-MIX`。
5. `AssetRef.mappingStatus=DEMO_SUBSTITUTE` 且 `fidelityClaim=FID-K+` → `DOMAIN-E-ASSET-OVERCLAIM`。
6. 参数/对象变更 → `revision++`；旧 `SimulationRunRef.inputRevision != revision` → `STALE`（警告，不伪造 CURRENT）。

---

## 4. Frame、单位与显示转换

### 4.1 三套边界

| Frame | 轴向/单位 | 用途 |
|---|---|---|
| `FR-VEHICLE`（候选世界） | `+X 左、+Y 上、+Z 前`，m | 现有运行时/装配 |
| `VEHICLE_LOCAL` 子 Frame | 同上，m | 总成/实例定位 |
| `CAD_LOCAL` | CAD 局部轴；可 mm | 零件源；进入运行时必须显式 `unitScale=0.001` |

本原型所有 **被实例引用** 的 Frame 都要求 `units='m'`；`CAD_LOCAL` 只能作为源 Frame，不直接当实例 Frame。错误单位/非刚体缩放/未声明镜像分别报 `DOMAIN-E-UNIT-MISMATCH`、`DOMAIN-E-SCALE`、`DOMAIN-E-MIRROR`。

### 4.2 旋转约定

- 轮端局部 z 可作车轮轴；实例 Frame 用矩阵 `[[0,0,1],[1,0,0],[0,1,0]]` 把局部 z 映射到运行时 +X（左），局部 x→+Y 上、局部 y→+Z 前。
- 矩阵行列式必须为 +1；反射必须带 `mirror.handednessFlip=true` 与 `mirrorOfFrameId`。
- 禁止用负缩放/`mesh.scale` 做镜像或左右件；左右几何不同应使用不同 `partId` 或显式镜像实例。

### 4.3 显示变换

```js
store.toDisplayTransform('INST-HUB-FL')
// {
//   instanceId: 'INST-HUB-FL',
//   partId: 'PART-30-006',
//   assemblyId: 'ASM-HUB-BRG-FL',
//   units: 'm',
//   up: 'Y',
//   matrixWorld: 4x4
// }
```

`snapshotForRender()` 只输出 `instanceId` + `matrixWorld` + `partId` + `assemblyId`，不输出 Three 对象名；RenderAdapter 不能靠 Object3D 层级推断工程关系。

---

## 5. 最小命令 API

`ProjectStore` 已实现：

| 命令 | 作用 | 约束 |
|---|---|---|
| `listTree()` | 系统→总成→实例树 | 只读投影 |
| `select(id)` | 按 `instanceId`/`assemblyId` 选中 | ID 不存在 → 拒绝 |
| `addInstance(partId, assemblyId, opts)` | 新增实例（默认生成 Frame） | 生成唯一 `INST-*`，variant/evidence 从定义继承；GEN1/Gen3 混配/重复 ID/源缺失会回滚并抛错 |
| `moveInstance(instanceId, assemblyId, frameId?)` | 移到另一个总成 | 目标总成/Frame 必须存在；revision++ |
| `setJoint(joint)` | 增加/替换机构运动副 | 类型/轴/限位/Frame 校验 |
| `setConstraint(constraint)` | 增加/替换求解约束 | `jointOrConstraint=CONSTRAINT`；不可混入 Joint |
| `selectVariant(variant)` | 切换变型 | 已存在实例的 `applicableWhen` 必匹配；否则拒绝 |
| `validate()` | 返回 `{ok, errors, warnings}` | 错误含 objectId/rule/source/message |
| `serialize()` / `restore()` | JSON 快照/恢复 | 恢复重新校验；拒绝坏 revision |
| `getRunStatus(runId)` | `CURRENT`/`STALE` | 比较 `inputRevision` 与 project revision |
| `toDisplayTransform(instanceId)` | m/Y-up 4×4 | 单位不是 m / 非刚体 → 抛错 |
| `snapshotForRender()` | 可见实例显示快照 | 不含 Three Object3D |
| `familyMembers(familyRef)` | 查同家族定义 | 不按家族去重；用于审计 |

---

## 6. 两份 fixture

### 6.1 整车骨架 `fixtures/vehicle-skeleton.json`

| 项 | 数量/内容 |
|---|---|
| 系统 | 10（SYS-00/10/20/30/40/50/60/70/80/90） |
| AssemblyDefinition | 12（ASSY-30-001/002、ASSY-40-008/009、ASSY-20-001/014、动力/传动/能源/热/电气/车身占位） |
| Assembly 实例 | 15（4 个轮端、FL 轮毂轴承、FL 制动盘/卡钳、FL 悬架、转向/动力/传动/能源/热/电气/车身占位） |
| PartDefinition | 11（Gen1 法兰/螺柱、Gen3 法兰内圈、Gen3 螺柱、车轮螺母、制动盘/卡钳/支架/转向节/螺钉/轮辋） |
| PartInstance | 14（FL 法兰 + 5 螺柱 + 卡钳 + 支架 + 转向节 + 螺钉 + 4 个车轮占位） |
| Joint | 3（轮毂转动、卡钳支架固定、卡钳导向滑动） |
| Constraint | 6（上/下摆臂圆、主销长度、拉杆长度、轮心高度、减振器输出） |
| REF | 3（制动盘总成、卡钳总成、转向节） |
| BOM | 4（法兰、5 螺柱、螺钉、车轮） |
| SourceEvidence | 4（RP-01/R-06/R-11/R-12） |
| SimulationRun | 1（inputRevision=3，CURRENT） |

**FAM-130-007 审计**：`familyMembers('FAM-130-007')` 返回 `PART-30-009`、`PART-30-017`、`PART-30-029` 三个，不按家族去重。`PART-30-029` 是螺母配对件，不是螺柱重复项。

### 6.2 可动 FL 轮端 `fixtures/fl-wheel-end.json`

| 项 | 数量/内容 |
|---|---|
| 系统 | 3（SYS-20/30/40） |
| AssemblyDefinition | 5（ASSY-30-001/002、ASSY-40-009/008、ASSY-20-001） |
| Assembly 实例 | 5（FL 轮端、FL 轮毂轴承、FL 制动盘、FL 卡钳、FL 悬架） |
| PartDefinition | 8 |
| PartInstance | 11（法兰 + 5 螺柱 + 卡钳 + 支架 + 转向节 + 螺钉 + 车轮） |
| Joint | 3 |
| Constraint/Output | 6 |
| REF | 3 |
| BOM | 4 |
| SourceEvidence | 4 |
| SimulationRun | 1（inputRevision=3，CURRENT） |

FL 轮端的 5 个螺柱实例共享 `PART-30-009`，PCD 114.3 mm、72° 等分；`REF-30-001` 制动盘总成不计入 BOM；`CON-SHOCK-OUTPUT` 是 `OUTPUT`，不是约束。

---

## 7. 校验规则与负例

### 7.1 错误码

| 组 | 码 | 含义 |
|---|---|---|
| 工程 | `DOMAIN-E-SCHEMA/PROJECT/REVISION/VARIANT` | 版本/工程/rev/variant |
| 身份 | `DOMAIN-E-ID-MISSING/ID-DUPLICATE` | 缺 ID/重复 ID |
| 系统/总成 | `DOMAIN-E-SYSTEM-REF/ASSEMBLY-DEF/ASSEMBLY-PARENT/ASSEMBLY-CYCLE` | 树/定义/父链 |
| 零件 | `DOMAIN-E-PART-ID/PART-REF/ASSEMBLY-REF/FRAME-REF` | 定义/实例引用 |
| 代际 | `DOMAIN-E-GEN/GEN-MIX` | generation 必须 GEN1/GEN3；实例不能跨代 |
| 变型 | `DOMAIN-E-VARIANT-REF` | 实例 variant 与工程不一致 |
| 证据 | `DOMAIN-E-EVIDENCE-MISSING/EVIDENCE-UPGRADE/SOURCE-MISSING/SOURCE-REF/UNKNOWN-VALUE` | 证据继承/来源/UNKNOWN |
| Frame | `DOMAIN-E-FRAME-UNIT/UNIT-MISMATCH/FRAME-ORIGIN/FRAME-ROTATION/FRAME-RIGID/FRAME-PARENT/FRAME-CYCLE/MIRROR/SCALE` | 单位/刚体/镜像/父子 |
| Joint | `DOMAIN-E-JOINT-TYPE/JOINT-FRAME/JOINT-AXIS/JOINT-LIMIT/JOINT-LIMIT-UNIT` | 类型/帧/轴/限位 |
| Constraint | `DOMAIN-E-CONSTRAINT-KIND/TYPE/CONSTRAINT-AS-JOINT` | 约束不得混入 Joint |
| 数量/REF | `DOMAIN-E-QTY/QTY-MISMATCH/QTY-FACT/QTY-LEVEL/REF-AS-BOM/REF-TARGET/REF-DOUBLE-COUNT` | 5/20、REF 不计数 |
| Asset | `DOMAIN-E-ASSET-STATUS/ASSET-PART/ASSET-UNIT/ASSET-PLACEHOLDER/ASSET-FID/ASSET-OVERCLAIM` | 演示/占位/越级声明 |
| Run | `DOMAIN-E-RUN-REV` / `DOMAIN-W-STALE-RUN` | 旧结果过期 |

### 7.2 14 个实际测试

命令：

```bash
node --test src-experiments/domain-contract-v1/tests/domain.test.mjs
```

实际结果：14/14 通过。覆盖：

| 测试 | 结果 |
|---|---|
| 整车骨架 10 系统/4 轮端，显示快照 | PASS |
| FL 轮端 5 螺柱、REF 不计数、RUN CURRENT | PASS |
| 新增/移动实例、序列化/恢复保持 ID | PASS |
| Gen1/Gen3 混配（add 与 selectVariant）拒绝 | PASS |
| 重复 instanceId 拒绝 | PASS |
| ASSUMPTION→SOURCED 拒绝 | PASS |
| 参数变更后 RUN 变 STALE | PASS |
| mm/m、scale 1.1、隐式镜像拒绝 | PASS |
| REF 与直接件同总成重复计数拒绝 | PASS |
| REF 当 BOM 拒绝 | PASS |
| Constraint 混入 Joint 拒绝 | PASS |
| FAM-130-007 三成员不去重 | PASS |
| 显示变换 m/Y-up、instanceId 稳定 | PASS |
| serialize/restore 拒绝坏 revision | PASS |

### 7.3 这些测试证明/没证明

**证明**：工程对象能在无几何情况下被选中/枚举；规则能拒绝代际混配、证据升级、重复 ID、过期结果、错误 Frame/单位/镜像、REF 重复、Constraint/Joint 混淆、家族错误去重。

**没证明**：真实尺寸/配合/预紧/轴承内部/材料/质量/热/疲劳/碰撞；世界 Frame 未冻结；别名未确认；Joint/Constraint 边界未冻结；14/14 不是实车装配验证。

---

## 8. 与现有模块/工作位的对齐

### 8.1 与 `workbench-v2/project-store.mjs`

现有 V2 ProjectStore 使用 `projectId/name/assemblies[].instances[].instanceId/partKey`，是 DEMO 数据契约。R-17 的候选差异：

| R-17 | V2 DEMO | 建议 |
|---|---|---|
| `partInstances` 独立集合 + `assemblyId` | `instances` 内嵌在 assembly | 迁移时保留 `instanceId` 作为唯一选择键 |
| `PartDefinition.partId` | `partKey` | 以 RP-01 `PART-*` 为规范；`partKey` 只作 catalog 别名 |
| `matrixWorld` 由 Frame 链计算 | `offset` 平移 | 用 Frame 链替代裸 offset；不要用 Object3D 名 |
| `SimulationRunRef.inputRevision` | 无 | 新增结果过期机制 |
| `Joint/Constraint` 分开 | 无 | 先只读展示，不伪造求解 |

### 8.2 与 R-16（Qwen4 对象树）

需要对齐：`systemId`/`assemblyId`/`instanceId` 的稳定 ID；`assemblyDefinitions` vs `assemblies`；`qty` 的 per-parent/total 口径；`applicableWhen`/`evidenceInherited`；`REF` 不计 BOM。R-17 已发公共消息。

### 8.3 与 R-18（Grok 求解器）

R-17 的 `Joint` 只放实际运动副（轮毂转动、卡钳固定/滑动）；悬架的上/下摆臂圆、主销长度、拉杆长度、轮心高度在 `Constraint`，减振器是 `OUTPUT`。`SimulationRunRef.inputRevision` 用于过期。R-18 输出应引用 `jointId`/`constraintId` 与 `runId`，而不是只给视觉位姿。

### 8.4 与 R-20（Composer 查看器）

`snapshotForRender()` 的契约是 `{instanceId, partId, assemblyId, units:'m', up:'Y', matrixWorld}`；查看器用 `instanceId` 做选中/高亮/剖切，不用 Object3D 名；不新增端口。R-17 已发公共消息。

### 8.5 与 Blueprint / Runtime

- 符合蓝图 `Project / Variant / PartDefinition / PartInstance / Assembly / MountFrame / Joint / Constraint / BOM` 候选分层。
- 符合 `CARLAB_RUNTIME` 的 5173/5174 两入口、对象树 ≠ 业务菜单、5175 停用；本原型不启动端口。
- 不修改 `src/`、`workbench-v2/`、旧页面或其他模型目录。

---

## 9. 未决与冲突

| ID | 未决 | 影响 |
|---|---|---|
| D-02 | `SYS-*` ↔ RP-01 `PART/ASSY-*` 是否同一实体 | 别名仍 `PROPOSED` |
| D-04 | qty 是否 per-parent + vehicleTotalQty | 5/20 口径 |
| D-05 | Joint vs Constraint 正式边界 | R-17 已分开，但未冻结 |
| Frame | 世界 Frame 是否正式采用 `+X 左/+Y 上/+Z 前` | 本原型只是候选 |
| P17 | `KIN-E-CONVERGE` 是否新增收敛规则 | 本原型不冒充 |
| ERR | R-08/R-09/R-10/R-12/R-17 错误码合并 | 多套错误码 |
| Gen3 | Gen3 CAD/螺柱/安装面真实数据 | 只有定义，没有资产 |
| M14 | R-03 名称的 M14 与 R-11 的 M12 不一致 | 不得把 M14 当事实 |
| FASTENER | RP-01 无“螺柱+螺母 vs 螺栓式”选择组 | 纯螺栓式车型无法表达 |
| 493 | RP-01 493 件几何来源不足 | 不能批量生成“真实零件” |

---

## 10. 下一步

1. GPT-6 裁决 D-02/D-04/D-05/Frame/ERR；裁决前 R-17 保持候选、别名待确认、世界 Frame 不冻结。
2. 与 R-16 对齐 `systemId/assemblyId/instanceId` 和对象树；与 R-18 对齐 `Joint/Constraint/SimulationRun`；与 R-20 对齐 `instanceId → matrixWorld` 的查看器契约。
3. 等 Qwen4/Gemini 补 Gen3 与紧固件真实数据；在数据到齐前只做 FID-V/占位，不升级为 FID-G。

---

## 11. 文件与复现

| 文件 | 作用 |
|---|---|
| `src-experiments/domain-contract-v1/domain.mjs` | 领域模型/ProjectStore/validateProject |
| `src-experiments/domain-contract-v1/fixtures/vehicle-skeleton.json` | 整车骨架 fixture |
| `src-experiments/domain-contract-v1/fixtures/fl-wheel-end.json` | FL 轮端 fixture |
| `src-experiments/domain-contract-v1/tests/domain.test.mjs` | 14 个 Node 测试 |
| `src-experiments/domain-contract-v1/run-checks.mjs` | 两份 fixture 的检查摘要 |
| `src-experiments/domain-contract-v1/README.md` | 运行说明 |
| `agent-workspace/agents/deepseek/reports/R-17-domain-check-results.json` | 实跑摘要 |
| `agent-workspace/agents/deepseek/reports/R-17.md` | 个人回报 |

```bash
node src-experiments/domain-contract-v1/run-checks.mjs
node --test src-experiments/domain-contract-v1/tests/domain.test.mjs
```

实际：`run-checks` 两份 fixture `ok=true`；测试 14/14 PASS。

## 12. 来源

- `docs/planning/VEHICLE_BLUEPRINT_V1.md`（DRAFT）
- `docs/command/CARLAB_RUNTIME.md`
- `docs/planning/evidence/RP-01-tree-chassis.json`
- `docs/research/R-06-minimal-assembly-bom.json`
- `docs/research/R-11-geometry-anchor-study.md`
- `docs/research/R-12-conditional-adapter-report.md`
- `docs/research/R-02-data-contract-report.md`、`R-07-interface-reconciliation.md`、`R-10-interface-adapter-fixture.md`
- `agent-workspace/shared/messages/MSG-20261114-2330-qwen4-to-all-alias-evidence.md`、`MSG-20261115-0010-qwen4-to-deepseek-r12-qty.md`
- `docs/command/reviews/AUDIT_2026-11-15_BATCH4.md`
