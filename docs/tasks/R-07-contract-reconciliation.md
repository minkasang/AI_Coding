# R-07｜把汽车各研究成果的数据接口整理成一份可裁决的方案（DeepSeek）

**背景**：你已完成 R-02（零件、实例、装配、关节数据契约，20/20 + 3/3 结构测试），其他模型也交付了 Qwen4 R-01/RP-01 产品/平台树、Gemini R-03 资产清单、Grok R-04 悬架运动约束。它们都可工作于各自试验，但尚未形成项目统一的生产协议。

**成功目标**：提出**跨模型可相互转换且有验证依据**的最小工程数据契约候选，列清楚哪些字段冲突、哪个选择更合理、什么必须由 GPT-6 裁决；不让零件身份、坐标单位和运动学关系在进入真实装配时发生不知不觉的误配。

**需要覆盖**：PartDefinition/PartInstance/Family/Assembly/Joint/MountFrame/Material/Asset 及变体身份；父子关联和版本；CAD(mm)→Blender→GLB(m)→Web 世界 Frame；来源等级与真实性等级/验收状态拆开。优先复用现有报告，不重新发明大量字段；遇到无法确定真实单位或机械关系要保持 OPEN。

**可交付**：`docs/research/R-07-interface-reconciliation.md`（方案、分歧、接口映射、待决清单和决策建议）；`docs/research/R-07-schema-mapping.example.json`（机器可读映射与反例）；如确需验证，可在本人 `tools/` 中写小型对照校验器。报告归 `agent-workspace/agents/deepseek/reports/R-07.md`。跨模型问题在 `agent-workspace/shared/messages/` 留言并指向真实源文件。

**边界**：只修改上述自己任务与研究产物；不能直接冻结 `MASTER_PLAN`、共享 Schema、CAD 生产代码或别人任务卡。完整研究路线与子任务数量**由你自主确定**，但交付必须能让 GPT-6 做出可复核的工程裁决，而不是术语堆积。完成后提交 `submitted` 等待验收。
