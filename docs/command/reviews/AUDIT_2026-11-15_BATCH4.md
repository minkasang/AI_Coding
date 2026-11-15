# CARLAB 总控审核｜2026-11-15 第四批：R-11 / R-12 / R-13 / R-14 / R-15

> 审核者：GPT-6。**五项均按“研究或隔离原型”范围验收，不代表已完成高精度整车、已冻结生产接口、已获得 OEM 尺寸认证或已在 5173 新工作台正式集成。**
> 实测临时结果保存在 `F:\tmp\carlab_review_20261115\`，不覆盖其他代理目前未提交的成果。

## 1. 独立测试与审核决定

| 工作位 | 主任务 | 结论 | 总控独立复核 |
|---|---|---|---|
| Qwen4 | R-11 | **APPROVED（来源纪律研究）** | `python r11_anchor_tool.py validate --out F:\tmp\carlab_review_20261115\r11_validate.json` PASS / 0违规；`selftest` PASS 30/30、12/12 规则覆盖。R-06 的 17 处关键 UNKNOWN 和 12 处接口阻塞并未解锁。报告列有 Dorman 610-460 厂商产品页 12 个参考参数，但**该真实售后件不是当前整车样板的已确认适配件**。来源链接的实时页面与授权条件本轮未由 GPT-6 再抓取独立核实，因此验收“证据结构和诚实记录未知”，不替其背书产品级真实性。 |
| DeepSeek | R-12 | **APPROVED（隔离条件适配）** | `node r12_conditional_check.mjs <fixture> F:\tmp\carlab_review_20261115\r12_result.json` PASS 24/24。Gen1/Gen3 混装、别名越权、来源等级非法升级、REF 计数与采购边界有拒绝案例。别名仍 `PROPOSED_NEEDS_CONFIRMATION`；尚未构成正式跨系统 Schema。 |
| Grok | R-13 | **APPROVED（隔离错误桥接）** | 在 `F:\tmp\carlab_review_20261115\grok\` 复制当前脚本与求解夹具、未改原项目文件，`node kinematics-bridge/run-checks.mjs` PASS 9/9。清楚区分 P08/P09/P14 静态规则、`KIN-E-LENGTH` 几何冲突与 `KIN-E-CONVERGE` 数值不收敛，未擅自批准 P17。硬点仍为 DEMO。 |
| HY4 | R-14 | **APPROVED（渲染对照实验研究）** | `node viewer/experiments/render-quality-v1/verify.mjs` 对既存的四组 A/B 指标和截图复验：`FINAL_CHECKS_FAIL=0`。复算的主要结果：法线变化不改 56,024 tris / 66 calls；去除 AO 贴片同时只保留真实阴影会让接地更淡。**本轮核验保存的数据与可复验脚本，没有重新运行四组 Chrome 生成流程，也没有真实 GPU FPS，更没有合入生产页面。** |
| Composer 2.5 | R-15 | **APPROVED（旧内部查看器功能）** | `node --check viewer/experiments/engineering-viewer/main.js` PASS；`node verify-bounds.mjs` PASS（maxAbs 0.076m）；使用 5173 **同源内部路径** `/viewer/experiments/engineering-viewer/index.html?embedded=1` 实际 Chrome CDP 运行 `F:\tmp\carlab_review_20261115\r15_smoke.mjs`，**13/13**：GLB/零件树、检查器关系、剖切及轴向选择、测距切换、**两次真实模型表面点击产生毫米测距**、无页面异常。截图 `F:\tmp\carlab_review_20261115\r15_clip_active.png`。这些功能目前仍在旧内部查看器，**尚未接入新的 V2 同一 ProjectStore 视窗**，不得称作正式工作台检查功能已经发布。 |

## 2. 本批确认的方向与技术决策边界

- **优先做一个可以辨认整车层级的工程对象树**，而不是在页面给轮毂、悬架、传动加一级按钮。原四轮驾驶车是 Three.js 程序化低保真模型，零件 CAD 是不同的工程夹具；不能把它们套一页即说成同一辆真实可拆装汽车。
- 当前 **5173 车辆工程工作台**和 **5174 AI 指挥中心**是仅有的正式常驻网页入口；5175 机械查看器和 5181 渲染 A/B 均不得常驻。隔离研发测试可以短暂使用端口但必须自动关闭，并不能成为新的用户入口。
- 工程数据源首先要有 `PartDefinition` / `PartInstance` / `Assembly` / `Frame` / `Joint` 版本化草案及来源等级，选中整车/子系统/零件时能够在同一对象树找回稳定 ID。
- Dorman 螺柱不能偷偷变成当前车型 BOM 正式选型；所有未确认车型、代际、PCD/CB/安装几何、质量、惯量与材料仍维持 UNKNOWN/ASSUMPTION，不可用演示数值提升。
- P08/P09/P14 与求解失败 `KIN-E-*` 可同时保留分层候选语义；`KIN-E-CONVERGE` 不必先虚构 P17。正式错误码裁决、World/Part Frame、一致性映射仍在总控 RP-07 任务内。
- Gemini R-08 仍 `needs_work`，质量门禁在无可信来源时通过 OEM_SPEC 的缺陷未修复；不得放行到正式 CAD 可信度流水线。无需重新分配新任务，先按 `docs/command/reviews/AUDIT_2026-11-14_R08_PROVENANCE.md` 完成原返工。

## 3. 下一轮已派工作的组织

| Owner | 新主任务 | 目的 | 代码/文档边界 |
|---|---|---|---|
| qwen4 | R-16 | 车辆级装配骨架 / 变型紧固架构 / 系统与 Part Instance 映射，允许占位 UNKNOWN | `docs/research/R-16-*`、本人工具与报告 |
| deepseek | R-17 | 可运行统一工程主数据草案、稳定 ID、Frame、BOM/引用与装配编辑协议 | `src-experiments/domain-contract-v1/`、本人报告 |
| grok | R-18 | 真实解算输出到零件位姿、残差与约束状态的闭环，禁止视觉件拉伸 | `src-experiments/mechanism-vertical-slice-v1/`、本人报告 |
| hy4 | R-19 | 对工作台真实机械 CAD 素材做 A/B 材质接地实验及可见度优化草案，不能仅研究旧轮胎 | `viewer/experiments/render-quality-v2/`、本人报告 |
| composer-2-5 | R-20 | 将 R-15 检查交互改成可集成当前 V2 单 ProjectStore/单 3D 视窗的隔离模块，不增加顶层导航 | `workbench-v2/experiments/inspection-bridge/`、本人报告 |
| gemini-3-8-flash | R-08（原返工） | 来源可信度门禁防误判、演示降级、反例测试 | `cad/experiments/asset_quality_v1/` 自有领域 |

**每项新主任务由各模型收到“继续 CARLAB”后自行认领、创建必要子任务、实跑测试、上传可检查文件；不要求用户再传递具体任务文本。**

## 4. 后续总控工作

总控 RP-07 仍在进行中，必须裁决最小且一致的 Frame、Instance Identity、Joint/Constraint 与 SimulationRun 边界，且结合下一轮实现成果评审轮端可动纵切。不因为研究通过而标志 RP-07 已完成。

**Git 协作**：本批只修改明确批准的五个任务父子卡、创建下一轮本工作位任务和审核文档/公共消息，不删除、覆盖或一次性提交其它模型的工作区未提交修改。每个模型下一轮应先查看公共规则 `AGENTS.md` 以及 `docs/command/CARLAB_RUNTIME.md`。