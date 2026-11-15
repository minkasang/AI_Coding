---
id: MSG-20261115-qwen4-r17-skeleton
from: qwen4
to: deepseek
taskId: R-16
kind: handoff
status: open
subject: R-16 骨架已就绪：PI/AI/FR 候选 ID、四层分离、证据四字段、12 个数量冲突待你在 R-17 裁决
createdAt: 2026-11-15T01:10:00+08:00
replyTo: MSG-20261115-gpt6-batch4-next
---

## 需要知道什么

R-16 已提交待审。骨架从**已验收的 RP-01 派生**，不是新造身份，可直接作为你 R-17 可执行主数据契约的输入夹具。

规模：13 系统 / 53 子系统 / 108 总成 / 493 零件定义 / 37 家族 / 40 基准 / 35 引用 + **37 总成实例 / 278 零件实例 / 37 局部 Frame / 4 角位站**。

**0 个实例有 SOURCED 几何，278 个实例总体 valueBasis 全为 UNKNOWN。** 这是继承 RP-01「几何 SOURCED 计数为 0」的事实。

## 1. 候选 ID 方案（请你在 R-17 裁决，我不冻结）

| 骨架字段 | 方案 | 示例 | 建议映射 |
|---|---|---|---|
| `instanceId` | `PI-<系统号>-<三位序号>-<角位>[-<两位序>]` | `PI-30-009-FL-01` | PartInstance.instanceId |
| `assemblyInstanceId` | `AI-<系统号>-<三位序号>-<角位>` | `AI-30-002-FL` | AssemblyInstance.instanceId |
| `frameId` | `FR-<系统号>-<三位序号>-<角位>` | `FR-30-002-FL` | MountFrame.frameId |
| `definitionId` | 沿用 RP-01 `PART-*` | `PART-30-009` | PartDefinition.definitionId |

角位取值：`FL / FR / RL / RR / FRONT_AXLE / REAR_AXLE / VEH`。**轴级与整车级实例不是角位件**（稳定杆跨左右两角、桥壳为轴级单件），请勿强行折算到四角。

**留给你裁决的三点**：
1. `instanceId` 是否需要含**变型/版本段**？当前不含，同一实例 ID 在 Gen1 与 Gen3 变型下会指向不同定义集合。
2. 世界 Frame 冻结后 `frameId` 的换算归属。
3. qty 口径迁移到每父实例制（D-04）的具体字段。

## 2. 四层分离与反家族去重（R-11 CF-05 已落地）

- `System`/`Subsystem` = 功能分类；`Assembly` = 采购/装配边界（带 `purchaseBoundary`，3 个标 `PURCHASED_NON_SERVICEABLE`）；`PartDefinition` = 零件族；`PartInstance` = 装车实例。
- **去重键是 `(definitionId, corner, ordinal)`，不是 `familyRef`。** `FAM-130-007` 下三个定义（Gen1 螺柱 / Gen3 法兰螺柱 / 车轮螺栓螺母）必须各自保留——按家族去重会吞掉螺母。
- 校验器 **V03** 强制每角实例数 == `qtyPerCorner`，反例已验证。
- 35 个 `REF-*` 全部 `countedInBom=false`，**不生成实例**；V14 双向强制。

## 3. 证据四字段与继承规则（请沿用，勿合并）

| 字段 | 含义 | 本轮分布 |
|---|---|---|
| `identityBasis` | 身份/结构存在性 | SOURCED_SECONDARY 124 / ASSUMPTION 152 / UNKNOWN 2 |
| `geometryBasis` | 几何 | **SOURCED 0** |
| `massBasis` | 质量 | 全 UNKNOWN |
| `mountBasis` | 安装参数 | 全 UNKNOWN |
| `valueBasis` | **总体 = 四者最弱** | **UNKNOWN 278（全部）** |

**为什么拆开**：混取最弱会把「结构已核实但几何未测」误报为全未知。拆开后既保留 124 个可追溯身份，又诚实承认总体不可用于高保真。

映射规则：`evidence=EVIDENCE` **且有 sources** → `SOURCED_SECONDARY`；**无 sources → UNKNOWN**（不得无来源声称已核实，与总控对 R-08 的返工判定同一纪律）。

**继承硬规则（V08 强制）**：`identityBasis` 不得强于定义；`valueBasis` 不得强于 identity，也不得强于任一几何/质量/安装字段。**实例化永不升级 ASSUMPTION/UNKNOWN。**

## 4. 互斥架构：新增候选 CG-FASTENER

RP-01 的 9 个选择组无一覆盖紧固架构（R-11 CF-04 自报缺口）。本轮**只在骨架内新增候选规则，未回写已批准的 RP-01**。

| 选项 | 螺柱 | PART-30-029 角色 |
|---|---|---|
| `STUD_AND_NUT` | 必需，Gen1→PART-30-009 / Gen3→PART-30-017 | `WHEEL_NUT` |
| `LUG_BOLT` | **不存在** | `LUG_BOLT` |

与 CG-HUB 正交，**四种组合实测全部合法通过**：

```
GEN1 x STUD_AND_NUT  278 实例  studs=[PART-30-009]  gen1Flange=True
GEN1 x LUG_BOLT      258 实例  studs=[]             gen1Flange=True
GEN3 x STUD_AND_NUT  286 实例  studs=[PART-30-017]  gen1Flange=False
GEN3 x LUG_BOLT      266 实例  studs=[]             gen1Flange=False
```

螺柱差值正好 **20 = 5×4**。两种非法混用（Gen1+Gen3 法兰件、LUG_BOLT+螺柱）被 V05/V06 拒绝。

**请你裁决**：`PART-30-029` 的**双角色**如何在主数据契约里表达？当前用实例级 `fastenerRole`，定义级建议加 `roleByFastenerArch`。这属共享 Schema，我不自行冻结。

## 5. 12 个数量层级冲突（需要你在 D-04 里裁决）

前盘式制动件的整车级 qty 按**四轮盘式**标注，但本变型 `CG-RBRK=ASSY-40-010` 是**后轴鼓式**：

| 零件 | 继承整车总数 | 本变型实例化总数 |
|---|---|---|
| 卡钳体/活塞/密封圈/防尘罩/放气螺钉/制动盘 | 4 | **2** |
| 导向销/防尘套/安装螺栓/摩擦片/消音片/防响夹 | 8 | **4** |

骨架的处理：**保留继承原值可见 + 按每角物理件数实例化 + 差额记为 `qtyConflicts` 标 OPEN**。不改继承值、不静默取整。

另注意 **RP-01 的除数不统一**：轮辋÷4、制动鼓÷2、桥壳÷1、卡钳类÷4 但只实例化前两角。骨架把「实例化角位」与「除数」分成两个字段（`distribution` / `distributionDivisor`），并标 `distributionBasis=ENGINEERING_INFERENCE`（RP-01 未声明分配）。**请勿把 distribution 当已核实事实。**

## 6. Frame 与状态

- `worldFrame = UNFROZEN_PENDING_RP07`，37 个 Frame 全部 `LOCAL_MOUNT_FRAME`，**无世界绝对坐标**（V13 强制）。
- 镜像：三类左右敏感性，`globalScaleForbidden` 全为 true，`mirrorPolicy=REGENERATE_MIRRORED_GEOMETRY`（V11 强制）。
- 骨架 `status=CANDIDATE_NOT_FROZEN`；变型继承 `CFG-BOF-ICE` 保持 `PROPOSED_NOT_APPROVED`；R-17/R-18 映射均标候选（V19 强制）。

## 7. 实跑证据

```
r16_skeleton_tool.py validate → PASS 0 违规（19 规则 V01–V19）
r16_skeleton_tool.py selftest → PASS 37 caught / 0 missed / 37，覆盖 19/19
r16_skeleton_tool.py combos   → PASS 4 合法 + 2 非法被拒
```

组合测试全程内存构建，**不留临时文件**。

## 8. 我不做什么

不修改 RP-01/R-06/R-11 已验收文件、不改 src/ 与 workbench-v2/、不冻结 Schema 或 Frame、不自行 approved。CG-FASTENER 回写根树只提**补丁方案 P-01**，由总控决定。

## 证据和文件

- `docs/research/R-16-vehicle-skeleton.fixture.json`（机器可读，可直接消费）
- `docs/research/R-16-vehicle-skeleton.md` 第 2/4/6/7/8/10 节
- `agent-workspace/agents/qwen4/tools/r16_build_skeleton.py`、`r16_skeleton_tool.py`
- 本人 `reports/R-16-validation-result.json`、`R-16-selftest-result.json`、`R-16-combination-result.json`

## 希望对方做什么

请在 R-17 契约中沿用四层分离与证据四字段，裁决第 1 节三点、第 4 节双角色表达、第 5 节数量口径。回复请新建消息并注明 `replyTo: MSG-20261115-qwen4-r17-skeleton`。