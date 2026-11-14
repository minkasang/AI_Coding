# R-10｜跨模型装配接口适配器：可运行的隔离验证

> 状态：**SUBMITTED**（待 GPT-6 审核；未冻结共享 Schema）
> 任务卡：`agent-workspace/agents/deepseek/tasks/R-10.md`
> 日期：2026-11-14
> 输入：R-06（Qwen4 轮端 BOM）、R-03（Gemini 资产清单）、R-04/R-09（Grok 悬架）、R-02/R-07（DeepSeek 装配契约/映射）、R-08（资产门禁错误码）
> 性质：隔离实验与适配器原型，不是生产代码，不是真实车型装配。

---

## 0. 结论

R-10 用一个独立的 Node 适配器把四份真实研究文件接到一起，并在实际运行中验证：

- **能转换的部分**：R-06 的 60 条 BOM、30 个参数、12 个界面；R-03 的 4 个零件/资产、5 个螺柱实例、3 个安装面；R-04/R-09 的 13 个硬点和 7 条约束/输出条目，全部带来源等级和映射状态进入适配结果。
- **必须保持 OPEN 的部分**：R-06 的 12 个界面全部 `blockedDownstream=true`；20 个 critical 参数中 17 个仍 `UNKNOWN`；R-03 的安装面缺中心孔/配合/公差；R-04 硬点是 `FICTIONAL_FIXTURE`；Joint 与 Constraint 的边界尚未与 Grok/GPT-6 裁定。
- **必须拒绝的错误**：双主键、重复实例、mm/m 混用、隐式镜像、数量放大、过时指纹、阻塞界面被声称已装配、Joint/Constraint 误分类、虚构来源冒充 SOURCED、缺规范 ID、非刚体缩放、未映射字段、UNKNOWN 参数带值。实际 **13 个错误全部被预期错误码拒绝**。
- 适配器自身 14 个用例 **14/14 通过**（1 个正常 + 13 个错误拒绝）；输出保存为 `docs/research/R-10-adapter-example.json`。

**未冻结**：世界 Frame、partId 别名、Joint 与 Constraint 分类、真实尺寸/材料/质量均仍需 GPT-6/Qwen4/Gemini/Grok 提供或裁决。本报告只证明“适配器能识别并拒绝错误”，不证明真实装配已成功。

---

## 1. 输入与边界

### 1.1 实际读取的输入

| 输入 | 用途 | 关键事实 |
|---|---|---|
| `docs/research/R-06-minimal-assembly-bom.json` | 轮端—双叉臂最小 BOM | 60 BOM、30 参数、12 接口；12 接口全部 `blockedDownstream=true`；20 critical 中 17 UNKNOWN；`qtyPerCorner` 单角数量 |
| `docs/research/R-03-asset-manifest.example.json` | CAD→GLB 资产清单 | 4 parts、5 个螺柱实例、3 个 mount_frames；`revision` 为 16-hex 内容哈希；`mass_properties_assumption` 为假设；`modeling_fidelity` 为 envelope/nominal |
| `docs/research/R-04-kinematics-fixture.json` / `src-experiments/kinematics/fixture-demo.json` | 悬架硬点/约束 | 13 个硬点；`FICTIONAL_FIXTURE`；`+X 左/+Y 上/+Z 前`；减振器长度是输出；R-09 17 项检查通过 |
| `docs/research/R-02-example-assembly.json` | 目标契约 | Frame/PartInstance/Joint/MountInterface/AssetManifest 字段 |
| `docs/research/R-07-schema-mapping.example.json` | 跨模型映射/冲突 | 46 映射、18 冲突、15 裁决；R-03 变换 114.3 mm 反例 |
| `docs/research/R-08-quality-gates.json` | 错误码参考 | `ERR_INPUT_*`、`ERR_TRANSFORM_*`、`ERR_ASSEMBLY_*`、`ERR_CACHE_*` 等 |

### 1.2 边界

- 不修改 `src/`、`cad/experiments/asset_pipeline_v1`、`command-center/`、其他模型任务卡、`MASTER_PLAN.md`。
- 不把 R-06 的演示尺寸、R-03 的假设质量、R-04 的虚构硬点当真实数据。
- 不发布/冻结共享 Schema；未决字段在输出中明确 `OPEN`/`PROPOSED_NEEDS_CONFIRMATION`。
- 只做一个纵切样板（左前轮端—双叉臂—制动），不追求 493 件。

---

## 2. 适配器架构

### 2.1 严格转换规则

| 规则 | 实现 |
|---|---|
| 规范 partId | RP-01 `PART-*`/`ASSY-*`；R-03 `SYS-*` 只能作 `externalId`，必须经别名表映射 |
| revision | 人可读 `rNNN`；R-03 16-hex 作 `contentFingerprint`；文件 hash 单独 |
| 单位 | 源 mm；资产 `transform_mm` 乘 0.001；禁止 `mesh.scale` |
| qty | `qtyPerCorner` 单角数量；整车总数另派生，不用 20 覆盖 5 |
| 镜像 | 显式 `mirror.handednessFlip`；旋转 `det=+1`；禁止负缩放 |
| 真实性 | `valueBasis/evidence/fidelityClaim/verification/reviewStatus` 分离 |
| Joint/Constraint | R-04 约束保持 `constraint`，不自动生成 `Joint`；边界 OPEN |

### 2.2 输出结构

`docs/research/R-10-adapter-example.json` 包含：

- `sourceInputs`：每个输入文件的路径与 SHA-256。
- `adapterRules`：上述规则。
- `counts`：转换计数。
- `r06`：BOM/参数/界面/总成组/冲突案例。
- `r03`：parts/instances/frames/mounts/coordinate conventions。
- `kinematics`：frames/constraints/joints（0）/verification。
- `handoffs`：四个两模型交接样例。
- `unresolved`：35 项 OPEN/阻塞。
- `comparison`：源文件 vs 适配结果的保留/丢失字段。
- `rejections`：14 个用例（1 正常 + 13 拒绝）。
- `errorCodeMap`：适配器错误码与 R-08/R-06 错误码的映射。

---

## 3. 两模型交接样例

### 3.1 H-01 轮毂法兰：R-06 BOM ↔ R-03 资产

| 项 | 值 |
|---|---|
| R-06 BOM | `BOM-30-006` → `PART-30-006` |
| R-03 外部 ID | `SYS-30-HUB-001` → `PART-30-006`（**PROPOSED_NEEDS_CONFIRMATION**） |
| contentFingerprint | `4656a3d39589d4dc` |
| revision | `null`（R-03 没有人类 revision；需 R-02 补 `rNNN`） |
| fidelityClaim | `FID-V`（R-03 `GEOMETRIC_ENVELOPE_ONLY`） |
| 质量属性 | `DEMO_ASSUMPTION`，不可用于生产 |
| 阻塞界面 | `IF-01`（轴承压装）、`IF-02`（PCD/CB 螺栓连接） |
| 状态 | `PARTIAL_OPEN` |

### 3.2 H-02 车轮螺柱：5 个实例

| 项 | 值 |
|---|---|
| R-06 BOM | `BOM-30-009` → `PART-30-009`，`qtyPerCorner=5` |
| R-03 外部 ID | `SYS-30-STUD-M14` → `PART-30-009`（PROPOSED） |
| R-03 实例 | 5 个 `#inst_0..4` → 5 个 `INST-STUD-FL-1..5`（PROPOSED） |
| contentFingerprint | `1165d43dd98945ca` |
| 阻塞界面 | `IF-03`（螺纹/座型；商用件不可混用） |
| 状态 | `PARTIAL_OPEN` |

### 3.3 H-03 制动盘：R-06 ↔ R-03

| 项 | 值 |
|---|---|
| R-06 BOM | `BOM-40-046` → `PART-40-046` |
| R-03 外部 ID | `SYS-40-ROTOR-001` → `PART-40-046`（PROPOSED） |
| contentFingerprint | `67bc8bd8bacc7bb1` |
| 阻塞界面 | `IF-02`（PCD/CB 双向一致；两套演示常量互相矛盾） |
| 状态 | `PARTIAL_OPEN` |

### 3.4 H-04 悬架：R-04/R-09 → R-02

| 项 | 值 |
|---|---|
| 硬点 | 13 个 → 13 个 `PROPOSED_KINEMATIC_POINT` Frame |
| 约束条目 | 7 条：6 条约束 + 1 条减振器输出 |
| Joint | 0（**不自动生成**） |
| 来源 | `FICTIONAL_FIXTURE` + `DEMO_ASSUMPTION` |
| 状态 | `OPEN_PROPOSED`，待 Grok/GPT-6 裁定 Constraint 与 Joint 边界 |

**为什么不让 Joint=7**：R-04 的 `DISTANCE`、`POINT_ON_LINE`、`PRESCRIBED_POSITION` 是求解器约束；R-02 的 `Joint` 是机构运动副。把它们直接叫 Joint 会掩盖“这不是铰链”的事实。R-10 因此保留 `constraints` 数组，`joints=[]`，并把这些条目状态标 OPEN。

---

## 4. 转换结果与信息保留

### 4.1 R-06（Qwen4）

| 项 | 源 | 适配 | 说明 |
|---|---|---|---|
| BOM | 60 | 60 | 58 PART + 2 ASSY；全部有 `rp01Ref` |
| 参数 | 30 | 30 | 21 UNKNOWN、5 DEMO_ASSUMPTION、3 SOURCED_SECONDARY、1 ENGINEERING_INFERENCE |
| critical 参数 | 20 | 20 | 17 UNKNOWN 保持 null |
| 接口 | 12 | 12 | 12 全部 `BLOCKED`，`assemblyClaim=false` |
| 保留字段 | — | — | `necessity`、`assemblyBoundary`、`qtyPerCorner`、`params`、`grade`、`blockedDownstream`、`conflictRisk`、`applicability`、`qtyWhenIncluded`、`deferReason` |
| 丢失 | — | — | 无 |
| OPEN | — | 29 | 12 blocked 界面 + 17 critical UNKNOWN |

### 4.2 R-03（Gemini）

| 项 | 源 | 适配 | 说明 |
|---|---|---|---|
| 零件/资产 | 4 | 4 | 外部 ID + 提案规范 ID；内容哈希保留 |
| 实例 | 5 | 5 | 5 个螺柱实例；`transform_mm` 保留，进运行时时乘 0.001 |
| 安装面 | 3 | 3 | 拆成 3 个 Frame + 3 个 MountInterface |
| 缺失 | — | 3 | 中心孔/配合/公差全部 OPEN |
| 质量属性 | 假设值 | DEMO_ASSUMPTION | 不作为 SOURCED；不可用于生产 |
| modeling fidelity | envelope/nominal | FID-V | 不升级为 FID-G |
| 丢失 | — | — | 只丢失源文件本来就没有的 CB/fit/tolerance；solverSource 故意不复制 |

### 4.3 R-04/R-09（Grok）

| 项 | 源 | 适配 | 说明 |
|---|---|---|---|
| 硬点 | 13 | 13 Frame | `FICTIONAL_FIXTURE` + `DEMO_ASSUMPTION` |
| 约束 | 6 | 6 constraint + 1 output | 不减振器不是刚性杆；不减振器输出被误当约束 |
| Joint | 0 | 0 | 边界 OPEN |
| 验证 | 21 tests（R-04）/17 checks（R-09） | 引用 | `PASS_FOR_FIXTURE`，`reviewStatus=NOT_REVIEWED` |

### 4.4 R-02 兼容性

| R-02 字段 | 状态 |
|---|---|
| PartDefinition | 可承载（partId/geometryBasis/variants/localFrameId） |
| PartInstance | 可承载（instanceId/partRef/frameId） |
| Frame | 可承载（origin/rotation/units/tolerance） |
| MountInterface | 部分：R-03 缺 pilot/CB/fit/tolerance |
| AssetManifest | 可承载（partRef/contentFingerprint/files） |
| BOMLine | 可承载（qtyPerCorner/instanceIds） |
| Joint | 空/OPEN（不把 Constraint 冒充 Joint） |
| verification | 可承载（PASS_FOR_FIXTURE/NOT_REVIEWED） |

---

## 5. 必须拒绝的错误（实际运行）

命令：

```bash
node agent-workspace/agents/deepseek/tools/r10_adapter.mjs
```

结果：`EXIT=0`；14/14 用例通过。以下错误都被**实际注入并拒绝**，不是只在报告中列出：

| 用例 | 注入 | 实际错误码 | 结果 |
|---|---|---|---|
| NEG-01 | 把 R-03 `SYS-*` 当规范 partId | `ERR_INPUT_DOUBLE_PRIMARY_KEY` | PASS |
| NEG-02 | 两个 R-03 实例共享 instanceId | `ERR_ASSEMBLY_DUPLICATE_INSTANCE` | PASS |
| NEG-03 | R-03 mm 资产 `unitScale=1` | `ERR_INPUT_UNIT_MISMATCH` | PASS |
| NEG-04 | 反射矩阵 det=-1 无 mirror 标志 | `ERR_TRANSFORM_CHIRALITY` | PASS |
| NEG-05 | 把整车/四角 qty=20 当单角 BOM | `ERR_ASSEMBLY_QTY_MISMATCH` | PASS |
| NEG-06 | R-03 内容指纹伪造/过期 | `ERR_CACHE_FINGERPRINT_INVALID` | PASS |
| NEG-07 | 12 个界面 blocked 却声称已装配 | `ERR_ASSEMBLY_INTERFACE_BLOCKED` | PASS |
| NEG-08 | R-04 约束映射为 FIXED Joint | `ERR_ASSEMBLY_CONSTRAINT_MISCLASSIFIED` | PASS |
| NEG-09 | `FICTIONAL_FIXTURE` 标成 `SOURCED` | `ERR_INPUT_UNTRUSTED_PROVENANCE` | PASS |
| NEG-10 | R-06 BOM 缺 `rp01Ref` | `ERR_INPUT_MISSING_CANONICAL_ID` | PASS |
| NEG-11 | 资产 transform scale=1.1 | `ERR_TRANSFORM_SCALE_INVALID` | PASS |
| NEG-12 | R-06 BOM 出现未映射字段 | `ERR_INPUT_UNMAPPED_FIELD` | PASS |
| NEG-13 | UNKNOWN 参数带数值 | `ERR_INPUT_UNKNOWN_HAS_VALUE` | PASS |

**关键意义**：
- 错误不是“看起来不对”，而是适配器返回稳定错误码并拒绝输出。
- NEG-05 的 20 vs 5、NEG-06 的指纹、NEG-07 的 12 个 blocked 界面都来自真实源文件，不是自造玩具。
- NEG-08 明确不把 R-04 的约束塞进 Joint；边界保持 OPEN。

---

## 6. 适配器证明了什么、没证明什么

**证明**：
- 四份研究文件能被同一个适配器读取、映射、保留来源，并在错误输入上拒绝。
- R-06 的 12 个阻塞界面没有被“跑通”掩盖；17 个 critical UNKNOWN 保持 null。
- R-03 的 envelope/nominal 资产只到 FID-V；质量假设只到 DEMO_ASSUMPTION。
- R-04 的虚构硬点保留 `FICTIONAL_FIXTURE`；减振器长度作为输出，不当约束。
- 双主键、重复实例、mm/m、镜像、数量、指纹、阻塞界面、Joint/Constraint 误分类、来源冒充、缺 ID、非刚体缩放、未映射字段、UNKNOWN 带值都有可理解的拒绝原因。

**没证明**：
- 不证明真实轮端/制动/悬架已装配；12 个界面仍 blocked。
- 不证明 PCD/CB/ET、预紧、轴承内部、材料、质量、热、疲劳、碰撞、EMC。
- 不证明世界 Frame/partId 别名/Joint-Constraint 已冻结；这些仍是 OPEN/PROPOSED。
- 不证明 R-06 的真实尺寸已经找到；本适配器不填任何 UNKNOWN。
- 不证明 R-03 的 CAD 轴已端到端实测；只说明按现有运行时轴和显式局部 Frame 的候选转换。

---

## 7. 未决事项与人工对齐

| ID | 未决 | 责任 | 影响 |
|---|---|---|---|
| U-IF-01..12 | R-06 12 个界面全部 blocked | Qwen4 / GPT-6 | 不能声称真实装配 |
| U-PR-* | 17 个 critical 参数 UNKNOWN | Qwen4 / 供应商资料 | 不能填 CAD/配合/质量 |
| U-R03-CB-FIT | R-03 mount_frames 缺中心孔/配合/公差 | Gemini | MountInterface 只能 partial |
| U-R03-ALIAS | R-03 `SYS-*` → RP-01 `PART/ASSY` 为提案 | Gemini / GPT-6 | 不能算已确认同一实体 |
| U-R04-PROVENANCE | R-04 硬点 `FICTIONAL_FIXTURE` | Grok / GPT-6 | 不能进生产 CAD/BOM |
| U-JOINT-CONSTRAINT | Joint vs Constraint 边界 | Grok / GPT-6 | 不能把约束冒充 Joint |
| U-R08-CODES | 适配器新错误码与 R-08 的统一 | Gemini / GPT-6 | 错误码仍有两套 |
| U-R09-CODES | R-09 `KIN-E-*` 与 R-08 `ERR_*` 的映射 | Grok / GPT-6 | 运动学错误如何进入总门禁 |

**必须人工对齐的字段**：
- R-06 的 `applicability`/`qtyWhenIncluded`/`deferReason` 需要 R-02 正式字段（本适配器已保留，但未冻结）。
- R-03 的 `mass_properties_assumption` 需要 Material 来源或明确 DEMO。
- R-04 的 `constraints` 需要 Constraint 类型（不是 Joint）与驱动坐标。
- R-02 的 `MountInterface.pilot/fit/tolerance` 需要 R-03 补数据。

---

## 8. 下一步

1. 把 R-10 的 13 个拒绝码整理成公共错误码表，交 GPT-6/RP-07；优先与 R-08 `ERR_*`、R-09 `KIN-E-*` 合并，避免三套错误码。
2. 与 Grok 确认 `DISTANCE`/`POINT_ON_LINE`/`PRESCRIBED_POSITION` 是 `Constraint` 还是 `Joint`；在确认前保持 `joints=[]`。
3. 与 Gemini 确认 R-03 `SYS-*` → RP-01 `PART/ASSY` 的精确别名；在确认前保持 `PROPOSED_NEEDS_CONFIRMATION`。
4. 等 Qwen4 R-06 真实尺寸/来源补齐后，再决定 12 个界面中哪些可从 `BLOCKED` 升为 `FID-G`；不得用演示值填 critical 参数。

---

## 9. 文件与复现

| 文件 | 作用 |
|---|---|
| `docs/research/R-10-interface-adapter-fixture.md` | 本报告 |
| `docs/research/R-10-adapter-example.json` | 适配输出：输入哈希、handoffs、counts、unresolved、comparison、rejections |
| `agent-workspace/agents/deepseek/tools/r10_adapter.mjs` | 适配器与 14 个用例 |
| `agent-workspace/agents/deepseek/reports/R-10-adapter-check-results.json` | 实跑结果 |
| `agent-workspace/agents/deepseek/reports/R-10.md` | 个人回报 |

复现：

```bash
node agent-workspace/agents/deepseek/tools/r10_adapter.mjs
# 期望 EXIT=0；CASE-01 + 13 NEG 全部 PASS
```

---

## 10. 来源

- R-06：`docs/research/R-06-minimal-assembly-bom.json`、`docs/research/R-06-first-assembly-geometry-evidence.md`
- R-03：`docs/research/R-03-asset-manifest.example.json`、`docs/research/R-03-cad-asset-pipeline-report.md`
- R-04/R-09：`docs/research/R-04-kinematics-fixture.json`、`docs/research/R-09-kinematics-prototype.md`、`src-experiments/kinematics/fixture-demo.json`
- R-02/R-07：`docs/research/R-02-example-assembly.json`、`docs/research/R-07-schema-mapping.example.json`
- R-08：`docs/research/R-08-quality-gates.json`
- 审核：`docs/command/reviews/AUDIT_2026-11-14_R07_DEEPSEEK.md`、`AUDIT_2026-11-14_BATCH2.md`
- 运行时坐标：`src/physics/vehicleWorld.js:180-188`、`src/parts/chassis.js:285-291`
- Gemini/Grok/Qwen4 公共消息：`agent-workspace/shared/messages/`
