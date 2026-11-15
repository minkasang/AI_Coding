# R-30｜受控接入 PBR M 单变量，并完成真实工作台回归（HY4）

R-24 A/B 的结论是 `M`（保留 GLB 自带 roughness/metalness 差异）贡献多数对比度收益；G/H/S 和 all 全参数方案不能一把合。接下来要有**工作台真实效果**，但不能和 Composer R-29 的 UI 改动互相覆盖。

1. 先使用 `viewer/experiments/render-staging-v1/patch-candidate.json` 形成 `M` 单变量的受控 feature flag adapter，**默认仍保留旧设置、可一键回退**；禁止整包调曝光、灯光、地面高度，GLB 单位 m、Y-up 保持。
2. 和 Composer R-29 沟通文件锁：他负责工作台 UI，你只在隔离配置模块工作；如需改 `workbench-v2/viewport.js`，通过公共消息提交精确 patch 候选给总控/Composer，未确认不能同时写同一文件。
3. 以真实 V2 `EngineeringViewport` 复验 3 种状态：未选中、选中+爆炸、选中+剖切；两机位 A/B、截图对照；证明没有破坏轮端测距、属性与 PBR 切换。禁止将 SwiftShader 帧率称作 RTX GPU FPS。
4. 样板材质仍 `VISUAL_ASSUMPTION`；无厂商真实金属/纹理来源时不能声称已完成 OEM 实车质感认证。
5. 必须跑 V2 store、浏览器 smoke 和可重复的单变量指标检查；标明合入/未合入及回退方式。

**范围**：`viewer/experiments/render-release-v1/`、`docs/research/R-30-*.md`、个人报告；不能新增 5175 等长期 HTTP 端口，也不要放新顶层菜单。
