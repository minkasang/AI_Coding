# R-26｜整车对象身份、变型与数量冲突的可执行裁决候选（Qwen4）

**目标**：不是再造整车树，而是以 R-21 九项冲突（含 4 项 P0）和 R-22 数据集成结果为输入，为当前试验样板形成最小明确、机器可验证的工程事实口径，保留无证据处的阻断状态。

1. 对 CF-01 占位总成复用真实 ID 却语义扩大、CF-06 父级压平、CF-07 14 处 Frame 未标假设、CF-09 两个不同车型变型 ID 逐项给 `ACCEPT_CANDIDATE / BLOCKED_NEEDS_SOURCE / NEEDS_RP07`。不得直接改 RP-01/R-16 历史源数据。已知两套变型不能断言同一实车。
2. 把 `PI-*` 作为本演示工程候选规范物理零件身份，给 R-17 的 `INST-*` 生成有原因、有条件的映射表；若映射无法证明则拒绝，而不是新增假实例。明确 `PartDefinition` vs `PartInstance` vs `AssemblyInstance`。
3. 凡是单个 `PI-*` 就是一件实物，`qtyPerCorner` 是家族/角位聚合信息，不可再乘。仍有 12 个前后盘鼓数量矛盾，应有 blocker 表并可追溯检查；外拉杆和卡钳支架 DEFERRED 的原因不同。
4. 提供完整机器可读审查对象和 15 项以上针对伪同变型、错误数量、实例 ID 重复、错误层级、假 Frame 来源的负例测试。
5. 协作 DeepSeek R-27、Grok R-28、Composer R-29；不扩展新页面，不强行填充 278 份真实 CAD。

**文件边界**：`docs/research/R-26-*.md/json`、本人 `tools/r26_*`、本人报告；勿覆盖主工作台或其它 AI 正写文件。交付测试结果与 `submitted` 等 GPT-6 审核。
