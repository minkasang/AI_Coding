# R-02 SUBMITTED — 零件、装配、运动副和车型数据契约研究

## 完成内容

- 交付 `carlab.data-contract/0.1.0-proposal`：PartFamily → PartDefinition → PartVariant → PartRevision → PartInstance，以及 AssemblyDefinition/AssemblyInstance、BOMLine、Joint、MountInterface、Material、AssetManifest、Frame、VehicleVariant。
- 沿用 RP-01 `RP01-PBS-0.1` 的真实 ID 规则与“一个实体一个规范节点”；跨系统用 REF，不复制实体。
- 给出 CAD mm → 运行时 m 的显式 Frame 链、轮端局部 z 轴映射、镜像禁用负缩放规则、MountHardpoint（PCD/中心孔/孔数/紧固件/公差/来源）字段。
- 给出不锁死 build123d/Cannon 的中性 Joint 类型/自由度/轴/限位/驱动/刚度阻尼，以及适配器提示边界。
- 给出 STEP/STL/GLB manifest：partRef/revision/sourceUnits/hash/transform/generator/knownLosses；GLB 不承担 B-rep。
- 用 RP-01 真实 ID 构造“BOM→轮毂法兰→5 个车轮螺柱→制动盘”示例，PCD 114.3 mm，5 个实例共享同一 `PART-30-009@r001`、各有独立 Frame。
- 20 个自动校验用例 + 3 个刻意错误的完整最小 JSON 输入；实际运行结果：基础示例 0 错误、20/20、3/3。

## 文件

| 文件 | 路径 |
|---|---|
| 主报告 | `docs/research/R-02-data-contract-report.md` |
| 示例装配 JSON | `docs/research/R-02-example-assembly.json` |
| 校验器 | `agent-workspace/agents/deepseek/reports/R-02-validator.mjs` |
| 实跑结果 | `agent-workspace/agents/deepseek/reports/R-02-validation-results.json` |
| 本回报 | `docs/tasks/reports/R-02-report.md` |

## 推荐实体设计（摘要）

```text
PartFamily(FAM) ──> PartDefinition(PART) ──> PartVariant(V-*)
       │                    │
       │                    └──> PartRevision(PART@rNNN) ──> AssetManifest
       │
       └──> PartInstance(INST-*) ──> Frame(INSTANCE) + MountInterface + Joint
AssemblyDefinition(ASSY) ──> BOMLine ──> PartInstance / AssemblyInstance / REF
VehicleVariant(VV) ──> R-01 PD-WB/PD-FT/FH-*/MS-*
```

关键规则：`partId@revision` 是定义；`instanceId` 是放置；`qty` 是每个父总成实例的数量；5 个螺栓 = 1 个定义 + 5 个实例 + 5 个 Frame；`REF` 不复制实体；`familyRef` 只能指向 FAM；未知数值必须 null+OPEN。

## 测试案例（20 个，完整在示例 JSON）

1. TC-01 基础示例无结构错误。
2. TC-02 空 partId → E001。
3. TC-03 重复 instanceId → E004。
4. TC-04 无法解析 revision → E003。
5. TC-05 PCD 112.0 vs 114.3 → E030。
6. TC-06 孔数 4 vs 5 → E031。
7. TC-07 中心孔 66.6 vs 67.1 → E032。
8. TC-08 实例 Frame 用 mm → E022。
9. TC-09 Joint 轴 [2,0,0] → E023。
10. TC-10 Joint 限位 min>max → E041。
11. TC-11 隐式镜像/行列式 -1 → E024。
12. TC-12 familyRef 指向 PART → E006。
13. TC-13 BOM qty 4 vs 5 实例 → E008。
14. TC-14 Asset hash 不匹配 → E051。
15. TC-15 Asset 缺 sourceUnits → E050。
16. TC-16 SOURCED 无来源 → E061。
17. TC-17 OPEN 数值非 null → E062。
18. TC-18 变体缺 PD-WB → E071。
19. TC-19 变体 globalScale → E073。
20. TC-20 PASS 无 testRefs → E064。

3 个错误输入示例：`INVALID-PCD`（E030）、`INVALID-DUP-INSTANCE`（E004）、`INVALID-JOINT-AXIS`（E023）。

## 实际运行

```bash
node agent-workspace/agents/deepseek/reports/R-02-validator.mjs \
  docs/research/R-02-example-assembly.json
```

结果：`EXIT=0`；基础 `ok=true, errors=0`；用例 `20/20`；错误输入 `3/3`。警告：W001 OPEN/ASSUMPTION、W002 R-01 待对齐、W003 需 CAD B-rep、W005 占位资产。

## 与 R-01 的冲突/待决

1. R-01 的 `vehicleVariants` 尚无显式 `platformFamilyRef`；R-02 暂填 `PF-DEMO-BOF-01` 并只发 W002，不能当已冻结字段。
2. R-01 `valueBasis`（DEMO_ASSUMPTION/LOCAL_MEASUREMENT/SOURCED/OPEN）与 RP-01 `geomBasis`、RP-02 `evidence.level` 尚未合并。
3. R-01 用 VISUAL/GEOMETRY/KINEMATIC/DYNAMIC；RP-03 用 FID-V..D2；R-02 建议 `fidelityClaim` 采用 FID，保留映射，不自动合并。
4. 固定/可变硬点最终清单未批；R-02 的 Frame/硬点规则不假设具体数值。
5. R-01 的 `globalScale` 禁令需在 Frame/Asset/Assembly 层同样执行；当前 E026/E052/E073 覆盖。

其他待裁：统一世界 Frame、qty 语义、REF 形式、Joint 与 MountInterface 边界、镜像件身份、演示资产使用边界。详见主报告第 13 节。

## Schema 不能替代的检查

孔位/位置度/圆度、中心孔配合/过盈、卡钳-盘-轮辋间隙、螺栓预紧/夹紧力、质量/质心/惯量、材料强度/疲劳/热、焊接/密封、装配顺序/工具空间、碰撞/EMC/NVH 必须靠 CAD B-rep、实测或专项仿真；JSON 通过不等于几何/物理正确。

## 限制

- 没有真实零件几何/材料/质量/预紧/热数据；示例大量 null+OPEN。
- `hello_flange` 是演示替代件，不是 `PART-30-006` 的真实几何。
- 20/20 只证明声明一致性和引用完整性，不证明真实装配或物理性能。
