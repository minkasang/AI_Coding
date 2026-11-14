# R-01｜整车平台家族、硬点与车型变型研究

- 任务：`R-01`（看板编号 `03.01`）｜执行：Qwen4｜日期：2026-11-14｜状态：**SUBMITTED，待总控审核**
- 任务书：[`docs/tasks/R-01-platform-family.md`](../tasks/R-01-platform-family.md)
- 前置：`RP-01` 已 APPROVED（研究成果层面），见 [`AUDIT_2026-11-14.md`](../command/reviews/AUDIT_2026-11-14.md)
- 性质：**研究提案**。本文件不冻结任何生产 Schema，不修改 `src/`、CAD、总计划或共享种子。

---

## 0. 一句话结果

把"一套底盘怎样合法地衍生不同车型"从文字原则变成了**16 条可机器执行的规则 + 一个能跑的校验器**：同一家族的短轴与长轴两个变体通过，一个超长轴/超宽轮距/套轿车壳的变体被**7 类具体冲突**拒绝；并且实测发现现有演示代码**根本没有任何变型拒绝机制**——改轮距时摆臂是靠 `scale.z` 静默拉伸达标的（轮距 1680→2200 mm 时下臂跨度 499.9→735.6 mm，+47.1%，管径与张开量不变）。

**给非程序员的解释**：以前"换个车型"在代码里等于把几个数字改大，杆件会被悄悄拉长，看起来连上了，其实零件已经不是原来那个零件。这次我写了一份"平台家族说明书"，规定哪些尺寸不许动、哪些只能在什么范围内动、超出范围时必须换哪个模块，否则就明确拒绝并说出原因。然后用一个程序去检查三个示例车型：两个合法的放行，一个非法的当场拦下并列出 7 条具体冲突。我还故意造了 21 种错误配置去试这个程序，21 种全部被抓住——证明它不是只会盖章的橡皮图章。

---

## 1. 交付清单与边界

| 路径 | 内容 |
|---|---|
| [`docs/research/R-01-platform-family-report.md`](R-01-platform-family-report.md) | 本报告 |
| [`docs/research/R-01-platform-family-example.json`](R-01-platform-family-example.json) | 1 个演示平台家族 + 2 个合法变体 + 1 个非法变体 + 11 条来源 + 19 条本地实测 + 16 条规则 + 2 张传播图 |
| [`docs/tasks/reports/R-01-report.md`](../tasks/reports/R-01-report.md) | 任务书指定格式的提交回报 |
| [`agent-workspace/agents/qwen4/reports/R-01.md`](../../agent-workspace/agents/qwen4/reports/R-01.md) | 个人回报（协作协议要求） |
| [`agent-workspace/agents/qwen4/tools/r01_platform_tool.py`](../../agent-workspace/agents/qwen4/tools/r01_platform_tool.py) | 校验器（仅标准库，`derive` / `validate` / `selftest`） |
| [`agent-workspace/agents/qwen4/reports/R-01-validation-result.json`](../../agent-workspace/agents/qwen4/reports/R-01-validation-result.json) | 正例结果：判定、派生尺寸、13 条拒绝明细 |
| [`agent-workspace/agents/qwen4/reports/R-01-selftest-result.json`](../../agent-workspace/agents/qwen4/reports/R-01-selftest-result.json) | 反例结果：21 条逐项 CAUGHT |
| `agent-workspace/agents/qwen4/tasks/R-01.md` 与 `R-01-S01..S05.md` | 任务卡（唯一状态源） |

**边界声明（请总控确认）**：任务书开放的可写路径只有报告 MD、样例 JSON 与 `docs/tasks/reports/R-01-report.md`，**没有开放 evidence 目录，也没有给脚本位置**。因此校验脚本放本人工作区 `tools/`（与 RP-01 同一目录，已声明过），两份结果 JSON 放本人 `reports/`。全部在本人区域、可逆、不影响任何共享文件。若总控要求改位置，移动后同步更新本报告命令即可。

**未做**：没有生成任何几何、没有跑 Blender、没有开浏览器、没有改 `src/` 一行。所有关于现有代码的结论都是**只读实测 + 可复算的算术**，不是运行验证。

---

## 2. 事实基线：现有代码到底传播了什么

任务书要求"不能复述汽车行业概念"。所以先回答一个更基本的问题：**现在改一个参数，代码里真的有什么跟着变？** 19 条实测全部带 `file:line`，登记在样例 JSON 的 `localMeasurements`。

### 2.1 轴距（wheelbase）——部分传播已实现

| 目标 | 是否跟随 | 实测位置 |
|---|---|---|
| 四角 z 坐标 | ✅ 跟随 | `src/parts/chassis.js:287-290` |
| 前后横梁、塔顶斜撑 z | ✅ 跟随 | `src/parts/chassis.js:156,165` |
| 转向机壳体与齿条 z | ✅ 跟随（`halfWB − 0.16`） | `src/parts/chassis.js:247,254` |
| 中央传动轴长度 | ✅ 跟随（`wheelbase − 0.14`） | `src/parts/drivetrain.js:191` |
| 前后差速器 z | ✅ 跟随 | `src/parts/drivetrain.js:98,212` |
| 物理轮锚点 z | ✅ 跟随 | `src/physics/vehicleWorld.js:185-188` |
| **车架纵梁长度** | ❌ **写死 2.86 m** | `src/parts/chassis.js:141` |
| **上门槛梁长度** | ❌ 写死 2.15 m | `src/parts/chassis.js:147` |
| 地板/座椅/线束/管路 | ❌ 无传播 | — |
| 质量/质心/轴荷 | ❌ `mass: 920` 是单一常量，无质心字段 | `src/specs.js:255` |

**可量化的失败阈值**：纵梁长 2860 mm、居中于 z=0，故两端在 ±1430 mm。当前轴距 2460 mm，每端余量 200 mm。

| 轴距 | 轴心 z | 纵梁端 | 结果 |
|---|---|---|---|
| 2460 | ±1230 | ±1430 | 余量 200 mm |
| 2660 | ±1330 | ±1430 | 余量 100 mm |
| 2860 | ±1430 | ±1430 | 余量 0（轴心正好在梁端） |
| **2900** | ±1450 | ±1430 | **轴心超出梁端 20 mm** |

这就是把"轴距不能无限拉长"变成**一个具体数字**的方式：本提案取每端最小悬伸 100 mm（演示假设），于是家族轴距上限 = 2860 − 2×100 = **2660 mm**。

### 2.2 轮距（track）——只传到轮毂，其余靠静默拉伸

| 目标 | 是否跟随 | 实测位置 |
|---|---|---|
| 轮毂 X、转向节位置 | ✅ 跟随（`hubX = side * halfTrack`） | `src/parts/chassis.js:418-423` |
| 物理轮锚点 X | ✅ 跟随 | `src/physics/vehicleWorld.js:185-188` |
| **上/下摆臂车架侧枢轴 X** | ❌ 写死 ±290 / ±270 mm | `src/parts/chassis.js:294-296` |
| **减振器上支点 X** | ❌ 写死 ±400 mm | `src/parts/chassis.js:296` |
| **转向拉杆齿条侧端点 X** | ❌ 写死 ±240 mm | `src/parts/chassis.js:450` |
| 横梁宽度、塔顶 X、纵梁 X | ❌ 写死 600 / ±340 / ±260 mm | `src/parts/chassis.js:142,157,165` |
| **摆臂长度** | ⚠️ **每帧重算后网格缩放** | `src/parts/chassis.js:433-440` → `:61-75` |

关键代码事实（这一条推翻了"摆臂长度写死所以会对不上"的直觉猜测）：

- `createWishbone(0.11, 0.013)` / `createWishbone(0.13, 0.016)` 的首参是 **spreadZ**（两腿在枢轴处的前后张开量），**不是臂长**（`:45,298-299`）。
- 每帧 `lLen = aimSpan(lowerArm.group, lowerPivot, _lowerEnd)` 后 `setSpanLength(lLen)`，内部执行 **`legA.scale.z = l1`**（`:70`）。

所以后果不是"零件脱开"，而是**更隐蔽的一种**：任何轮距值都会被接受，杆件被拉长以够到轮毂，而管半径 16 mm、张开量 130 mm、衬套与球铰位置全不变。这正是既有研究文档警告的"不能用 `mesh.scale` 假装工程配置完成"，**而且它已经在代码里发生了**。

可复算的量化（静止参考状态 `hubY = 80 − 340 = −260 mm`，下球铰端点 `x = halfTrack − 140`、`y = −345`，枢轴 `(270, −90)`）：

| halfTrack | 轮距 | 下臂跨度 | 相对基准 | 拉杆跨度 |
|---|---|---|---|---|
| 840 mm | 1680 | **499.925 mm** | — | 515.170 mm |
| 900 mm | 1800 | **552.381 mm** | +10.5% | 569.386 mm |
| 1000 mm | 2000 | 642.7 mm | +28.6% | — |
| 1100 mm | 2200 | **735.612 mm** | **+47.1%** | 756.439 mm |

**另一处必须说清的边界**：物理侧 `chassisConnectionPointLocal = (±halfTrack, 80, ±halfWB)`（`vehicleWorld.js:195`）与视觉侧摆臂枢轴 ±270/±290 mm **不是同一点**。这是 RaycastVehicle 与视觉连杆两套模型的固有简化，不是本轮新引入的 bug；但它意味着**改轮距会改变视觉连杆几何，却不改变物理侧的侧倾几何**（`rollInfluence` 固定 0.14）。任何"轮距变型已验证操稳"的说法都不成立。

---

## 3. 任务书五个问题的回答

### 3.1 Q1：官方资料里哪些固定、哪些可变？（原话 + 访问日期 + 分级）

本轮**实际抓取**到 4 个官方页面（访问日期均为 2026-11-14），2 个不可达。逐字原话登记在样例 JSON 的 `sources[].verbatim`。

| ID | 来源 | 原话（逐字） | 分级 | 能支持 | **不能支持** |
|---|---|---|---|---|---|
| S1 | [VW Group Annual Report 2018 — Modular toolkit strategy](https://annualreport2018.volkswagenag.com/group-management-report/report-on-risks-and-opportunities/risks-and-opportunities/modular-toolkit-strategy.html) | "…permits dimensions determined by the concept – such as the wheelbase, track width, wheel size and seat position – to be harmonized throughout the Group and utilized flexibly."／"Other dimensions, for example the distance between the pedals and the middle of the front wheels, are always the same" | **EVIDENCE** | 平台同时存在"可灵活运用的概念尺寸"与"始终相同的其他尺寸"，即固定基准与可变尺寸并存 | 无任何毫米数值、范围上下限、模块清单或接口规格。原句用 harmonized/utilized flexibly，**未逐字说明每个车型如何取值**，不能据此声称我们的范围是大众参数 |
| S2 | [Toyota Global — BEVs for global deployment (e-TNGA)](https://global.toyota/en/newsroom/corporate/28474382.html) | "the position of the front and rear electric motors... are fixed"／"wheelbase, number of batteries installed, overhangs" | **EVIDENCE** | 官方明确区分固定项（前后电机位置）与可变项（轴距、电池数量、前后悬） | 无数值范围。**本轮抓取文本未逐字出现"电池宽度固定"与"前中后三段模块"的完整原句**，故这两点标 OPEN（O06），不当已核实事实用 |
| S3 | [Toyota UK — TNGA small car platform (GA-B)](https://media.toyota.co.uk/toyota-announces-new-tnga-small-car-platform/) | "wheelbase lengths, heights and track widths"／"body types"／"standardised components in out-of-sight areas" | **EVIDENCE** | 同一平台允许不同轴距、车高、轮距与车身类型，并共用不可见区域标准件 | 无范围数值，未说明哪些硬点固定，未涉及非承载式车架 |
| S4 | [Toyota Global — Land Cruiser / GA-F structure](https://global.toyota/en/newsroom/toyota/35323595.html) | "frame structure"／"the frame itself was redesigned to reduce weight and increase rigidity" | **EVIDENCE** | 该车型保留独立车架，且车架为减重与提高刚度重新设计 → 车架是承载主体而非外观件 | **本轮文本未出现 ladder frame / body-on-frame 字样**，未列同平台车型清单，无断面或悬置点规格 |
| S5 | [Toyota USA — Trucks](https://www.toyota.com/vehicles/trucks) | 无 | **UNKNOWN** | 无 | 本轮为 JavaScript 空壳，未取得正文；既有研究文档中该条结论**本轮未复核** |
| S6 | [VW Group Annual Report 2025 — R&D risks](https://annualreport2025.volkswagen-group.com/group-management-report/report-on-risks-and-opportunities/risks-and-opportunities/research-and-development-risks.html) | 无 | **UNKNOWN** | 无 | 任务书列为资料起点，但本轮请求**超时**。MQB 结论改由 S1 本轮实际抓取支持 |

项目内部输入 P1 [`docs/vehicle-platform-architecture-research.md`](../vehicle-platform-architecture-research.md)、P2 [`docs/research/RESEARCH_BASELINE.md`](RESEARCH_BASELINE.md)、P3 [`docs/command/reviews/AUDIT_2026-11-14_RP04_RECHECK.md`](../command/reviews/AUDIT_2026-11-14_RP04_RECHECK.md) 本轮已读，标 EVIDENCE（指"文档确实这么写"），但 P1/P2 转述的厂商页面部分本轮不可达，**不能把转述当本轮原话**；P3 只支持"RP-04 研究链路已通过、ISO 273 标签已修正"，**不支持**真实配合公差或生产接口已冻结。文献 L1（Frank et al. 2022, Procedia CIRP）、L2（SAE 2000-01-1618）仅登记为线索，`usedForClaim=false`，本轮未取全文，不引用其具体结论。

> 满足任务书"3 个官方/技术论文来源以上"：本轮实际抓取并取到原话的官方来源 **4 个**（S1–S4）。

### 3.2 Q2：四层实体如何表达各维度

| 维度 | 落在哪个实体 | 表达方式 | 依据 |
|---|---|---|---|
| 承载式 / 非承载式 | **Architecture** | `bodyStructuralRole: STRUCTURAL / NON_STRUCTURAL` + `loadPath` 文字 | S4 + 工程推导 |
| 前驱/后驱/四驱 | **PlatformFamily.powertrainAxis** + **ModuleSlot**（动力源/传动/后悬架） | 动力形式是独立第二轴；驱动形式由模块组合表达，不在架构里硬编码 | RP-01 已批准的两轴模型 |
| 悬架形式 | **ModuleSlot(MS-FSUSP / MS-RSUSP).options[].topology** | `DOUBLE_WISHBONE / MACPHERSON / SOLID_AXLE / MULTI_LINK`，每个选项带 `compatibleArchitectures` | S3（同平台不同车身）+ RP-01 选择组 |
| 轴距 / 轮距 | **PlatformFamily.parametricDimensions** | `{min,max,unit,derivation,affects}`，变体只填 `params` | S1/S2/S3 |
| 车身形式 | **ModuleSlot(MS-BODY-UPPER).options[].bodyType** | SUV/PICKUP/SEDAN，且 SEDAN 只兼容 ARCH-UNI | S3 + S4 |
| 固定硬点 | **PlatformFamily.fixedHardpoints** | `kind: RELATIVE_RULE / SECTION_RULE / INTERFACE_TYPE`，`immutable: true` | S1（踏板到前轮中心始终相同）、S2（电机位置固定） |
| 接口 | **PlatformFamily.interfaceContracts** | 只声明**类型**与固定硬点引用，数值一律 `OPEN` | 审核 §3.3 身份未冻结、RP-04 正在返工 |

**关键设计选择**：固定硬点写的是**相对基准与方向语义**，不是世界绝对坐标。因为审核 §3.1 把"统一世界坐标 + 局部 Frame 变换"列为待裁决的 P0 冲突（现有代码 +X=左/+Y=上/+Z=前进，RP-02 示例是 x前/y左/z上）。本文件**不单方面定案**，只保证一旦总控冻结 Frame，这些相对规则可以无歧义地转成变换矩阵。

### 3.3 Q3：两个完整影响传播图（含失败条件）

机器可读版本在样例 JSON 的 `propagation`，每条边带 `action`（REGENERATE / RESELECT_MODULE / KEEP_FIXED / RECOMPUTE / RECHECK）、`status`（IMPLEMENTED_IN_DEMO / MISSING_IN_DEMO / HARDCODED_IN_DEMO / SILENTLY_STRETCHED_IN_DEMO）与 `codeRef`。

**图 A：轴距增大**

```text
PD-WB ↑
├─[已实现] 四角 z ─────────────── chassis.js:287-290
├─[已实现] 横梁/塔顶 z ────────── chassis.js:156,165
├─[已实现] 转向机 z ───────────── chassis.js:247,254
├─[已实现] 传动轴长度 = WB−140 ── drivetrain.js:191      ← 必须重生成，不是缩放
├─[已实现] 差速器 z ───────────── drivetrain.js:212
├─[已实现] 物理轮锚点 z ───────── vehicleWorld.js:185-188
├─[缺失→失败] 纵梁长度 ────────── chassis.js:141
│     失败类型 MODULE_LENGTH_INSUFFICIENT
│     条件 railLength < WB + 2×minOverhang(100)
│     实测阈值 WB > 2660 违反悬伸；WB > 2860 轴心超出梁端
│     补救：RESELECT RAIL-3100 模块并重新验证断面与悬伸，禁止拉长纵梁
├─[缺失→失败] 地板模块覆盖区间 ── FLOOR-STD 声明 2200–2660
│     失败类型 MODULE_LENGTH_INSUFFICIENT
├─[缺失] 门槛梁/座椅/线束/管路 ── 无代码传播
├─[缺失→失败] 质量/质心/轴荷 ─── specs.js:255 只有 mass 常量
│     失败类型 MASS_PROPERTIES_MISSING；targetLevel 不得高于 KINEMATIC
└─[缺失] 操稳目标（转向响应/侧倾）→ RECHECK，属动力学，本轮不得判通过
```

**图 B：轮距增大**

```text
PD-FT ↑
├─[已实现] 轮毂/转向节 X ──────── chassis.js:418-423
├─[已实现] 物理轮锚点 X ───────── vehicleWorld.js:185-188
├─[固定] 摆臂车架侧枢轴 X ─────── chassis.js:294-296（FH-05，immutable）
├─[固定] 减振器上支点 X ───────── chassis.js:296 → coilover 倾角被动改变
├─[静默拉伸→失败] 摆臂长度 ────── chassis.js:433-440 → :61-75 (scale.z)
│     失败类型 KINEMATIC_UNRESOLVABLE
│     条件 span(halfTrack) > 所选模块 lowerArm.maxSpan
│     实测 840→499.925 / 900→552.381 / 1100→735.612 mm（+47.1%）
│     补救：RESELECT 更长摆臂模块或拒绝；禁止 scale
├─[静默拉伸→失败] 转向拉杆 ────── chassis.js:450（齿条端 ±240 写死）
│     实测跨度 515.170 / 569.386 / 756.439 mm
├─[缺失] 整体桥桥壳长度 ───────── 后悬架为 SOLID_AXLE 时必须重生成
│     本提案要求：前后轮距不等时须给 axleHousingRegenerated 证据
├─[缺失] 半轴长度与 CV 关节角 ─── RP-01 ASSY-60-012 / PART-60-021
├─[缺失→失败] 轮罩包络 ───────── 现有代码无翼子板检查
│     失败类型 ENVELOPE_INTERFERENCE
│     条件 track/2 + tireWidth/2 > fender.maxHalfWidth(1050)
│     实测 957.5 / 1027.5 / 1227.5 mm → 非法变体超出 177.5 mm
└─[缺失] 前束/外倾/侧倾中心 → RECHECK，属运动学/动力学，本轮不得判通过
```

### 3.4 Q4：三类边界与"什么时候必须拒绝"

| 类别 | 定义 | 变体可以做什么 | 必须拒绝的情形 | 规则 |
|---|---|---|---|---|
| **FIXED** | 设计规则或相对位置（踏板—前轮中心、H 点相对前轴、纵梁断面、摆臂枢轴、接口类型） | 只能引用，不能改值 | 变体携带 `hardpointOverrides` 触碰 `immutable:true` | P05 |
| **PARAMETRIC** | 声明了 `[min,max]` 与派生关系的尺寸（轴距/轮距/胎宽） | 在范围内取值，触发下游重生成 | 越界；或派生结果超出所选模块能力 | P04 / P08 / P09 / P10 |
| **SWAPPABLE** | 模块槽里的可替换选项（纵梁段/地板/悬架/车壳/动力） | 选一个兼容选项 | 槽必选却没选、选了不存在的选项、选项与架构或动力形式不兼容 | P06 / P07 / P15 |

**拒绝优先于拉伸**，这是本提案的核心立场：当参数变化使某个模块能力不足时，只有两条合法路径——**换一个能力足够的模块**（并重新验证接口与包络），或**拒绝该配置**。第三条路（把网格缩放到位）被 P09/P14 明确禁止。样例里的 `RAIL-3100` 就是为演示第一条路而存在的假设模块。

### 3.5 Q5：非承载式越野改承载式轿车为什么不是换壳

| 对比项 | 非承载式（ARCH-BOF） | 承载式（ARCH-UNI） | 换壳会发生什么 |
|---|---|---|---|
| 承载主体 | 独立车架（S4：frame 为刚度重新设计） | 车身骨架（门槛梁/地板/立柱） | 轿车壳没有承担整车载荷的骨架设计，载荷路径断裂 |
| 车身结构角色 | `NON_STRUCTURAL` | `STRUCTURAL` | 同一张 GLB 无法同时是"非承载覆盖件"和"承载结构件" |
| 悬架载荷输入点 | 车架纵梁上的枢轴 | 副车架/门槛梁上的枢轴 | 硬点所属父结构不同，接口不通用 |
| 碰撞传力 | 车架纵梁 + 吸能盒 | 门槛梁/地板/立柱网络 | 传力路径与法规验证对象完全不同 |
| 质量/刚度分布 | 车架集中 | 车身分布式 | 模态、轴荷、操稳目标全部要重算 |

**机器可检的表达**：`UNI-SEDAN-SHELL.compatibleArchitectures = ["ARCH-UNI"]`，在 BOF 家族里选它即触发 **P15 / ARCHITECTURE_CROSSING**。这不是文字劝告，是校验器会拒绝的硬规则（反例自测第 18 条已证明）。

**可以共享什么**：轮端、制动、通用件家族、数据协议、部分模块接口——即 RP-01 SYS-130 目录里的东西。**不能共享什么**：整个承载骨架。所以正确说法是"两个架构家族共享零件库"，不是"一个平台换壳"。

**分级说明**：S4 只证明"车架是承载主体且为刚度重新设计"。上表中碰撞传力与模态的具体论述属 **ENGINEERING_INFERENCE**，本轮未取得碰撞法规原文或 OEM 结构文档，**不得当作已验证事实**。

---

## 4. 概念数据模型（供总控起草 Schema）

### 4.1 实体关系

```text
Architecture 1 ──── n PlatformFamily 1 ──── n VehicleVariant
                          │                        │
                          ├─ n FixedHardpoint      ├─ params{PD-*: number}
                          ├─ n ParametricDimension ├─ moduleSelections{MS-*: optionId}
                          ├─ n ModuleSlot ─ n Option├─ hardpointOverrides（禁止触碰 immutable）
                          ├─ n InterfaceContract   └─ claimedValidation
                          ├─ n Rule
                          └─ n PropagationEdge
Option ── compatibleArchitectures ──→ Architecture
Option ── compatiblePowertrains ────→ powertrain 枚举
ModuleSlot ── interfaceContractRef ─→ InterfaceContract ── fixedRef ─→ FixedHardpoint
ParametricDimension ── affects ─────→ ModuleSlot
PropagationEdge ── codeRef ─────────→ 本地实测位置（可为 null 表示尚缺）
```

### 4.2 JSON Schema 字段清单

| 实体 | 字段 | 类型 | 必填 | 约束 |
|---|---|---|---|---|
| Architecture | `id` | string | ✅ | `ARCH-` 前缀，全局唯一 |
| | `bodyStructuralRole` | enum | ✅ | `STRUCTURAL` / `NON_STRUCTURAL` |
| | `loadPath` | string | ✅ | 文字，非几何 |
| | `evidence` / `sources` / `evidenceLimit` | enum / string[] / string | ✅ | `sources` 必须可解析；`evidenceLimit` 不得为空 |
| PlatformFamily | `id` | string | ✅ | `PF-` 前缀 |
| | `architectureRef` | string | ✅ | 必须存在 |
| | `powertrainAxis` | enum[] | ✅ | ⊆ {ICE,BEV,HEV}，不得含 ANY |
| | `valueBasis` | enum | ✅ | DEMO_ASSUMPTION / LOCAL_MEASUREMENT / SOURCED / OPEN |
| | `status` | enum | ✅ | 本轮一律 `PROPOSED_NOT_APPROVED` |
| | `demoRestState` | object | ✅（若要算跨度） | `chassisConnY_mm`、`suspensionRestLength_mm` + basis + sources |
| FixedHardpoint | `id`,`name`,`kind` | string/enum | ✅ | kind ∈ RELATIVE_RULE / SECTION_RULE / INTERFACE_TYPE |
| | `value_mm` | number \| object \| null | ✅ | 接口类型可为 null（标 OPEN） |
| | `immutable` | boolean | ✅ | true 时变体不得覆盖 |
| | `valueBasis`,`sources`,`designDecision` | enum/string[]/enum | ✅ | OEM_PRACTICE_EVIDENCE 必须带 sources |
| ParametricDimension | `id`,`name`,`unit` | string | ✅ | unit 本轮一律 mm |
| | `min`,`max` | number | ✅ | min ≤ max |
| | `minOverhangPerEnd_mm` | number | 派生约束需要时 | 用于 P08 |
| | `derivation`,`affects` | string / string[] | ✅ | affects 指向存在的 ModuleSlot |
| ModuleSlot | `id`,`name`,`required` | string/bool | ✅ | required=true 时必选恰好一个 |
| | `selectionKind` | enum | ✅ | SWAPPABLE / PARAMETRIC_REGENERATE |
| | `interfaceContractRef` | string | ✅ | 必须存在于本家族 |
| | `derivedLength` | object | 参数化再生成时 | `{formula, offset_mm, offsetBasis, sources}` |
| | `rp01Ref`,`rp01ChoiceGroup` | string | 建议 | 关联已批准产品树身份，不复制实体 |
| Option | `id` | string | ✅ | 全局唯一 |
| | `compatibleArchitectures` | string[] | ✅ | P15 依据 |
| | `compatiblePowertrains` / `powertrain` | string[] / enum | 动力相关时 | P06 依据 |
| | `length_mm` / `maxSpan_mm` / `maxHalfWidth_mm` | number \| null | 按槽类型 | null 表示由派生公式计算 |
| | `lowerArm` | object | 悬架槽 | `{maxSpan_mm, spreadZ_mm, tubeRadius_mm, *Basis}` |
| | `minWheelbase_mm`,`maxWheelbase_mm` | number | 地板类模块 | P08 覆盖区间 |
| VehicleVariant | `id`,`familyRef`,`powertrain` | string/enum | ✅ | familyRef 必须存在 |
| | `params` | object | ✅ | 键必须是家族声明的 PD-*，值在范围内 |
| | `moduleSelections` | object | ✅ | 键为槽、值为该槽的选项 |
| | `valueBasis` | enum | ✅ | 本轮只允许 DEMO_ASSUMPTION / LOCAL_MEASUREMENT |
| | `claimedValidation` | object | ✅ | 见 §8 |
| | `expected` | object | ✅（作为夹具） | `{verdict, failures[]}`，校验器会核对 |
| | `derivedExpected` | object | 建议 | 派生尺寸预期值，容差 0.15 mm |
| | `scale`/`globalScale`/`meshScale` | — | **禁止出现** | P14 |

---

## 5. 规则表：允许与禁止

16 条规则全部在样例 JSON 的 `rules` 中声明，并由校验器实现。`severity` 本轮一律 `REJECT`。

| 规则 | 名称 | 失败类型 | 判定 |
|---|---|---|---|
| P01 | 文件可解析 | — | 加载失败即报错 |
| P02 | ID 全局唯一 | DUPLICATE_ID | 跨实体/槽/选项/规则/来源统一查重 |
| P03 | 引用闭合 | DANGLING_REF | familyRef、architectureRef、槽/选项归属、interfaceContractRef、sources/measurement id |
| P04 | 参数范围 | RANGE_VIOLATION | min ≤ value ≤ max |
| P05 | 固定硬点不可改 | FIXED_HARDPOINT_OVERRIDE | immutable 硬点不得被变体覆盖 |
| P06 | 动力/接口兼容 | INTERFACE_INCOMPATIBLE | 变体动力形式 ∈ 家族轴；选项动力约束匹配 |
| P07 | 必选槽恰好一个 | MODULE_SELECTION_INVALID | required 槽必须有且只有一个合法选项 |
| P08 | 模块长度覆盖 | MODULE_LENGTH_INSUFFICIENT / DERIVED_DIMENSION_MISMATCH | 纵梁 ≥ 轴距+2×最小悬伸；地板覆盖轴距；派生长度一致 |
| P09 | 运动学可解 | KINEMATIC_UNRESOLVABLE | 摆臂/拉杆跨度 ≤ 模块 maxSpan；整体桥前后轮距不等须给桥壳重生成证据 |
| P10 | 轮罩包络 | ENVELOPE_INTERFERENCE | track/2 + tireWidth/2 ≤ fender.maxHalfWidth |
| P11 | 质量属性不得空声称 | MASS_PROPERTIES_MISSING | 无质心/轴荷时 massProperties 只能 UNVERIFIED，targetLevel ≤ KINEMATIC |
| P12 | 禁止无来源 OEM 数值 | UNSUPPORTED_OEM_CLAIM | SOURCED 必须带 sourceId；本轮变体一律演示/实测 basis |
| P13 | 几何与法规分离 | REGULATORY_CLAIM_UNVERIFIED | 强度/法规只能 UNVERIFIED 或 OUT_OF_SCOPE |
| P14 | 禁止整车全局缩放 | GLOBAL_SCALE_FORBIDDEN | 变体不得携带 scale 类字段 |
| P15 | 架构跨界即换壳 | ARCHITECTURE_CROSSING | 选项 compatibleArchitectures 必须含家族架构 |
| P16 | 判定自洽 | VERDICT_SELF_INCONSISTENT | 自称的几何/运动学结论必须与规则算出的一致 |

**成功标准（重要）**：样例**故意**包含一个非法变体，所以"0 违规"是错误的验收标准。正确标准是：**结构规则（P01/P02/P03/P12）0 违规，且每个变体的实际判定、失败类型集合、派生尺寸都与其 `expected` 夹具完全一致**。非法变体被拒绝是期望输出。这一点在校验器里显式编码，避免总控复跑时误判 FAIL。

---

## 6. 配置解析伪代码（输入 / 输出 / 失败类型）

```text
FUNCTION resolveVariant(family, variant) -> ResolutionResult
  INPUT  family: PlatformFamily（固定硬点、范围、模块槽、接口、规则）
         variant: VehicleVariant（params、moduleSelections、claimedValidation）
  OUTPUT ResolutionResult {
           verdict: LEGAL | ILLEGAL,
           failures: [{rule, failureType, message, remediation}],
           derived: {propshaftLength_mm, lowerArmSpan_mm, tieRodSpan_mm,
                     wheelOuterHalfWidth_mm, railRequired_mm, ...},
           regenerate: [partId...],   # 必须重生成的参数化零件
           reselect:   [slotId...],   # 必须换模块的槽
           recheck:    [category...]  # 需下游运动学/动力学/强度复核的项
         }

  # 阶段 0：结构与来源（失败即终止，不进入几何）
  ASSERT parseable(family, variant)                     ELSE P01
  ASSERT uniqueIds(...)                               ELSE P02 DUPLICATE_ID
  ASSERT refsClosed(...)                              ELSE P03 DANGLING_REF
  ASSERT provenance(...)                              ELSE P12 UNSUPPORTED_OEM_CLAIM

  # 阶段 1：固定量与范围
  FOR each override IN variant.hardpointOverrides:
      IF hardpoint.immutable: FAIL P05 FIXED_HARDPOINT_OVERRIDE
  FOR each (pid, value) IN variant.params:
      IF value OUTSIDE dim[pid].range: FAIL P04 RANGE_VIOLATION

  # 阶段 2：模块选择与兼容
  FOR each required slot:
      IF selection missing OR option unknown OR option not in slot:
          FAIL P07 MODULE_SELECTION_INVALID
  FOR each selected option:
      IF variant.powertrain NOT IN family.powertrainAxis: FAIL P06
      IF option.powertrainConstraint mismatch:            FAIL P06 INTERFACE_INCOMPATIBLE
      IF family.architecture NOT IN option.compatibleArchitectures:
          FAIL P15 ARCHITECTURE_CROSSING      # 车身上部跨界 = 换壳，直接拒绝

  # 阶段 3：派生尺寸（先算，再判能力）
  hubY            <- family.demoRestState.chassisConnY - restLength
  propshaftLength <- params.WB - slot.derivedLength.offset
  railRequired    <- params.WB + 2 * dim.minOverhangPerEnd
  armEnd          <- (params.FT/2 - option.knuckleOffset, hubY + option.lowerEndYOffset)
  lowerArmSpan    <- distance(armEnd, fixedHardpoint.lowerPivot)
  tieRodSpan      <- distance(armEnd3D, rackEnd3D)
  wheelOuterHalf  <- params.FT/2 + params.TW/2

  # 阶段 4：模块能力与包络（拒绝优先于拉伸）
  IF rail.length < railRequired:            FAIL P08 MODULE_LENGTH_INSUFFICIENT
                                            remediation: RESELECT longer rail module
  IF floor.wheelbaseRange not covers WB:    FAIL P08
  IF propshaft.declaredLength != derived:   FAIL P08 DERIVED_DIMENSION_MISMATCH
  IF lowerArmSpan > option.lowerArm.maxSpan: FAIL P09 KINEMATIC_UNRESOLVABLE
                                            remediation: RESELECT arm module; NEVER scale
  IF tieRodSpan > tieOption.maxSpan:        FAIL P09
  IF rearSolidAxle AND FT != RT AND NOT axleHousingRegenerated: FAIL P09
  IF wheelOuterHalf > fender.maxHalfWidth:  FAIL P10 ENVELOPE_INTERFERENCE

  # 阶段 5：验证范围与自洽（防止把几何通过冒充工程通过）
  IF variant has scale field:               FAIL P14 GLOBAL_SCALE_FORBIDDEN
  IF no CG/axleLoads AND massProperties != UNVERIFIED: FAIL P11
  IF no CG/axleLoads AND targetLevel > KINEMATIC:      FAIL P11
  IF strength/regulatory claimed PASS:      FAIL P13 REGULATORY_CLAIM_UNVERIFIED
  IF claimed.geometric != computed.geometric: FAIL P16 VERDICT_SELF_INCONSISTENT
  IF claimed.kinematic != computed.kinematic: FAIL P16

  # 阶段 6：输出
  verdict <- ILLEGAL IF any failure ELSE LEGAL
  regenerate <- propagation edges with action REGENERATE for changed params
  reselect   <- slots whose option capability was exceeded
  recheck    <- ["kinematics", "dynamics", "mass_properties", "strength", "regulatory"]
                # 这些一律标 UNVERIFIED，交由下游任务，不在本阶段判通过
  RETURN ResolutionResult
```

**失败类型共 14 种**（枚举见样例 JSON `failureTypeEnum`），每种的补救动作分三类：`RESELECT_MODULE`（换模块）、`REGENERATE`（重生成参数化零件）、`REJECT_AND_REDESIGN`（超出家族能力，需要新 PlatformFamily）。**没有任何一类是"缩放网格"。**

---

## 7. 样例与实测验证结果

### 7.1 三个变体

| 变体 | 轴距 | 前/后轮距 | 胎宽 | 纵梁 | 地板 | 车壳 | 判定 |
|---|---|---|---|---|---|---|---|
| `VV-A-SWB-STD` 短轴标准轮距 | 2460 | 1680 / 1680 | 235 | RAIL-2860 | FLOOR-STD | BOF-SUV-SHELL | **LEGAL** |
| `VV-B-LWB-WIDE` 长轴宽轮距 | 2660 | 1800 / 1800 | 255 | RAIL-2860 | FLOOR-LONG | BOF-PICKUP-SHELL | **LEGAL** |
| `VV-C-ILLEGAL` 超长轴+超宽轮距+轿车壳 | 2900 | 2200 / 2200 | 255 | RAIL-2860 | FLOOR-STD | UNI-SEDAN-SHELL | **ILLEGAL（7 类冲突）** |

B 的两个参数都**正好落在上限**（轴距 2660 = 2860−2×100；轮距 1800 由摆臂 560 mm 反推），用于证明边界值可通过，且传动轴必须重生成（2320→2520 mm）、地板必须换模块（FLOOR-STD→FLOOR-LONG）。

派生尺寸实测（校验器 `derive` 输出，与 `derivedExpected` 逐项核对，容差 0.15 mm）：

| 派生量 | A | B | C |
|---|---|---|---|
| 传动轴长度 mm | 2320 | 2520 | 2760 |
| 下摆臂跨度 mm | 499.925 | 552.381 | **735.612** |
| 转向拉杆跨度 mm | 515.170 | 569.386 | **756.439** |
| 车轮外缘半宽 mm | 957.5 | 1027.5 | **1227.5** |
| 纵梁需求长度 mm | 2660 | 2860 | **3100**（可用 2860） |

### 7.2 非法变体被拒绝的 7 类冲突（逐条解释）

1. **RANGE_VIOLATION**（P04，3 处）：轴距 2900 > 上限 2660；前/后轮距 2200 > 上限 1800。
2. **MODULE_LENGTH_INSUFFICIENT**（P08，2 处）：纵梁 RAIL-2860 需要 3100 mm 才够（差 240 mm），且轴心会超出梁端 20 mm；地板 FLOOR-STD 只覆盖 2200–2660。**补救**：换 RAIL-3100 + FLOOR-LONG 并重新验证悬伸/断面/包络，或拒绝。
3. **KINEMATIC_UNRESOLVABLE**（P09，2 处）：固定枢轴 FH-05 下，轮距 2200 使下臂跨度达 735.6 mm，超 DWB-STD 上限 560 mm 共 **175.6 mm**；拉杆 756.4 mm 超 600 mm 上限。**现有代码会用 `scale.z` 静默拉伸达标，本规则要求拒绝。**
4. **ENVELOPE_INTERFERENCE**（P10）：车轮外缘半宽 1227.5 mm 超翼子板包络 1050 mm 共 **177.5 mm**。
5. **ARCHITECTURE_CROSSING**（P15）：UNI-SEDAN-SHELL 只兼容 ARCH-UNI，本家族是 ARCH-BOF。承载式轿车壳是结构件，不是覆盖件——**这是"不是换壳"的机器可检表达**。
6. **MASS_PROPERTIES_MISSING**（P11，2 处）：自称 `massProperties=COMPUTED` 且 `targetLevel=DYNAMIC`，但全家族无质心/轴荷/惯量字段（M03 实测 `mass:920` 是单一常量）。
7. **VERDICT_SELF_INCONSISTENT**（P16，2 处）：自称几何与运动学都 PASS，与上述计算结果矛盾。

合计 **13 条拒绝明细、7 个失败类型**，与 `expected.failures` 完全一致（夹具核对 0 失配）。

### 7.3 实际执行的命令与结果

```bash
cd F:/project/cyq/AI_Coding/car

# 1) 派生尺寸（可复算 §7.1 表格）
./.venv/Scripts/python.exe agent-workspace/agents/qwen4/tools/r01_platform_tool.py derive

# 2) 正例：结构规则 + 三个变体判定 + 夹具核对
./.venv/Scripts/python.exe agent-workspace/agents/qwen4/tools/r01_platform_tool.py validate \
  --out agent-workspace/agents/qwen4/reports/R-01-validation-result.json
# → R-01 PLATFORM FAMILY VALIDATION: PASS
#   structuralViolations: 0 / rejectionsOnIllegalVariants: 13 / fixtureMismatches: 0
#   VV-A LEGAL, VV-B LEGAL, VV-C ILLEGAL

# 3) 反例自测：每条规则一个故意破坏的副本
./.venv/Scripts/python.exe agent-workspace/agents/qwen4/tools/r01_platform_tool.py selftest \
  --out agent-workspace/agents/qwen4/reports/R-01-selftest-result.json
# → NEGATIVE CONTROLS: 21 caught / 0 missed / 21 total
#   RULES WITH A NEGATIVE CONTROL: 16/16
#   SELFTEST: PASS
```

环境：项目 `.venv`，Python 3.13.0，脚本零第三方依赖。**反例全部在内存深拷贝中构造，未创建任何临时文件，未写 C 盘。**

21 个反例覆盖：撞号、悬空 familyRef、不存在的模块选项、轴距越界、覆盖固定硬点、ICE 变体选 BEV 模块、必选槽漏选、纵梁过短、地板覆盖不足、摆臂跨度超限、拉杆跨度超限、轮罩干涉、空声称质量属性、空声称 DYNAMIC、无来源 SOURCED、法规判 PASS、携带全局 scale、BOF 家族选轿车壳、自称判定与计算矛盾、夹具预期被篡改，以及加载层解析失败（内存中临时替换加载函数）。

**开发过程中校验器抓到的我自己的真实错误**（证明它不是摆设）：①派生公式声明在**槽**上而我最初从**选项**读，导致传动轴长度根本没算出来——`derive` 输出缺项暴露了它；②最初把"0 违规"当成功标准，而样例故意含非法变体，导致整体误判 FAIL——改为"结构 0 违规 + 夹具全一致"；③拉杆 maxSpan 初值 520 mm 会让**合法**的长轴变体 B（569.4 mm）被误拒，据此把演示上限调整为 600 mm 并记录为 DEMO_ASSUMPTION。

---

## 8. 几何兼容 ≠ 动力/强度/法规满足

`claimedValidation` 强制分成五个互不替代的字段：

| 字段 | 本轮允许值 | 含义 |
|---|---|---|
| `geometricCompatibility` | PASS / FAIL | 范围、模块长度、包络、架构兼容——**可由本校验器判定** |
| `kinematicCompatibility` | PASS / FAIL | 摆臂/拉杆跨度是否可解——**只判"有没有解"，不判运动曲线是否正确** |
| `massProperties` | UNVERIFIED / OUT_OF_SCOPE | 无质心/轴荷/惯量数据，不得声称 COMPUTED |
| `strengthAndDurability` | UNVERIFIED / OUT_OF_SCOPE | 断面/材料/疲劳/刚度未验算 |
| `regulatoryCompliance` | UNVERIFIED / OUT_OF_SCOPE | 碰撞/灯光/排放等法规未验证 |

`targetLevel` 沿用 MASTER_PLAN §4.4 的 VISUAL→GEOMETRY→KINEMATIC→DYNAMIC 阶梯，且 **P11 强制：没有质量属性就不许高于 KINEMATIC**。两个合法变体本轮都只声明 `GEOMETRY`。

**明确不通过的东西**：本提案没有验证任何操稳、强度、碰撞、法规或真实摩擦。把"几何兼容 PASS"读成"工程可行"是本轮最危险的误读，P13/P16 就是为拦这种误读而存在。

---

## 9. 哪些是我们的设计决策，哪些是厂商规范

样例 JSON 的 `designDecisions` 逐条登记，摘要：

| ID | 决策 | 分类 |
|---|---|---|
| D01 | 四层实体 + 变体只改参数与模块选择 | **OUR_DESIGN**（厂商只证明实践存在，未给数据结构） |
| D02 | 固定硬点用相对基准而非世界绝对坐标 | **OUR_DESIGN**（世界 Frame 待 RP-07 裁决） |
| D03 | 摆臂/拉杆超限必须拒绝或换模块，禁止 scale | **ENGINEERING_INFERENCE**（由 M07/M09/M10/M19 实测推出） |
| D04 | 轴距上限 = 纵梁实测长度 − 2×最小悬伸 | **ENGINEERING_INFERENCE**（100 mm 悬伸是演示假设，非法规/厂商要求） |
| D05 | 几何与强度/法规分开编码 | **OUR_DESIGN** |
| D06 | BOF 家族选承载式轿车壳判架构跨界 | **ENGINEERING_INFERENCE**（S4 只证明车架是承载主体） |
| D07 | 沿用 RP-01 已批准的两轴架构与选择组 | **OUR_DESIGN** |

**所有具体毫米数值都是 DEMO_ASSUMPTION 或 LOCAL_MEASUREMENT，没有一个是 OEM 参数。** 唯一标 `OEM_PRACTICE_EVIDENCE` 的是 FH-01"踏板到前轮中心距离属固定基准"这一**原则**，其 900 mm 数值仍是演示假设。

---

## 10. 与其他模型的对齐与冲突

| 对象 | 对齐做法 | 仍存在的冲突/依赖 |
|---|---|---|
| **RP-01（本人，已批准）** | 两轴架构、9 个选择组、零件身份直接复用；每个 ModuleSlot 带 `rp01Ref`（如 MS-FSUSP→`ASSY-20-001`、MS-PROPSHAFT→`ASSY-60-004`），**只引用不复制实体** | 无 |
| **RP-02 / DeepSeek** | 接口只声明**类型**（IC-*），数值全 OPEN，等 `partId/instanceId/MountFrame/Joint` 冻结 | 审核 §3.1 坐标冲突：本文件不声明世界轴；§3.3 身份语义未冻结，`rp01Ref` 暂用字符串 |
| **RP-03 / Grok** | `targetLevel` 沿用其分级阶梯；`kinematicCompatibility` 只判可解性，不判真实性 | 审核 §3.2：`fidelity`/`evidence`/`verification` 三字段命名未统一，本文件用 `valueBasis` + `claimedValidation`，**需 RP-07 归一** |
| **RP-04 / Gemini（已复审 APPROVED）** | FH-04 轮端接口数值仍保持 **OPEN**：RP-04 已把 ISO 273 M14 修正为 fine 15.0 / medium 15.5 / coarse 16.5（与本人 RP-01 的核实一致），隔离复测 6/6 PASS | 该复审明确**未验证**真实配合公差、预紧、轴承构造与整车动力学，零件几何仍为演示假设、生产 Schema 未冻结，故本提案不填入任何接口数值 |
| **RP-07 / GPT-6** | 提供可直接起草 Schema 的字段清单（§4.2）、16 条规则、14 种失败类型、解析伪代码 | 首发基型与 AWD/4WD 范围未决（审核 §3.4）；本家族只是演示候选 |

---

## 11. 来源可达性限制（如实记录）

- 本轮实际抓取成功：S1（VW 2018 年报）、S2（Toyota e-TNGA）、S3（Toyota UK GA-B）、S4（Toyota GA-F）。
- 本轮不可达：S5（toyota.com/vehicles/trucks，JS 空壳）、S6（VW 2025 年报，超时）。
- 未取全文：L1/L2 两篇论文，仅登记线索，`usedForClaim=false`。
- 与 RP-01 一致的普遍限制：ISO/SAE 官方站点大面积 403、PDF 不可解析，**本轮没有任何标准条款原文**。因此所有涉及标准配合/公差/法规的判断一律 OPEN 或 UNVERIFIED，不编造条款号内容。
- 既有研究文档 P1 中"e-TNGA 电池宽度固定""前中后三段模块"两点本轮**未取得逐字原句**，已降级为 OPEN（O06），不作为已核实事实使用。

---

## 12. 未完成 / 有争议（不假定已解决）

1. **世界坐标与局部 Frame 未冻结**（O01）：硬点无法直接转成生产变换矩阵，属 RP-07 的 P0 冲突。
2. **轮端接口数值全 OPEN**（O02）：RP-04 已复审 APPROVED 且 ISO 273 标签已修正，但其几何仍为演示假设、真实配合公差与预紧未验证，生产接口须待 RP-07 冻结，本轮不填 PCD/中心孔/螺栓规格。
3. **三套"真实性"词汇未归一**（O03）：`valueBasis`/`claimedValidation` 需与 RP-02/03/06 对齐。
4. **零件/实例身份语义未冻结**（O04）：`rp01Ref` 暂用字符串，不是正式外键。
5. **首发基型与 AWD/4WD 范围未决**（O05）：本家族是演示候选，不是首发定案。
6. **所有阈值都是演示假设**：100 mm 最小悬伸、560 mm 摆臂上限、600 mm 拉杆上限、1050 mm 翼子板包络**都不是厂商或法规数值**，只用于证明规则可执行。真实上限需要 RP-04 取得几何来源后重定。
7. **整体桥桥壳、半轴/CV 角度、前束外倾曲线**只列为传播边，**没有实现也没有验证**。
8. **本轮未跑任何 CAD/浏览器/物理**：所有代码结论是只读实测 + 算术，不是运行验证。
9. **R-01 归属矛盾已由总控解决**（O07，RESOLVED）：旧任务书第 3 行曾写"建议给 Gemini Flash"，与任务卡 `owner: qwen4` 冲突；任务书已于 2026-11-14 21:06 更新为"负责模型以任务卡为准（当前为 Qwen4）"，AGENTS.md §6 亦明确指派。保留记录以便追溯，不再作为未决项。
10. **脚本与结果 JSON 的存放路径超出任务书字面清单**，已在 §1 作边界声明，待总控确认。

---

## 13. 验收条件对照

| 任务书验收条件 | 落点 | 状态 |
|---|---|---|
| 总控能据报告起草 `PlatformFamily`/`VehicleVariant` Schema，无明显歧义 | §4.1 实体关系 + §4.2 字段清单（类型/必填/约束）+ 样例 JSON | ✅ |
| 至少一个反例能被所述规则拒绝，且解释具体冲突 | §7.2 非法变体 7 类冲突逐条解释；13 条拒绝明细可复跑 | ✅ |
| 明确哪些是我们的设计决策而非厂商官方规范 | §9 + 样例 `designDecisions`（7 条分类） | ✅ |
| 所有结论有可检查文件/图/伪代码，不只有文字概述 | 样例 JSON（传播图/规则/来源/实测）+ §6 伪代码 + 校验器 + 两份结果 JSON | ✅ |
| 3 个官方/技术论文来源以上，标原话出处/网页/访问日期与分级 | §3.1：本轮实际抓取 4 个官方来源，逐字原话 + 2026-11-14 + EVIDENCE/UNKNOWN | ✅ |
| 同家族短轴/长轴两个合法变体 + 一个明确非法变体，数值标假设/演示 | §7.1；所有数值 DEMO_ASSUMPTION / LOCAL_MEASUREMENT | ✅ |
| JSON Schema 字段清单 + 至少 8 条可自动测试断言 | §4.2 + §5：**16 条**，全部可自动执行，16/16 有反例 | ✅ |
| 区分几何兼容与动力/强度/法规，后者不得未经验证擅自通过 | §8 + P11/P13/P16 | ✅ |

---

## 14. 下一步建议（只提两项）

1. **请总控把本提案的规则与 RP-07 的最小 Schema 合并裁决，并优先冻结世界 Frame**：本文件的固定硬点是相对规则，一旦 Frame 冻结即可无歧义转成变换矩阵；否则 §4.2 的字段清单无法进入生产。同时请裁决 `valueBasis`/`claimedValidation` 与 RP-02/03/06 的 `fidelity`/`evidence`/`verification` 如何归一（审核 §3.2），避免四套词汇并存。
2. **请把"轮距变型必须拒绝或换模块"作为轮端纵切样板的验收条件之一**：现有代码的 `scale.z` 静默拉伸（M10）是**已发生**的问题，不是假设风险。建议样板任务显式要求：改轮距时要么换摆臂模块、要么被拒绝，并附跨度计算证据；同时把本提案的 P09/P10/P14 三条规则纳入样板的自动测试。**在几何来源取得前不要批量生成变体**，否则会把无依据的拉伸固化成资产。