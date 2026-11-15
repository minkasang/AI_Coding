# R-21｜整车树与工程实例 ID 的可核验映射

> 工作位：qwen4（整车系统树 · 车型平台）｜任务：R-21 / 03.23｜日期：2026-11-15
> 状态：**submitted，等待 GPT-6 核验**。本文不自行批准。
> 任务书：`docs/tasks/R-21-reconcile-vehicle-tree-domain-instances.md`

---

## 1. 结论摘要

把 **R-16 详细整车树**（13 系统 / 493 定义 / 278 实例）与 **R-17 可执行领域夹具**（10 系统 / 11 定义 / 14 实例）建立了机器可读、可核验的对照表，并把 **R-18 候选位姿**按角色而非身份接入。

**核心原则：保留差异，不为强行统一而丢弃真实节点、不把空几何贴成实体、不静默消掉数量冲突。**

- 映射成功：**10 系统 / 12 总成定义 / 8 总成实例 / 11 零件定义 / 13 零件实例 / 8 总成级 Frame / 5 条 R-18 角色映射**
- 发现 **9 个真实冲突（4 个 P0）**，全部带证据、处置建议与严重度，**没有一个被静默消掉**
- **R-16 的 12 项数量冲突原样保留**，逐条校验未被改动
- 未映射节点全部列出：R-16 侧 482 定义 / 265 实例 / 29 总成实例 / 3 系统；R-17 侧 1 零件实例 / 7 总成实例 / 19 Frame
- **8 项补丁候选，全部 `executed=false`**——不直接改 RP-01/R-16/R-17 任何已验收文件

一句话：**对照表建立了可核验的对应关系与差异清单，没有制造任何新的几何或来源真实性。**

---

## 2. 权威策略与输入

| 角色 | 文件 | 定位 |
|---|---|---|
| **规范权威** | `docs/planning/evidence/RP-01-tree-*.json` | 名称与父级的唯一规范来源（已验收） |
| 详细树 | `docs/research/R-16-vehicle-skeleton.fixture.json` | 13 系统 / 493 定义 / 278 实例 |
| 领域夹具 | `src-experiments/domain-contract-v1/fixtures/vehicle-skeleton.json` | 10 系统 / 11 定义 / 14 实例 |
| 领域夹具 | `.../fixtures/fl-wheel-end.json` | FL 纵切 11 实例 / 3 Joint / 6 Constraint |
| 候选位姿 | `src-experiments/mechanism-vertical-slice-v1/R-18-results.json` | 自标 `CANDIDATE_NOT_FROZEN` / `FICTIONAL_FIXTURE` |

**全部输入只读**，校验器 W18 强制。任何一方都不得覆盖 RP-01 规范名。

R-17 是**简化夹具**，覆盖差是预期而非缺陷；因此"未映射"不等于"错误"，但必须列出而不是丢弃。

---

## 3. 字段映射（任务书必须完成项）

| 层 | R-16 字段 | R-17 字段 | 值域 | 状态 |
|---|---|---|---|---|
| Project | **无此层** | `projectId` | `PROJECT-CARLAB-DEMO` | **R17_ONLY_GAP**（CF-09） |
| VehicleVariant | `variant.id` | `variant.variantId` | `VAR-R16-BOF-ICE` vs `VV-A-SWB-STD` | **NEEDS_ADJUDICATION**（CF-09） |
| System | `systems[].id` | `systems[].systemId` | `SYS-*` | **ALIGNED**（值域一致，数量 13 vs 10） |
| Assembly 定义 | `assemblies[].id` | `assemblyDefinitions[].assemblyId` | `ASSY-*` | **NEEDS_ADJUDICATION**（同值异义，CF-01） |
| Assembly 实例 | `assemblyInstances[].instanceId` | `assemblies[].assemblyId` | `AI-*` vs `ASM-*` | **MAPPABLE_PARTIAL**（经 definitionRef+corner） |
| Part 定义 | `partDefinitions[].id` | `partDefinitions[].partId` | `PART-*` | **ALIGNED**（4 项名称漂移，CF-03） |
| Part 实例 | `partInstances[].instanceId` | `partInstances[].instanceId` | `PI-*` vs `INST-*` | **MAPPABLE_PARTIAL**（经 part+corner+ordinal） |
| MountFrame | `mountFrames[].frameId` | `frames[].frameId` | `FR-*` 两套语义 | **GRANULARITY_MISMATCH**（CF-05） |

**System 功能分类 vs Assembly 装配容器**已明确区分：R-16 的 `systems`/`subsystems` 是功能分类，`assemblies` 带 `purchaseBoundary`（3 个标 `PURCHASED_NON_SERVICEABLE`）是装配容器；R-17 的 `assemblyDefinitions` 是容器定义、`assemblies` 是容器实例。对照表不把两者混为一层。

### 3.1 枚举映射（不得混用同名字段而不转换）

| 枚举 | R-17 值域 | R-16 值域 | 映射 |
|---|---|---|---|
| `evidenceInherited` | EVIDENCE / ASSUMPTION / OPEN | SOURCED_SECONDARY / ASSUMPTION / UNKNOWN | EVIDENCE→SOURCED_SECONDARY（**须带 sources**）、ASSUMPTION→ASSUMPTION、OPEN→UNKNOWN |
| `geometryBasis` | NEEDS_MEASUREMENT / DEMO_ASSUMPTION | UNKNOWN / DEMO_ASSUMPTION / SOURCED / OUT_OF_SCOPE | NEEDS_MEASUREMENT→UNKNOWN、DEMO_ASSUMPTION→DEMO_ASSUMPTION |
| 选择组值 | **GEN1 / GEN3** | **ASSY-30-002 / ASSY-30-003** | 显式转换，见 `enumMapping.choiceGroupValue` |
| `fidelityTarget` | FID-V / FID-G | **无此字段** | **R17_ONLY_GAP**；FID-G 是目标不是达成 |
| `unknowns` | U-* 本地登记 | modelBlocked→PR-* | **两套登记未对齐**，本轮并列保留不合并 |

---

## 4. 九个真实冲突（4 个 P0）

### CF-01（P0）同值异义：6 个占位总成复用 RP-01 真实 ID

| ID | RP-01 规范名 | R-17 名 |
|---|---|---|
| ASSY-50-001 | 发动机总成（直列四缸火花点火，深钻样例） | 动力源总成（占位） |
| ASSY-60-001 | 手动变速箱 MT | 动力传递总成（占位） |
| ASSY-70-001 | **燃油箱总成** | 能源供给总成（占位） |
| ASSY-80-001 | 散热器与风扇模块 | 热管理总成（占位） |
| ASSY-90-001 | 控制器组 | 电气总成（占位） |
| ASSY-10-001 | 梯形车架总成 | 车身结构总成（占位） |

**这是最危险的一类**：ID 相同、语义被放宽。按 `assemblyId` 直接 join 会把「燃油箱总成」当成「能源供给总成」。

占位是 R-17 演示夹具的**合法简化**，不是错误；但**不得回写为 RP-01 规范名**。处置：双方名称并列、标 `semanticBroadening=true`，校验器 W02 禁止把这类行标为 `MAPPED`。建议给占位另立 ID 前缀（P-21-01）。

另有 3 项名称漂移非占位性质（ASSY-30-001/30-002/20-014），合计 **9/12 总成定义名称与 RP-01 不一致**。

### CF-02（P1）字段名承载两个命名空间

R-17 用 **同一个字段名 `assemblyId`** 表示：
- `assemblyDefinitions[].assemblyId` = `ASSY-30-001`（**定义**）
- `assemblies[].assemblyId` = `ASM-WHEEL-END-FL`（**实例**）
- `partInstances[].assemblyId` → 指向**实例**命名空间

跨数组裸 join 会产生错误结果。对照表一律经 `definitionRef + corner` 解析，**不做裸 join**。建议实例主键改名 `assemblyInstanceId`（P-21-03）。

### CF-03（P2）4 个零件定义名称漂移

`PART-30-017`（法兰螺柱（压装）→ 法兰螺柱（Gen3））、`PART-30-010`、`PART-40-046`（通风制动盘（摩擦环+筋+盘帽）→ 通风制动盘）、`PART-30-019`（轮辋（轮圈）→ 轮辋（轮圈）占位）。

以 RP-01 名为规范，R-17 名并列为 alias。**不因名称不同判为不同零件，也不用 R-17 名覆盖规范名。** `familyRef` 全部一致，无漂移。

### CF-04（P1）2 个零件证据等级与规范权威不一致——**方向是 R-17 降级**

| 零件 | RP-01 evidence | RP-01 sources | R-16 | R-17 | 方向 |
|---|---|---|---|---|---|
| PART-30-019 轮辋 | EVIDENCE | S16/S20/M05 | SOURCED_SECONDARY | ASSUMPTION | **R17_DOWNGRADE** |
| PART-40-034 卡钳体 | EVIDENCE | S07/S11 | SOURCED_SECONDARY | ASSUMPTION | **R17_DOWNGRADE** |

**我核实了 RP-01 原件**：两者确为 `EVIDENCE` 且带 sources，R-16 的映射忠实。R-17 标 ASSUMPTION 属**保守降级**，不违反「不得升级」纪律，但与规范权威不一致。

处置：双方值并列，交总控裁决——要么 R-17 补 sources 后升回，要么总控确认降级理由并回写 RP-01。**本轮不改任何一方、不取平均。** 校验器 W06 新增**规范权威校验**：若出现 `R17_UPGRADE` 方向必须拒绝。

### CF-05（P1）Frame 粒度不一致

R-16 每**总成实例**一个 Frame（37 个）；R-17 每**零件实例**也有 Frame（27 个）。

粒度不同**不是错误**：R-17 需要零件级 Frame 才能表达 Joint。对照表按总成实例级对齐（8 个），零件级 Frame 标 R17_ONLY 保留（19 个），**不强行合并也不丢弃**。需总控裁决规范粒度。

### CF-06（P0）父总成层级被压平：5 个已映射 + 1 个未映射

| R-17 实例 | 零件 | RP-01 规范父级 | R-17 父级 |
|---|---|---|---|
| INST-KNUCKLE-FL | PART-20-016 转向节本体 | **ASSY-20-004 前转向节** | ASSY-20-001 双叉臂前悬架 |
| INST-WHEEL-FL/FR/RL/RR | PART-30-019 轮辋 | **ASSY-30-004 车轮总成** | ASSY-30-001 轮端总成 |
| INST-CALIPER-BRACKET-FL | PART-40-048 卡钳支架 | **ASSY-40-007 盘式制动器模块** | ASSY-40-008 卡钳总成 |

前两类是**跳过一层**，第三类是**换了父级**。

**为什么这是 P0**：任务书要求「按每个父装配实例计算 qty」。父级不同 → 同一零件会算出不同数量。处置：保留差异、不强行改父级，**按父装配算 qty 时必须声明用哪一侧层级**。需总控裁决规范层级（P-21-04）。

> 卡钳支架这一项最初因"R-16 未实例化"而漏检；本轮补了**未映射实例也检父级漂移**，才把它纳入。

### CF-07（P0）14 个 Frame 带非零数值原点但没有 valueBasis

例如 `FR-WHEEL-END-FL origin=[0.84, 0.32, 1.23]`、`FR-WHEEL-END-FR origin=[-0.84, 0.32, 1.23]`，`space=VEHICLE_LOCAL`、`units=m`、`source="runtime +X left/+Y up/+Z forward"`。

这些原点与既有演示代码的 **halfTrack 0.84 / halfWB 1.23 同源，属 DEMO 值**。

R-17 用 `VEHICLE_LOCAL` 空间是**合法的**（不是世界绝对坐标），但**数值原点必须标 `DEMO_ASSUMPTION`**，否则下游会当已核实安装位置。R-16 侧 `worldFrame` 仍 `UNFROZEN_PENDING_RP07`。建议 R-17 补 `valueBasis` 字段（P-21-02）。

---

### CF-08（P1）R-17 实例化了变型条件未裁决的零件

唯一未映射的零件实例 `INST-CALIPER-BRACKET-FL`（PART-40-048 卡钳支架）不只是"R-16 没建"，而是**存在性本身未定**：

| 字段 | R-16 原值 |
|---|---|
| `instancePolicy` | `DEFERRED` |
| `variantFlag` | **`caliperFixedOrFloating`（未裁决）** |
| `optionality` | `required` |
| `geomNote` | 浮动式必有支架；固定式常直接螺接转向节 → 变型属性 |
| `parentId` | ASSY-40-007（R-17 挂到 ASSY-40-008，见 CF-06） |

R-17 建了这个实例，等于**隐含选择了"浮动式卡钳"却没有声明该假设**。处置：保留 `R17_ONLY_UNMAPPED`，`unmappedReason` 写明变型条件未裁决；**不得据此声称本变型必有支架，也不得声称必无**。需总控先裁决卡钳型式（与 P-21-04 父级裁决一并处理）。

> 这一项是读了 DeepSeek R-22 的 `MSG-20261115-2240` 后回查 R-16 原件才补上的。原先的理由只写"不在 PLAN/DIST 内"，掩盖了真实原因是变型条件未定。

---

### CF-09（P0）两侧声明的是不同整车变型，且 R-16 没有 Project 层

| 层 | R-16 | R-17 |
|---|---|---|
| Project | **无此层**（顶层直接是 `variant`） | `projectId=PROJECT-CARLAB-DEMO`，name「CARLAB 演示整车骨架（GEN1，非实车）」，revision 3 |
| VehicleVariant | `variant.id=VAR-R16-BOF-ICE`，`basedOn=CFG-BOF-ICE`，`status=PROPOSED_NOT_APPROVED`，BOF / ICE | `variant.variantId=VV-A-SWB-STD`，`platformFamilyRef=PF-DEMO-BOF-01`，`evidenceInherited=DEMO_ASSUMPTION` |
| 选择组 | **10 组**（9 继承 + CG-FASTENER），值为 `ASSY-*` / `STUD_AND_NUT` | **只设 1 组** `moduleSelections.CG-HUB="GEN1"` |
| 变型参数 | 无 | `PD-WB=2460mm`、`PD-FT=1680mm`，均 `DEMO_ASSUMPTION` |

**代际一致**（R-16 `CG-HUB=ASSY-30-002` ↔ R-17 `GEN1`，经枚举映射推出 `generationAgrees=true`），**但变型 ID 不相等且未声明对齐关系**。R-17 未设的 9 组是：CG-BOOST / CG-FASTENER / CG-FSUSP / CG-PARK / CG-POWER / CG-RBRK / CG-RSUSP / CG-STEER / CG-TRANS。

**为什么是 P0**：本对照表的 **13 个已映射实例全都隐含假设两侧是同一变型**。若变型不同，同一 `PART-*` 在两侧可能对应不同配置（例如悬架型式、制动型式），跨夹具 join 就不是"同一装车实例"而只是候选对应。

处置：`alignmentStatus=NOT_DECLARED`，**不得默认相等**；需总控裁决变型对齐关系，或双方显式声明映射。W19 强制：ID 不同却声称 `ALIGNED`、或删掉 CF-09、或伪造 `generationAgrees`，都会被拒。

> 这一层最初被我漏掉了——`fieldMapping` 只做了 6 层，缺 `Project → VehicleVariant`。是回答 DeepSeek R-17 第 1 问（要求对齐整条 `Project → VehicleVariant → System → AssemblyDefinition → Assembly → PartInstance` 链）时回查才发现的。现已补为 8 层。

---

## 5. 四角、轴级与代际身份

- **四角**：R-17 的 `ASM-WHEEL-END-FL/FR/RL/RR` 与 R-16 的 `AI-30-001-FL/FR/RL/RR` 一一对应；轮辋实例四角齐全。
- **轴级/整车级**：R-16 用 `FRONT_AXLE` / `REAR_AXLE` / `VEH` 角位值表达稳定杆（跨左右两角）、桥壳（轴级单件）、转向器（整车单件）。**这些不是每角一件，不得折算到四角。** R-17 的 `ASM-STEER` 等对应 `VEH`。
- **代际**：R-17 `moduleSelections.CG-HUB="GEN1"`、`applicableWhen.CG-HUB=["GEN1"]`；R-16 用 `ASSY-30-002`。已建显式值映射。R-17 的 `PART-30-017` 带 `applicableWhen CG-HUB=["GEN3"]`，与 R-16 的 Gen3 条件一致。
- **重复实例序号**：R-17 `INST-STUD-FL-1..5` ↔ R-16 `PI-30-009-FL-01..05`，按 `(partId, corner, ordinal)` 精确配对，5 颗全部映射成功。
- **跨夹具共用 ID**：两个 R-17 夹具共用 11 个实例 ID（FL 纵切是整车子集），**夹具内重复 ID 为 0**。对照表去重后映射，W13 禁止同一 R-17 实例映射两次或同一 R-16 实例被复用。

---

## 6. 数量层级：按每父装配实例，12 项冲突原样保留

R-17 已采用**每父装配实例**口径（`quantity.perAssembly` + `bomLines.qtyPerAssembly` + `quantityFacts`），与 D-04 方向一致：

| 零件 | R-16 每角 | R-16 除数 | R-16 继承整车总数 | R-17 BOM 每父 | R-17 实例数 | 一致 |
|---|---|---|---|---|---|---|
| PART-30-006 独立轮毂法兰 | 1 | 4 | 4 | 1 | 1 | ✓ |
| PART-30-009 车轮螺柱 | 5 | 4 | 20 | **5** | **5** | ✓ |
| PART-30-019 轮辋 | 1 | 4 | 4 | 1 | 1 | ✓ |
| PART-30-031 制动盘定位螺钉 | 1 | 4 | 4 | 1 | 1 | ✓ |

`quantityFacts` 的 `PART-30-009`：qtyPerCorner=5 / vehicleTotal=20 / cornerCount=4 / **valueBasis=ASSUMPTION** ✓ 与 R-16 一致，未升级。

**R-16 的 12 项数量冲突全部原样保留**在 `r16QtyConflictsPreserved`，校验器 W07 逐条比对**完全相等**（数量、内容都不得改）。R-17 夹具只覆盖 FL 单角、未涉及后轴鼓式，因此不冲突但**也未裁决**——标 `PRESERVED_NOT_RESOLVED`。

---

## 7. 未知与演示几何全部保留

- 13 个已映射实例的 `r16GeometryStatus` **全部 `GEOMETRY_PENDING`**，`r16ValueBasis` **全部 UNKNOWN**，无一 SOURCED。W05 强制。
- R-17 的 `assets` 三条全部 `glb=null`、`mappingStatus=DEMO_SUBSTITUTE` 或 `PLACEHOLDER`、`fidelityClaim=FID-V`，**没有把空几何贴成实体**。
- R-17 的 `PART-30-009` 带 `nameCaveat: "M14 is only R-03 naming; not verified by RP-01/R-06/R-11."` ✓ 正确继承了我 R-11 的结论。
- **Dorman 610-460 未被偷换为样板件**：W09 扫描全部映射行，参考件零件号不得出现在任何 `MAPPED` 行；`invariants.dormanNotInstalled=true`。
- **R-18 的 `INST-SLA-*` 不当规范身份**：5 条全部 `canonicalIdentity=false`、`mappingKind=ROLE_BASED_NOT_IDENTITY`，并保留 `provenance=FICTIONAL_FIXTURE`、`instanceIdStatus=CANDIDATE_NOT_FROZEN`、`valueBasis=DEMO_ASSUMPTION`。按角色对应到规范定义（HUB→PART-30-006、UPPER-ARM→PART-20-001、LOWER-ARM→PART-20-008、UPRIGHT→PART-20-016、TIEROD→PART-20-075），**不据此补轮端力**。W10 强制。

### 7.2 DEFERRED ≠ 不存在（TIEROD 与卡钳支架的区别）

R-18 的 `INST-SLA-TIEROD-FL` 映射到 `PART-20-075` 外拉杆端，R-16 侧 `instancePolicy=DEFERRED`、无 `PI-20-075-FL`，因此 `bindingStatus=DEFERRED_NO_INSTANCE`、`r16InstanceId=null`。但它的 **`optionality=required`**、`qtyVehicleTotal=2`（仅前轴两角）、`handednessPolicy=MIRROR_REGENERATE` 且 `requiresDistinctMountFrame=true`。

**DEFERRED 的原因是几何/来源未闭合（锥柄尺寸无来源），不是这个零件可选或不存在。** 下游不得因为缺实例就省略它；Grok R-23 把位姿 `instanceId` 留空是正确的暂缓，不是判定该零件缺席。

对照 CF-08 的卡钳支架：那一项是 `variantFlag` 未裁决，**存在性本身未定**。两者都 DEFERRED，但语义完全不同，本轮分别标注 `r16Optionality` 与 `r16VariantFlag` 以免下游混为一谈。

### 7.1 镜像表达兼容（保留差异 PD-01）

R-16 用 `handednessPolicy` + `mirrorPolicy=REGENERATE_MIRRORED_GEOMETRY`，禁止任何 scale 字段；R-17 用 Frame 级 `mirror={axis:"x", handednessFlip:true, mirrorOfFrameId:...}` 且位置取负。

**两者兼容**：Frame 级 handednessFlip 是坐标变换，不是网格缩放。**但下游不得把 handednessFlip 实现为全局负 mesh scale**（R-16 V11 禁止）。标 `COMPATIBLE_WITH_CONDITION`。

---

## 8. 未映射清单（保留，不丢弃）

**R-16 侧独有**（详细树 vs 简化夹具的预期覆盖差）：
- 3 个系统：`SYS-100` 车身附件与座舱、`SYS-110` 乘员保护与辅助安全、`SYS-130` 工程公共件与装配基础
- **482 个零件定义 / 265 个零件实例 / 29 个总成实例**

**R-17 侧独有**：
- 1 个零件实例：`INST-CALIPER-BRACKET-FL`（PART-40-048）。R-16 `instancePolicy=DEFERRED`，真实原因是 **`variantFlag=caliperFixedOrFloating` 未裁决**（浮动式必有支架、固定式常直接螺接转向节），不是"该零件不存在"。见 CF-08。
- 7 个总成实例：`ASM-SUSP-FL`、`ASM-POWERTRAIN`、`ASM-DRIVETRAIN`、`ASM-ENERGY`、`ASM-THERMAL`、`ASM-ELECTRICAL`、`ASM-BODY`
- 19 个 Frame（零件级粒度，R-16 无对应）

**策略**：未映射节点一律保留并列出。W04 强制计数与实际差集相等，且必须声明保留策略。

---

## 9. 实跑证据与可重复命令

```
python agent-workspace/agents/qwen4/tools/r21_build_mapping.py
python agent-workspace/agents/qwen4/tools/r21_mapping_tool.py validate
python agent-workspace/agents/qwen4/tools/r21_mapping_tool.py selftest
```

| 测试 | 结果 |
|---|---|
| validate | **PASS，0 违规**（19 条规则 W01–W19） |
| selftest | **PASS，42 caught / 0 missed / 42 total，规则覆盖 19/19** |

结果文件：本人 `reports/R-21-validation-result.json`、`R-21-selftest-result.json`。

### 9.1 规则清单（19 条，任务书要求 ≥10 项负例）

W01 映射引用有效｜**W02 禁止强行同一性**（含占位同值异义）｜**W03 规范名不得伪造**｜**W04 未映射节点必须保留**｜**W05 不得引入几何真实性**｜**W06 证据不得升级 + 规范权威校验**｜**W07 12 项数量冲突逐条不得改动**｜W08 每父装配 qty 与实例数一致｜**W09 Dorman 不得成为样板件**｜**W10 R-18 非规范身份**｜W11 数值原点必须标等级｜**W12 父级漂移必须记录**｜W13 映射不得重复｜W14 枚举映射完整｜W15 候选状态与补丁未执行｜W16 汇总自洽｜W17 冲突必须带处置｜W18 输入只读｜**W19 Project/VehicleVariant 层必须对照，变型不同不得声称已对齐**

### 9.2 校验器抓出了我自己的四处错误

1. **W06 范畴错误**：我最初拿 `evidenceInherited` 的映射值去比 R-16 的**总体 valueBasis**（四者最弱，全 UNKNOWN），把 13 条合法映射全误判为"升级"。身份级等级只能比 `identityBasis`。已补 `r16IdentityBasis` 字段并改正比较对象。
2. **W16 假阳性**：检查了 `coverage` 里根本不存在的键（conflicts 等只在 summary），产生 4 条误报。已改为按键存在性分别校验。
3. **W08 反例空转**：反例改的那一行没有 R-17 BOM 行，等于没测到。已改为选取真正有 BOM 行的记录；同时把无 BOM 行的 `perParentSemanticsAgree` 由 `false` 改为 `null`（不适用 ≠ 不一致）。

4. **W08 豁免口被新冲突 ID 意外打开（既有的 W08 负例在重跑时抓到的）**：W08 原本写 `if "CF-08" not in I["cf"]` 才报违规——而当时**根本不存在 CF-08**，是个死豁免口。我新增 CF-08（变型条件未裁决）后，这个口被无关冲突满足，W08 立刻静默失效，负例从 35/35 掉到 34 caught / 1 missed。**没有改名绕开，而是把豁免条件改成该零件自身的 `r16ConflictRecorded`**：只有这个零件真的登记了 qty 冲突才可豁免，无关冲突的存在不得抑制检查。另加一项负例证明豁免是**按零件**而非全局（把冲突记到另一个零件上，W08 仍须触发），总数因此到 37。

另修正一处**指标语义混淆**：最初把两个夹具共用的 11 个实例 ID 报成"重复 ID"，实际**夹具内重复为 0**，跨夹具共用是有意设计。已拆成两个指标。

还补了一处**漏检**：卡钳支架的父级漂移最初因"R-16 未实例化"被跳过，现对未映射实例也检父级。

---

## 10. 补丁候选（8 项，全部未执行）

| ID | 对象 | 提案 | 证据 |
|---|---|---|---|
| P-21-01 | R-17 | 占位总成另立 ID 前缀（如 PH-50-001）或加 `isPlaceholder`+`canonicalName` | CF-01 |
| P-21-02 | R-17 | `frames[]` 增加 `valueBasis`；演示来源数值一律 DEMO_ASSUMPTION | CF-07 |
| P-21-03 | R-17 | 实例主键改名 `assemblyInstanceId`，与定义 `assemblyId` 分离 | CF-02 |
| P-21-04 | 总控 RP-07 | 裁决规范父级层级（轮辋/转向节/卡钳支架归属） | CF-06 |
| P-21-05 | R-16（需批准） | 补 `fidelityTarget` 与 U-*↔PR-* 未知登记对照；提交 CG-FASTENER 供 R-17 采纳 | enumMapping 两处 GAP |
| P-21-06 | 总控 RP-07 | 12 项数量冲突与 R-17 `quantityFacts` 合并为统一 qty 事实表 | PD-02 |
| P-21-07 | R-16（需批准） | `qtyPerCorner` 改名 `instancesPerCorner` + 每实例 `quantity:1`，或文档明确它属零件/角位层级 | DeepSeek R-22：按实例累加会把螺柱 20 算成 100 |
| P-21-08 | R-16 + R-17（需裁决） | 显式声明变型对齐关系；R-16 补 Project 层，R-17 补齐其余 9 个选择组 | CF-09 |

**全部 `executed=false`**，W15 强制。**不直接改 RP-01/R-16/R-17 任何已验收文件。**

---

## 11. 未闭合部分（如实列出）

1. **3 个 P0 冲突未裁决**：CF-01 同值异义、CF-06 父级层级、CF-07 数值原点无等级——都需总控或对方工作位动作，本轮只记录与建议。
2. **两套未知登记未对齐**：R-17 的 `U-*` 与 R-16/R-06 的 `PR-*` 无对照表，本轮并列保留。
3. **`fidelityTarget` 在 R-16 缺失**：需批准后才补（P-21-05）。
4. **CG-FASTENER 未被 R-17 采纳**：R-16 的候选紧固架构选择组在 R-17 夹具中不存在，轮螺栓 vs 螺柱+螺母的条件互斥**只在 R-16 侧可验证**。
5. **Frame 规范粒度未定**：总成级 vs 零件级需裁决。
6. **19 个 R-17 零件级 Frame 无 R-16 对应**：保留为 R17_ONLY，未强行合并。
7. **R-18 位姿仍是虚构硬点**：按角色映射，不构成真实运动学证据。
8. **世界 Frame 仍未冻结**：`UNFROZEN_PENDING_RP07`。
9. **卡钳型式未裁决（CF-08）**：`caliperFixedOrFloating` 未定，因此卡钳支架在本变型的去留无法判定；R-17 已建实例等于隐含选了浮动式。需总控裁决后才能决定该实例是绑定还是删除。
10. **两个 DEFERRED 零件未闭合**：`PART-20-075` 外拉杆端（required，几何无来源）与 `PART-40-048` 卡钳支架（变型条件未定）都没有规范 `PI-*`，R-18/R-23 的拉杆位姿因此只能留空 `instanceId`。
11. **变型身份未对齐（CF-09）**：R-16 `VAR-R16-BOF-ICE` 与 R-17 `VV-A-SWB-STD` 不是同一声明，R-16 还缺 Project 层；13 个已映射实例都隐含假设同一变型，需总控裁决对齐关系。
12. **R-17 只设了 1/10 个选择组**：其余 9 组（含 CG-FASTENER）未设，因此紧固架构互斥、悬架/制动型式在 R-17 侧无法验证。

---

## 12. 边界遵守

- **未修改**：RP-01 / R-16 / R-06 / R-11 已验收文件、R-17 与 R-18 的 `src-experiments/` 源文件、`src/`、`workbench-v2/` 顶层页面、`MASTER_PLAN.md`、其他模型目录、他人留言原件。`git status --porcelain` 对 RP-01/R-16/R-06/R-11/R-17/R-18/`src/` 返回空。
- **两处非本轮所为的变更，如实记录**：
  - `MASTER_PLAN.md` 显示 ` M`，但 `git diff` 内容是 **2026-11-14 总控的「第一轮研究验收后的工作接续」派单说明**（提到 R-01/R-02/R-04/UX-01/RP-04/RP-05/RP-07/A-00），**不是本轮改动，我未触碰该文件**。
  - `workbench-v2/experiments/vehicle-structure-adapter/` 为未跟踪新目录，属 **Composer R-25** 任务书指定路径，非本轮所为。
- **未新增**：任何常驻端口、顶层导航、轮毂/悬架独立页面。
- **未声称**：几何真实性、OEM 尺寸、装配干涉验证、多体动力学、SOURCED 参数。
- **未冻结**：共享 Schema、世界 Frame、instanceId 方案。
- **未自行批准**。

> 注：`src-experiments/mechanism-stream-v1/` 与 `vehicle-integration-v1/` 是 Grok R-23 与 DeepSeek R-22 的新增目录，**不是本轮所为**。

---

## 13. 交付入口

- 主报告（本文）：`docs/research/R-21-vehicle-tree-domain-mapping.md`
- 机器可读对照表：`docs/research/R-21-vehicle-tree-mapping.fixture.json`
- 生成器：`agent-workspace/agents/qwen4/tools/r21_build_mapping.py`
- 校验器：`agent-workspace/agents/qwen4/tools/r21_mapping_tool.py`
- 实跑结果：本人 `reports/R-21-validation-result.json`、`R-21-selftest-result.json`
- 个人回报：`agent-workspace/agents/qwen4/reports/R-21.md`
- 跨模型交接：给 DeepSeek R-22 与 Composer R-25 的公共消息（见个人回报）