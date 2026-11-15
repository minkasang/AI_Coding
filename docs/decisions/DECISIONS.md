# CARLAB｜架构决策记录（ADR Index）

> 本文件只记录经过总控审查的决定；研究 Agent 不得直接修改。修改需标明日期、背景、证据、代价、备选方案、影响及回退策略。

## 已有项目约束（ACCEPTED / 2026-11-12）

| ID | 决定 | 依据与说明 |
|---|---|---|
| ADR-000 | 总体目标是可复用的车辆工程平台，不是单个汽车的静态 3D 模型 | `MASTER_PLAN.md` |
| ADR-001 | 保留可运行的旧 Three.js/WebGL + Cannon-es 演示，先建立基线再迁移 | 2026-11-12 项目文件检查；原源码仍存在 |
| ADR-002 | CAD(mm) 与浏览器(m)分离；Python + build123d → STEP/STL → Blender → GLB | hello_flange 实测构建链，`docs/environment-build123d.md` |
| ADR-003 | 主要新增开发环境、缓存、模型资产放 F 盘，不随意覆盖/迁移现有软件 | 本机 C 盘长期空间紧张，`AGENTS.md` |
| ADR-004 | 物理分级：演示动画、运动学、车辆动力学分别验证 | 既有 Cannon RaycastVehicle 与 Chrono 官方能力边界不同 |
| ADR-005 | 先研究再冻结跨模块 Schema；未经研究和审核的接口不能作为生产规范 | 总控质量门，`docs/command/COMMAND_CENTER.md` |
| ADR-006 | 给 Flash/DeepSeek 的实现任务必须单任务、单边界、可复验、报告失败 | 降低跨文件/跨子系统的不确定性 |
| ADR-007 | **用户已确认产品方向：CARLAB 以可从零搭建、装配、验证和仿真车辆的工程工作台为核心；实时驾驶、越野和城市场景是独立扩展**。悬架/转向/传动属于车辆对象树，不是永久平级的页面入口 | 用户 2026-11-15 确认；`docs/planning/VEHICLE_BLUEPRINT_V1.md`（DRAFT）。此项固定产品目标，不代表 Schema/求解器/工程真实性已冻结 |

## 研究中，尚未批准（PROPOSED）

| ID | 待决项 | 研究依赖 |
|---|---|---|
| ADR-P01 | `Architecture / PlatformFamily / VehicleVariant` 的 JSON schema 与 hardpoint 变更传播方法 | R-01 |
| ADR-P02 | `PartDefinition / PartInstance / Assembly / Joint` 的最小标准和坐标转换 | R-02 |
| ADR-P03 | build123d Compound/Joint 的真实可用 API 与 Blender 独立物体层级保留机制 | R-03 |
| ADR-P04 | 首个双叉臂悬架机构的运动学解算和物理输出边界 | R-04 |
| ADR-P05 | WebGL/VFX 画质升级顺序及 WebGPU 迁移门槛 | R-05 |

## 决策审查模板

- **问题**：我们为什么需要决定它？
- **证据**：官方文档、论文/标准摘要、可运行实验、实测数据与不确定性。
- **备选**：至少两个可执行方案及其约束。
- **决定**：明确选用方案，哪些接口固定、允许哪些变化。
- **代价/风险**：性能、依赖、维护、授权、数据丢失。
- **验收及回退**：测试命令、预期输出、旧代码是否受影响。
- **后续变更**：何种新证据会触发重新审查。

> 已批准的 ADR 可以转成 IMPLEMENTATION 工作单；未批准方案仅能用于隔离研究。
