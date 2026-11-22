# R-46｜转向左右子总成候选

> 工作位：qwen4（整车系统树 · 车型平台）｜任务：R-46 / 03.48｜日期：2026-11-22
> 状态：**submitted，等待 GPT-6 核验**。本文不自行批准。
> 任务书：`docs/tasks/R-46-steering-corner-assembly-candidate.md`

---

## 1. 结论摘要

按总控在 R-42 审核中的决定（保留一个中央转向器总成，为两侧分别提议子总成），做出一份**可机读、可校验、未被执行的候选**：

| 项 | 结果 |
|---|---|
| 中央转向器 | `ASSY-20-014` / `AI-20-014-VEH`，**仍是 1 个 VEH 级实例** |
| 候选左右子总成 | `CAND-ASSY-20-014-FL` / `CAND-ASSY-20-014-FR`，各 1 实例 + 1 Frame |
| 每侧零件 | 内拉杆 074、外拉杆端 075、锁紧螺母 076、防尘罩 077、卡簧+槽顶螺母 078，**各 1 件** |
| 候选零件实例 | **10 个**（5 件 × 2 侧） |
| 数量核对 | **5/5 零件平衡**：每件候选 2 + 中央 0 = `qtyVehicleTotal` 2 |
| 中央原 13 个 VEH 级子件 | **逐一未改动** |
| 新增规则 | 1 条：`R46-REL-01`（每角子总成实例可挂在 VEH 级父实例下） |
| 校验 | validate **PASS 0 违规**（16 规则）；selftest **28 caught / 0 missed / 28，覆盖 16/16** |
| 副作用 | **R-16 未改、R-27 快照未重建、正式 PI 未新增** |

一句话：**中央总成保持唯一，左右各加一个"拉杆子总成"把 5 个每角零件收进去，零件角位与各自父总成实例一致，数量不重不漏。**

---

## 2. 基线（全部只读）

| 输入 | 用途 | 策略 |
|---|---|---|
| `docs/research/R-16-vehicle-skeleton.fixture.json` | 中央总成、13 个 VEH 子件、5 个每角零件 | **REQUIRED** |
| `src-experiments/vehicle-snapshot-v1/fixtures/vehicle-snapshot.json` | 版本兼容说明 | ADVISORY |

R-16 规模：108 总成定义 / 37 总成实例 / 493 零件定义 / 278 零件实例 / 37 Frame。

---

## 3. 结构先例：嵌套总成在本树已经存在

候选不是在发明新结构。R-16 里已有两类先例：

| 先例 | 父总成 | 父实例 | 子总成 | 子实例 |
|---|---|---|---|---|
| A | `ASSY-30-004` 车轮总成 | FL/FR/RL/RR | `ASSY-30-005` 轮胎总成 | FL/FR/RL/RR |
| B | `ASSY-20-001` 前悬架总成 | **无实例** | `ASSY-20-002` 上摆臂总成 | FL/FR |

→ **"父子总成都有每角实例"** 与 **"容器总成无实例"** 都已是既有模式。

本轮新增的只有一种组合：**每角子总成实例挂在 VEH 级父总成实例下**。

---

## 4. 新增关系规则 `R46-REL-01`

> 允许每角子总成实例（`corner=FL|FR`）挂在 VEH 级父总成实例下，条件是：
> ① 子总成显式声明其角位；② 其全部子件的角位与子总成实例角位一致；
> ③ 每个子件在整车数量上只被这两侧各计一次。

**为什么不直接用 R-42 的另一个方案**：放宽「零件角位可细于父总成实例」会直接改动对角规则、影响全部 278 个零件实例的校验；本候选**不动那条规则**——零件角位仍等于其**直接**父总成实例角位。

**对现有校验的影响（已实际检索三个校验器）**：
`tools/r16_skeleton_tool.py`、`tools/r21_mapping_tool.py`、`tools/r42_identity_tool.py` 均**未断言**「总成实例角位 == 其父总成实例角位」；对角规则只作用于零件实例与其直接父总成实例。**因此本关系是加法式扩展，不破坏现有守卫。**

---

## 5. 候选结构

### 5.1 中央（不变）
| 字段 | 值 |
|---|---|
| 总成定义 | `ASSY-20-014` 转向操纵与齿轮齿条转向器（父级 `SUB-20-03` 转向系统） |
| 实例 | `AI-20-014-VEH`（角位 VEH） |
| Frame | `FR-20-014-VEH`，`worldFrame=UNFROZEN_PENDING_RP07` |
| 子件 | 13 个：066/067/068/069×4/070/071/072/073×2/088 |

### 5.2 左右子总成（候选）
| | 左 | 右 |
|---|---|---|
| 总成定义 | `CAND-ASSY-20-014-FL` | `CAND-ASSY-20-014-FR` |
| 父总成 | `ASSY-20-014` | `ASSY-20-014` |
| 实例 | `CAND-AI-20-014-FL` | `CAND-AI-20-014-FR` |
| Frame | `CAND-FR-20-014-FL` | `CAND-FR-20-014-FR` |
| 零件实例 | `CAND-PI-20-074..078-FL`（5 个） | `CAND-PI-20-074..078-FR`（5 个） |

**所有候选 ID 一律带 `CAND-` 前缀**，不是正式身份；正式编号由 RP-01 分配方决定。

---

## 6. 数量核对：不重不漏

| 零件 | 名称 | 整车数量 | 候选实例 | 中央实例 | 合计 | 平衡 |
|---|---|---|---|---|---|---|
| `PART-20-074` | 内拉杆（轴向接头） | 2 | 2 | 0 | 2 | ✅ |
| `PART-20-075` | 外拉杆端 | 2 | 2 | 0 | 2 | ✅ |
| `PART-20-076` | 拉杆锁紧螺母 | 2 | 2 | 0 | 2 | ✅ |
| `PART-20-077` | 转向器防尘罩 | 2 | 2 | 0 | 2 | ✅ |
| `PART-20-078` | 拉杆端卡簧与槽顶螺母 | 2 | 2 | 0 | 2 | ✅ |

**中央一份都没有**，所以不存在"既在中央又在子总成"的重复计数。校验器 Z09 强制 `sum == qtyVehicleTotal` 且 `instancesInCentral == 0`。

---

## 7. 正例（6 项，校验器逐项断言）

| ID | 内容 |
|---|---|
| P-46-01 | 中央转向器仍是唯一 VEH 级实例 |
| P-46-02 | 左右子总成各一个，角位 FL/FR |
| P-46-03 | 每侧 5 个每角零件，整车合计等于 `qtyVehicleTotal` |
| P-46-04 | 零件角位 == 直接父总成实例角位（对角规则保持） |
| P-46-05 | 中央 13 个 VEH 级子件未改动 |
| P-46-06 | 每个候选子总成有独立 Frame |

## 8. 反例（10 项，任务书要求的三个已覆盖）

| ID | 错误 | 必须触发的规则 |
|---|---|---|
| N-46-01 | **中央总成被复制成两个实例** | `CENTRAL_INSTANCE_COUNT_CHANGED` |
| N-46-02 | **左侧零件挂到右侧子总成（左右错配）** | `CORNER_PARENT_MISMATCH` |
| N-46-03 | **把 UNKNOWN 几何升格为已建模** | `GEOMETRY_UPGRADED` |
| N-46-04 | 同一零件在中央与子总成重复计数 | `DOUBLE_COUNTED` |
| N-46-05 | 候选 ID 当成正式 PI | `CANDIDATE_CLAIMED_CANONICAL` |
| N-46-06 | 子总成缺 Frame | `SUB_ASSEMBLY_FRAME_MISSING` |
| N-46-07 | 每角零件数量多/少一件 | `PART_QTY_UNBALANCED` |
| N-46-08 | 把候选写回 R-16 或重建快照 | `SOURCE_CLAIMED_MODIFIED` |
| N-46-09 | 只放左侧，右侧缺失 | `SIDE_SET_INCOMPLETE` |
| N-46-10 | 子总成实例角位与声明不一致 | `SUB_INSTANCE_CORNER_MISMATCH` |

---

## 9. 版本兼容与升级路径

| 项 | 状态 |
|---|---|
| R-16 源文件 | **未修改** |
| R-27 快照 | **未重建**，rev 1 / `CANDIDATE_NOT_FROZEN` 保持 |
| 全局对角规则 | **未改动** |
| 正式 `PI-*` | **未新增** |
| 候选 ID 是否正式 | **否** |

**快照的 `r26` 块仍是旧值**（`ready / artifacts []`，而 R-26 已 approved）。本候选**不依赖该块**，也不动它——那是快照维护方的事。

**升级路径（需总控批准，本轮不执行）**：
总控批准后，由 R-16 维护方在 `SUB-20-03` 下新增两个 `ASSY` 定义与 FL/FR 实例，并把 5 个零件定义改挂到对应子总成。正式编号需 RP-01 分配，不得占用现有或未来预留号段。

---

## 10. 校验与负例

```
python agent-workspace/agents/qwen4/tools/r46_build_corner_candidate.py
python agent-workspace/agents/qwen4/tools/r46_candidate_tool.py validate   → PASS，0 违规（16 规则 Z01–Z16）
python agent-workspace/agents/qwen4/tools/r46_candidate_tool.py selftest   → PASS，28 caught / 0 missed / 28，覆盖 16/16
```

`Z01` 基线引用｜`Z02` 中央唯一｜`Z03` 左右齐全｜`Z04` 子总成实例角位｜`Z05` 独立 Frame｜`Z06` 每侧一件｜`Z07` 父链与角位｜`Z08` 对角规则｜`Z09` 数量平衡且不重复｜`Z10` 中央子件未变｜`Z11` 候选 ID 命名空间｜`Z12` 几何不升级｜`Z13` 新关系与守卫影响有记录｜`Z14` 快照与源只读｜`Z15` 反例完整｜`Z16` 输入哈希与不变量

### 10.1 校验器抓出的两处我自己的问题
1. **Z12 误报 6 条**：我最初要求候选几何只能是 `UNKNOWN`/`OUT_OF_SCOPE`，但 `PART-20-076/077/078` 的继承值本来就是 `DEMO_ASSUMPTION`。改成**只禁止升级到 `SOURCED`/`SOURCED_SECONDARY`**，并保留与 R-16 原值相等的检查。
2. **Z08 的负例是空转的**：我最初只改了子总成实例 ID，没改零件的父链，对角规则自然不报错。改成**直接让某个零件的父链后缀与其角位不一致**，Z08 才真正被测到。

---

## 11. 未闭合（7 项）

总控是否批准该候选；两个新 `ASSY` 的编号（需 RP-01 分配）；子总成 Frame 的局部原点与朝向（世界 Frame 仍未冻结）；外拉杆端锥柄几何；左右镜像几何；运动配准与播放（`REGISTRATION_BLOCKED`）；变型同一性（R-26 CF-09）。

---

## 12. 边界

- **未修改**：R-16 / R-27 / C-05 / C-06 任何文件；未重建快照；未新增正式实例、Frame 或几何。
- **未声称**：候选已是正式结构；中央总成可以复制；两侧可共享一个 Frame；几何已建模。
- **未新增**：常驻端口、页面、导航。
- **未自行批准**。

---

## 13. 交付入口

- 主报告（本文）：`docs/research/R-46-steering-corner-assembly-candidate.md`
- 候选结构（机读）：`docs/research/R-46-steering-corner-assembly-candidate.fixture.json`
- 生成器 / 校验器：`agent-workspace/agents/qwen4/tools/r46_build_corner_candidate.py`、`r46_candidate_tool.py`
- 实跑结果：本人 `reports/R-46-validation-result.json`、`R-46-selftest-result.json`
- 个人回报：`agent-workspace/agents/qwen4/reports/R-46.md`
- 交接消息：给总控与 C-06 / Grok 的公共消息