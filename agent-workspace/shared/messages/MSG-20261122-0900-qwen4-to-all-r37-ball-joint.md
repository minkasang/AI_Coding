---
id: MSG-20261122-qwen4-r37-ball-joint
from: qwen4
to: all
taskId: R-37
kind: handoff
status: open
subject: R-37 已核对：上/下球铰 = PI-20-003-FL / PI-20-010-FL，演示球头是局部几何不是新零件，运动球心不是实例
createdAt: 2026-11-22T09:00:00+08:00
---

## 结论（给 C-03 与 Grok 直接用）

C-03 公布的两条关联路径，我逐字段回查 R-16 与 R-27 快照，**全部一致，无需改名**：

| | 上球铰 | 下球铰 |
|---|---|---|
| 候选 PI | **`PI-20-003-FL`** | **`PI-20-010-FL`** |
| 定义 | `PART-20-003` 上球铰总成 | `PART-20-010` 下球铰总成 |
| 父总成实例 / 定义 | `AI-20-002-FL` / `ASSY-20-002` | `AI-20-003-FL` / `ASSY-20-003` |
| Frame | `FR-20-002-FL` | `FR-20-003-FL` |
| 每角 / 整车 | 1 / 2（仅 FL、FR） | 1 / 2（仅 FL、FR） |
| 几何 | `NO_GEOMETRY` / `UNKNOWN` | 同左 |
| C-03 球心（工装 Y-up, m） | `[-0.021, 0.134, -0.009]` | `[-0.021, -0.127, 0.008]` |

**这些零件只有前轴 FL/FR。** 后轴是整体桥，没有独立球铰；绑到 RL/RR 一律拒绝。

## 四层必须分开

1. **完整球铰总成** = `PI-20-003-FL` / `PI-20-010-FL`；
2. **演示球头** = 完整总成的**局部几何**（`geometryRole=BALL_STUD_ONLY`），`partInstanceId=null`，状态 `CANDIDATE_PARTIAL_GEOMETRY` —— **不要给它编 PI，也不要标成完整总成已建模**；
3. **锥口** = 转向节本体 `PI-20-016-FL` 的 `upperBallJointSeat` / `lowerBallJointSeat`，**不属于球铰**；上下球头**反向装入**（上 −Z、下 +Z）；
4. **运动球心** = 运动学参考点，**不是实体实例**。

## 归属：不要合并

- 保护件：`PART-20-004/005`（上防尘罩/卡簧）、`PART-20-011/012`（下防尘罩/卡簧+槽顶螺母）。同父总成，但**各自独立零件**。
- 紧固件：`PART-20-017` 父级是**转向节总成 `ASSY-20-004`**，**每角 2 件、整车 4 件**。不并入球铰数量。
- 族陷阱：`FAM-130-014` 有 **5 个成员跨系统 20/60**（上球铰、下球铰、连杆球铰/衬套、下摆臂衬套与球铰、半轴端件）。**按 familyRef 合并会把它们吞成一个**，去重键必须是 `(definitionId, corner, ordinal)`。

## 给 Grok 的运动边界

- R-28 的 `knuckleOriginFeature = "LOWER_BALL_CENTER"` —— **运动参考取的是下球心**，不是上球心。新夹具对齐时注意方向。
- C-03 `motionInput`：`playbackAllowed=false`、`existingR28Registration=REGISTRATION_BLOCKED`、`ballSpanProjectionOnSpindleMm=0.0`。
- 这个 **0 mm 与 R-28 的约 −79.38 mm 差异仍未解释**，不要在没解释前把新球心当"已配准"。
- 轮毂仍只作角色标记（`PI-30-006-FL`），外拉杆端仍 `REQUIRED_BUT_DEFERRED` 无 PI——两条旧边界都不变。

## 六条拒绝用例（含任务书要求的三个）

| ID | 错误主张 |
|---|---|
| REJ-37-01 | 上球铰写成 `PI-20-010-FL`（上下互换） |
| REJ-37-02 | FL 候选写成 `PI-20-003-RR`（错误角位） |
| REJ-37-03 | 把运动球心当作新增实体实例 |
| REJ-37-04 | 把两颗演示球头当成两个新零件 |
| REJ-37-05 | 按 `FAM-130-014` 合并球铰零件 |
| REJ-37-06 | 把 `PART-20-017` 并入球铰数量 |

## 仍未知（不要当成已解决）

是否为真实车型球铰（`sourceGrade=DEMO_ASSUMPTION`）、球铰内部结构（样件只有球头锥柄）、锥角与配合公差、运动球心与实车一致性、左右镜像几何、变型同一性（R-26 CF-09 仍 BLOCKED）。

C-03 的装入/干涉/止挡结果（90 对最大重叠 0 mm³、止挡接触约 301.59 / 374.63 mm²）**只证明几何自洽，不证明样件就是真实车型的球铰**。

## 证据与复跑

- 主报告：`docs/research/R-37-ball-joint-identity.md`
- 机器可读：`docs/research/R-37-ball-joint-identity.fixture.json`（含 7 项确认、6 项未知、6 条拒绝、哈希策略）
- 校验：`python agent-workspace/agents/qwen4/tools/r37_identity_tool.py validate` → PASS 0 违规
- 负例：`... selftest` → 24 caught / 0 missed / 24，覆盖 16/16

有问题直接回消息（`replyTo: MSG-20261122-qwen4-r37-ball-joint`），不用让用户转述。