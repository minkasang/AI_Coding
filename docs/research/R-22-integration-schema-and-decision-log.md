# R-22｜整车对象与机构位姿整合 Schema 与决策日志（候选）

- 任务：R-22 / displayCode 03.24《将整车对象与机构运动接到同一工程数据》
- 状态：`CANDIDATE_NOT_FROZEN`，不是正式 Schema，不是量产数据源
- 日期：2026-11-15
- 实现：`src-experiments/vehicle-integration-v1/`
- 产物：`fixtures/integration-output.json`、`fixtures/domain-view-fl-sla.json`
- 个人回报：`agent-workspace/agents/deepseek/reports/R-22.md`
- 实跑结果：`agent-workspace/agents/deepseek/reports/R-22-integration-results.json`

## 1. 结论先说

这一轮做成了**第一条可追踪的跨模型数据链**，但不是“整车已经统一”。

| 做了什么 | 真实结果 |
|---|---|
| 读入 R-16 候选整车树 | 13 系统 / 53 子系统 / 108 总成定义 / 493 零件定义 / 278 零件实例 / 37 总成实例 / 37 局部 Frame / 35 REF，全部进入候选 `VehicleProject` |
| 读入 R-17 领域合同 | 稳定 ID、Frame、Joint/Constraint/Output、SourceEvidence、SimulationRun 语义全部映射；另生成一个 4 实例的 R-17 可执行投影，原 `validateProject` 直接通过 |
| 读入 R-18 位姿 | 5 个源位姿中 4 个绑定到 R-16 规范实例；1 个（转向横拉杆）因 R-16 定义为 `DEFERRED`、没有实例，保持未绑定且不发布 |
| 缺几何 | 278/278 个实例 `NO_GEOMETRY`，0 个 Mesh/GLB/伪几何 |
| 世界坐标 | 37/37 个 R-16 安装 Frame 无 origin/rotation，全部 `UNANCHORED_UNKNOWN`；不输出整车生产显示矩阵 |
| 可复核显示 | 只有 R-18 的 `FR-VEHICLE` 虚构演示帧给出 4 个 m / Y-up 刚性矩阵，`production:false`，行列式 +1、单位列长、平移与位姿一致 |
| 来源等级 | R-16 的 46 个来源引用保持 `UNVERIFIED_REFERENCE`；没有把字符串自动升成 OEM 或 `SOURCED` |

**不允许从本产物直接得出**：整车 CAD 已完成、278 个零件有真实几何、悬架已做真实多体动力学、硬点是 OEM 数据、可以按错版播放旧结果、左右件可以靠负缩放复制。

## 2. 输入与可追溯性

| 角色 | 文件 | SHA-256（前 16 位） | 声明状态 | 提供者 |
|---|---|---|---|---|
| 整车对象树 | `docs/research/R-16-vehicle-skeleton.fixture.json` | `20af8ba0444c68b7` | `CANDIDATE_NOT_FROZEN` | Qwen4 |
| 领域合同 | `src-experiments/domain-contract-v1/domain.mjs` | `dbad1bafddec566b` | `carlab.domain-contract/0.1.0-proposal` | DeepSeek |
| FL 轮端夹具 | `src-experiments/domain-contract-v1/fixtures/fl-wheel-end.json` | `18f5b4034ac67936` | 同上 | DeepSeek |
| 位姿结果 | `src-experiments/mechanism-vertical-slice-v1/R-18-results.json` | `4176236cf15e4bf0` | `DEMO_ASSUMPTION / FICTIONAL_FIXTURE` | Grok |
| 演示硬点 | `src-experiments/kinematics/fixture-demo.json` | `9cdc6e8241a5f539` | `DEMO_ASSUMPTION` | Grok |

`run-checks.mjs` 每次重新计算这 5 个文件的 SHA-256；任一输入被改动而 pin 未更新，`verifyInputHashes` 返回 `VEH-E-INPUT-HASH`。本产物不复制、不覆盖 R-16/R-17/R-18 的原文件。

## 3. 整合结构

```text
VehicleProject（整车候选树，全部无几何）
├─ systems / assemblyDefinitions / assemblyInstances
├─ partDefinitions / partInstances / mountFrames
├─ references（35，countedInBom=false）
├─ bomLines（190，按父实例聚合）
├─ qtyAudit（12 个冲突与 R-16 声明逐项对齐）
└─ geometryPolicy（278 个 NO_GEOMETRY，0 个可生产渲染）

DeepSlice（FL 双叉臂虚构纵切）
├─ frames（9 个 m / Y-up 演示 Frame）
├─ hardpoints（13 个 DEMO 硬点，方向向量无量纲）
├─ joints（5 个 DEMO Joint）
├─ rejectedJoints（3 个带拒绝码的候选）
├─ constraints（6 个，其中 1 个 OUTPUT）
└─ PoseRun（4 个已绑定、1 个未绑定、9 个行程样本）

DomainView（R-17 可执行投影）
└─ 4 实例 / 5 Joint / 6 Constraint+Output，原 validateProject 0 错误
```

两层输出是刻意的：**整车树保持完整但不可渲染**；**纵切可执行但明确是 DEMO**。不把 278 个实例硬塞进一个只有 3 个系统、11 个实例的 R-17 fixture 里假装统一。

## 4. 身份映射

### 4.1 规范身份

| 对象 | 规范 ID | 来源 | 说明 |
|---|---|---|---|
| 零件实例 | `PI-<系统>-<序号>-<角位>[-<序>]` | R-16 | 唯一工程身份；不取自 GLB `Object3D.name` |
| 总成实例 | `AI-<系统>-<序号>-<角位>` | R-16 | 装配/采购边界实例 |
| 安装 Frame | `FR-<系统>-<序号>-<角位>` | R-16 | 局部 Frame，无世界坐标 |
| 零件定义 | `PART-<系统>-<序号>` | R-16/RP-01 | 一个实体只有一个规范定义节点 |
| 视图局部别名 | `INST-*` | R-17 fixture / R-18 | **不是**第二工程身份；只作为当前 R-17 验证器的键 |

R-17 的 `DOMAIN-E-INSTANCE-ID` 要求 `INST-*`，与 R-16 的 `PI-*` 直接冲突。本整合不悄悄改名：`domainView.partInstances[]` 同时携带：

```json
{
  "instanceId": "INST-SLA-UPPER-ARM-FL",
  "engineeringInstanceId": "PI-20-001-FL",
  "aliasStatus": "VIEW_LOCAL_NOT_CANONICAL"
}
```

消费者若把 `INST-*` 当工程身份使用，就是错误。规范身份始终是 `engineeringInstanceId` / R-16 的 `PI-*`。

### 4.2 R-17 夹具交叉映射

R-17 FL 轮端夹具共 11 个实例：**10 个按 partId + corner + ordinal 绑定到 R-16，1 个无绑定**。

| R-17 实例 | R-16 规范实例 | 结果 |
|---|---|---|
| `INST-HUB-FL` | `PI-30-006-FL` | BOUND |
| `INST-KNUCKLE-FL` | `PI-20-016-FL` | BOUND |
| `INST-CALIPER-FL` | `PI-40-034-FL` | BOUND |
| `INST-STUD-FL-1..5` | `PI-30-009-FL-01..05` | BOUND（按序数） |
| `INST-DISC-SCREW-FL` | `PI-30-031-FL` | BOUND |
| `INST-WHEEL-FL` | `PI-30-019-FL` | BOUND |
| `INST-CALIPER-BRACKET-FL` | **无** | UNBOUND：`PART-40-048` 在 R-16 是 `DEFERRED` |

R-17 fixture 中 2 个实例（转向节、轮毂）与 R-18 位姿有共同规范身份；另外 2 个 R-18 位姿（上/下摆臂）在 R-17 fixture 中没有对应实例。因此 `boundToR17=2/5`，不能声称两份 demo 已经同一套数据。

### 4.3 R-18 位姿身份

| R-18 源实例 | 声明零件 | R-16 规范实例 | 结果 |
|---|---|---|---|
| `INST-SLA-UPPER-ARM-FL` | `PART-20-001` | `PI-20-001-FL` | BOUND |
| `INST-SLA-LOWER-ARM-FL` | `PART-20-008` | `PI-20-008-FL` | BOUND |
| `INST-SLA-UPRIGHT-FL` | `PART-20-016` | `PI-20-016-FL` | BOUND |
| `INST-SLA-HUB-FL` | `PART-30-006` | `PI-30-006-FL` | BOUND |
| `INST-SLA-TIEROD-FL` | `PART-20-075` | **无** | UNBOUND：定义为 `DEFERRED`，无实例 |

转向横拉杆的原始位姿值保留在 `poseRun.unboundPoses[].observedPose`，但 `published:false`、`instanceId:null`。**没有伪造一个 `PI-20-075-FL`**。如果未来 R-16 实例化了该零件，交叉映射会按 part+corner+ordinal 自动绑定；若四个核心位姿中任一缺失，构建直接以 `R22-E-DEEP-SLICE-POSE-MISSING` 拒绝生成纵切。

## 5. 数量口径（D-04）——本轮最重要的数据修正

R-16 的 `qtyPerCorner` 是**每角需要几个物理实例**，不是“每个实例自身数量”。V03 的“每角实例数 == qtyPerCorner”正是这个意思。之前如果把每个实例的 `qtyPerCorner` 再相加，会重复计数：

| 零件 | 每角实例数 | 实例总数 | naive 求和 `qtyPerCorner` | 按物理件数 | R-16 继承整车总数 |
|---|---:|---:|---:|---:|---:|
| 车轮螺柱 `PART-30-009` | 5 | 20 | **100** | **20** | 20 |
| 上摆臂衬套 `PART-20-002` | 2 | 4 | 8 | 4 | 4 |
| 稳定杆连杆球铰 `PART-20-035` | 4 | 4 | 16 | 4 | 4 |

整合规则：

1. 每个 `PI-*` 实例 `quantity.perAssembly = 1`；
2. R-16 的 `qtyPerCorner` 原值保留为 `quantity.sourceQtyPerCorner`，仅作追溯；
3. BOM 行按“父总成实例 + 零件”聚合， `qtyPerAssembly = 该父下物理实例数`；整车树得到 190 条 BOM 行；
4. 整车总数由实例数归集，再与 R-16 继承总数比较。

按物理实例数重算后，恰好只有 **12 个**零件与继承总数不一致，且与 R-16 自己声明的 `qtyConflicts` **一一对应**，没有额外隐藏冲突：

| 零件 | 名称 | 继承总数 | 本变型物理实例数 |
|---|---|---:|---:|
| `PART-40-034` | 卡钳体 | 4 | 2 |
| `PART-40-035` | 卡钳活塞 | 4 | 2 |
| `PART-40-036` | 活塞矩形密封圈 | 4 | 2 |
| `PART-40-037` | 活塞防尘罩 | 4 | 2 |
| `PART-40-038` | 卡钳导向销（浮动式） | 8 | 4 |
| `PART-40-039` | 导向销防尘套 | 8 | 4 |
| `PART-40-040` | 放气螺钉 | 4 | 2 |
| `PART-40-041` | 卡钳安装螺栓 | 8 | 4 |
| `PART-40-042` | 摩擦片总成 | 8 | 4 |
| `PART-40-043` | 消音片 | 8 | 4 |
| `PART-40-044` | 防响夹/固定销/弹簧 | 8 | 4 |
| `PART-40-046` | 通风制动盘 | 4 | 2 |

原因是本变型 `CG-RBRK=ASSY-40-010` 为后轴鼓式，而 RP-01 的这 12 项按四轮盘式标注。整合**保留继承值可见 + 按物理件实例化 + 差额 OPEN**，不静默取整、不改 RP-01 原数据。

`qtyAudit.status = CONSISTENT`；`unlistedMismatchIds=[]`、`declaredButMatchingIds=[]`。若未来 R-16 改动导致新增未声明冲突，状态会变为 `DIVERGED`，`run-checks` 以非零退出，不会被静默吞掉。

## 6. Frame、单位、镜像与显示变换

### 6.1 R-16 安装 Frame

- 37/37 只有 `originSemantics:"相对基准，未给世界绝对坐标"`，没有数值 origin/rotation；
- 整合中 `anchorStatus=UNANCHORED_UNKNOWN`、`origin=null`、`rotation=null`、`units=null`；
- 因此**不存在**从整车树生成的生产显示矩阵；任何试图给它们填 `[0,0,0]` 或猜一个位置的行为都被 `VEH-E-FRAME-STATE` 拒绝。

### 6.2 FL 演示帧

R-18 的 `FR-VEHICLE` 是虚构演示帧：

- 单位 m，Y-up，右手系；运行时轴向证据为 `+X 左 / +Y 上 / +Z 前`（R-17/R-20 已核对；本整合不重新定义）；
- 9 个演示 Frame 全部 `space=VEHICLE_DEMO`，origin 来自 R-18 位姿或 R-04/R-18 虚构硬点，`originBasis=DEMO_ASSUMPTION`；
- **它不给任何 R-16 安装 Frame 提供锚点**，两者不能相加或互换。

### 6.3 mm / m

- 源头 CAD/工程输入按 mm 记录，运行时统一 m；显式换算系数 `0.001`；
- `unitsPolicy.implicitGlobalScale=false`，禁止隐式全局缩放；
- R-18 的 M06 已证明“输入工程 mm 的求解路径”与“车辆 m 位姿”收敛到同一解：hub 在两条路径下均为 `[0.72, ~0, ~0]` m；
- 注意：M06 的**输出**仍是 m，不是 mm；`unitsPolicy.evidence` 同时记录 `inputFrameUnits:"mm"` 与 `solvedHubM`，避免把输出误读成毫米。

### 6.4 显示变换

`poseRun.displayTransforms` 给出 4 个可复核矩阵：

- 4×4 仿射，底行 `[0,0,0,1]`；
- 左上 3×3 行列式 +1，三列长度均为 1（无缩放、无反射）；
- 平移列与 R-18 位姿 `positionM` 逐项相等；
- `units:"m"`、`up:"Y"`、`frameId:"FR-VEHICLE"`、`production:false`；
- 反向测试：把一列取负 → `VEH-E-MIRROR`；把一列乘 2 → `VEH-E-SCALE`。

### 6.5 左右镜像

- R-16 所有相关实例的 `handednessPolicy.globalScaleForbidden=true`；
- 本产物不发布右侧位姿，不生成负缩放副本；
- R-18 M05 用独立镜像后的硬点重新求解，得到 `leftX=0.72`、`rightX=-0.72`，这是“再生成镜像几何/独立求解”的证据，而不是把左侧乘 -1；
- `poseRun.mirrorPolicy.rightSidePublished=false`。

### 6.6 两份 FL 夹具的数值冲突

R-17 夹具 `FR-WHEEL-END-FL` 的 origin 是 `[0.84, 0.32, 1.23]` m；R-18 hub 位姿是 `[0.72, ~0, ~0]` m。差值 `[0.12, 0.32, 1.23]` m，模长 **1.276597 m**。两者都自称 FL、但都不是有来源的实车坐标。整合**只做身份交叉映射，不合并数值 Frame**；这也是为什么 `boundToR17` 只有 2，而不是把两份 demo 硬拼成一套。

## 7. Joint / Constraint / Output

### 7.1 已接纳的 5 个 Joint（全部 DEMO）

| Joint | 类型 | Frame A → B | 硬点依据 |
|---|---|---|---|
| `J-UPPER-ARM-FL` | REVOLUTE | `FR-DS-CHASSIS-UPPER-FL` → `FR-DS-UPPER-ARM-FL` | R-18 上摆臂轴 A/B |
| `J-LOWER-ARM-FL` | REVOLUTE | `FR-DS-CHASSIS-LOWER-FL` → `FR-DS-LOWER-ARM-FL` | R-18 下摆臂轴 A/B |
| `J-UPPER-BALL-FL` | SPHERICAL | 上摆臂 → 转向节 | `upperBall` |
| `J-LOWER-BALL-FL` | SPHERICAL | 下摆臂 → 转向节 | `lowerBall` |
| `J-DS-HUB-FL` | REVOLUTE | 转向节 → 轮毂 | `wheelCenter` + `spindleAxis`；模板来自 R-17 `J-HUB-FL` |

全部 `hardpointBasis=DEMO_ASSUMPTION`、`evidenceInherited=DEMO_ASSUMPTION`、`status=PROPOSED_DEMO`。它们回答“谁和谁可以相对转动/球铰”，不是“真实衬套刚度/球头锥度”。

### 7.2 被拒绝的 3 个候选

| 候选 | 拒绝码 | 原因 |
|---|---|---|
| `J-TIEROD-INNER-FL` | `VEH-E-JOINT-INSTANCE-MISSING` | R-16 `PART-20-074` 为 `DEFERRED`，无 `PI-*` 实例 |
| `J-TIEROD-OUTER-FL` | `VEH-E-JOINT-INSTANCE-MISSING` | R-16 `PART-20-075` 为 `DEFERRED`，R-18 拉杆位姿也未绑定 |
| `J-UPPER-ARM-CHASSIS-FL` | `VEH-E-JOINT-NO-HARDPOINT` | 试图把 Joint 挂到 R-16 `FR-20-002-FL`，该 Frame 无硬点 |

这证明“无硬点/无实体”的 Joint 不会被默默接纳。

### 7.3 Constraint 与 Output

6 个 `Constraint` 沿用 R-17 模板 ID：

`CON-SUSP-UPPER-CIRCLE`、`CON-SUSP-LOWER-CIRCLE`、`CON-KINGPIN-LENGTH`、`CON-TIE-ROD-LENGTH`、`CON-WHEEL-CENTER-HEIGHT`、`CON-SHOCK-OUTPUT`。

- 前五个 `jointOrConstraint=CONSTRAINT`；
- `CON-SHOCK-OUTPUT` 是 `OUTPUT`，减振器长度 `0.43025951471176094 m`，**不是 Joint**；
- 转向横拉杆长度约束保留为 `DEMO_ONLY_UNBOUND_BODY`：它是解算方程，但没有规范拉杆实例，不能声称已装配；
- `CON-SHOCK-OUTPUT` 若被塞进 `joints`，验证器以 `VEH-E-CONSTRAINT-AS-JOINT` 拒绝。

## 8. PoseRun 与 SimulationRun

| 字段 | 值 |
|---|---|
| `runId` | `RUN-R22-FL-SLA-DEMO-001` |
| 源 | R-18 `designSample` + 9 个行程样本 |
| `inputRevision` / `projectRevision` | 1 / 1 |
| `status` | `CURRENT` |
| `valueBasis` | `DEMO_ASSUMPTION` |
| `provenance` | `FICTIONAL_FIXTURE` |
| `instanceIdStatus` | `CANDIDATE_NOT_FROZEN` |
| 已绑定位姿 | 4 |
| 未绑定位姿 | 1（转向横拉杆，`published:false`） |
| 力 | `null` / `UNKNOWN` |
| 间隙 | 声明球代理，`notCadCollision:true` |

规则：

1. `inputRevision` 必须是正整数；与工程修订不一致且状态仍为 `CURRENT` → `VEH-E-RUN-STALE`；
2. `STALE` 的 run 不允许带已发布位姿；
3. `projectRevision` 必须等于 `vehicleProject.revision`；
4. `runPolicy.staleRunsPublishPoses=false`；
5. R-18 的 M05/M06 证据随 run 保留，但**不**把旧 run 当当前结果播放。

**运行谱系冲突**：Grok R-23 的 `RUN-SLA-FL-DEMO-001` 使用 `inputRevision=3`，对应 R-17 夹具；本整合是 revision 1、另一组输入。两者都是 FL demo，但不能互相重放或覆盖。这写入 `CF-R22-08`。

## 9. 证据等级与来源

| 事实 | 等级 |
|---|---|
| R-16 树的结构/身份 | `SOURCED_SECONDARY` 124 个实例 / `ASSUMPTION` 152 / `UNKNOWN` 2（identityBasis） |
| 278 个实例总体 `valueBasis` | **全部 `UNKNOWN`** |
| 278 个实例子 `geometryBasis` | **0 个 `SOURCED`**；其余 UNKNOWN/DEMO |
| R-18 位姿/硬点 | `DEMO_ASSUMPTION` / `FICTIONAL_FIXTURE` |
| R-16 外部 source refs（46 个 ID） | `UNVERIFIED_REFERENCE`；本轮未重开原始来源 |
| 整合实际核验的 | 5 个输入文件的 SHA-256；不含 OEM 图纸、材料证书或实测几何 |

`PART-20-001` 继承 `SOURCED_SECONDARY`（不是 `SOURCED`）；42 个 R-16 来源引用不因为出现在 JSON 里就变成 OEM 证据。任何 `UNKNOWN`/`ASSUMPTION` 想升级，验证器以 `VEH-E-EVIDENCE-UPGRADE` 拒绝；`SOURCED` 无来源以 `VEH-E-SOURCE-MISSING` 拒绝。

## 10. Scope 与覆盖率（不假装已经统一）

| 维度 | R-16 候选树 | R-17 夹具 | R-18 位姿 | 本整合可执行纵切 |
|---|---:|---:|---:|---:|
| 系统 | 13 | 3 | — | 3（含 VEH-001 根） |
| 子系统 | 53 | — | — | — |
| 总成定义 / 实例 | 108 / 37 | 5 / 5 | — | 7 / 6 |
| 零件定义 / 实例 | 493 / 278 | 8 / 11 | 5 个位姿实例 | 4 / 4 |
| Joint | 0（无硬点） | 3 | 0（求解器内部） | 5 |
| Constraint/Output | 0 | 6 | 求解器方程 | 6 |
| 有来源几何 | 0 | 0 | 0 | 0 |
| NO_GEOMETRY | 278 | — | — | 4 |
| 有锚点 Frame | 0/37 | 夹具内 21 | 1 个演示帧 | 9 个演示帧 |
| 可用 DEMO 硬点求解 | 0/37 总成 | — | 1 个 FL 纵切 | 4/4 位姿 |
| 真实世界坐标 | 无 | 无 | 无 | 无 |

覆盖率结论：

- 整车树覆盖 **278/278** 个 R-16 实例，但几何覆盖 **0/278**；
- R-17 夹具覆盖 **10/11** 个实例有规范 R-16 身份；
- R-18 位姿覆盖 **4/5** 有规范 R-16 身份，**2/5** 与 R-17 夹具共享身份；
- 全车 37 个总成实例中，只有 **4** 个出现在 DEMO 纵切里；**0** 个有来源硬点；
- 这不是“同一全车数据源已形成”，而是“第一条可追踪的跨模型桥”。

## 11. 待 GPT-6 裁决项

| 决策 | 建议 | 影响 |
|---|---|---|
| `D-R22-01` instanceId 命名空间 | R-16 `PI-*` 为规范；`INST-*` 仅为视图别名。请修改 R-17 前缀规则或正式宣布 `PI-*` 规范 | 不改：每次集成都要双 ID；改：R-17 验证器和消费者统一 |
| `D-R22-02` R-18 身份复用 | 以后 R-18/R-23 输出必须带规范 `PI-*`；无实例的零件不得发布位姿 | 避免再靠交叉映射猜身份 |
| `D-R22-03` FL Frame 冲突 | R-17 夹具与 R-18 演示帧保持分离，等待 RP-07 世界 Frame；不得数值合并 | 防止把 1.276597 m 的差异当误差修掉 |
| `D-R22-04` R-17 夹具独有实例 | `PART-40-048` 是否属于本变型由 Qwen4/DeepSeek 复核；未复核前保持 UNBOUND | 影响 1/11 夹具实例 |
| `D-R22-05` 变型与身份 | 一份整合只对应一个明确变型（GEN1 `VAR-R16-BOF-ICE`）；`PI-*` 暂不假设跨变型安全 | 影响 Gen1/Gen3 共用 ID 的风险 |
| `D-R22-06` 整车 Frame 锚点 | RP-07 提供有来源锚点前，37 个 Frame 保持 UNANCHORED，不输出生产显示矩阵 | 影响整车渲染与装配检查 |
| `D-R22-07` 数量口径 | 采纳“qtyPerCorner = 每角物理实例数；每个 PI = 1 件”；BOM 按父实例聚合 | 避免 20 螺柱变 100 的重复计数 |
| `D-R22-08` Run 谱系 | Run 必须绑定规范 instanceId + input revision + 输入哈希；跨 revision 一律 STALE | 影响 R-23/R-25 的播放与回放 |
| `D-R22-09` 来源核验 | 建立真实 evidence registry；仅字符串不算已核验；无 artifact 时保持 UNVERIFIED | 防止来源自动升 OEM |
| `D-R22-10` 12 项数量冲突 | 保留继承值可见 + 物理实例数 + OPEN，等待最终整车总数政策 | 影响制动件 BOM 与采购数量 |

## 12. 验证与复现

```text
node src-experiments/vehicle-integration-v1/run-checks.mjs
node --test src-experiments/vehicle-integration-v1/tests/integration.test.mjs
```

实跑结果：

- `run-checks`：退出码 0；`validation.ok=true`，**0 错误、0 警告**；5 个输入哈希全部匹配；
- `qtyAudit.status=CONSISTENT`；12 个派生冲突 = 12 个声明冲突；无未列冲突；
- Node 测试：**41/41 通过**（14 个正向/口径测试、23 个负例、3 个活性对照、1 个身份对照）；
- R-17 原 `validateProject` 对 `domainView` 返回 0 错误，未修改 R-17 模型。

必需的拒绝类别与实测码：

| 类别 | 变异 | 实测码 |
|---|---|---|
| 重复 ID | 克隆一个 `PI-*` | `VEH-E-DUP-ID` |
| 旧 revision | `inputRevision=0` / 修订不一致 | `VEH-E-RUN-REVISION`、`VEH-E-RUN-STALE` |
| 错误单位 | `poseRun.units='mm'` / 演示帧 mm | `VEH-E-UNIT` |
| 错误变型 | 在 GEN1 加入 GEN3 专用 `PART-30-010` | `VEH-E-VARIANT-MISMATCH` |
| 无硬点 | 求解 Joint 硬点为 null / 挂到无锚点 R-16 Frame | `VEH-E-JOINT-NO-HARDPOINT` |
| 不合法 Joint | Constraint ID 当 Joint、未知类型、轴未归一化 | `VEH-E-CONSTRAINT-AS-JOINT`、`VEH-E-JOINT-TYPE`、`VEH-E-JOINT-AXIS` |

额外负例：未绑定姿态被发布、证据升级、NO_GEOMETRY 挂 Mesh、负缩放、反射显示矩阵、缩放显示矩阵、REF 计入 BOM、覆盖汇总过期、数量审计过期、DomainView 帧非法、姿态指向不存在实例、DomainView run 过期、缺少决策引用、输入哈希被篡改。

活性对照（不是静态断言）：

1. 改 R-18 上摆臂位姿 +0.0123 m，整合输出随之变化；
2. 给 R-18 增加一个没有交叉映射的位姿，整合把它列为 `NO_DECLARED_CROSSWALK` 未绑定，而不是丢掉；
3. 删除 R-16 `PI-20-001-FL`，构建以 `R22-E-DEEP-SLICE-POSE-MISSING` 拒绝生成虚假纵切。

## 13. 不做什么

- 不改 `src/main.js`、`workbench-v2/`、旧页面或其它模型私有成果；
- 不新开 5175 或第三个常驻端口；
- 不冻结 R-22/正式 Schema；
- 不给 278 个实例编造几何、质量、材料、硬点或 OEM 来源；
- 不把 R-18 的虚构位姿当真实悬架运动；
- 不把 R-23 的 revision 3 run 与本整合 revision 1 run 混用；
- 不把 R-17 夹具的 21 个 Frame 与 R-18 的 `FR-VEHICLE` 做数值合并。
