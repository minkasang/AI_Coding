# R-05 SUBMITTED｜汽车 3D 外观质量与 Web 渲染技术研究

- 任务：`R-05` / 03.05 · 执行者：HY4 · 状态：`submitted`（待总控 GPT-6 审核，未自行 `approved`）
- 取证快照：`2026-11-14 22:32:37 +0800` · 任务书：`docs/tasks/R-05-render-quality.md`
- 边界：全程只读源码，**未修改** `src/`、`node_modules/`、依赖配置与场景；只写允许的三份文档 + 本人任务卡/回报。

## 一、问题优先级（12 条审计项，详见主报告 §3）

| 顺序 | 问题 | 关键证据 |
|---|---|---|
| **P0-0** | 无可观测性：`src/main.js` 无 `renderer.info` / FPS / draw-call 输出；`applyLightValue`（`:748-751`）把曝光与环境强度耦合在同一滑块，导致 A/B 无法单变量隔离 | `grep` 零命中 |
| **P0-1** | 接地关系失真：假 AO 渐变贴片只用于展台（`:144-149, 173-175`），整车模式没有；主阴影为单方向光 2048² / ±9 m（约 8.8 mm/texel）且被 `HemisphereLight 0.58` + IBL 填平 | 两帧基线可见"悬浮" |
| **P0-2** | 反射内容为空：`PMREM(RoomEnvironment)` 是程序化白盒，`envMapIntensity` 被推到 1.3–2.1 补亮 → "亮但空"的镀铬塑料感 | `main.js:54-55`、`tire.js:349-365` |
| **P0-3** | 几何硬边：`TriSoup` 非索引三角汤 + `computeVertexNormals()` 得面法线；安装盘倒角仅 0.002 m / 2 段，在 0.68 m 外径轮毂上屏幕占比约 1–2 px | `wheelRim.js:6-18, 104-111` |
| **P1-4** | 材质无空间变化：全库 `normalMap/roughnessMap/aoMap` 零命中；`rimLight` 为 `metalness 1 / roughness 0.14 / envMapIntensity 2.1` 的过镜面亮边 | `tire.js:327-377` |
| **P1-5** | 构图与配色：纯色背景/地面相近、`Fog(18,52)` 在常用距离不生效、主体占比小、UI 遮挡、橙红点缀呈玩具配色 | `main.js:50-51,58,101-111` |
| **P2-6** | 小件逐件建 mesh：单胎 57–84 mesh / 25 唯一几何，四胎展台约 20 万三角、draw-call 静态下界 279 | 几何探针 |
| **P2-7** | 无后处理（SSAO/GTAO/contact shadow 均缺）；字标与中心盖贴图放大后分辨率不足 | `main.js`、1024²/512²/256² CanvasTexture |

**核心判断**：现有配置已含 ACES / sRGB / PMREM / RectAreaLight / PCFSoftShadow / MeshPhysicalMaterial，**问题不在"WebGL 质量低"**，而在资产内容（倒角、贴图、反射源）、接触关系、构图与可观测性。

## 二、A/B 方案（主报告 §5.2）

- 固定基线：`#mode=tire&tire=0`、1600×1000、关闭「轮辋自转」，记录相机/曝光/环境/各灯/DPR/GPU/后端。
- **A 只改摄影棚光照**（几何材质冻结）→ **B 只改几何**（倒角、圆角、分段）→ **C 只改材质与环境**（HDRI、roughness/normal 贴图）。
- 每格出 PNG + 参数快照 + FPS + 15 项清单打分；判定须至少两项可观察 `FAIL→PASS` 且无新增 `FAIL`，不接受"我觉得更好看"。
- 性能预算只给**测量方案**与静态基线：三角 44,944–55,844/胎、对象 57–84/胎、draw-call 静态下界 63–90（四胎 279）、4 张贴图（1024²/512²/256²/256²）；FPS / 显存 / LOD 均标 `PLAN_ONLY`，**本轮未实测**。
- 两个性能档位（高画质 / 轻量）为**建议待测试**，不是已验收配置。

## 三、视觉 QA 清单

`docs/research/R-05-visual-qa-checklist.md` — 15 项，每项含镜头条件、可证伪的通过标准、失败示例、关联代码行、优先级与证据类型；覆盖不同视角、局部放大、刹车盘与卡钳间隙（V07）、内侧细节（V08）、金属反射（V09/V10）、轮胎色彩（V11/V12），另含 A/B 可比性元检查（V14）与性能可观测性（V15）。

## 四、尚缺依据 / 未解决

1. **真实 GPU 的 FPS、draw call（含阴影 pass）、显存/纹理内存、LOD 曲线全部未实测**：本环境为 Chrome headless + SwiftShader 软件渲染，其数值无代表性，故未给任何 FPS 数字。
2. 两帧截图（整车 358,810 B / 特写 380,230 B）保存在项目外 `F:\tmp\`，只用于构图与缺陷定位；**未作为最终画质结论**，也未写入项目资产目录。
3. 倒角与 HDRI 的实际观感收益、能量平衡是否需重新标定、WebGPU 在目标浏览器的可用率、Blender 参考图与实时画面偏差，均为 `OPEN`。
4. **素材与架构决策交总控**：是否允许引入 CC0 HDRI/PBR（项目目前 `LICENSE` / `ASSET_PROVENANCE.md` / `assets/` 全 MISSING）、何时评估 WebGPU 迁移（建议四条触发条件全满足才立项）。本轮未下载、未复制任何外部素材。
5. three.js WebGPU manual 页本轮 `WebFetch` 只取回导航框架，未取回正文；关于后端能力的核心结论改以本地 `node_modules/three@0.170.0/src/renderers/webgpu/WebGPURenderer.js:21-46` 源码为准（`forceWebGL` + WebGL2 自动回退 + `StandardNodeLibrary`），未做超出源码的断言。

## 五、交付文件与验证

| 文件 | 内容 |
|---|---|
| `docs/research/R-05-render-quality-report.md` | 主报告 v1.0：11 节，含配置盘点、12 条审计表、7 类材料标准、A/B 矩阵、性能测量方案、后端边界、许可治理、事实/推导/未知分级、验证记录 |
| `docs/research/R-05-visual-qa-checklist.md` | 15 项视觉验收清单 + 记录表模板 + 任务书要求对应表 |
| `docs/tasks/reports/R-05-report.md` | 本提交回报 |
| `agent-workspace/agents/hy4/reports/R-05.md` | 个人回报 |
| `agent-workspace/agents/hy4/tasks/R-05.md` + `R-05-S01..S05.md` | 父任务卡 `submitted` 与 5 张 `parentId: R-05` 子任务卡 |
| `F:\tmp\r05_geometry_probe.mjs`、`r05_current_5173.png`、`r05_tire_5173.png` | 项目外临时探针与基线截图，**不属项目交付物** |

验证：`node F:\tmp\r05_geometry_probe.mjs` 输出与报告数字逐项一致；几何探针 draw-call 口径修正一次（初版 229–334 虚高 → 修正 63–90）并在报告 §5.3 显式记录；`curl` 5173 = 200；许可经 `WebFetch` 原文核实并附 URL/日期；三份文档均在任务书 `allowedPaths` 内；`git status` 确认 `src/` 未被本任务改动。

---

*R-05 SUBMITTED；问题优先级；A/B 方案；视觉 QA 清单；尚缺依据 —— 以上五项已齐备，等待总控审核。*
