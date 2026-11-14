# RP-05｜整车计划的独立遗漏审计与风险清单（HY4）

> 版本：v1.1 / 2026-11-14 · 负责人：HY4 · 状态：**SUBMITTED（待总控 GPT-6 审核）**
> 审计快照：`2026-11-14 16:36:56 +0800`。关联 `MASTER_PLAN.md`、`PLANNING_PROGRAM.md`、`VEHICLE_SYSTEM_TREE_SEED.md`、`GAP_REGISTER.md`、第一波 RP-01/02/03/04/06 报告与证据、旧 R-xx 说明。
> 证据文件：`docs/planning/evidence/RP-05-dependency-baseline.json`、`RP-05-gap-verdicts.json`、`RP-05-risk-matrix.json`。
> **本文只审计、不设计替代方案，不修改共享总计划、系统树种子、缺口登记簿或任何其他模型的报告。**

---

## 0. 给非程序员的结论

其他模型交上来的规划，单独看每一份都挺扎实：产品树拆到了零件、接口图画出了 42 个节点和 86 条连线、物理探针跑了 16 项反例、CAD 流水线真的产出了一个多零件 GLB。

但把它们**并排放在一起**看，会发现几个会让后期返工的问题：四份文件对"车头朝哪个方向"给了四种说法，却没有一份写出坐标怎么换算；对"这个模型算不算真实"给了至少五套互相冲突的标签；总计划说要支持四驱，唯一的接口图只画了前驱，而现有代码里其实已经有一套没有定义的"前 40%/后 60%"动力分配；还有一份报告在验收标准里要求输出质量和惯性矩，可它自己生成的两个样例文件里都没有这两个字段。

**结论不是"大家做得不好"，而是"每份都对，合起来不成立"。** 本报告把这些跨文件的不一致逐条找出来、给出处、给最小修复任务，并明确哪些是真的遗漏、哪些其实已经覆盖、哪些本阶段不必做。

---

## 1. 审计路线与输入漂移（重要）

### 1.1 前置条件在审计期间发生了变化

任务书 (`docs/tasks/RP-05-independent-gap-audit.md:8`) 与 `PLANNING_PROGRAM.md:68` 的 G-PL1 都要求 RP-05 等第一波报告齐备后执行。领取任务时我核实到：**只有 RP-06 一份报告归档**，RP-01/02/03/04 报告与证据均不存在。

因此没有采用"假装输入齐全写一份整车总评"的路线，也没有整单停摆，而是先对可证的一手输入做审计，并持续复查输入状态。结果输入在 19 分钟内快速变化：

| 快照 | 已归档报告 | evidence 文件数 |
|---|---|---|
| 16:17:42 | RP-06 | 7 |
| 16:32:18 | RP-02 / RP-03 / RP-04 / RP-06 | 12 |
| **16:36:56（最终）** | **RP-02 / RP-03 / RP-04 / RP-06** | **16** |

RP-03 任务卡在此期间从 `ready` → `in_progress` → `submitted`；RP-01 在 16:25—16:36 补齐 3 份证据（82 条来源、100 节点核心树、273 节点底盘树）但**正文报告仍未归档**。

我据此**作废了基于 16:17 快照的全部判定并重做**，最终以 16:36:56 为准。这一点对总控很重要：**任何静态快照审计在并行写入环境下都会立即过期**，RP-07 汇总前必须重跑一次文件级门禁。输入漂移本身已列为 `INPUT-DRIFT` 发现。

### 1.2 最终门禁状态

`G-PL1_SUBSTANTIALLY_MET_WITH_ONE_REPORT_MISSING`：4/5 报告已 `submitted`，可对新报告做实质交叉审查；但仍有 4 项残留缺口：

1. `docs/planning/reports/RP-01-vehicle-product-tree.md`（正文）
2. `docs/planning/evidence/RP-01-tree-powertrain.json`（被 RP-01 `scopeNote` 引用，实测不存在）
3. `RP-01-tree-body-systems.json`（同上）
4. `RP-01-function-tree.json`（被 `nonPhysicalViews` 引用）

另外 `submitted` ≠ `approved`：四份报告仍待总控审核，本审计据其文本独立核对，不代表认可其结论。

### 1.3 技术路线（自主决定）

证据分层审计，而非按任务书 7 条探索线索逐条走：

- **可证层**：4 份归档报告 + 16 份可解析 evidence JSON + 总计划/种子/登记簿/基线/决策记录 + 本机源码与产物实测。
- **受阻层**：凡需 RP-01 正文或未落盘分文件才能下的结论，标 `BLOCKED_BY_DEPENDENCY`，不推测内容。
- **交叉审查层**（本轮重点）：把各报告**互相**对照，找单份报告内部看不到的冲突。这是独立审计区别于"重做一次设计"的地方。
- 全部结论写入可解析 JSON，附可复现命令与反例；涉及跨模型接口/范围变化一律升级总控，不擅自修改。

---

## 2. 产品树审查（任务书步骤 1）

任务书点名要查的 15 类系统，对照 `VEHICLE_SYSTEM_TREE_SEED.md` 与 RP-01 证据：

| 类别 | 状态 | 可复核依据 |
|---|---|---|
| 悬架 / 转向 / 轮端 / 制动 | **已下钻到零件与紧固件** | `RP-01-tree-chassis.json` 273 节点：SYS-20/30/40 含 188 个 PART、16 个 REF、16 个 DAT，实测有"前副车架衬套""前副车架紧固螺栓"等 |
| 车架 / 车身 | **已下钻** | `RP-01-tree-core.json` SYS-10：29 个 PART，含车身悬置螺栓、电池包安装横梁与密封面；BOF/UNI 的 `loadPath` 明确区分 EVIDENCE 与 ASSUMPTION |
| 通用紧固件 | **已建家族目录** | SYS-130 的 37 个 FAM 节点（六角螺栓、车轮螺栓、深沟球轴承等）；RP-04 给出 ISO 273 配合与 Poka-Yoke 断言 |
| 动力 / 传动 / 冷却 / 流体 / 电气 / 线束 / 安全 / 座椅 | **仅顶层名称** | 种子 `SYS-50…SYS-110` 只列名称；RP-01 `deferredScope` 明确把 SYS-80/90/100/110 的零件级下钻标 `DEFERRED`；动力树在 `RP-01-tree-powertrain.json`（MISSING） |

**判断**：不是"漏写了"，而是**有明确、诚实的延期边界**。RP-01 把 `deferredScope` 和 `nonPhysicalViews` 写清楚，属于可控范围管理，不应算作缺陷。真正的问题是两份被引用的分文件还没落盘，以及 `SYS-60`（四驱）空白与总计划目标冲突（见 §4）。

**RP-01 的一个高价值纠正**（本审计独立复核后升级）：`axisSeparationNote` 指出总控任务书把"非承载式越野 / 承载式轿车 / 纯电"并列为三种架构是分类学错误——前两者是**车身承载结构**，纯电是**动力形式**，二者正交，纯电同样可以是非承载式（电动皮卡）。RP-01 因此按 `bodyStructure × powertrain` 两轴建模。但 `VEHICLE_SYSTEM_TREE_SEED.md` 与 `GAP_REGISTER` GAP-004 仍沿用旧的三分法。**共享种子需由总控修订**（见 NEW-09 / R-10）。

---

## 3. 接口图与真实性矩阵审查（任务书步骤 2、3）

### 3.1 接口图：覆盖扎实，但坐标与四驱是硬伤

RP-02 交付 1551 行报告、42 节点 / 86 边、六类接口、四个因果场景、24/24 自动测试通过，质量确实高，且报告 §11 主动列出 7 个自述缺口与 6 项待裁定。**但测试通过只证明这张图自洽**：

- 图是 `ICE FWD (ASSUMPTION)`，42 节点只有 `N-TRANS-DIFF` 与 `N-HALFSHAFT-FL/FR`，**无分动箱、传动轴、后差速器、后驱半轴**。而 `MASTER_PLAN.md:169` 要求前/后/四驱适配器；`RP-03:79` 反证现有 `vehicleWorld.js` 已有"前 40%、后 60%"驱动力分配却无差速器约束、动画齿轮 16/24 与驱动力倍率互不相干。**规划目标、接口图、现有实现三者互不一致。**
- `coordinateConvention.status = OPEN`，报告 §11.3 明写"未统一前不得用于生产"，但没有任何一方给出变换矩阵。
- `scope.excluded` 明确排除燃油系统细节、HVAC 制冷剂回路、排气后处理、详细线束走向；这些在 `GAP_REGISTER` 里没有对应条目，属于**隐性遗漏**（本轮按范围管理处理，但需登记）。

### 3.2 真实性矩阵：五套词汇，三套映射，无人裁决

| 来源 | 词汇 | 备注 |
|---|---|---|
| `MASTER_PLAN.md:104-110` | `VISUAL / GEOMETRY / KINEMATIC / DYNAMIC` | 标题写"**三种**验证等级"却列 **4** 项（文本不一致） |
| RP-03 | `FID-V / G / K / D1 / D2` 五级 | §10:224 要求把 `DYNAMIC` 拆成 D1/D2；§12 请总控决定是否写回总计划 |
| RP-02 | `EVIDENCE / ENGINEERING_DERIVATION / ASSUMPTION / OPEN` | §10.3 另提议边增加 `fidelityLevel: GEOMETRY/KINEMATIC/DYNAMIC` 三级；§10.2 自行给出一套映射表 |
| RP-06 | `truthLabels` 四徽章 + `validationLevel` | §5.3 称"供 RP-02 合并，不在此任务改共享 schema"，但 RP-02 报告未采纳该字段 |
| RP-01 | `EVIDENCE / ASSUMPTION / OPEN` + `DEFERRED / OUT_OF_SCOPE` | 又是一套 |

**冲突点**：RP-02 §10.2 的映射表把"FLUID/THERMAL/ELEC/CONTACT 通过工况校验"映射为 `DYNAMIC`，而 RP-03 明确要求把 `DYNAMIC` 拆成 D1/D2——两套映射不能同时成立。RP-06 的 `truthLabels` 至今没有承接方。这些是**跨模型接口冲突**，不是谁的错，但必须有一个字典。

### 3.3 已证实的"虚假真实度"（不是设想，是实测反例）

RP-03 的探针与报告提供了本轮最硬的证据，本审计复核认可：

- 画面双叉臂随悬架行程被 `scale.z` 拉长/缩短：上叉臂一次跳动**缩短 82.12 mm**、下叉臂 68.50 mm——刚性连杆不可能这样，所以当前"联动"是 `FID-V` 视觉展示，不是运动学。
- 直线制动时把 `frictionSlip` 从 3.2 改到 0.08，末速度**都是 0.06085 m/s**；`frictionSlip` 不能当冰面摩擦系数。
- `src/specs.js` 注释写"米/千克/牛"，但刚度 32 实际是 `32 × 920 = 29440 N/m`（先乘整车质量），`maxBrake: 42` 是每步冲量上限不是卡钳夹紧力——**把错误单位当标准**的实例。
- 车轮不是刚体（只有 2 个刚体：地面 + 车身），无外倾变化，悬架无下垂行程；车速取速度矢量模长（竖直 5 m/s 与前进 5 m/s 都显示 18 km/h）。

另有一处**新的**目标/证据错标：RP-04 §5 Step 7 把"实时帧率 ≥60 FPS、DrawCall ≤150"标为 `EVIDENCE`，但那是**未实测的验收目标**；`RP-06-verification-plan.json` 的 `status` 仍是 `PLAN_ONLY`，四项性能门禁全未运行。同一指标在 RP-04 是 60 FPS、在 RP-06 是工程 45 fps@1080p / 展示 30 fps@1440p，两套目标也不一致。

### 3.4 规范与自身产物不一致（可逐字段核对）

`MASTER_PLAN.md:94-95` 要求 PartSpec 带 `mechanical`（材料/质量/质心/惯量/摩擦）与 `assets`（STEP/GLB/LOD/碰撞几何/哈希）。实测两份已验收样板的元数据：

- `cad/experiments/hello_flange/out/hello_flange_metadata.json`：只有 `part_name / unit / parameters / measured(体积、包围盒) / files(step、stl) / notes`。
- `cad/experiments/planning_feasibility/out/wheel_hub_assembly_metadata.json`：只有 `unit / engineering_standards / clearance_fit_check / components(体积、包围盒) / assembly`。

**两者都没有质量、惯量、碰撞体、GLB 路径、材质、哈希。** 而 RP-04 §9.3 自己要求"输出标准质量(kg)与惯性矩张量供动力学仿真读取"、§5 声称 B-rep 保留"精确质量属性"。这不是"还没规划"，是**规范写了、样板没做**。RP-03 §10 也独立提出 GAP-010 应收窄为"920 kg 没有对应 CAD 转动惯量"。

---

## 4. 端到端场景追踪（任务书步骤 6）

按「产品总成 → 接口 → 建模 → 仿真 → 渲染 → 验收」六环追踪，完整表格见 `RP-05-risk-matrix.json`。状态词：`PRESENT_UNVERIFIED`（已提交待审）/ `PARTIAL` / `MENTIONED_ONLY` / `MISSING` / `CONFLICT`。

| 场景 | 产品总成 | 接口 | 建模 | 仿真 | 渲染 | 验收 |
|---|---|---|---|---|---|---|
| **SC-01 液压制动** | 已提交待审 | **CONFLICT** | 部分 | 已提交待审 | 仅提名 | **MISSING** |
| **SC-02 四驱动力** | 仅提名（SYS-60 分文件缺） | **CONFLICT** | 部分 | **MISSING** | 仅提名 | **MISSING** |
| **SC-03 冷却** | 仅提名（DEFERRED） | 部分 | 部分 | 部分（FID-V 示意） | 仅提名 | **MISSING** |

关键发现（比"缺文档"更危险）：

- **SC-01 接口层的 PASS 与仿真层的反例语义冲突**：RP-02 `TC-02` 判主缸→卡钳液压路径连通 PASS，但 RP-03 探针证明现有物理里"刹车"只是把车轮转角增量置零、直线制动不读 `frictionSlip`。两套语义没对齐，容易被误认为制动链路已闭环。
- **SC-02 是唯一连接口层都未覆盖的场景**，且现有代码已有一套无定义的四驱式分配，属于"先有实现、后补规范"的返工风险。
- **三条场景的验收环全部 MISSING**：实测无 `tests/` 目录，RP-03 的 `failIf` 是很好的可转断言草案但尚未接入测试框架，RP-06 门禁全为 `PLAN_ONLY`。

---

## 5. GAP_REGISTER 逐条复查（任务书步骤 5）

完整证据链见 `RP-05-gap-verdicts.json`。摘要：

| 判定 | 数量 | GAP-ID |
|---|---|---|
| `CONFIRMED_GAP` | 8 | 001, 003, 010, 012, 013, 014, 015, 016 |
| `ALREADY_COVERED` | 6 | 002, 005, 007, 008, 009, 011 |
| `NEEDS_DECISION` | 2 | 004, 006 |
| `NOT_REQUIRED` | 0（6 个子项） | 见下 |

**与 16:17 初判的差异**：`CONFIRMED_GAP` 从 10 降为 8、`ALREADY_COVERED` 从 4 升为 6，变化恰为 **GAP-002（产品树）与 GAP-008（紧固件验证规则）**两项——16:25—16:36 落地的 RP-01 树证据与 RP-04 报告把它们做实了。其余 14 项判定未变，只是证据从"报告未归档"换成已归档报告的原文。这不是放宽标准，是输入变化后的重新取证。

几条值得总控注意的判定：

- **GAP-001 CONFIRMED_GAP**：四处口径不一致，且 RP-01 三个候选配置全部 `PROPOSED_NOT_APPROVED`，根节点明写"基型待总控批准"。
- **GAP-003 CONFIRMED_GAP（最高优先级）**：坐标四种表述、无变换矩阵、FL/FR 未定义。
- **GAP-009 ALREADY_COVERED**：RP-03 交付了五级矩阵 + 16 项实验 + 容差原则 + 被证伪假设的保留记录，是本轮质量最高的覆盖之一。RP-03 §10 建议把该 GAP 收窄为"现有参数不能代表冰/雪/水"，本审计认同。
- **GAP-011 ALREADY_COVERED**：非认证边界在总计划、纲领、RP-03、RP-06、RP-01 五处一致成文，RP-06 落地成 UI 规则；碰撞认证级仿真明确裁剪，**不应重复立项**。
- **GAP-016 CONFIRMED_GAP**：每份报告都诚实列了待裁决项（RP-02 六项裁定 + 七个新缺口、RP-03 四项冲突、RP-06 两个 OPEN 一个 CONFLICT），但**没有跨报告汇总与裁决载体**，`GAP_REGISTER` 仍是 308 行基线的 INITIAL 版。把分散的"自认待决"汇总成可裁决清单，正是本任务的核心产出。

**判为 NOT_REQUIRED 的 6 个子项**（不整条判，因为 16 条 GAP 都不是整条不必做）：量产碰撞安全认证、复杂燃烧/传热 CFD、真实轮胎有限元与全系统流体动力学、详细线束三维走向与真实 DBC/ARXML、P0 迁移 WebGPU、混动专用总成展开。每项在 JSON 里都附了总计划或报告中的裁剪依据。

**登记簿自身的两个问题**：`GAP_REGISTER.md:4` 自述针对"当前 308 行 `MASTER_PLAN.md`"，实测 **334 行**；§14—§19（含 RP 工作包与委托机制）是后增内容，未纳入缺口核对。

---

## 6. 运行成本、许可、盘预算与跨 AI 版本冲突（任务书步骤 4）

| 项 | 实测 | 判断 |
|---|---|---|
| Git 基线 | `git status` → `fatal: not a git repository`；`NO .git` | A-00/G0 关口未过，却已 5 模型并行写入同一 evidence 目录，无回滚、无 diff、无并发控制 |
| C 盘 | 12 GB 可用 / 93% 占用 | 与 `AGENTS.md` 禁写 C 盘约束一致，但目前无资产体积预算 |
| F 盘 | 242 GB 可用 / 94% 占用 | 环境、缓存、CAD 产物均在 F，符合约束 |
| 目标目录 | `assets/`、`tests/`、`docs/schema/`、`src/viewer/` 实测全部 `MISSING` | `MASTER_PLAN.md:123-140` 的目标结构尚未落地 |
| 服务 | `npm start` → 5173 HTTP 200（12878 bytes）；5174 → 200（5375 bytes） | 旧四模式与看板服务可访问 |
| 资产保留 | hello_flange 的 STEP/STL/GLB/metadata 齐全；RP-04 原型 11 个产物文件齐全，GLB 211592 bytes、魔数 `glTF` 已复核 | 生成物保留良好；但 RP-03 探针脚本在 `F:\tmp\`（报告 §7 说明全文内嵌于 JSON 可还原，属已缓解） |
| 许可 | RP-01 有 82 条来源登记（含 `spotChecked`）、RP-03 记录 Chrono LICENSE 为 BSD 风格并声明"不构成接入承诺"、探针标注 VULCAN 为虚构品牌 | 做法正确但**分散**；RP-04 大量引用 ISO 273/4014/15、DIN 625 却无出处 URL/版本，其自身 §9.6 要求的许可清单未产出，根目录无 `LICENSE`/`ASSET_PROVENANCE` 清单 |
| 跨 AI 版本 | 三次快照 7→12→16 份 evidence、1→4 份报告；RP-03 任务卡三次状态变化 | `AGENTS.md:299` 自述并发/身份权限尚未解决；输入漂移使静态快照随时过期 |

---

## 7. 风险矩阵与最小修复任务（任务书步骤 7）

完整 13 条风险（含影响、可能性/未知、前置依赖、建议负责人、最小修复任务、验收方式、优先级）见 `RP-05-risk-matrix.json`。优先级分布 **P0=7 / P1=4 / P2=2**。这里只列 7 条 P0：

| ID | 风险 | 最小修复任务 | 建议负责人 |
|---|---|---|---|
| R-01 | 坐标系四种表述、无变换矩阵 | ADR 冻结唯一坐标系（含 FL/FR、原点、单位）+ 四系变换矩阵 + 4 个方向反例单测；同步修订 RP-02/RP-04 表述 | GPT-6 裁决 + DeepSeek/Qwen4/Gemini |
| R-02 | 首发基型四处不一致 | 单页 ADR 选定 bodyStructure×powertrain×驱动形式×首个纵切样板 | GPT-6 |
| R-03 | 标签五套词汇、映射互斥 | 建立 `validationLevel`/`evidenceLevel`/`coverageStatus` 三组术语的单一字典与唯一映射；裁定 FID 五级是否写回总计划 | GPT-6 → DECISIONS.md |
| R-04 | 四驱链路缺席且与现有实现冲突 | 补 AWD 片段接口图 + 非法配置反例；或明确 AWD 移出本轮并标记现有 40/60 分配为待清理 | DeepSeek + Grok |
| R-05 | 规范要求质量/惯量但样板没有 | 为 wheel_hub_assembly 补 mass/inertia/collision/glbPath/sha256/material，并加校验断言 | Gemini Flash + 架构 Agent |
| R-06 | 门禁无执行载体、RP-01 正文与 3 份分文件缺 | RP-07 启动前跑文件级门禁脚本（5 报告 + 3 分文件存在且 JSON 可解析），输出带时间戳 gate 结果 | GPT-6 |
| R-07 | 无 Git 基线却并行写入 | 完成 A-00，建立可恢复基线与忽略规则；过渡期约定一模型一文件前缀 | GPT-6 / 项目所有者 |

**升级总控**：以上 7 项 P0 加 P1/P2 中的 R-08（性能目标统一）、R-09（partId 语法）、R-10（种子分类修订）、R-12（维护演示与需求库范围）共 11 项，均涉及跨模型接口或整体范围变化，按 `AGENTS.md:22` 与任务书要求提交总控讨论，**本审计未擅自修改任何共享文档**。

---

## 8. 反例自测：为什么不能算"已闭环"

| 常见说法 | 反证 | 判定规则 |
|---|---|---|
| RP-02 有 1551 行、42 节点、24/24 PASS，接口已闭环 | 报告 §11.2 自列 7 缺口、§11.4 自列 6 项待裁定；图为 FWD 无四驱链路；坐标 `OPEN` 且"未统一前不得进入生产" | 篇幅与 PASS ≠ 覆盖完整 |
| RP-04 §5 说 B-rep 保留精确质量属性，故质量/惯量已打通 | 两份实测 metadata 都只有体积与包围盒；RP-04 §9.3 自己要求输出质量与惯性矩 | 能力描述 ≠ 已交付数据 |
| ≥60 FPS / DrawCall ≤150 标了 EVIDENCE | 是未实测的验收目标；RP-06 门禁 `PLAN_ONLY` 且另一套目标是 45/30 fps | 把目标标为 EVIDENCE 属虚假真实度 |
| 现有 drivetrain 演示能展示传动 | RP-03 实测 `gearboxRatio` 未被动画使用、16/24 齿比写死、驱动力前40/后60 且无差速器 | 动画演示 ≠ 可装配工程零件 |
| 两条 GLB 链路已验收，全流程打通 | `RESEARCH_BASELINE.md:70` 明确尚未验证 GLB 作为独立 PartInstance 在 Chrome 中渲染/选择/替换；`src/viewer/`、`assets/` 不存在 | 单件产出 ≠ 平台装配能力 |
| 4 份报告都 submitted，可启动 RP-07 | RP-01 正文缺、3 份被引用分文件 MISSING；submitted≠approved；尚有 10 项跨报告未裁决冲突 | 任务卡状态 ≠ 内容一致性 |

---

## 9. 事实 / 假设 / 未知（明确分级）

**已证实（本机实测或文件原文）**：三次快照的文件清单与数量；16 份 evidence JSON 全部可解析；`git` 无仓库；`MASTER_PLAN.md` 334 行而登记簿称 308 行；three 0.170.0 / cannon-es 0.20.0；`examples/jsm/core/Raycaster.js` 不存在而 `src/core/Raycaster.js` 存在；5173/5174 返回 200；两块盘的可用空间；两份 metadata 的字段集合；RP-04 GLB 魔数与字节数；四份报告的坐标/标签/ID/FPS 原文冲突；RP-01 三份被引用分文件缺失。

**推导（有依据但非直接实测）**：门禁状态判定；"每份都对、合起来不成立"的结构判断；风险可能性分级；各 GAP 的四级判定。

**仍未知（不推测）**：RP-01 正文与三份分文件的内容与结论；四份报告经总控审核后是否会修订；真实悬架硬点、轮胎系数、制动液压力、热标定等工程数值（各报告已正确标 `OPEN`）；RP-07 何时启动；首发基型的最终选择。

---

## 10. 验证记录

在项目根目录 `F:\project\cyq\AI_Coding\car` 执行，全部只读，未改动他人文件：

```bash
git status --short                      # fatal: not a git repository
wc -l MASTER_PLAN.md                    # 334
node -e "JSON.parse(...)"               # 16 份 evidence JSON 全部 PARSE_OK
ls docs/planning/reports/               # 4 份（RP-02/03/04/06）
ls docs/planning/evidence/ | wc -l      # 16
curl -s -o /dev/null -w "%{http_code} %{size_download}" http://localhost:5173/   # 200 12878
od -An -tx1 -N12 <wheel_hub_assembly.glb>                                        # 676c 5446 (glTF)
df -h                                   # C: 12G/93%, F: 242G/94%
```

自产三份 JSON 的一致性校验（16 条 GAP 编号连续、四级判定计数与 summary 一致、每条至少 3 条证据引用、3 条场景 × 6 环、13 条风险字段齐全、优先级计数一致、6 个反例）：**`FINAL_CHECKS_FAIL=0 / RESULT: PASS`**。校验过程中发现并修正了自己产物中的两次汇总计数错误（v1.0 的 9/3 → 10/2；v1.1 的 7/7/2 → 8/6/2），这正是"审计自己也要能复核"的要求。

---

## 11. 给总控的下一步（不超过两项）

1. **先开一次"接口冻结评审"**：用本报告 §7 的 R-01/R-02/R-03/R-09 四项（坐标、首发基型、标签字典、partId 语法）产出 ADR，再让各报告按裁决同步修订；这四项不冻结，任何后续建模与蓝图汇总都会带着冲突放大。
2. **在 RP-07 启动前跑文件级门禁**：确认 RP-01 正文与 3 份被引用分文件到位、5 份报告齐备、全部 JSON 可解析，并重新核对本报告的跨报告冲突是否已消除；本版 RP-05 结论以 16:36:56 快照为界，届时应复审。

---

*报告结束 — 等待 GPT-6 审核。本任务状态 `submitted`，不自行标 `approved`。*
