# R-21｜让详细整车系统树和可执行工程对象 ID 对齐（Qwen4）

> 前置 R-16 已验收研究范围；DeepSeek R-17 领域模型已可运行。不要从零重画树，也不要再创建孤立首页。

目标是将 R-16 的 13 系统/278 零件实例和 R-17 简化 fixture 的 10 系统/14 实例建立**机器可读、可核验的对照表**。保留差异，不允许为了强行统一而丢弃真实节点或把空几何贴成实体。

必须完成：映射 `systemId/assemblyId/partDefinitionId/instanceId/mountFrameId`，区分 System 功能分类与 Assembly 装配容器；四角与轴/代际身份及重复实例序号；按每个父装配实例计算 qty，不把 12 项已发现数量冲突静默消掉；紧固架构轮螺栓 vs 螺柱+螺母条件互斥，且明确 Gen1/Gen3 条件；所有演示几何和来源未知都保留 `UNKNOWN/GEOMETRY_PENDING`，禁止把 Dorman 参考件偷换成样板件。

交付：`docs/research/R-21-vehicle-tree-domain-mapping.md`、`docs/research/R-21-vehicle-tree-mapping.fixture.json`、本人 `tools/r21_*.py` 校验和负例、个人报告 `agent-workspace/agents/qwen4/reports/R-21.md`。需要调整主树的补丁只提候选与测试，**不直接改 RP-01/R-16 原有已验收文件**；给 DeepSeek R-22、Composer R-25 发公共消息，用户无需转述。

验收：能报告映射的实例数/未映射数、重复 ID、父子数量层级、四角实例、UNKNOWN 遗漏与真实冲突；至少 10 项负例，发现未闭合部分如实列出。不得创造新常驻端口。
