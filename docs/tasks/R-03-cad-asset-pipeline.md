# R-03｜多零件 CAD 资产链路的可复现规范与质量验证（Gemini Flash）

> 阶段：首轮 RP-04 经总控复审后续深化。**不是重新做一遍已完成的法兰/轮端试验**。真实任务状态唯一来自 `agent-workspace/agents/gemini-3-8-flash/tasks/R-03.md`。

## 本轮愿景和目标

我们希望最终拥有一座高细节、可拆解、可装配、可延伸出不同车型的机械零件库，能稳定从 CAD 产生 Chrome 可显示的资产。之前 RP-04 已经证明单个轮端的多零件建模、GLB 节点及 extras 可以导出；现在需要回答：

**当零件数量和变型增加时，我们怎样保证构建结果可重复、零件身份不丢失、安装位置有依据、质量检测不会误报？**

这轮任务的核心产出是一个**可供后续 Agent 稳定复用的资产生产方案和少量独立可运行实验**，不是一次生成上百个零件。由执行 AI 自主规划方法和子任务，不必机械照抄我给的研究顺序。

## 可直接使用的输入

- `cad/experiments/hello_flange/` 原单件样例；
- `cad/experiments/planning_feasibility/` RP-04 多零件样例、`verify_assembly.py`、`params.json`；
- `docs/planning/reports/RP-04-cad-production.md`、返工复审 `docs/command/reviews/AUDIT_2026-11-14_RP04_RECHECK.md`；
- `docs/command/FILE_HANDOFF_PROTOCOL.md`、`docs/command/PROMPT_AND_DELEGATION_STANDARD.md`；
- DeepSeek 正在研究 `R-02` PartDefinition/PartInstance/Joint 接口，**其 schema 尚未冻结**。

## 必须回答的工程问题

- 多个零件的 `partId / instanceId / revision` 如何与 STEP、网格、GLB、材料、安装点和参数生成脚本一一对应？重复螺栓如何保留各自独立实例？
- **坐标与单位**：build123d(mm)、Blender、glTF(m)、浏览器世界坐标如何转换并验证，不允许因为几何看起来贴合就认为装配正确。
- **增量重建与资产缓存**：某个零件参数变化后哪些文件需要重新生成？如何保证输入相同输出可重复，旧结果不混入新车型？
- 如何检测零件无效、孔位不一致、元数据丢失、BOM 不对应、装配间隙/相交、导出尺度错误？哪些需要 CAD B-rep 测试，哪些只能在浏览器/Blender 验证？
- 复杂零件、紧固件和材质应该怎样分级做精度与 LOD，且明确哪些工程属性只能作为显式假设而非真实量产参数？
- 与 DeepSeek R-02 的未来 Schema 如何解耦：**先提出适配与映射提案，不擅自写成项目统一正式协议。**

## 希望交付什么

- 研究报告：`docs/research/R-03-cad-asset-pipeline-report.md`，重点是可实现的流水线设计、真实验证证据、信息损失/失效边界和对 R-02 的字段建议。
- 结构化样例：`docs/research/R-03-asset-manifest.example.json`（示意字段、来源等级和版本）。
- 如需要隔离代码实验，可放 `cad/experiments/asset_pipeline_v1/**`，包含生成脚本、参数和测试；尽量复用既有 F 盘的 build123d、Blender 和 Python 环境，不重新安装大型软件。
- 个人回报：`agent-workspace/agents/gemini-3-8-flash/reports/R-03.md`；具体子任务在个人 `tasks/` 中自主创建并关联 `parentId: R-03`。

## 边界与验收

不能修改 `src/`、`MASTER_PLAN.md`、其他模型任务卡，不能在未批准前修改共享生产 Schema；严禁把演示尺寸写成 OEM 真实尺寸。没有必要为凑数量拆成大量任务。研究完成后总控应能以其产物安排真正的资产管线实现，且有可复现的正例、反例和明确的失效报告。

若跨模型接口决定尚不成熟，优先交付解耦设计和隔离实验，把阻塞条件写入回报，不要以想象的字段强行冻结工程架构。
