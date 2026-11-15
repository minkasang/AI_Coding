# CARLAB 2026-11-15 18:52–19:xx｜第五批六模型交付验收

> GPT-6 直接检查任务看板、模型提交、相应源文件，独立重跑脚本与 5173 实际 Chrome 点击。审核对象为 **R-16、R-17、R-18、R-08 返工、R-19、R-20**。所有通过仅对各自**隔离/演示原型**有效，不表示整车 CAD、真实硬点或正式物理协议已完整落地。

## 结论

| 工作位 | 任务 | 审核 | 独立验证 / 重要边界 |
|---|---|---|---|
| Qwen4 | R-16 整车对象树 | **APPROVED（候选骨架）** | `r16_skeleton_tool.py validate` 0 违规，`selftest` 37/37（19/19规则），`combos` 4种合法配置+2种非法混用。候选有 13 系统、108 总成、493 零件**定义**、278 个实例、四角位置；**全部 278 实例的真实几何值仍 UNKNOWN**，不得按数量大误称 CAD 已画完。RP-01 根树补丁仅建议，未放行直接覆盖。 |
| DeepSeek | R-17 领域主数据 | **APPROVED（隔离可执行领域模型）** | `node --test src-experiments/domain-contract-v1/tests/domain.test.mjs` 14/14；`node src-experiments/domain-contract-v1/run-checks.mjs` 两 fixture 验证通过。ID、证据等级、Frame 变换、版本失效（STALE）、Joint/Constraint 分类有效；但此 fixture 10 系统/14 实例，不与 Qwen 13 系统/278 实例同构，不得直接称已形成同一全车数据源。 |
| Grok | R-18 悬架位姿纵切 | **APPROVED（虚构硬点运动演示）** | `node src-experiments/mechanism-vertical-slice-v1/run-checks.mjs` 11/11，球铰约束残差约 `6.695e-11 m`，摆臂长度固定，失败不伪造合法；硬点是 DEMO，碰撞为简单球体包络，不是 OEM/真实力学载荷。 |
| Gemini | R-08 CAD 可信度门禁返工 | **NEEDS_WORK（未完成真实来源校验）** | `python cad/experiments/asset_quality_v1/verify_quality_gates.py` 11/11 PASS，确实能拦截缺失 `sourceId/drawingNumber/applicableScope`，但**独立伪造来源反例仍被错误批准**：将 `sourceId=DOES-NOT-EXIST`、`drawingNumber=FAKE-DRAWING`、`applicableScope=FAKE-VEHICLE` 填入 `config_verified_spec_sample.json`，`Gate1_InputProvenance.evaluate` 返回 `passed=True`。原文件自身的 `SRC-OEM-DWG-2024-991A` 未提供实际可验证图纸记录，只是具有图号的样例，不能被称为真实经核实的 OEM 凭证。复现脚本见 `docs/command/reviews/probes/r08_forged_source_probe.py`。 |
| HY4 | R-19 轮端 GLB 画质 A/B | **APPROVED（离线视觉对照实验）** | `node viewer/experiments/render-quality-v2/verify.mjs` `FINAL_CHECKS_FAIL=0`，12 帧保存结果和 4 负例符合规则；**本轮总控只复验既存实验数据，没有重跑 GPU/完整 Chrome 截图生成**。发现 V2 统一 PBR 覆盖 GLB 差异、地面低于 GLB 最低点约 54mm。结果 `nearWhiteRatio` 反而增加，故**不批准整包无条件改生产渲染**。 |
| Composer 2.5 | R-20 统一工作台测距与剖切 | **APPROVED（V2 检查上下文能力）** | `format-distance.test.mjs` 2/2，`project-store.test.mjs` 11/11；独立 `node workbench-v2/tests/browser-smoke.mjs` 全部通过；总控另在 F 盘复制 Chrome 冒烟脚本增加真实 Canvas 点击：V2 检查模式两次 3D 表面点击后有 `mm` 测距结果，剖切开关、X 轴和位置滑杆切换正常，回到编辑/整车模式仍通过原回归。独立截图 `F:\tmp\carlab_v2_latest_review_images\latest-R20-clip.png`。这些是**视觉检查工具**，不是计量认证或刚体运动求解。 |

## 与用户目标直接相关的真正进展

1. **已有全车零件结构信息**，但多数是“树节点/零件定义”，不是 CAD 几何。能讨论某一悬架总成包含哪些部件，暂时无法对其全部螺栓做真实尺寸拆装。
2. **已有可执行装配事实源候选**，可管住类型、实例 ID、版本过期和不确定性。当前 Qwen 的详细树与 DeepSeek 的简化模型仍是**两份不同夹具**，下一阶段必须统一，不能再把两份研究报告直接当作已整合。
3. **已有可解算的悬架局部位姿演示**，但仍需 DeepSeek 的 Joint/Frame 作为一致身份，让同一零件实例在 3D 视窗真实刚性运动。
4. **展示和检查已经在当前 5173 工作台可用**，不过模型库仍是 3 类轮端样板；下一阶段必须有“整车对象树 + 有几何/无几何清晰标注”并存的演示，不允许为悬架/轮毂另开一级主页。
5. **5173 工作台 + 5174 AI 指挥中心**两常驻服务仍正常，未发现 5175/5181 常驻监听。Git 当前本批六 AI 有大量未提交工作，审核提交只能精确选择文件，不得 `git add -A` 误纳其它 AI 的无关改动。

## 本轮裁决 / 下轮边界

- **D-02 身份**：`instanceId` 为稳定工程对象身份，`Object3D.name` 只是渲染资产标识；Gen1/Gen3 别名若未确认，只作 `PROPOSED_NEEDS_CONFIRMATION`，必须有 `applicableWhen` 和 `evidenceInherited`，不可自动升为真实部件等价关系。
- **D-04 数量**：优先按 `parentAssemblyInstance + perParentQty + corner` 逐层计算，整车 total 必须从实例归集得来；12 项源树数量冲突保持显式 OPEN，**不直接修改 RP-01 已验收原数据**，由下一轮映射器并列报告差异。
- **Joint/Constraint**：`Joint` 描述部件刚体间连接及允许的自由度，`Constraint` 是方程、几何/运动约束与校验残差，减振器长度可作为 Output，不把所有物理方程都当 Joint。具体 Frame 轴向在无正式证据前仍是`CANDIDATE`。
- **SimulationRun**：绑定输入工程修订与版本指纹；参数变化时必须标记 STALE，不可沿用旧求解结果显示“当前”。
- **来源真实性**：仅有图纸编号字符串不能算“图纸已核验”；需要真实可定位的 evidence artifact/哈希或可信原始文件记录，无法得到时标 `UNVERIFIED_CLAIM`、`DEMO_ESTIMATE` 或 `UNKNOWN`。
- 下一波主线应集中做 **R16 实例树→R17 领域模型→R18 刚性位姿→R20 检查视窗** 的首个真实可视数据闭环；画质改动只经 feature flag/小步试验采用，不另开独立站点。

## 验证现场

运行时间：2026-11-15 晚间，Windows DESKTOP-9KV1SUI，`F:\project\cyq\AI_Coding\car`；所有命令实际退出码 0（即使 Gemini 原有 11 项测试通过，也不能推翻总控新增伪造来源负例失败）。审核脚本与浏览器截图临时存 `F:\tmp`，可由下轮验证引用，但不得把机器上尚未存在的实车 OEM 图纸假装来源。
