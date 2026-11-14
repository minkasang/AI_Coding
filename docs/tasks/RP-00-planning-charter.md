# RP-00｜建立整车系统蓝图规划深化工作包（GPT-6）

## 任务授权：目标约束明确，执行路径由你自主决定

> **重要**：本任务书描述最终需要解决的问题、质量标准和交付边界；以下研究问题是覆盖要求/探索线索，不是总控预先安排的固定执行顺序。阅读项目 `AGENTS.md` 第 0 节和 `docs/command/PROMPT_AND_DELEGATION_STANDARD.md`。请先核实当前状态，**自己规划合理的技术路线，并在个人工作区按需创建带 parentId 的子任务卡**，自主调整步骤。不要为完成清单而牺牲发现新问题的机会。每项结论必须可证实、可落地，涉及跨模型接口或整体范围变化需提交总控审查。


**类型**：RESEARCH/ARCHITECTURE；状态由 GPT-6 的任务卡维护。
**只读输入**：`MASTER_PLAN.md`、`docs/command/PLAN_READINESS_REVIEW.md`、`docs/research/RESEARCH_BASELINE.md` 和相关已完成的研究与验证。
**唯一可写范围**：`docs/planning/PLANNING_PROGRAM.md`、`docs/planning/VEHICLE_SYSTEM_TREE_SEED.md`、`docs/planning/GAP_REGISTER.md`、`docs/tasks/RP-*.md`、`agent-workspace/agents/gpt-6/tasks/RP-00.md` 和经过项目所有者允许的计划链接更新。
**禁止**：修改 `src/`、原汽车模型、CAD 生产代码和模型的个人报告。不要宣称下游专题已研究完成。

## 目标
把当前路线图扩展为一个有系统树、接口研究、真实性策略、变更影响和独立缺口审计的长期规划程序。确保每一项研究最终能转化为实现任务，而不是只产出长篇科普。

## 交付
1. `PLANNING_PROGRAM.md`：规划范围、技术分类、研究分工、阶段关口、报告格式和前置依赖。
2. `VEHICLE_SYSTEM_TREE_SEED.md`：给不同研究代理使用的顶层编号和必要的车型条件说明。
3. `GAP_REGISTER.md`：每项潜在遗漏含 ID、原计划现状、责任、后果，明确“候选/待核实”。
4. RP-01—RP-06 的具体任务与个人任务卡，全部能从 Chrome 指挥看板复制提示词。
5. 原总计划添加一条规划深化链接，明确不替换既有 P0–P5 和不抢占已完成工程成果。

## 验收
- 从一个代表性系统（如制动）可以追溯到物理产品树、接口、建模、仿真与验收；
- 任务之间无同时编辑同一输出文件的冲突；
- 第一次研究能在明确隔离的条件下并行启动适合的模型；独立查漏必须等第一轮成果提交；
- 明确规划种子不等于真实 BOM 或工程认证。
