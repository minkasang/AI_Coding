# CARLAB 技术研究基线｜2026-11-12

> 状态：总控先行研究 v1。可作为任务分配的原始依据，但不等于本项目实现/验收已完成。
> 分类：EVIDENCE（一手公开资料已支持）、INFERENCE（合理工程推导）、OPEN（尚需实验裁决）。研究型代理须保留这种分级。

## 一、已得到外部证据支持的原则（EVIDENCE）

### E1. 一个平台不是固定的一幅三维底盘
大众集团在 2025 年报中明确：MQB 将 wheelbase、track、wheel size、seat position 等作为可变化的概念尺寸；pedal 到前轮中心的距离等关键尺寸保持统一。这意味着“固定的基准 + 可变尺寸 + 共用模块”并存，且平台策略涉及共用零件及生产效率。
- 一手来源：https://annualreport2025.volkswagen-group.com/group-management-report/report-on-risks-and-opportunities/risks-and-opportunities/research-and-development-risks.html

### E2. 平台可以是“标准前段/中段/后段 + 配置变量”
丰田 e-TNGA 公开资料直接区分固定项（前后电机布置、驾驶员相对前轮的位置、电池宽度等）和可变项（轴距、电池数量、前后悬等），并提及 front/center/rear modules 组合。
- 一手来源：https://global.toyota/en/newsroom/corporate/28474382.html

### E3. 浏览器展示格式应与工程实体格式分开
Three.js 官方 3D 模型加载指南推荐 glTF/GLB 作为运行时模型交付；GLTFLoader 能加载 mesh/material/animation 等。GLB 不应承担 STEP 的精确 B-rep/装配基准保存任务。
- 官方来源：https://threejs.org/manual/pages/loading-3d-models.html
- 官方来源：https://threejs.org/docs/pages/GLTFLoader.html

### E4. build123d 的装配不止是显示一个大 Mesh
官方 build123d 文档以 Compound 层级以及 joint tutorial 组织零件；可用作 CAD 侧的参考，但必须在当前已安装的 build123d 0.13.0 上验证具体 API，不能照抄更新版文档假设完全兼容。
- 官方来源：https://build123d.readthedocs.io/en/latest/assemblies.html

### E5. 车辆动力学不能用单一“摩擦系数”代替
Project Chrono Vehicle 提供多种悬架模型、轮胎模型与地形耦合，轮胎有 rigid/handling/finite-element 等不同模型和可用场景限制。因此现有 Cannon RaycastVehicle 应定义为交互演示低保真基线，不能将冰、湿地、泥地直接等同于一个 friction 数值。
- 官方来源：https://api.projectchrono.org/development/group__vehicle.html
- 官方来源：https://api.projectchrono.org/development/wheeled_tire.html

## 二、由证据推导的技术方向（INFERENCE；还需要本项目原型验证）

1. **规范优先**：`Architecture → PlatformFamily → VehicleVariant → Assembly → PartInstance → Asset` 是建议的软件数据层级，用于表达车型家族/变体/装配与运行时资产；这是我们设计，不是某 OEM 的私有平台数据。
2. **双重几何**：`model.py + parameters.json + STEP` 保存工程几何；`GLB/LOD/material` 保存网页表现；两者以 `partId/revision/hash` 关联。
3. **变型传播**：轴距变化应传播给前中后车架模块、传动轴/线束/管路、车身内外部布置、质量属性及车辆动力学。不能通过 Three.js `mesh.scale.z` 宣称完整机械变型。
4. **空间与运动分离**：CAD/装配硬点是工程源头；运动学求解产生节点位姿；渲染只展示；物理求解可替换，不能由动画直接当作真实力学结果。
5. **版本过渡**：保留原 `Three.js ^0.170.0` + `cannon-es ^0.20.0` 演示；先最小化导入一个法兰 GLB，再决定构建工具和 WebGPU 迁移。高质量外观先看几何/倒角/材质/灯光，而不是堆高级 GI 名词。

## 三、尚未解决的问题（OPEN，必须先有实验和设计评审）

| 待研究问题 | 所需判断/证据 | 影响的开发决策 |
|---|---|---|
| 同平台哪些硬点固定、哪些可变？ | 工程规则样例，至少两种车型配置及非法配置 | `PlatformFamily` schema |
| 变轴距/轮距的依赖如何传播？ | 变更影响图 + 反例 + 最小可检验样本 | Config Resolver |
| CAD 装配源与业务装配数据如何映射？ | 当前 build123d 0.13 实测，Compound/joint/STEP 导出表现 | Assembly schema |
| STEP→STL→Blender→GLB 会损失什么？ | 验证零件 ID/法线/尺寸/坐标/单位/材料/变换是否保留 | Asset pipeline |
| 悬架导向机构如何有真实运动学？ | 硬点+自由度+回弹、外倾/前束曲线、约束冲突检测 | Kinematics |
| 何时使用 Cannon/Rapier/Chrono？ | 能力/限制/集成代价/可测试工况的方案比较 | Physics adapters |
| 浏览器渲染质量的真正瓶颈是什么？ | 相同模型的 geometry/material/light 逐项 A/B，FPS/显存 | Viewer vs WebGPU |
| 工程正确的质量属性与碰撞简化怎么表达？ | B-rep/网格几何、惯量、形状、单位及来源 | Physics data contract |
| 对外参考资料能否引用/改造？ | 许可证、可靠性、尺寸依据、是否有衍生作品限制 | 资产治理 |

## 四、第一批研究先后顺序

- **R-01（平台架构）** + **R-02（装配数据契约）** 是 P0 的设计关口，先行。
- **R-03（CAD 资产流水线）** 与 **R-04（悬架与物理边界）** 可以并行，不得与另一条线同时修改旧源码。
- **R-05（渲染与视觉基线）** 可以并行调查，但在前几项验收前**不启动重构渲染引擎**。
- 每个研究输出必须包含：一手参考及证据强度、具体规则、可实现数据结构、失败/边界案例、验收样本、未确定问题。不接受纯大词罗列。
- 研究结论由总控审查后写入 `docs/decisions/DECISIONS.md`，再解锁下游实现任务。Flash 等研究代理可以建议，不得擅自确定跨模块接口。

## 五、当前本机已验证的最小链路

已由 Gemini 报告并有实际文件/代码审查：
`F:\project\cyq\AI_Coding\car\.venv`（Python 3.13 + build123d 0.13.0）
→ `cad/experiments/hello_flange/model.py`
→ `.step/.stl`
→ Blender 5.2.2 `blender_stl_to_glb.py`
→ `.glb`。

GLB 魔数、长度及范围经过独立检查：148 mm 的法兰在 GLB 坐标为约 0.148 m，总字节数 151940。
**尚未验证**它作为独立 `PartInstance` 在当前 Chrome 页面中渲染、选择、替换和回归，因此这条链路不是平台已完成的证据。

---
以上结论作为研究任务的起点。任务书目录：`../tasks/`。
