# R-01｜整车平台家族、硬点与车型变型研究

- 类型：RESEARCH，优先级 P0，负责模型以任务卡为准（当前为 Qwen4）；任务状态随主模型领取和更新，本文不复制静态状态。
- 只读输入：`MASTER_PLAN.md`、`docs/vehicle-platform-architecture-research.md`、`docs/research/RESEARCH_BASELINE.md`、`src/specs.js`、`src/parts/chassis.js`。
- 可写：`docs/research/R-01-platform-family-report.md`、`docs/research/R-01-platform-family-example.json`、`docs/tasks/reports/R-01-report.md`；不得修改 `src/`、CAD、总计划或通用 Schema。
- 目标：给总控一套可落到数据结构/校验算法的“平台家族 + 固定/可变/可换 + 依赖传播”设计，而不是复述汽车行业概念。

## 必须研究的 5 个问题
1. 大众 MQB、丰田 e-TNGA 等官方资料中，哪些维度固定，哪些允许变化？请标明原话出处、网页、访问日期，不能抄袭厂商未公开参数。
2. 如何在 `Architecture, PlatformFamily, VehicleVariant, ModuleSlot` 中分别表达承载式、非承载式、前驱/后驱/四驱、悬架形式、轴距/轮距、车身形式？
3. 一个参数变化会影响哪些零件及几何硬点？以“轴距增大”和“轮距增大”为两个完整影响传播图，包含失败条件。
4. 固定值、范围参数、可替换模块的**三种边界**如何表达？什么时候必须拒绝配置，而不是拉伸模型？
5. 非承载式越野车改成承载式轿车为什么通常不应视为单纯换壳？区分“可视化换壳”与“工程可行平台变型”。

## 输出强制格式
- 研究报告：3 个官方/技术论文来源以上（允许已经提供的链接），每条引用标注 `EVIDENCE / INFERENCE / UNKNOWN`。
- 概念数据模型：实体关系表 + 允许/禁止的参数变动规则 + 变化传播伪代码（输入、输出、失败类型）。
- `R-01-platform-family-example.json`：同一家族的短轴与长轴两个合法变体，再给一个明确非法变体；所有数值**标注假设/演示**，不可声称 OEM 参数。
- 对后续实现给出 JSON Schema 字段清单和至少 8 条可自动测试的断言，如非法轮距超范围、接口不兼容、轴距变化影响模块长度。
- 区分车辆设计“几何兼容”与“动力/强度/法规满足”；后者不得未经验证擅自通过。

## 验收条件
- 总控能根据报告起草 `PlatformFamily`/ `VehicleVariant` Schema，无明显歧义；
- 至少一个反例能够被所述规则拒绝，且解释具体冲突；
- 报告中明确哪些是我们的设计决策而非厂商官方规范；
- 所有结论有可检查文件/图/伪代码，不只有文字概述。

## 资料起点（需核验）
- 大众 2025 年报：https://annualreport2025.volkswagen-group.com/group-management-report/report-on-risks-and-opportunities/risks-and-opportunities/research-and-development-risks.html
- 丰田 e-TNGA：https://global.toyota/en/newsroom/corporate/28474382.html
- 项目已有研究：`docs/vehicle-platform-architecture-research.md`

## 提交格式
写完报告后，只回复：`R-01 SUBMITTED；文档路径；三项关键设计建议；未确定/冲突；无法验证的证据`。不进入任何实现。
