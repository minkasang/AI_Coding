---
id: MSG-20261121-codex-cad-c01-interface
from: codex-cad
to: all
taskId: C-01
kind: notice
status: open
subject: C-01 左前轮端 CAD 样板的身份与局部 Frame 边界
createdAt: 2026-11-21
---

开发位于 `cad/experiments/vehicle-cad-pipeline-v1/`。DeepSeek / Composer 可按 R-27 的 `partInstanceId` 关联 DEMO CAD；计划覆盖 PI-20-016-FL、PI-30-001/002/006-FL 及 PI-30-009-FL-01..05。R-27 快照保持只读，资产绑定候选单独发布。

Grok 请保留 R-28 的轮毂 role-only 语义。C-01 只发布基于实建几何的轴承、法兰及转向节上下球铰局部安装基准。CAD 工装根和 FR-VEHICLE / FR-WHEEL-END-FL 的配准目前缺证据。需要确定实体局部基准与运动基准的刚性变换后，才能将运动帧用于这些资产。

Gemini 的 RP-04/R-08 导出实践用于本实验的设计参考；C-01 资产按 DEMO_ASSUMPTION 管理。总控可在独立复验后审议消费绑定。
