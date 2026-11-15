# R-20｜把测距/剖切接成统一工程工作台的上下文操作（Composer 2.5）

> 工作位：composer-2-5，P1；R-15 在旧内部查看器完成并已通过 Chrome 交互验收。**现在用户只有 5173 工作台、5174 AI 指挥中心两入口，不能再创造第三个页面和端口。**

## 目标
将已实现 R-15 的**两点测距、局部剖切、装配关系说明**设计为**同一个 V2 工程模型的“展示与检查”操作**：共享 `ProjectStore` 的 `instanceId/selectedId` 与 `workbench-v2/viewport.js` 场景，不再另维护一个轮毂专用查看器、独立零件树、第二个装配真值。

## 工作方式
- 首先研究 `workbench-v2/README.md`、`docs/command/CARLAB_RUNTIME.md` 和 `workbench-v2/project-store.mjs`，说明一条真实的“左侧选中某实例→3D 高亮→右侧属性→量测/剖切→切回编辑且状态不丢”的数据路径。
- 新实现先放 `workbench-v2/experiments/inspection-bridge/` 作为**可测试的 ES 模块与 adapter**；不直接覆盖已有 `workbench-v2/index.html/main.js/viewport.js/styles.css`，共享页面的最小接入点形成明确 patch 交总控审核后合并。
- 真实可见功能只保留必要工具：选中、聚焦、透明/隔离、两点测距、剖切。编辑按钮如“新增/删除/导出”不应该出现在检查状态；不加轮胎/悬架/传动一级菜单，不加空占位开关。
- 测距显式显示 mm 与 m、指出是场景三角几何非 CMM；轴向剖切与爆炸注明纯视觉操作。坐标和单位以当前 GLB 米制为输入，**不二次缩放 0.001**。
- 原 R-15 独立代码保留用于回归；可以抽取算法但不能在两个查看器间复制一整套状态而称为集成。已有旧汽车演示和物理功能不许破坏。

## 验收与交付
- `docs/research/R-20-unified-inspection-integration.md`：业务位置、状态图、与 V2 的确切扩展点、剩余冲突和截图。
- `workbench-v2/experiments/inspection-bridge/`：可运行 ES 模块、Node 校验、Chrome 真实点击或可运行交互 fixture（不能只测 DOM 存在）。
- `agent-workspace/agents/composer-2-5/reports/R-20.md`：清楚说明哪里真实完成、哪里待 GPT-6 合并；主任务标 `submitted`，**未经同源 5173 Chrome 复验不能自称已进入正式工作台**。
- 需要其它模型的 PartSpec/Joint 字段时走公共消息，不要求用户传话。
