# UX-01｜看板「各模型下一步」交互设计说明

> 版本：2026-11-14 · Composer 2.5 · 对应实现 `command-center/app.js`

## 问题

用户需要知道**每个 AI 现在该做什么**，而不是把最近 `approved` 的任务误当成「当前工作」。子任务不应出现在「下一步」主卡片中。

## 决策

1. **单一算法** `pickNextMainTask(agentId)`：只考虑 `!parentId` 的主任务；按状态序  
   `in_progress → needs_work → ready → submitted → blocked → backlog`；同态按 `priority`（P0 优先）再按 `displayCode`。
2. **永不选取 `approved`** 作为下一步；无活跃主任务时文案为「待总控安排」。
3. **三处一致展示**：总览「各模型下一步」、成员卡片、模型详情顶栏横幅，共用 `nextActionCopy()`。
4. **模型详情分层**：「当前队列」（活跃 + backlog）→ 子任务区 → `<details>` 折叠「已验收历史」。

## 验证场景（2026-11-14 API 快照）

| 模型 | 期望下一步 | 依据 |
|---|---|---|
| composer-2-5 | UX-01 `ready` | 优先于 `backlog` VIEW-01；RP-06 已 `approved` 不展示 |
| hy4 | `submitted` 先于 `ready` | RP-05 待审优先于其他可领任务 |
| qwen4 | `ready` | 存在可领取主任务 |
| 仅 `approved` 的模型 | 待总控安排 | 无活跃态主任务 |

## 未解决

- 同一模型多张 `in_progress` 时只显示优先级最高的一张（其余仍在「当前队列」列表中）。
- 未做 Playwright 视觉回归；依赖人工刷新 5174 确认布局。

## 检查命令

```powershell
node --check .\command-center\app.js
Invoke-RestMethod http://127.0.0.1:5174/api/health
Invoke-RestMethod http://127.0.0.1:5174/api/dashboard | Select-Object -ExpandProperty errors
```