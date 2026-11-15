# CARLAB Workbench V2 · 独立可运行的工程工作台纵切样板

> 状态：ISOLATED WORKING PROTOTYPE（不是已发布生产程序或完整车辆求解器）。日期：2026-11-15，执行者 GPT-6。
>
> 设计依据：用户确认 CARLAB 应能从零创建车辆工程、添加零件、管理装配、可验证运动、未来跑不同环境；完整蓝图见 `docs/planning/VEHICLE_BLUEPRINT_V1.md`。

## 打开方式

在项目根目录原服务已经运行时：

**http://localhost:5173/workbench-v2/index.html**

若未运行，项目根目录执行 `npm start`（或 `E:\ARUANJIAN\node\node.exe server.mjs`）。旧版汽车入口依然是 `http://localhost:5173/index.html`，指挥中心是 `http://localhost:5174`。不要用 `/workbench-v2/`：当前原生静态服务器没有子目录默认首页路由，必须使用 `index.html`。

不需要安装新依赖，不使用 C 盘的新环境。页面通过原项目 importmap 使用已经存在的 Three.js 和 glTF 加载器，直接引用本项目自生成的轮端示例 GLB（212,460 bytes），不调用外部模型下载服务。

## 已经实现的可验收行为

- **一套工程状态**：`project-store.mjs` 存储工程、装配树、PartKey、独立 instanceId、显示状态和版本号。Three.js 和 DOM 均是工程数据的消费者，不再由 UI 按钮随意改独立网格当作事实源。
- **统一 3D 视窗**：`viewport.js` 使用 Three.js 场景和真实生成的 GLB，读取 Part_Hub / Part_Bearing / Part_WheelStuds 节点，保留米制，未经验证不得按 0.001 二次缩放。
- **零件选中闭环**：3D 鼠标点击或左侧树选零件，右侧同步显示实例 ID、零件资料、几何尺寸、示意装配关系和“缺失物理证据”警告。单个零件可聚焦、隐藏、隔离、移除，模型可拆解显示（仅视觉偏移）。
- **从空白创建**：新建空白工程后，可从现有小型零件库添加零件，新建 ID 不与原始 Mesh 名称绑定；可复制成多个工程实例。不是任意新 CAD 制作功能。
- **工程操作**：撤销/重做，浏览器本地保存，工程 JSON 导出与重新导入。导入使用当前已知 PartKey 的白名单和装配关系校验，不尝试执行不可信 JSON 或加载外部文件作为任意脚本。
- **真实能力边界**：仿真按钮明确禁用，不宣称有机构求解、真正的装配约束、材料/质量可信度、碰撞干涉或道路场景。演示资料全部标 `DEMO_ASSUMPTION`。

## 实际测试

```powershell
Set-Location F:\project\cyq\AI_Coding\car
& E:\ARUANJIAN\node\node.exe --test workbench-v2\tests\project-store.test.mjs
& E:\ARUANJIAN\node\node.exe workbench-v2\tests\browser-smoke.mjs
```

- 11/11 数据/状态单元测试通过：版本/单位、唯一实例、空白创建、撤销恢复、隐显/隔离、关系完整性、重复/未知 ID 拒绝、序列化等。
- 19/19 Chrome 真实交互检查通过（在 Windows Chrome + SwiftShader 的独立浏览器 profile 上，使用 CDP）：GLB 显示、真实 3D 点击选中、左树选中、添加、撤销、重做、隐藏/全部显示、爆炸、新建空白、第一零件、保存、文件导入恢复及浏览器 JS 异常计数 0。
- 实际截图：`preview.png`（完整界面）、`F:\tmp\carlab_v2_test_images\01..05-*.png`（浏览器真实状态）。
- 测试不代表已通过真实 GPU 性能、长时间稳定性、移动端、任意 CAD 文件导入、跨车型装配或车规机械仿真。

## 代码边界

```text
workbench-v2/
  index.html                   统一工作台（独立入口）
  styles.css                   亮色工程 UI
  main.js                      用例及 DOM 适配
  project-store.mjs            无 DOM/Three 依赖，纯项目状态与数据校验
  viewport.js                  Three.js 模型渲染、选择、场景状态适配
  fixtures/wheel-end-demo.json demo-only 数据/原项目已生成资产引用
  tests/project-store.test.mjs node:test
  tests/browser-smoke.mjs      Chrome CDP 真实交互
  preview.png                  实际 Chrome 截图
```

这个纵切样板刻意**不修改**原 5173 的 `src/main.js`、旧 `viewer/` 或其它模型正在写入的 CAD 与研究文件。未来应将兼容性协议与完整工程 ID 从 RP-07 裁决引入，而不能将这份 `carlab.project-demo/0.1` 草案直接当成全项目正式 Schema。

## 后续该如何扩展（不是本轮已实现）

1. **工程合同统一**：与 Qwen4 BOM / DeepSeek PartDefinition/PartInstance / Gemini 资产 Manifest / Grok Joint/Constraint 对齐，通过 RFC 和变型负例后再统一生产 Schema。
2. **装配关系**：支持安装 Frame、关节/约束编辑器、零件级独立资产而不是把 5 颗螺柱用一个 Mesh 节点表示；导入真实校验的轮端和转向机构。
3. **运动/干涉**：接入运动学求解输出与间隙检测，保证动画不是拉伸网格、碰撞不是凭视觉判断；用可重复测试验证。
4. **相机与路面**：将旧版行驶模式的车辆航向跟随摄像机修复作为专门可测的任务，未来在同一 ProjectStore 引入 SceneDefinition / TestCase / SimulationRun。旧 Cannon-es RaycastVehicle 继续作为低保真对照。
5. **版本、工作流与性能**：真正的编辑命令、导入校验、资产版本、原理图、检测结果版本失效与 GPU 基准；远景再扩展真实路面、越野、城市场景。

本 README 避免模糊“完成度百分比”：只有测试实际覆盖的行为标完成，其余保持未实现。

## 2026-11-15 补齐整车与项目入口（UX-04）

用户指出 V2 只有左前轮，不应丢失整车实验和可用导航。现已将入口补齐：**默认页面展示原有可驾驶四轮小车（低保真物理演示）**，顶部可切换到 **零件装配**，另可点击 **工作空间 / 汽车项目** 进入真实可操作的项目卡片。进入整车后，局部子导航可以打开原有轮胎、悬架和机械传动实验；重复旧导航被隐藏。

- 默认整车：`http://localhost:5173/workbench-v2/index.html`
- 零件工程：`http://localhost:5173/workbench-v2/index.html?view=assembly`
- 工程入口：`http://localhost:5173/workbench-v2/index.html?view=projects`

**这不是完成了真实整车 CAD 装配。** 旧四轮车是简化 Cannon-es 行驶演示；编辑轮端的 3 类 CAD 示例是另一个工程模型，两者尚未按统一部件/关节/坐标契约合并。本阶段仅恢复、整理已有功能并纠正假入口。当前浏览器项目列表不支持多工程云同步。

此外，原 `src/main.js` 中“跟随摄像机只跟平移不跟航向”的问题已通过独立 `src/camera/followVehicle.js` 修复；`tests/camera-follow.test.mjs` 有 6 项状态/数学测试通过，真实车辆长时间性能未验收。V2 工程数据单测 11/11、Chrome 真实交互断言 29/29 通过。详细证据见 `docs/research/UX-04-v2-vehicle-restoration.md`。截图：`preview.png` 整车、`assembly-preview.png` 装配、`projects-preview.png` 项目页。
