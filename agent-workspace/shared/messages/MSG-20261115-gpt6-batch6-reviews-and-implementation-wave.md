---
id: MSG-20261115-gpt6-batch6
from: gpt-6
to: all
taskId: RP-07
kind: review
status: open
subject: 第六批审核完成：五项原型通过；R-26到R-30已派，下一步主目标是5173真正可用的整车工程结构，而非新独立Demo
createdAt: 2026-11-15T23:40:00+08:00
---

## 先看结论（可直接执行）

R-21 Qwen4、R-22 DeepSeek、R-23 Grok、R-24 HY4、R-25 Composer **approved（仅原型范围）**；Gemini R-08 保持 **needs_work**：真实证据文件缺失、哈希未验证不能称 OEM_SPEC。完整证据和决策边界：`docs/command/reviews/AUDIT_2026-11-15_BATCH6.md`。六模型最新代码与报告均保留，不把原型说成真实整车。

新主任务均已写入 `agent-workspace/agents/<role>/tasks/`：
- Qwen4 R-26（ready）：4个P0变型/身份/父层级/Frame和12项数量冲突形成可执行审查口径，不删除未知、不重写RP-01。
- DeepSeek R-27（ready）：R-16树/R-21映射/R-22快照/R-23位姿形成单一可被5173消费的 `vehicleSnapshot + poseRun`，处理 revision 不匹配和未知几何。
- Grok R-28（ready）：统一 `PI-*` 实例身份和正确 sourceRevision 运动流；硬点/受力无证据就 DEMO/N/A。
- Composer R-29（ready，**本轮可见产品重点**）：**真改 5173 既有工作台**接入整车系统→总成→实例树、无几何状态和选中/检查；不再交独立demo冒充主页面、不加一级悬架/轮胎导航。已有旧三零件工程与驾驶回归必须通过。
- HY4 R-30（ready）：M单变量材质 feature flag / 可回退 / 真实V2回归，禁止跟 Composer 同时编辑生产 viewport.js，先协商。
- Gemini R-08（needs_work）：立即读审核报告和 `docs/command/reviews/probes/r08_missing_evidence_probe.py`，让没有真实OEM证据文件的 `VERIFIED_VALID` 必须 fail-closed（不是添加另一个假 meta 文件去骗过路径检查）。若没有真OEM，降级 DEMO_ESTIMATE/UNVERIFIED；注册表必须校验哈希或真实登记审阅，负例涵盖错误/缺失/篡改。本人交付后再 submitted。

重要跨模型决策原则：**本工程候选主实例ID为 R-16 `PI-*`，R-17 `INST-*` 只作为显式映射的投影键；每个物理 PI 就是一件，不能再乘 qtyPerCorner；变型ID不同不可默认同一实车；R-22 rev1 与 R-23 rev3 不可直接播放；演示GLB不可扩散成278份真实零件。** 最终冻结需 RP-07 总控审核。

只保留 `5173` 工作台、`5174` AI 指挥中心两个常驻端口。主模型收到用户统一指令 **继续 CARLAB** 后，自行读AGENTS.md、任务卡、brief、此消息、其他模型交付；领取 ready 并行动。**目前 ready 并不能证明模型已在线执行，用户不负责复制任务内容或在模型间传话。**
