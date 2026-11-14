# RP-01｜整车物理产品树（PBS）与部件分解研究

> 执行：Qwen4 · 任务 02.02（内部 ID `RP-01`）· 2026-11-14 · 状态 **SUBMITTED，等待 GPT-6 审核**
> 任务书：[`docs/tasks/RP-01-vehicle-system-breakdown.md`](../../tasks/RP-01-vehicle-system-breakdown.md)
> 本报告不修改 `MASTER_PLAN.md`、`VEHICLE_SYSTEM_TREE_SEED.md`、`GAP_REGISTER.md` 或任何其他模型的文件。所有分类改组均为**建议**，由总控审核后合并。

---

## 0. 一句话结果

把整车拆成了 **780 个节点、13 个实体系统、493 个零件**的可校验产品树，并用独立功能树反查出 **8 处真实遗漏**（起动机、油门/离合踏板、换挡机构、喇叭、下护板、排气吊挂、制动导风管、转向柱锁）已补入；同时实测确认：**目前没有任何一个零件具备已核实的几何依据**，这才是下一步真正的瓶颈。

**给非程序员的解释**：以前项目里"汽车"是一堆看起来像零件的图形。这次我先把"一辆车到底由哪些东西组成、谁装在谁上面、同一个东西在几个系统里出现时只算一次"这件事写成了一份能被机器检查的清单，并且用"车要做什么"这个完全不同的角度去复查清单，结果真的抓出了 8 个被漏掉的机构。清单本身通过了 24 条规则检查和 32 个故意破坏的反例测试。但清单上每个零件的**真实尺寸**还一个都没有来源——这是必须如实说明的。

---

## 1. 研究对象与交付边界

| 项 | 内容 |
|---|---|
| 研究对象 | 实体整车 PBS：Vehicle → System → Subsystem → Assembly → Part，外加通用件家族目录与工程基准 |
| 适用架构 | 非承载式越野（BOF）、承载式轿车/SUV（UNI）；动力形式 ICE / BEV / HEV 作为**独立第二轴** |
| 优先深钻 | 轮端、悬架、制动、传动、动力源（SYS-20/30/40/50/60） |
| 两个下钻样例 | 发动机 `ASSY-50-001`（105 节点）、双叉臂轮端 `ASSY-30-001`（41 节点） |
| 明确不做 | 混动专用总成展开、燃烧/传热/排放化学、轮胎有限元、碰撞法规认证、公差与预紧力数值、逐根导线建模 |
| 不越界 | 接口图与信号拓扑属 RP-02（DeepSeek）；真实性分级与求解器属 RP-03（Grok）；参数化建模与资产链路属 RP-04（Gemini）；查看器属 RP-06（Composer）。本树只给身份、层级、适用性与验证类别映射，不替他们定义接口。 |

### 交付文件（全部真实存在）

| 路径 | 内容 |
|---|---|
| [`docs/planning/reports/RP-01-vehicle-product-tree.md`](RP-01-vehicle-product-tree.md) | 本报告（含由 JSON 自动渲染的分层树） |
| [`docs/planning/evidence/RP-01-tree-core.json`](../evidence/RP-01-tree-core.json) | 根节点、两轴架构定义、3 个配置、9 个选择组、SYS-00 基准、SYS-10 车身车架、SYS-130 通用件目录 |
| [`docs/planning/evidence/RP-01-tree-chassis.json`](../evidence/RP-01-tree-chassis.json) | SYS-20 悬架转向、SYS-30 车轮轮端、SYS-40 制动驻车（含轮端深钻） |
| [`docs/planning/evidence/RP-01-tree-powertrain.json`](../evidence/RP-01-tree-powertrain.json) | SYS-50 动力源（含发动机深钻与电驱）、SYS-60 动力传递、SYS-70 能源 |
| [`docs/planning/evidence/RP-01-tree-body-systems.json`](../evidence/RP-01-tree-body-systems.json) | SYS-80 热管理、SYS-90 电气电子、SYS-100 座舱附件、SYS-110 乘员保护 |
| [`docs/planning/evidence/RP-01-function-tree.json`](../evidence/RP-01-function-tree.json) | 独立功能树 77 节点 + 反查遗漏记录 |
| [`docs/planning/evidence/RP-01-sources.json`](../evidence/RP-01-sources.json) | 82 条来源登记，逐条标可支持/不可支持范围 |
| [`docs/planning/evidence/RP-01-coverage-audit.json`](../evidence/RP-01-coverage-audit.json) | 36 项逐条对照总计划 + 7 项 GAP_REGISTER 复核 |
| [`docs/planning/evidence/RP-01-validation-map.json`](../evidence/RP-01-validation-map.json) | 15 个系统 → 下游验证类别映射 + 4 项横切验证 + 首样板建议 |
| [`docs/planning/evidence/RP-01-geometry-needs.json`](../evidence/RP-01-geometry-needs.json) | 由树自动导出的几何依据缺口清单（487 项），供 RP-04 直接消费 |
| [`docs/planning/evidence/RP-01-validation-result.json`](../evidence/RP-01-validation-result.json) | 正例校验输出（overall、违规列表、全部指标） |
| [`docs/planning/evidence/RP-01-selftest-result.json`](../evidence/RP-01-selftest-result.json) | 反例自测输出（32 条逐项 CAUGHT 记录、基线违规数、24/24 规则覆盖） |
| [`agent-workspace/agents/qwen4/tools/rp01_tree_tool.py`](../../../agent-workspace/agents/qwen4/tools/rp01_tree_tool.py) | 校验/渲染/反例自测/缺口导出脚本（stdlib only） |
| [`agent-workspace/agents/qwen4/reports/RP-01.md`](../../../agent-workspace/agents/qwen4/reports/RP-01.md) | 个人回报 |

---

## 2. 编号与字段规范（建议，待总控冻结）

### 2.1 编号规则

```
<PREFIX>-<系统号>-<三位序号>
VEH-  整车根          SYS-  系统          SUB-  子系统
ASSY- 总成            PART- 零件          FAM-  通用件家族目录
DAT-  工程基准/约定    REF-  跨系统引用指针（非实体，不计入 BOM）
```

**关键规则**：编号里的系统号表示**规范归属系统**，不表示层级；层级只由 `parent` 决定。插入新节点不得改动已有编号。校验规则 R07 强制"编号系统段 == 沿 parent 上溯得到的系统"，因此不可能出现"编号说属于 SYS-30、实际挂在 SYS-40 下"的错位。

沿用种子已有的 SYS-00/10/20/…/140 编号，不重命名。

### 2.2 节点字段

| 字段 | 含义 | 约束 |
|---|---|---|
| `id` / `parent` / `kind` / `name` | 身份与层级 | 必填；单根；无环；零件与基准必须是叶子 |
| `nameEn` | 英文名 | 用于跨系统重复身份检测（R09） |
| `body` | 适用车身结构 | `["BOF"]` / `["UNI"]` / `["ANY"]`，不得混用 ANY 与具体值 |
| `power` | 适用动力形式 | `["ICE"]` / `["BEV"]` / `["HEV"]` / `["ANY"]` |
| `optionality` | 必选/可选/择一/目录 | `required` / `optional` / `alternative` / `catalog` |
| `choiceGroup` | 择一所属组 | `alternative` 必填；每个配置在每组必须恰好选 1 个（R14） |
| `evidence` | 证据等级 | `EVIDENCE` / `ASSUMPTION` / `OPEN` / `OUT_OF_SCOPE` |
| `sources` | 来源 ID | `EVIDENCE` 必须非空且全部可解析（R12） |
| `geomBasis` | 几何依据状态 | `SOURCED` / `NEEDS_MEASUREMENT` / `DEMO_ASSUMPTION` / `DEFERRED` / `NOT_APPLICABLE` |
| `geomNote` | 缺什么几何 | `NEEDS_MEASUREMENT` / `DEMO_ASSUMPTION` 必填（R21） |
| `deferReason` | 为何暂缓/简化 | `DEFERRED` / `OUT_OF_SCOPE` / `demoSimplification` 必填（R20） |
| `partClass` | 零件类别 | bearing/seal/fastener/spring/linkage/… 用于深钻完整性检查 |
| `familyRef` | 通用件家族 | 必须指向 SYS-130 下 `kind=family` 节点（R22） |
| `refId` | 引用目标 | `kind=ref` 必填，必须指向非 ref 实体，且 ref 不得有子节点（R08） |
| `functionRefs` / `realizedBy` | 功能↔产品互引 | 功能节点不得进产品树，产品节点不得当功能节点的父（R17/R18） |
| `targetLevel` | 目标验证等级 | VISUAL/GEOMETRY/KINEMATIC/DYNAMIC，**是目标不是已达成** |
| `qty` / `mirrored` / `variantFlag` | 数量、左右镜像、变型开关 | 镜像件按"一个身份 + 多实例"处理，待总控裁决 |
| `foundBy` | 由哪个功能反查补入 | 记录遗漏发现过程，可追溯 |

**禁止预填数值**：任何 `mass*` / `inertia*` / `tolerance*` / `torqueNm` / `preloadN` / `rateN*` 字段若出现数字，R10 直接判 FAIL。全树 0 个质量/惯量/公差数值。

### 2.3 与 MASTER_PLAN 数据契约的对齐

本树字段刻意对齐 §4.2 `PartSpec`（`partId/family/variantId/parameters/mounts/mechanical/validation`）与 §4.3 `Assembly`（`instanceId + partId@revision + transform`、`bom`、紧固件是可复用部件）。**需要总控裁决的扩展**：

1. 新增 `kind=datum` 与 `kind=family` 两类节点（理由见 §7）。
2. 新增 `body` × `power` 两轴适用性，替代种子的单一"车型条件"列。
3. 新增 `geomBasis` 字段，把"有没有几何依据"与"证据等级"分开——一个零件可以有 EVIDENCE 证明它存在，同时完全没有尺寸来源。
4. `mirrored` 的语义：左右件是一个身份还是两个零件号。本树按一个身份处理，**这是跨模型接口问题，交 RP-02 与总控**。

---

## 3. 三架构差异：先纠正一个分类错误

任务书把"非承载式越野、承载式轿车、纯电"并列为三种架构。**前两者是车身承载结构，纯电是动力形式，二者正交**。纯电同样可以是非承载式（电动皮卡）。把它们当成三个互斥架构，会导致"纯电"这个标签同时承担结构含义和动力含义，变型规则无法表达。

本树改用两轴：

```
bodyStructure ∈ { BOF 非承载式, UNI 承载式 }
powertrain    ∈ { ICE 燃油, BEV 纯电, HEV 混动 }
```

三个演示配置是矩阵中的三个点（均标 `PROPOSED_NOT_APPROVED`，不自行定案）：

| 配置 | body | power | 前悬架 | 后悬架 | 转向助力 | 制动助力 | 驻车 | 轮毂轴承 | 后制动 | 动力源 | 变速 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `CFG-BOF-ICE` 非承载式越野·燃油（首发候选） | BOF | ICE | 双叉臂 | 整体桥 | 液压 HPS | 真空 | 拉索 | Gen1 | 鼓式 | 发动机 | MT |
| `CFG-UNI-ICE` 承载式轿车·燃油 | UNI | ICE | 麦弗逊 | 扭力梁 | 电动 EPS | 真空 | EPB | Gen3 | 盘式 | 发动机 | AT |
| `CFG-UNI-BEV` 承载式·纯电 | UNI | BEV | 双叉臂 | 多连杆 | 电动 EPS | 机电 iBooster | EPB | Gen3 | 盘式 | 电驱 PE | 单速减速器 |

### 3.1 存在性差异（整个子系统消失/出现）

| 子系统 | BOF-ICE | UNI-ICE | UNI-BEV | 依据 |
|---|---|---|---|---|
| 梯形车架 `SUB-10-01` | 必选 | 不存在 | 不存在 | S59/S60 已核实独立车架存在 |
| 承载式车身骨架 `SUB-10-02` | 不存在 | 必选 | 必选 | S61 环形框架/激光焊/结构胶 |
| 燃油系统 `SUB-70-01` | 必选 | 必选 | **不存在** | power 轴过滤 |
| 高压储能/配电/充电 `SUB-70-03/04/05` | 不存在 | 不存在 | 必选 | S48/S50 |
| 发动机附件驱动（发电机/皮带压缩机/助力泵） | 必选 | 必选 | **不存在** | 电驱无附件皮带 |
| 真空助力器 `ASSY-40-002` | 可选 | 可选 | **不可选** | 纯电无进气歧管真空源 |
| 分动箱 `ASSY-60-005` | 可选 | 不存在 | 不存在 | 越野四驱 |
| 传动轴 `ASSY-60-004` | 可选 | 不存在（FWD） | 不存在 | 驱动形式 |
| 备胎池 `PART-10-019` | 可选 | 可选 | 常取消 | 电池/后电驱占用 |

### 3.2 承载路径差异（同一功能、不同零件）

- **BOF**：车架纵梁/横梁承担弯曲扭转与碰撞载荷，车身通过悬置支座+隔振垫+螺栓连接在车架上（`PART-10-003/004/005`）。副车架螺接**车架**。
- **UNI**：车身骨架本身是承载路径，地板/门槛/柱/顶盖构成封闭环（S61 已核实"环形框架抑制扭转"）。副车架螺接**车身骨架**。
- **UNI-BEV**：电池包常兼作结构件，门槛梁兼作侧面碰撞保护路径，地板横梁变成电池安装梁（`PART-10-013`）。**删掉发动机不等于得到电动车**：承载路径、质量分布、热管理、制动助力、高压配电全部要重算。

> **诚实边界**：`车身通过若干悬置点螺栓+隔振垫连接在车架上` 这一具体说法，本轮**未取得 OEM 一手文本**。已核实的只有"存在独立车架结构"（S59/S60）与"车架与车身是两种不同结构/材料"（S58）。因此 `SUB-10-01` 标 EVIDENCE，但其下所有构件级零件标 ASSUMPTION。资料代理明确指出：所有抓取到的 OEM 页面都没有列出纵梁/横梁/车身悬置这些零件名。

### 3.3 接口差异（变型必须联动）

| 变更 | 不能只改什么 | 必须联动 |
|---|---|---|
| 双叉臂 → 麦弗逊 | 不只是删上摆臂 | 转向节零件号必须变（`PART-20-016` → `PART-20-045`）、减振器上支座必须允许转向转动、减振器筒身承受侧向力、`REF-30-003` 指向必须改 |
| Gen1 → Gen3 轮毂轴承 | 不只是换个轴承 | Gen3 有**两个法兰**且**仍有独立内圈**（S05），轮毂不再是独立件，转向节侧残留零件变化，防尘盖常取消 |
| ICE → BEV | 不只是删发动机 | 真空助力→机电助力、发电机→DC-DC、皮带压缩机→电动压缩机、附件驱动整体消失、油箱→电池包、承载路径与质量分布重算 |
| 轴距增加 | 不只是移动后轮 | 中地板/纵梁、传动轴或管路长度、座椅布置、质量/质心/轴荷、转向响应 |
| 轮距增加 | 不只是移动轮胎 | 摆臂/副车架连接、半轴长度与摆角、拉杆、翼子板、车轮包络、前束/外倾曲线 |

---

## 4. 分层产品树（由 JSON 自动渲染，保证不漂移）

图例：〔必选/可选/择一｜适用车身｜适用动力｜证据等级｜几何依据状态｜选择组〕。`引用→` 表示跨系统指针，不是实体，不计入 BOM。
本节由 `rp01_tree_tool.py render --write` 生成；R19 规则强制 Markdown 与 JSON 的 ID 集合完全一致。

<!-- RP01:PBS-TREE:BEGIN -->
- `VEH-001` CARLAB 演示整车（基型待总控批准）〔必选｜ASSUMPTION〕
  - `SYS-00` 平台架构与整车布置基准〔必选｜ASSUMPTION〕
    - `SUB-00-01` 平台硬点与尺寸基准〔必选｜OPEN〕
      - `DAT-00-001` 前轴中心与车轮轴线基准〔必选｜OPEN〕
      - `DAT-00-002` 后轴中心基准〔必选｜OPEN〕
      - `DAT-00-003` 驾驶员 H 点与踏板基准〔必选｜OPEN〕
      - `DAT-00-004` 法兰贴合面与轮心基准〔必选｜OPEN〕
      - `DAT-00-005` 轴距/轮距/离地间隙可变范围〔必选｜ASSUMPTION〕
      - `DAT-00-006` 乘员舱/动力舱/轮罩空间包络〔必选｜OPEN〕
    - `SUB-00-02` 坐标系与方向约定〔必选〕
      - `DAT-00-007` 右手整车坐标系：+X=左侧，+Y=上，+Z=前进〔必选〕
      - `DAT-00-008` 四角顺序 FL/FR/RL/RR〔必选〕
      - `DAT-00-009` 左右镜像与实例命名规则〔必选｜OPEN〕
      - `DAT-00-010` CAD mm 与仿真 m/kg/s/N 的显式转换点〔必选〕
  - `SYS-10` 车身结构与车架〔必选｜ASSUMPTION〕
    - `SUB-10-01` 非承载式梯形车架〔必选｜BOF〕
      - `ASSY-10-001` 梯形车架总成〔必选｜BOF｜ASSUMPTION〕
        - `PART-10-001` 车架纵梁（左/右）〔必选｜BOF｜ASSUMPTION｜待几何依据〕
        - `PART-10-002` 车架横梁（前/中/后/变速箱）〔必选｜BOF｜ASSUMPTION｜待几何依据〕
        - `PART-10-003` 车身悬置支座（车架侧）〔必选｜BOF｜ASSUMPTION｜待几何依据〕
        - `PART-10-004` 车身悬置隔振垫〔必选｜BOF｜ASSUMPTION｜演示假设〕
        - `PART-10-005` 车身悬置螺栓与螺母〔必选｜BOF｜ASSUMPTION｜演示假设〕
        - `PART-10-006` 前防撞梁与吸能盒〔必选｜BOF｜ASSUMPTION｜待几何依据〕
        - `PART-10-007` 后防撞梁〔必选｜BOF｜ASSUMPTION｜待几何依据〕
        - `PART-10-008` 拖车钩安装座（recovery point）〔可选｜BOF｜ASSUMPTION｜演示假设〕
        - `PART-10-009` 发动机/变速箱悬置支架（车架侧）〔必选｜BOF｜ICE/HEV｜ASSUMPTION｜待几何依据〕
    - `SUB-10-02` 承载式车身骨架〔必选｜UNI〕
      - `ASSY-10-002` 下车体地板总成〔必选｜UNI｜ASSUMPTION〕
        - `PART-10-010` 前/中/后地板面板〔必选｜UNI｜ASSUMPTION｜待几何依据〕
        - `PART-10-011` 门槛梁（左/右）〔必选｜UNI｜ASSUMPTION｜待几何依据〕
        - `PART-10-012` 地板横梁与中央通道〔必选｜UNI｜ASSUMPTION｜待几何依据〕
        - `PART-10-013` 电池包安装横梁与密封面〔必选｜UNI｜BEV/HEV｜ASSUMPTION｜待几何依据〕
      - `ASSY-10-003` 前部碰撞与悬架安装结构〔必选｜UNI｜ASSUMPTION〕
        - `PART-10-014` 前纵梁与吸能盒〔必选｜UNI｜ASSUMPTION｜待几何依据〕
        - `PART-10-015` 前减振器塔〔必选｜UNI｜ASSUMPTION｜待几何依据〕
        - `PART-10-016` 前围板与转向柱穿孔〔必选｜UNI｜ASSUMPTION｜待几何依据〕
      - `ASSY-10-004` 后部结构〔必选｜UNI｜ASSUMPTION〕
        - `PART-10-017` 后纵梁与后地板横梁〔必选｜UNI｜ASSUMPTION｜待几何依据〕
        - `PART-10-018` 后减振器塔/弹簧座〔必选｜UNI｜ASSUMPTION｜待几何依据〕
        - `PART-10-019` 备胎池/后储物井〔可选｜UNI｜ICE/HEV｜ASSUMPTION｜演示假设〕
      - `ASSY-10-005` 上部车身骨架〔必选｜UNI｜ASSUMPTION〕
        - `PART-10-020` A/B/C 柱〔必选｜UNI｜ASSUMPTION｜待几何依据〕
        - `PART-10-021` 顶盖纵梁与横梁〔必选｜UNI｜ASSUMPTION｜待几何依据〕
    - `SUB-10-03` 副车架与悬置支架〔必选｜ASSUMPTION〕
      - `ASSY-10-006` 前副车架〔可选｜ASSUMPTION〕
        - `PART-10-022` 前副车架本体〔必选｜ASSUMPTION｜待几何依据〕
        - `PART-10-023` 前副车架衬套〔必选｜ASSUMPTION｜演示假设〕
        - `PART-10-024` 前副车架紧固螺栓〔必选｜ASSUMPTION｜演示假设〕
      - `ASSY-10-007` 后副车架〔可选｜ASSUMPTION〕
        - `PART-10-025` 后副车架本体〔必选｜ASSUMPTION｜待几何依据〕
        - `PART-10-026` 后副车架衬套与螺栓〔必选｜ASSUMPTION｜演示假设〕
    - `SUB-10-04` 动力总成悬置〔必选｜ASSUMPTION〕
      - `ASSY-10-008` 动力总成悬置总成〔必选｜ASSUMPTION〕
        - `PART-10-027` 悬置软垫（橡胶/液压）〔必选｜ASSUMPTION｜演示假设〕
        - `PART-10-028` 悬置支架与紧固螺栓〔必选｜ASSUMPTION｜演示假设〕
        - `PART-10-029` 扭矩拉杆/防扭支架〔可选｜ICE/HEV｜ASSUMPTION｜演示假设〕
  - `SYS-100` 车身附件与座舱〔必选｜ASSUMPTION〕
    - `SUB-100-01` 开闭件与覆盖件〔必选｜ASSUMPTION〕
      - `ASSY-100-001` 车门总成〔必选｜ASSUMPTION〕
        - `PART-100-001` 车门外板与内板骨架〔必选｜ASSUMPTION｜待几何依据〕
        - `PART-100-002` 侧碰防撞梁〔必选｜ASSUMPTION｜待几何依据〕
        - `PART-100-003` 玻璃升降器与门锁执行器〔必选｜ASSUMPTION｜演示假设〕
        - `PART-100-004` 车门铰链与限位器〔必选｜ASSUMPTION｜待几何依据〕
        - `PART-100-005` 门内饰板与密封条〔必选｜ASSUMPTION｜演示假设〕
      - `ASSY-100-002` 发动机罩/行李箱盖/尾门〔必选｜ASSUMPTION〕
        - `PART-100-006` 罩盖外板与铰链〔必选｜ASSUMPTION｜待几何依据〕
        - `PART-100-007` 撑杆/气弹簧与锁释放机构〔必选｜ASSUMPTION｜演示假设〕
      - `ASSY-100-003` 翼子板与保险杠覆盖件〔必选｜ASSUMPTION〕
        - `PART-100-008` 翼子板与轮罩内衬〔必选｜ASSUMPTION｜待几何依据〕
        - `PART-100-009` 保险杠蒙皮与格栅〔必选｜ASSUMPTION｜演示假设〕
    - `SUB-100-02` 玻璃与视野〔必选｜ASSUMPTION〕
      - `ASSY-100-004` 玻璃与密封〔必选｜ASSUMPTION〕
        - `PART-100-010` 风窗/侧窗/后窗玻璃〔必选｜ASSUMPTION｜待几何依据〕
        - `PART-100-011` 玻璃胶/密封条与天窗总成〔必选｜ASSUMPTION｜演示假设〕
      - `ASSY-100-005` 雨刮清洗与后视镜〔必选｜ASSUMPTION〕
        - `PART-100-012` 雨刮电机/连杆/臂片〔必选｜ASSUMPTION｜待几何依据〕
        - `PART-100-013` 清洗泵/壶/喷嘴与后视镜〔必选｜ASSUMPTION｜演示假设〕
    - `SUB-100-03` 座椅与内饰〔必选〕
      - `ASSY-100-006` 座椅总成〔必选〕
        - `PART-100-014` 座椅骨架（座盆/侧构件/横梁/后管）〔必选｜待几何依据〕
        - `PART-100-015` 滑轨与调角器〔必选｜待几何依据〕
        - `PART-100-016` 头枕与坐垫靠背泡沫面套〔必选｜演示假设〕
        - `PART-100-017` 座椅调节电机/手柄与加热垫〔可选｜ASSUMPTION｜演示假设〕
      - `ASSY-100-007` 仪表板与内饰〔必选｜ASSUMPTION〕
        - `PART-100-018` 仪表板骨架与表皮〔必选｜ASSUMPTION｜待几何依据〕
        - `PART-100-019` 副仪表板/顶棚/立柱饰板/地毯〔必选｜ASSUMPTION｜演示假设〕
    - `SUB-100-04` 灯具与外部附件〔必选｜ASSUMPTION〕
      - `ASSY-100-008` 灯具〔必选｜ASSUMPTION〕
        - `PART-100-020` 前照灯与尾灯〔必选｜ASSUMPTION｜演示假设〕
        - `PART-100-021` 雾灯/转向灯/高位制动灯/室内灯〔必选｜ASSUMPTION｜演示假设〕
      - `ASSY-100-009` 外部附件（越野相关）〔可选｜ASSUMPTION〕
        - `PART-100-022` 车顶行李架/侧踏板/拖车钩/备胎架〔可选｜ASSUMPTION｜演示假设〕
        - `PART-100-023` 发动机/电池/差速器下护板〔可选｜ASSUMPTION｜待几何依据〕
  - `SYS-110` 乘员保护与辅助安全〔必选〕
    - `SUB-110-01` 约束系统〔必选〕
      - `ASSY-110-001` 安全带总成〔必选〕
        - `PART-110-001` 卷收器〔必选｜待几何依据〕
        - `PART-110-002` 预紧器〔必选｜待几何依据〕
        - `PART-110-003` 限力器〔必选｜待几何依据〕
        - `PART-110-004` 织带/锁扣/锁舌/锚固点/高度调节器〔必选｜演示假设〕
      - `ASSY-110-002` 气囊模块〔必选〕
        - `PART-110-005` 驾驶员/乘员/膝部气囊模块〔必选｜演示假设〕
        - `PART-110-006` 侧气囊与侧气帘〔必选｜演示假设〕
        - `PART-110-007` 气体发生器与点火具〔必选｜暂缓〕
    - `SUB-110-02` 儿童约束接口〔必选｜ASSUMPTION〕
      - `ASSY-110-003` ISOFIX 与顶部系带锚固〔必选｜ASSUMPTION〕
        - `PART-110-008` ISOFIX 锚固杆与顶部系带锚点〔必选｜ASSUMPTION｜待几何依据〕
    - `SUB-110-03` 碰撞感知与结构保护引用〔必选｜ASSUMPTION〕
      - `REF-110-001` 碰撞传感器（引用 SYS-90） 引用→ `PART-90-032`
      - `REF-110-002` 气囊控制单元（引用 SYS-90） 引用→ `PART-90-012`
      - `REF-110-003` 时钟弹簧（引用 SYS-90，驾驶员气囊回路） 引用→ `PART-90-011`
      - `REF-110-004` 前纵梁与吸能盒（引用 SYS-10） 引用→ `PART-10-014`
      - `REF-110-005` 门槛梁与侧碰防撞梁（引用 SYS-10/SYS-100） 引用→ `PART-10-011`
    - `SUB-110-04` 安全基准与法规边界〔必选〕
      - `DAT-110-001` 约束系统触发阈值与展开时序〔必选｜OPEN〕
      - `DAT-110-002` 法规边界与非认证声明〔必选〕
  - `SYS-130` 工程公共件与装配基础（通用件目录）〔目录｜ASSUMPTION〕
    - `SUB-130-01` 紧固件家族〔目录｜ASSUMPTION〕
      - `FAM-130-001` 六角头/法兰面螺栓〔目录〕
      - `FAM-130-002` 内六角圆柱头螺钉〔目录〕
      - `FAM-130-003` 六角螺母〔目录｜ASSUMPTION〕
      - `FAM-130-004` 平垫片/弹簧垫圈〔目录｜ASSUMPTION〕
      - `FAM-130-005` 弹性挡圈（轴用/孔用）〔目录｜ASSUMPTION〕
      - `FAM-130-006` 开口销/槽顶螺母〔目录｜ASSUMPTION〕
      - `FAM-130-007` 车轮螺栓/螺母（按座型分类）〔目录〕
      - `FAM-130-008` 塑料卡扣/铆钉/螺纹嵌件〔目录｜ASSUMPTION〕
      - `FAM-130-009` 螺栓性能等级与螺纹规范〔目录〕
    - `SUB-130-02` 轴承与铰接家族〔目录｜ASSUMPTION〕
      - `FAM-130-010` 深沟球轴承〔目录〕
      - `FAM-130-011` 圆锥滚子轴承〔目录｜ASSUMPTION〕
      - `FAM-130-012` 滚针轴承〔目录｜ASSUMPTION〕
      - `FAM-130-013` 滑动轴承轴瓦〔目录｜ASSUMPTION〕
      - `FAM-130-014` 球铰（球头销总成）〔目录〕
      - `FAM-130-015` 杆端关节轴承/轴向接头〔目录〕
    - `SUB-130-03` 密封与衬套家族〔目录｜ASSUMPTION〕
      - `FAM-130-016` 旋转轴唇形密封（油封）〔目录〕
      - `FAM-130-017` O 形圈〔目录｜ASSUMPTION〕
      - `FAM-130-018` 矩形截面挤压密封（卡钳活塞密封）〔目录｜OPEN〕
      - `FAM-130-019` 防尘罩/波纹管〔目录〕
      - `FAM-130-020` 平面/复合垫片〔目录｜ASSUMPTION〕
      - `FAM-130-021` 橡胶/液压衬套〔目录〕
      - `FAM-130-022` 液压软管/硬管/管夹/卡箍〔目录〕
    - `SUB-130-04` 弹性与减振元件家族〔目录｜ASSUMPTION〕
      - `FAM-130-023` 橡胶隔振/衬套类弹性件〔目录〕
      - `FAM-130-024` 螺旋弹簧〔目录｜ASSUMPTION〕
      - `FAM-130-025` 扭杆/稳定杆〔目录〕
      - `FAM-130-026` 缓冲块/行程限位块〔目录〕
      - `FAM-130-027` 筒式减振器〔目录｜ASSUMPTION〕
      - `FAM-130-028` 钢板弹簧〔目录｜BOF｜ASSUMPTION〕
    - `SUB-130-05` 电气与流体通用件家族〔目录｜ASSUMPTION〕
      - `FAM-130-029` 接插件/端子/密封栓〔目录｜ASSUMPTION〕
      - `FAM-130-030` 线束固定卡扣/波纹管/胶带〔目录｜ASSUMPTION〕
      - `FAM-130-031` 保险丝/继电器/配电盒〔目录｜ASSUMPTION〕
      - `FAM-130-032` 管夹/支架/隔振垫通用安装件〔目录｜ASSUMPTION〕
      - `FAM-130-033` 油液与润滑脂（消耗品）〔目录｜ASSUMPTION〕
    - `SUB-130-06` 结构型材家族〔目录｜ASSUMPTION〕
      - `FAM-130-034` 冲压/挤压铝型材〔目录｜ASSUMPTION〕
      - `FAM-130-035` 高强钢冲压件〔目录｜ASSUMPTION〕
      - `FAM-130-036` 铸铁/铸铝壳体〔目录〕
      - `FAM-130-037` 车架/纵梁用高强钢梁〔目录｜BOF｜ASSUMPTION〕
  - `SYS-20` 悬架、转向与车轴定位〔必选｜ASSUMPTION〕
    - `SUB-20-01` 前悬架导向机构〔必选｜ASSUMPTION〕
      - `ASSY-20-001` 双叉臂前悬架总成〔择一｜ASSUMPTION｜组:CG-FSUSP〕
        - `ASSY-20-002` 上摆臂总成〔必选〕
          - `PART-20-001` 上摆臂本体〔必选｜待几何依据〕
          - `PART-20-002` 上摆臂内衬套（前/后）〔必选｜演示假设〕
          - `PART-20-003` 上球铰总成〔必选｜待几何依据〕
          - `PART-20-004` 上球铰防尘罩〔必选｜演示假设〕
          - `PART-20-005` 上球铰卡簧〔必选｜ASSUMPTION｜演示假设〕
          - `PART-20-006` 上摆臂枢轴螺栓与螺母〔必选｜ASSUMPTION｜演示假设〕
          - `PART-20-007` 外倾/主销后倾调整垫片〔可选｜ASSUMPTION｜演示假设〕
        - `ASSY-20-003` 下摆臂总成〔必选〕
          - `PART-20-008` 下摆臂本体〔必选｜待几何依据〕
          - `PART-20-009` 下摆臂内衬套（前/后）〔必选｜演示假设〕
          - `PART-20-010` 下球铰总成〔必选｜待几何依据〕
          - `PART-20-011` 下球铰防尘罩〔必选｜演示假设〕
          - `PART-20-012` 下球铰卡簧与槽顶螺母〔必选｜ASSUMPTION｜演示假设〕
          - `PART-20-013` 下摆臂枢轴螺栓与螺母〔必选｜ASSUMPTION｜演示假设〕
          - `PART-20-014` 减振器下安装座与衬套〔必选｜ASSUMPTION｜待几何依据〕
          - `PART-20-015` 稳定杆连杆安装座〔可选｜ASSUMPTION｜演示假设〕
        - `ASSY-20-004` 前转向节（双叉臂）〔必选｜ASSUMPTION〕
          - `PART-20-016` 转向节本体〔必选｜ASSUMPTION｜待几何依据〕
          - `PART-20-017` 球铰→转向节紧固螺栓/螺母〔必选｜ASSUMPTION｜演示假设〕
          - `PART-20-018` 轮速传感器安装支架〔必选｜ASSUMPTION｜演示假设〕
        - `ASSY-20-005` 前弹簧与减振器〔必选｜ASSUMPTION〕
          - `ASSY-20-006` 减振器总成〔必选｜ASSUMPTION〕
            - `PART-20-022` 减振器筒身〔必选｜ASSUMPTION｜待几何依据〕
            - `PART-20-023` 活塞杆〔必选｜ASSUMPTION｜待几何依据〕
            - `PART-20-024` 活塞与阀片组〔必选｜ASSUMPTION｜暂缓〕
            - `PART-20-025` 活塞杆油封〔必选｜ASSUMPTION｜演示假设〕
            - `PART-20-026` 杆导向座与衬套〔必选｜ASSUMPTION｜演示假设〕
            - `PART-20-027` 减振器防尘罩〔必选｜演示假设〕
            - `PART-20-028` 缓冲块（行程限位）〔必选｜演示假设〕
            - `PART-20-029` 减振器上支座（顶胶）与轴承〔必选｜ASSUMPTION｜待几何依据〕
            - `PART-20-030` 活塞杆锁紧螺母〔必选｜ASSUMPTION｜演示假设〕
          - `PART-20-019` 前螺旋弹簧〔必选｜ASSUMPTION｜待几何依据〕
          - `PART-20-020` 上弹簧座与隔振垫〔必选｜ASSUMPTION｜演示假设〕
          - `PART-20-021` 下弹簧座〔必选｜ASSUMPTION｜演示假设〕
        - `ASSY-20-007` 前横向稳定杆〔可选〕
          - `PART-20-031` 稳定杆本体〔必选｜ASSUMPTION｜待几何依据〕
          - `PART-20-032` 稳定杆衬套〔必选｜演示假设〕
          - `PART-20-033` 稳定杆卡箍与支架〔必选｜ASSUMPTION｜演示假设〕
          - `PART-20-034` 稳定杆连杆（左/右）〔必选｜待几何依据〕
          - `PART-20-035` 连杆球铰/衬套〔必选｜演示假设〕
          - `PART-20-036` 连杆锁紧螺母〔必选｜ASSUMPTION｜演示假设〕
      - `ASSY-20-008` 麦弗逊前悬架总成〔择一｜组:CG-FSUSP〕
        - `ASSY-20-009` 滑柱总成（strut）〔必选｜ASSUMPTION〕
          - `PART-20-037` 滑柱筒身（带转向节连接耳）〔必选｜ASSUMPTION｜待几何依据〕
          - `PART-20-038` 滑柱活塞杆与活塞阀组〔必选｜ASSUMPTION｜暂缓〕
          - `PART-20-039` 滑柱杆油封与导向座〔必选｜ASSUMPTION｜演示假设〕
          - `PART-20-040` 滑柱螺旋弹簧〔必选｜ASSUMPTION｜待几何依据〕
          - `PART-20-041` 滑柱上支座与转向轴承〔必选｜ASSUMPTION｜待几何依据〕
          - `PART-20-042` 滑柱防尘罩与缓冲块〔必选｜演示假设〕
        - `PART-20-043` 麦弗逊下摆臂〔必选｜ASSUMPTION｜待几何依据〕
        - `PART-20-044` 下摆臂衬套与球铰〔必选｜演示假设〕
        - `PART-20-045` 麦弗逊转向节〔必选｜ASSUMPTION｜待几何依据〕
        - `PART-20-046` 滑柱上安装螺栓与下摆臂螺栓〔必选｜ASSUMPTION｜演示假设〕
    - `SUB-20-02` 后悬架导向机构〔必选｜ASSUMPTION〕
      - `ASSY-20-010` 多连杆后悬架总成〔择一｜组:CG-RSUSP〕
        - `ASSY-20-013` 后弹簧与减振器模块〔必选｜ASSUMPTION〕
          - `PART-20-054` 后螺旋弹簧〔必选｜ASSUMPTION｜待几何依据〕
          - `PART-20-055` 后减振器〔必选｜ASSUMPTION｜待几何依据〕
          - `PART-20-056` 后减振器上支座与缓冲块〔必选｜演示假设〕
        - `PART-20-047` 上控制臂〔必选｜ASSUMPTION｜待几何依据〕
        - `PART-20-048` 下控制臂〔必选｜ASSUMPTION｜待几何依据〕
        - `PART-20-049` 前束控制臂〔必选｜ASSUMPTION｜待几何依据〕
        - `PART-20-050` 纵臂/拖曳臂〔必选｜ASSUMPTION｜待几何依据〕
        - `PART-20-051` 各臂衬套与球铰〔必选｜演示假设〕
        - `PART-20-052` 后转向节〔必选｜ASSUMPTION｜待几何依据〕
        - `PART-20-053` 后悬架紧固螺栓组〔必选｜ASSUMPTION｜演示假设〕
      - `ASSY-20-011` 整体桥后悬架总成〔择一｜BOF｜ASSUMPTION｜组:CG-RSUSP〕
        - `PART-20-057` 桥壳本体〔必选｜BOF｜ASSUMPTION｜待几何依据〕
        - `PART-20-058` 桥壳油封与通气塞〔必选｜BOF｜ASSUMPTION｜演示假设〕
        - `PART-20-059` 钢板弹簧或纵连杆〔必选｜BOF｜ASSUMPTION｜待几何依据〕
        - `PART-20-060` U 型螺栓与压板〔必选｜BOF｜ASSUMPTION｜演示假设〕
        - `PART-20-061` 推力杆/瓦特连杆/横向稳定杆〔可选｜BOF｜ASSUMPTION｜待几何依据〕
        - `REF-20-001` 桥壳内差速器与半轴（引用 SYS-60） 引用→ `ASSY-60-010`
      - `ASSY-20-012` 扭力梁后悬架总成〔择一｜UNI｜ASSUMPTION｜组:CG-RSUSP〕
        - `PART-20-062` 扭力梁本体（横梁+纵臂）〔必选｜UNI｜ASSUMPTION｜待几何依据〕
        - `PART-20-063` 纵臂衬套〔必选｜UNI｜演示假设〕
        - `PART-20-064` 弹簧座与减振器安装座〔必选｜UNI｜ASSUMPTION｜演示假设〕
        - `PART-20-065` 扭力梁紧固螺栓〔必选｜UNI｜ASSUMPTION｜演示假设〕
        - `REF-20-002` 后轮毂轴承单元（引用 SYS-30） 引用→ `ASSY-30-003`
    - `SUB-20-03` 转向系统〔必选〕
      - `ASSY-20-014` 转向操纵与齿轮齿条转向器〔必选〕
        - `PART-20-066` 方向盘〔必选｜ASSUMPTION｜演示假设〕
        - `PART-20-067` 转向柱上/下轴与万向节〔必选｜ASSUMPTION｜待几何依据〕
        - `PART-20-068` 转向中间轴〔必选｜ASSUMPTION｜待几何依据〕
        - `PART-20-069` 转向柱安装支架与螺栓〔必选｜ASSUMPTION｜演示假设〕
        - `PART-20-070` 转向器壳体〔必选｜ASSUMPTION｜待几何依据〕
        - `PART-20-071` 齿条〔必选｜ASSUMPTION｜待几何依据〕
        - `PART-20-072` 小齿轮与轴承〔必选｜ASSUMPTION｜待几何依据〕
        - `PART-20-073` 转向器安装衬套与螺栓〔必选｜ASSUMPTION｜演示假设〕
        - `PART-20-074` 内拉杆（轴向接头 axial joint）〔必选｜待几何依据〕
        - `PART-20-075` 外拉杆端（tie rod end）〔必选｜待几何依据〕
        - `PART-20-076` 拉杆锁紧螺母〔必选｜ASSUMPTION｜演示假设〕
        - `PART-20-077` 转向器防尘罩（波纹管）〔必选｜演示假设〕
        - `PART-20-078` 拉杆端卡簧与槽顶螺母〔必选｜ASSUMPTION｜演示假设〕
        - `PART-20-088` 转向柱锁止/点火开关〔可选｜ICE/HEV｜ASSUMPTION｜演示假设〕
        - `REF-20-003` 时钟弹簧/螺旋电缆（引用 SYS-90） 引用→ `PART-90-011`
      - `ASSY-20-015` 液压转向助力 HPS〔择一｜ICE/HEV｜ASSUMPTION｜组:CG-STEER〕
        - `PART-20-079` 助力泵（叶片式）〔必选｜ICE/HEV｜ASSUMPTION｜待几何依据〕
        - `PART-20-080` 助力油罐与滤网〔必选｜ICE/HEV｜ASSUMPTION｜演示假设〕
        - `PART-20-081` 高/低压油管〔必选｜ICE/HEV｜ASSUMPTION｜演示假设〕
        - `PART-20-082` 转向器内液压缸与转阀〔必选｜ICE/HEV｜ASSUMPTION｜暂缓〕
        - `PART-20-083` 助力泵皮带轮与支架〔必选｜ICE/HEV｜ASSUMPTION｜待几何依据〕
      - `ASSY-20-016` 电动转向助力 EPS〔择一｜ASSUMPTION｜组:CG-STEER〕
        - `PART-20-084` EPS 电机〔必选｜ASSUMPTION｜待几何依据〕
        - `PART-20-085` EPS 减速机构〔必选｜ASSUMPTION｜待几何依据〕
        - `PART-20-086` 扭矩转角传感器〔必选｜ASSUMPTION｜演示假设〕
        - `PART-20-087` EPS 安装支架与螺栓〔必选｜ASSUMPTION｜演示假设〕
        - `REF-20-004` EPS 控制单元（引用 SYS-90） 引用→ `PART-90-004`
    - `SUB-20-04` 悬架与转向硬点基准〔必选｜OPEN〕
      - `DAT-20-001` 上/下摆臂内外硬点〔必选｜OPEN〕
      - `DAT-20-002` 上/下球铰中心〔必选｜OPEN〕
      - `DAT-20-003` 减振器上下硬点与弹簧座〔必选｜OPEN〕
      - `DAT-20-004` 转向器与内外拉杆硬点〔必选｜OPEN〕
      - `DAT-20-005` 主销轴线/内倾角/后倾角/侧倾中心〔必选｜OPEN〕
      - `DAT-20-006` 悬架行程/跳动/回弹限位〔必选｜OPEN〕
  - `SYS-30` 车轮、轮胎与轮端〔必选〕
    - `SUB-30-01` 轮端总成（每角）〔必选〕
      - `ASSY-30-001` 轮端总成（双叉臂前轮端深钻样例）〔必选〕
        - `ASSY-30-002` 轮毂轴承 Gen1（双列角接触球轴承+独立轮毂）〔择一｜组:CG-HUB〕
          - `PART-30-001` 轴承外圈（压入转向节）〔必选｜待几何依据〕
          - `PART-30-002` 轴承内圈（两列配对）〔必选｜待几何依据〕
          - `PART-30-003` 滚动体（两列球）〔必选｜待几何依据〕
          - `PART-30-004` 保持架〔必选｜ASSUMPTION｜演示假设〕
          - `PART-30-005` 多唇密封（内侧/外侧）〔必选｜演示假设〕
          - `PART-30-006` 独立轮毂法兰〔必选｜待几何依据〕
          - `PART-30-007` 轮毂锁紧螺母/铆压边〔必选｜ASSUMPTION｜演示假设〕
          - `PART-30-008` 轴头卡簧〔必选｜ASSUMPTION｜演示假设〕
          - `PART-30-009` 车轮螺柱（压装于轮毂）〔必选｜ASSUMPTION｜待几何依据〕
        - `ASSY-30-003` 轮毂轴承单元 Gen3（集成双法兰）〔择一｜组:CG-HUB〕
          - `PART-30-010` 带车轮/制动盘法兰的内圈（整体）〔必选｜待几何依据〕
          - `PART-30-011` 内侧球列独立内圈〔必选｜待几何依据〕
          - `PART-30-012` 外圈（带悬架安装法兰）〔必选｜待几何依据〕
          - `PART-30-013` 滚动体（两列）〔必选｜待几何依据〕
          - `PART-30-014` 保持架〔必选｜ASSUMPTION｜演示假设〕
          - `PART-30-015` 单元密封（内侧/外侧）〔必选｜演示假设〕
          - `PART-30-016` ABS 磁性编码环（选配）〔可选｜待几何依据〕
          - `PART-30-017` 法兰螺柱（压装）〔必选｜ASSUMPTION｜待几何依据〕
          - `PART-30-018` 单元→转向节安装螺栓〔必选｜ASSUMPTION｜演示假设〕
        - `ASSY-30-004` 车轮总成〔必选〕
          - `ASSY-30-005` 轮胎总成（外购不可拆总成，分层仅示意）〔必选｜待几何依据〕
            - `PART-30-021` 内衬层（气密层）〔必选｜演示假设〕
            - `PART-30-022` 帘布层（胎体）〔必选｜演示假设〕
            - `PART-30-023` 冠部帘层与帽层〔必选｜演示假设〕
            - `PART-30-024` 胎侧胶〔必选｜演示假设〕
            - `PART-30-025` 胎圈钢丝与下胎圈区〔必选｜待几何依据〕
            - `PART-30-026` 胎面胶〔必选｜演示假设〕
          - `PART-30-019` 轮辋（轮圈）〔必选｜待几何依据〕
          - `PART-30-027` 气门嘴〔必选｜ASSUMPTION｜演示假设〕
          - `PART-30-028` 车轮平衡块〔可选｜ASSUMPTION｜演示假设〕
          - `PART-30-029` 车轮螺栓/螺母（按座型）〔必选｜待几何依据〕
          - `PART-30-030` 中心盖〔可选｜ASSUMPTION｜演示假设〕
        - `PART-30-031` 制动盘定位螺钉〔必选｜ASSUMPTION｜演示假设〕
        - `PART-30-032` 轴头防尘盖〔可选｜ASSUMPTION｜演示假设〕
        - `REF-30-001` 制动盘总成（引用 SYS-40） 引用→ `ASSY-40-009`
        - `REF-30-002` 卡钳总成（引用 SYS-40） 引用→ `ASSY-40-008`
        - `REF-30-003` 转向节本体（引用 SYS-20） 引用→ `PART-20-016`
        - `REF-30-004` 半轴外端（引用 SYS-60，驱动轮才有） 引用→ `PART-60-021`
        - `REF-30-005` 轮速传感器（引用 SYS-90） 引用→ `PART-90-020`
    - `SUB-30-02` 轮辋轮胎规格基准〔必选〕
      - `DAT-30-001` PCD 螺栓孔节圆直径〔必选〕
      - `DAT-30-002` ET 偏距〔必选〕
      - `DAT-30-003` 中心孔 CB 与定心方式〔必选〕
      - `DAT-30-004` 轮辋宽度/直径与 J/JJ 法兰型式〔必选〕
      - `DAT-30-005` 轮胎米制标记（断面宽/高宽比/轮辋直径）〔必选〕
      - `DAT-30-006` 负荷指数/速度级别/胎压〔必选｜OPEN〕
    - `SUB-30-03` 备胎与随车工具〔可选｜ASSUMPTION〕
      - `ASSY-30-006` 备胎总成与固定机构〔可选｜ICE/HEV｜ASSUMPTION〕
      - `ASSY-30-007` 千斤顶与随车工具〔可选｜ASSUMPTION〕
  - `SYS-40` 制动与驻车〔必选〕
    - `SUB-40-01` 制动操纵与助力〔必选〕
      - `ASSY-40-001` 制动踏板机构〔必选｜ASSUMPTION〕
        - `PART-40-001` 制动踏板臂〔必选｜ASSUMPTION｜待几何依据〕
        - `PART-40-002` 踏板轴与衬套〔必选｜ASSUMPTION｜演示假设〕
        - `PART-40-003` 踏板回位弹簧〔必选｜ASSUMPTION｜演示假设〕
        - `PART-40-004` 踏板支架〔必选｜ASSUMPTION｜待几何依据〕
        - `PART-40-005` 制动灯开关〔必选｜ASSUMPTION｜演示假设〕
        - `PART-40-006` 踏板紧固螺栓与限位块〔必选｜ASSUMPTION｜演示假设〕
      - `ASSY-40-002` 真空助力器〔择一｜ICE/HEV｜ASSUMPTION｜组:CG-BOOST〕
        - `PART-40-007` 助力器前/后壳体〔必选｜ICE/HEV｜ASSUMPTION｜待几何依据〕
        - `PART-40-008` 膜片与盘〔必选｜ICE/HEV｜ASSUMPTION｜演示假设〕
        - `PART-40-009` 控制阀体（空气阀/真空阀）〔必选｜ICE/HEV｜ASSUMPTION｜暂缓〕
        - `PART-40-010` 助力器复位弹簧〔必选｜ICE/HEV｜ASSUMPTION｜演示假设〕
        - `PART-40-011` 输出推杆与反作用盘〔必选｜ICE/HEV｜ASSUMPTION｜待几何依据〕
        - `PART-40-012` 助力器安装螺母与壳体密封〔必选｜ICE/HEV｜ASSUMPTION｜演示假设〕
      - `ASSY-40-003` 机电式制动助力器（iBooster 类）〔择一｜组:CG-BOOST〕
        - `PART-40-013` 差动行程传感器〔必选｜演示假设〕
        - `PART-40-014` 助力电机〔必选｜待几何依据〕
        - `PART-40-015` 三级齿轮机构〔必选｜待几何依据〕
        - `PART-40-016` 助力器壳体与安装支架〔必选｜ASSUMPTION｜待几何依据〕
        - `REF-40-001` 标准制动主缸（引用本系统 ASSY-40-004） 引用→ `ASSY-40-004`
        - `REF-40-002` 助力器控制单元（引用 SYS-90） 引用→ `PART-90-005`
      - `ASSY-40-004` 制动主缸（串列柱塞式）〔必选〕
        - `PART-40-017` 主缸体〔必选｜待几何依据〕
        - `PART-40-018` 第一活塞（主活塞）〔必选｜ASSUMPTION｜待几何依据〕
        - `PART-40-019` 第二活塞（副活塞）〔必选｜ASSUMPTION｜待几何依据〕
        - `PART-40-020` 活塞密封（皮碗）〔必选｜ASSUMPTION｜演示假设〕
        - `PART-40-021` 活塞复位弹簧〔必选｜ASSUMPTION｜演示假设〕
        - `PART-40-022` 缸体卡簧/活塞限位〔必选｜ASSUMPTION｜演示假设〕
        - `PART-40-023` 中央阀（ABS 兼容设计）〔可选｜待几何依据〕
      - `ASSY-40-005` 储液罐与液位监测〔必选〕
        - `PART-40-024` 储液罐本体〔必选｜演示假设〕
        - `PART-40-025` 罐盖与通气〔必选｜ASSUMPTION｜演示假设〕
        - `PART-40-026` 滤网与液位传感器〔必选｜ASSUMPTION｜演示假设〕
        - `PART-40-027` 罐体密封圈〔必选｜ASSUMPTION｜演示假设〕
    - `SUB-40-02` 液压管路与轮端执行〔必选〕
      - `ASSY-40-006` 液压管路总成〔必选〕
        - `PART-40-028` 制动硬管（前/后回路）〔必选｜ASSUMPTION｜待几何依据〕
        - `PART-40-029` 柔性制动软管〔必选｜待几何依据〕
        - `PART-40-030` 管接头/banjo 螺栓与铜垫片〔必选｜ASSUMPTION｜演示假设〕
        - `PART-40-031` 管夹与支架〔必选｜ASSUMPTION｜演示假设〕
        - `PART-40-032` 制动力比例/减压阀〔可选｜暂缓〕
        - `PART-40-033` 制动液（消耗品）〔必选｜ASSUMPTION〕
      - `ASSY-40-007` 盘式制动器模块（前必选）〔必选〕
        - `ASSY-40-008` 卡钳总成〔必选〕
          - `PART-40-034` 卡钳体〔必选｜待几何依据〕
          - `PART-40-035` 卡钳活塞〔必选｜ASSUMPTION｜待几何依据〕
          - `PART-40-036` 活塞矩形密封圈〔必选｜OPEN｜待几何依据〕
          - `PART-40-037` 活塞防尘罩〔必选｜ASSUMPTION｜演示假设〕
          - `PART-40-038` 卡钳导向销（浮动式）〔必选｜ASSUMPTION｜待几何依据〕
          - `PART-40-039` 导向销防尘套〔必选｜ASSUMPTION｜演示假设〕
          - `PART-40-040` 放气螺钉〔必选｜ASSUMPTION｜演示假设〕
          - `PART-40-041` 卡钳安装螺栓〔必选｜ASSUMPTION｜演示假设〕
          - `PART-40-042` 摩擦片总成（背板+摩擦材料）〔必选｜待几何依据〕
          - `PART-40-043` 消音片（shims）〔必选｜演示假设〕
          - `PART-40-044` 防响夹/固定销/弹簧〔必选｜演示假设〕
          - `PART-40-045` 摩擦片磨损传感器〔可选｜演示假设〕
        - `ASSY-40-009` 制动盘总成〔必选｜ASSUMPTION〕
          - `PART-40-046` 通风制动盘（摩擦环+筋+盘帽）〔必选｜ASSUMPTION｜待几何依据〕
          - `PART-40-047` 分体式盘帽（选配）〔可选｜ASSUMPTION｜待几何依据〕
        - `PART-40-048` 卡钳支架〔必选｜ASSUMPTION｜待几何依据〕
        - `PART-40-049` 卡钳支架螺栓〔必选｜ASSUMPTION｜演示假设〕
        - `PART-40-071` 制动导风管/冷却挡板〔可选｜ASSUMPTION｜演示假设〕
      - `ASSY-40-010` 后鼓式制动器模块〔择一｜组:CG-RBRK〕
        - `PART-40-050` 制动鼓〔必选｜待几何依据〕
        - `PART-40-051` 领蹄与从蹄〔必选｜待几何依据〕
        - `PART-40-052` 蹄片摩擦衬片〔必选｜ASSUMPTION｜演示假设〕
        - `PART-40-053` 轮缸〔必选｜待几何依据〕
        - `PART-40-054` 轮缸皮碗与防尘罩〔必选｜ASSUMPTION｜演示假设〕
        - `PART-40-055` 蹄片回位弹簧与自动间隙调整机构〔必选｜ASSUMPTION｜暂缓〕
        - `PART-40-056` 制动底板与驻车拉杆接口〔必选｜ASSUMPTION｜待几何依据〕
      - `ASSY-40-013` 后轮盘式制动配置〔择一｜ASSUMPTION｜组:CG-RBRK〕
        - `REF-40-003` 盘式制动器模块（引用 ASSY-40-007） 引用→ `ASSY-40-007`
    - `SUB-40-03` 驻车制动〔必选〕
      - `ASSY-40-011` 机械驻车（拉索）〔择一｜ASSUMPTION｜组:CG-PARK〕
        - `PART-40-057` 驻车手柄/踏板〔必选｜ASSUMPTION｜演示假设〕
        - `PART-40-058` 驻车拉索与导管〔必选｜ASSUMPTION｜待几何依据〕
        - `PART-40-059` 拉索均衡器与调整螺母〔必选｜ASSUMPTION｜演示假设〕
      - `ASSY-40-012` 电子驻车 EPB（卡钳集成）〔择一｜组:CG-PARK〕
        - `PART-40-060` EPB 电机与减速机构〔必选｜ASSUMPTION｜待几何依据〕
        - `PART-40-061` 卡钳集成丝杠与螺母〔必选｜ASSUMPTION｜待几何依据〕
        - `PART-40-062` EPB 开关与执行器螺栓〔必选｜ASSUMPTION｜演示假设〕
        - `REF-40-004` EPB 控制单元（引用 SYS-90） 引用→ `PART-90-006`
      - `ASSY-40-014` 鼓式集成 EPB（EPB-Si 类）〔择一｜组:CG-PARK〕
        - `PART-40-063` 集成 EPB 的鼓式制动器本体〔必选｜待几何依据〕
        - `PART-40-064` 鼓式 EPB 电机与丝杠〔必选｜ASSUMPTION｜待几何依据〕
    - `SUB-40-04` 制动电子控制〔必选〕
      - `ASSY-40-015` ABS/ESC 液压调节单元〔必选〕
        - `PART-40-065` 阀体〔必选｜ASSUMPTION｜待几何依据〕
        - `PART-40-066` 进液/出液电磁阀〔必选｜ASSUMPTION｜待几何依据〕
        - `PART-40-067` 回流泵与泵电机〔必选｜待几何依据〕
        - `PART-40-068` 低压蓄能腔〔必选｜待几何依据〕
        - `PART-40-069` 压力传感器〔必选｜ASSUMPTION｜演示假设〕
        - `PART-40-070` 单元安装支架与减振垫〔必选｜ASSUMPTION｜演示假设〕
        - `REF-40-005` ESC 控制单元（引用 SYS-90） 引用→ `PART-90-007`
      - `REF-40-006` 轮速传感器（引用 SYS-90） 引用→ `PART-90-020`
      - `REF-40-007` ABS 编码环/齿圈（引用 SYS-30） 引用→ `PART-30-016`
    - `SUB-40-05` 制动性能基准〔必选｜OPEN〕
      - `DAT-40-001` 踏板力-行程-主缸压力特性〔必选｜OPEN〕
      - `DAT-40-002` 卡钳夹紧力与摩擦系数-温度特性〔必选｜OPEN〕
      - `DAT-40-003` 前后制动力分配与回路分割〔必选〕
      - `DAT-40-004` 制动热容量与衰退/再生制动协调〔必选〕
  - `SYS-50` 动力源〔必选〕
    - `SUB-50-01` 内燃机本体〔必选｜ICE/HEV〕
      - `ASSY-50-001` 发动机总成（直列四缸火花点火，深钻样例）〔择一｜ICE/HEV｜组:CG-POWER〕
        - `ASSY-50-002` 曲柄连杆机构〔必选｜ICE/HEV〕
          - `ASSY-50-003` 活塞连杆组（每缸）〔必选｜ICE/HEV〕
            - `PART-50-001` 活塞〔必选｜ICE/HEV｜待几何依据〕
            - `PART-50-002` 活塞环组（压缩环+油环）〔必选｜ICE/HEV｜待几何依据〕
            - `PART-50-003` 活塞销〔必选｜ICE/HEV｜待几何依据〕
            - `PART-50-004` 活塞销卡簧〔必选｜ICE/HEV｜ASSUMPTION｜演示假设〕
            - `PART-50-005` 连杆本体〔必选｜ICE/HEV｜待几何依据〕
            - `PART-50-006` 连杆轴瓦〔必选｜ICE/HEV｜待几何依据〕
            - `PART-50-007` 连杆螺栓〔必选｜ICE/HEV｜ASSUMPTION｜演示假设〕
            - `PART-50-008` 连杆小头衬套〔必选｜ICE/HEV｜ASSUMPTION｜演示假设〕
          - `ASSY-50-004` 曲轴组〔必选｜ICE/HEV｜ASSUMPTION〕
            - `PART-50-009` 曲轴本体〔必选｜ICE/HEV｜ASSUMPTION｜待几何依据〕
            - `PART-50-010` 主轴承轴瓦〔必选｜ICE/HEV｜ASSUMPTION｜待几何依据〕
            - `PART-50-011` 主轴承盖〔必选｜ICE/HEV｜ASSUMPTION｜待几何依据〕
            - `PART-50-012` 主轴承盖螺栓〔必选｜ICE/HEV｜ASSUMPTION｜演示假设〕
            - `PART-50-013` 曲轴止推垫片〔必选｜ICE/HEV｜ASSUMPTION｜演示假设〕
            - `PART-50-014` 曲轴前油封〔必选｜ICE/HEV｜ASSUMPTION｜演示假设〕
            - `PART-50-015` 曲轴后油封〔必选｜ICE/HEV｜ASSUMPTION｜演示假设〕
            - `PART-50-016` 曲轴键与定位销〔必选｜ICE/HEV｜ASSUMPTION｜演示假设〕
            - `PART-50-017` 扭转减振器/曲轴皮带轮〔必选｜ICE/HEV｜ASSUMPTION｜待几何依据〕
            - `PART-50-018` 飞轮（MT）/柔性盘（AT）〔必选｜ICE/HEV｜ASSUMPTION｜待几何依据〕
            - `PART-50-019` 飞轮齿圈〔必选｜ICE/HEV｜ASSUMPTION｜待几何依据〕
            - `PART-50-020` 飞轮螺栓〔必选｜ICE/HEV｜ASSUMPTION｜演示假设〕
          - `ASSY-50-005` 缸体组〔必选｜ICE/HEV｜ASSUMPTION〕
            - `PART-50-021` 缸体本体〔必选｜ICE/HEV｜ASSUMPTION｜待几何依据〕
            - `PART-50-022` 气缸套（可换式）〔可选｜ICE/HEV｜待几何依据〕
            - `PART-50-023` 缸体堵盖/水套塞〔必选｜ICE/HEV｜ASSUMPTION｜演示假设〕
            - `PART-50-024` 缸体定位销〔必选｜ICE/HEV｜ASSUMPTION｜演示假设〕
            - `PART-50-025` 油底壳〔必选｜ICE/HEV｜ASSUMPTION｜待几何依据〕
            - `PART-50-026` 油底壳垫片与放油螺塞〔必选｜ICE/HEV｜ASSUMPTION｜演示假设〕
        - `ASSY-50-006` 缸盖与配气机构〔必选｜ICE/HEV〕
          - `ASSY-50-007` 缸盖组〔必选｜ICE/HEV〕
            - `PART-50-027` 缸盖本体〔必选｜ICE/HEV｜ASSUMPTION｜待几何依据〕
            - `PART-50-028` 缸盖垫片〔必选｜ICE/HEV｜ASSUMPTION｜待几何依据〕
            - `PART-50-029` 缸盖螺栓〔必选｜ICE/HEV｜ASSUMPTION｜演示假设〕
            - `PART-50-030` 气门导管〔必选｜ICE/HEV｜待几何依据〕
            - `PART-50-031` 气门座圈〔必选｜ICE/HEV｜待几何依据〕
            - `PART-50-032` 凸轮轴轴承/轴颈盖〔必选｜ICE/HEV｜ASSUMPTION｜演示假设〕
          - `ASSY-50-008` 气门组（每缸）〔必选｜ICE/HEV〕
            - `PART-50-033` 进气门〔必选｜ICE/HEV｜待几何依据〕
            - `PART-50-034` 排气门〔必选｜ICE/HEV｜待几何依据〕
            - `PART-50-035` 气门杆密封〔必选｜ICE/HEV｜演示假设〕
            - `PART-50-036` 气门弹簧〔必选｜ICE/HEV｜待几何依据〕
            - `PART-50-037` 上气门弹簧座〔必选｜ICE/HEV｜演示假设〕
            - `PART-50-038` 下气门弹簧座〔必选｜ICE/HEV｜演示假设〕
            - `PART-50-039` 气门锁片〔必选｜ICE/HEV｜ASSUMPTION｜演示假设〕
            - `PART-50-040` 挺柱/垫片或滚子摇臂〔必选｜ICE/HEV｜ASSUMPTION｜待几何依据〕
          - `ASSY-50-009` 凸轮轴与正时驱动〔必选｜ICE/HEV〕
            - `PART-50-041` 进气凸轮轴〔必选｜ICE/HEV｜待几何依据〕
            - `PART-50-042` 排气凸轮轴〔必选｜ICE/HEV｜待几何依据〕
            - `PART-50-043` 正时链条/皮带〔必选｜ICE/HEV｜ASSUMPTION｜待几何依据〕
            - `PART-50-044` 曲轴与凸轮轴正时链轮〔必选｜ICE/HEV｜ASSUMPTION｜待几何依据〕
            - `PART-50-045` 正时张紧器与导轨〔必选｜ICE/HEV｜ASSUMPTION｜演示假设〕
            - `PART-50-046` VVT 相位器〔可选｜ICE/HEV｜ASSUMPTION｜待几何依据〕
            - `PART-50-047` VVT 机油控制阀 OCV〔可选｜ICE/HEV｜ASSUMPTION｜演示假设〕
        - `ASSY-50-010` 润滑系统〔必选｜ICE/HEV〕
          - `PART-50-048` 机油泵（摆线式）〔必选｜ICE/HEV｜待几何依据〕
          - `PART-50-049` 机油集滤器与吸油管〔必选｜ICE/HEV｜ASSUMPTION｜演示假设〕
          - `PART-50-050` 机油滤清器〔必选｜ICE/HEV｜ASSUMPTION｜演示假设〕
          - `PART-50-051` 机油压力调节阀〔必选｜ICE/HEV｜ASSUMPTION｜演示假设〕
          - `PART-50-052` 机油冷却器〔可选｜ICE/HEV｜ASSUMPTION｜待几何依据〕
          - `PART-50-053` 机油尺与导管〔可选｜ICE/HEV｜ASSUMPTION｜演示假设〕
          - `PART-50-054` 机油（消耗品）〔必选｜ICE/HEV｜ASSUMPTION〕
        - `ASSY-50-011` 燃油供给与喷射〔必选｜ICE/HEV〕
          - `PART-50-055` 高压油泵 HDP（直喷）〔可选｜ICE/HEV｜待几何依据〕
          - `PART-50-056` 燃油轨〔必选｜ICE/HEV｜待几何依据〕
          - `PART-50-057` 喷油器〔必选｜ICE/HEV｜待几何依据〕
          - `PART-50-058` 燃油压力调节器〔必选｜ICE/HEV｜ASSUMPTION｜演示假设〕
          - `PART-50-059` 高压油管与接头〔可选｜ICE/HEV｜ASSUMPTION｜演示假设〕
        - `ASSY-50-012` 点火系统〔必选｜ICE/HEV〕
          - `PART-50-060` 点火线圈〔必选｜ICE/HEV｜待几何依据〕
          - `PART-50-061` 火花塞〔必选｜ICE/HEV｜ASSUMPTION｜演示假设〕
        - `ASSY-50-013` 进排气系统〔必选｜ICE/HEV〕
          - `PART-50-062` 节气门体〔必选｜ICE/HEV｜ASSUMPTION｜待几何依据〕
          - `PART-50-063` 进气歧管与稳压腔〔必选｜ICE/HEV｜ASSUMPTION｜待几何依据〕
          - `PART-50-064` 空气滤清器与进气管〔必选｜ICE/HEV｜ASSUMPTION｜演示假设〕
          - `PART-50-065` 排气歧管〔必选｜ICE/HEV｜待几何依据〕
          - `PART-50-066` 涡轮增压器与废气旁通阀〔可选｜ICE/HEV｜ASSUMPTION｜待几何依据〕
          - `PART-50-067` EGR 阀与 PCV 阀〔可选｜ICE/HEV｜ASSUMPTION｜演示假设〕
          - `PART-50-068` 催化器与排气后处理〔必选｜ICE/HEV｜ASSUMPTION｜暂缓〕
          - `PART-50-069` 消声器与尾管〔必选｜ICE/HEV｜ASSUMPTION｜演示假设〕
          - `PART-50-078` 排气吊挂与隔热罩〔必选｜ICE/HEV｜ASSUMPTION｜演示假设〕
          - `REF-50-005` 氧/空燃比传感器（引用 SYS-90） 引用→ `PART-90-025`
          - `REF-50-007` 中冷器（引用 SYS-80） 引用→ `PART-80-011`
        - `ASSY-50-014` 附件驱动〔必选｜ICE/HEV｜ASSUMPTION〕
          - `PART-50-070` 多楔带〔必选｜ICE/HEV｜ASSUMPTION｜待几何依据〕
          - `PART-50-071` 皮带张紧器与惰轮〔必选｜ICE/HEV｜ASSUMPTION｜演示假设〕
          - `PART-50-072` 发电机〔必选｜ICE/HEV｜ASSUMPTION｜待几何依据〕
          - `PART-50-073` 空调压缩机（皮带驱动）〔可选｜ICE/HEV｜ASSUMPTION｜待几何依据〕
          - `PART-50-074` 附件支架与螺栓〔必选｜ICE/HEV｜ASSUMPTION｜演示假设〕
        - `ASSY-50-016` 起动系统〔必选｜ICE/HEV｜ASSUMPTION〕
          - `PART-50-076` 起动机（含电磁开关）〔必选｜ICE/HEV｜ASSUMPTION｜待几何依据〕
          - `PART-50-077` 起动机安装螺栓与定位销〔必选｜ICE/HEV｜ASSUMPTION｜演示假设〕
          - `REF-50-011` 起动继电器与保险丝（引用 SYS-90） 引用→ `PART-90-042`
        - `ASSY-50-017` 驾驶员扭矩输入（油门踏板）〔必选｜ICE/HEV｜ASSUMPTION〕
          - `PART-50-090` 电子油门踏板模块〔必选｜ICE/HEV｜ASSUMPTION｜待几何依据〕
          - `PART-50-091` 油门踏板支架与螺栓〔必选｜ICE/HEV｜ASSUMPTION｜演示假设〕
          - `REF-50-012` 加速踏板位置传感器信号身份（引用 SYS-90） 引用→ `PART-90-034`
        - `PART-50-075` 发动机装饰罩〔可选｜ICE/HEV｜ASSUMPTION｜演示假设〕
        - `REF-50-001` 发动机 ECU（引用 SYS-90） 引用→ `PART-90-001`
        - `REF-50-002` 曲轴位置传感器（引用 SYS-90） 引用→ `PART-90-021`
        - `REF-50-003` 凸轮轴位置传感器（引用 SYS-90） 引用→ `PART-90-022`
        - `REF-50-004` 爆震传感器（引用 SYS-90） 引用→ `PART-90-023`
        - `REF-50-006` 水泵与节温器（引用 SYS-80） 引用→ `ASSY-80-002`
    - `SUB-50-02` 电驱动系统〔必选｜BEV〕
      - `ASSY-50-020` 电驱总成（PE 模块：电机+减速器+逆变器集成）〔择一｜BEV｜组:CG-POWER〕
        - `ASSY-50-021` 驱动电机〔必选｜BEV〕
          - `PART-50-080` 定子（含绕组）〔必选｜BEV｜待几何依据〕
          - `PART-50-081` 转子（含永磁体）〔必选｜BEV｜待几何依据〕
          - `PART-50-082` 电机轴承〔必选｜BEV｜ASSUMPTION｜待几何依据〕
          - `PART-50-083` 电机壳体与冷却水套〔必选｜BEV｜待几何依据〕
          - `PART-50-084` 电机轴油封〔必选｜BEV｜ASSUMPTION｜演示假设〕
          - `REF-50-008` 旋变/转子位置传感器（引用 SYS-90） 引用→ `PART-90-028`
        - `ASSY-50-022` 逆变器（功率电子）〔必选｜BEV〕
          - `PART-50-085` 功率模块（SiC MOSFET）〔必选｜BEV｜待几何依据〕
          - `PART-50-086` 栅极驱动板〔必选｜BEV｜待几何依据〕
          - `PART-50-087` 直流母线电容〔必选｜BEV｜OPEN｜待几何依据〕
          - `PART-50-088` 逆变器控制板〔必选｜BEV｜OPEN｜待几何依据〕
          - `PART-50-089` 逆变器壳体与冷却板〔必选｜BEV｜ASSUMPTION｜待几何依据〕
          - `REF-50-009` 相电流传感器（引用 SYS-90） 引用→ `PART-90-029`
        - `REF-50-010` 单速减速器（引用 SYS-60） 引用→ `ASSY-60-020`
  - `SYS-60` 动力传递〔必选｜ASSUMPTION〕
    - `SUB-60-01` 变速/减速装置〔必选｜ASSUMPTION〕
      - `ASSY-60-001` 手动变速箱 MT〔择一｜ICE/HEV｜ASSUMPTION｜组:CG-TRANS〕
        - `PART-60-001` 变速箱壳体〔必选｜ICE/HEV｜ASSUMPTION｜待几何依据〕
        - `PART-60-002` 输入轴〔必选｜ICE/HEV｜ASSUMPTION｜待几何依据〕
        - `PART-60-003` 输出轴〔必选｜ICE/HEV｜ASSUMPTION｜待几何依据〕
        - `PART-60-004` 各档齿轮组〔必选｜ICE/HEV｜ASSUMPTION｜待几何依据〕
        - `PART-60-005` 同步器总成〔必选｜ICE/HEV｜ASSUMPTION｜待几何依据〕
        - `PART-60-006` 换挡拨叉与导轨〔必选｜ICE/HEV｜ASSUMPTION｜待几何依据〕
        - `PART-60-007` 变速箱轴承组〔必选｜ICE/HEV｜ASSUMPTION｜待几何依据〕
        - `PART-60-008` 变速箱油封组〔必选｜ICE/HEV｜ASSUMPTION｜演示假设〕
        - `PART-60-009` 变速箱油（消耗品）〔必选｜ICE/HEV｜ASSUMPTION〕
        - `PART-60-010` 壳体螺栓与定位销〔必选｜ICE/HEV｜ASSUMPTION｜演示假设〕
      - `ASSY-60-002` 自动变速箱 AT〔择一｜ICE/HEV｜ASSUMPTION｜组:CG-TRANS〕
        - `PART-60-011` 液力变矩器〔必选｜ICE/HEV｜ASSUMPTION｜待几何依据〕
        - `PART-60-012` 行星齿轮组〔必选｜ICE/HEV｜ASSUMPTION｜待几何依据〕
        - `PART-60-013` 离合器与制动器片组〔必选｜ICE/HEV｜ASSUMPTION｜待几何依据〕
        - `PART-60-014` 阀体与电磁阀〔必选｜ICE/HEV｜ASSUMPTION｜暂缓〕
        - `PART-60-015` 变速箱油泵〔必选｜ICE/HEV｜ASSUMPTION｜待几何依据〕
        - `PART-60-016` AT 壳体与油底壳〔必选｜ICE/HEV｜ASSUMPTION｜待几何依据〕
        - `PART-60-017` AT 轴承与油封组〔必选｜ICE/HEV｜ASSUMPTION｜演示假设〕
        - `REF-60-001` 变速箱控制单元 TCU（引用 SYS-90） 引用→ `PART-90-002`
      - `ASSY-60-020` 单速减速器（电驱）〔择一｜BEV｜组:CG-TRANS〕
        - `PART-60-030` 减速器壳体〔必选｜BEV｜ASSUMPTION｜待几何依据〕
        - `PART-60-031` 输入齿轮与轴〔必选｜BEV｜ASSUMPTION｜待几何依据〕
        - `PART-60-032` 中间/输出齿轮与轴〔必选｜BEV｜ASSUMPTION｜待几何依据〕
        - `PART-60-033` 减速器轴承组〔必选｜BEV｜ASSUMPTION｜待几何依据〕
        - `PART-60-034` 减速器油封与润滑油〔必选｜BEV｜ASSUMPTION｜演示假设〕
        - `REF-60-002` 差速器总成（引用 ASSY-60-011） 引用→ `ASSY-60-011`
    - `SUB-60-02` 离合、传动轴与分动〔必选｜ASSUMPTION〕
      - `ASSY-60-003` 离合器总成（MT）〔可选｜ICE/HEV｜ASSUMPTION〕
        - `PART-60-040` 离合器从动盘〔必选｜ICE/HEV｜ASSUMPTION｜待几何依据〕
        - `PART-60-041` 压盘总成〔必选｜ICE/HEV｜ASSUMPTION｜待几何依据〕
        - `PART-60-042` 分离轴承与分离拨叉〔必选｜ICE/HEV｜ASSUMPTION｜演示假设〕
        - `PART-60-043` 离合器主缸/工作缸或拉索〔必选｜ICE/HEV｜ASSUMPTION｜演示假设〕
      - `ASSY-60-004` 传动轴总成（RWD/AWD）〔可选｜ICE/HEV｜ASSUMPTION〕
        - `PART-60-044` 前/后传动轴管〔必选｜ICE/HEV｜ASSUMPTION｜待几何依据〕
        - `PART-60-045` 万向节〔必选｜ICE/HEV｜ASSUMPTION｜待几何依据〕
        - `PART-60-046` 中间支承轴承与支架〔可选｜ICE/HEV｜ASSUMPTION｜演示假设〕
        - `PART-60-047` 伸缩花键与防尘罩〔必选｜ICE/HEV｜ASSUMPTION｜演示假设〕
        - `PART-60-048` 传动轴法兰螺栓〔必选｜ICE/HEV｜ASSUMPTION｜演示假设〕
      - `ASSY-60-005` 分动箱（AWD/越野）〔可选｜BOF｜ICE/HEV｜ASSUMPTION〕
        - `PART-60-049` 分动箱壳体〔必选｜BOF｜ICE/HEV｜ASSUMPTION｜待几何依据〕
        - `PART-60-050` 分动链条或齿轮组〔必选｜BOF｜ICE/HEV｜ASSUMPTION｜待几何依据〕
        - `PART-60-051` 高低档切换机构〔可选｜BOF｜ICE/HEV｜ASSUMPTION｜待几何依据〕
        - `PART-60-052` 中央差速器与差速锁〔可选｜BOF｜ICE/HEV｜ASSUMPTION｜待几何依据〕
        - `PART-60-053` 分动箱轴承油封与油液〔必选｜BOF｜ICE/HEV｜ASSUMPTION｜演示假设〕
      - `ASSY-60-006` 换挡与离合操纵机构〔可选｜ICE/HEV｜ASSUMPTION〕
        - `PART-60-071` 换挡杆/选挡开关〔必选｜ICE/HEV｜ASSUMPTION｜演示假设〕
        - `PART-60-072` 换挡拉索/连杆与支架〔必选｜ICE/HEV｜ASSUMPTION｜待几何依据〕
        - `PART-60-073` 离合器踏板与回位弹簧〔可选｜ICE/HEV｜ASSUMPTION｜待几何依据〕
    - `SUB-60-03` 差速器与半轴〔必选｜ASSUMPTION〕
      - `ASSY-60-010` 整体桥主减速器与差速器总成〔可选｜BOF｜ASSUMPTION〕
        - `PART-60-054` 主动锥齿轮〔必选｜BOF｜ASSUMPTION｜待几何依据〕
        - `PART-60-055` 从动锥齿轮（盆齿）〔必选｜BOF｜ASSUMPTION｜待几何依据〕
        - `PART-60-056` 差速器壳〔必选｜BOF｜ASSUMPTION｜待几何依据〕
        - `PART-60-057` 行星齿轮与半轴齿轮〔必选｜BOF｜ASSUMPTION｜待几何依据〕
        - `PART-60-058` 行星齿轮十字轴与止推垫片〔必选｜BOF｜ASSUMPTION｜演示假设〕
        - `PART-60-059` 主减速器轴承组〔必选｜BOF｜ASSUMPTION｜待几何依据〕
        - `PART-60-060` 主减速器油封与调整垫片〔必选｜BOF｜ASSUMPTION｜演示假设〕
        - `PART-60-061` 桥壳内半轴〔必选｜BOF｜ASSUMPTION｜待几何依据〕
        - `PART-60-062` 差速锁执行机构〔可选｜BOF｜ASSUMPTION｜待几何依据〕
      - `ASSY-60-011` 独立悬架差速器总成（前/后）〔可选｜ASSUMPTION〕
        - `PART-60-063` 主减速器齿轮对〔必选｜ASSUMPTION｜待几何依据〕
        - `PART-60-064` 差速器壳与齿轮组〔必选｜ASSUMPTION｜待几何依据〕
        - `PART-60-065` 差速器轴承油封与安装支架〔必选｜ASSUMPTION｜演示假设〕
      - `ASSY-60-012` 半轴总成（驱动轮端）〔可选｜ASSUMPTION〕
        - `PART-60-021` 半轴外端球笼（轮端侧）〔必选｜ASSUMPTION｜待几何依据〕
        - `PART-60-066` 半轴内端球笼/三销节（差速器侧）〔必选｜ASSUMPTION｜待几何依据〕
        - `PART-60-067` 半轴杆〔必选｜ASSUMPTION｜待几何依据〕
        - `PART-60-068` 球笼防尘罩与卡箍〔必选｜ASSUMPTION｜演示假设〕
        - `PART-60-069` 半轴卡簧与锁紧螺母〔必选｜ASSUMPTION｜演示假设〕
        - `PART-60-070` 球笼润滑脂（消耗品）〔必选｜ASSUMPTION〕
    - `SUB-60-04` 传动基准〔必选｜OPEN〕
      - `DAT-60-001` 各档传动比与主减速比〔必选〕
      - `DAT-60-002` 传动轴夹角与万向节相位〔必选｜ICE/HEV｜OPEN〕
      - `DAT-60-003` 半轴长度与最大摆角〔必选｜OPEN〕
      - `DAT-60-004` 差速器锁止率与扭矩分配〔必选｜OPEN〕
  - `SYS-70` 能源供给与储存〔必选〕
    - `SUB-70-01` 燃油系统〔必选｜ICE/HEV〕
      - `ASSY-70-001` 燃油箱总成〔必选｜ICE/HEV｜ASSUMPTION〕
        - `PART-70-001` 油箱本体〔必选｜ICE/HEV｜ASSUMPTION｜待几何依据〕
        - `PART-70-002` 油箱绑带与托架〔必选｜ICE/HEV｜ASSUMPTION｜演示假设〕
        - `PART-70-003` 加油口颈与油箱盖〔必选｜ICE/HEV｜ASSUMPTION｜演示假设〕
        - `PART-70-004` 燃油泵模块（含液位传感器）〔必选｜ICE/HEV｜待几何依据〕
        - `PART-70-005` 燃油滤清器〔必选｜ICE/HEV｜ASSUMPTION｜演示假设〕
        - `PART-70-006` 通气管与碳罐〔必选｜ICE/HEV｜ASSUMPTION｜暂缓〕
      - `ASSY-70-002` 燃油管路〔必选｜ICE/HEV｜ASSUMPTION〕
        - `PART-70-007` 供油/回油管与接头〔必选｜ICE/HEV｜ASSUMPTION｜待几何依据〕
        - `PART-70-008` 燃油（消耗品）〔必选｜ICE/HEV｜ASSUMPTION〕
    - `SUB-70-02` 低压电源〔必选｜ASSUMPTION〕
      - `ASSY-70-003` 低压蓄电池〔必选｜ASSUMPTION〕
        - `PART-70-009` 12V 蓄电池〔必选｜ASSUMPTION｜待几何依据〕
        - `PART-70-010` 电池托盘与压板〔必选｜ASSUMPTION｜演示假设〕
        - `PART-70-011` 端子线夹与电池传感器 IBS〔必选｜ASSUMPTION｜演示假设〕
      - `ASSY-70-004` DC-DC 变换器〔必选｜BEV/HEV〕
        - `PART-70-012` DC-DC 本体与安装支架〔必选｜BEV/HEV｜ASSUMPTION｜待几何依据〕
    - `SUB-70-03` 高压储能〔必选｜BEV/HEV〕
      - `ASSY-70-005` 动力电池包〔必选｜BEV/HEV〕
        - `PART-70-013` 电芯〔必选｜BEV/HEV｜待几何依据〕
        - `PART-70-014` 模组框架与端板〔必选｜BEV/HEV｜待几何依据〕
        - `PART-70-015` 母排与电芯互连〔必选｜BEV/HEV｜OPEN｜待几何依据〕
        - `PART-70-016` 电池冷却板〔必选｜BEV/HEV｜待几何依据〕
        - `PART-70-017` 包壳体/托盘〔必选｜BEV/HEV｜待几何依据〕
        - `PART-70-018` 包盖与密封〔必选｜BEV/HEV｜OPEN｜待几何依据〕
        - `PART-70-019` 电池包固定螺栓与支撑结构〔必选｜BEV/HEV｜待几何依据〕
        - `PART-70-020` 泄压阀/防爆阀〔必选｜BEV/HEV｜OPEN｜待几何依据〕
        - `PART-70-021` 维修断开开关 MSD〔必选｜BEV/HEV｜OPEN｜待几何依据〕
      - `ASSY-70-006` 电池断开单元 BDU〔必选｜BEV/HEV〕
        - `PART-70-022` 主接触器（正/负）〔必选｜BEV/HEV｜待几何依据〕
        - `PART-70-023` 预充接触器与预充电阻〔必选｜BEV/HEV｜OPEN｜待几何依据〕
        - `PART-70-024` 烟火式熔断器 pyrofuse〔必选｜BEV/HEV｜待几何依据〕
        - `PART-70-025` 分流器/ pack 电流传感器〔必选｜BEV/HEV｜待几何依据〕
        - `PART-70-026` BDU 壳体与母排〔必选｜BEV/HEV｜ASSUMPTION｜待几何依据〕
      - `ASSY-70-007` 电池管理系统 BMS〔必选｜BEV/HEV〕
        - `PART-70-027` BMS 主控单元〔必选｜BEV/HEV｜待几何依据〕
        - `PART-70-028` 电芯监控电路 CSC（从板）〔必选｜BEV/HEV｜待几何依据〕
        - `PART-70-029` 绝缘监测与高压互锁 HVIL〔必选｜BEV/HEV｜待几何依据〕
    - `SUB-70-04` 充电〔必选｜BEV/HEV〕
      - `ASSY-70-008` 充电口与车载充电〔必选｜BEV/HEV〕
        - `PART-70-030` 充电口（AC/DC）与锁止机构〔必选｜BEV/HEV｜OPEN｜待几何依据〕
        - `PART-70-031` 车载充电机 OBC / 集成 ICCU〔必选｜BEV/HEV｜待几何依据〕
    - `SUB-70-05` 高压配电与安全〔必选｜BEV/HEV｜OPEN〕
      - `ASSY-70-009` 高压配电与线束〔必选｜BEV/HEV｜OPEN〕
        - `PART-70-032` 高压线束（含屏蔽）〔必选｜BEV/HEV｜OPEN｜待几何依据〕
        - `PART-70-033` 高压接插件与互锁端子〔必选｜BEV/HEV｜OPEN｜待几何依据〕
        - `PART-70-034` 高压配电盒〔可选｜BEV/HEV｜OPEN｜待几何依据〕
    - `SUB-70-06` 能源基准〔必选｜OPEN〕
      - `DAT-70-001` 油箱容积与燃油消耗〔必选｜ICE/HEV｜OPEN〕
      - `DAT-70-002` 电池容量/电压平台/串并联数〔必选｜BEV/HEV｜OPEN〕
      - `DAT-70-003` 低压电压与高压安全边界〔必选〕
  - `SYS-80` 热管理、润滑与流体〔必选〕
    - `SUB-80-01` 发动机冷却回路〔必选｜ICE/HEV｜ASSUMPTION〕
      - `ASSY-80-001` 散热器与风扇模块〔必选｜ICE/HEV｜ASSUMPTION〕
        - `PART-80-001` 散热器〔必选｜ICE/HEV｜ASSUMPTION｜待几何依据〕
        - `PART-80-002` 冷却风扇与驱动〔必选｜ICE/HEV｜ASSUMPTION｜待几何依据〕
        - `PART-80-003` 风扇护罩与安装支架〔必选｜ICE/HEV｜ASSUMPTION｜演示假设〕
        - `PART-80-004` 散热器上下水管与卡箍〔必选｜ICE/HEV｜ASSUMPTION｜待几何依据〕
        - `PART-80-005` 膨胀水箱与压力盖〔必选｜ICE/HEV｜ASSUMPTION｜演示假设〕
      - `ASSY-80-002` 水泵与节温器总成〔必选｜ICE/HEV〕
        - `PART-80-006` 水泵（机械/电子）〔必选｜ICE/HEV｜待几何依据〕
        - `PART-80-007` 节温器与壳体〔必选｜ICE/HEV｜ASSUMPTION｜待几何依据〕
        - `PART-80-008` 水泵密封与轴承〔必选｜ICE/HEV｜ASSUMPTION｜演示假设〕
        - `PART-80-009` 旁通阀与管路〔必选｜ICE/HEV｜ASSUMPTION｜演示假设〕
      - `ASSY-80-003` 增压空气冷却〔可选｜ICE/HEV｜ASSUMPTION〕
        - `PART-80-011` 中冷器〔必选｜ICE/HEV｜ASSUMPTION｜待几何依据〕
        - `PART-80-012` 中冷器管路与卡箍〔必选｜ICE/HEV｜ASSUMPTION｜演示假设〕
      - `PART-80-010` 冷却液（消耗品）〔必选｜ASSUMPTION〕
    - `SUB-80-02` 电驱与电池热管理〔必选｜BEV/HEV〕
      - `ASSY-80-004` 电驱冷却回路〔必选｜BEV/HEV〕
        - `PART-80-020` 电子冷却水泵〔必选｜BEV/HEV｜待几何依据〕
        - `PART-80-021` 低温散热器〔必选｜BEV/HEV｜ASSUMPTION｜待几何依据〕
        - `PART-80-022` 多通冷却液阀〔必选｜BEV/HEV｜OPEN｜待几何依据〕
        - `PART-80-023` 电机油冷器与喷淋喷嘴〔可选｜BEV/HEV｜待几何依据〕
      - `ASSY-80-005` 电池热管理回路〔必选｜BEV/HEV〕
        - `PART-80-024` 制冷剂-冷却液换热器 chiller〔必选｜BEV/HEV｜OPEN｜待几何依据〕
        - `PART-80-025` PTC 加热器〔必选｜BEV/HEV｜待几何依据〕
        - `PART-80-026` 热泵总成（选配）〔可选｜BEV/HEV｜待几何依据〕
        - `PART-80-027` 电池回路水管与接插件〔必选｜BEV/HEV｜ASSUMPTION｜待几何依据〕
    - `SUB-80-03` 空调 HVAC〔可选｜ASSUMPTION〕
      - `ASSY-80-006` 空调制冷回路〔必选｜ASSUMPTION〕
        - `PART-80-030` 空调压缩机（皮带/电动）〔必选｜ASSUMPTION｜待几何依据〕
        - `PART-80-031` 冷凝器与膨胀阀〔必选｜ASSUMPTION｜待几何依据〕
        - `PART-80-032` 蒸发器与储液干燥器〔必选｜ASSUMPTION｜待几何依据〕
        - `PART-80-033` 制冷剂管路与制冷剂〔必选｜ASSUMPTION｜待几何依据〕
      - `ASSY-80-007` HVAC 风箱与送风〔必选｜ASSUMPTION〕
        - `PART-80-034` 风箱壳体与鼓风机〔必选｜ASSUMPTION｜待几何依据〕
        - `PART-80-035` 混合/模式风门与执行器〔必选｜ASSUMPTION｜演示假设〕
        - `PART-80-036` 空调滤芯与出风口/除霜风管〔必选｜ASSUMPTION｜演示假设〕
    - `SUB-80-04` 热管理基准〔必选｜OPEN〕
      - `DAT-80-001` 冷却液流量与温度目标〔必选｜OPEN〕
      - `DAT-80-002` 电池温度窗口与回路拓扑/阀状态〔必选｜BEV/HEV｜OPEN〕
  - `SYS-90` 电气电子、通信和控制〔必选｜ASSUMPTION〕
    - `SUB-90-01` 控制器与计算〔必选〕
      - `ASSY-90-001` 控制器组〔必选〕
        - `PART-90-001` 发动机 ECU〔必选｜ICE/HEV｜演示假设〕
        - `PART-90-002` 变速箱 TCU〔可选｜ICE/HEV｜ASSUMPTION｜演示假设〕
        - `PART-90-003` 整车控制器 VCU / 域控制器〔必选｜ASSUMPTION｜演示假设〕
        - `PART-90-004` EPS 控制单元〔可选｜ASSUMPTION｜演示假设〕
        - `PART-90-005` 制动助力控制单元〔可选｜演示假设〕
        - `PART-90-006` EPB 控制单元〔可选｜ASSUMPTION｜演示假设〕
        - `PART-90-007` ABS/ESC 控制单元〔必选｜演示假设〕
        - `PART-90-008` 车身控制器 BCM〔必选｜ASSUMPTION｜演示假设〕
        - `PART-90-009` 网关〔必选｜ASSUMPTION｜演示假设〕
        - `PART-90-010` 热管理控制器〔可选｜BEV/HEV｜ASSUMPTION｜演示假设〕
        - `PART-90-012` 气囊控制单元 ACU〔必选｜ASSUMPTION｜演示假设〕
    - `SUB-90-02` 传感器〔必选〕
      - `ASSY-90-002` 底盘与车身传感器组〔必选〕
        - `PART-90-020` 轮速传感器〔必选｜待几何依据〕
        - `PART-90-030` 转向角传感器〔必选｜ASSUMPTION｜演示假设〕
        - `PART-90-031` 横摆角速度与加速度传感器〔必选｜ASSUMPTION｜演示假设〕
        - `PART-90-032` 碰撞传感器〔必选｜ASSUMPTION｜演示假设〕
        - `PART-90-033` 胎压传感器 TPMS〔可选｜ASSUMPTION｜演示假设〕
      - `ASSY-90-003` 动力总成传感器组〔必选｜ASSUMPTION〕
        - `PART-90-021` 曲轴位置传感器〔必选｜ICE/HEV｜ASSUMPTION｜演示假设〕
        - `PART-90-022` 凸轮轴位置传感器〔必选｜ICE/HEV｜ASSUMPTION｜演示假设〕
        - `PART-90-023` 爆震传感器〔可选｜ICE/HEV｜ASSUMPTION｜演示假设〕
        - `PART-90-024` 空气流量/进气压力传感器〔必选｜ICE/HEV｜ASSUMPTION｜演示假设〕
        - `PART-90-025` 氧/空燃比传感器〔必选｜ICE/HEV｜ASSUMPTION｜演示假设〕
        - `PART-90-026` 冷却液温度传感器〔必选｜ASSUMPTION｜演示假设〕
        - `PART-90-027` 机油压力传感器〔必选｜ICE/HEV｜ASSUMPTION｜演示假设〕
        - `PART-90-028` 电机旋变/位置传感器〔必选｜BEV/HEV｜OPEN｜待几何依据〕
        - `PART-90-029` 逆变器相电流传感器〔必选｜BEV/HEV｜OPEN｜待几何依据〕
        - `PART-90-034` 加速踏板位置传感器〔必选｜ICE/HEV｜ASSUMPTION｜演示假设〕
    - `SUB-90-03` 线束与配电〔必选｜ASSUMPTION〕
      - `ASSY-90-004` 低压线束与配电〔必选｜ASSUMPTION〕
        - `PART-90-011` 时钟弹簧/螺旋电缆〔必选｜OPEN｜待几何依据〕
        - `PART-90-040` 主线束/发动机线束/底盘线束/仪表板线束〔必选｜ASSUMPTION｜待几何依据〕
        - `PART-90-041` 接插件与端子〔必选｜ASSUMPTION｜演示假设〕
        - `PART-90-042` 保险丝盒与继电器〔必选｜ASSUMPTION｜演示假设〕
        - `PART-90-043` 接地点与线束固定件〔必选｜ASSUMPTION｜演示假设〕
    - `SUB-90-04` 人机接口与显示〔必选｜ASSUMPTION〕
      - `ASSY-90-005` 仪表与车机〔必选｜ASSUMPTION〕
        - `PART-90-050` 组合仪表〔必选｜ASSUMPTION｜演示假设〕
        - `PART-90-051` 中控屏与车机主机〔可选｜ASSUMPTION｜演示假设〕
        - `PART-90-052` 方向盘开关与诊断接口〔必选｜ASSUMPTION｜演示假设〕
        - `PART-90-054` 喇叭与喇叭开关〔必选｜ASSUMPTION｜演示假设〕
    - `SUB-90-05` 电气基准〔必选｜OPEN〕
      - `DAT-90-001` 低压电压与接地策略〔必选｜OPEN〕
      - `DAT-90-002` 网络拓扑与信号/诊断接口〔必选｜OPEN〕
      - `DAT-90-003` 高压安全边界与功能安全等级〔必选｜BEV/HEV〕
<!-- RP01:PBS-TREE:END -->

---

## 5. 两个深钻样例

### 5.1 双叉臂轮端 `ASSY-30-001`（41 节点，总成下 3 级）

层级：`SYS-30 → SUB-30-01 → ASSY-30-001 → ASSY-30-002/003/004 → ASSY-30-005 → PART`

**已核实的关键结构事实（S05/S06/S04，本人独立复核 S05）**：

- HBU1 = 双列角接触球轴承 + 配对滚道球组 + 多唇密封，**轮毂是独立件**，转向节提供轴承座孔。
- HBU2 把法兰与**轴承外圈**集成（旋转外圈取代传统轮毂）——不是内圈。
- HBU3 有**两个法兰**：一个用于车轮与制动盘安装，另一个用于把单元固定到悬架；**内侧球列仍保留一个独立内圈**（`PART-30-011`）。
- **纠正**："Gen3 = 单一整体件"是错的。最容易漏掉的零件就是那个独立内圈。
- **纠正**：ABS 磁性编码环是**选配**，不是代际定义特征（S05"available with"、S04"with and without"）；Bosch 传感器也可读钢质齿圈（S10）。

**下钻到的固定件与复用件**：轴承外圈/内圈/滚动体/保持架/多唇密封/编码环/压装螺柱/锁紧螺母或铆压边/轴头卡簧/单元安装螺栓/车轮螺栓螺母（按座型）/制动盘定位螺钉/轴头防尘盖/气门嘴/平衡块/中心盖。轮胎作为外购不可拆总成，内部分层（内衬层/帘布层/冠部帘层与帽层/胎侧/胎圈钢丝/胎面，S15）只作示意，**不是可更换零件身份**。

**跨系统引用（5 个 REF）**：制动盘总成→SYS-40、卡钳总成→SYS-40、转向节本体→SYS-20、半轴外端→SYS-60、轮速传感器→SYS-90。轮端总成可跨悬架拓扑复用，**但转向节不可**。

### 5.2 发动机 `ASSY-50-001`（105 节点，总成下 3 级）

层级：`SYS-50 → SUB-50-01 → ASSY-50-001 → ASSY-50-002 → ASSY-50-003 → PART`

| 机构 | 下钻到的零件 | 证据状态 |
|---|---|---|
| 活塞连杆组 | 活塞、活塞环组、活塞销、**销卡簧**、连杆本体、**连杆轴瓦**、**连杆螺栓**、小头衬套 | 活塞/环/销/连杆/轴瓦 EVIDENCE（S42/S43）；卡簧/螺栓/小头衬套 ASSUMPTION（S42 明确未覆盖） |
| 曲轴组 | 曲轴、主轴承轴瓦、主轴承盖、盖螺栓、止推垫片、前/后油封、键与定位销、扭转减振器、飞轮/柔性盘、飞轮齿圈、飞轮螺栓 | **整块 ASSUMPTION**——本轮无任何一手来源枚举曲轴组 |
| 缸体组 | 缸体、气缸套、堵盖/水套塞、定位销、油底壳、垫片与放油螺塞 | 气缸套 EVIDENCE（S43）；其余 ASSUMPTION |
| 缸盖与配气 | 缸盖、缸盖垫片、缸盖螺栓、气门导管、气门座圈、凸轮轴轴承、进/排气门、气门杆密封、气门弹簧、**上弹簧座**、**下弹簧座**、锁片、挺柱/滚子摇臂、进/排气凸轮轴、正时链/带、链轮、张紧器与导轨、VVT 相位器、OCV | 导管/座圈/杆密封/弹簧/**上下两个弹簧座**/凸轮轴 EVIDENCE（S44）；锁片/挺柱/凸轮轴承/正时/VVT ASSUMPTION（S44 明确未覆盖） |
| 润滑 | 摆线机油泵、集滤器、滤清器、压力调节阀、机油冷却器、机油尺、机油 | 机油泵 EVIDENCE（S40 连续可变容量摆线泵）；其余 ASSUMPTION |
| 燃油/点火 | 高压油泵 HDP、燃油轨、喷油器、压力调节器、高压油管、点火线圈、火花塞 | HDP/轨/喷油器/线圈 EVIDENCE（S41/S40/S46）；火花塞 ASSUMPTION（S46 明确未列） |
| 进排气/附件 | 节气门、进气歧管、空滤、排气歧管、涡轮、EGR/PCV、催化器、消声器、**排气吊挂与隔热罩**、多楔带、张紧器惰轮、发电机、皮带压缩机、支架 | 4-2-1 排气 EVIDENCE（S45）；其余 ASSUMPTION |
| 起动/驾驶员输入 | **起动机含电磁开关**、安装螺栓、**电子油门踏板模块**、踏板支架 | 全部 ASSUMPTION，由功能树反查补入 |

**两个重要分类发现**：

1. **零件/总成边界随供应商变化**。MAHLE "Power Cell Unit" 把活塞+环+销+缸套+连杆+轴瓦作为**一个供货单元**，而船用变体的同一句式**省略了连杆**（S42）。所以"连杆属于活塞总成还是独立总成"没有普遍答案，PBS 必须允许同一组零件在不同供货方案下归属不同层级。
2. **气门弹簧座有两个**。MAHLE 明确命名 "top and bottom valve spring retainer"（S44），常见示意图只画一个。本树建了 `PART-50-037` 与 `PART-50-038` 两个节点。

**纠正一个容易搞错的事实**：Mazda 2010 款 SKYACTIV-G 是**进气道喷射**（多孔喷油器+凹腔活塞），不是直喷；Toyota **D-4S** 才是正确的双喷射（进气道+直喷）示例（S45/S40）。

### 5.3 尚需取得几何依据的项目（这是真正的瓶颈）

由 `geomneeds` 命令从树自动导出，见 [`RP-01-geometry-needs.json`](../evidence/RP-01-geometry-needs.json)：

| geomBasis | 零件数 | 含义 |
|---|---|---|
| `SOURCED` | **0** | 有已核实几何来源 |
| `NEEDS_MEASUREMENT` | **261** | 必须取得公开来源或实测才能建模 |
| `DEMO_ASSUMPTION` | **216** | 可用显式演示假设建模（紧固件/密封/衬套等） |
| `DEFERRED` | **10** | 本轮决定不建模内部（阀片组、液压转阀、催化器、气体发生器内部等） |
| `NOT_APPLICABLE` | 6 | 消耗品（机油/燃油/制动液/冷却液/润滑脂/制冷剂），不是可 CAD 零件 |
| 合计 | 493 | |

优先系统缺口：SYS-20 **88**、SYS-50 **89**、SYS-40 **70**、SYS-60 **55**、SYS-30 **31**。

**必须如实说明**：产品树解决了"会不会漏机构"的问题，但**没有解决"尺寸从哪来"的问题**。0/493 个零件有已核实几何依据。唯一有 GEOMETRY 级实测的是 `hello_flange`（M04），而它是一个测试法兰，不是本树中的任何零件。下游若直接按本树建模，产出的全部是 ASSUMPTION 级资产，不得标为 GEOMETRY。

---

## 6. 功能树：独立视角，以及它抓到的 8 处遗漏

功能树（[`RP-01-function-tree.json`](../evidence/RP-01-function-tree.json)，77 节点）回答"车要做什么"，与产品树严格分离：功能节点一律 `FUNC-` 前缀，不得作为产品节点的父节点；产品节点只能通过引用关联。每个叶子功能用 `realizedBy` 指向产品树规范身份。

10 个功能域：驱动、制动、转向、承载导向隔振、热管理、供电储能、状态感知、乘员与部件保护、视野照明告知、进入承载使用。
覆盖状态：**65 REALIZED / 9 PARTIAL / 3 GAP**。

### 6.1 制动功能完整链（任务书要求的示例）

| 段 | 功能 | 硬件（跨系统） |
|---|---|---|
| ① | 驾驶员制动意图输入 | `ASSY-40-001` 踏板机构 |
| ② | 踏板力放大 | `ASSY-40-002` 真空助力 / `ASSY-40-003` 机电助力（纯电必选后者） |
| ③ | 机械力→液压压力 | `ASSY-40-004` 串列柱塞主缸 |
| ④ | 储存/补充制动液并告知液位 | `ASSY-40-005`（可集成于主缸，S11） |
| ⑤ | 传输压力并按回路分割 | `ASSY-40-006`，X 型对角分割（S09） |
| ⑥ | 轮端夹紧与摩擦 | `ASSY-40-008` 卡钳 + `ASSY-40-009` 制动盘 / `ASSY-40-010` 鼓式 |
| ⑦ | 电子调节各轮制动力 | `ASSY-40-015` 液压调节单元(SYS-40) + `PART-90-020` 轮速传感器(SYS-90) + `PART-30-016` 编码环(SYS-30) |
| ⑧ | 驻车保持 | 拉索 / 卡钳 EPB / **鼓式集成 EPB**（S12 EPB-Si） |
| ⑨ | 告知制动状态 | 制动灯开关 + 磨损传感器 + 尾灯 + 仪表 |
| ⑩ | 排出摩擦热并抑制衰退 | 通风盘筋 + **制动导风管**（反查补入） |

第⑦段跨三个物理系统，功能树把它们串成一条链，产品树保持各自唯一身份——这正是"功能树不能混同产品树"的具体含义。

### 6.2 反查发现并已补入的 8 处遗漏

| 功能 | 漏掉的机构 | 补入节点 |
|---|---|---|
| FUNC-DRV-06 起动内燃机 | **起动机**（飞轮齿圈存在就意味着必须有起动机） | `ASSY-50-016`、`PART-50-076/077`、`REF-50-011` |
| FUNC-DRV-07 导出废气并隔热 | 排气吊挂与隔热罩 | `PART-50-078` |
| FUNC-DRV-08 采集驾驶员扭矩请求 | **电子油门踏板模块**与支架、踏板位置传感器信号身份 | `ASSY-50-017`、`PART-50-090/091`、`REF-50-012`、`PART-90-034` |
| FUNC-DRV-09 选择挡位与接合动力 | **换挡杆/拉索、离合器踏板** | `ASSY-60-006`、`PART-60-071/072/073` |
| FUNC-BRK-10 排出摩擦热 | 制动导风管/冷却挡板 | `PART-40-071` |
| FUNC-VIS-04 声响告知 | **喇叭**与喇叭开关 | `PART-90-054` |
| FUNC-PRO-05 保护底盘部件 | **发动机/电池/差速器下护板** | `PART-100-023` |
| FUNC-ACC-05 防盗与起动授权 | 转向柱锁止/点火开关 | `PART-20-088` |

**为什么这很重要**：这 8 项全都是"看起来显而易见、但按系统逐层列举时容易漏"的机构。按部件列举时，注意力在"发动机有哪些零件"，就会漏掉"驾驶员怎么请求扭矩"。按动作列举能发现产品树的盲区。这就是任务书要求功能树作为独立视角的价值，也是回答"怎样确保不漏关键机构"的**可操作方法**：不是列更长的清单，而是换一个正交视角交叉检查，并让机器强制每个功能都有硬件。

### 6.3 仍然开放的 3 个功能缺口（不擅自扩范围）

| 功能 | 缺口 | 需谁决定 |
|---|---|---|
| `FUNC-SNS-07` 故障诊断/存储/读出 | 诊断接口硬件存在，但 DTC 定义、故障树、诊断协议、冻结帧完全未建 | 总控指派（GAP-015 / RP-06） |
| `FUNC-ACC-07` 拖挂挂车制动与电气接口 | 越野/皮卡拖挂需要挂车制动控制器与 7/13 针接口，本树无任何对应硬件 | 总控决定是否纳入首发范围 |
| `FUNC-ACC-08` 车辆外部标识与合规标记 | VIN 打刻、铭牌、胎压/载荷标签、高压警示标识都是实体件但未建 | 总控决定（GAP-014，不得用真实品牌 VIN/商标） |

---

## 7. 对顶层系统分类的修改建议

### 7.1 建议改组（均需总控审核，本文件不改种子）

| 编号 | 建议 | 理由 |
|---|---|---|
| **SYS-120** | **从实体 PBS 移出**，归"仿真环境定义" | 地面/水/冰雪/砂石/坡度不是车载零件。种子已注明，本树执行：只在 `nonPhysicalViews` 登记，不建实体节点 |
| **SYS-140** | **从实体 PBS 移出**，归功能树 | 软件行为不是实体产品。ECU 硬件留 SYS-90，行为用 FUNC 节点引用硬件 |
| **SYS-00** | 保留在树内，但叶子改为 `kind=datum` | 轴距/硬点/坐标约定是工程基准，**不是可 CAD 建模的零件**。新增 DAT- 前缀防止有人去"建模轴距" |
| **SYS-130** | 保留为 `kind=family` 目录，不是整车固定位置的总成 | 具体零件在所属系统建 PART，用 `familyRef` 指向家族。避免同一螺栓在 5 个系统重复建身份 |
| **新增两轴** | 用 `bodyStructure × powertrain` 替代单一"车型条件" | 见 §3，纯电不是车身结构 |
| **SYS-20 命名** | 建议改为"悬架、转向与车轮定位"，并在其下明确"拓扑是选择组" | 现名"车轴定位"容易与整体桥桥壳混淆；桥壳是 SYS-20 导向件，差速器是 SYS-60 |
| **传感器归属** | 统一归 SYS-90，机械系统只留安装支架 + REF | 本树采用此规则并全程一致（轮速传感器、发动机传感器、旋变、碰撞传感器）。**替代方案**是按物理位置归属（发动机传感器归 SYS-50），也可行，但必须二选一并写进规范，否则同一传感器会有两个身份 |
| **踏板归属** | 按功能归属：制动踏板→SYS-40，油门踏板→SYS-50，离合踏板→SYS-60 | 替代方案是全部归 SYS-100 座舱操纵件。本树选前者并记录理由，请总控裁决 |

### 7.2 典型的"不应错误混类"案例（全部有具体依据）

1. **把功能当零件**：不能建"悬架行驶舒适"节点。舒适性是 FUNC-SUS-02/03 的结果，硬件是弹簧与减振器。校验 R17 强制功能节点不得进产品树。
2. **把本体特征当零件**：转向节的上下球铰孔、轴承安装面、卡钳安装耳、主销轴线，以及主缸的补偿孔/回油孔、缸体的水套/主油道，都是**本体特征**，不是独立零件。本树只在 `geomNote` 里记录，不建 PART。
3. **把工程基准当零件**：轴距、PCD、ET、主销后倾角是 DAT，不是 PART。
4. **把消耗品当可建模零件**：机油/燃油/制动液/冷却液/润滑脂/制冷剂标 `geomBasis=NOT_APPLICABLE`，归 FAM-130-033 消耗品家族。
5. **把仿真环境当车载系统**：SYS-120 移出。
6. **把软件当硬件**：SYS-140 移出；"碰撞断开"是 BMS 功能而非独立零件（S52 明确 Schaeffler 把"检测碰撞事件、触发 pyrofuse"列在 BMS 内），接触器与 pyrofuse 建在 BDU 总成内。
7. **把跨系统共用件复制成多份**：制动盘物理上在轮端装配位置，但身份归 SYS-40，SYS-30 用 REF；编码环身份归 SYS-30，SYS-40 用 REF；时钟弹簧身份归 SYS-90，SYS-20 转向与 SYS-110 驾驶员气囊都用 REF。**一个实体只有一个规范父节点**，R07/R08/R09 强制。
8. **把内拉杆和外拉杆端合并成一个"拉杆"**：ZF/SKF 明确 axial joint（转向器侧）与 tie rod end（车轮侧）是两个不同零件（S01/S02）。
9. **把 Gen3 轮毂单元当成单一整体件**：它仍有独立内圈（S05）。
10. **把 ISO 6194 引到卡钳活塞密封**：ISO 6194-1 是**旋转轴唇形密封**（S21），卡钳矩形截面挤压密封不是唇形密封。本树把该密封家族标 OPEN 而不是硬套标准。
11. **把 ISO 15 当轮毂单元几何标准**：ISO 15 是径向轴承外形尺寸总方案，**不覆盖轮毂单元法兰**（S22）。
12. **把 FMVSS 301 当电动车电气安全**：301 是 **Fuel system integrity**（液体燃料完整性），不是电池安全（S76）。
13. **把"电机+逆变器+减速器"默认当三个独立可更换盒子**：Hyundai E-GMP 把三者集成为单一 PE 模块、ICCU 吸收充电功能"无需额外部件"（S48/S49）；Bosch eAxle 有 3-in-1/6-in-1（S54）。集成度是**变型属性**。
14. **把"EPB = 电机装在卡钳上"当唯一形式**：Continental EPB-Si 是**集成 EPB 的鼓式制动器**（S12）；ZF 页面本轮抓取文本**未确认**电机安装方式，行业媒体说法为 SNIPPET-ONLY，不采信（S14）。
15. **把网站组件名当汽车总成**：`src/parts/*.js` 的文件名不是产品身份。

---

## 8. 覆盖度审计：计划写了名字 ≠ 已覆盖

完整 36 项逐条判断见 [`RP-01-coverage-audit.json`](../evidence/RP-01-coverage-audit.json)（含 `planRef` 行号、`planQuote` 原文、判定理由、本地实测证据、对应树节点、下游任务）。计数由校验器 R24 核算，不靠手填。

**两个轴分开判**：`planVerdict` 只判总计划文本是否给出明确下游交付与测试；`implementationStatus` 单独记本地实测。这样才能证明"名称存在"不等于"已实现"。

| 判定 | 项数 | 说明 |
|---|---|---|
| `COVERED` | **2** | 仅 A15 四种验证等级（有定义+有下游+hello_flange 实测）、A21 目标目录"尚未创建"的诚实声明（计划与现实一致） |
| `MENTIONED` | **19** | 名称存在但无接口/无零件清单/无测试 |
| `MISSING` | **11** | 计划全文未列的真实系统或机构 |
| `UNKNOWN` | **4** | 资料无法确认或需决策 |

### 8.1 11 项 MISSING（计划全文未列）

乘员保护/气囊/安全带（A23）、能源供给油箱/低压电池/高压电池/BMS/充电（A24）、空调 HVAC（A25）、驾驶员输入机构油门/离合/换挡（A26）、起动机（A27）、灯具/喇叭/雨刮/后视镜（A28）、越野保护件下护板/拖车钩/备胎架（A29）、需求→测试双向追溯载体（A30）、诊断/故障/维护工序（A31）、拖挂制动接口与合规标识（A36）、纯电无真空源因此必须改机电助力这一跨系统强约束（A05）。

### 8.2 为什么"已有名称"不能当完整实现说明——三个可证伪的实测反例

1. **`drivetrain.js:7` 注释称"真实渐开线梯形齿"**，实际 `:24-44` 用固定角度比例（0.34/0.21/0.11）的 `lineTo` **直线段**拼齿廓，没有任何渐开线函数计算；`update()` 中差速器两侧输出**同角度**，无差速作用。→ 名称与注释都在，功能不存在。（M03，本人已读原文复核）
2. **`specs.js:253` 注释标"单位：米/千克/牛"**，但 `stiffness=32`、`dampingCompression=2.4`、`maxBrake=42` 是 cannon-es **质量归一化系数与制动冲量**，不是 N/m、N·s/m 或液压压力。→ 单位声明过度宣称。（M02，本人已读原文复核）
3. **`chassis.js:333` 卡钳是单个 `BoxGeometry(0.048,0.086,0.068)`**；全 `src/` 对 `bearing|seal|bushing|ballJoint` 四个词**零命中**。→ "制动/悬架已实现"的说法不成立。（M05，本人已执行 grep 复核）

### 8.3 一项可定案的文档缺项（不是代码冲突）

`MASTER_PLAN.md:85` 写"+X 为车辆一侧（按项目现有定义统一）…先确认当前 FL/FR 约定"——**计划自己承认尚未确认**。本轮实测已可定案：

- `chassis.js:285-291` cornerDefs：FL `side:1`、FR `side:-1`、RL `side:1`、RR `side:-1`
- `chassis.js:361` 注释：**"左轮(+X)外侧朝 +X，右轮(-X)外侧朝 -X"**
- `vehicleWorld.js:183-189`：`[0: FL (+X,+Z), 1: FR (-X,+Z), 2: RL (+X,-Z), 3: RR (-X,-Z)]`
- 前进为 +Z（前保险杠 z=+1.50、尾灯 z=−1.48、`engineForce` 负值推车向 +Z）

→ **+X = 左侧，+Y = 上，+Z = 前进，右手系成立（X×Y=Z），跨文件一致，无冲突**。建议总控据此冻结，并**显式声明这与 ISO 8855 常用的 X前/Y左/Z上 不同**，避免下游按标准默认解释。（M01，本人已读原文复核）

### 8.4 GAP_REGISTER 复核（归属 Qwen4 的 4 项 + 相关 3 项）

| GAP | 原判断 | 本轮判断 | 依据 |
|---|---|---|---|
| GAP-001 首发基型 | UNKNOWN | **CONFIRMED_GAP** | 只有轮端样件规格示例（:152），整车架构/动力/精度未定。提出 CFG-BOF-ICE 候选但标 PROPOSED_NOT_APPROVED |
| GAP-002 产品树能否拆到零件 | MENTIONED | **CONFIRMED_GAP_PARTIALLY_CLOSED** | 已拆到 493 零件含轴承/密封/螺栓/卡簧/连杆，标适用架构与必选可选；无限扩展风险用 deferredScope 收边界 |
| GAP-004 承载路径与架构差异 | MENTIONED | **CONFIRMED_GAP_PARTIALLY_CLOSED** | 已给 BOF/UNI 承载路径、车身悬置接口、副车架不同挂载对象；但悬置连接细节未取得 OEM 一手文本 |
| GAP-006 发动机建模层级 | MENTIONED | **CONFIRMED_GAP_PARTIALLY_CLOSED** | 已下钻到活塞环/销卡簧/连杆轴瓦/连杆螺栓/上下弹簧座/锁片/正时/VVT；曲轴组与正时驱动整块无来源 |
| GAP-003 接口/坐标/镜像 | MENTIONED | **NEEDS_DECISION** | 坐标可定案；左右镜像件身份语义需跨模型裁决 |
| GAP-008 衬套轴承密封紧固件验证 | MENTIONED | **CONFIRMED_GAP** | src 四词零命中；既有 params.json 标准引用可疑 |
| GAP-014 来源可用性与真实尺寸证明 | MENTIONED | **CONFIRMED_GAP** | 官方标准站点大面积不可达，导致 493/780 节点只能标 ASSUMPTION |

**另发现登记簿自身时效问题**：`GAP_REGISTER.md:4` 写"当前 308 行 MASTER_PLAN.md"，实测为 **334 行**（`wc -l`）。登记簿是对旧版本写的，RP-05 审计时需按当前文本复核。

---

## 9. 系统 → 下游验证类别映射

完整 15 系统映射 + 4 项横切验证见 [`RP-01-validation-map.json`](../evidence/RP-01-validation-map.json)。摘要：

| 系统 | 验证类别 | 目标等级 | 当前阻塞 |
|---|---|---|---|
| SYS-00 基准 | GEOMETRY/VARIANT/ASSEMBLY | GEOMETRY | 无硬点文件 |
| SYS-10 车身车架 | GEOMETRY/ASSEMBLY/VARIANT | GEOMETRY | 构件断面无来源 |
| SYS-20 悬架转向 | GEOMETRY/ASSEMBLY/KINEMATIC/VARIANT | KINEMATIC | 硬点全 OPEN、衬套刚度无来源 |
| SYS-30 轮端 | GEOMETRY/ASSEMBLY/KINEMATIC/VISUAL/PERFORMANCE | GEOMETRY | 轴承目录/轮辋轮廓/胎压无来源 |
| SYS-40 制动 | GEOMETRY/ASSEMBLY/FLUID/KINEMATIC/DYNAMIC | KINEMATIC | 液压尺寸与摩擦特性无来源 |
| SYS-50 动力源 | GEOMETRY/ASSEMBLY/KINEMATIC/FLUID/ELECTRICAL/THERMAL | KINEMATIC | 缸径行程/凸轮型线无来源 |
| SYS-60 传动 | GEOMETRY/KINEMATIC/DYNAMIC/VARIANT | KINEMATIC | 齿廓与差速作用现有实现不正确 |
| SYS-70 能源 | GEOMETRY/ASSEMBLY/ELECTRICAL/THERMAL/VARIANT | GEOMETRY | 电芯/母排/MSD/充电口无来源 |
| SYS-80 热管理 | FLUID/THERMAL/ASSEMBLY/VARIANT | GEOMETRY | chiller 与多通阀 OPEN |
| SYS-90 电气 | ELECTRICAL/ASSEMBLY/PERFORMANCE | GEOMETRY | 信号拓扑属 RP-02 |
| SYS-100 座舱 | GEOMETRY/KINEMATIC/VISUAL/PERFORMANCE | VISUAL | 非优先，已简化 |
| SYS-110 保护 | GEOMETRY/ASSEMBLY | VISUAL | 碰撞与认证 OUT_OF_SCOPE |
| SYS-130 通用件 | GEOMETRY/ASSEMBLY/VARIANT | GEOMETRY | 家族只有身份无参数维度 |
| SYS-120 环境（非实体） | DYNAMIC/PERFORMANCE | DYNAMIC | 建议移出 PBS |
| SYS-140 软件（非实体） | ELECTRICAL/DYNAMIC | DYNAMIC | 建议移出 PBS，诊断 GAP |

横切：XC-01 变型传播、XC-02 单位与坐标一致性、XC-03 来源与验证等级标注、XC-04 浏览器性能与可拆解。

### 9.1 首个纵切样板建议（G-PL4）

**建议选轮端 `ASSY-30-001` + 双叉臂 `ASSY-20-001`，而不是发动机。** 理由：

1. 轮端已有 `hello_flange` 的 GEOMETRY 级实测基础，链路风险最低；
2. 轮端是四角复用件，一个样板可验证 4 个实例与左右镜像；
3. 轮端跨 SYS-20/30/40/60/90 五个系统，能真正检验 REF 引用机制与单身份规则；
4. **发动机深钻的证据最薄**（曲轴组/正时驱动整块 ASSUMPTION），先做会把几何来源风险带进样板。

样板开工前必须先修：A33 标准引用、M03 渐开线过度宣称、A12 坐标定案。

---

## 10. 一项必须上报的跨代理风险（未修改对方任何文件）

本轮执行期间（2026-11-14 16:13–16:15），`cad/experiments/planning_feasibility/` 目录新出现，属 **Gemini 的 RP-04-S05**（任务卡状态仍为 `ready`、步骤未勾选），内含 `params.json`、`wheel_hub_assembly.py`、`blender_assembly_to_glb.py`，**无 README、无来源引用、无测试证据文件**。本人只读检查，发现三处需澄清：

| # | 事实（已本人读原文） | 问题 | 证据 |
|---|---|---|---|
| 1 | `params.json:30` 标 `bolt_hole_clearance_fit_iso273: "medium"`，但 `bolt_hole_diameter_mm: 15.0`（M14 螺柱） | 两个**独立**来源一致给出 ISO 273 M14 细/中/粗 = **15.0 / 15.5 / 16.5 mm**，故 15.0 属**细系列**，标签与数值不符 | X01、X02（本人抓取）；M09 |
| 2 | `wheel_hub_assembly.py:85` 断言消息称 `"ISO 273 requires >= {stud_d + 0.8} mm"` | ISO 273 是按系列**离散 tabulate** 孔径，不存在"公称+0.8"这种通用公式。这是把自造启发式**冒充标准** | M09 |
| 3 | `wheel_hub_assembly.py:5,147` 把**轮毂法兰孔**当螺栓通孔并套 ISO 273 | 量产轮端要么轮毂**攻丝**配车轮螺栓，要么**压装花键螺柱**配螺母，两者都不是轮毂通孔。作为可行性演示可接受，但必须显式标为演示简化，否则下游会当成真实轮端接口 | M09；S17（hub-piloted vs stud-piloted） |

**另需澄清**：同文件 `center_bore_mm: 67.1` 与 `pilot_diameter_mm: 84.0`。若两者指同一轮毂定心接口，则 Ø84 定心凸台无法进入 Ø67.1 中心孔，属几何干涉；若 `pilot` 指转向节侧轴承座凸台则是另一接口，84 合理。**本人不假定它是错误**，标为需澄清。

**处理建议**：退回 Gemini RP-04-S05 补充来源与演示简化声明；ISO 官方文本本轮不可达（iso.org 403），故 A33 判定为 `UNKNOWN` 而非断言错误。**本人未修改该目录任何文件。**

---

## 11. 来源与证据分级

[`RP-01-sources.json`](../evidence/RP-01-sources.json) 共 **82 条**：69 条外部、9 条本地实测、4 条项目内既有已核查研究；其中 **80 条可用于支持论断**，2 条（S28 SAE J670、S29 SAE J1100）为 SNIPPET_ONLY，`usedForClaim=false`。

每条都记录：实际抓取的 URL/路径、出版方、标题、发布或访问日期、检索者、状态、**可支持的具体论断**、**不可支持的范围**。厂商页面给出的数值一律标"来源自述示例，不是本项目设计值"（如 VW 408V/每模组 24 芯、Hyundai 八根长螺栓、Bosch 0.3 g 与 8 cm³/s）。

### 11.1 必须如实报告的资料可达性限制

本轮外部检索中，**`iso.org`、`sae.org`、`unece.org`、`eur-lex.europa.eu`、`ecfr.gov`、`nhtsa.gov`、GM IR、Stellantis media、NREL/DOE/Argonne 全部返回 403 或 JS 壳；所有 PDF 抓取返回不可解析二进制**。可访问的官方标准目录只有 **SIS（ISO 成员体）** 与 **SAMR openstd（中国）**；`eupublicdata.eu` 与 Cornell LII 是**二手镜像，只支持标题**。

后果：
- 所有 ISO/SAE/UN 标准**只核实了编号、标题、版次、批准日期与范围**，**没有任何条款文本**。因此不得声称本项目符合任何标准。
- 大量零件存在性属工程通识但无一手来源 → 标 **ASSUMPTION 而非 EVIDENCE**。
- 节点级证据分布：**EVIDENCE 232 / ASSUMPTION 493 / OPEN 55**（共 780）。

**这本身就是项目风险（GAP-014）**，建议总控二选一：接受 ASSUMPTION 分级推进并如实展示，或投入取得标准全文/厂商技术手册。

### 11.2 已核实的重要纠正（来自来源，不是我的推断）

| 常见认知 | 核实结果 | 来源 |
|---|---|---|
| Gen2 法兰在内圈 | 在**外圈**（旋转外圈取代轮毂） | S04/S05 |
| Gen3 是单一整体件 | 仍有**独立内圈**，且有**两个法兰** | S05（本人复核） |
| ABS 编码环是代际定义特征 | 是**选配** | S05/S04/S10 |
| 球铰总是可单独更换 | 常**集成于摆臂**；SKF 套件后缀 B 才含球铰 → 变型属性 | S01/S02 |
| 拉杆是一个零件 | axial joint（转向器侧）与 tie rod end（车轮侧）是**两个零件** | S01/S02 |
| 储液罐总是独立件 | ATE 有**主缸集成储液罐**版本 | S11 |
| iBooster 是"电动液压助力" | 是**机电式**，驱动**标准主缸**；踏板解耦线控制动是另一类产品（MK C2） | S08/S12 |
| EPB 必是电机-on-卡钳 | 存在**鼓式集成 EPB**（EPB-Si）与全干式 EMB | S12/S13 |
| 气门弹簧座只有一个 | MAHLE 明确 **top 与 bottom 两个** | S44 |
| Skyactiv-G 是直喷 | 2010 款是**进气道喷射**；D-4S 才是双喷射 | S45/S40 |
| 电子水泵是纯电专属 | Bosch PCE 2.0 **也可装在内燃机上** | S56 |
| 碰撞断开是独立零件 | 是 **BMS 功能**；接触器/pyrofuse 在 BDU 内 | S51/S52 |
| GB 18384 现行是 2020 版 | 现行 **2025 版**（2025-12-31 发布，2026-07-01 实施） | S70 |
| FMVSS 301 是电气安全 | 是 **Fuel system integrity** | S76 |
| ISO 6194 适用卡钳密封 | 只适用**旋转轴唇形密封** | S21 |
| 散热器归热管理是 OEM 事实 | **是本轮建模选择**，无来源支持该边界 | 资料代理明确指出 |

### 11.3 复用既有已核查研究（不重复劳动）

`docs/vehicle-platform-architecture-research.md`（2026-11-12）中的 MQB / e-TNGA / GA-B / E-GMP / TNGA-F 来源登记为 P01–P04，标 `PRIOR_VERIFIED_NOT_REFETCHED`——**本轮未重新抓取其外部 URL**，如实说明。其中 `global.toyota/35323595` 已由 S59 独立重新核实，E-GMP 的 PE 模块集成度已由 S48/S49 独立重新核实。

---

## 12. 演示级简化与暂缓决定（不无界列举）

| 项 | 决定 | 理由 |
|---|---|---|
| 混动 HEV 专用总成（功率分流、混动变速箱、启停） | `OUT_OF_SCOPE` | 只保留 HEV 适用性标签；展开需另一轮研究 |
| 燃烧/传热/排放化学、轮胎有限元、碰撞法规认证 | `OUT_OF_SCOPE` | MASTER_PLAN §12 已列暂缓；需量产数据与专用求解器 |
| 公差配合与紧固件预紧力数值 | `DEFERRED` | 任务书禁止预填虚构数值；需 ISO 官方文本或厂商手册 |
| 减振器阀片组、液压转阀、AT 阀体、催化器内部、气体发生器内部 | `DEFERRED`（10 个零件） | 需特性曲线/危险品/认证；演示级用单一系数或外形包络替代 |
| SYS-80/90/100/110 零件级下钻 | 部分简化 | 非优先系统，多处 `demoSimplification` 合并计数并写 `deferReason` |
| 轮胎内部分层 | 只作示意 | 外购不可拆总成，分层不是可更换零件身份 |
| 逐根导线/端子/压接 | 不做 | 规模无界；电气拓扑属 RP-02 |
| 白车身完整冲压翻边/焊接 | 不做 | 需量产级模具数据 |
| 拖挂制动接口、合规标识 | 标 GAP 待决策 | 不擅自扩范围 |

---

## 13. 验证方式与结果（可复现）

脚本：[`agent-workspace/agents/qwen4/tools/rp01_tree_tool.py`](../../../agent-workspace/agents/qwen4/tools/rp01_tree_tool.py)，**仅用 Python 标准库**，用项目 venv（Python 3.13.0）运行。所有临时状态在内存中，**不产生任何临时文件，不写 C 盘**。

```bash
cd F:/project/cyq/AI_Coding/car

# 1) 正例校验：解析 + 24 条规则 + 写出结果 JSON
./.venv/Scripts/python.exe agent-workspace/agents/qwen4/tools/rp01_tree_tool.py validate \
  --out docs/planning/evidence/RP-01-validation-result.json

# 2) 反例自测：对每条规则构造故意破坏的副本，确认校验器真会 FAIL
./.venv/Scripts/python.exe agent-workspace/agents/qwen4/tools/rp01_tree_tool.py selftest \
  --out docs/planning/evidence/RP-01-selftest-result.json

# 3) 由 JSON 渲染 Markdown 树（保证两份交付物不漂移）
./.venv/Scripts/python.exe agent-workspace/agents/qwen4/tools/rp01_tree_tool.py render --write

# 4) 导出几何依据缺口清单
./.venv/Scripts/python.exe agent-workspace/agents/qwen4/tools/rp01_tree_tool.py geomneeds
```

### 13.1 规则清单（24 条）

R01 解析 · R02 必填字段 · R03 ID 唯一 · R04 前缀与 kind 一致 · R05 父引用闭合/单根/零件为叶 · R06 无环 · R07 编号系统段==父链系统 · R08 REF 目标存在且非 ref、ref 无子 · R09 同系统内物理身份不重复 · R10 禁止虚构质量/惯量/公差/扭矩/预紧/刚度数值 · R11 枚举合法且 ANY 不与具体值混用 · R12 EVIDENCE 必须有可解析来源、来源必须有范围限制、未核实来源不得支持论断 · R13 配置字段完整 · R14 每个必选选择组恰好选 1 个且适用 · R15 轮端深钻≥3 级且含轴承/密封/紧固件 · R16 发动机深钻≥3 级且含轴承/密封/紧固件/连杆 · R17 功能树与产品树分离 · R18 叶子功能必须有存在的硬件 · R19 Markdown 与 JSON 的 ID 集合完全一致 · R20 暂缓/简化必须有理由 · R21 缺几何必须有说明 · R22 familyRef 必须指向 SYS-130 家族 · R23 GAP 功能必须有缺口说明 · R24 审计自身一致性（计数核算、树节点引用闭合、证据 ID 存在、GAP-ID 必须在登记簿中）

### 13.2 实际结果

- **正例**：`validate` → **PASS**，0 违规。指标：780 节点 / 745 实体 / 35 引用 / 最大深度 6 / 13 实体系统；轮端 41 节点、发动机 105 节点；功能树 77 节点（65/9/3）；审计 36 项（2/19/11/4）；来源 82 条（80 可用）。
- **反例自测**：`selftest` → **PASS**，**32 个故意破坏的副本全部被抓到（32 caught / 0 missed / 32 total），基线 0 违规**，**24/24 条规则都有至少一个反例**。逐条记录见 [`RP-01-selftest-result.json`](../evidence/RP-01-selftest-result.json)。
  - 30 条为内存中深拷贝后篡改（撞号、悬空父引用、成环、前缀错配、系统段矛盾、虚构质量、虚构公差、ANY 与具体架构混用、EVIDENCE 无来源、引用未知来源、REF 指向空、REF 当物理父节点、物理身份重复、暂缓无理由、缺几何无说明、familyRef 指错、一组选两个、功能节点混入产品树、叶子功能无硬件、叶子功能引用不存在硬件、GAP 无缺口说明、轮端丢密封类、发动机丢连杆类、零件缺必填字段、配置缺字段、alternative 无选择组、审计计数错、审计引用不存在节点、审计引用未知证据 ID、审计复核不存在的 GAP）。
  - 另 2 条无法用"篡改树"表达，单独构造：**R19** 把已渲染 Markdown 中的一个 ID 换成 `PART-00-999`，确认两份交付物漂移会被抓；**R01** 在内存里临时替换加载函数让一个真实证据文件"解析失败"，确认加载层错误会变成 R01 违规。**两者都不写任何临时文件，不在 C 盘留痕。**
- **校验器抓到过真实错误**（不是摆设）：开发过程中它抓出了我自己造成的 ①`PART-50-080/081` 电驱定子与油门踏板**撞号**、②轮胎分层挂在零件下违反"零件必须是叶子"、③配置选择组 ID 错配（`ASSY-20-017` 不存在）、④审计摘要**计数手算错误**（MENTIONED 18→19、UNKNOWN 5→4）、⑤审计引用了非实体节点 SYS-120。全部已修。

> 反例自测的意义：一个永远不会失败的测试等于没有测试。32 个反例证明这 24 条规则真的会拒绝错误数据，而不是只会在正确数据上打印 PASS。本节所有数字取自上述两份结果 JSON 的实际运行输出，不是手填。

---

## 14. 未完成 / 有争议的部分（不假定已解决）

1. **0/493 零件有已核实几何依据**。产品树解决覆盖问题，不解决尺寸来源问题。这是最大缺口。
2. **曲轴组与正时驱动整块 ASSUMPTION**，无任何一手来源。发动机深钻的证据强度明显低于配气机构与活塞连杆组。
3. **资料可达性**：官方标准站点大面积 403、PDF 不可读，所有标准只核实标题/范围，无条款。493/780 节点只能标 ASSUMPTION。
4. **A33 既有轮端参数文件的标准引用可疑**：ISO 官方文本不可达，故判 UNKNOWN 而非断言错误；需 Gemini 澄清，本人未改其文件。
5. **`pilot Ø84` vs `center_bore Ø67.1`** 是否同一接口未澄清，不假定是错误。
6. **首发基型未定案**（GAP-001）：CFG-BOF-ICE 只是候选，标 PROPOSED_NOT_APPROVED。
7. **跨模型接口待裁决**：左右镜像件身份语义、传感器归属规则、踏板归属规则、`kind=datum/family` 扩展、两轴适用性字段。
8. **3 个功能 GAP** 需总控指派：诊断/DTC、拖挂制动接口、合规标识。
9. **SYS-120/SYS-140 移出实体 PBS** 是建议，种子未改，需总控批准。
10. **本人未验证任何 CAD/浏览器行为**：本轮是研究任务，没有生成几何、没有跑 Blender、没有开浏览器。所有关于现有代码的结论都是**只读实测**，不是运行验证。

### 边界声明

任务书字面允许写入路径为报告 MD、`evidence/RP-01-*.json`、本人任务卡与个人回报。本轮**另新增了一个个人工作区脚本目录** `agent-workspace/agents/qwen4/tools/`（1 个文件）。理由：交付要求"可运行脚本/可检验产物"，而 evidence 目录只允许 `.json`，脚本无处可放；该目录属本人工作区、不影响任何共享文件与其他模型，且完全可逆（删除即可，校验命令仍可由报告复现）。**请总控确认是否接受此路径**；若不接受，可移动到总控指定位置，本报告中的命令路径需同步更新。

---

## 15. 下一步建议（只提两项）

1. **请总控在 G-PL0 冻结三件事，然后启动轮端纵切样板（G-PL4）**：①首发基型（建议 CFG-BOF-ICE，理由见 §9.1）；②坐标约定 FL=+X / 前进=+Z（实测已可定案，见 §8.3）；③本报告的分类改组建议（§7.1，尤其 SYS-120/140 移出、datum/family 两类节点、传感器归属规则）。冻结后把 [`RP-01-geometry-needs.json`](../evidence/RP-01-geometry-needs.json) 中 SYS-30 的 31 项与 SYS-20 的相关项作为 RP-04 的输入，先取得轴承目录与轮辋轮廓来源，再建模。
2. **请总控裁决资料可达性策略（GAP-014），并把 A33 退回 Gemini**：要么接受 ASSUMPTION 分级推进并在查看器中如实展示证据等级，要么投入取得 ISO/SAE 全文与厂商技术手册；同时要求 RP-04-S05 为 `planning_feasibility/params.json` 补来源引用、修正 ISO 273 标签与自造公式、显式标注轮毂孔的演示简化性质。**在来源策略定案前，不建议规模化生产零件**——否则会把 493 个无依据零件固化成资产。

---

## 附：本报告的可复查入口

- 想看树：§4（自动渲染）或四个 `RP-01-tree-*.json`
- 想看某零件缺什么几何：`RP-01-geometry-needs.json`（按系统分组，优先系统排前）
- 想看某条计划判定依据：`RP-01-coverage-audit.json` 的 `planRef` 行号 + `planQuote` 原文 + `evidence` 来源 ID
- 想看某来源能支持什么：`RP-01-sources.json` 的 `supports` 与 `doesNotSupport`
- 想复跑验证：§13 的四条命令
- 想看功能如何反查出遗漏：`RP-01-function-tree.json` 的 `crossCheckResult.foundAndFixed`