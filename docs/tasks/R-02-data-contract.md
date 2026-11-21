# R-02｜汽车零件、装配、运动副和车型数据契约研究

- 类型：RESEARCH，优先级 P0，状态 BACKLOG，建议给 DeepSeek。
- 只读输入：`MASTER_PLAN.md`、`docs/research/RESEARCH_BASELINE.md`、`docs/vehicle-platform-architecture-research.md`、`src/specs.js`、`cad/experiments/hello_flange/`。
- 可写：`docs/research/R-02-data-contract-report.md`、`docs/research/R-02-example-assembly.json`、`docs/tasks/reports/R-02-report.md`；不得修改 `src/`、CAD、`MASTER_PLAN.md` 或建立未审定的 `schema/` 生产接口。
- 目标：提供统一可序列化的数据契约草案，保证 AI 建立的每个零件以后都能跨车型装配、驱动和替换。

> 接续 DeepSeek 已验收的 RP-02 跨系统接口研究。先核查既有报告和校验器，自主设计后续任务；坐标系与生产 Schema 仍需总控决策。

## 必须研究的问题
1. `PartDefinition`、`PartVariant`、`PartInstance`、`Assembly`、`Joint`、`Material`、`VehicleVariant` 的身份、引用、版本、生命周期如何区分？
2. mount hardpoint 应如何表示：局部坐标、朝向、轴向、单位、配对面/孔、接口类型、公差、来源？
3. 如何明确 CAD 使用 mm，浏览器使用 m；如何定义右手坐标、局部相对变换、左右镜像和轴向？本项目目前浏览器 `+Y` 上、`+Z` 前，应显式定义转换。
4. 固定、转动、球面、滑动、万向等 joint 的自由度、限位、关节框架如何抽象，同时避免把 build123d 关节 API 与浏览器物理引擎具体 API 锁死为同一表示？
5. `STEP`、`STL`、`GLB` 如何通过 `partId, revision, hash, sourceUnits, transform` 映射？哪些信息要放在 JSON manifest 而不是期望 STL 保留？
6. 重用一个零件时，如何避免“重复生成同一个螺栓实体”和“一个对象被多处共享后错误地一起运动”？
7. 如何区分未知的工程数值、估计、参考资料、实测、仿真值及其验证等级？

## 必须提交
- 字段层级清单：每个实体必填/可选项、数据类型、单位、默认规则、约束与错误码。
- 一套**建议 Schema**（设计稿，非生产实现）：BOM→法兰→5 个螺栓→制动盘的最小装配 JSON 示例；同一零件多实例，5×PCD=114.3mm 的孔/螺栓要匹配。
- 实例中必须包含 `variantId/revision`、独立的 `instanceId`、局部 Frame、来源和 unknown/null 约束。
- 至少 12 个自动校验案例：如单位错误、空 partId、错误 PCD、重复 instanceId、joint 轴不归一化、无法解析 part revision、左右反向、尺寸越界等。
- 至少 3 个刻意错误的 JSON 输入示例及预期错误码；清楚指出哪些检查需要 CAD B-rep 而非 Schema 校验。
- 列出与 R-01 的待对齐字段，不得自行冻结平台家族 Schema。

## 参考
- 现有法兰：`cad/experiments/hello_flange/params.json`、`out/hello_flange_metadata.json`。
- build123d 当前版本 API：https://build123d.readthedocs.io/en/v0.13.0/direct_api_reference.html
- glTF 官方工作流：https://threejs.org/manual/pages/loading-3d-models.html

## 验收条件
总控可根据本报告派发 I-01 Schema 与校验器开发；任何单位/坐标/装配接口歧义有明确定位。报告不能只画类图，也不能把模拟示例标注为真实车辆制造标准。

## 提交
`R-02 SUBMITTED；文档路径；推荐实体设计；12 个测试案例链接；和 R-01 的接口冲突/待决点`。
