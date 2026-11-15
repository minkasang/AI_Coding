# CARLAB｜车辆工程工作台

**唯一用户入口：<http://localhost:5173/>**。独立的 AI 任务指挥中心：<http://localhost:5174/#dispatch>。项目目前采用两项常驻网页服务，不需要单独运行 5175。

## 工作台业务结构

| 业务区 | 用户做什么 | 已实现的原型 | 尚缺的真实工程能力 |
|---|---|---|---|
| **工程模型** | 选择装配与零件、添加实例、撤销、保存与导入工程 | 单一 ProjectStore、3 类轮端示例 CAD、编辑与 JSON 出入 | 全车零件库、真实安装基准、机械连接、变型规则落地 |
| **展示与检查** | 查看同一套工程模型、点选高亮、聚焦、隐藏、隔离、爆炸 | 与工程模型共用实例 ID、GLB 与视窗，不重复建独立查看器 | 真实车辆系统高亮、运动干涉、剖切测量结果的工程验证 |
| **试验仿真** | 驾驶、路面、冲击与各类试验工况 | 原有简化 Cannon-es 四轮车，可驾驶；高级参数按需展开 | 将其与真实整车装配绑定的多体动力学、复杂接触、越野/城市工况 |
| **工程项目**（非一级导航） | 进入本地示例、历史物理演示，或创建空白工程 | 左上角工作空间/汽车项目面包屑可以打开；有真实可点的资源卡 | 多工程数据库、跨设备同步与工程版本管理 |

**轮胎、悬架、转向和传动不再作为业务导航。** 它们应该属于同一车辆工程对象树。当前旧轮胎/悬架/传动是独立的历史演示代码，只能从「试验仿真 → 当前试验」选择，不应冒充当前轮端 CAD 装配的真实机械机构。

## 用户只需知道的地址

- `http://localhost:5173/`：工作台（根首页自动导航到本目录 `index.html`）
- `http://localhost:5174/#dispatch`：AI 指挥中心

旧 `legacy.html`、`src/`、`viewer/experiments/engineering-viewer/` 继续保留供工程测试使用，但不单独开第三个长期网页服务。

## 代码职责

```text
workbench-v2/
  index.html               三个业务入口与工程资源页
  shell-router.js          上下文路由、同一工程视图、低保真试验与参数显隐
  main.js                  具体工程命令/项目菜单及事件连接
  project-store.mjs        工程事实源（独立 instanceId、撤销、校验与序列化）
  viewport.js              同一 GLB 3D 视窗的渲染和对象选择
  fixtures/                现有轮端演示工程（不能当成已认证实车）
  tests/                   Chrome CDP 真实浏览器操作 + Node 工程状态测试
```

旧简化驾驶演示作为 `/legacy.html` 内嵌在工作台「试验仿真」区，复用原 `src/main.js` 和 `src/physics/vehicleWorld.js`。**这是过渡复用，不代表同一真实整车工程模型已经形成。** 下一阶段必须以 RP-07 对 PartInstance、Frame、Joint/Constraint、SimulationRun 的正式接口审查为准，而不是继续嵌套网页或给零件单独造入口。

## 复验（在 Windows F 盘项目根目录）

```powershell
& E:\ARUANJIAN\node\node.exe --test workbench-v2\tests\project-store.test.mjs
& E:\ARUANJIAN\node\node.exe --test tests\camera-follow.test.mjs
& E:\ARUANJIAN\node\node.exe workbench-v2\tests\browser-smoke.mjs
```

单测覆盖工程状态 11 项、相机 6 项。CDP 浏览器冒烟覆盖根首页、三类业务、3D 点击/选择、导入/导出、撤销、项目入口、旧车实际加载、试验样例、参数面板显隐与无 JS 异常。

实时 Chrome 截图：`preview.png`（试验默认页面）、`assembly-preview.png`（工程编辑）、`inspection-preview.png`（展示检查）、`projects-preview.png`（工程资源）。

## 验证边界

当前**还没有**真实可拆的整车 CAD、全车结构间干涉校验、经证据校准的多体物理求解器、跨系统状态映射或真实越野/城市物理。前端只有轮端 3 类 CAD DEMO 与原有简化驾驶场景，不可以仅凭统一页面、测试通过或外观效果声称已经做出一辆工程级车辆。

网站治理与后续 AI 开发约定见 `docs/command/CARLAB_RUNTIME.md`；历史 UX-03 / UX-04 研究、报告和旧代码均保留可追溯。
