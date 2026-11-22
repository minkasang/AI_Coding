# R-42｜转向外端身份与接入条件

> 工作位：qwen4（整车系统树 · 车型平台）｜任务：R-42 / 03.44｜日期：2026-11-22
> 状态：**submitted，等待 GPT-6 核验**。本文不自行批准。
> 任务书：`docs/tasks/R-42-steering-end-identity.md`

---

## 1. 结论摘要

为 C-05 核对了转向外端的四类东西，并找到 `PART-20-075` 长期 `DEFERRED` 的**真实原因**——不是缺几何，而是**装配层级装不下**：

| 东西 | 身份 | 关键事实 |
|---|---|---|
| **转向臂** | **不是零件**，是转向节本体特征 | `PART-20-016` 的 `geomNote` 明列「拉杆臂」为本体特征，不得拆成多个 PART |
| **外拉杆端** | `PART-20-075`，`REQUIRED_BUT_DEFERRED` | 父级 `ASSY-20-014`，整车 2 件，**当前 0 实例** |
| **内拉杆/随附件** | `PART-20-074/076/077/078` | 各自独立零件，与 075 同父级，全部 DEFERRED |
| **外球心** | C-05 的 `REFERENCE_POINT` | 不是实例；`partInstanceId=null` |

**核心发现（SB-42-01）**：R-16 的 278 个零件实例中，**零件角位与父总成实例角位完全一致**（只剩 FL→FL、FR→FR、RL→RL、RR→RR、FRONT_AXLE→…、VEH→VEH 这些对角组合）。而转向器总成 `ASSY-20-014` **只有一个 VEH 级实例 `AI-20-014-VEH`**，拉杆类零件却需要 FL/FR 两角各一件——**按现有规则挂不上去**。

**所以 `PART-20-075` 进入正式实例链的条件不是"先做出 CAD"，而是先裁决装配层级**。反证：`PART-20-001` 同样是 `MIRROR_REGENERATE`、实例几何同样是 `GEOMETRY_PENDING`，却已经有两个实例——**缺几何从来不是不能实例化的理由**。

- 8 项确认、7 项未知/阻断、**7 条拒绝用例**
- 校验：validate **PASS 0 违规**（16 条规则）；selftest **24 caught / 0 missed / 24，覆盖 16/16**

---

## 2. 输入与只读边界

| 输入 | 用途 | 哈希策略 |
|---|---|---|
| `docs/research/R-16-vehicle-skeleton.fixture.json` | 规范身份、父级、数量、角位规则 | **REQUIRED** |
| `src-experiments/vehicle-snapshot-v1/fixtures/vehicle-snapshot.json` | R-27 快照现状 | ADVISORY |
| `cad/.../c05-.../manifest.json` | C-05 实验件与外球心 | **REQUIRED** |
| `cad/.../c05-.../validation.json` | 装入/干涉/止挡 | **REQUIRED** |

**未修改** R-16 / R-27 / C-05 任何文件；**未重建快照**；未新增实例。

---

## 3. 转向臂：是特征，不是零件

- R-16 `PART-20-016` 转向节本体的 `geomNote`：
  > 上下球铰孔、轴承座孔/安装面、卡钳安装耳、**拉杆臂**、主销轴线都是本体特征，不是独立零件——**不得拆成多个 PART**
- R-16 里**没有任何**叫「转向臂 / 转向节臂」的零件定义。
- C-05 的 `assets.derivedKnuckle` 是 `EXPERIMENTAL_DERIVATIVE`、`partInstanceId=null`，`seat.feature = INTEGRAL_ARM_TAPER_LARGE_END`。

**两侧结论一致：不得为转向臂新建零件或 PI。**（REJ-42-01、REJ-42-02）

---

## 4. 外拉杆端的身份

| 字段 | 值 |
|---|---|
| 定义 | `PART-20-075` 外拉杆端（tie rod end） |
| 父总成定义 | `ASSY-20-014` 转向操纵与齿轮齿条转向器 |
| 父总成实例 | **`AI-20-014-VEH`（角位 VEH）** |
| 整车数量 | **2**（`VEHICLE_LEVEL_FLAT_ANNOTATION`） |
| 实例数 | **0** |
| 身份证据 | `EVIDENCE`，sources `S01/S02`，`SOURCED_SECONDARY` |
| 几何 | `UNKNOWN` / `GEOMETRY_PENDING`；锥柄尺寸无来源 |
| 族 | `FAM-130-015`（与内拉杆同族） |
| 左右策略 | `MIRROR_REGENERATE`，`globalScaleForbidden=true`，需每侧独立 Frame |

**注意**：身份等级 `SOURCED_SECONDARY` 已经足够高——**卡住它的从来不是"这是什么东西没查清"，而是"装在哪里"**。

---

## 5. 核心发现：角位-父级结构冲突（SB-42-01）

### 5.1 规则
278 个零件实例的 `(父总成实例角位 → 零件角位)` 组合：

```
FL→FL 78 | FR→FR 78 | RL→RL 42 | RR→RR 42
FRONT_AXLE→FRONT_AXLE 15 | REAR_AXLE→REAR_AXLE 10 | VEH→VEH 13
```

**全部对角，没有一例「零件角位细于父实例」。**

### 5.2 冲突
`ASSY-20-014` 只有一个实例 `AI-20-014-VEH`，但它的 5 个子件需要每角一件：

| 零件 | 名称 | 整车数量 | 状态 |
|---|---|---|---|
| `PART-20-074` | 内拉杆（轴向接头） | 2 | DEFERRED |
| `PART-20-075` | 外拉杆端 | 2 | DEFERRED |
| `PART-20-076` | 拉杆锁紧螺母 | 2 | DEFERRED |
| `PART-20-077` | 转向器防尘罩（波纹管） | 2 | DEFERRED |
| `PART-20-078` | 拉杆端卡簧与槽顶螺母 | 2 | DEFERRED |

**五个一起 DEFERRED，不是巧合**，是同一个结构原因。

### 5.3 两个可选方案（需总控裁决，执行侧不得决定）

| ID | 方案 | 影响 |
|---|---|---|
| OPT-42-A | 把转向器总成拆成每角总成实例（如 `AI-20-014-FL/FR`） | 拉杆类可挂载；需重定义总成实例与 Frame |
| OPT-42-B | 放宽 R-16 规则，允许零件角位细于父总成实例 | 改动实例化规则，影响全部 278 实例的校验 |

### 5.4 反证：几何不是阻断原因
`PART-20-001` 上摆臂本体：`handednessKind=MIRROR_REGENERATE`、实例几何 `GEOMETRY_PENDING`，**已实例化为 `PI-20-001-FL` / `PI-20-001-FR`**。

→ 所以「等 CAD 做出来再说」是错误诊断。**必须先把层级裁决掉。**

---

## 6. `PART-20-075` 进入正式实例链的门槛

| 检查 | 要求 | 现状 | 满足 |
|---|---|---|---|
| G1 变型条件 | 无未裁决 `variantFlag` | `null` | ✅ |
| G2 父总成实例 | `ASSY-20-014` 有实例 | `AI-20-014-VEH` | ✅ |
| **G3 角位与父级相容** | 零件 FL/FR 能挂到父实例 | 父实例只有 VEH | ❌ |
| **G4 每侧独立 Frame** | 左右各一个安装 Frame | 无实例即无 Frame | ❌ |
| G5 几何来源 | 可保持 `GEOMETRY_PENDING` | `GEOMETRY_PENDING` | ✅（不阻断） |
| G6 身份证据 | `EVIDENCE` 且带 sources | S01/S02 | ✅ |
| G7 不与同族/随附件合并 | 074 与 076/077/078 独立 | 是 | ✅ |

**进入规则**：G3 与 G4 落实后，才可建立 `PI-20-075-FL` / `PI-20-075-FR`；**几何可保持待建，不需要先有 CAD**。
**错误说法**：把 DEFERRED 解释成「缺几何」——同样的 `GEOMETRY_PENDING` 零件已有 278 个实例。

---

## 7. 族与随附件

- `FAM-130-015` = **`PART-20-074` + `PART-20-075`**。R-16 `geomNote` 明确「与内拉杆不是同一零件」。**按族合并会把转向器两端接头吞成一个**（REJ-42-05）。
- 随附件 `PART-20-076` 锁紧螺母、`PART-20-077` 防尘罩、`PART-20-078` 卡簧与槽顶螺母各自独立零件、各自族，**不得并进外拉杆端**（REJ-42-06）。

---

## 8. 运动与外球心

| 字段 | 值 |
|---|---|
| 外球心（工装 Y-up, m） | `[-0.027, 0.024, -0.112]` |
| 角色 | `REFERENCE_POINT`（不是实例） |
| 工装 Frame | `FR-C01-WHEEL-END-FL` |
| `playbackAllowed` | **false** |
| `existingR28Registration` | `REGISTRATION_BLOCKED` |
| `innerTieRodInterface` / `tieRodLengthMm` / `vehicleFromWorkholding` | **null** |

**内端接口、拉杆长度、整车放置都没定义。** 本轮不授权播放，也不把外球心当零件（REJ-42-03）。

C-05 `validation.json`（2 个独立实体、60 对装入检查最大重叠 0 mm³、止挡接触约 251.33 mm²）**只证明实验衍生件几何自洽，不证明它就是真实车型的转向节或拉杆端**。

---

## 9. 拒绝用例（7 条）

| ID | 错误主张 | 为什么拒绝 |
|---|---|---|
| REJ-42-01 | 为「转向臂」新建零件或 PI | 拉杆臂是 `PI-20-016-FL` 的本体特征 |
| REJ-42-02 | 把 C-05 实验衍生件当规范 PI | `partInstanceId=null`，`EXPERIMENTAL_DERIVATIVE` |
| REJ-42-03 | 把外球心当新增实体实例 | 球心是 `REFERENCE_POINT` |
| REJ-42-04 | 把外拉杆端绑到 RL/RR 或 4 角 | 整车 2 件，仅前轴 FL/FR |
| REJ-42-05 | 按 `FAM-130-015` 把内外拉杆合并 | 同族不同件 |
| REJ-42-06 | 把锁紧螺母/防尘罩/卡簧并进外拉杆端 | 076/077/078 各自独立 |
| REJ-42-07 | 为凑实例把 `PART-20-075` 挂到 `AI-20-014-VEH` | 违反角位规则；须先裁决 SB-42-01 |

---

## 10. 校验与负例

```
python agent-workspace/agents/qwen4/tools/r42_build_steering_identity.py
python agent-workspace/agents/qwen4/tools/r42_identity_tool.py validate   → PASS，0 违规（16 规则 Y01–Y16）
python agent-workspace/agents/qwen4/tools/r42_identity_tool.py selftest   → PASS，24 caught / 0 missed / 24，覆盖 16/16
```

`Y01` 引用有效｜`Y02` 转向臂不是零件｜`Y03` 外拉杆端字段一致｜`Y04` 零实例｜`Y05` 族陷阱｜`Y06` 随附件独立｜`Y07` 结构阻断记录｜`Y08` 几何不是阻断（反证）｜`Y09` 门槛逐项｜`Y10` C-05 件非实例｜`Y11` 外球心数值｜`Y12` 运动未闭合｜`Y13` 快照只读且 r26 状态如实｜`Y14` 拒绝用例完整｜`Y15` 输入只读与哈希｜`Y16` 不变量

### 10.1 校验器抓出的一处问题
`Y08` 的负例把反证块整体清空，规则直接 `KeyError` 崩掉而不是报违规。已改成**缺字段先报 `COUNTEREXAMPLE_MISSING` 再返回**，让"删掉反证"变成可捕获的违规，而不是异常。

---

## 11. 快照只读与同 ID 风险

R-42 **只读** R-27 快照，不重建、不写入。当前快照的 `r26` 块仍是 `ready / artifacts []`（R-26 已 approved），与 R-37 的发现一致。

另记一条来自 C-04 的事实：**同一个 snapshotId + revision 1 曾出现不同哈希**（`f60d977e…` 与 `b8a1ac28…`，差异包含 R-25 白名单与 R-26 状态）。**ID 与修订一致不足以判定兼容，必须比对实际输入哈希。**

---

## 12. 边界

- **未修改**：R-16 / R-27 / C-01 / C-05 源文件；未重建快照；未改共享 Schema。
- **未新增**：实例、零件、Frame、几何、常驻端口、页面。
- **未声称**：转向臂是独立零件、外拉杆端已有实例、外球心已配准、实验件是真实车型零件。
- **未自行批准**。

---

## 13. 交付入口

- 主报告（本文）：`docs/research/R-42-steering-end-identity.md`
- 机器可读核对对象：`docs/research/R-42-steering-end-identity.fixture.json`
- 生成器 / 校验器：`agent-workspace/agents/qwen4/tools/r42_build_steering_identity.py`、`r42_identity_tool.py`
- 实跑结果：本人 `reports/R-42-validation-result.json`、`R-42-selftest-result.json`
- 个人回报：`agent-workspace/agents/qwen4/reports/R-42.md`
- 交接消息：给 C-05 / Grok / DeepSeek 的公共消息