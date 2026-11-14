# CARLAB 通用 Agent 任务书模板

> 每个任务应可完整复制到一个 AI 会话中执行；不要求其推测总架构细节。填完所有字段再派发。

## 任务身份
- `taskId`：
- `type`：RESEARCH / IMPLEMENTATION / AUDIT / INTEGRATION
- `priority`：
- `status`：BACKLOG / ASSIGNED / IN_PROGRESS / SUBMITTED / APPROVED / REWORK / BLOCKED
- `owner`：
- `dependsOn`：
- `baseRevision`（Git commit / 尚未建 Git 则标 no-git-baseline）：

## 一句话目标
- 通过什么动作达成什么能验收的具体结果。

## 先读的输入
- `AGENTS.md`
- `MASTER_PLAN.md`
- `docs/command/COMMAND_CENTER.md`
- 本任务专有文件：

## 范围界定
- `allowedPaths`：
- `forbiddenPaths`：
- 哪些已实现功能必须保留：
- 不允许自行决定或修改的接口：

## 研究/实现要求
1.
2.
3.

## 明确的交付
- 文件、结构、参数、源代码、引用、截图/日志：
- 不同路径的职责：

## 验收
- 验证命令：
- 预期结果：
- 人工核验点：
- 失败/异常边界：
- 性能与空间证据（如适用）：

## 停止条件
- 依赖缺失、跨模块 Schema 冲突、空间不足、版本不兼容、工程来源不能核实 → 标记 BLOCKED。
- 不以删除验证/改为纯动画/写死值等方式绕过验收。

## 最终报告
- 完成、证据、修改范围、限制、下一步；不得自行宣称 APPROVED。
