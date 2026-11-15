# R-22｜把整车树、机械位姿接到同一工程主数据原型（DeepSeek）

> 前置 R-17 领域模型已验收独立能力、R-16/R-18 可作为输入。**核心目标是跨模型整合，不是另一份漂亮 JSON。**

在 `src-experiments/vehicle-integration-v1/` 编写读入 R-16 真实（仍是候选、所有几何 UNKNOWN）的实例树、映射 R-17 的稳定 ID/Frame/Joint/Constraint/SourceEvidence 及 R-18 的运动位姿，产出一个可追踪的 `VehicleProject + PoseRun` 样例并通过严格验证。原数据和旧 workbench 项目都不覆盖。

必须设计并验证：**唯一实例身份** `instanceId` 不取自 GLB 的 Object3D 名；R-16 定义/实例多且 R-17 fixture 少，应报告 scope 和 coverage，不假装两者已一致；单位 mm/m、左右镜像和 Y-up 显示变换可复核且无隐式全局 scale；Joint 是装配关系、Constraint 是解算方程，SimulationRun 随输入修订变 `STALE`，不得按错版继续播放；缺 CAD 的实体输出状态 `NO_GEOMETRY` 不输出伪 Mesh；来源 ID 不可随字符串自动升 OEM。

交付：`docs/research/R-22-integration-schema-and-decision-log.md`、`src-experiments/vehicle-integration-v1/` 下适配器、fixture、run/check/tests、个人报告 `agent-workspace/agents/deepseek/reports/R-22.md`，含跨模型 ID/Frame/结果结构和明确待总控裁决项。至少覆盖重复 ID、旧 revision、错误单位/变型、无硬点和不合法 Joint 的拒绝。和 Qwen4、Grok、Composer 互发消息，无需用户中转。正式 schema 未冻结前保持候选；禁止改 `src/main.js`、`workbench-v2/` 或其它模型的私有成果。
