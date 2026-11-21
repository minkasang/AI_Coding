# R-04｜悬架运动学与车辆动力学可信度研究

- 类型：RESEARCH；优先级 P0；可写 `docs/research/R-04-suspension-physics-report.md`、`docs/research/R-04-kinematics-fixture.json`、`docs/tasks/reports/R-04-report.md`。
- 只读旧代码：`src/parts/chassis.js`、`src/parts/coilSpring.js`、`src/physics/vehicleWorld.js`、`src/specs.js`。
- 禁止：修改 `src/`、替换 cannon-es、编造某量产车精确硬点；不要研究一大堆纯理论却没有可落地结构。

> 接续 Grok 已验收的 RP-03 物理分级成果。自己规划硬点与运动学验证方案，不能将动画或游戏级车辆行为宣称为工程真实。

## 必须回答
1. 双叉臂悬架的硬点和自由度是什么？从车身枢轴、上下球铰、转向节、拉杆、避震器到车轮主轴，哪些长度/方向约束必须同时满足？
2. 麦弗逊/多连杆与双叉臂的拓扑不同在哪里？哪些 PartSpec 能共享，哪些 Joint/Assembly 拓扑必须变化？
3. 轮距变化后，转向拉杆、摆臂、半轴、外倾/前束、主销几何不能仅拉伸：给出影响表与至少 6 个失败条件。
4. 列出纯动画、运动学求解、刚体动力学、轮胎力模型、工程 MBD 的能力/缺陷；明确哪些项目目前只有 Cannon RaycastVehicle。
5. 如何定义首个可验收的“悬架行程扫描”：输入硬点与行程，输出 hub 位姿、camber/toe 等曲线、铰链错误和穿模检测需求？
6. 冰面/沥青/湿地/砂石不是单一视觉材质；解释摩擦、轮胎本构、地面柔顺性、液体耦合的模型层级。

## 交付标准
- 研究报告必须引用 SAE 原始摘要/工程教材/Chrono 文档等至少 3 类可信来源（可用公开摘要，不得谎称阅读全文）。
- 用示意坐标、**明确为虚构的测试参数**，给出双叉臂最小硬点 JSON；包含车轮中心与旋转轴。
- 运动链图、输入输出契约、可复现测试设计；至少 10 个可自动检查的物理/约束测试案例。
- 建议最小求解器范围，不急于进入轮胎有限元或整车工程定标。

## 参考
- SAE 2000-01-1618（公开摘要）：https://saemobilus.sae.org/papers/optimal-design-software-vehicle-suspension-systems-2000-01-1618
- SAE 2026-01-0584（公开摘要）：https://saemobilus.sae.org/papers/target-cascading-kinematics-compliance-tables-suspension-design-2026-01-0584
- Project Chrono Vehicle：https://api.projectchrono.org/development/group__vehicle.html
- Project Chrono tire：https://api.projectchrono.org/development/wheeled_tire.html

## 验收
总控能够据此定义独立的 Kinematics 模块和边界验收，而不是让实现 Agent 用视觉动画冒充悬架运动。涉及未经公开的真实尺寸必须标 UNKNOWN。

## 提交
`R-04 SUBMITTED；报告和 fixture 路径；研究结论；最低可实现测试；风险`。
