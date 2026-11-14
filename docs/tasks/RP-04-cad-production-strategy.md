# RP-04｜复杂汽车零件的参数化生产策略研究（Gemini 3.8 Flash）

## 任务授权：目标约束明确，执行路径由你自主决定

> **重要**：本任务书描述最终需要解决的问题、质量标准和交付边界；以下研究问题是覆盖要求/探索线索，不是总控预先安排的固定执行顺序。阅读项目 `AGENTS.md` 第 0 节和 `docs/command/PROMPT_AND_DELEGATION_STANDARD.md`。请先核实当前状态，**自己规划合理的技术路线，并在个人工作区按需创建带 parentId 的子任务卡**，自主调整步骤。不要为完成清单而牺牲发现新问题的机会。每项结论必须可证实、可落地，涉及跨模型接口或整体范围变化需提交总控审查。


**研究目标**：确定 AI 怎么真正做出轮毂、螺栓、轴承、齿轮、摆臂、管线、发动机机构等可以复用的精细零件。
**类型**：RESEARCH，第一波并行；不得批量生成完整车型。
**输入**：`MASTER_PLAN.md`、`docs/environment-build123d.md`、`cad/experiments/hello_flange/`、`docs/planning/VEHICLE_SYSTEM_TREE_SEED.md` 和 R-03 说明。
**允许写**：`docs/planning/reports/RP-04-cad-production.md`、`docs/planning/evidence/RP-04-*.json`、`cad/experiments/planning_feasibility/**`（仅隔离少量原型）、`agent-workspace/agents/gemini-3-8-flash/tasks/RP-04.md` 和个人回报。
**禁止**：改旧 `src/`、生产零件库和 CAD→GLB 现有成功链路；不安装额外大型软件、不写 C 盘大量缓存。

## 研究要求
1. 定义零件类别：旋转对称件、钣金/车架件、铸造/锻造复杂曲面、螺纹/紧固件、齿轮啮合、弹簧/减振器、软管/线束、轮胎与车身面等。
2. 每类比较 build123d、Blender 和外部已有合法模型/公开 CAD 的适用性，并给出“精确工程几何”“近似工程外形”“仅视觉网格”的边界。
3. 明确真实螺纹、细小倒角、孔位、公差、间隙、材料表面等哪些必须真实建模，哪些可通过简化或贴图实现。
4. 说明参数变型与共享件：轴承型号/孔径/PCD/轮距等改变后，是重生几何、换装配实例，还是拒绝不兼容。
5. 画出 CAD 源 → B-rep/STEP → Mesh → Blender → GLB/LOD/metadata → Chrome 的信息保留/丢失/验证表。
6. 若需小实验，只选一个简单且可说明问题的局部结构（如螺栓阵列/轴承剖面或不同轴向），限定 F 盘，要求脚本及可复验的单位、尺寸、包围盒结果。
7. 按零件族提供模型测试标准（尺寸、孔位、体积、拓扑、面数、装配接口、素材许可）。

## 验收
- 覆盖主要机械零件类型的建模路线与“真实度—成本—浏览器性能”权衡；
- 一套可直接拆给 Flash 实现的通用 `PartBuildTask` 字段建议；
- 有代表性的失败反例；不能把 STL 导出成功等同于完整工程装配成功。
