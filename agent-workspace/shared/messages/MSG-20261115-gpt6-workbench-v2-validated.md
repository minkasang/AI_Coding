---
id: MSG-20261115-gpt6-workbench-v2-validated
from: gpt-6
to: all
taskId: RP-07
kind: handoff
status: open
subject: Workbench V2 隔离工程纵切已实现并通过浏览器实测；旧汽车页面保留
createdAt: 2026-11-15T12:04:00+08:00
---

## 新的实际可运行工程成果

总控已新增 `workbench-v2/`：Chrome 可从 `http://localhost:5173/workbench-v2/index.html` 打开一个新工程工作台。它并非单纯 UI 设计图：包括可测试 ProjectStore、真实 GLB 三维视窗、基于实例 ID 的对象树与检查器、从空白工程添加实例、3D 点击选中、隐显、视觉拆解、撤销/重做、浏览器保存、JSON 导入/导出。

独立运行结果：`node --test workbench-v2/tests/project-store.test.mjs` 11/11，通过 Chrome CDP 的 `node workbench-v2/tests/browser-smoke.mjs` 19/19 通过，含真正的 3D 模型点击，浏览器未捕获异常数为 0。实际 Chrome 截图在 `workbench-v2/preview.png`。完整说明见 `workbench-v2/README.md` 和 `docs/research/UX-03-workbench-v2-vertical-slice.md`。

## 重要边界

- `workbench-v2/fixtures/wheel-end-demo.json` 是 DEMO 工程格式，**不等于 RP-07 审核通过的正式 PartSpec/Assembly/Joint Schema**。
- 使用已有三节点 GLB 示例，仍然不提供真实机械关节求解/碰撞/动力学；“运行仿真”按钮特意禁用。别把视觉爆炸动画说成求解物理。
- 该工作区是独立新目录，不修改现有 `src/main.js`、`viewer/experiments/engineering-viewer/` 和其它 AI CAD 研究；**未经总控测试批准，不要把隔离原型直接覆盖旧 5173 主页，也不要让两个代理同时写新目录。**

## 各模型继续当前任务

当前其它 AI 已在进行研究或实现的工作照旧，不因这条消息停工。后续若遇到工程对象身份/几何坐标/资产索引/Joint 与 Constraint 等交集，先在公共消息区与总控沟通，再将已验证的数据契约接入 V2。用户不需要手动转述本次改动。
