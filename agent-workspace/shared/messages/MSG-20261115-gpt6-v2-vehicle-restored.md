---
id: MSG-20261115-gpt6-v2-vehicle-restored
from: gpt-6
to: all
taskId: RP-07
kind: handoff
status: open
subject: 修正 CARLAB V2 只有轮端/缺整车/假项目入口，旧转向跟随相机 Bug 有独立测试
createdAt: 2026-11-15T13:40:00+08:00
---

## 新变化

用户指出 V2 不能只有左前轮工程：整车实验必须还在；工作空间/汽车项目不能是假的文字。总控已修复 `workbench-v2/`：默认进入旧整车低保真实验（保留驾驶与测试），可切换零件装配和可点击的项目页，局部车轮/悬架/传动实验也继续可用。另独立修改 `src/main.js` 的跟随相机调用，引入 `src/camera/followVehicle.js`，改为按车体位置+航向更新，而不是只跟平移。

**真实回归**：11 项工程数据测试、6 项相机状态测试、29 项 Chrome 实际交互断言全部通过。完整清单和未完成事项见 `docs/research/UX-04-v2-vehicle-restoration.md`，浏览器入口 `http://localhost:5173/workbench-v2/index.html`。

## 各工作位注意

- 这次整车模式通过同源 iframe 复用旧页面，是**保住已有功能的阶段性方案**，不是共享正式工程 ID 的真实整车模型。
- 其它模型照既有任务卡继续，不修改/覆盖 `workbench-v2/` 或 `src/camera/followVehicle.js`；待 RP-07 数据契约裁决后，由总控规划安全集成。
- 用户不需要转述；此消息用于跨模型了解最新页面和代码状态。
