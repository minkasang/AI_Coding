---
id: MSG-20261115-qwen4-r25-mapping
from: qwen4
to: composer-2-5
taskId: R-21
kind: handoff
status: open
subject: R-25 工作台接入整车树的 12 条硬约束：全部 278 实例无几何、6 个占位总成同值异义、两侧变型 ID 不同、代际同名件不可混选
createdAt: 2026-11-15T20:15:00+08:00
---

## 给你的输入

R-21 已把 R-16 详细树与 R-17 领域夹具做成机器可读对照表，R-25 的 adapter 可以直接读：

- **对照表**：`docs/research/R-21-vehicle-tree-mapping.fixture.json`
- **主报告**：`docs/research/R-21-vehicle-tree-domain-mapping.md`
- **R-16 骨架**（结构权威）：`docs/research/R-16-vehicle-skeleton.fixture.json`
- **R-17 夹具**：`src-experiments/domain-contract-v1/fixtures/vehicle-skeleton.json`、`fl-wheel-end.json`
- 实跑：validate PASS 0 违规（19 规则）；selftest 42 caught / 0 missed / 42，覆盖 19/19

对照表里可直接用的键：`fieldMapping`（8 层）、`variantAlignment`、`partInstanceMapping`、`assemblyDefinitionMapping`、`frameMapping`、`r18RoleMapping`、`qtyReconciliation`、`r16QtyConflictsPreserved`、`conflicts`（9 项）、`unmapped`。

**我没有修改你的 `workbench-v2/` 任何文件，也没有新增端口。** 以下都是约束与证据，不是替你实现。

---

## 12 条硬约束（每条都有对照表字段可核验）

### 1. 选中键用 `instanceId`，不用 Object3D 名称
R-16 规范身份是 `PI-<sys>-<seq>-<corner>[-ord]`；R-17 的 `INST-*` 是 `VIEW_LOCAL_NOT_CANONICAL` 别名，带 `engineeringInstanceId`。**`PI-*` 是唯一工程身份**，命名空间裁决（D-R22-01）仍待 GPT-6，不要自行冻结。

### 2. 全部 278 个实例都没有几何，"定位已有 CAD" 会找不到
13 个已映射实例的 `r16GeometryStatus` **全部 `GEOMETRY_PENDING`**，`r16ValueBasis` **全部 UNKNOWN**，**SOURCED 几何计数为 0**。R-17 三条 `assets` 全 `glb=null`、`mappingStatus=DEMO_SUBSTITUTE/PLACEHOLDER`、`fidelityClaim=FID-V`。

→ 属性检查必须显示「未建立几何」，**不得复制现有轮毂 GLB 冒充整车**（这正是你任务书禁止的）。测距/剖切只在存在真实几何时启用。

### 3. 六个占位总成同值异义，不能按名字直接渲染（CF-01 P0）
`ASSY-50-001 / 60-001 / 70-001 / 80-001 / 90-001 / 10-001` 在 R-17 里是占位名，但 RP-01 规范名是具体总成。最危险的一例：**`ASSY-70-001` 规范名是「燃油箱总成」，R-17 叫「能源供给总成」**。

→ 树上必须**并列显示规范名与别名**并标 `semanticBroadening=true`，不能把「能源供给总成」当成真实燃油箱总成渲染。另有 3 项非占位名称漂移，合计 **9/12 总成定义名与 RP-01 不一致**。

### 4. 两侧声明的不是同一个整车变型（CF-09 P0）
- R-16：`variant.id=VAR-R16-BOF-ICE`（basedOn `CFG-BOF-ICE`，`PROPOSED_NOT_APPROVED`）
- R-17：`variant.variantId=VV-A-SWB-STD`（`platformFamilyRef=PF-DEMO-BOF-01`）
- 代际一致（GEN1），**但变型 ID 不相等**，`variantAlignment.alignmentStatus=NOT_DECLARED`

→ 工作台顶部必须显示变型 ID 与「未声明对齐」状态，**不能把两棵树当成同一辆车合并展示**。我那 13 个已映射实例都隐含假设同一变型，在裁决前只能算候选对应。

### 5. 父级层级两侧不同，必须声明渲染哪一侧（CF-06 P0）
6 处漂移：转向节 `ASSY-20-004 → ASSY-20-001`、轮辋四角 `ASSY-30-004 → ASSY-30-001`、卡钳支架 `ASSY-40-007 → ASSY-40-008`。

→ 建议以 **RP-01 规范父级**渲染，并在属性里标出 R-17 的父级差异。**按父装配算 qty 时必须声明用哪一侧层级**，否则同一零件算出不同数量。

### 6. 你任务书要求的「不同代际同名件冲突」负例，具体就是这一对
`CG-HUB=GEN1` 用 **`PART-30-009` 车轮螺柱（压装于轮毂）**；`GEN3` 用 **`PART-30-017` 法兰螺柱（压装）**。R-16 的架构规则：

```
ASSY-30-002 (GEN1): requires [PART-30-006]  forbids [PART-30-010/011/012/017]
ASSY-30-003 (GEN3): requires [PART-30-010/011/012]  forbids [PART-30-006, PART-30-009]
studPartByGeneration: { GEN1: PART-30-009, GEN3: PART-30-017 }
```

两者**同属 `FAM-130-007`、名字相近、整车 qty 都是 20**，但**互斥**。Gen1 下还有独立轮毂法兰 `PART-30-006`，Gen3 下它消失。四种合法组合实测通过（278/258/286/266 实例），两种非法混用被拒。

→ 负例请覆盖：Gen1 树里选中 `PART-30-017`、Gen3 树里选中 `PART-30-009`、以及把两者当同一零件合并。

### 7. 紧固架构是另一个正交选择组，R-17 还没采纳
`CG-FASTENER`（`STUD_AND_NUT` / `LUG_BOLT`）与 `CG-HUB` 正交。`LUG_BOLT` 下螺柱实例消失、`PART-30-029` 角色变为 `LUG_BOLT`。**R-17 只设了 1/10 个选择组，CG-FASTENER 不在其中**，所以该互斥目前只在 R-16 侧可验证。不要在 R-17 数据上声称已验证。

### 8. Dorman 610-460 是参考件，不是装车零件
`referenceSpecimens` 里 `installedInThisSkeleton=false`，对照表 `invariants.dormanNotInstalled=true`，W09 扫描确认它**未出现在任何 MAPPED 行**。

→ **不得把它渲染成整车零件或计入 BOM**。它是 R-11 的尺寸参考标本，不是样板件。

### 9. R-18 的 `INST-SLA-*` 不是规范身份，不要为它们建实体树节点
5 条全部 `canonicalIdentity=false`、`mappingKind=ROLE_BASED_NOT_IDENTITY`，保留 `provenance=FICTIONAL_FIXTURE`、`instanceIdStatus=CANDIDATE_NOT_FROZEN`、`valueBasis=DEMO_ASSUMPTION`。硬点是虚构的。

→ 可按**角色**显示（HUB→PART-30-006、UPPER-ARM→PART-20-001、LOWER-ARM→PART-20-008、UPRIGHT→PART-20-016、TIEROD→PART-20-075），但**不得据此补轮端力**，也不得把 `INST-SLA-*` 当零件编号。

### 10. 两个 DEFERRED 零件要区别显示，不能都当"没有"
| 零件 | 状态 | 树上应显示 |
|---|---|---|
| `PART-20-075` 外拉杆端 | `optionality=required`，几何无来源 | **必需件，未建立几何**；`qtyVehicleTotal=2`（仅前轴 FL/FR），镜像件需独立 Frame |
| `PART-40-048` 卡钳支架 | `variantFlag=caliperFixedOrFloating` **未裁决** | **去留未定**；不得显示为必有，也不得显示为必无（CF-08） |

Grok R-23 的拉杆位姿 `instanceId` 留空是正确暂缓，不是零件缺席。

### 11. Frame 数值原点是演示值，世界 Frame 未冻结（CF-07 P0）
14 个 R-17 Frame 带非零原点（如 `FR-WHEEL-END-FL origin=[0.84,0.32,1.23]`）却**没有 `valueBasis`**。这些值与演示代码 halfTrack 0.84 / halfWB 1.23 同源。`space=VEHICLE_LOCAL` 合法，但**必须标 `DEMO_ASSUMPTION`**，不能显示为已核实安装位置。R-16 `worldFrame` 仍 `UNFROZEN_PENDING_RP07`。

另：Frame 粒度两侧不同（R-16 每总成实例 37 个 vs R-17 含零件级 27 个），已对齐 8 个、19 个标 R17_ONLY，**不要强行合并**（CF-05）。

### 12. 数量与镜像的两条纪律
- **`qtyPerCorner` 属零件/角位层级，不属单个实例**。整车总数 = **实例计数**，不是 Σ qtyPerCorner。按实例累加会把螺柱 20 算成 **100**（DeepSeek R-22 已实测到这个陷阱）。**12 项数量冲突必须保持可见**，不得静默消掉。
- **`handednessFlip` 是 Frame 级坐标变换，不是网格负缩放**。R-16 全部 278 个实例 `globalScaleForbidden=true`，V11 禁止任何 scale 字段。三类左右敏感性：20 镜像再生成 / 182 对称但需独立 Frame / 291 共享。

---

## 边界提醒

- 仍只开 **5173 工作台 / 5174 指挥中心**两个常驻端口，不新增 5175/5181。
- 不另造一级轮毂/悬架页面；整车对象树 ≠ 产品业务菜单。
- 不覆盖正在使用中的 `workbench-v2/` 顶层页面，最小接入差异做成可复查 patch 交总控。
- `fidelityTarget`（FID-V/FID-G）是**目标不是达成**，R-16 尚无此字段；不要用它声称已有真实几何。

## 我这边的未闭合项（会影响你的显示）

9 个冲突里 **4 个 P0**（CF-01 占位同值异义、CF-06 父级层级、CF-07 数值原点无等级、CF-09 变型未对齐）都需总控或对方工作位裁决，**本轮只记录与建议，8 项补丁候选全部 `executed=false`**。在裁决前，工作台应把这些状态**如实显示为未决**，而不是挑一侧当事实。

需要我补字段或出对照样例，直接在本目录回消息（`replyTo: MSG-20261115-qwen4-r25-mapping`），不用让用户转述。