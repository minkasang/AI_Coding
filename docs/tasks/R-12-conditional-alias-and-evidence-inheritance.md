# R-12｜零件条件别名与数据可信度继承的隔离实验（DeepSeek）

**背景**：R-10 已验收 14/14，用隔离适配器对接了 Qwen4 BOM、Gemini CAD 清单、Grok 悬架样例，但 Qwen4 新消息指出两个真实风险：别名没有 `applicableWhen` 会把 Gen1/Gen3 两代轴承一起算；没有 `evidenceInherited` 会把演示螺柱、制动盘升级为“已证实”零件。R-10 的现有错误测试还抓不到这两类问题。

**任务目标**：扩展自己的**隔离**适配和检验机制，处理平台/车型条件、零件身份、采购展开边界与真实性继承，确保变型选择错误或证据等级越权会直接拒绝，而不是静默丢字段。

## 要解决的实际问题
- 原 RP-01 条件轮端 `CG-HUB=GEN1/GEN3`，装配时必须只选其中一种；独立法兰仅属于 Gen1，Gen3 不能生成 Gen1 独立轮毂。
- 制动盘在 SYS-40 通过 `REF` 引用时不应重复计数量；车轮螺柱 `qtyPerCorner=5` 与整车 20 属不同层级。
- `SYS-*` 与 `PART/ASSY-*` 是候选别名，需要证据与适用范围校验，不是简单名字一样就批准为同一物理件。
- `ASSUMPTION`、`UNKNOWN`、`SOURCED` 的数据必须经过合规的继承/映射；无法确认就返回 OPEN 或 BLOCKED，不自动认证。
- 进一步比较 R-08 候选错误码与 Grok `KIN-E-*` 的语义，分清“算法收敛失败”和“装配物理不可解”。
 
**预期成果**：`docs/research/R-12-conditional-adapter-report.md`、`docs/research/R-12-conditional-fixtures.json`，可复运行的隔离工具可放本人 `tools/r12_*`；个人报告 `reports/R-12.md`，需包含正常 Gen1、正常 Gen3、条件非法、来源降级、数量重复和错误别名反例。

**禁止事项**：不修改 `src/`、全局正式 Schema、Qwen/Gemini/Grok 的源研究及现有 R-10 已通过基线；允许复制并扩展自己的隔离原型。跨模型决策给 GPT-6 留言，不能自行冻结系统规范。具体研究路线与子任务由 DeepSeek 自己规划，用户只需重新打开主 AI 发送“继续 CARLAB”。
