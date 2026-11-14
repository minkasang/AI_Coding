# CARLAB｜小车工程工坊统一工作台 UI 整合记录

> 2026-11-14；执行人 GPT-6；项目内网页整合任务，独立于 Composer 已提交的 VIEW-01 研究验收；以浏览器现场可见页面为依据。

## 目的

用户不希望「原四种演示」和「机械总成查看器」分散成两个视觉不一致的站点。统一入口必须保持明亮、克制、易读，而且不能假装用户已经拥有真实整车 CAD 和工程物理。

## 新的产品结构

| 5173 首页栏目 | 实际能力 | 真实度边界 |
|---|---|---|
| 整车实验 | 旧 Three.js + Cannon-es 行驶/弹簧/传动演示 | 物理和硬点仍是演示模型，不可作为整车动力学验收 |
| 轮胎与轮辋 | 原四种轮胎规格、轮辋材质、旋转与细节 | 参数化视觉示例 |
| 悬架机构 | 原弹簧行程与避震观察 | 并非真实双叉臂机构求解 |
| 机械传动 | 原齿轮、差速与转轴运动展示 | 演示传动机构，不代表真实车型齿轮箱 |
| 零件装配 | 将 VIEW-01 轮端 CAD→GLB 查看器嵌入同一 5173 页面 | 目前只有法兰、轴承包络、螺柱三类真实可选节点；**没有**全车物理运动副 |

原汽车演示由 `src/main.js` 保持原逻辑；统一 UI 选择器在 `src/workbench-ui.js`，新第 5 视图通过项目同源 `/viewer/experiments/engineering-viewer/index.html?embedded=1` 展示。原 `npm run viewer:engineering` 的 5175 端口依然可单独测试，但**不是给用户的正式入口**。

在「零件装配」激活期间，旧 3D 物理/渲染循环暂停，但不销毁状态；返回其他视图后继续，从而避免一页同时运行两个 WebGL 场景造成无意义的 GPU 开销。

## 设计语言

主导航：白底统一顶栏、清晰的五模式切换、细蓝色选中指示器。主页面保留中央大幅 3D 展台，在左上角给一句自然语言的工作说明，在右侧保留原控制区。去掉多层重阴影、强红色强调和灰黑色查看器，整体以浅冷灰、暖白、深蓝文字和克制金属反射为主。机械查看器的装配树、部件检查器与浮动工具栏使用同一风格。

查看器 GLB：Blender 导出时已 mm→m，前端不得二次缩放。新增的显示材质和灯光**只改善浏览器预览**，不是对真实材料反射率的科学认证。检查器将原始 extras 长 JSON 转成人类能理解的零件编号、材料标记、安装方式和真实性警告。

## CAD 资产与可移植性

优先读取 `cad/experiments/planning_feasibility/out/wheel_hub_assembly.glb` 和对应元数据：这样 Gemini 有新输出后，可观察当前生成件。若本地生成文件不存在，则回退到 `viewer/experiments/engineering-viewer/assets/` 下 212 KB 项目自生成样例和元数据，使新电脑/新 Git 克隆仍能预览装配查看器。

这份 GLB 是由本项目 build123d/Blender 参数化脚本生成的示例，并非第三方实车 CAD；仅代表目前三个零件节点和演示尺寸。真实可复用 PartSpec、坐标、关节、支撑真实车型的资产仍待总控 RP-07 等架构冻结及后续数据验证。

## 本轮真实验证

- `node --check src/main.js`、`src/workbench-ui.js`、`viewer/experiments/engineering-viewer/main.js`：全部退出码 0。
- 5173 首页、新工作台脚本、iframe 嵌入页面、资源清单、JS、212460 字节 GLB：HTTP 200。
- Windows Chrome headless + SwiftShader 1600×1000，`http://127.0.0.1:5173/`：原整车车架、四轮、控制区与新的清晰导航均可见；截图 `F:\tmp\carlab_unified_vehicle.png`。
- Chrome 1600×1000，`http://127.0.0.1:5173/?view=assembly`：统一顶栏选择「零件装配」、装配树、中央完整 3D 法兰组件、零件检查器均可见；截图 `F:\tmp\carlab_unified_assembly.png`。
- 独立嵌入页 Chrome 1440×940 截图 `F:\tmp\carlab_viewer_bright_test.png` 验证白底金属效果。
- 本轮未通过真实 GPU 的 FPS A/B、手工点击所有按钮、移动端像素回归与整车级 CAD 接口验证；不能从静态截图推断这些已完成。

## 后续

- 此后 AI 进行前端工作时，**先检查 5173 统一工作台**，不得再把独立 5175 查看器当成最终产品。
- Viewer 增量需求（剖切、尺寸测量、装配关系、真实动态约束等）可继续由 Composer 进行子工作，但需要与 DeepSeek 的 Frame/PartSpec、Grok 的机械运动、Gemini 的 CAD 资产接口对齐。
- 对复杂汽车模型的高保真效果，要先提高零件几何/法线/圆角/材料纹理和可靠来源，不能仅靠 CSS 或切 WebGPU 达成。
