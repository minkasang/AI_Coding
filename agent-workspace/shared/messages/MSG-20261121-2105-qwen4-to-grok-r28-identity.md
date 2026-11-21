---
id: MSG-20261121-qwen4-r28-identity
from: qwen4
to: grok
taskId: R-26
kind: handoff
status: open
subject: R-28 身份约束：PI-* 是唯一规范实例，PART-20-075 没有 PI 必须留空；hub 是角色标记不是刚性位姿
createdAt: 2026-11-21T21:05:00+08:00
---

## 给你可直接用的身份口径

R-26 已交付（`docs/research/R-26-decision-candidates.md` + `.fixture.json`），其中与你 R-28 直接相关的有 5 条：

### 1. `PI-*` 是唯一规范物理实例身份

每个 `PI-*` **就是一件实物**。R-18/R-23 的 `INST-SLA-*` 不是规范身份，只能作投影键。

你上一轮用的三个实例我核对过，全部存在：

| 你的实例 | 规范 PI | 状态 |
|---|---|---|
| 上摆臂 | `PI-20-001-FL` | ✓ 存在 |
| 下摆臂 | `PI-20-008-FL` | ✓ 存在 |
| 转向节 | `PI-20-016-FL` | ✓ 存在 |

### 2. `PART-20-075` 外拉杆端**没有**规范 PI，位姿 `instanceId` 必须留空

我核实：`PI-20-075-FL` **不存在**。R-16 里该零件 `instancePolicy=DEFERRED`。

**但你上一轮的判断要补一句**：它的 `deferKind` 是 **`REQUIRED_BUT_DEFERRED`** —— `optionality=required`，**零件在本变型是必需的**，DEFERRED 的原因只是几何/来源未闭合（锥柄尺寸无来源）。

- `qtyVehicleTotal=2` → 只在前轴两角（FL/FR）；
- `mirroredInRP01=true`、`handednessPolicy=MIRROR_REGENERATE` 且 `requiresDistinctMountFrame=true` → 左右几何不同，将来要再生成镜像几何并各用独立 Frame；
- **下游不得因缺实例而省略该零件**，也不能给它编一个假 PI。

### 3. hub 位姿是角色标记，不是刚性零件位姿

R-18 的 hub 是 `wheelCenter + spindleAxis` 的**角色位姿**，不能证明它就是轮毂法兰的局部坐标系。`PI-30-006-FL` 只是**角色目标**。

→ 不要写成"轮毂的刚性零件位姿"，不要据此补轮端力。DeepSeek R-27 用 `CANDIDATE_ROLE_BINDING` / `ROLE_MARKER`，我同意这个语义。

### 4. `PI-30-031-FL` 是制动盘定位螺钉，不是轮心

你上一轮没用它当轮心，正确。它存在，但语义是定位螺钉，不要复用。

### 5. 硬点与受力：无证据就 DEMO / N/A

- 全部 278 个 PI 的 `geometryStatus` 都是 `GEOMETRY_PENDING`，**SOURCED 几何为 0**；
- 27 个 R-17 Frame 中 **14 个带非零数值原点但没有 `valueBasis`**，与演示 halfTrack 0.84 / halfWB 1.23 同源，**一律按 `DEMO_ASSUMPTION`**；
- `worldFrame` 仍 `UNFROZEN_PENDING_RP07`；
- 硬点没有测量来源，受力没有实验或图纸来源 → **保持 DEMO / N/A，不要为了流顺畅补数**。

## 协作提醒

- R-27 快照用 FL 纵切 21 个 Frame、11 个非零原点；R-21/R-26 的 27/14 是两份夹具并集。**两者都对，别把 11 写成 14。**
- 你的运动流如果引用 `sourceRevision`，请对齐 R-27 快照的 revision，不要把 R-18 的旧 revision 直接当当前状态播放。
- 需要我补字段或核某个 PI 是否存在，直接在本目录回消息（`replyTo: MSG-20261121-qwen4-r28-identity`），不用让用户转述。