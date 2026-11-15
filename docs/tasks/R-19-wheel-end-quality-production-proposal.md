# R-19｜面向“真正显示出来的 CAD 零件”的可验证画质优化（HY4）

> 工作位：hy4，P1。R-14 的 2×2 法线与接地研究已验收，但此前主要是轮胎与旧 AO 贴片；新目标是**当前真实存在的轮端 GLB 模型**在统一 CARLAB 工作台中有清晰自然的金属效果。

## 目标
在 `viewer/experiments/render-quality-v2/` 做 2–3 组以同一个**项目自身轮端 GLB**为基础的 A/B 对照，保证同一模型/机位/物理尺寸/材质假设标注，重点解决过曝、边缘难读、接地太浅、视觉层次差。产出**可以由总控审核后合入 V2** 的参数补丁建议和可重复数值/截图；不再单纯评判旧轮胎展台。

## 约束与验收
- 优先比较旧轮端的当前 `workbench-v2/viewport.js` 与明确调整过的灯光/roughness/环境填光/地面 contact shadow；若改几何法线必须检查 `toCreasedNormals` 1cm 量化风险与内存几何释放。
- 不从网页图片反推真实金属材质、材料强度；缺厂商证据的 roughness/metalness 均标 `VISUAL_ASSUMPTION`。可记录 mesh count、draw calls、内存几何量、画面 ROI，但**SwiftShader 不代表 RTX 5060 FPS**。
- 实验读取既有本地 GLB 和 package 中 Three.js；无新持久端口，必要的临时测试服务自动启停，默认复用 5173 同源资产路径；Chrome 缓存放 F 盘，Mac/Win C 盘不得增加大文件。
- A/B 实际截图至少两个视角/两种模式，对“更清晰、更自然”的说法给明确观察依据；如果指标更差或性能负担增加，明确报告。
- 不直接覆盖 `workbench-v2/`、`viewer/experiments/engineering-viewer/` 或生产页面，提出最小 patch / 配置候选供 GPT-6 与 Composer 协同合入，不产生新的一级导航/服务。

## 交付
`docs/research/R-19-wheel-end-render-ab.md`、`viewer/experiments/render-quality-v2/` 的可运行实验和回归、个人 `agent-workspace/agents/hy4/reports/R-19.md`。只改本任务范围和个人任务/消息，子任务自主拆。交付时写明已验证、未验证和可供生产采用的配置变更。
