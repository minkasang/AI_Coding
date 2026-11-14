# 当前任务派发索引（2026-11-14）

> **提示：此前此文件给 R-01 / R-02 等旧研究任务的静态提示词已过时。**
> 由于整车蓝图规划深化，第一波现以 RP 系列任务为主。**任务卡的状态、负责人和步骤以各模型 `tasks/*.md` 为准**，不要以这里的摘要当作实时状态。

## 最简单的方式

1. Windows 运行 `npm run dashboard`，Chrome 打开 **http://localhost:5174/#dispatch**。
2. 找到模型的 **RP 任务**，点击「复制完整任务提示词」，手动粘贴给对应 AI。
3. AI 若可以访问本地项目，按任务书写研究文件并更新自己的任务卡。否则直接交给你完整回报。
4. 在看板「粘贴 AI 回报」后，任务进入 `submitted`，再由 GPT-6 审查文件与证据。

## 当前研究顺序（目录索引，不是重复状态源）

| 类型 | 任务 | 模型 | 任务书 |
|---|---|---|---|
| 总控规划 | RP-00 | GPT-6 | `RP-00-planning-charter.md` |
| 第一波并行 | RP-01 全车系统树 | Qwen4 | `RP-01-vehicle-system-breakdown.md` |
| 第一波并行 | RP-02 跨系统接口图 | DeepSeek | `RP-02-cross-system-interfaces.md` |
| 第一波并行 | RP-03 真实性/物理等级 | Grok | `RP-03-physics-fidelity-levels.md` |
| 第一波并行 | RP-04 CAD 零件生产策略 | Gemini Flash | `RP-04-cad-production-strategy.md` |
| 第一波并行 | RP-06 浏览器工程查看体验 | Composer 2.5 | `RP-06-engineering-viewer-workflows.md` |
| 独立第二波 | RP-05 缺口审计 | HY4 | `RP-05-independent-gap-audit.md` |
| 最终总控 | RP-07 汇总系统蓝图 | GPT-6 | `RP-07-synthesis-blueprint.md` |
| 继续并行 | A-00 安全基线 | GPT-6/本机 AI | `A-00-baseline-audit.md` |
| 可并行补充 | R-05 视觉专项 | HY4 | `R-05-render-quality.md` |

旧 R-01/02/03/04 和 UX-01 暂缓，留在总任务池，不删除或伪装完成。**完整规划纲领**：`../planning/PLANNING_PROGRAM.md`；**原总计划**：`../../MASTER_PLAN.md`。

没有连通外部模型 API 的自动执行器，打开看板不会自动启动其他 AI。这一版的实际沟通仍由用户通过复制与粘贴完成。
