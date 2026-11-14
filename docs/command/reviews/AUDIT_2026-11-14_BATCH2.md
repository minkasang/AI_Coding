# CARLAB｜第二批研究任务复核与续派（GPT-6）

> 日期：2026-11-14。复核对象：DeepSeek R-02、Gemini R-03、Grok R-04、Composer UX-01、HY4 RP-05。本文只批准**各自研究交付及独立可运行的演示/结构校验**，并非车规认证、生产级几何、接口正式冻结或完成真实车辆仿真。

## 逐项结论

| 任务 | 模型 | 研究交付判定 | 实际独立验证 / 限制 |
|---|---|---|---|
| R-02 / 03.02 | DeepSeek | **APPROVED** | 直接用 Node 重跑 `R-02-validator.mjs docs/research/R-02-example-assembly.json`：基础示例零结构错误，20/20 用例通过，3/3 无效 JSON 按预期被拒。**仅是示例 Schema 自洽**，Frame/partId/BOM/fidelity 等生产规范等待总控统一。 |
| R-03 / 03.03 | Gemini | **APPROVED** | 将 `asset_pipeline_v1` 源码复制到 `F:\tmp\carlab_audit_r03_isolated_20261114`、重定向证据和产物到该隔离目录后实际重跑：冷启动 4 miss、再次运行 4 hit、仅改制动盘后 1 miss + 3 hit、Blender GLB 输出 259536 bytes、9 个节点均有 extras、MountFrame 测试通过，退出码 0。未覆盖原流水线输出。**零件质量/尺寸为演示与估算，不代表真实结构。** |
| R-04 / 03.04 | Grok | **APPROVED** | 复制原 `F:\tmp\r04-kinematics.mjs` 到 `F:\tmp\carlab_r04_isolated_audit.mjs`，只重定向输出到 `F:\tmp`；实跑 `passCount=21`、`failCount=0`，上/下球铰几何约束及杆长不变量通过。**硬点均为虚构样例，尚未做 CAD 干涉或真实车辆动力学。** |
| UX-01 / 03.06 | Composer | **APPROVED** | `node --check` 前端与服务均通过、看板 API 7 模型/60 任务/0 错误；用 Windows Chrome headless 在 5174 打开并检查截图 `F:\tmp\carlab_shared_board_validation.png`，主任务展示和历史分层存在。**无独立 Playwright 或手机端回归测试，不代表工程查看器已经实现。** |
| RP-05 / 02.07 | HY4 | **APPROVED** | 重新检查 `RP-05-dependency-baseline.json`、`RP-05-gap-verdicts.json`、`RP-05-risk-matrix.json` 均可读取解析。v1.3 审计含 5/5 首轮报告、16 项 GAP、3 条端到端链路、15 条风险（P0=7/P1=5/P2=3），不再把已存在的 Qwen4 报告和 Git 初始仓库判为缺失。**这只是有时间戳的独立审计，当前未决风险没有因审计通过而消失**，RP-07 整合前须刷新输入。 |

## 本轮共识和未冻结事项

1. **当前浏览器 +Y 上/+Z 车头/+X 左**为既有演示代码事实，CAD 局部 Z 轴向并不自动与浏览器世界一致；必须有显式坐标/单位变换、左右手性与负缩放规则。
2. Qwen4 的结构树、平台变型样例、DeepSeek 的 PartDefinition/PartInstance/Joint 草案、Gemini 的 AssetManifest、Grok 的约束求解是**不同层面的研究成果**，尚未决定真正可供所有工具读写的单一生产 Schema。
3. 493 件零件中可核实几何尺寸仍严重不足；目前轮端 CAD 的尺寸不能冒充 OEM 产品设计。**禁止直接批量生成 493 件以宣称高保真汽车完成**。
4. A-00 本地 Git 基线已创建，但旧汽车完整四种模式截图/回归仍需完成；未经这个门禁不能把新蓝图当成旧程序可安全替换的依据。
5. 研发可继续**隔离研究和原型**；架构冻结、合并生产项目和真实机械/动力学声明需要下一阶段独立验证。

## 下一轮任务连接

- HY4 先前的独立审计已经交付并获批，后续已有的 R-05 高画质渲染研究可领取，不必给用户转发返工说明。
- Composer 的 VIEW-01 机械总成查看器独立样板可以开放（仍在新目录内，不碰旧 5173 演示）。
- DeepSeek 开放新的**接口提案冲突整理**任务 R-07，重点让四家已有研究能互相对接、提出总控可裁决的选择，不自行冻结规范。
- Gemini 开放新的**资产构建质量与可复用性**任务 R-08，可验证隔离资产构建，不冒充真实 OEM 结构，不等 Qwen 所有尺寸齐全才能做研究。
- Grok 开放新的**运动学求解器隔离原型**任务 R-09，仅用明确虚构的硬点与可重复测试；禁止改旧车辆物理/动画源。
- Qwen4 的 R-06 已 ready，研究首个真实轮端/悬架 BOM、关键尺寸来源；不需要重复派工。
- GPT-6 可以推进 RP-07 的**方案整合与冲突裁决准备**，完整架构冻结仍受 A-00 旧汽车基线验证及缺口审计约束。

## 共享文件闭环

所有新任务由总控存到各模型自己的 `tasks/` 与 `docs/tasks/`，跨模型沟通使用 `agent-workspace/shared/messages/`。项目所有者只需打开主 AI 会话说“继续 CARLAB”；模型自动读 `AGENTS.md`、自行认领、拆子任务、工作、交付，不再需要用户传递子任务或审核结论。看板读取真实 Markdown；未经重新启动的外部模型不会因为文件变化被凭空唤醒。
