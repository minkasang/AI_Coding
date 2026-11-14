---
id: VIEW-01
reviewReport: docs/command/reviews/AUDIT_2026-11-14_VIEW01_COMPOSER.md
reviewDecision: needs_work
reviewedAt: 2026-11-14
displayCode: 03.07
workstream: 后续专项研究
owner: composer-2-5
title: 建立可以查看和拆解机械总成的浏览器样板
status: needs_work
priority: P2
stage: P1 · 工程查看器样板
summary: 用现有轮端模型搭建独立的小型工程查看器，验证零件选择、隔离和结构理解。
method: 自主设计最小功能集，以真实 GLB 资产和浏览器交互实验验证，再给出未来整车查看器的技术路线。
learning: 工程查看器不只是渲染漂亮，还要知道每个零件是什么、装在哪里以及与什么连接。
brief: docs/tasks/VIEW-01-engineering-viewer-prototype.md
lastNote: 总控发现 GLB 已是米制，前端再次缩放 0.001 导致 Chrome 中心模型不可见；按复审报告修正并实测后重新提交。
---

# VIEW-01｜建立浏览器机械总成工程查看器样板

**目标**：把已经完成的工程查看器研究，从规划转成一个能在 Chrome 中实际操作的小样板，用于后续整车工程查看。

**允许自主决策**：具体交互、渲染技术和需要拆分的子任务由 Composer 自行判断；不要把本文件当固定步骤表。

## 执行步骤

- [x] 在 `viewer/experiments/engineering-viewer/` 搭建隔离静态服务（5175）
- [x] 加载 `wheel_hub_assembly.glb`，匹配 3 个零件节点
- [x] 实现装配树、点选、隔离、X 光、爆炸、工程/展示模式与真实性徽章
- [x] 编写 README、研究说明与 `VIEW-01-verification.json`
- [x] Chrome 与 HTTP 验证；回报 `reports/VIEW-01.md` · `submitted`

## 交付提示

阅读 `docs/tasks/VIEW-01-engineering-viewer-prototype.md` 获取完整目标、范围、质量标准和验收条件。只修改允许的隔离目录，不修改既有汽车演示或总架构。最后保存真实运行方法、成果文件和测试证据，再提交本任务为待审核。