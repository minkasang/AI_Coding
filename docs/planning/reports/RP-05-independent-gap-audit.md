# RP-05｜整车计划的独立遗漏审计与风险清单（HY4）

> 版本：**v1.3（返工 + 增量复核终版）** / 2026-11-14 · 负责人：HY4 · 状态：**SUBMITTED（重新提交，待总控 GPT-6 复审）**
> **审计快照：`2026-11-14 21:35:23 +0800`**（v1.1 的 `16:36:56`、v1.2 的 `21:10:40` 快照均已作废）
> 返工依据：`docs/command/reviews/AUDIT_2026-11-14.md` §4「RP-05 → HY4」；上一轮审核结论 `needs_work / 审计快照已过期`
> 输入版本：RP-01 报告 1319 行（approved）· RP-02 1551 行（approved）· RP-03 250 行（approved）· **RP-04 v2 363 行（21:17 复审 APPROVED）** · RP-06 281 行（approved）· **25 份 evidence JSON** · 主 AUDIT 与 RP-04 复审记录 · **MASTER_PLAN.md 341 行（§20 新增）** · Git 基线 `8d45c1e` · **R-01 / R-02 / R-03 新一轮研究交付**
> 证据文件：`docs/planning/evidence/RP-05-dependency-baseline.json`、`RP-05-gap-verdicts.json`、`RP-05-risk-matrix.json`（均为 v1.3）
> **本文只审计、不设计替代方案，不修改共享总计划、系统树种子、缺口登记簿、审核记录或任何其他模型的报告与产物。**

---

## 0. 给非程序员的结论

上一版审计被总控退回，原因很具体：我把文件状态定格在下午 4 点 36 分，当时第一波 5 份研究报告只交了 4 份，于是我写下了"产品树报告和三份分文件不存在"。但 Qwen4 在 5 点 08 分把它们全部补齐了，我的"缺件"结论很快变成了假话。这次返工我用晚上 9 点 35 分的完整文件状态重新查了一遍，把每条结论都重新找了出处——**而且在写 v1.2 的过程中又发现其他模型还在继续交稿，于是又做了一轮增量复核**，没有把一份自己也知道已经过期的报告交上去。

**结论要从"哪些文件还没交"改成"交齐之后，哪些问题依然存在"。** 好消息是：5 份报告齐了，产品树拆到 780 个节点、493 个零件并通过总控独立复跑；CAD 把被查出的 ISO 273 标准数值错误改对了，还在 21:17 被总控独立复测 6/6 PASS 判为通过；项目也终于有了 Git 版本基线。这些都是实打实的进展，本版逐一记功，不再写"文件缺失"。

但并排放在一起看，会返工的问题大部分还在，而且性质更清楚了：**"车头朝哪"其实已经有答案了**（Qwen4 读了三处源码确认现在是 +X 左 / +Y 上 / +Z 前，DeepSeek 新交的数据契约甚至已经写出了两套坐标之间的换算公式），真正缺的是把这些方案**冻结成一纸裁决**；**四驱这件事更微妙**——产品树里已经有分动箱和 AWD 零件了，可唯一被批准的接口图还是只画前驱，现在反而更容易让人误以为链路已经通了；还有 **493 个零件一个都没有核实的真实尺寸**，但资产流水线在 21:33 已经按没冻结的零件编号产出了 STEP 和 GLB，这是本版新发现的最高风险。

另外我独立复核了总控点名的两件事：RP-04 的 ISO 273 数值**已改对且已复审通过**，总控在复审里明确写了"不是正式购买的标准全文认证"，出处限制被如实接受；但 Qwen4 早先提的"轮毂法兰孔到底算不算螺栓通孔""Ø84 与 Ø67.1 是不是同一个接口"两点质疑，返工和复审里都没有回答。RP-06 的 Raycaster 路径**仍然是错的**。

一句话：**文件齐了，裁决没齐；数值对了，证据链没齐；方案有了，契约没冻结；基线有了，新成果还没进版本。**

---

## 1. 返工说明、新快照与复核方法

### 1.1 上一版为什么被退回

`AUDIT_2026-11-14.md:16` 判 RP-05 为 `NEEDS_WORK / 审计快照已过期`：v1.1 定格 `16:36:56`，当时只见 4/5 第一波报告，断言 RP-01 正文与三份分文件缺失；Qwen4 在约 `17:08—17:10` 完整交付了正式报告与分树。总控明确要求"不能把过时的『缺文件』写进 RP-07"。

**这个批评成立，本版全盘接受**：v1.1 把"某一时刻的文件状态"当成了"工程事实"，而并行写入环境下文件状态会立即过期。返工没有为原结论辩护，而是重建输入基线。

### 1.2 新快照与输入漂移记录

| 快照 | 已归档报告 | evidence 文件数 | 关键事件 |
|---|---|---|---|
| 16:17:42 | RP-06 | 7 | 审计启动 |
| 16:36:56 | RP-02/03/04/06 | 16 | **v1.1 最终快照（已作废）** |
| 17:08:06 | RP-01/02/03/04/06 | 22 | Qwen4 交付 1319 行正文 + 4 份分树 + geometry-needs / validation / selftest |
| 18:42:44 | 5/5 | 22 | GPT-6 写入主 AUDIT：4 approved、RP-04/RP-05 needs_work |
| 21:10:40 | 5/5 | 24 | **v1.2 快照**：RP-04 v2 返工（21:06）、Git 基线 `8d45c1e`、`.gitignore`、下一轮任务卡 |
| **21:35:23** | **5/5** | **25** | **v1.3 最终截止点**：MASTER_PLAN §20（21:11，334→341 行）、**RP-04 复审 APPROVED**（21:17）、**R-01 平台家族提案**（21:24）、**R-02 数据契约提案**（21:31）、**R-03 资产流水线已产出 STEP/STL/GLB**（21:33） |

与 v1.1 不同，现在存在 Git 初始提交（`8d45c1e`，148 tracked），可对漂移做 diff 比对；但 21:35 复测 `git status` 已有 **53 条**未提交变更（21:10 时为 25 条），恢复点仍只有初始基线。

### 1.3 复核方法（可复现）

1. `find . -newermt "2026-11-14 18:42:44"` 盘点审核后的**全部**变更文件，不依赖报告的自述；v1.3 又对 `21:10:40` 之后做了一次同样盘点；
2. 逐份读取 5 份报告的**当前版本**（重点 RP-01 正式报告 §0/§3/§8/§10/§14、RP-04 v2 §3.3/§5/§9），并读取新交付的 RP-04 复审记录、R-01 / R-02 / R-03 研究报告与示例 JSON；
3. 解析 25 份 evidence JSON 并核对顶层结构；
4. 复跑本机环境实测：Git、行数、JSON 解析、Raycaster 路径、目录存在性、GLB 魔数与字节、磁盘；
5. 对照主 `AUDIT` §2 真实复测、§3 五项 P0 冲突、§4 返工要求逐项复核；
6. 对 16 条 GAP、3×6 端到端链路、每条风险**重写证据与理由**，逐条打 `v12Change` 标签；
7. 自产三份 JSON 做一致性与过期字符串检查。

**全部输入只读**，未改动任何共享文档或他人产物。

### 1.4 门禁状态：`G-PL1_SATISFIED_WITH_DESIGN_DECISIONS_OPEN`

文件级门禁**已满足**：5/5 报告存在（1319/1551/250/363/281 行）、25 份 JSON 全部可解析、RP-01 的 11 份分证据全部落盘、**五项第一波研究任务全部 `approved`**（RP-04 由 21:17 独立复审补齐）。**v1.1 的 4 项残留阻断已全部消除，`residualBlocking` 为空数组。**

但设计裁决未关闭：主 `AUDIT` §3 明列 5 项 P0 冲突仍无 ADR 冻结；R-01 与 R-02 的新交付均为 `submitted / PROPOSAL`（未冻结、待审），R-03 已 `in_progress` 并按未冻结 ID 产出几何。所有 `approved` 均为**研究层面批准**，不批准任何真实车型/零件尺寸或生产 Schema（`AUDIT §6`、RP-04 复审 §32-40）。

### 1.5 v1.1 → v1.2 变更清单

| 类别 | v1.1 的过期内容 | v1.2 处理 |
|---|---|---|
| 文件缺失 | RP-01 正文 + 3 份分文件 MISSING（4 项残留阻断） | **全部删除**，改记为 `resolvedFromV11` 与 17:08 快照 |
| 审批状态 | "4 份报告 submitted≠approved" | 改为 RP-01/02/03/06 `approved`、RP-04 v2 `submitted` 待复审 |
| 坐标冲突 | "四种坐标表述、现有约定未知" | 性质修正：RP-01 §8.3 已实测定案项目系 |
| 四驱冲突 | "产品树分文件缺、接口图也缺 FWD" | 性质修正：产品树已有分动箱/AWD，接口图单边缺席 |
| RP-04 依据 | 引用含标准错误的 v1 | 整体换成 v2 查表与 6 项测试 |
| Git / 返工 / 审查 | "无 Git 基线、无 needs_work 返工实例、无独立审查" | 三条理由全部删除；GAP-016 改判为裁决与自动化闭环缺失 |
| 新增发现 / 风险 / 反例 | 10 项 / 13 条 / 6 条 | 14 项 / 15 条 / 8 条 |

### 1.6 v1.2 → v1.3 增量复核（本轮独有的自我纠错）

v1.2 落盘后，`find -newermt 21:10:40` 显示 21:11—21:35 又有影响结论的并行写入。**提交一份自己已知道过期的报告，会精确重犯 v1.1 的错误**，因此做了第二轮增量复核并升级 v1.3：

| 新输入 | 对结论的影响 |
|---|---|
| `AUDIT_2026-11-14_RP04_RECHECK.md`（21:17） | RP-04 判 **APPROVED**、隔离复测 6/6 PASS；v1.2 的"返工后未复审"过期，删除；复审记录明确"非正式购买的标准全文认证"，出处限制被显式接受 |
| `MASTER_PLAN.md` §20（21:11） | 334 → **341 行**；GAP_REGISTER 仍称 308 行、仍 `INITIAL`；§20 里"HY4 RP-05 仍需按审核意见返工"是 21:11 时点表述 |
| `R-01-platform-family-report.md`（21:24，submitted） | 16 条变型规则 + 校验器（2 合法 / 1 非法被 7 类冲突拒绝 / 21 反例全中），但 `R01-PF-0.1` 仍 `PROPOSED_NOT_APPROVED`；**首发基型仍未定案** |
| `R-02-data-contract-report.md` + `R-02-example-assembly.json`（21:31，submitted） | **已给出** `FR-VEHICLE` ↔ `FR-ENGINEERING` 旋转矩阵与 `p_E=[z_R,x_R,y_R]` / `p_R=[y_E,z_E,x_E]` 正反公式、镜像规则，以及 `PartFamily→PartDefinition→PartVariant→PartRevision→PartInstance` / `Joint` / `MountInterface` / `Frame` / `AssetManifest` 契约；但 `status=PROPOSAL` 且明写"世界坐标选择待 RP-07 冻结" |
| `R-03` 资产流水线（21:33，in_progress） | 已产出 `SYS-30-HUB-001` 等 4 零件的 STEP/STL 与 `wheel_end_assembly.glb`，**在 R-02 Schema 冻结前**；RP-04 复审 `:38` 恰要求"冻结前避免将演示接口宣称为全项目最终协议" |

据此修正的判定：`GAP-003`（从"无人给出变换矩阵"→"已有提案级矩阵，待冻结与跨报告同步"）、`GAP-013`（承认契约提案，仍缺需求库与冻结 ID）、`GAP-016`（删 RP-04 未复审理由，改判审核汇总机制缺失）、`GAP-001`（R-01 有提案但未定案）、`GAP-008`（复审关闭数值错误，剩装配界面消歧）；新增 `NEW-15`（R-01 实测 `scale.z` 静默拉伸 +47.1%）、`NEW-16`（契约未冻结而几何已产出的时序倒置）。**16 条 GAP 的四级取值全部维持**——新交付都是"方案"而非"冻结决定"，不翻转任何判定。

**取证截止策略**：并行写入在 21:35 仍在继续，无限追新文件没有终点。本版明确以 `21:35:23` 为 RP-05 最终取证截止点，此后新交付不在本版范围，按 `AUDIT:94`「后续如遇新成果文件，须在审核后变更结论」由 RP-07 汇总前复审。

---

## 2. 产品树审查（任务书步骤 1）

RP-01 正式报告（1319 行）与 11 份证据补齐后，任务书点名的 15 类系统不再是"只写了名字"：

| 类别 | 状态 | 可复核依据 |
|---|---|---|
| 悬架 / 转向 / 轮端 / 制动 | **已下钻到零件与紧固件** | `tree-chassis.json` 273 节点，SYS-20/30/40 含 188 PART、16 REF、16 DAT；§5.1 双叉臂轮端 41 节点 |
| 动力 / 传动 / 能源 | **已下钻**（v1.1 时列为 MISSING） | `tree-powertrain.json` 255 节点：SYS-50 发动机 105 节点深钻、SYS-60 含分动箱/AWD、SYS-70 能源 |
| 热管理 / 电气 / 座舱 / 乘员保护 | **已建树**（部分 DEFERRED） | `tree-body-systems.json` 150 节点，含 SYS-80 热管理、SYS-90 电气电子、SYS-110 乘员保护 |
| 车架 / 车身 / 通用紧固件 | **已下钻 + 家族目录** | `tree-core.json` 100 节点，SYS-10 42 节点、SYS-130 的 FAM 家族；BOF/UNI 的 `loadPath` 区分 EVIDENCE 与 ASSUMPTION |
| 功能视角 | **独立功能树** | `function-tree.json` 77 节点，反查补入 8 处真实遗漏；功能覆盖 REALIZED 65 / PARTIAL 9 / GAP 3 |

校验链：`validation-result.json` PASS / 0 违规；`selftest-result.json` 32 CAUGHT / 0 MISSED / 24 规则全覆盖；总控独立复跑确认（`AUDIT:11`），任务卡 `approved`。

**但覆盖度 ≠ 可用性，这是本版最重要的新判断**：`geometry-needs.json` 显示 493 零件中 **SOURCED = 0**（261 NEEDS_MEASUREMENT、216 DEMO_ASSUMPTION、10 DEFERRED、6 N/A）。RP-01 §0 自己也说"目前没有任何一个零件具备已核实的几何依据"。总控 `AUDIT:11` 明确"不批准任何真实车型/零件尺寸"，`AUDIT:65` 要求"不要一次生成 493 件不具尺寸依据的几何"——而 21:33 R-03 资产流水线已开始产出几何。**产品树清单被误当尺寸库**的风险从"计划"变成了"在产"（`NEW-12` / `NEW-16` / `R-14`，P0）。

另有一处分类学纠正已由 RP-01 §3 成文、总控 §3.4 认可两轴方向：把"非承载式越野 / 承载式轿车 / 纯电"并列是错的，前两者是 `bodyStructure`，纯电是 `powertrain`，二者正交（电动皮卡即 BOF+BEV）。但 `VEHICLE_SYSTEM_TREE_SEED.md` 与 `GAP_REGISTER` GAP-004 仍用旧三分法，登记簿仍为 `INITIAL`、`:4` 仍写"308 行 `MASTER_PLAN.md`"（21:35 实测 **341 行**，且总控又在 21:11 新增 §20 未同步）。**共享种子需由总控修订**（`NEW-09` / `R-10`）。

---

## 3. 接口图与真实性矩阵审查（任务书步骤 2、3）

### 3.1 接口图：覆盖扎实且已获批，但坐标与四驱仍是硬伤

RP-02 交付 1551 行、42 节点 / 86 边、六类接口、四个因果场景、24/24 自动测试，总控独立重跑 24/24 PASS 并 `approved`。**但 `AUDIT:12` 明确只批准"接口方案研究层面"，坐标、`Frame`、`partId/instanceId` 仍是提案，未批准用于生产 Schema。**

- 图仍为 `ICE FWD (ASSUMPTION)`，42 节点只有 `N-TRANS-DIFF` 与 `N-HALFSHAFT-FL/FR`，无分动箱、传动轴、后差速器、后驱半轴。而 `MASTER_PLAN.md:169` 要求前/后/四驱适配器，**`RP-01-tree-powertrain.json` 现已含分动箱与 AWD 零件**，`RP-03:79` 反证现有 `vehicleWorld.js` 已有"前 40%/后 60%"分配却无差速器约束。**规划目标、产品树、接口图、现有实现四者不一致。**
- `coordinateConvention.status = OPEN`，报告 §11.3 明写"未统一前不得进入生产"。**v1.3 修正**：R-02 提案（21:31）已给出显式旋转矩阵与正反坐标公式，不再是"无人给出"，但状态 `PROPOSAL`、明写"待 RP-07 冻结"，且 RP-02 原图与 RP-04 v2 的表述都未同步。
- `scope.excluded` 排除燃油系统细节、HVAC 制冷剂回路、排气后处理、详细线束走向；这些在 `GAP_REGISTER` 里没有对应条目，属隐性遗漏。

### 3.2 真实性矩阵：总控已给出正确字段划分，但仍无字典

| 来源 | 词汇 | 备注 |
|---|---|---|
| `MASTER_PLAN.md:105` | `VISUAL / GEOMETRY / KINEMATIC / DYNAMIC` | 标题写"**三种**验证等级"却列 **4** 项（21:35 复核仍在） |
| RP-03 | `FID-V/G/K/D1/D2` 五级 | §10 要求把 `DYNAMIC` 拆成 D1/D2 |
| RP-02 | `EVIDENCE / ENGINEERING_DERIVATION / ASSUMPTION / OPEN` | 另自提 `fidelityLevel` 三级与映射表 |
| RP-06 | `truthLabels` 四徽章 + `validationLevel` | 称"供 RP-02 合并"，未采纳 |
| RP-01 | `EVIDENCE / ASSUMPTION / OPEN` + `DEFERRED / OUT_OF_SCOPE` | 又是一套 |
| R-02（新） | `EVIDENCE / ENGINEERING_DERIVATION / DEMO_ASSUMPTION / OPEN / DEFERRED / NOT_APPLICABLE` | 第六套；自称数据契约设计稿，非生产 Schema |
| **AUDIT §3.2** | **`fidelity` / `evidence` / `verification` 三字段必须分别编码** | **方向已给，21:35 仍无单一字典文件、无 ADR、无统一映射** |

R-02 新增一套分级词汇，使词汇统一问题**不减反增**；其报告虽诚实标注分级，但未提供与 RP-03 FID 五级、RP-06 徽章的映射。

### 3.3 已证实的"虚假真实度"（实测反例，非设想）

- 画面双叉臂随悬架行程被 `scale.z` 拉长/缩短：上叉臂一次跳动**缩短 82.12 mm**、下叉臂 68.50 mm（总控隔离副本复跑确认）——刚性连杆不可能这样。
- **R-01 §2（21:24）提供第二份独立实证**：改轮距 1680→2200 mm 时下臂跨度 499.9→735.6 mm（**+47.1%**）靠 `scale.z` 静默拉伸达标，且现有演示代码**根本没有任何变型拒绝机制**；车架纵梁写死 2860 mm，轴距超 2860 轴心即出梁端。这是"把参数拉伸当变型设计"的系统性证据（`NEW-15`）。
- 直线制动时 `frictionSlip` 从 3.2 改到 0.08，末速度**都是 0.060848 m/s**；不能当冰面摩擦系数。
- `src/specs.js` 注释写"米/千克/牛"，但刚度 32 实为质量归一化系数、`maxBrake: 42` 是每步冲量上限；RP-01 §8.2 又实测 `src/` 对 `bearing|seal|bushing|ballJoint` 四词**零命中**。
- `drivetrain.js` 注释称"真实渐开线梯形齿"，实际用固定比例直线段拼齿廓、差速器两侧输出同角度。
- **RP-04 v2 仍是**：`:166` Step 7 把未实测的"≥60 FPS、DrawCall ≤150"标为 `EVIDENCE`；RP-06 的 `verification-plan.json` 仍 `PLAN_ONLY`，另一套目标是 45/30 fps。

### 3.4 总控点名两项的独立复核结果

**① RP-04 ISO 273：数值已修复，并已复审 APPROVED；剩余是装配界面。**
v2（21:06）把 M14 改为 fine 15.0 / medium 15.5 / coarse 16.5 查表，删除 `stud_d + 0.8` 自造公式；`params.json` 标 `DEMONSTRATION_PROTOTYPE` 与显式 ASSUMPTION，`metadata.json` 增 `fidelity_disclaimers`，`feasibility.json` v2 有 6 项 PASS。**21:17 总控用隔离副本独立复测 6/6 PASS、判 `APPROVED`**，并在复审记录 `:13` 明确"设计仍以公开工程对照表和项目内离散查表为基础，非正式购买的标准全文认证；模型没有声称轴承内部滚子、预紧力、真实配合公差或动力学已经得到验证；零件的几何尺寸仍为演示性假设"，`:36` 列出未通过范围（OEM 尺寸、真实滚动轴承构造、螺纹、压装/预紧、刚体运动副、整车动力学）。

**这部分返工与复审合格，v1.3 正式关闭"ISO 273 数值错误"与"返工未复审"两项，不再列为当前缺口。** 标准出处限制也已被总控以显式边界声明接受（`NEW-11` 降为部分解决）。

但独立复核仍发现未闭环项（`R-15`）：
- RP-04 报告**正文**仍无任何标准出处 URL/版本/检索日期（`grep -E 'https?://|iso.org|检索日期'` 返回空）；边界声明只存在于复审记录里，未回写报告。
- RP-01 §10 第 3 点质疑**返工与复审均未回应**：把轮毂法兰孔当 ISO 273 螺栓通孔，而量产轮端要么攻丝配车轮螺栓、要么压装花键螺柱配螺母；作为演示可接受但必须显式标注。
- `params.json` 中 `pilot_diameter_mm: 84.0` 与 `center_bore_mm: 67.1` 并存且未澄清是否同一接口；若为同一接口则 Ø84 凸台无法进入 Ø67.1 孔，属几何干涉。
- 总控 §4 要求"补齐装配界面/轴承简化说明"——v2 补了轴承简化，**装配界面未补**。

**② RP-06 Raycaster 路径：仍未修复。**
`RP-06-feature-matrix.json:27` 的 `examples/jsm/core/Raycaster.js` 仍 `MISSING`，真实位置 `node_modules/three/src/core/Raycaster.js` `EXISTS`。`AUDIT:15/:55/:85` 三处确认并要求 Viewer 实现前更正。同文件 `verification-plan.json` 记录 body ~11633 与实测 12878 不符、`EADDRINUSE` 记 `PASS_WITH_NOTE`、status 仍 `PLAN_ONLY`。

### 3.5 规范与自身产物不一致（逐字段核对，v2 后仍在）

`MASTER_PLAN.md:94-95` 要求 PartSpec 带 `mechanical`（材料/质量/质心/惯量/摩擦）与 `assets`（STEP/GLB/LOD/碰撞几何/哈希）。实测 `wheel_hub_assembly_metadata.json` 字段为：`assembly_name / unit / fidelity / engineering_standards / clearance_fit_check / fidelity_disclaimers / components(体积+bbox) / assembly`——**仍无 mass_kg、inertiaTensor、collisionShape、glbPath、sha256、material、sourceProvenance**。`hello_flange_metadata.json` 同样没有。

而 RP-04 v2 `:343` 仍要求"输出标准质量(kg)与惯性矩张量供动力学仿真读取"、`:161` 仍把"精确质量属性"标 `EVIDENCE`；`AUDIT:49` 与 RP-04 复审 `:36` 均确认物理属性未验证。v2 新增的 `node.extras`（4 节点）是真实进步，本版据实记录。

**v1.3 补充**：R-02 契约提案已把 `Material`、`AssetManifest`（含 hash/transform）、`Frame` 写进字段设计，并明确"不为材料密度/螺栓预紧等填写没有来源的数值，一律 `null + OPEN`"，方向正确；但仍是 `PROPOSAL`。同时 R-03 在 21:33 已产出 4 个零件的 STEP/STL/GLB——**规范、契约、产物三者时序倒置**（`NEW-16`）。

---

## 4. 端到端场景追踪（任务书步骤 6）

按「产品总成 → 接口 → 建模 → 仿真 → 渲染 → 验收」六环追踪，完整表格见 `RP-05-risk-matrix.json`。

| 场景 | 产品总成 | 接口 | 建模 | 仿真 | 渲染 | 验收 |
|---|---|---|---|---|---|---|
| **SC-01 液压制动** | **已验证** ↑ | **CONFLICT** | 部分 | **已验证** ↑ | 仅提名 | **MISSING** |
| **SC-02 四驱动力** | **已验证** ↑↑ | **CONFLICT** | 部分 | **MISSING** | 仅提名 | **MISSING** |
| **SC-03 冷却** | **部分覆盖** ↑ | 部分 | 部分 | 部分（FID-V 示意） | 仅提名 | **MISSING** |

↑ 为相对 v1.1 的升级，全部源于 RP-01 分树落盘与总控独立复跑，**不是放宽标准**。

关键发现（比"缺文档"更危险）：

- **SC-01 接口层 PASS 与仿真层反例语义冲突**：RP-02 `TC-02` 判主缸→卡钳液压路径连通 PASS（总控复跑 24/24），但 RP-03 探针证明现有物理里"刹车"只是把车轮转角增量置零、直线制动不读 `frictionSlip`。两套语义没对齐。
- **SC-02 从"两边都缺"变成"单边缺席"**：产品树环已升为 `PRESENT_VERIFIED`（`tree-powertrain.json` 255 节点含分动箱/AWD），但接口图仍 FWD、仿真与验收仍为空，且现有代码已有一套无定义的四驱式分配。**产品树已补反而更容易被误认为链路已通**。
- **三条场景的验收环仍全部 MISSING**：21:35 实测无 `tests/`；RP-03 的 `failIf` 是可转断言的草案但未接入框架；RP-06 门禁全为 `PLAN_ONLY`。须特别区分：**RP-01 的 validate/selftest 只校验产品树结构，不是场景级验收**。
- **v1.3 新增**：R-03 资产流水线已产出轮端总成几何，但这些产物的零件 ID 沿用未冻结的 `SYS-30-HUB-001` 风格（`RP-01 idPolicy` 中 `SYS` 是系统级前缀），且无几何来源说明，不能计入"建模环已打通"。

---

## 5. GAP_REGISTER 逐条复查（任务书步骤 5）

完整证据链见 `RP-05-gap-verdicts.json`（每条 ≥3 条出处 + `v12Change` 变更标签）。摘要：

| 判定 | 数量 | GAP-ID |
|---|---|---|
| `CONFIRMED_GAP` | 8 | 001, 003, 010, 012, 013, 014, 015, 016 |
| `ALREADY_COVERED` | 6 | 002, 005, 007, 008, 009, 011 |
| `NEEDS_DECISION` | 2 | 004, 006 |
| `NOT_REQUIRED` | 0（6 个子项） | 见下 |

**为什么两轮重新取证后数量都没变（这点必须说清）**：v1.1 的 4 项"文件缺失"记在 `dependency-baseline` 的 `residualBlocking`、GAP-002/006 的 `scopeExceptions`、`BASE-05` 与 `R-06` 里，**从未计入 16 条 GAP 判定的计数**。v1.2 逐条重取证：12 条刷新证据、4 条收窄范围；v1.3 又因 R-01/R-02 新交付刷新了 8 条。两轮新增交付提供的都是**方案与提案**（`PROPOSAL` / `submitted` 待审），不是冻结决定，因此不翻转任何一条判定值。**这是核对结果，不是沿用 v1.1 的计数。**

几条值得总控特别注意：

- **GAP-003 CONFIRMED_GAP（性质两次修正）**：v1.1 说"四种坐标、事实未知"→ v1.2 修正为"RP-01 §8.3 已定案项目系，缺裁决"→ **v1.3 再修正为"R-02 已给出提案级变换矩阵与正反公式，缺冻结与跨报告同步"**。`AUDIT:61` 仍是第 1 项 P0 冲突。
- **GAP-008 ALREADY_COVERED（依据整体替换并已复审）**：v2 修正数值、删自造公式、补假设声明与 6 项测试，21:17 总控独立复测 6/6 PASS 判 `APPROVED`，出处限制由复审记录显式接受。残留仅装配界面消歧与报告正文出处回写。
- **GAP-013 CONFIRMED_GAP（范围再收窄）**：R-02 已交付覆盖 `partId/familyId/instanceId`、修订版、`Joint`、`MountInterface`、`Frame`、`AssetManifest` 的完整契约提案（0 错误 / 20/20 / 3/3），是实质进展；但 `PROPOSAL` 待审、无双向需求库、RP-04 v2 与 R-03 产物仍用不合规 ID。
- **GAP-014 CONFIRMED_GAP（证据加强）**：`geometry-needs.json` SOURCED=0；`AUDIT:50` 二级资料限制；`MASTER_PLAN` 341 行而登记簿仍 308 行；21:35 仍无 `LICENSE`/`ASSET_PROVENANCE`。
- **GAP-016 CONFIRMED_GAP（过期理由两次删除）**：v1.1 的"无返工实例/无 Git 基线/无独立审查"已补齐；v1.2 的"RP-04 v2 未复审"也已被 21:17 复审记录推翻。现改判为"**可执行验证矩阵、跨报告冲突裁决载体、审核状态自动汇总与登记簿时效维护仍缺**"——R-01/R-02 于 21:24—21:32 新交付均 `submitted`、R-03 `in_progress`，主 AUDIT 表无返工后状态列，`MASTER_PLAN §20` 停在 21:11 的旧表述，**审核时点漂移由偶发变成常态**。

**判为 NOT_REQUIRED 的 6 个子项**：量产碰撞安全认证、复杂燃烧/传热 CFD、真实轮胎有限元与全系统流体动力学、详细线束三维走向与真实 DBC/ARXML、P0 迁移 WebGPU、混动专用总成展开。每项在 JSON 里附裁剪依据。

**登记簿自身的问题扩大**：`GAP_REGISTER.md` 仍 `INITIAL`、仍写"308 行"（总计划已 341 行）、16 条候选未随两轮审核更新、GAP-004 仍沿用旧三分法。**本审计按任务书约束不修改它，只上报。**

---

## 6. 运行成本、资源、许可与版本保护（任务书步骤 4）

| 项 | 21:35:23 实测 | 判断 |
|---|---|---|
| **版本保护** | `.git` 存在；唯一提交 `8d45c1e`（148 文件）；`.gitignore` 排除 node_modules/.venv/.cache/密钥；**`git status` 53 条未提交**（21:10 为 25 条）；`git diff --stat` 21 文件 +402/−147 | A-00 已缓解 v1.1 的 P0 风险（`R-07` 降 P2），但 A-00 仍 `in_progress`（回归截图未验证）；返工与新研究成果均未形成新恢复点；`NEXT_TASK_CONTINUITY.md` §7 要求独立提交，与 53 条未提交不符 |
| C 盘 | 12 GB 可用 / 93% 占用 | 符合 `AGENTS.md` 禁写 C 盘约束；仍无资产体积预算 |
| F 盘 | 244 GB 可用 / 94% 占用 | 环境、缓存、CAD 产物均在 F（v1.1 记 242 GB，已更新） |
| 目标目录 | `assets/`、`tests/`、`docs/schema/`、`src/viewer/` 仍 `MISSING` | `MASTER_PLAN.md:123-140` 目标结构未落地；但 R-03 已在 `cad/experiments/asset_pipeline_v1/out/` 产出几何，需明确其为隔离实验 |
| 资产保留 | hello_flange 的 STEP/STL/GLB/metadata 齐全；RP-04 v2 GLB **212460 bytes**、魔数 `glTF`；R-03 新增 4 零件 STEP/STL + `wheel_end_assembly.glb` | 生成物保留良好，但新增产物缺少来源与 ID 冻结状态标记；RP-03 探针/管线脚本仍属实验目录 |
| **许可 / 出处** | `LICENSE`、`LICENSE.md`、`ASSET_PROVENANCE.md`、`docs/ASSET_PROVENANCE.md` 全部 `MISSING` | RP-01 有 82 条来源登记（80 条可用、2 条 SNIPPET_ONLY、官方标准站点大面积 403）、RP-03 记录 Chrono LICENSE，做法正确但分散；RP-04 v2 **正文**无 URL/版本/检索日期，边界声明只在复审记录里 |
| 服务复现 | RP-06 记录 5173 HTTP 200 / body ~11633，实测 12878 不可精确复现；`EADDRINUSE` 记 `PASS_WITH_NOTE` | 证据质量瑕疵仍在 |
| 跨 AI 版本 | 六次快照 1→5 报告 / 7→25 evidence；21:11—21:35 又新增 20+ 文件 | 已可用 Git diff 比对，但 RP-07 前须重跑门禁；本版已设明确取证截止点 |

---

## 7. 风险矩阵与最小修复任务（任务书步骤 7）

完整 15 条风险（含影响、可能性/未知、前置依赖、建议负责人、最小修复任务、验收方式、优先级、`v12Change`）见 `RP-05-risk-matrix.json`。分布 **P0=7 / P1=5 / P2=3**（v1.3 增量复核未改变条数与分布，仅刷新 7 条风险的事实基础并新增 1 个反例）。构成相对 v1.1 的变化：`R-06` 降 P1、`R-07` 降 P2（均为真实缓解）、`R-09` 升 P0（总控 §3.3）、新增 `R-14` P0 / `R-15` P1。

7 条 P0：

| ID | 风险 | 最小修复任务（摘要） | 建议负责人 |
|---|---|---|---|
| R-01 | 变换矩阵已有 R-02 提案，但世界坐标与 Frame 契约未冻结、跨报告未同步 | **以 R-02 提案为起点**做 ADR 裁决，补齐 STEP/glTF/CAD 局部 Frame 清单与 4 组正反用例 + FL/FR 与镜像件身份，同步 RP-02 原图与 RP-04 v2 表述 | GPT-6 裁决 + DeepSeek/Qwen4/Gemini |
| R-02 | 首发基型四处不一致；R-01 提案已交付但仍 `PROPOSED_NOT_APPROVED` | 以 R-01 的 16 条变型规则为输入做单页 ADR 基型裁决，并定 AWD/4WD 范围，避免重复研究 | GPT-6 |
| R-03 | 真实性/证据/审核三字段未分别编码，R-02 又新增一套分级词汇 | 按 `AUDIT §3.2` 建单一字典 JSON + 各报告（含 R-02）唯一映射 + 修正总计划 §4.4 标题 | GPT-6 → DECISIONS.md |
| R-04 | 产品树已有 AWD 零件，接口图仍只有前驱 | 补 AWD 片段接口图与非法配置反例，或明确移出本轮并清理现有 40/60 演示分配 | DeepSeek + Qwen4 + Grok |
| R-05 | RP-04 v2 后 PartSpec 物理字段仍缺 | 补 mass/inertia/collision/glbPath/sha256/material，在 `verify_assembly.py` 加存在性断言；与 R-02 `AssetManifest` 字段对齐 | Gemini + 架构 Agent |
| R-09 | 零件身份未统一；R-02 契约提案已交付待冻结 | 以 R-02 契约为基线裁决，优先处理 RP-04 v2 与 **R-03 产物**沿用的 `SYS-30-HUB-001` 风格 ID | GPT-6 裁决 + DeepSeek/Qwen4/Gemini |
| R-14 | **493 零件几何依据为 0，R-03 已产出几何**（风险已变现） | 把 `AUDIT §3.5` 写成可执行门禁；**立即确认 R-03 产出属隔离实验、不得进入 `assets/`**，并在其验收项加 SOURCED 计数与 ID 冻结状态检查 | GPT-6 决策 + Qwen4/Gemini |

另需注意 `R-15`（P1）：RP-04 复审已通过，剩余是报告正文回写边界声明、装配界面消歧与 R-03 产物 ID 对齐。

**升级总控**：15 条风险全部涉及跨模型接口、共享分类、审核时点同步或整体范围变化，按 `AGENTS.md:22`、RP-05 任务书与 `AUDIT §3/§5` 提交总控讨论；**本审计未擅自修改任何共享文档或他人产物**。

---

## 8. 反例自测：为什么不能算"已闭环"

完整 9 条见 `RP-05-risk-matrix.json` 的 `antiExamples`。本轮删掉已过期的"4 份报告 submitted 可启动 RP-07"，替换为 4 条更贴近当前状态的说法：

| 常见说法 | 反证 | 判定规则 |
|---|---|---|
| RP-02 1551 行 / 42 节点 / 24-24 PASS 且 approved，接口已闭环 | `AUDIT:12` 只批准研究层面；报告自列 7 缺口 6 项待裁定；图为 FWD；坐标 `OPEN` | 篇幅、PASS 与研究层面 approved ≠ 覆盖完整 |
| RP-04 §5 说 B-rep 保留精确质量属性，故质量/惯量已打通 | v2 两份 metadata 仍只有体积/包围盒/间隙/保真度声明；`:343` 自己要求输出质量与惯性矩 | 能力描述 ≠ 已交付数据 |
| ≥60 FPS / DrawCall ≤150 标了 EVIDENCE | v2 `:166` 仍未改；RP-06 门禁 `PLAN_ONLY` 且另一套目标 45/30 fps | 把目标标为 EVIDENCE 属虚假真实度 |
| **5/5 报告齐备、5 项 approved、Git 基线已建立，可以启动 RP-07** | RP-07 仍 `backlog`；主 AUDIT 无返工后状态列，R-01/R-02 新交付 `submitted` 待审、R-03 `in_progress`；§3 五项 P0 冲突无 ADR；53 个变更未提交；493 零件几何依据为 0 | 文件齐备 + 研究审批 + 有恢复点 ≠ 设计裁决已冻结 |
| **RP-04 v2 修正了 ISO 273 且已复审 APPROVED，标准合规已全部闭环** | 复审记录明示"非正式购买的标准全文认证"；v2 报告正文无 URL/版本/检索日期；轮毂孔性质与 pilot Ø84 / center_bore Ø67.1 未澄清；物理字段仍缺 | 数值正确 + 复审通过 ≠ 证据链与装配界面完整 |
| **R-02 已交付数据契约、坐标变换矩阵与身份规则，接口已冻结可批量建模** | `R-02-example-assembly.json` status=PROPOSAL、明写"世界坐标选择待 RP-07 冻结"、任务卡 submitted；RP-04 复审 `:38` 明确冻结前不得把演示接口称为最终协议；而 R-03 已于 21:33 按未冻结 ID 产出 STEP/STL/GLB | 提案交付 + 校验器 PASS ≠ 契约冻结；实现早于冻结会产生需重做的资产 |
| **780 节点 / 493 零件且通过 24 规则 + 32 反例，整车几何数据已具备** | `geometry-needs.json` SOURCED=0；RP-01 §0/§14.1 明说无一个零件有已核实几何依据；`AUDIT:11` 不批准真实尺寸 | 产品树覆盖度 ≠ 几何可用度 |
| 现有 drivetrain 演示能展示传动 | `gearboxRatio` 未被使用、16/24 齿比写死、差速器两侧同角度、前40/后60 无差速器 | 动画演示 ≠ 可装配工程零件 |
| 两条 GLB 链路已验收，全流程打通 | `RESEARCH_BASELINE.md:70` 尚未验证 GLB 作为独立 PartInstance 在 Chrome 渲染/选择/替换；两份 metadata 无物理字段；`src/viewer/`、`assets/` 不存在 | 单件产出 ≠ 平台装配能力 |

---

## 9. 事实 / 假设 / 未知（明确分级）

**已证实（21:35:23 本机实测或文件原文）**：5 份报告存在与行数；25 份 evidence JSON 全部可解析；RP-01 分树节点数（100/273/255/150）与功能树 77；validation 0 违规、selftest 32/32；`geometry-needs.json` SOURCED=0；Git 提交 `8d45c1e`、148 tracked、**53 未提交**、`.gitignore` 内容；`MASTER_PLAN.md` **341 行**（§20 新增）而登记簿称 308；RP-04 v2 ISO 273 查表与 6 项测试、**21:17 复审 APPROVED / 6/6 PASS**、GLB 212460 bytes / 魔数 `glTF`；RP-04 v2 正文无 http 出处、`params.json` pilot 84.0 / center_bore 67.1 并存、`:166` 仍标 EVIDENCE、`:269` 仍为 `SYS-30-HUB-001`；**R-01 报告 16 规则 / 21 反例、`scale.z` +47.1% 实测，状态 submitted**；**R-02 契约坐标矩阵与身份链、status=PROPOSAL / submitted**；**R-03 于 21:33 产出 4 零件 STEP/STL + GLB**；Raycaster 错误路径仍 MISSING 而 `src/core/Raycaster.js` EXISTS；`LICENSE`/`ASSET_PROVENANCE` 全 MISSING；C 12G/93%、F 244G/94%；任务卡状态（RP-04 approved / RP-05 submitted / R-01 submitted / R-02 submitted / R-03 in_progress / RP-07 backlog）。

**推导（有依据但非直接实测）**：门禁状态判定；"文件齐了、裁决没齐"的结构判断；风险优先级分级；各 GAP 的四级判定；对 RP-04 v2 返工与 R-01/R-02 提案"部分完成/未冻结"的评价。

**仍未知（不推测）**：本 RP-05 v1.3 的总控复审结论；R-01/R-02/R-03 三项新交付的审核与冻结时点；A-00 四种演示模式回归截图结果；493 零件的真实尺寸来源与 ISO/SAE 标准全文条款（官方站点 403）；首发基型最终选择；`pilot Ø84` 与 `center_bore Ø67.1` 是否同一接口（**不假定是错误**）；RP-07 何时启动；**21:35:23 之后新增文件的内容**。

**明确不声称**：摘要中曾出现的 `agent-workspace/agents/deepseek/reports/RP-02-frame-alignment.json`，在 21:10:40 用 `Glob **/*frame*` 全库检索返回 `No files found`，`deepseek/reports/` 当时仅有 `RP-02-validator.mjs` 与 `RP-02.md`。本审计**不据此文件下任何结论，也不假定它曾存在或被删除**；R-02 的坐标结论全部引自 `docs/research/R-02-example-assembly.json` 与 `R-02-data-contract-report.md`。

---

## 10. 验证记录

在项目根目录 `F:\project\cyq\AI_Coding\car` 执行，输入全部只读：

```bash
date '+%Y-%m-%d %H:%M:%S %z'                       # 2026-11-14 21:35:23 +0800（最终截止）
find . -newermt '2026-11-14 18:42:44' -printf ...   # 审核后变更清单
find . -newermt '2026-11-14 21:10:40' -printf ...   # v1.2 落盘后的二次漂移（触发 v1.3）
git log --oneline -5                                # 8d45c1e（唯一初始提交）
git ls-files | wc -l                                # 148
git status --short | wc -l                          # 53（21:35 复测；21:10 为 25）
git diff --stat                                     # 21 files changed, 402 insertions(+), 147 deletions(-)
wc -l MASTER_PLAN.md docs/planning/reports/RP-0*.md # 341 / 1319 1551 250 363 302 281
python json.load × 25 份 evidence                   # PARSE_OK，0 errors
ls node_modules/three/{examples/jsm/core,src/core}/Raycaster.js  # MISSING / EXISTS
ls LICENSE* ASSET_PROVENANCE*                      # 全部 MISSING
stat + od -An -tx1 -N4 wheel_hub_assembly.glb      # 212460 bytes / 67 6c 54 46 (glTF)
df -h                                              # C: 12G/93%, F: 244G/94%
grep -E 'https?://|iso.org|检索日期' RP-04-cad-production.md  # 无输出（正文无标准出处）
grep -n 'Raycaster' RP-06-feature-matrix.json      # :27 路径仍为 examples/jsm/core/...
```

**v1.3 增量更新**以一次性结构化脚本 `F:\tmp\rp05_v13_update.py` 完成（只写三份 RP-05 evidence JSON，输入全部只读），更新后重新校验：

```text
PARSE_OK RP-05-dependency-baseline.json  carlab.rp05.dependencyBaseline/1.3
PARSE_OK RP-05-gap-verdicts.json         carlab.rp05.gapVerdicts/1.3
PARSE_OK RP-05-risk-matrix.json           carlab.rp05.riskMatrix/1.3
STATS: verdicts {CONFIRMED_GAP:8, ALREADY_COVERED:6, NEEDS_DECISION:2}
       | newFindings 16 | risks 15 {P0:7, P1:5, P2:3} | antiExamples 9 | snapshots 6
FINAL_CHECKS_FAIL=0    RESULT: PASS
```

校验项：16 条 GAP 编号连续、四级计数与 summary 一致、每条 ≥3 条证据引用且含 `v12Change`、16 项新发现、3 条场景 × 6 环、15 条风险字段齐全、优先级计数一致、9 个反例、三份快照时间一致、`residualBlocking` 为空。另做过期字符串扫描：三份 JSON 中不再出现"RP-01 正文未归档""分文件 MISSING""无 Git 基线""无 needs_work 返工实例""RP-04 v2 未复审"等作为当前判断；仅作为历史变更记录保留并标注已作废。

---

## 11. 给总控的下一步（不超过两项）

1. **先做一次"返工复审 + 接口冻结评审"**：对 RP-05 v1.3 写一条带时间戳的复审记录（RP-04 已于 21:17 复审，无需重复），并把主 `AUDIT` 表增设"返工后状态"列；同时以 **R-01 / R-02 已交付的提案为起点**（而非从零设计）用 `R-01/R-02/R-03/R-09` 产出 ADR（坐标与 Frame 变换、首发基型与 AWD 范围、fidelity/evidence/verification 三字段字典、partId/familyId/instanceId/MountFrame）。这四项不冻结，R-03 等实现型任务会带着冲突继续产出需重做的资产。
2. **RP-07 启动前跑一次带时间戳的文件级门禁并复审本版冲突**：确认 5 报告 + 25 JSON 齐备、R-01/R-02/R-03 审核与冻结状态、主 AUDIT 状态列已更新，核对本报告 §7 的 7 条 P0 是否已被 ADR 消除；把 `AUDIT §3.5` 的"493 件无依据几何不得批量生成"写成可执行检查（`R-14`），并确认 R-03 产出标记为隔离实验。**本版以 21:35:23 为取证截止点，此后的新交付按 `AUDIT:94` 由 RP-07 复审，不得直接引用本版作为最终状态。**

---

*报告结束 — v1.3 重新提交，等待 GPT-6 复审。本任务状态 `submitted`，不自行标 `approved`；任务卡保留总控写入的 `reviewReport` / `reviewDecision` / `reviewedAt` 字段。*
