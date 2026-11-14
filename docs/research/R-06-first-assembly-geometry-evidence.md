# R-06｜为首个轮端—悬架样板建立可信的零件与几何依据

- 任务：`R-06`（看板 `03.08`）｜执行：Qwen4｜日期：2026-11-14｜状态：**SUBMITTED，待总控审核**
- 任务书：[`docs/tasks/R-06-first-assembly-geometry-evidence.md`](../tasks/R-06-first-assembly-geometry-evidence.md)
- 前序已批准：`RP-01` 整车零件树、`R-01` 平台变型规则
- 性质：**证据研究与最小 BOM 提案**。不冻结全局 `PartSpec`/`Frame`/`Joint`，不替 Gemini 做 CAD、不替 Grok 做运动学。

---

## 0. 一句话结果

为首个"左前单角轮端—双叉臂"样板建立了 **60 项 BOM（49 项机构必需）+ 30 类参数证据需求 + 12 个连接界面**，并逐条标注来源等级。结论必须如实说：**20 个关键参数里只有 3 个拿到（二手）来源，17 个仍是 UNKNOWN；12 个连接界面全部标记为阻塞下游**。本轮真正的产出不是"查到了尺寸"，而是**一张让下游无法凭想象建模的需求单**——哪些能建、哪些绝不能建、缺什么证据、缺了会怎样，全部机器可检。

**给非程序员的解释**：以前我们说"造一个真实的轮端"，但每个螺丝、球铰、轴承的尺寸其实都没出处。这次我把第一个样板需要的零件一个个列清楚，然后对每个尺寸问一句"这个数从哪来"。结果是：大部分尺寸**查不到可靠公开出处**，我就把它们明确留空并写上"这里不许猜"。同时我写了个检查程序，专门拦三种危险行为：把演示数字偷偷填进关键连接、把卡车零件装到轿车上、拿许可证不明的资料当几何依据。我故意造了 22 种违规去试它，22 种全被抓住。

---

## 1. 交付清单与边界

| 路径 | 内容 |
|---|---|
| [`docs/research/R-06-first-assembly-geometry-evidence.md`](R-06-first-assembly-geometry-evidence.md) | 本报告 |
| [`docs/research/R-06-minimal-assembly-bom.json`](R-06-minimal-assembly-bom.json) | 机器可读 BOM：60 项 + 8 个总成组 + 30 类参数需求 + 12 个界面 + 22 条来源 + 4 个冲突案例 + 2 个示例 |
| [`agent-workspace/agents/qwen4/tools/r06_bom_tool.py`](../../agent-workspace/agents/qwen4/tools/r06_bom_tool.py) | 校验器（仅标准库，13 条规则，`summary`/`validate`/`selftest`） |
| [`agent-workspace/agents/qwen4/reports/R-06-validation-result.json`](../../agent-workspace/agents/qwen4/reports/R-06-validation-result.json) | 正例结果 |
| [`agent-workspace/agents/qwen4/reports/R-06-selftest-result.json`](../../agent-workspace/agents/qwen4/reports/R-06-selftest-result.json) | 反例结果（22 条逐项 CAUGHT） |
| [`agent-workspace/agents/qwen4/reports/R-06.md`](../../agent-workspace/agents/qwen4/reports/R-06.md) | 个人回报 |
| `agent-workspace/agents/qwen4/tasks/R-06.md` + `R-06-S01..S06.md` | 任务卡 |

**边界遵守**：只写 `docs/research/R-06-*` 与本人 `tasks/`、`reports/`、`tools/`。**未改 `src/` 一行、未改其他模型目录、未改共享 Schema 与 `MASTER_PLAN.md`**。未抓取未授权 OEM 图纸或付费标准全文；未下载大量 STEP。一次尝试把 NSK 目录 PDF 下载到工作区外被权限策略拦截，**我没有绕过**，改为如实标注该来源正文不可得（见 §3.3 N04）。

---

## 2. 样板范围裁定

| 决定 | 选择 | 理由 |
|---|---|---|
| 范围 | **左前单角（FL）** | 单角即可闭合"转向节—上下摆臂—球铰—弹簧减振器—轮毂轴承—车轮—制动盘/卡钳—拉杆"的机械链；两角会引入稳定杆等跨角约束，超出首个样板 |
| 悬架拓扑 | 双叉臂 | 任务书指定；RP-01 `ASSY-20-001` 已批准身份 |
| 轮毂轴承 | **Gen1**（双列角接触球轴承 + 独立轮毂法兰） | Gen1 的外形尺寸可由公开目录代号获得（d/D/B）；Gen3 双法兰几何高度车型专属、本轮几乎全 UNKNOWN。Gen3 保留为后续变体 |
| 制动 | 浮动卡钳 + 通风盘 | Brembo 官方说明明确区分固定式 type A 与浮动式 type B（来源 R07），浮动式零件更少、界面更清楚 |
| 驱动轮 | **CONDITIONAL（未定）** | 是否驱动轮属 R-01 变体决策；半轴外端 CV 关节 `BOM-60-021` 与界面 `IF-12` 标条件适用，不擅自定案 |
| 车辆类别 | **PASSENGER** | 商用车零件不得混入（见冲突案例 CC-02） |

**机构必需 vs 视觉可选 vs 延期**（60 项 = 49 + 11）：

- **机构必需 49 项**：转向节、上下摆臂本体/衬套/球铰/防尘罩/卡簧/枢轴螺栓、球铰→转向节紧固件、弹簧与上下座、减振器筒身/活塞杆/油封/导向座/防尘罩/缓冲块/上支座/锁紧螺母、Gen1 轴承总成、轮毂法兰/锁紧螺母/轴头卡簧/车轮螺柱、轮辋、轮胎总成、车轮螺栓螺母、制动盘/定位螺钉、卡钳体/活塞/矩形密封/导向销/安装螺栓/摩擦片/支架/支架螺栓、内外拉杆/锁紧螺母/卡簧槽顶螺母、半轴外端 CV（条件）。
- **功能必需但延期 2 项**：轮速传感器安装支架、ABS 磁性编码环——属电子功能，不影响本轮机械运动链，且气隙/孔位无来源。
- **视觉可选 4 项**：外倾调整垫片、气门嘴、平衡块、中心盖、轴头防尘盖（首轮用固定硬点，不影响机构可解性）。
- **超出范围延期 5 项**：减振器活塞阀片组（动力学）、消音片（NVH）、防响夹/固定销/弹簧（尺寸无来源）、横向稳定杆（需左右两角联动）。

**总成边界**：轴承与轮胎标 `PURCHASED_NON_SERVICEABLE`（外购不可拆），**首轮只建外形包络，不建内部滚道/球/保持架/帘布层**。制动盘身份归 SYS-40、装配位置在轮端，沿用 RP-01 的 REF 规则不复制实体。

---

## 3. 六个核心问题的回答

### 3.1 Q1：最小 BOM 与安装关系

见 §2 与 JSON 的 `bom`/`assemblyGroups`/`interfaces`。每项带 `rp01Ref` 指向**已批准的 RP-01 节点**，校验器 B03 会逐个核对这些 ID 真实存在于 RP-01 树中——**不新建第二套零件身份**。12 个连接界面覆盖：轴承外圈压入转向节、轮毂法兰↔轮辋（螺栓+定心）、螺柱↔螺母座型、上下球铰锥柄↔转向节、上下摆臂衬套枢轴、减振器下安装眼、制动盘↔轮毂、卡钳支架↔转向节、外拉杆端↔转向节、CV 花键↔轮毂（条件）。

### 3.2 Q2：每类参数需要哪种证据（最小验证需求）

完整 30 类在 JSON 的 `parameterRequirements`，每类含 `evidenceNeeded` / `minimumVerification` / `blockingDownstream` / `referencePoint`。摘要：

| 参数类 | 可接受证据 | 最小验证需求 | 本轮状态 |
|---|---|---|---|
| 轮胎断面宽/扁平比/轮辋直径 | 厂商产品页或 ISO 4000-1 尺寸表 | 选定标记后即可算术推导包络 | DEMO_ASSUMPTION（演示规格，虚构品牌） |
| 轮胎名义外径 | 由上三项算术推导 | 406.4 + 2×112.75 = 631.9 mm | ENGINEERING_INFERENCE |
| 轮辋宽度/法兰轮廓 | 轮辋厂商规格 + ISO 4000-2 轮廓条款 | 6.5J 为演示选择，J 轮廓条款 UNKNOWN | DEMO_ASSUMPTION |
| **PCD / 中心孔 / ET** | 车轮或轮毂厂商**尺寸图（带图号/版本）** | 三者必须与轮毂法兰双向一致，否则车轮装不上 | **UNKNOWN（critical）** |
| **车轮螺栓螺纹与座型** | 乘用车紧固件规范 | 座型必须与轮辋座面一致；不得用商用车家族 | **UNKNOWN（critical）** |
| 轴承 d / D / B | 制造商目录尺寸表（优先） | 名义值不足以定配合 | **SOURCED_SECONDARY 42/80/42** |
| 轴承内部几何 | 制造商内部结构图或授权 CAD | 首轮不建模内部 | UNKNOWN |
| **轴承配合公差** | ISO 286/492 条款或制造商配合推荐 | 缺此值不得声称压装正确 | **UNKNOWN（critical）** |
| **轮毂法兰几何** | 轮毂厂商尺寸图 | 必须与 PCD/CB/ET 一致 | **UNKNOWN（critical）** |
| **球铰锥度/螺纹/安装高度** | 球铰厂商目录尺寸图 | 锥度不一致则无法紧固；球心是运动学硬点 | **UNKNOWN（critical）** |
| **上下摆臂中心距/衬套** | 摆臂厂商尺寸图或车型硬点表 | 缺此值运动学不可解 | **UNKNOWN（critical）** |
| **转向节硬点几何** | 转向节厂商尺寸图或车型硬点表 | 整个样板的几何锚 | **UNKNOWN（critical）** |
| **减振器行程/安装长度** | 减振器厂商目录（part number 对应） | 行程必须覆盖跳动包络 | **UNKNOWN（critical）** |
| 弹簧刚度/自由长 | 弹簧厂商目录 | 可演示假设，但不得声称动力学真实 | UNKNOWN |
| **制动盘径/厚/帽高** | 制动盘厂商目录尺寸图 | 盘径必须与卡钳桥跨距匹配 | **UNKNOWN（critical）** |
| **卡钳活塞径/桥跨距/孔距** | 卡钳厂商目录尺寸图 | 缺此值无法装配 | **UNKNOWN（critical）** |
| 摩擦片轮廓/厚度 | 摩擦片厂商目录（含轮廓图号） | 可演示假设，不得声称制动性能 | UNKNOWN |
| **内外拉杆长度/螺纹/锥度** | 转向器/拉杆厂商目录 | 决定前束与转向几何 | **UNKNOWN（critical）** |
| **CV 关节包络/行程/花键** | CV 厂商目录尺寸图 | 必须覆盖跳动时角度与长度变化 | **UNKNOWN（critical，条件适用）** |
| **紧固件等级/扭矩/预紧** | ISO 898-1 条款 + 车型拧紧规范 | 缺此值不得声称连接强度可靠 | **UNKNOWN（critical）** |
| **轮罩干涉包络** | 车身轮罩曲面或车型包络规范 | 必须覆盖跳动+转向全工况 | **UNKNOWN（critical）** |
| 摆臂衬套尺寸/刚度 | 衬套厂商目录 | 外形可演示，刚度不得声称真实 | UNKNOWN |

**关键立场**：`critical=true` 的参数**只允许由 SOURCED / SOURCED_SECONDARY 填值**，否则必须 `null + UNKNOWN`。这条由校验器 B05 强制执行，反例已证明它会拒绝"把代码兜底常量 114.3 填进 PCD"。

### 3.3 Q3：来源策略与本轮实际取得什么

策略优先级：**制造商官方目录/尺寸图 > 权威标准条款 > 官方技术页 > 公开工程资料 > 分销商目录（二手）> 检索摘要（不采信）**。每条来源在 JSON 中带 `url`/`accessedAt`/`retrieval`/`grade`/`license`/`usedForClaim`/`usedForGeometry`/`supports`/`doesNotSupport`。

**本轮实际抓取成功（3 条）**：

| ID | 来源 | 取得什么 | **不能支持什么** |
|---|---|---|---|
| N01 | [NSK — Bearing Designations（官方 HTML）](https://www.nsk.com/tools-resources/abc-bearings/bearing-designations/) | 逐字："indicates its type, boundary dimensions, dimensional and running accuracies, internal clearance, and other specifications"；"dimensions are specified with one or two digits indicating width/height and diameter" | 页面**未提及 DAC 系列或汽车轮毂轴承**，无任何数值表；不能据此断定 DAC42800042 的具体尺寸或内部几何 |
| N02 | [123bearing — DAC42800042（分销商）](https://www.123bearing.com/bearing-housing/deep-groove-bearing/single-row/dac42800042) | 逐字："42x80x42 mm"；类型标签 "Deep groove ball bearing" / "SINGLE ROW" | **类型分类与制造商口径冲突（CC-01）**；无密封/保持架/球数/接触角/载荷/公差数据 |
| N05 | [OZ Racing — The wheels / Measurement and Details（官方）](https://www.ozracing.com/world-of-oz/technology/the-wheel) | ET/PCD/中心孔/轮辋宽度的**定义与测量参考面**逐字原文；直径英寸、其余 mm | **只给定义，不给任何具体数值装配参数**；不得据此声称任何车轮的配合尺寸 |

**本轮不可达 / 不采信（4 条，如实记录）**：

| ID | 来源 | 结果 |
|---|---|---|
| N04 | [NSK HUB I 官方目录 e4803a.pdf](https://www.nsk.com/content/dam/nsk/common/catalogs/ctrgPdf/automotive/e4803a.pdf) | PDF 为 FlateDecode 压缩流，网页抓取无法解析；下载到工作区外被权限策略拦截，**未绕过**。这是**最有价值的待取来源**（可裁决 CC-01） |
| N03 | [Remlagret — DAC42800042](https://www.remlagret.se/en/products/dac42800042-pti-hjullager-42x80x42) | HTTP 429，仅检索摘要可见 d42/D80/B42 与 double-row angular contact；`usedForClaim=false` |
| N06 | [Bridgestone AU — Understanding tyre sizes](https://www.bridgestone.com.au/learn/understanding-tyre-sizes) | HTTP 403；摘要不作为已核实事实 |
| N07 | [BCcampus — Tire Sizes and Calculations](https://pressbooks.bccampus.ca/tradeskillsforsuccessnumeracy/chapter/tire-sizes-and-calculations/) | HTTP 403；本文件轮胎算例改由代码实测公式 M02 独立支持 |

**复用 RP-01 已登记来源（9 条，标 REUSED_FROM_RP01_NOT_REFETCHED）**：SKF 轮毂轴承 HBU1/2/3 拓扑（R05）、NTN GEN1/2/3（R06）、Brembo 卡钳类型与摩擦片硬件（R07）、Bosch 轮速传感器（R10）、Michelin 轮胎分层命名（R15）、KYB 防尘罩/缓冲块可更换（R03）、ISO 4000-1:2024 与 ISO 15:2017 的 SIS 记录（R19/R22，**仅标题与范围，无条款原文**）、Alcoa 螺母（N08，**商用车，本轮不适用**）。

**本地实测（6 条 M01–M06）**：演示轮胎规格表、轮胎几何推导公式、车轮安装尺寸兜底常量、悬架硬点与拉伸行为、RP-04 演示参数、RP-01 几何缺口清单。全部带 `file:line`。

> **诚实结论**：本轮**没有取得任何标准条款原文，也没有取得任何制造商尺寸图**。唯一进入 BOM 的数值证据是轴承外形 42/80/42（二手分销商，且类型分类有冲突）。这不是失败——把"查不到"如实标成 UNKNOWN 并阻塞下游，正是任务书要求的成功样子。

### 3.4 Q4：结构化记录方式

每个参数记录：`name / unit / value / grade / sourceId / referencePoint / evidenceNeeded / minimumVerification / demoNote / blockingDownstream / applicability`。要点：

- **单位**：工程侧一律 mm；轮辋直径按行业惯例用 inch 但**必须同时给 mm 换算**（B06 强制）；进入浏览器前显式 ÷1000。
- **公差**：**只有拿到证据才填**。本轮全部公差字段为 UNKNOWN，不用"看起来合理"的数值填满。
- **坐标参考点**：每个参数必须声明 `referencePoint`（B11 强制）。局部 Frame 建议见 JSON `framePolicy.localFrameSuggestion`：轮端原点=轴承外圈与转向节配合面中心、Z=车轮旋转轴指向车外；转向节原点=下球铰中心、Z=主销轴线；摆臂原点=枢轴连线中点；减振器原点=下安装点。
- **世界 Frame 不冻结**：`worldFrame = UNFROZEN_PENDING_RP07`，B11 会拒绝任何 `worldAbsolute=true` 或擅自冻结世界系的改动。左右件用**镜像标志**而非负缩放。
- **适用边界**：`applicability` 标条件适用（如 CV 关节仅驱动轮）；`scope.vehicleClass=PASSENGER` 由 B07 强制，防止商用车零件混入。

### 3.5 Q5：冲突如何发出可理解的错误（4 个真实案例）

| ID | 类型 | 真实冲突 | 处理 |
|---|---|---|---|
| **CC-01** | CATALOG_TOPOLOGY_MISMATCH | 同一代号 DAC42800042：123bearing 标**单列深沟球**，NSK HUB I 目录口径为**双列角接触(BWD)/双列圆锥滚子**，另一分销商摘要称双列角接触。外形 42×80×42 各方一致，**列数与接触类型不一致** | 外形可用（二手），内部几何一律 UNKNOWN；首轮按外购不可拆只建包络。错误消息指明冲突在哪两个来源之间 |
| **CC-02** | MIXED_VEHICLE_PART | 唯一可引用的车轮紧固件来源 Alcoa 描述的是 **1.5 英寸球面座螺母与 33MM 两片式法兰螺母**，属商用车 hub-piloted/stud-piloted 体系 | PR-10 保持 UNKNOWN，**不得用 N08 填值**；B07 会拒绝乘用车样板引用商用车来源 |
| **CC-03** | INTERFACE_DIMENSION_CONFLICT | `src/specs.js:231-232` 兜底常量 PCD **114.3** / CB **67.1**；同文件 touring 规格 rimStyle 为 PCD **112.0** / CB **66.6** / ET **42**。RP-04 的 `params.json` 用 114.3/67.1，**与代码兜底常量同源而非目录来源** | PR-06/07/08 全 UNKNOWN；明确记录两套常量都不是来源数据，禁止任选其一当事实 |
| **CC-04** | CRITICAL_PARAM_FILLED_BY_DEMO | 演示轮胎品牌/型号为 **'AURA QUIET CRUISE'、'VULCAN APEX SPORT'**，是虚构产品；标记 205/55 R16 本身是行业通用记法 | 标记类参数标 DEMO_ASSUMPTION 并注明虚构品牌；外径算术标 ENGINEERING_INFERENCE，且明确**不是实测滚动半径** |

每个案例都带 `errorToEmit`（可直接给下游看的错误文案）与 `mustRemainUnknown`（机器可检：这些参数必须保持 UNKNOWN）。校验器 B09 会拒绝"冲突已记录但参数又被填值"的情况。

**12 类错误类型**（JSON `errorTypeEnum`）：关键参数被演示值填满、UNKNOWN 却带值、SOURCED 无来源、目录与拓扑不匹配、界面尺寸冲突、车型混配、许可证不明、单位/Frame 不一致、擅自冻结世界系、界面阻塞未声明、悬空引用、延期无理由。

### 3.6 Q6：代表性可验证示例（供 Gemini/Grok）

**EX-01 轮胎名义包络**（可复算）：输入 205 mm / 55% / 16 in → 胎侧 112.75 mm、轮辋半径 203.2 mm、外半径 315.95 mm、**外径 631.9 mm**。与 `src/specs.js:222-224` 公式一致（M02 实测）。等级 ENGINEERING_INFERENCE，输入等级 DEMO_ASSUMPTION。**限制**：名义几何，不含载荷下沉、高速生长、公差与实际滚动半径，不得用于动力学验收。

**EX-02 轴承外形包络 + 明确未知**：输入 DAC42800042 / d42 / D80 / B42 → 期望 bore 42、OD 80、width 42、**internalGeometry = null、fitTolerance = null**。`mustNotInfer` 明列禁止推断项：球数、接触角、保持架形状、滚道曲率、预紧力、压装过盈量。校验器 B13 会拒绝任何把内部几何填上的改动。

---

## 4. 关键未知项清单（17 个 critical UNKNOWN，逐条阻塞谁）

| 参数 | 阻塞的下游动作 |
|---|---|
| PR-06 PCD / PR-07 CB / PR-08 ET / PR-16 轮毂法兰 | Gemini 不得生成车轮/轮毂螺栓孔、中心孔、导向凸台与安装面；Grok 不得固定轮心横向位置或算主销偏距 |
| PR-10 螺栓螺纹与座型 | Gemini 不得生成螺栓/螺母与座面 |
| PR-15 轴承配合公差 | Gemini 不得生成过盈/间隙配合，不得声称装配已验证 |
| PR-17 球铰锥度 | Gemini 不得生成锥柄；Grok 不得固定球心硬点 |
| PR-18 / PR-19 摆臂中心距 | Grok 不得求解上下摆臂约束；Gemini 不得定臂长 |
| PR-20 转向节硬点 | Gemini 不得生成转向节；Grok 只能用**明确标注虚构**的硬点做隔离原型 |
| PR-21 减振器行程/长度 | Grok 不得设行程限位；Gemini 不得定筒身/杆长 |
| PR-23 / PR-24 制动盘与卡钳 | Gemini 不得生成盘/卡钳相对位置与支架 |
| PR-26 拉杆 | Grok 不得求解转向约束；Gemini 不得定拉杆长 |
| PR-27 CV 关节 | Gemini 不得生成半轴（且驱动形式未定） |
| PR-28 紧固件等级/扭矩 | 可画演示外形，但**不得标注等级/扭矩为已验证** |
| PR-29 轮罩包络 | Gemini/Grok 不得声称无干涉 |

**12 个连接界面全部 `blockedDownstream=true`**，由 B10 强制：只要依赖参数为 UNKNOWN，界面就必须显式声明阻塞，否则下游会"默默建出一个未验证的连接"。

---

## 5. 本地实测发现（只读，未改代码）

1. **`src/specs.js:228-232` 的兜底常量**：轮辋宽度缺省 = `(width/25.4)×0.82`、ET 缺省 35、PCD 缺省 114.3、CB 缺省 67.1。**0.82 这个比例是演示假设，不是标准**；这些常量不是来源数据。
2. **同文件 touring 规格自带不同数值**（`:83-98`）：widthInch 6.5、contour 'J'、etMm 42、bolts 5、pcdMm **112.0**、centerBoreMm **66.6**。与兜底常量矛盾（CC-03）。
3. **轮胎品牌/型号是虚构的**（'AURA'/'VULCAN'），但 `deriveDimensions`（`:219-226`）已正确实现标准标记算术——**公式可用，产品身份不可当真实**。
4. **悬架硬点写死 + 摆臂 scale 拉伸**（`chassis.js:294-296, 61-75, 433-440`）：R-01 已量化（轮距 1680→2200 mm 时下臂跨度 +47.1%）。**这些硬点不得作为 Grok 的真实输入**。
5. **RP-04 演示参数与代码兜底常量同源**：`params.json` 的 PCD 114.3 / CB 67.1 并非目录来源。RP-04 复审已 APPROVED，但明确零件几何仍为演示假设、未验证真实配合公差/预紧/轴承构造。
6. **RP-01 缺口基线**：493 零件中 SOURCED=0；SYS-30 有 31 项、SYS-20 有 88 项缺几何依据。

---

## 6. 风险

1. **最大风险：下游把 UNKNOWN 当"可以随便填"**。已用 B05/B09/B10 三道机器检查拦截，但**工具只能拦结构，拦不住人绕过工具**。建议总控把"critical 参数不得用演示值"写进 R-08/R-09 的验收条件。
2. **轴承类型分类冲突未裁决**（CC-01）：若按分销商标签建内部结构，会得到力学错误的零件。需 NSK/NTN 官方正文。
3. **二手来源风险**：42/80/42 来自分销商而非制造商，且 B 的口径（内圈宽/外圈宽/总宽）未确认。
4. **许可证风险**：本轮用于几何的来源仅 N02（公开网页引用）与 M02（项目自有代码）。任何厂商尺寸图/PDF 的复用许可需逐条确认，B08 会拒绝许可证不明却用于几何的来源。
5. **标准全文缺失**：所有公差/等级/扭矩判断一律 UNKNOWN，不得用自写公式冒充标准（RP-04 返工教训）。
6. **单角样板的局限**：稳定杆、左右镜像、后悬架、整车包络均未覆盖；不能由单角通过推断整车通过。

---

## 7. 下游工作指导

- **Gemini（R-08 资产/CAD）**：可以立即建模的只有 **EX-01 轮胎名义包络**、**EX-02 轴承外形包络**，以及明确标 DEMO_ASSUMPTION 的演示外形。**12 个界面全部阻塞**，不得生成配合面/螺栓孔/锥柄/卡钳相对位置并声称装配正确。建议把"包络级资产"与"配合级资产"分成两个里程碑，前者可现在做，后者等尺寸证据。
- **Grok（R-09 运动学）**：PR-17/18/19/20/21/26 全 UNKNOWN，真实硬点不可得。可继续 R-04 已批准的做法——用**明确标注虚构**的硬点做隔离约束求解原型；但不得声称本样板运动学已验证，**禁止沿用 `src/` 的写死枢轴与 scale 拉伸**。
- **DeepSeek（R-07 字段兼容）**：本文件提供 BOM 字段与装配身份需求建议：`necessity` / `assemblyBoundary` / `params[].grade` / `interfaces[].blockedDownstream` / `applicability` / `mustRemainUnknown`。请映射到 PartDefinition/PartInstance/Joint 草案，**不要由本文件冻结全局 Schema**。
- **总控（RP-07）**：需裁决 ①世界 Frame 与局部 Frame 变换；②PCD/CB/ET 的权威来源策略（是否投入取得厂商尺寸图）；③是否接受"**首轮只建包络、内部与配合全 UNKNOWN**"作为样板验收口径；④是否允许在工作区内保存一份 NSK 目录 PDF 以裁决 CC-01。

---

## 8. 验证情况（实际执行）

```bash
cd F:/project/cyq/AI_Coding/car
./.venv/Scripts/python.exe agent-workspace/agents/qwen4/tools/r06_bom_tool.py summary
./.venv/Scripts/python.exe agent-workspace/agents/qwen4/tools/r06_bom_tool.py validate --out agent-workspace/agents/qwen4/reports/R-06-validation-result.json
./.venv/Scripts/python.exe agent-workspace/agents/qwen4/tools/r06_bom_tool.py selftest --out agent-workspace/agents/qwen4/reports/R-06-selftest-result.json
```

- `validate` → **PASS，0 违规**。指标：60 BOM 项（49 机构必需 / 11 延期或可选）、30 类参数需求（UNKNOWN 21 / DEMO_ASSUMPTION 5 / SOURCED_SECONDARY 3 / ENGINEERING_INFERENCE 1）、**20 个 critical 参数中仅 3 个有来源、17 个 UNKNOWN**、12 个界面全部阻塞、22 条来源（本轮抓取成功 3 / 不可达 4）、4 个冲突案例、2 个示例。
- `selftest` → **PASS，22 caught / 0 missed / 22 total，13/13 规则都有反例**。覆盖：关键 PCD 被演示常量填满、UNKNOWN 带值、SOURCED 丢来源、用摘要来源填值、演示值无说明、商用车螺母用于乘用车、许可证不明却用于几何、冲突参数被填值、界面未声明阻塞、硬点写世界绝对坐标、擅自冻结世界系、延期无理由、必需件数量 0、必需件无参数无说明、英寸无 mm 换算、悬空父引用、rp01Ref 不在已批准树中、撞号、轮胎算例被改、轴承示例虚构内部几何、参数无参考点，以及加载层解析失败。
- **校验器抓到过我自己 2 个真实错误**：两个"功能必需但延期"件（轮速传感器支架、ABS 编码环）写了 `qtyPerCorner=1`，与"本轮不计入"矛盾——已改为 0 并加 `qtyWhenIncluded` 保留未来数量。
- 环境：项目 `.venv`，Python 3.13.0，零第三方依赖。反例全部在内存深拷贝中构造，**未创建临时文件、未写 C 盘**。
- **PASS 的含义**：BOM 结构与证据纪律自洽、关键未知项被如实保留。**不代表任何尺寸已工程验证**。

---

## 9. 未完成 / 有争议

1. **NSK HUB I 官方目录正文未取得**（PDF 不可解析 + 工作区外下载被拦截）→ CC-01 无法裁决。
2. **12 个连接界面全部缺关键尺寸** → 首轮不能声称机械装配正确。
3. **世界 Frame 未冻结** → 局部 Frame 建议无法转成生产变换。
4. **驱动形式未定** → CV 关节与 IF-12 适用性待定。
5. **轮胎标记约定的官方来源本轮 403** → 约定标 ENGINEERING_INFERENCE 而非 SOURCED。
6. **所有标准仅核实标题/范围，无条款原文** → 公差/等级/扭矩一律 UNKNOWN。
7. **轴承 B 的口径未确认**（内圈宽/外圈宽/总宽），需官方正文。
8. **本轮未跑任何 CAD/浏览器/物理**：所有代码结论是只读实测 + 可复算算术。
9. **脚本与结果 JSON 放本人 `tools/`、`reports/`**：任务书允许本人授权目录，已在此声明；未扩大共享代码改动。

---

## 10. 下一步建议（只提两项）

1. **请总控裁决"包络级 vs 配合级"两个里程碑，并优先解决轴承类型冲突**：接受首轮只建包络（EX-01/EX-02 可立即交付 Gemini），把配合级资产挂起等尺寸证据；同时决定是否允许在工作区内保存一份 NSK/NTN 官方目录正文以裁决 CC-01——这是**单个动作就能解锁最多下游工作**的一项。
2. **请把"critical 参数不得用演示值填"写进 R-08/R-09 的验收条件，并投入取得车轮/轮毂/转向节的厂商尺寸图**：PCD/CB/ET/球铰锥度/转向节硬点这 5 类是**整个纵切样板的几何锚**，缺了它们 Gemini 与 Grok 都只能做虚构原型。建议优先取得**一份**完整的转向节+轮毂尺寸图，而不是零散凑 493 件。