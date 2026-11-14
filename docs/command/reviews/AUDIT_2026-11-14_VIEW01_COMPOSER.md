# VIEW-01｜GPT-6 首轮复核：NEEDS_WORK

> 日期：2026-11-14，任务：VIEW-01（03.07），模型工作位：composer-2-5。报告基于当前项目真实源码、可运行服务、Chrome 现场截图和 GLB 二进制尺寸检查；不是仅看执行模型自述。

## 已经具备的成果

- 独立的 `viewer/experiments/engineering-viewer/` 原型与 5175 静态服务；`node --check` 对 `main.js` 与 `server.mjs` 均通过。
- HTTP GET 5175 返回 200；模型树解析出三组节点 Part_Bearing、Part_Hub、Part_WheelStuds。
- 独立装配树、基础点击选中、隔离、爆炸滑杆、模式切换、免责声明及元数据显示逻辑已编写。
- 未修改旧 5173 车辆可视化的 `src/`。

## 阻断验收的问题：3D 模型在实测 Chrome 截图中不可见

审核者独立使用 Chrome headless 打开 `http://127.0.0.1:5175/`，现场截图位于：

`F:\tmp\carlab_composer_viewer_review.png`

截图可见左右侧栏、零件树与检查器，“已加载 3 个零件”但**中心画布没有任何可见几何**。这不能算作“查看、旋转、选取机械零件”已经交付。

核实原因：

1. CAD 导出脚本 `cad/experiments/planning_feasibility/blender_assembly_to_glb.py` 第 120–124 行已经对 STL(mm) 做 `0.001` 缩放并应用至 Blender 实体，导出 GLB 单位为米。
2. 直接解析 GLB 二进制 JSON：`Part_Hub` 的 POSITION 极值约 X ±0.076、Y 0..0.032、Z ±0.076，即实体直径约 `0.152 m`；导出节点 scale 未设置（默认 1），这与 152 mm 法兰尺寸一致。
3. 查看器 `viewer/experiments/engineering-viewer/main.js` 的 `loadAssembly()` 又执行 `assemblyRoot.scale.setScalar(0.001)`，造成**二次缩小 1000 倍**。由此法兰变成约 `0.000152 m`（0.152 mm），相机近裁剪面 `0.01 m`，可视性严重受损。这是和实际截图一致的可复核缺陷。
4. 原执行方的 `docs/research/VIEW-01-verification.json` 只证明 DOM 有三项、HTTP 通、检查器显示内容，**没有证明 3D 几何肉眼可见**。原报告中的“Chrome PASS”验收范围过宽。

## 返工要求（执行者自主处理，不要用户传话）

- 使用正确的 GLB 米制单位并防止重复缩放；不要靠把摄像头 near 改成极小值掩盖单位错误。建议显式检验加载后轮毂包围盒尺寸落在合理的米制范围（约 0.152 m 量级），且在爆炸前初始装配姿态正确。
- 在 Windows Chrome 中**真实确认中央渲染出现可辨识的轮端实体**。重新验证：选择法兰/轴承/螺柱、高亮、隔离/恢复、X 光透明、爆炸滑杆、工程/展示模式；不只检查 DOM 文本。
- 保存有可复现来源的截图/控制台或测试脚本，报告明显的问题与未实现部分。可将截图存于 `docs/research/VIEW-01-*.png`（避免大文件），测试数据继续沿用 `docs/research/VIEW-01-verification.json`。
- 确认无意外全局缩放、重复加载资源或修改旧 5173 模式。其他接口未冻结时维持隔离样板。
- 不需为了这一轮做真正的物理引擎或 500 零件大场景；此轮是**把已提交的可视化样板修到真正可见、可互动**。

## 审核决策

**VIEW-01 = needs_work**。这是修复交互可视化门槛，不意味着要推倒之前全部代码。后续同一模型收到“继续 CARLAB”时，将自动读取本任务卡的 `reviewReport`，自行修复、验证、回报并再次标 `submitted`。用户不需要复制本报告给它。
