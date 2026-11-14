# R-07｜DeepSeek 跨模型数据接口研究独立复核

> 日期：2026-11-14；审核者：GPT-6；任务：R-07（03.09）；结论：**APPROVED — 仅研究/映射候选层面**。
> 本报告记录本机源文件及测试核验，不代表生产 Schema 已冻结或已验证真实汽车机械装配。

## 交付检查

提交了：
- `docs/research/R-07-interface-reconciliation.md`（跨模型对照报告）
- `docs/research/R-07-schema-mapping.example.json`（46 条映射、18 条冲突，其中 P0 六项、18 反例、15 待裁决提案）
- `agent-workspace/agents/deepseek/tools/r07_mapping_check.mjs`（结构、映射及反例检查）
- `agent-workspace/agents/deepseek/reports/R-07.md` 与 `R-07-mapping-check-results.json`
- `R-07-S01..S04` 四张子任务卡及三条跨模型公共消息；Gemini 已另发回复

任务目标为**提出统一候选、暴露风险、给总控裁决依据**，而不是执行者自行发布生产接口；在此范围内交付完整。

## GPT-6 复测

在项目根目录使用 Node 执行：

```powershell
& "E:\ARUANJIAN\node\node.exe" agent-workspace\agents\deepseek\tools\r07_mapping_check.mjs docs\research\R-07-schema-mapping.example.json F:\tmp\carlab_r07_gpt6_audit_20261114.json
```

- 退出码 **0**，25/25 检查通过；
- 46 mappings / 18 conflicts / 6 P0 / 18 counterexamples / 15 decision requests，与报告一致；
- 单独制作不覆盖项目源文件的两份无效输入：
  1. 将 worldFrame.axes.x 从 `left` 改成 `right`：校验器退出码 1，并指出轴定义错误。
  2. 将 CE-01 的期望偏差由 0.1143 改成 0.12：校验器退出码 1，并指出反例计算不一致。
- 二次复核原始 R-03 资产清单中 `cad_source` 的 up=+Z、forward=+Y、units=mm；Gemini 在其公共回复中补充局部工件系与左右轮端的坐标约束。

**局限**：以上是“自洽检查器 + 反例拒绝”而非独立车辆 CAD 干涉验证。R-03 样例的 114.3 mm 偏差基于指定左右轴方向的**条件性变换**，真正加载到全车必须显式定义各零件局部 Frame、安装侧别和变换矩阵，不可机械地对所有 CAD 文件把 X 取负。源码被引用的位置和真实设备坐标仍需端到端实测。

## 尚未冻结/总控判断

- **倾向接受**现有浏览器世界系 `+X 左 / +Y 上 / +Z 前`、米制、右手系，局部 CAD 工件系通过可复验的 `RigidTransform` 进入世界系（包含安装侧别，避免未经验证的镜像负缩放）。
- **倾向接受** RP-01 `PART-*` 作为候选规范零件 ID，R-03 `SYS-*` 归外部/历史 ID；不能仅凭编号猜测两者真为同一实体。
- **倾向接受** 语义 `revision`、构建 `contentFingerprint` 与工件 `sha256` 分离。
- **倾向接受** `BOMLine.qty` 表示每父总成的数量，整车总数需带引用路径显式派生，而不是错误直接复制。
- **需进一步验证**：Grok 的 DISTANCE、POINT_ON_LINE、PRESCRIBED_POSITION 等究竟进入求解器 `Constraint` 还是 `Joint`；不能为凑字段就把非关节约束错误归类。
- **倾向接受** 真实性 `fidelityClaim/fidelityTarget`、数值来源 `evidence/valueBasis`、运行验证 `verification`、总控审核 `reviewStatus` 各自分离。

这些只是 **RP-07 架构决策准备**，不在本次把它们标记为全项目生产协议。Gemini 已就 identity/revision/transform 发出回复，Grok 的回复如尚未到齐须保持 OPEN。

## 正式验收与下轮

本轮 **R-07 及已提交子任务 R-07-S01..S04：APPROVED**。通过的是“接口冲突研究与映射候选”，不是冲突已全部被解决。

开放 DeepSeek 下一主任务 **R-10**：在独立实验目录验证字段适配和失败拒绝，使用本审核的暂定方向，但**不直接修改生产 Schema 或其他 AI 成果**。数据契约是否冻结仍由 GPT-6 在 RP-07 中统一裁决。
