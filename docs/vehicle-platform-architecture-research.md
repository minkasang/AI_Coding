# 整车平台化与跨车型衍生：研究证据及 CAR 项目架构补充

> 2026-11-12。关联 `../MASTER_PLAN.md`；研究归纳，尚未进入代码实现。此文档是对既有计划 P0/P2/P3 的补充，不替代原计划。
> 核心问题：一套越野车底盘是否能够加长/加宽、换车身、衍生轿车？什么才是真正可复用的整车平台？

## 1. 结论：平台不等于单个车架，也不等于一次性更换车壳

汽车工程中的平台，是**共用架构、标准模块、关键接口、设计规则与制造体系**的组合，而不是某一辆车型底盘的单个 3D 网格。不同车型可共享模块/接口/设计规则，同时允许部分尺寸和模块按边界变化。

针对本项目：
- **容易的层级**：同车身结构类型、同驱动架构的长短轴版/不同轮距版/不同外观版；前提是事先设计可变模块及接口。
- **中等至困难**：相同平台家族内更换悬架类型、动力总成、车辆用途；需重新选择模块、验证空间布置、质量特性、运动学和动力学。
- **不应承诺直接换壳**：承载式轿车与典型非承载式硬派越野车的车身与车架承担载荷方式不同。可共享轮端、制动、材料、协议及部分模块，但往往属于不同“平台家族”；给非承载式车架直接套上轿车壳子，只能作为演示变体，不能声称是工程正确的量产轿车。
- **展示与工程分级**：浏览器可以通过配置实时展示跨车型衍生；机械装配真实性、结构强度和碰撞安全仍需相应验证。

## 2. 车企和研究证据（原始出处）

### 2.1 大众 MQB：可变轴距/轮距与固定关键基准
大众集团 2018 年年报公开说明，MQB 将轴距、轮距、轮胎尺寸和座椅位置作为可灵活配置的概念尺寸，而踏板与前轮中心相对距离维持统一。证明平台化既包含“共性硬点”，也允许“参数变型”。
- 一手来源：Volkswagen Group Annual Report 2018 — Modular toolkit strategy
  https://annualreport2018.volkswagenag.com/group-management-report/report-on-risks-and-opportunities/risks-and-opportunities/modular-toolkit-strategy.html

### 2.2 丰田 e-TNGA：固定/可变划分及前中后三段模块
丰田官方说明：前后电机位置、前舱布局、驾驶者相对前轮的位置、电池宽度等被定义为固定，轴距、电池数量、前后悬等可变化；通过不同前中后模块和零部件组合得到不同车型。
- Toyota Global Newsroom — BEVs for global deployment
  https://global.toyota/en/newsroom/corporate/28474382.html
- Toyota UK — GA-B small car platform：明确允许不同轴距、高度、轮距和车身类型
  https://media.toyota.co.uk/toyota-announces-new-tnga-small-car-platform/

### 2.3 现代 E-GMP：跨不同外形车的共享电动平台
现代官方列出 E-GMP 应用于 IONIQ 5（跨界车）、IONIQ 6（轿车）、IONIQ 9（SUV）等，说明同一电动平台上可以实现明显不同的车身用途与造型；不意味着所有零件、车身结构完全相同。
- Hyundai Worldwide — Electrification
  https://www.hyundai.com/worldwide/en/company/innovation/electrification
- Hyundai Europe — IONIQ 6 / E-GMP
  https://www.hyundai.news/eu/models/electrified/ioniq-6/press-kit/hyundai-ioniq-6-delivers-a-new-electric-mobility-experience-march-2023.html

### 2.4 丰田 TNGA-F：非承载式越野车/皮卡的不同平台家族
丰田官方明确 TNGA-F 面向采用梯形车架的皮卡与部分 SUV，如 Land Cruiser、4Runner、Sequoia、Tacoma 和 Tundra。此例证明“真正的硬派越野车车架”与“轿车承载式平台”不应默认视为可随意互换的同一骨架。
- Toyota USA — Trucks Family: body-on-frame and TNGA-F
  https://www.toyota.com/vehicles/trucks
- Toyota Global — Land Cruiser GA-F structure
  https://global.toyota/en/newsroom/toyota/35323595.html

### 2.5 科学文献：平台变型、硬点和多目标冲突
- Frank et al., 2022, *How to manage vehicle platform variants?* Procedia CIRP, DOI 10.1016/j.procir.2022.05.300。讨论平台共性与车型差异的矛盾及变型管理方法。
  https://www.sciencedirect.com/science/article/pii/S2212827122007491
- Tak, Chung & Chun, 2000, *An Optimal Design Software For Vehicle Suspension Systems*, SAE 2000-01-1618。悬架设计需要硬点坐标、弹簧/衬套等柔性元件参数，并据外倾、前束等目标优化；故更改轮距不能机械地统一放大所有摆臂。
  https://saemobilus.sae.org/papers/optimal-design-software-vehicle-suspension-systems-2000-01-1618
- Ning et al., 2010, *Design and Simulation of the Suspension System of Chassis Platform Based on Handling Stability*, SAE 2010-01-0723。相同底盘平台服务不同车型时，需调弹簧/阻尼/导向机构与硬点位置并重新分析操稳与舒适性。
  https://saemobilus.sae.org/papers/design-simulation-suspension-system-chassis-platform-based-handling-stability-2010-01-0723
- Weber (GM), 2005, *GM's Evolving Epsilon Midsize Car Platform*, SAE 2005-01-1028。车身平台变型需处理碰撞、模态、布置、轴距、动力总成、质量等跨系统变化。
  https://saemobilus.sae.org/papers/gms-evolving-epsilon-midsize-car-platform-2005-01-1028
- Ford Motor Company / Hodges, 2004, *Issues in Automotive Product Platform Strategies*, SAE 2004-01-0483。平台策略涉及零件/系统共用、模块化矩阵、产品架构和成本权衡，并非复用越多越好。
  https://saemobilus.sae.org/papers/issues-automotive-product-platform-strategies-2004-01-0483

**证据范围说明**：上述 OEM 说明证明工程实践存在，同行评审和 SAE 论文提供设计方法/影响因素；它们不能直接证明我们的具体悬架、车架和动力模型已经正确，也不代表复刻了任何厂商的私有几何或设计数据。

## 3. CAR 平台应增加的架构层级

```text
Engineering Rules（工程规则库）
  ├── 单位、坐标系、材料、制造/安全约束
  └── 安装接口类型、验证方法、公开证据
      │
      ▼
Architecture（整车架构家族）
  ├── body-on-frame（非承载式；硬派越野车/皮卡）
  ├── unibody（承载式；轿车/城市 SUV）
  └── EV-skateboard（专用电动化布置，可按未来实际需求细分）
      │
      ▼
PlatformFamily（平台家族，固定点 + 变化范围 + 模块集）
      ├── fixedHardpoints：如前轴相对驾驶位置的特定设计基准
      ├── parametricDimensions：轴距、轮距、离地间隙等允许变化范围
      ├── swappableModules：前/中/后车架段、动力、电池、悬架选项
      └── interfaceContracts：螺栓、接头、轴线、关节、线束与管路接口
      │
      ▼
VehicleVariant（具体车型配置及边界验收）
      ├── 短轴越野版 / 长轴越野版
      ├── 承载式城市 SUV / 轿车（可共享一个适当平台家族）
      └── 其他架构：复用通用 PartFamily，但不强求共享整个底盘
      │
      ▼
Assembly + BOM + CAD/GLB + Kinematics + Dynamics + Viewer
```

**重要建模原则**：PlatformFamily 定义“哪些位置可固定，哪些可变化，变化后谁跟着重生成，以及什么情况下禁止组合”。它不是一套固定尺寸的网格。

## 4. 三类配置字段与约束

1. **固定（FIXED）**：特定平台家族设计的基准轴/基准面、接口类型、座舱基准等。固定的是**设计规则或相对位置**，不一定是世界坐标中的绝对数字。
2. **可变（PARAMETRIC）**：轴距、轮距、离地间隙、前后悬、悬架几何参数及部分断面长度。必须声明范围、单位、关联约束与派生零件，不是简单全局 `scale`。
3. **可替换（SWAPPABLE）**：车身、车顶、轮毂/轮胎、制动模块、悬架拓扑、前后驱/四驱、电驱或发动机。替换前检查接口匹配和空间包络。

最低数据契约：
```json
{
  "platformFamilyId": "demo-unibody-v1",
  "architecture": "unibody",
  "fixedHardpoints": ["front-axle-reference", "pedal-reference"],
  "ranges": {
    "wheelbase_mm": [2400, 3000],
    "front_track_mm": [1500, 1850],
    "rear_track_mm": [1500, 1850]
  },
  "moduleSlots": ["front-module", "center-floor", "rear-module", "front-suspension", "rear-suspension", "body-upper"],
  "rules": ["compatible-mounts", "clearance-check", "suspension-kinematics", "mass-property-update"]
}
```
以上只是用于解释数据结构的**假设范围**，不是丰田/大众真实平台参数，也没有工程验证，不得当成车辆设计指标。

## 5. 变型影响传播（后续 Agent 必须实现）

| 更改 | 不能只修改什么 | 需要联动的系统 |
|---|---|---|
| 轴距增加 | 不只是移动后轮或把整车拉长 | 中央地板/纵梁、传动轴或线束管路、车身底部、座椅布置、质量/质心/轴荷、转向响应 |
| 轮距增加 | 不只是移动轮胎 | 摆臂或副车架连接、半轴、拉杆、翼子板、车轮包络、前束/外倾及悬架运动 |
| 更换轿车外壳 | 不只是换一张 GLB | 车身骨架承载方式、碰撞载荷路径、A/B 柱/地板接口、驾驶员与视野、轮罩/座椅/门槛/车门包络 |
| 越野→公路化 | 不只是改胎纹和悬架弹簧颜色 | 整车离地间隙、侧倾中心、车高、悬架行程、减振/弹簧、轮胎模型、质量及操稳目标 |
| 发动机→电驱 | 不只是删除发动机 | 动力传动、动力电池承载/热管理、高压布线、碰撞保护、质量/轴荷、制动能量回收 |

每次配置变化触发：**参数检查 → 模块变型选择 → CAD 重新生成 → 总成关系检查 → 装配/干涉检查 → 运动学检查 → 质量/物理更新 → GLB 生成 → 浏览器展示**。失败时报告具体原因，不默默拉伸、错装或穿模。

## 6. 对 MASTER_PLAN 的修正建议（优先级）

- P0：在 `PartSpec/Assembly/Joint/VehicleConfig` 上面新增 `Architecture` 和 `PlatformFamily` 两类正式 Schema；在几何生成前约定 fixed/parametric/swappable 规则、硬点和变化传播表。
- P1：法兰证明了建模链路，但不验证整车平台化；高精度轮端总成仍按原计划推进。
- P2：通过**短轴/长轴、标准轮距/宽轮距**两个轴向变型，证明模块重算与安装孔/悬架硬点联动，不依赖整体 Mesh 缩放。
- P3：先展示同平台家族下两个体型/不同车壳，再做另一架构家族；**不要把梯形车架和承载式轿车当成简单换壳**。
- P4：变型后必须检查运动学/质量/动力学；Cannon RaycastVehicle 可以保留为演示但不能验收操稳工程正确性。
- P5：视觉对比作为技术展示，与真实车辆结构的验收证据分开。

## 7. 两个可落地的研究/测试样板

**样板 A：同一非承载式越野平台的短/长轴差异**
- 先用假设参数造一套短轴四驱框架；通过 `wheelbase` 与 `track` 变化生成变体。
- 验收：前/中/后段装配、传动轴/管线长度、悬架连杆、轮罩与轴距变化一致；碰撞/干涉/运动边界报告同步更新。
- 允许更换旅行版/皮卡外壳，但将承载式轿车排除在这套车架家族外。

**样板 B：同一承载式/电动平台衍生 SUV 和轿车**
- 共享规范化的地板、电驱/电池、轮端与基础模块接口，SUV/轿车各自使用合适的车身上部和参数区间。
- 验收：车型变体由 `VehicleVariant` 生成而不是修改模型坐标；有模块兼容性、质量/质心、乘员与轮罩包络的自动检查。
- 若变体无法满足约束，则判定需要新的 PlatformFamily，而不是强行复用。

## 8. 当前研究结论与可信度

**确定**：平台可允许轴距、轮距和部分尺寸变化；可实现不同车身类型；需定义固定与可变部分、模块和共用接口（官方一手资料及学术研究支持）。

**工程上合理但尚待本项目验证**：我们可以用 build123d 参数化 CAD + JSON Schema + 装配图来实现配置变化，并通过 Blender → GLB → Three.js 展示。此技术路线可行，但没有完成跨车型自动派生测试。

**不能直接声称**：一套非承载式底盘可轻松变成合规承载式轿车；几何正确等于碰撞安全；所有车型可共享一套零件；现有 Cannon 场景已经达到工程真实度。

---
结论：继续现有总计划，但将“平台家族/硬点/可变范围/变更传播/跨车型验证”提前到 P0 设计。这样后面真正增加车型才不会返工。
