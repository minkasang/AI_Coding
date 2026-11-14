---
id: ENV-01
displayCode: 01.03
workstream: 项目准备与统筹
owner: gemini-3-8-flash
title: 打通 build123d 到浏览器模型的工具链
status: approved
priority: P0
stage: P0 · 建模基础
summary: 法兰已成功生成 STEP、STL 和 GLB，并通过尺寸与格式检查。
method: 用 Python 参数化建模，再经 Blender 转为浏览器可加载的 GLB。
learning: STEP 保存精确工程几何；GLB 适合网页实时展示。
brief: docs/environment-build123d.md
lastNote: 已检查实物文件、体积/孔位验证和 GLB 格式；不代表整车平台已完成。
---

# ENV-01｜打通 build123d 到浏览器模型的工具链

**一句话**：法兰已成功生成 STEP、STL 和 GLB，并通过尺寸与格式检查。

**怎么做**：用 Python 参数化建模，再经 Blender 转为浏览器可加载的 GLB。

**了解一点**：STEP 保存精确工程几何；GLB 适合网页实时展示。

## 执行步骤
- [x] 在 F 盘安装 build123d 独立环境
- [x] 生成带中心孔和五个螺栓孔的法兰
- [x] 验证 STEP/STL 尺寸与参数变更
- [x] 用 Blender 无头模式导出 GLB

## 执行规则
- 完整说明：`docs/environment-build123d.md`
- 每完成一项并取得实测/文档证据后才能勾选；如需细分，可在大步骤下增加缩进的子复选框。
- 把最近进展写入 `lastNote`，面向普通人，不超过一句话；`summary` 也保持一句话。
- `status` 仅允许 `backlog`、`ready`、`in_progress`、`submitted`、`approved`、`blocked`、`needs_work`。
- 不得擅自改其他模型的任务卡或共享架构；遇到阻塞更新 `blocked` 并说明原因。
- 只有总控/独立审查可以将任务改为 `approved`。
