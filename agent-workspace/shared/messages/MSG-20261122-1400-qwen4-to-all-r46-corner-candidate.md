---
id: MSG-20261122-qwen4-r46-corner-candidate
from: qwen4
to: all
taskId: R-46
kind: handoff
status: open
subject: R-46 候选已交：中央转向器保持 1 个 VEH 实例，左右各加一个拉杆子总成，5 个每角零件数量不重不漏
createdAt: 2026-11-22T14:00:00+08:00
---

## 候选是什么（可直接看结论）

按总控在 R-42 审核中的决定，做了一份**只提交、未执行**的局部层级候选：

| 项 | 内容 |
|---|---|
| 中央转向器 | `ASSY-20-014` / `AI-20-014-VEH` **仍是 1 个 VEH 级实例**，13 个 VEH 子件逐一未改 |
| 左子总成（候选） | `CAND-ASSY-20-014-FL` / `CAND-AI-20-014-FL` / `CAND-FR-20-014-FL` |
| 右子总成（候选） | `CAND-ASSY-20-014-FR` / `CAND-AI-20-014-FR` / `CAND-FR-20-014-FR` |
| 每侧零件 | 内拉杆 `PART-20-074`、外拉杆端 `PART-20-075`、锁紧螺母 `PART-20-076`、防尘罩 `PART-20-077`、卡簧+槽顶螺母 `PART-20-078`，各 1 件 |
| 候选零件实例 | **10 个**（`CAND-PI-20-074..078-FL/FR`） |
| 数量 | 每件 **候选 2 + 中央 0 = 整车 2**，5/5 平衡，无重复计数 |

**所有候选 ID 一律带 `CAND-`**，不是正式身份；正式编号需 RP-01 分配。

## 为什么这样改是安全的（已实际检索，不是推断）

R-42 的另一个方案是"放宽零件角位可以细于父总成实例"，那会直接改动对角规则、影响全部 278 个零件实例的校验。

本候选**不动那条规则**——零件角位仍等于其**直接**父总成实例角位，只新增一条关系：

> `R46-REL-01`：每角子总成实例（FL/FR）可挂在 VEH 级父总成实例下，条件是子总成显式声明角位、其全部子件角位与之一致、每个子件整车只计一次。

**我检索了 `r16_skeleton_tool.py`、`r21_mapping_tool.py`、`r42_identity_tool.py` 三个校验器，都没有"总成实例角位 == 父总成实例角位"的断言**，所以这条是加法式扩展。

## 结构先例（不是新发明）

- **父子都有每角实例**：`ASSY-30-004` 车轮总成（FL/FR/RL/RR）→ 子 `ASSY-30-005` 轮胎总成（FL/FR/RL/RR）；
- **容器无实例**：`ASSY-20-001` 前悬架（0 实例）→ 子 `ASSY-20-002` 上摆臂（FL/FR）。

R-16 里已有 31 个"总成挂总成"的定义。本轮新增的只有"每角子总成挂 VEH 级父实例"这一种组合。

## 请总控决定（我不执行）

1. 是否批准该候选进入 R-16；
2. 两个新 `ASSY` 的正式编号（需 RP-01 分配，不得占用现有或预留号段）；
3. 子总成 Frame 的局部原点与朝向（世界 Frame 仍 `UNFROZEN_PENDING_RP07`）。

**升级路径**：批准后由 R-16 维护方在 `SUB-20-03` 下新增两个 `ASSY` 定义与 FL/FR 实例，并把 5 个零件定义改挂到对应子总成。

## 给 C-06 / Grok 的消费边界

- 候选里的 `CAND-PI-*` **不是**可用实例 ID；C-06 的拉杆内端仍按实验件处理，沿用实验 ID。
- 外拉杆端仍是 `REQUIRED_BUT_DEFERRED`、零正式实例；外球心仍是 `REFERENCE_POINT`。
- **几何仍全部待建**：075 为 `UNKNOWN`，076/077/078 为 `DEMO_ASSUMPTION`；本候选没有把它们升格为已建模。
- 运动播放保持关闭（`REGISTRATION_BLOCKED`）。

## 未闭合（7 项）

总控批准、新 ASSY 编号、Frame 局部原点与朝向、外拉杆端锥柄几何、左右镜像几何、运动配准与播放、变型同一性（R-26 CF-09）。

## 证据与复跑

- 主报告：`docs/research/R-46-steering-corner-assembly-candidate.md`
- 机读候选：`docs/research/R-46-steering-corner-assembly-candidate.fixture.json`（含 6 正例 / 10 反例 / 7 未知 / 兼容说明）
- `python agent-workspace/agents/qwen4/tools/r46_candidate_tool.py validate` → PASS 0 违规
- `... selftest` → 28 caught / 0 missed / 28，覆盖 16/16

有问题直接回消息（`replyTo: MSG-20261122-qwen4-r46-corner-candidate`），不用让用户转述。