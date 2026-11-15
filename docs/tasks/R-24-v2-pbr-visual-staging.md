# R-24｜对 V2 的真实轮端材质做最小可控优化，而不是全套盲调（HY4）

> R-19 结果：恢复 GLB PBR 分层有严格单变量证据；8 参数组合虽然有深浅改进，但近白像素反增，因此不能一把合并。

目标：对当前 V2 轮端 GLB 做**小步可验证**的生产候选。先实现独立参数适配 `viewer/experiments/render-staging-v1/`，按配置可以在**同一 5173 模型**上做 A/B 预览和截图；不要修改正式 `workbench-v2/viewport.js` 直到总控完成审查、且不能覆盖 Composer 对 inspect 的未提交修改。

优先 M 单变量：保留 GLB 自带各零件 PBR metallic/roughness 差异。之后独立尝试地面高度（基于 GLB bounds，而非写死 -0.043）、环境填光和主光，严守一轮一个变量。必须有材料颜色一致性、选中高亮/剖切/拆解时不异常、亮度分布/接地阴影指标及截图，记录纹理/几何/GPU 成本，SwiftShader 不能当真实 RTX FPS。

交付：`docs/research/R-24-v2-visual-staging.md`、`viewer/experiments/render-staging-v1/` 的完整可重跑数据/脚本/对照图、用于总控选择的最小 patch 候选、个人报告 `R-24.md`。至少两种场景（单部件与拆解/高亮）、1 组负面处理，对参数给出 `VISUAL_ASSUMPTION`。不新开常驻端口或永久大导航。
