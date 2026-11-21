# R-26｜整车身份、变型与数量冲突的可执行裁决候选

> 工作位：qwen4（整车系统树 · 车型平台）｜任务：R-26 / 03.28｜日期：2026-11-21
> 状态：**submitted，等待 GPT-6 核验**。本文不自行批准。
> 任务书：`docs/tasks/R-26-critical-identity-variant-qty-decisions.md`

---

## 1. 结论摘要

以 R-21 的九项冲突（含 4 项 P0）和 R-22/R-27 的集成结果为输入，把当前试验样板收敛为**一份最小、明确、机器可验证的工程事实口径**。不重画树、不补假实例、不改任何已验收源数据。

| 事项 | 结果 |
|---|---|
| 4 项 P0 裁决 | 2 项 `NEEDS_RP07`、1 项 `ACCEPT_CANDIDATE`、1 项 `BLOCKED_NEEDS_SOURCE` |
| 规范物理身份 | **`PI-*` 为候选主实例 ID**；`INST-*` 只作投影键 |
| INST → PI 映射 | **13 条有条件映射 + 1 条拒绝**（拒绝的是卡钳支架） |
| 数量矛盾 | **12 项全部保留为可追溯 blocker**，一个没消 |
| DEFERRED 零件 | 2 个，原因不同、分开标注 |
| Frame 来源 | 27 个，其中 **14 个非零原点未标等级**（待补 DEMO_ASSUMPTION） |
| 对 R-21 的自查 | 发现 1 处字段语义缺陷并登记更正（**不改 R-21 源文件**） |
| 校验 | validate **PASS 0 违规**（20 条规则）；selftest **37 caught / 0 missed / 37，覆盖 20/20** |

一句话：**能定的按候选口径定下来并写清条件，定不了的明确阻断到具体责任人，没有一条被含糊过去。**

---

## 2. 输入与只读边界

五份输入全部只读，并登记 SHA-256（校验器 T15 真实重算比对，输入被替换会立刻失败）：

| 角色 | 文件 |
|---|---|
| 详细树 | `docs/research/R-16-vehicle-skeleton.fixture.json` |
| 九项冲突与对照表 | `docs/research/R-21-vehicle-tree-mapping.fixture.json` |
| 领域夹具（整车） | `src-experiments/domain-contract-v1/fixtures/vehicle-skeleton.json` |
| 领域夹具（FL 纵切） | `src-experiments/domain-contract-v1/fixtures/fl-wheel-end.json` |
| 候选位姿 | `src-experiments/mechanism-vertical-slice-v1/R-18-results.json` |

**未修改** RP-01 / R-16 / R-17 / R-18 / R-21 任何文件。R-21 已 approved，本文只登记更正，不回头改它。

---

## 3. 规范身份策略

| 项 | 口径 |
|---|---|
| 主物理实例 ID | **`PI-*`**（R-16 候选树，GPT-6 batch6 已定方向） |
| R-17 投影键 | `INST-*`，状态 `VIEW_LOCAL_NOT_CANONICAL` |
| 一个 `PI-*` | **就是一件实物**，占一个角位/序号 |
| `qtyPerCorner` | 零件族在角位的**聚合**数量，不属于单个实例，**不可再乘** |
| 变型身份 | **不断言同一实车**（`variantIdentityAsserted=false`） |
| 几何 | **0 个实例具备 SOURCED 几何**，278 个全 `GEOMETRY_PENDING` |
| 冻结 | 未冻结，冻结门 = RP-07 |

---

## 4. 四层语义必须分开

| 层 | R-16 字段 | R-17 字段 | R-16 / R-17 数量 | 是一件实物？ |
|---|---|---|---|---|
| PartDefinition | `partDefinitions[].id` | `partDefinitions[].partId` | 493 / 11 | 否 |
| **PartInstance** | `partInstances[].instanceId` | `partInstances[].instanceId` | **278 / 14** | **是** |
| AssemblyDefinition | `assemblies[].id` | `assemblyDefinitions[].assemblyId` | 108 / 12 | 否 |
| AssemblyInstance | `assemblyInstances[].instanceId` | `assemblies[].assemblyId` | 37 / 15 | 否 |

**陷阱**：R-17 用**同一个字段名 `assemblyId`** 承载 AssemblyDefinition 与 AssemblyInstance。跨数组裸 join 会把定义当实例。R-16 分用 `assemblies` / `assemblyInstances`，不存在这个问题。

---

## 5. 四项 P0 逐项裁决

### D-26-01 · CF-01 占位总成复用真实 ID → **NEEDS_RP07**

6 个占位总成复用 RP-01 真实 ID 但语义被放宽（如 `ASSY-70-001` 燃油箱总成 → 能源供给总成）。

- **逐项**：6 个占位 → `BLOCKED_NEEDS_SOURCE`（无来源证明是同一装配）；3 个非占位名称漂移 → `ACCEPT_CANDIDATE`（以 RP-01 名为准，R-17 名作 alias）。
- **可继续**：树上并列显示规范名 + 占位名，标 `semanticBroadening=true`。
- **被阻断**：不得把占位总成当 RP-01 具体总成的装车实例，不得回写规范名。
- **为什么是 NEEDS_RP07**：占位要不要另立 ID 前缀属于共享身份命名空间，执行模型不得自行改。

### D-26-02 · CF-06 父级压平 → **NEEDS_RP07**

6 处父级与 RP-01 不一致：转向节 `ASSY-20-004 → ASSY-20-001`、轮辋四角 `ASSY-30-004 → ASSY-30-001`、卡钳支架 `ASSY-40-007 → ASSY-40-008`。

- **逐项**：5 个已映射 → `ACCEPT_CANDIDATE`（树按 RP-01 规范父级渲染，qty 按规范父装配算）；卡钳支架 → `BLOCKED_NEEDS_SOURCE`（零件本身存在性未裁决）。
- **可继续**：先固定"qty 一律按 RP-01 规范父级计算"作为候选口径。
- **被阻断**：两种父级层级不得混算出平均数量。

### D-26-03 · CF-07 14 处 Frame 未标等级 → **ACCEPT_CANDIDATE**

- **逐项**：14 个非零原点全部 `ACCEPT_CANDIDATE`，统一补标 `DEMO_ASSUMPTION`。
- **为什么这一项可以接受**：处置只是**补标降级**，不引入任何新事实。`VEHICLE_LOCAL` 空间合法但仍非世界坐标，`worldFrame` 保持 `UNFROZEN_PENDING_RP07`。
- **被阻断**：不得据此声称安装位置已核实，不得做干涉/装配可行性结论。

### D-26-04 · CF-09 两侧变型不同 → **BLOCKED_NEEDS_SOURCE**

- R-16 `VAR-R16-BOF-ICE`（basedOn `CFG-BOF-ICE`，PROPOSED_NOT_APPROVED，无 Project 层）
- R-17 `VV-A-SWB-STD`（`platformFamilyRef=PF-DEMO-BOF-01`，只设 1/10 选择组）
- **代际一致（GEN1）不能推出同一实车。** 13 条跨夹具映射全部只能算候选对应。
- **为什么不是 NEEDS_RP07**：缺的是真实变型定义/对齐来源，不是接口裁决；执行侧没有可补的真实数据。

---

## 6. INST → PI 映射表（无法证明即拒绝）

| 结果 | 数量 | 说明 |
|---|---|---|
| `CONDITIONAL` | **13** | 按 `(partId, corner, ordinal)` 可精确配对，但带条件 |
| `REJECTED` | **1** | `INST-CALIPER-BRACKET-FL`（PART-40-048） |

**13 条为什么不是 PROVEN**：它们全受 CF-09 约束（变型未对齐），因此每条都带 `"CF-09：变型对齐未裁决，本映射为候选对应"`；若父级不同再加 `CF-06` 条件；若零件带变型条件再加对应条件。**没有一条是无条件的。**

**唯一被拒绝的**：R-16 没有该零件的 `PI-*`，且零件存在性本身未裁决（`variantFlag=caliperFixedOrFloating`）。**拒绝而不是新增假实例**——这正是任务书要求的方向。

---

## 7. 数量语义与 12 项 blocker

### 7.1 一个 PI 就是一件，不可再乘

```python
# R-16 V03：每 (definitionId, corner) 的实例数必须等于 qtyPerCorner
grp = Counter((p["definitionId"], p["corner"]) for p in partInstances)
assert grp[k] == p["qtyPerCorner"]
```

**反例**：车轮螺柱 20 个实例 × 每实例 `qtyPerCorner=5` = **100**，而继承总数与正确算法都是 **20**。
→ **整车总数 = PI 实例计数**，`qtyPerCorner` 是零件/角位层级的聚合信息。

### 7.2 12 项盘/鼓数量矛盾全部保留

全部是**前盘后鼓配置与 RP-01 四轮盘式标注不一致**，`distribution=FRONT2`、`divisor=4`、`status=BLOCKED_OPEN`：

| 差额 | 零件 | 数量 |
|---|---|---|
| delta = 2（每角 1 件） | PART-40-034 卡钳体 / 035 活塞 / 036 密封圈 / 037 防尘罩 / 040 放气螺钉 / 046 通风制动盘 | 6 项 |
| delta = 4（每角 2 件） | PART-40-038 导向销 / 039 导向销防尘套 / 041 卡钳安装螺栓 / 042 摩擦片总成 / 043 消音片 / 044 防响夹 | 6 项 |

每项带 `traceRef`（指回 R-16 的 `qtyConflicts[definitionId]`）与 `resolutionOwner=总控 RP-07`。**没有一个被改成一致**，校验器 T05 逐条比对数量与数值，改动即失败。

---

## 8. 两个 DEFERRED 零件：原因不同，不可合并

| 零件 | `deferKind` | 原因 | 去留 | 关键字段 |
|---|---|---|---|---|
| `PART-20-075` 外拉杆端 | **`REQUIRED_BUT_DEFERRED`** | 几何/来源未闭合（锥柄尺寸无来源） | **本变型必需**，只是暂缓实例化 | `optionality=required`、`qtyVehicleTotal=2`（仅前轴）、`MIRROR_REGENERATE` + 需独立 Frame |
| `PART-40-048` 卡钳支架 | **`VARIANT_UNDECIDED`** | `variantFlag=caliperFixedOrFloating` 未裁决 | **未定** | `optionality=required`、`qtyVehicleTotal=4`、`parentId=ASSY-40-007` |

两者都**没有**规范 `PI-*`（`hasCanonicalInstance=false`）。**下游不得因缺实例而省略外拉杆端**；也不得声称卡钳支架必有或必无。

---

## 9. Frame 范围对账：21 vs 27、11 vs 14

DeepSeek R-27 提出两处统计差异。**核实结论：是范围不同，不是 R-21 的统计错误。**

| 口径 | 数量 | 内容 |
|---|---|---|
| vehicle 夹具 Frame | 27 | — |
| FL 夹具 Frame | 21 | **全部是 vehicle 夹具的子集**（`flFixtureIsStrictSubsetOfVehicle=true`） |
| vehicle 独有 | 6 | `FR-WHEEL-END-{FR,RL,RR}`、`FR-WHEEL-INST-{FR,RL,RR}` |
| FL 独有 | 0 | — |
| 非零原点（vehicle / FL） | 14 / 11 | 多出的 3 个正是 `FR-WHEEL-END-{FR,RL,RR}` |

R-27 纳入 FL 纵切 21 个（其中 11 个非零），R-21 取两份并集 27 个（其中 14 个非零）。**两者都正确。**

### 9.1 对 R-21 的一处自查更正（CORR-26-01）

R-21 `frameMapping[].fixture` 字段的实际含义是**"首次在哪个夹具见到"**——因为去重顺序先遍历 vehicle 夹具，27 条全部被标成 `VEHICLE`。这**不影响** 27 / 8 / 19 / 14 任何统计，但会让人误读为"FL 夹具没有这些 Frame"，也是 DeepSeek 一度以为两处数字矛盾的原因。

本轮改用 `fixturePresence` 台账：**21 个 `BOTH` + 6 个 `VEHICLE_ONLY` + 0 个 `FL_ONLY`**，校验器 T10 拿原始夹具逐条比对。

**R-21 源文件未修改**（`r21FileModified=false`），以本任务的 `frameProvenance` 为准。

---

## 10. R-18 hub 位姿：角色标记，不是刚性零件位姿

**同意 DeepSeek R-27 的 `CANDIDATE_ROLE_BINDING` / `ROLE_MARKER` 语义。**

R-18 提供的是 `wheelCenter + spindleAxis` 的**角色位姿**，不能证明它就是轮毂法兰的局部坐标系。因此：

- `PI-30-006-FL` 只是**角色目标**，不是已证明的刚性零件位姿；
- R-18 的 `CANDIDATE_NOT_FROZEN` / `FICTIONAL_FIXTURE` / `DEMO_ASSUMPTION` 全部保留；
- 不得据此补轮端力，也不得把 `INST-SLA-*` 当零件编号。

校验器 T18 强制：`poseKind` 必须是 `ROLE_MARKER_NOT_RIGID_PART_POSE`，R-18 状态被升级即失败。

---

## 11. 校验与负例

```
python agent-workspace/agents/qwen4/tools/r26_build_decisions.py
python agent-workspace/agents/qwen4/tools/r26_decision_tool.py validate   → PASS，0 违规（20 规则 T01–T20）
python agent-workspace/agents/qwen4/tools/r26_decision_tool.py selftest   → PASS，37 caught / 0 missed / 37，覆盖 20/20
```

`T01` 引用有效｜`T02` 裁决值域｜`T03` 变型不得断言同一｜`T04` qty 不得再乘｜`T05` 12 项 blocker 完整｜`T06` 实例 ID 不重复｜`T07` 无法证明即拒绝｜`T08` 四层不混｜`T09` Frame 来源必须标等级｜`T10` Frame 范围与原始夹具一致｜`T11` 占位总成不得当真实｜`T12` 父级漂移必须记录｜`T13` 两类 DEFERRED 不可合并｜`T14` R-21 更正必须登记且不得改源文件｜**`T15` 输入 SHA-256 真实重算**｜`T16` 汇总自洽｜`T17` 不变量为假/零｜`T18` hub 角色语义｜`T19` blocker 可追溯｜`T20` 零几何声称

### 11.1 校验器抓出的一处真实缺口

**T11 原本只检查"6 个占位项都在且都被阻断"，不检查非占位的 3 个漂移项。** 负例"从 CF-01 决策里删掉一项"因此**没被捕获**（37 项里漏 1 项）。

**没有改负例绕开，而是补强规则**：现在 T11 同时校验占位项、漂移项与总项数（6+3=9）。删任何一项都会失败。修好后 37/37。

---

## 12. 阻断清单（谁需要动作）

| ID | 事项 | 责任方 | 影响 |
|---|---|---|---|
| B-26-01 | 变型身份未对齐（CF-09） | 总控 RP-07 / 双方 | 13 条映射只能是候选 |
| B-26-02 | 占位总成 ID 命名空间（CF-01） | 总控 RP-07 | 6 个占位不能当真实总成 |
| B-26-03 | 规范父级层级（CF-06） | 总控 RP-07 | 父级先定，qty 才能跨模型比较 |
| B-26-04 | 12 项盘/鼓数量矛盾 | 总控 RP-07 | 数量差 2/4 未裁决 |
| B-26-05 | 卡钳型式未裁决 | 总控 | PART-40-048 存在性与父级未定 |
| B-26-06 | 全部实例无几何 | 几何来源 | 278 个 PI 均 GEOMETRY_PENDING |
| B-26-07 | 世界 Frame 未冻结 | RP-07 | `UNFROZEN_PENDING_RP07` |

---

## 13. 边界与未闭合

**边界**：未新增常驻端口（仍 5173 / 5174）；未另造一级轮毂/悬架页面；未改共享 Schema、`src/`、`workbench-v2/`；未创建任何假实例或假几何；未把演示值升级为来源事实；未自行批准。

> 注：`git status` 显示 `workbench-v2/` 有改动并新增 `experiments/vehicle-snapshot-adapter/`，那是 **Composer R-29 与 DeepSeek R-31 的进行中工作**，非本轮所为。RP-01 / R-16 / R-21 / `src-experiments/` / `src/` 均为空。

**未闭合**：7 项阻断全部仍开放；CF-09 的变型对齐需要真实变型定义，执行侧无法自行闭合；CF-01/CF-06 需要 RP-07 裁决命名空间与父级层级；卡钳型式需要产品侧裁决。

---

## 14. 交付入口

- 主报告（本文）：`docs/research/R-26-decision-candidates.md`
- 机器可读审查对象：`docs/research/R-26-decision-candidates.fixture.json`
- 生成器：`agent-workspace/agents/qwen4/tools/r26_build_decisions.py`
- 校验器：`agent-workspace/agents/qwen4/tools/r26_decision_tool.py`
- 实跑结果：本人 `reports/R-26-validation-result.json`、`R-26-selftest-result.json`
- 个人回报：`agent-workspace/agents/qwen4/reports/R-26.md`
- 跨模型消息：给 DeepSeek（R-27/R-31）、Grok（R-28）、Composer（R-29）的公共消息