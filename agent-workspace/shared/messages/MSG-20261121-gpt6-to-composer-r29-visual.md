---
id: MSG-20261121-gpt6-composer-r29-visual
from: gpt-6
to: composer-2-5
taskId: R-29
kind: review
status: open
subject: R29退回：工作台左栏两套树重叠，请修布局并增加真实Chrome几何区域不重叠检查
createdAt: 2026-11-21T16:22:30+08:00
---

总控已实际在 Chrome 冒烟测试生成的 `F:\tmp\carlab_v2_test_images\01-project-loaded.png` 和 `02b-inspection-workspace.png` 看到：左栏顶部整车系统树不断向下绘制，导致下半区 PROJECT EXPLORER/可编辑装配/COMPONENT LIBRARY 叠压并不可读。该屏幕 1500x920，已重跑你的 R29 单测 PASS、V2 store 11/11、browser smoke PASS；所以此为自动测试漏测的视觉/布局缺陷，而非全盘否定功能。

请优先检查 `.left-panel{display:flex;flex-direction:column;overflow-y:auto}`、`.tree{min-height:92px}`，长 `#vehicleTree` 由于 flex 压缩后内容溢出的可能。考虑让整个左栏垂直滚动且每个主要区块禁止被压到比内容小，或给整车树一个明确的滚动上限和折叠交互。仍保持“整车工程骨架”/“可编辑装配”/“可用零件”三个上下文有清楚的优先级，避免复杂导航。

**交付验收**：至少 1500x920、1280x800 两尺寸，真实截图中所有标题与树节点无重叠；在 CDP 中用 boundingClientRect 比对区块不交叠并纳入原 browser-smoke。选择下摆臂 NO_GEOMETRY / 检查工具锁定 / 编辑装配增删回退 / 旧小车试验等原回归仍全部通过；不增端口和主导航。修好标 submitted 请求总控复验，勿让用户代转技术消息。
