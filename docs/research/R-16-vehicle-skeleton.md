# R-16｜整车工程对象树与首个可动轮端骨架

> 工作位：qwen4（整车系统树 · 车型平台）｜任务：R-16 / 03.18｜日期：2026-11-15
> 状态：**submitted，等待 GPT-6 核验**。本文不自行批准。
> 任务书：`docs/tasks/R-16-vehicle-assembly-skeleton.md`
> 前置阅读：`AGENTS.md`、`docs/command/CARLAB_RUNTIME.md`、`docs/planning/VEHICLE_BLUEPRINT_V1.md`（ADR-007 草案）

---

## 1. 结论摘要

把已验收的 RP-01 研究树**派生**为一个候选工程骨架，而不是重新发明一套身份：

- **13 系统 / 53 子系统 / 108 总成 / 493 零件定义 / 37 通用件家族 / 40 工程基准 / 35 跨系统引用**，全部忠实继承。
- **37 个总成实例 + 278 个零件实例 + 37 个局部安装 Frame**，四角轮端身份齐全。
- **真实几何深度只有一个**：FL 前轮端—双叉臂纵切，含 56 个不同零件定义，覆盖上/下摆臂、球铰、转向节、弹簧、减振器安装座、轮端与制动。
- **0 个实例具有 SOURCED 几何**。全部 278 个实例的总体 `valueBasis = UNKNOWN`，因为几何待建、质量与安装参数未知。这是继承 RP-01「几何 SOURCED 计数为 0」的事实，不是本轮遗漏。
- **新增候选选择组 `CG-FASTENER`**，把 R-11 自我发现的缺口（CF-04）变成可组合但互斥的规则；**四种组合全部合法通过，两种非法混用全部被拒绝**。
- **12 个数量层级冲突被显式记录**，没有静默改数。

一句话：**骨架建立了身份、条件与阻塞语义，没有建立任何几何真实性。**

---

## 2. 四层对象分离（任务书必须解决 1）

| 层 | 来源 | 数量 | 语义 |
|---|---|---|---|
| `System` / `Subsystem` | RP-01 `SYS-*` / `SUB-*` | 13 / 53 | **功能分类**，不是采购边界 |
| `Assembly` | RP-01 `ASSY-*` | 108 | **真实采购/装配边界**，带 `purchaseBoundary` |
| `PartDefinition` | RP-01 `PART-*` | 493 | **零件族/款式**，带 `familyRef`、整车级 qty、左右敏感性 |
| `PartInstance` | 本轮派生 | 278 | **具体装车实例**（FL/FR/RL/RR/轴级/整车级），有独立 `instanceId` |

另有 `PartFamily`（37，通用件目录）、`Datum`（40，工程基准非实体）、`Reference`（35，跨系统指针）。

### 2.1 反 familyRef 去重（R-11 CF-05 的落地）

`FAM-130-007` 下有三个不同零件定义（Gen1 螺柱 / Gen3 法兰螺柱 / 车轮螺栓螺母），**按家族去重会吞掉螺母**。骨架的去重键是 `(definitionId, corner, ordinal)`，不是 `familyRef`。

校验器 **V03** 强制：每个 `(definitionId, corner)` 的实例数必须等于 `qtyPerCorner`。反例「按 familyRef 去重删掉 4 颗螺柱实例」被捕获。

### 2.2 REF 不计入 BOM

35 个 `REF-*` 全部 `countedInBom=false`，**不生成任何零件实例**。校验器 **V14** 双向强制：REF 不得计入，且任何 `REF-` 开头的 ID 不得成为零件实例。

---

## 3. 四角身份与左右/前后条件（任务书必须解决 2）

### 3.1 四个角位站

| 角位 | 轴 | 侧 | 转向 | 制动 | 悬架拓扑 | 转向节 | 深度 |
|---|---|---|---|---|---|---|---|
| FL | 前 | 左 | 是 | 盘式浮动卡钳 | 双叉臂 | 有 | **DEEP_SLICE** |
| FR | 前 | 右 | 是 | 盘式浮动卡钳 | 双叉臂 | 有 | MIRROR_OF_DEEP_SLICE |
| RL | 后 | 左 | 否 | 鼓式 | 整体桥 | **无** | IDENTITY_ONLY_PARTIAL |
| RR | 后 | 右 | 否 | 鼓式 | 整体桥 | **无** | IDENTITY_ONLY_PARTIAL |

驱动形式全部 `CONDITIONAL_UNKNOWN`——继承 R-06 的 `drivenWheel=CONDITIONAL`，属 R-01 变体决策，本轮不擅自定案。

**后轴为什么只建身份**：RP-01 的 `ASSY-30-001` 名为「双叉臂**前**轮端深钻样例」，其 note 明确「轮毂轴承+车轮+制动接口可跨拓扑复用，**转向节不可复用**」。本变型后轴是整体桥+鼓式，因此后角只实例化轮端/车轮/鼓式制动，**不复用前悬架件**。这是显式限制，不是遗漏。

### 3.2 镜像：禁止全局缩放

RP-01 已有 **20 个节点标 `mirrored=True`**（车架纵梁、门槛梁、减振器塔、上/下摆臂本体、转向节本体、稳定杆连杆、外拉杆端等）。骨架据此分三类：

| 类别 | 含义 | 需要不同安装 Frame |
|---|---|---|
| `MIRROR_REGENERATE` | RP-01 标 mirrored，左右几何不同，**必须再生成镜像几何** | 是 |
| `SYMMETRIC_PART_DISTINCT_MOUNT` | 本体对称（紧固件/轴承/密封/摩擦件/弹簧/减振器），但安装 Frame 随角位不同 | 是 |
| `SYMMETRIC_SHARED` | 本体与安装语义左右一致 | 否 |

**三类的 `globalScaleForbidden` 全部为 true。** 校验器 **V11** 强制：实例与 Frame 都不得携带 `scale`/`globalScale`/`meshScale`；标 mirrored 的零件必须是 `MIRROR_REGENERATE` 且需要独立 Frame；Frame 的 `mirrorPolicy` 必须是 `REGENERATE_MIRRORED_GEOMETRY`。

反例「用 `scale=-1` 处理镜像转向节」「把镜像件降为 SYMMETRIC_SHARED」「Frame 改用全局负缩放」全部被捕获。

### 3.3 哪些实例需要不同安装 Frame

37 个 Frame 全部是 `LOCAL_MOUNT_FRAME`，按 `FR-<系统号>-<序号>-<角位>` 命名，每个都带 `handedness`（LEFT/RIGHT/AXLE）。**凡 `requiresDistinctMountFrame=true` 的定义，其左右实例挂不同 Frame**——包括所有摆臂、转向节、卡钳、拉杆端，以及本体对称但安装方向不同的轴承/制动盘/紧固件。

---

## 4. 互斥架构规则（任务书必须解决 3）

### 4.1 CG-HUB：Gen1 / Gen3（继承 RP-01）

| 选项 | 代际 | 必需零件 | 禁止零件 |
|---|---|---|---|
| `ASSY-30-002` | GEN1 | PART-30-006（独立轮毂法兰） | PART-30-010/011/012/017 |
| `ASSY-30-003` | GEN3 | PART-30-010/011/012（双法兰+独立内圈） | PART-30-006、PART-30-009 |

### 4.2 CG-FASTENER：螺柱+螺母 / 轮螺栓（**本轮新增候选**）

RP-01 的 9 个选择组无一覆盖紧固架构，三个车轮紧固节点全部 `required`——这是 R-11 CF-04 报出的自有缺口。本轮**只在骨架里新增候选规则，不修改已批准的 RP-01**。

| 选项 | 螺柱 | PART-30-029 的角色 | 禁止 |
|---|---|---|---|
| `STUD_AND_NUT` | 必需，按代际选 PART-30-009(Gen1) 或 PART-30-017(Gen3) | `WHEEL_NUT` | — |
| `LUG_BOLT` | **不存在** | `LUG_BOLT` | PART-30-009、PART-30-017 |

**可组合性**：与 CG-HUB 正交，四种组合均合法。

### 4.3 实测：四种组合全部通过，两种非法混用全部被拒

```
GEN1 x STUD_AND_NUT: PASS  instances=278  studs=[PART-30-009]  roles=[WHEEL_NUT]   gen1Flange=True
GEN1 x LUG_BOLT:     PASS  instances=258  studs=[]             roles=[LUG_BOLT]    gen1Flange=True
GEN3 x STUD_AND_NUT: PASS  instances=286  studs=[PART-30-017]  roles=[WHEEL_NUT]   gen1Flange=False
GEN3 x LUG_BOLT:     PASS  instances=266  studs=[]             roles=[LUG_BOLT]    gen1Flange=False

ILLEGAL Gen1 + Gen3 法兰件混装:  REJECTED (V05)
ILLEGAL LUG_BOLT + 保留螺柱:     REJECTED (V06)
```

**螺柱差值正好 20 = 5 颗 × 4 角**，与 RP-01 整车级 qty=20 闭合。Gen1 独立法兰在 Gen3 下确实消失。

这证明规则**不是只会拒绝**：合法组合能真正生成不同但自洽的骨架。

### 4.4 Dorman 610-460 严格隔离

参考件在骨架中是 `referenceSpecimens`，**不在 BOM 实例里**：

- `installedInThisSkeleton = false`
- `isVehicleSelection = false`
- `isDemoSamplePart = false`
- `allowedUse = FID-V 视觉参考与单位/换算方法校验`

校验器 **V15** 强制这三个标志，并扫描全部实例 JSON 确认**参考件零件号没有泄漏进 BOM**。依据是总控第四批审核原文：「Dorman 螺柱不能偷偷变成当前车型 BOM 正式选型」。

---

## 5. 覆盖范围与唯一纵切（任务书必须解决 4）

### 5.1 结构覆盖全车

13 个系统全部在册：平台架构基准、车身结构与车架、悬架转向车轴定位、车轮轮胎轮端、制动驻车、动力源、动力传递、能源供给储存、热管理润滑流体、电气电子通信控制、车身附件座舱、乘员保护辅助安全、工程公共件目录。

108 个总成、493 个零件定义全部继承。**其中 83 个定义被实例化，410 个 `instancePolicy=DEFERRED`**——定义存在（来自已验收研究），但本轮不生成实例。

### 5.2 唯一几何深度：FL 纵切

FL 角含 **56 个不同零件定义 / 78 个实例**，覆盖可动机构链：

- 上摆臂本体 + 内衬套 + 上球铰 + 防尘罩 + 卡簧 + 枢轴螺栓 + 调整垫片
- 下摆臂本体 + 内衬套 + 下球铰 + 防尘罩 + 卡簧槽顶螺母 + 枢轴螺栓 + 减振器下安装座 + 稳定杆连杆安装座
- 转向节本体 + 球铰紧固螺栓 + 轮速传感器支架
- 前螺旋弹簧 + 上/下弹簧座
- 轮端 Gen1 全套 9 件 + 车轮总成 + 前盘式制动全套

校验器 **V17** 强制：恰好一个 DEEP_SLICE，且必须包含可动链关键件（上/下摆臂本体、转向节本体、上/下球铰、弹簧）。反例「删掉下摆臂」「增设第二个纵切」被捕获。

### 5.3 MODEL_BLOCKED 清单（10 项，全部带理由与 R-06 参数追溯）

| 项 | 定义 | R-06 参数 | 阻塞理由 |
|---|---|---|---|
| 轮毂法兰几何 | PART-30-006 | PR-16 | PCD/凸台/螺栓外径/厚全 UNKNOWN |
| 轮毂轴承内部几何 | PART-30-001..004 | PR-14 | 滚道/接触角/球数 UNKNOWN；官方 HTML 无数值、PDF 不可解析 |
| 轴承配合公差 | PART-30-001/006 | PR-15 | R-11 实证连制造商产品页也不给配合等级 |
| 摆臂本体与硬点 | PART-20-001/008 | PR-18/19 | 跨度/枢轴硬点 UNKNOWN；R-01 已指出代码靠 scale 静默拉伸 |
| 球铰锥度与安装高度 | PART-20-003/010 | PR-17 | 只取得接口语义（锥面或圆柱定位端），无数值 |
| 弹簧与减振器参数 | — | PR-20/21 | 刚度/阻尼/自由长/安装点 UNKNOWN |
| 转向节本体 | PART-20-016 | PR-17/18 | 主销轴线/球铰座/轴承座孔 UNKNOWN |
| 车架硬点 | PART-10-001 | — | R-01 固定硬点为演示假设，真实车架硬点无来源 |
| 轮辋接口 PCD/CB/ET | PART-30-019 | PR-06/07/08 | R-11 证明代码组合在真实车上不存在；ET 二手冲突 |
| 车轮紧固件座型 | PART-30-029 | PR-10 | 螺纹属参考件不属本车；座型 ABSENT |

**全部 493 个定义 `geometryStatus=GEOMETRY_PENDING`，质量与安装 `UNKNOWN`。没有一个用现有 Three.js 小车的管件替代缺失 CAD。**

---

## 6. 数量层级：12 个冲突被显式记录（不静默改数）

RP-01 的 qty **全部是整车级扁平标注**，且不同零件的每角除数不同：轮辋 ÷4、制动鼓 ÷2、桥壳 ÷1。一律除以 4 会得到错误结果。

骨架把「实例化角位」与「除数」**刻意分开**，并标 `distributionBasis=ENGINEERING_INFERENCE`（RP-01 未声明分配）。

### 6.1 发现的真实冲突

前盘式制动件的整车级 qty 是按**四轮盘式**标注的（卡钳体 4、导向销 8、摩擦片 8、制动盘 4），但本变型 `CG-RBRK=ASSY-40-010` 选的是**后轴鼓式**。

| 零件 | 继承整车总数 | 本变型实例化总数 |
|---|---|---|
| 卡钳体 / 活塞 / 密封圈 / 防尘罩 / 放气螺钉 / 制动盘 | 4 | **2** |
| 导向销 / 防尘套 / 安装螺栓 / 摩擦片 / 消音片 / 防响夹 | 8 | **4** |

**处理方式**：保留继承原值可见，按每角物理件数（1 个卡钳/角）实例化，差额记为 `qtyConflicts` 并标 OPEN，交总控在 qty 口径迁移（D-04）时裁决。**不改继承值、不静默取整、不假装一致。**

校验器 **V07** 强制：`qtyPerCorner × divisor == 继承总数`，否则必须有 `qtyVariantMismatch` 标志**且**有对应冲突记录。反例「把整车 20 当每角数量」「标了 mismatch 却不记录」被捕获。

---

## 7. 证据继承：实例化永不升级（任务书必须解决 5）

### 7.1 四个独立可信度字段

| 字段 | 含义 | 来源 |
|---|---|---|
| `identityBasis` | 身份/结构存在性 | RP-01 `evidence` + 是否有 sources |
| `geometryBasis` | 几何 | RP-01 `geomBasis` |
| `massBasis` | 质量 | 本轮全 UNKNOWN |
| `mountBasis` | 安装参数 | 本轮全 UNKNOWN |
| `valueBasis` | **总体 = 四者最弱** | 派生 |

映射规则：`evidence=EVIDENCE` **且有 sources** → `SOURCED_SECONDARY`；无 sources → `UNKNOWN`（不得无来源声称已核实）；`ASSUMPTION` → `ASSUMPTION`；`OPEN` → `UNKNOWN`。

**为什么身份与几何分开**：若混取最弱，会把「结构已核实但几何未测」误报为全未知，丢失信息。分开后既诚实又可追溯。

### 7.2 实测分布

- `identityBasis`：SOURCED_SECONDARY **124**、ASSUMPTION **152**、UNKNOWN **2**
- `valueBasis`：**UNKNOWN 278（全部）**
- `geometryBasis = SOURCED`：**0**

校验器 **V08** 强制三条：`identityBasis` 不得强于定义、`valueBasis` 不得强于 identity、`valueBasis` 不得强于任一几何/质量/安装字段。**V09** 禁止任何 SOURCED 几何（RP-01 计数为 0）。**V10** 禁止 UNKNOWN 状态带非 UNKNOWN 可信度。

反例「ASSUMPTION 定义经实例化升为 SOURCED」「UNKNOWN 几何声称 SOURCED」「UNKNOWN 质量状态带 DEMO 值」全部被捕获。

---

## 8. 对 R-17 / R-18 的预留（候选，不冻结）

### 8.1 R-17 映射

| 骨架字段 | 方案 | 映射到 |
|---|---|---|
| `instanceId` | `PI-<系统号>-<三位序号>-<角位>[-<两位序>]`，例 `PI-30-009-FL-01` | PartInstance.instanceId |
| `assemblyInstanceId` | `AI-<系统号>-<三位序号>-<角位>` | AssemblyInstance.instanceId |
| `frameId` | `FR-<系统号>-<三位序号>-<角位>` | MountFrame.frameId |
| `definitionId` | 沿用 RP-01 `PART-*` | PartDefinition.definitionId |

证据字段：`valueBasis` / `identityBasis` / `geometryBasis` / `massBasis` / `mountBasis` / `evidenceInherited` / `distributionBasis`。

**留给 R-17 裁决**：instanceId 是否需含变型/版本段；世界 Frame 冻结后的换算；qty 口径迁移到每父实例制。

### 8.2 R-18 映射

- 纵切：FL 前轮端—双叉臂
- 可动链候选：上摆臂、下摆臂、转向节、弹簧减振器
- **硬点全部 UNKNOWN/DEMO**，R-18 若求解必须显式标 DEMO
- 球铰接口有 `CONICAL_TAPER` 与 `CYLINDRICAL_DOG_POINT` 两种（R-11 T04），单一锥度字段不足
- **禁止**：用全局 scale 或拉伸 Mesh 假装运动；把 `KIN-E-CONVERGE` 硬映射到静态 P09（总控已裁定不必虚构 P17）
- **契约**：R-18 求解输入输出必须复用本骨架 `instanceId`，不得另建零件编号

### 8.3 Frame 未冻结

`worldFrame = UNFROZEN_PENDING_RP07`，全部 Frame 为局部、只用方向语义、**无世界绝对坐标**。校验器 **V13** 强制。**V19** 强制骨架/变型/映射全部保持候选状态，新增的 CG-FASTENER 必须标 `PROPOSED_NEW_NOT_IN_RP01`。

---

## 9. 实跑证据与可重复命令

```
python agent-workspace/agents/qwen4/tools/r16_build_skeleton.py
python agent-workspace/agents/qwen4/tools/r16_skeleton_tool.py validate
python agent-workspace/agents/qwen4/tools/r16_skeleton_tool.py selftest
python agent-workspace/agents/qwen4/tools/r16_skeleton_tool.py combos
```

变型开关（可重复生成四种组合）：

```
python .../r16_build_skeleton.py --hub ASSY-30-003 --fastener LUG_BOLT --out <path>
```

| 测试 | 结果 |
|---|---|
| validate | **PASS，0 违规**（19 条规则 V01–V19） |
| selftest | **PASS，37 caught / 0 missed / 37 total，规则覆盖 19/19** |
| combos | **PASS，4 种合法组合全通过 + 2 种非法混用全被拒** |

结果文件：本人 `reports/R-16-validation-result.json`、`R-16-selftest-result.json`、`R-16-combination-result.json`。

**组合测试全程在内存中构建与校验，不写临时文件、不留 scratch。**

### 9.1 规则清单（19 条）

V01 实例/Frame ID 唯一｜V02 定义/总成实例/Frame 引用有效｜**V03 反 familyRef 去重**｜V04 选择组恰好一个｜**V05 代际互斥**｜**V06 紧固架构互斥**｜**V07 数量层级一致**｜**V08 证据不得升级**｜**V09 不得伪造 SOURCED 几何**｜V10 UNKNOWN 不得带值｜**V11 镜像禁止全局缩放**｜V12 四角身份与前后条件｜V13 Frame 局部且世界未冻结｜V14 REF 不计入 BOM｜**V15 参考件隔离**｜V16 MODEL_BLOCKED 带理由｜V17 唯一纵切且可动链完整｜V18 汇总自洽与未越界标志｜V19 候选状态不得自称冻结

任务书点名的五类错误全部有专门规则与命名反例：错误代际(V05)、重复实例 ID(V01)、错误数量层级(V07)、混用螺柱/螺栓(V06)、未知数据声称 SOURCED(V08/V09/V10)。

---

## 10. 根模型树补丁方案（只提议，不自行修改）

任务书规定：若需修正根模型树，只提补丁方案与可测试证据，由总控决定。

**补丁 P-01：RP-01 新增 `CG-FASTENER`**

- 位置：`docs/planning/evidence/RP-01-tree-core.json` 的 `choiceGroups` 数组追加 `{"id":"CG-FASTENER","name":"车轮紧固架构","required":true}`
- 位置：`PART-30-009` / `PART-30-017` 的 `optionality` 由 `required` 改为条件必需（依赖 CG-FASTENER=STUD_AND_NUT）
- 位置：`PART-30-029` 增加 `roleByFastenerArch` 映射
- **可测试证据**：本骨架的 `architectureRules.CG-FASTENER` + `combos` 命令已证明四种组合合法、两种混用被拒。总控批准后可直接用同一规则回写根树并重跑 RP-01 校验器。
- **本轮不执行**：RP-01 已 approved，自行修改会破坏验收基线。

**补丁 P-02：qty 口径迁移（D-04）**

- 把整车级扁平 qty 拆为 `qtyPerParentInstance` + 可追溯派生的 `vehicleTotalQty`
- 需同时解决本轮记录的 12 个 `qtyConflicts`（前盘式件按四轮盘式标注 vs 后鼓式变型）
- **本轮不执行**：属 RP-07 冻结范围。

---

## 11. 已知缺口与边界

### 11.1 已知缺口（6 条）

1. `CG-FASTENER` 是新增候选，RP-01 未包含；需总控批准后才可回写根树
2. 每角数量分配为工程推断，RP-01 只给整车级 qty
3. 后轴轮端只建身份，整体桥+鼓式的后轮端深钻属后续任务
4. 驱动形式 `CONDITIONAL_UNKNOWN`，未定案
5. 所有几何 `GEOMETRY_PENDING`、质量与安装 `UNKNOWN`，无一 SOURCED
6. 世界 Frame 未冻结，instanceId/frameId 方案为候选

### 11.2 未做的事

- **未修改**：RP-01 / R-06 / R-11 已验收源文件、`src/`、`workbench-v2/`、CAD、`MASTER_PLAN.md`、共享 Schema、其他模型目录、他人留言原件
- **未新增**：任何常驻端口、顶层导航、轮毂/悬架独立主页（遵守 CARLAB_RUNTIME 与 ADR-007）
- **未声称**：任何几何真实性、OEM 尺寸、装配干涉验证、多体动力学、SOURCED 参数
- **未冻结**：世界 Frame、instanceId/frameId 方案、Joint/Constraint 边界
- **未自行批准**

`git status` 对 RP-01 证据、R-06 BOM、R-11 证据、`src/` 返回**空**。`workbench-v2/` 有改动，但来自 Composer 的 R-20 任务，**不是本轮所为**。

---

## 12. 交付入口

- 主报告（本文）：`docs/research/R-16-vehicle-skeleton.md`
- 机器可读骨架：`docs/research/R-16-vehicle-skeleton.fixture.json`
- 生成器：`agent-workspace/agents/qwen4/tools/r16_build_skeleton.py`
- 校验器：`agent-workspace/agents/qwen4/tools/r16_skeleton_tool.py`
- 实跑结果：本人 `reports/R-16-validation-result.json`、`R-16-selftest-result.json`、`R-16-combination-result.json`
- 个人回报：`agent-workspace/agents/qwen4/reports/R-16.md`
- 跨模型交接：给 DeepSeek R-17 与 Grok R-18 的公共消息（见个人回报）