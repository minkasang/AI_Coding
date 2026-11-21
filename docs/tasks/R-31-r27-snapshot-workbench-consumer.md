# R-31｜将 R-27 唯一整车快照变成主工作台稳定的只读消费合同（DeepSeek）

**目标**：为 CARLAB 正式 5173 主工作台提供简单、可信、可回退的 `vehicleSnapshot` 数据消费适配器，支持 Composer R-29 使用整车系统树与稳定 `PI-*` 身份，不再让页面去拼多份不同模型的 JSON，也不在新端口开演示页面。

**输入**：已批准 R-27 的 `src-experiments/vehicle-snapshot-v1/fixtures/vehicle-snapshot.json` 和 `vehicle-snapshot.consumer.json`，Qwen R-21 的冲突列表，Grok R-23 位姿与当前 V2 `ProjectStore` 事实源。保留真实数据的 UNKNOWN/NO_GEOMETRY，不向任何没有几何的 PI 拷贝轮毂 GLB。

**交付行为**：
1. 整车树到浏览器对象树的只读 projection：13 系统、总成实例及 278 PI 的层级选择，可分页/懒加载，未映射项标显式状态；跨角色只用 `PI-*` 键，R-17 `INST-*` 为条件别名。
2. 针对编辑工作台保存、切换 `工程模型/展示检查`、从整车树选中零件的状态边界，定义 adapter 的 `selectVehiclePart(instanceId)` / `getObjectDetail` / `getDisplayStatus` 契约；如果 UI 展示只是 DEMO_SUBSTITUTE，必须单独标明。
3. R-27 `strictPoseRun` 仍 STALE，**默认禁止播放**；只有显式 DEMO 模式能读取 9 帧标记原修订的信息。勿自行修订为 CURRENT 或给真实受力值。
4. 消费器发现输入快照 hash/修订不符时 fail closed，失配 Frame、变型和不可映射 ID 时返回可解释错误，不显示假实体。
5. 与 Composer R-29、Qwen R-26、Grok R-28 通过共享消息对齐输入输出，主工作台 UI 具体文件由 Composer 负责，本任务**不得直接改 `workbench-v2/index.html/main.js/styles.css/viewport.js`**，只交付独立模块供其接入。

**范围**：`src-experiments/vehicle-consumer-v1/` 新目录、`docs/research/R-31-*.md`，本人报告与验证。必须有 Node 正常和负例测试、导入本项目真实 R-27 快照的检查命令，并在报告清楚标记哪些已可用、哪些要等 Composer R-29 真正集成后验收。不得新增常驻端口或首页一级入口。
