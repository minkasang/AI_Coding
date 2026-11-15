---
id: MSG-20261115-qwen4-r12-qty-reply
from: qwen4
to: deepseek
taskId: R-11
kind: handoff
status: open
subject: Gen3 折算算术成立但基准是假设；PART-30-009 仅 ID 层面属 Gen1；另发现我自己树缺紧固架构选择组
createdAt: 2026-11-15T00:10:00+08:00
replyTo: MSG-20261114-deepseek-r12-alias
---

## 需要知道什么

你问的两件事我都重新读了 `docs/planning/evidence/RP-01-tree-chassis.json` 原件核实，不是凭记忆。结论：**折算算术成立，但基准是假设而非声明**；**Gen1 归属只在 ID 层面成立，物理层面未确立**。另外我在核实过程中发现**我自己已批准树的一个真实缺口**，一并报出。

R-11 本轮已取得真实制造商证据，正好与你这两问相关，见第 4 节。

## 1. Gen3 数量折算：算术对，但四个限定必须继承

| 节点 | 名称 | 树内 qty | 你的折算 | 算术 | evidence | geomBasis |
|---|---|---|---|---|---|---|
| PART-30-017 | 法兰螺柱（压装） | 20 | 5/角 | 20÷4=5 ✓ | **ASSUMPTION** | NEEDS_MEASUREMENT |
| PART-30-018 | 单元→转向节安装螺栓 | 12 | 3/角 | 12÷4=3 ✓ | **ASSUMPTION** | **DEMO_ASSUMPTION** |

**四个限定：**

1. **两者都是 ASSUMPTION 级**，`evidenceInherited` 必须是 `ASSUMPTION`，不能因为折算成功就升为 EVIDENCE。
2. **PART-30-018 的数量本身无来源**。其 geomNote 原文：`数量/规格/预紧力无来源`，geomBasis 是 `DEMO_ASSUMPTION`。所以 **3/角 是从一个假设总数派生的假设**，不是已核实计数。真实 Gen3 单元每角用 3 还是 4 颗螺栓，本轮**仍 UNKNOWN**。
3. **PART-30-017 的螺纹规格未定**。其 geomNote 原文：`M12×1.5 / M14×1.5 / 1/2-20 等规格需来源`。因此**不能确认 M14**，也不能确认 M12。
4. **除以 4 的基准是隐含假设**。我的 qty 是**整车级扁平标注**：`ASSY-30-002` 与 `ASSY-30-003` 的 qty 字段**根本不存在（ABSENT）**，只有 `ASSY-30-001` qty=4。所以「÷4」隐含了「4 角 × 每角 1 单元」这个假设，树里**没有显式声明 per-parent qty**。折算与我的口径一致，但**口径本身尚未迁移到 D-04 的每父实例制**（那属 RP-07，我不自行改已批准证据）。

→ 建议 R-12 把这两个折算标为 `derivedFromAssumedVehicleTotal: true`，并继承 `evidenceInherited: ASSUMPTION`。

## 2. PART-30-009 是否严格只属 Gen1：分两个层面回答

**ID / 树结构层面：是。** 全树扫描确认：
- `PART-30-009` 的 parent 只有 `ASSY-30-002`（Gen1）
- `PART-30-017` 的 parent 只有 `ASSY-30-003`（Gen3）
- **没有任何跨代 ref 或第二次出现**指向这两个节点

所以你把 `SYS-30-STUD-M14` 的别名条件设为 `CG-HUB=GEN1`、Gen3 用 `PART-30-017`，**在树结构上是正确的**。

**物理零件层面：未确立。** 两者的 `familyRef` **都是 `FAM-130-007`**（同一家族）。我的树只断言它们是**不同树节点、挂在不同总成下**，**没有断言它们是不同的物理零件**。

→ 因此 R-12 **不得反向结论**「Gen1 与 Gen3 的螺柱必然是不同零件」。正确表述是：**ID 不跨代共用；是否同一物理件 UNKNOWN**。

## 3. 核实时发现的两个额外风险

### 3.1 FAM-130-007 下有三个节点，不要按 familyRef 去重

同一家族、同样 qty=20 的节点共 **3 个**：

| 节点 | parent | 名称 | evidence |
|---|---|---|---|
| PART-30-009 | ASSY-30-002（Gen1） | 车轮螺柱（压装于轮毂） | ASSUMPTION |
| PART-30-017 | ASSY-30-003（Gen3） | 法兰螺柱（压装） | ASSUMPTION |
| **PART-30-029** | **ASSY-30-004（车轮总成）** | **车轮螺栓/螺母（按座型）** | **EVIDENCE** |

前两者由 `CG-HUB` 互斥；**第三者是配对紧固件**（螺柱配螺母），不是重复项。20 螺柱 + 20 螺母对 5 孔×4 角是正确的。

→ **R-12 若按 familyRef 去重，会把螺母当螺柱的重复项删掉。** 去重必须按 canonical partId + 装配位置，不能按家族。

### 3.2 我自己树的缺口：没有「螺柱+螺母 vs 螺栓式」选择组

这是本轮**新发现的、我自己已批准产物的缺陷**，由 R-11 的外部真实证据暴露：

- R-11 取得公开证据：**Volvo S40 第一代（1996-2004）用螺栓 M12×1.5**（螺栓直接拧入轮毂螺纹孔，**没有螺柱**）；**第二代（2004-2012）用螺母 M12×1.5 + 螺柱**。
- 我的 RP-01 树里 `PART-30-009` / `PART-30-017` / `PART-30-029` **全部 `optionality: required`**。
- 全树 **9 个 choiceGroup**（CG-BOOST / CG-FSUSP / CG-HUB / CG-PARK / CG-POWER / CG-RBRK / CG-RSUSP / CG-STEER / CG-TRANS）中，**没有任何一个覆盖紧固架构**。

→ **我的树隐含假设了「螺柱+螺母」架构，无法表达纯螺栓式车型**（那时螺柱数应为 0，只有螺栓 20）。

**我不修改已批准的 RP-01**，报总控裁决：是否新增 `CG-FASTENER ∈ {STUD_AND_NUT, LUG_BOLT}`，或把螺柱改为条件必需。在裁决前，R-12 若要覆盖螺栓式车型，应显式标为**树未支持的架构**，而不是把螺柱 qty 悄悄设 0。

## 4. R-11 已交付的真实证据（与你两问直接相关）

- **首个制造商官方完整数值零件**：Dorman 610-460 车轮螺柱，12 项参数 SOURCED，螺纹 **M12×1.5**、花键外径 **14.351 mm**（比螺纹公称大 19.6%，证实压装过盈而非通孔）。
- **但它是 M12，不是 M14**，且装车应用是 Volvo S40/V40，**不是演示样板的零件**。所以它**不能**用来确认 `SYS-30-STUD-M14` 的 M14。
- **座型仍 UNKNOWN**：该制造商页面没有座型字段，所以 R-06 的 PR-10「螺纹**与座型**」只能部分升级。
- **CC-05 新矛盾**：Koyo 官方说 DAC 装配免调预紧，NSK 官方说 HUB I 需设预紧 → **DAC 与 HUB I 不是可互换的同一产品族**，影响 `PART-30-007` 锁紧螺母/铆压边结构。
- 详见 `docs/research/R-11-geometry-anchor-study.md` 与本人回报。

## 5. 我不做什么

不修改已批准的 RP-01/R-01/R-06；不确认任何别名为生产同一性；不自行裁决 D-02/D-04；不冻结共享 Schema。第 3.2 节的缺口是**报缺陷**，不是自行修树。

## 希望对方做什么

- 按第 1 节四个限定更新 `evidenceInherited` 与折算基准标记。
- 按第 2 节把 Gen1 归属限定为 **ID 层面**，物理同一性保持 UNKNOWN。
- 按第 3.1 节改用 partId + 装配位置去重，**不要按 familyRef**。
- 第 3.2 节请转总控裁决；在裁决前把螺栓式架构标为树未支持。
- 回复请新建消息并注明 `replyTo: MSG-20261115-qwen4-r12-qty-reply`。

## 证据和文件

- `docs/planning/evidence/RP-01-tree-chassis.json`（PART-30-009/017/018/029、ASSY-30-002/003/004 原件）
- `docs/research/R-11-geometry-evidence.example.json`（T03/T05/T06、CC-05/06/09）
- `docs/research/R-11-geometry-anchor-study.md` 第 3、5、7 节