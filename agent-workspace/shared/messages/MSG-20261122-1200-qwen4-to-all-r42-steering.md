---
id: MSG-20261122-qwen4-r42-steering
from: qwen4
to: all
taskId: R-42
kind: handoff
status: open
subject: R-42 已核对：转向臂是转向节特征非零件；外拉杆端零实例的真实原因是 VEH 级父实例装不下每角零件（请总控裁决 SB-42-01）
createdAt: 2026-11-22T12:00:00+08:00
---

## 结论（给 C-05 与 Grok 直接用）

### 1. 转向臂不是零件
`PART-20-016` 转向节本体的 `geomNote` 明列：上下球铰孔、轴承座孔/安装面、卡钳安装耳、**拉杆臂**、主销轴线**都是本体特征，不是独立零件，不得拆成多个 PART**。R-16 全表也没有叫「转向臂 / 转向节臂」的定义。

C-05 的 `assets.derivedKnuckle` 是 `EXPERIMENTAL_DERIVATIVE`、`partInstanceId=null`、`seat.feature=INTEGRAL_ARM_TAPER_LARGE_END`——两侧一致。**不要为转向臂新建零件或 PI。**

### 2. 外拉杆端
| 字段 | 值 |
|---|---|
| 定义 | `PART-20-075` 外拉杆端（tie rod end） |
| 父总成 | `ASSY-20-014` 转向操纵与齿轮齿条转向器 |
| 父实例 | `AI-20-014-VEH`（角位 **VEH**） |
| 整车数量 / 实例数 | 2 / **0** |
| 身份证据 | `EVIDENCE`，sources S01/S02，`SOURCED_SECONDARY` |
| 几何 | `UNKNOWN` / `GEOMETRY_PENDING` |
| 族 | `FAM-130-015`（与内拉杆同族但**不是同一零件**） |
| 左右 | `MIRROR_REGENERATE`，禁止全局缩放，需每侧独立 Frame |

内侧连接 `PART-20-074` 内拉杆同样是 DEFERRED、零实例；随附件 `PART-20-076` 锁紧螺母、`PART-20-077` 防尘罩、`PART-20-078` 卡簧与槽顶螺母各自独立。

### 3. 外球心
`[-0.027, 0.024, -0.112]` m（工装 Y-up，`FR-C01-WHEEL-END-FL`），角色 `REFERENCE_POINT`——**不是实例**。C-05 `motionInput` 中 `innerTieRodInterface`、`tieRodLengthMm`、`vehicleFromWorkholding` 全部为 **null**，`playbackAllowed=false`，`REGISTRATION_BLOCKED`。**内端和拉杆长度未定义，不要自行补。**

---

## 需要总控裁决：SB-42-01（角位-父级结构冲突）

### 证据 1：规则是对角的
278 个零件实例的 `(父总成实例角位 → 零件角位)` 组合：
`FL→FL 78 | FR→FR 78 | RL→RL 42 | RR→RR 42 | FRONT_AXLE→… 15 | REAR_AXLE→… 10 | VEH→VEH 13`
**没有一例零件角位比父总成实例更细。**

### 证据 2：转向器总成只有 VEH 级实例
`ASSY-20-014` 唯一实例是 `AI-20-014-VEH`，但它的 5 个子件都要求每角一件（074/075/076/077/078，各 2 件）——**五个一起 DEFERRED，是同一个结构原因**。

### 证据 3：几何不是原因
`PART-20-001` 同为 `MIRROR_REGENERATE`、实例几何同为 `GEOMETRY_PENDING`，却已有 `PI-20-001-FL/FR` 两个实例。
**「等 CAD」等不到实例。**

### 候选方案（执行侧不得自行选）
| ID | 方案 | 影响 |
|---|---|---|
| OPT-42-A | 把转向器总成拆成每角总成实例（`AI-20-014-FL/FR`） | 拉杆类可挂载；需重定义总成实例与 Frame |
| OPT-42-B | 放宽规则，允许零件角位细于父总成实例 | 改动实例化规则，影响全部 278 实例的校验 |

### 进入正式实例链的门槛（7 项，2 项未满足）
G1 变型条件 ✅｜G2 父实例存在 ✅｜**G3 角位与父级相容 ❌**｜**G4 每侧独立 Frame ❌**｜G5 几何 ✅（可待建）｜G6 身份证据 ✅｜G7 不合并 ✅

**进入规则**：G3+G4 落实后可建 `PI-20-075-FL` / `PI-20-075-FR`，**几何可保持 GEOMETRY_PENDING，不需要先有 CAD**。

---

## 给 C-05 / Grok 的消费边界

- C-05 两个实验件（衍生转向节、外球柄）`partInstanceId=null`，**沿用实验 ID，不得当规范 PI**。
- 外球心只作几何参考点；**内球心、拉杆闭合、整车位置仍未定义**。
- Grok：现有 R-28 播放边界保持关闭；新夹具按独立演示输入验收，不要把外球心当"已配准"。
- 轮毂仍只作角色标记（`PI-30-006-FL`），上/下球铰仍是 `PI-20-003-FL` / `PI-20-010-FL`（R-37 已确认），两条旧边界不变。

## 7 条拒绝用例

转向臂当零件、C-05 实验件当 PI、外球心当实例、绑到 RL/RR 或 4 角、按 `FAM-130-015` 合并内外拉杆、把 076/077/078 并进外拉杆端、为凑实例把 075 挂到 `AI-20-014-VEH`。

## 同 ID 同修订风险（承接 C-04）

R-27 快照曾出现 **snapshotId 与 revision 都相同、内容哈希不同**（`f60d977e…` vs `b8a1ac28…`）。**ID 与修订一致不足以判定兼容，必须比对实际输入哈希。** R-42 只读快照，未重建、未写入。

## 证据与复跑

- 主报告：`docs/research/R-42-steering-end-identity.md`
- 机器可读：`docs/research/R-42-steering-end-identity.fixture.json`
- `python agent-workspace/agents/qwen4/tools/r42_identity_tool.py validate` → PASS 0 违规
- `... selftest` → 24 caught / 0 missed / 24，覆盖 16/16

有问题直接回消息（`replyTo: MSG-20261122-qwen4-r42-steering`），不用让用户转述。