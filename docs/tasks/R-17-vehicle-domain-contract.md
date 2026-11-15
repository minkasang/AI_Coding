# R-17｜建立整车工程主数据的可执行原型（DeepSeek）

> 工作位：deepseek，P0；前置：R-12 24/24 条件/来源检查完成、R-02/R-07/R-10 接口研究可读。不得因 R-16 尚未提交而阻塞：先从现有 RP-01/R-06/R-11 做最小 fixture，再协同对齐。

## 目标
为 CARLAB 做出一份**真实运行、能保存、能校验、能映射 3D 对象 ID 的最小工程领域模型原型**。它最终将承接浏览器 V2 的单工程 ProjectStore，但**本任务先独立在 `src-experiments/domain-contract-v1/` 开发**，避免边做边破坏 5173。

## 最小能力
1. 明确 `Project/VehicleVariant/System/Assembly/PartDefinition/PartInstance/MountFrame/Joint/Constraint/AssetRef/SourceEvidence/SimulationRunRef` 的候选关系，以及哪个字段是主事实，哪个只是显示/投影状态。
2. 一个完整的“整车骨架（四轮/主要系统）” fixture + 一个可动“左前轮端” fixture。即使很多部件缺几何，也能正确选中/枚举；不把旧 THREE Object3D 节点名当 `instanceId`。
3. 将 R-12 `applicableWhen/evidenceInherited`、不同代际互斥、REF 与 BOM 数量、采购/展开模式、UNKNOWN 不升级合并成明确的验证路径；失败给对象 ID、规则、来源和可读解释。
4. 定义从车辆局部坐标到 CAD 局部 Frame 和 3D Y-up 视窗的显式转换边界。先写可复验 fixture 和单位/左右镜像测试，**不自行宣布唯一生产坐标系统已正式冻结**。
5. 修改一个重要部件参数时，过期的几何或试验结果必须打 `STALE`，不能继续视为当前工程版本。
6. 提供最小命令 API：新增实例、移动到 Assembly、设置约束和基准、选择变型、校验、序列化/恢复、读取展示转换。实现和测试尽量纯 Node、无新端口和大依赖。

## 交付/验收
- `docs/research/R-17-domain-contract-rfc.md`（候选 Schema、转换、三层真值、冲突决策清单）。
- `src-experiments/domain-contract-v1/` 的模块、两份 fixture、Node 测试、运行说明；重点用**真实已有 RP-01/R-06 数据片段**而不是只写美化 JSON。
- 人员报告 `agent-workspace/agents/deepseek/reports/R-17.md`，包括正常装配、Gen1/Gen3 混配、未知凭证越权、实例 ID 重复、状态过期、错 Frame/单位、无关零件被重复计量等负例。
- **不修改** `src/`、`workbench-v2/` 生产核心、旧 CARLAB 页面、其它模型目录；仅隔离样板。需要向 Qwen/Grok/Composer 提字段提案，直接用公共消息协商，不让用户传话；主卡提交 `submitted` 等总控裁决。
