# R-12｜零件条件别名与证据继承的隔离验证（DeepSeek）

> 状态：**SUBMITTED**（待 GPT-6 审核；未冻结共享 Schema）
> 任务卡：`agent-workspace/agents/deepseek/tasks/R-12.md`
> 日期：2026-11-14
> 输入：Qwen4 R-06 与公共消息、Gemini R-03 资产清单、Grok R-09、RP-01 轮端树、R-08 门禁错误码
> 性质：隔离夹具与规则原型，不是生产代码，不是真实车型装配/尺寸认证。

---

## 0. 结论

R-12 在 R-10 适配器的基础上增加了四类真实风险的检查：**车型代际条件**、**条件别名**、**数量/REF/采购边界**、**证据继承与降级**。实际运行 24/24 用例通过：

- **正常 Gen1**：9 个 Gen1 子件、5 条别名有效；没有 Gen3 零件。
- **正常 Gen3**：9 个 Gen3 子件、2 条通用别名有效；R-03 的 Gen1 专用资产（`SYS-30-BRG-DAC4280`、`SYS-30-HUB-001`、`SYS-30-STUD-M14`）不生效；没有 `PART-30-006`。
- **非法条件**：同时选 Gen1/Gen3、Gen3 装配独立轮毂法兰、Gen1 装配 Gen3 内圈、Gen3 使用 Gen1 别名，全部被拒绝。
- **数量/REF**：螺柱 `5/角` vs `20/整车` 被区分；把 20 当单角数量、把两者相加、把 `REF-30-001` 制动盘既当 REF 又当直接 BOM、把 REF 计入 BOM，全部被拒绝。
- **采购边界**：Gen1 购买总成模式 7 行（3 个非 REF 组件） vs 全展开模式 15 行（11 个非 REF 组件），两种都合法但必须显式声明；混用被拒绝。
- **证据继承**：`ASSUMPTION` 不能升级为 `SOURCED`/`EVIDENCE`；`SOURCED` 必须有 `sourceId`；`UNKNOWN` 不能带值；别名缺 `evidenceInherited` 被拒绝。
- **错误码映射**：`KIN-E-SCALE→P14`（仅顶层 scale）、`KIN-E-LENGTH→P08/P09` 按原因分流、`KIN-E-CONVERGE→P17_SOLVER_CONVERGENCE_PROPOSED`（不是 P09）；R-08 `ERR_TRANSFORM_CHIRALITY` 留在 GATE_04，不混进 KIN-E。

这些是**规则/夹具层**的结论，不是实车尺寸、配合或运动学认证。

---

## 1. 背景与输入

Qwen4 的公共消息 `MSG-20261114-2330-qwen4-to-all-alias-evidence.md` 指出 R-10 抓不到的两类问题：

1. 别名没有 `applicableWhen`，会把 Gen1/Gen3 两代轴承同时算进轮端。
2. 别名没有 `evidenceInherited`，会把 ASSUMPTION 的螺柱/制动盘升级成“已证实”。

R-12 直接围绕这两点建立夹具，并补充 Qwen4 指出的 REF、qty、采购边界与 KIN-E 映射。

### 1.1 读取的真实结构

- `ASSY-30-001` 下 `ASSY-30-002`（Gen1）与 `ASSY-30-003`（Gen3）都是 `optionality=alternative`、`choiceGroup=CG-HUB`。
- `PART-30-006`（独立轮毂法兰）只在 Gen1 的 `ASSY-30-002` 下；Gen3 没有这个独立件。
- `PART-30-009`（车轮螺柱）evidence=`ASSUMPTION`，`qty=20`（整车级）；R-06 `BOM-30-009 qtyPerCorner=5`。
- `REF-30-001` 指向 `ASSY-40-009`（制动盘总成，属 SYS-40）；`REF-30-002/003/004/005` 分别指向卡钳/转向节/半轴/轮速传感器。
- `PART-40-046` 的 parent 是 `ASSY-40-009`，不是轮端；轮端只能通过 `REF-30-001` 引用。
- R-03 的 `SYS-30-STUD-M14` 名称含 “M14”，但 RP-01/R-06 没有已核实螺纹/座型；R-06 `PR-10` 是 `critical=true, grade=UNKNOWN, value=null`。

### 1.2 夹具文件

`docs/research/R-12-conditional-fixtures.json` 包含：

- 5 条别名：`SYS-30-WHEEL-END-ASSY`、`SYS-30-BRG-DAC4280`、`SYS-30-HUB-001`、`SYS-30-STUD-M14`、`SYS-40-ROTOR-001`。
- Gen1/Gen3 两个 generation set（各 9 个零件）。
- Gen1/Gen3 × 购买总成/全展开 四套 BOM。
- 24 个用例：正常、条件非法、别名越权、证据升级、数量/REF、采购边界、KIN-E 映射。

---

## 2. 五条条件别名

| 别名 | R-03 外部 ID | 规范目标 | 适用条件 `applicableWhen` | 继承证据 | 关键限制 |
|---|---|---|---|---|---|
| AL-01 | `SYS-30-WHEEL-END-ASSY` | `ASSY-30-001` | `CG-HUB in {GEN1,GEN3}`，且必须恰好一个 | EVIDENCE | 总成本身跨两代，但装配时必须单选 |
| AL-02 | `SYS-30-BRG-DAC4280` | `ASSY-30-002` | `CG-HUB=GEN1` | EVIDENCE | Gen1 专用；不能用于 Gen3 |
| AL-03 | `SYS-30-HUB-001` | `PART-30-006` | `CG-HUB=GEN1`，parent `ASSY-30-002` | EVIDENCE | Gen3 无独立轮毂法兰 |
| AL-04 | `SYS-30-STUD-M14` | `PART-30-009` | `CG-HUB=GEN1`，parent `ASSY-30-002` | **ASSUMPTION** | “M14”只是 R-03 命名，不是已核实螺纹/座型 |
| AL-05 | `SYS-40-ROTOR-001` | `PART-40-046` | 无 CG-HUB 条件；经 `REF-30-001` → `ASSY-40-009` | **ASSUMPTION** | 不能当轮端子件；REF 不计入 BOM |

所有别名状态仍是 `PROPOSED_NEEDS_CONFIRMATION`；R-12 不确认“同一实体”，只确认“ID/名称/父级存在且条件可执行”。

---

## 3. 正常 Gen1 / Gen3

### 3.1 Gen1

- 选中 `CG-HUB=GEN1`，hub assembly `ASSY-30-002`。
- 9 个 Gen1 子件：`PART-30-001..009`。
- 5 条别名有效：AL-01/02/03/04/05。
- 没有 Gen3 零件；没有 `PART-30-010..018`。
- 螺柱 `PART-30-009` 单角 5、整车 20。

### 3.2 Gen3

- 选中 `CG-HUB=GEN3`，hub assembly `ASSY-30-003`。
- 9 个 Gen3 子件：`PART-30-010..018`。
- 只有 2 条通用别名有效：AL-01（轮端总成）、AL-05（制动盘 REF）。
- AL-02/03/04 不生效；没有 `PART-30-006`、`ASSY-30-002`、`PART-30-009`。
- 螺柱为 `PART-30-017`，单角 5、整车 20。

**重要**：Gen3 不是“把 Gen1 的网格换外壳”。R-03 的 Gen1 资产不能在 Gen3 直接复用；否则会把独立轮毂法兰/Gen1 螺柱装到集成双法兰单元上。

---

## 4. 非法条件（全部实际拒绝）

| 用例 | 注入 | 实际错误 | 含义 |
|---|---|---|---|
| CASE-BOTH-GENERATIONS | `selectedGeneration=[GEN1,GEN3]` | `ERR_GEN_AMBIGUOUS` | 两代同时选，轮端会重复装配 |
| CASE-GEN3-WITH-GEN1-HUB | Gen3 + `PART-30-006` | `ERR_GEN_CROSS_MIX` | Gen3 没有独立轮毂法兰 |
| CASE-GEN1-WITH-GEN3-PART | Gen1 + `PART-30-010` | `ERR_GEN_CROSS_MIX` | Gen1 不能装 Gen3 集成内圈 |
| CASE-ALIAS-GEN3 | Gen3 使用 AL-03 (`SYS-30-HUB-001`) | `ERR_ALIAS_NOT_APPLICABLE` | 条件别名越权 |
| CASE-ALIAS-UNCONFIRMED | Gen1 使用未确认别名且 `requireConfirmed=true` | `ERR_ALIAS_UNCONFIRMED` | D-02 未裁决前不能当生产同一性 |
| CASE-ALIAS-NO-EVIDENCE | 别名缺 `evidenceInherited` | `ERR_EVIDENCE_INHERITANCE_MISSING` | 证据等级会静默丢失 |

---

## 5. 证据继承与降级

| 用例 | 继承 | 下游声明 | 结果 |
|---|---|---|---|
| CASE-EVIDENCE-UPGRADE | ASSUMPTION | SOURCED（有 sourceId） | `ERR_EVIDENCE_UPGRADE`：假设不能升级为来源事实 |
| CASE-SOURCE-MISSING | EVIDENCE | SOURCED（无 sourceId） | `ERR_SOURCE_MISSING`：来源声明必须有来源编号 |
| CASE-UNKNOWN-VALUE | UNKNOWN | UNKNOWN + value=1 | `ERR_UNKNOWN_VALUE`：未知不能带值 |

规则：

- `ASSUMPTION`/`UNKNOWN` 只能向下游继承，不能自动升级为 `SOURCED`/`EVIDENCE`。
- 别名 `SYS-30-STUD-M14` 继承 `ASSUMPTION`；即使名字含 “M14”，也不能把螺纹/座型当事实。
- 别名 `SYS-40-ROTOR-001` 继承 `ASSUMPTION`；不能因为 R-03 有 asset 就升级为已证实。
- 如果下游要使用这些零件，必须显式写 `valueBasis=ASSUMPTION/OPEN` 或提供 `sourceId`；否则拒绝。

---

## 6. 数量、REF 与采购边界

### 6.1 数量

- `PART-30-009`：`qtyPerCorner=5`，`vehicleTotal=20`，`cornerCount=4`。
- 把 20 当单角数量 → `ERR_QTY_LEVEL_CONFUSION`。
- 把 5 与 20 相加成 25 → `ERR_QTY_DOUBLE_COUNT`。
- 正确做法：BOM qty 用 5；整车总数 20 由 `qtyPerCorner × cornerCount` 派生，不重复求和。

### 6.2 REF

- `REF-30-001`（制动盘）不是 BOM 组件；它是跨系统指针，指向 `ASSY-40-009`。
- 同时把 `REF-30-001` 和 `PART-40-046` 放进轮端直接子件 → `ERR_REF_DOUBLE_COUNT`。
- 把 REF 计入 BOM 组件数 → `ERR_REF_AS_BOM`。
- `REF-30-002/003/004/005` 同理；REF 不应重复计数。

### 6.3 采购边界

| 模式 | Gen1 行数 | 非 REF 组件 | Gen3 行数 | 非 REF 组件 | 说明 |
|---|---|---|---|---|---|
| `PURCHASED_ASSEMBLY` | 7 | 3 | 7 | 3 | 轴承总成作为 1 件外购件，不展开内部 9 件 |
| `FULLY_EXPANDED` | 15 | 11 | 15 | 11 | 展开 9 个内部件 + 螺钉/车轮 |

- 两种模式都合法，但必须显式声明；混用（购买总成模式下又出现内部件）→ `ERR_PROCUREMENT_DOUBLE_COUNT`。
- 这不是“哪个数量对”的问题，而是**采购/装配边界**的选择；R-06 的 `BOM-30-002 qtyPerCorner=1` 支持购买总成模式，RP-01 的 9 件支持全展开模式。

---

## 7. KIN-E / R-08 错误码语义

| 源码 | 原因 | 建议父码 | 说明 |
|---|---|---|---|
| `KIN-E-SCALE` | 变体全局缩放 | `P14` | R-01 P14 只查顶层 `scale/globalScale/meshScale`；嵌套缩放覆盖有限 |
| `KIN-E-LENGTH` | 模块长度不足/派生尺寸不符 | `P08` | 补救是换模块或改参数区间 |
| `KIN-E-LENGTH` | 派生跨度超过模块 maxSpan | `P09` | 物理上不可解，需重新设计/换模块 |
| `KIN-E-CONVERGE` | 求解器不收敛 | `P17_SOLVER_CONVERGENCE_PROPOSED` | R-01 没有收敛规则；**不能硬映射 P09** |
| `ERR_TRANSFORM_CHIRALITY` | 镜像/负缩放 | `GATE_04_TRANSFORM_PARITY` | R-08 门禁，不是 KIN-E |
| `ERR_ASSEMBLY_CLEARANCE_VIOLATION` | ISO 273/干涉 | `GATE_03_ASSEMBLY_CLEARANCE` | 装配几何门禁，不是求解器结果 |

**结论**：`KIN-E-LENGTH` 必须按原因分流到 P08/P09；`KIN-E-CONVERGE` 不是“物理不可解”，不能冒充 P09；R-08 的 transform/assembly 门禁与 KIN-E 是不同层。

---

## 8. 这些测试证明了什么、没证明什么

**证明**：
- 5 条别名能按 `applicableWhen` 条件生效/失效；Gen1/Gen3 不会混装。
- `ASSUMPTION`/`UNKNOWN` 不会被静默升级；缺 `evidenceInherited` 会被拒绝。
- 5/20 数量、REF 不计数、采购边界都能被明确校验。
- KIN-E 与 R-08 错误码的语义差异能被规则化。

**没证明**：
- 不证明 Gen1/Gen3 零件真实可互换或可装配；R-03 没有 Gen3 资产，R-06 也没有 Gen3 尺寸。
- 不证明 `SYS-*` 与 `PART/ASSY-*` 是同一实体；别名仍是 `PROPOSED_NEEDS_CONFIRMATION`。
- 不证明 PCD/CB/ET、螺纹、预紧、轴承内部、材料、质量、热、疲劳、碰撞。
- 不证明 P17 是正式规则；它只是提案，需 GPT-6/RP-07 裁决。
- 24/24 只证明条件/证据/数量的拒绝逻辑可运行，不证明真实车辆工程正确。

---

## 9. 未决事项

| ID | 未决 | 责任 |
|---|---|---|
| D-02 | `SYS-*` ↔ RP-01 `PART/ASSY-*` 是否为同一实体 | GPT-6 |
| D-04 | RP-01 整车 qty 是否迁移为 per-parent + `vehicleTotalQty` | GPT-6/Qwen4 |
| D-05 | Joint vs Constraint 边界（R-04/R-09） | GPT-6/Grok |
| P17 | `KIN-E-CONVERGE` 是否新增 `P17_SOLVER_CONVERGENCE` | GPT-6 |
| ERR | R-08 `ERR_*`、R-09 `KIN-E-*`、R-10/R-12 新码如何合并 | GPT-6/Gemini/Grok |
| GEN3 | Gen3 的 R-03 资产/螺柱/法兰真实数据缺失 | Gemini/Qwen4 |
| CB/FIT | 中心孔/配合/公差仍 UNKNOWN | Qwen4/Gemini |

---

## 10. 下一步

1. 总控裁决 D-02/D-04/D-05/P17/ERR；裁决前 R-12 保持别名 `PROPOSED_NEEDS_CONFIRMATION`、Gen1/Gen3 条件生效、REF 不计数。
2. 让 Gemini 补 Gen3 资产与安装面；让 Qwen4 补 `PART-30-017/018` 与 Gen3 螺柱/法兰的真实关系；让 Grok 确认 Constraint 分类。
3. 在真实数据到齐前，不把 Gen3 说成“已有 CAD”，不把 M14 螺纹当已核实，不把 20 当单角数量。

---

## 11. 文件与复现

| 文件 | 作用 |
|---|---|
| `docs/research/R-12-conditional-adapter-report.md` | 本报告 |
| `docs/research/R-12-conditional-fixtures.json` | 5 条条件别名、Gen1/Gen3、BOM、24 个用例 |
| `agent-workspace/agents/deepseek/tools/r12_conditional_check.mjs` | 条件别名/证据/数量/REF/采购/KIN-E 校验器 |
| `agent-workspace/agents/deepseek/reports/R-12-results.json` | 实跑结果 |
| `agent-workspace/agents/deepseek/reports/R-12.md` | 个人回报 |

复现：

```bash
node agent-workspace/agents/deepseek/tools/r12_conditional_check.mjs \
  docs/research/R-12-conditional-fixtures.json \
  agent-workspace/agents/deepseek/reports/R-12-results.json
# 期望 EXIT=0；24/24 PASS
```

## 12. 来源

- `docs/planning/evidence/RP-01-tree-chassis.json`（`ASSY-30-001/002/003`、`PART-30-006/009/010..018`、`REF-30-001..005`、qty）
- `docs/research/R-06-minimal-assembly-bom.json`（`BOM-30-002/006/009`、PR-06/07/10/15/16、12 interfaces）
- `docs/research/R-03-asset-manifest.example.json`
- `docs/research/R-08-quality-gates.json`
- `docs/research/R-09-kinematics-prototype.md`
- `agent-workspace/shared/messages/MSG-20261114-2330-qwen4-to-all-alias-evidence.md`
- `docs/command/reviews/AUDIT_2026-11-14_BATCH3_7MODELS.md`
