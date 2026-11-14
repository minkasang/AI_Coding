# R-05｜汽车 3D 外观质量与 Web 渲染技术研究

- 类型：RESEARCH，优先级 P0（非先行阻塞），适合 Flash/Gemini；不改 `src/`、`node_modules/`、依赖配置或场景。
- 允许产出：`docs/research/R-05-render-quality-report.md`、`docs/research/R-05-visual-qa-checklist.md`、`docs/tasks/reports/R-05-report.md`。
- 参考：项目现有 `src/main.js`、`src/parts/wheelRim.js`、`src/tire.js`、既有截图；`docs/research/RESEARCH_BASELINE.md`。

## 核心问题
1. 原轮毂为何像“玩具”：分别从造型/拓扑/倒角、材料参数、尺度/比例、灯光、环境反射、阴影/接触关系、构图说明，不得泛称 WebGL 质量低。
2. 为机械零件制定可操作的高质量视觉标准：锻造/铸铝、钢制刹车盘、橡胶、塑料、镀铬、油液等材料应如何形成差异？哪些细节需真实几何，哪些用 normal/roughness 贴图即可？
3. 讨论 Three.js WebGLRenderer、WebGPURenderer/TSL、Blender 离线渲染的表现边界与成本；不能声称 WebGPU 自动等于更好画质。
4. 提议**同一轮毂/法兰**的 A/B 验证矩阵：先不变几何改摄影棚光照，再不变光照改几何，再比较材质；需要固定相机、同分辨率、记录 FPS。
5. 定义 GLB 性能预算的测量方案：三角数量、对象数、draw calls、加载时间、显存/纹理内存、LOD；不预设拍脑袋的硬指标。
6. 收集允许商业/个人使用的 HDRI、PBR 贴图或参考图来源，记录许可证与素材 URL，不自行复制未知版权模型。

## 交付
- 原场景质量问题审计表，要求每条问题关联对应代码/可观察表现/推荐改进顺序。
- 15 项视觉验收清单（包括不同视角、局部放大、刹车盘与卡钳间隙、内侧细节、金属反射、轮胎色彩）。
- WebGL 与 WebGPU 选择建议，写明本项目为何先保留既有 WebGL 以及升级触发条件。
- 两个不同性能档位的渲染/网格简化方案，但要明确是建议待测试，不是假装已实测。

## 验收
可以据此派发可复现的渲染优化任务；不能只给一堆精美参考图片而没有如何提高项目的流程。

## 参考
- Three.js 官方模型导入：https://threejs.org/manual/pages/loading-3d-models.html
- Three.js WebGPU 迁移：https://threejs.org/manual/pages/webgpurenderer.html
- glTF 2.0 标准：https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html

## 提交
`R-05 SUBMITTED；问题优先级；A/B 方案；视觉 QA 清单；尚缺依据`。
