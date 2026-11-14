R-01 SUBMITTED

## 文档路径

- 研究报告：`F:\project\cyq\AI_Coding\car\docs\research\R-01-platform-family-report.md`
- 样例数据（1 家族 + 2 合法变体 + 1 非法变体 + 11 来源 + 19 本地实测 + 16 规则 + 2 传播图）：`F:\project\cyq\AI_Coding\car\docs\research\R-01-platform-family-example.json`
- 校验器（仅标准库）：`F:\project\cyq\AI_Coding\car\agent-workspace\agents\qwen4\tools\r01_platform_tool.py`
- 正例结果：`F:\project\cyq\AI_Coding\car\agent-workspace\agents\qwen4\reports\R-01-validation-result.json`
- 反例结果：`F:\project\cyq\AI_Coding\car\agent-workspace\agents\qwen4\reports\R-01-selftest-result.json`
- 个人回报：`F:\project\cyq\AI_Coding\car\agent-workspace\agents\qwen4\reports\R-01.md`
- 任务卡：`agent-workspace/agents/qwen4/tasks/R-01.md` 与 `R-01-S01..S05.md`

## 三项关键设计建议

1. **拒绝优先于拉伸，并把"拒绝"写成可执行规则。** 变型只有两条合法路径：换一个能力足够的模块（并重新验证接口与包络），或拒绝配置。第三条路（缩放网格）被 P09/P14 明确禁止。这不是文字劝告——实测发现现有代码 `src/parts/chassis.js:61-75` 的 `legA.scale.z = l1` 已经在做静默拉伸：轮距 1680→2200 mm 时下摆臂跨度 499.925→735.612 mm（+47.1%），而管半径 16 mm、张开量 130 mm、衬套与球铰位置全不变。建议把 P09（跨度可解）、P10（轮罩包络）、P14（禁止全局缩放）纳入轮端纵切样板的自动验收。

2. **固定硬点用"相对基准 + 方向语义"表达，不写世界绝对坐标；三类边界分别编码。** FIXED（踏板—前轮中心、H 点相对前轴、纵梁断面、摆臂枢轴、接口类型，`immutable:true`）／PARAMETRIC（轴距/轮距/胎宽，带 `[min,max]` 与派生公式）／SWAPPABLE（模块槽选项，带 `compatibleArchitectures`/`compatiblePowertrains`）。这样一旦总控冻结世界 Frame，硬点可无歧义转成变换矩阵，而不必现在替 RP-07 定案坐标（审核 §3.1 仍是 P0 冲突）。同时把"几何兼容"与"强度/法规满足"强制分成五个字段，后者本轮只能 UNVERIFIED，且无质量属性时 `targetLevel` 不得高于 KINEMATIC。

3. **把"非承载式→承载式不是换壳"变成机器可检的架构跨界规则。** `UNI-SEDAN-SHELL.compatibleArchitectures = ["ARCH-UNI"]`，在 BOF 家族里选它即触发 P15 / ARCHITECTURE_CROSSING 并拒绝。依据：S4 官方原话证明车架是承载主体（"the frame itself was redesigned to reduce weight and increase rigidity"），承载式轿车壳是结构件而非覆盖件，载荷路径、悬架硬点所属父结构、碰撞传力与质量分布都不同。可共享的是轮端/制动/通用件家族/协议（RP-01 SYS-130），不是整个承载骨架。

## 未确定 / 冲突

1. **世界坐标与局部 Frame 未冻结**（审核 §3.1）：现有代码 +X=左/+Y=上/+Z=前进，RP-02 示例 x前/y左/z上。本文件不声明世界轴，硬点无法直接转生产变换矩阵。
2. **三套"真实性"词汇未归一**（审核 §3.2）：本文件用 `valueBasis` + `claimedValidation`，需与 RP-02/03/06 的 `fidelity`/`evidence`/`verification` 统一。
3. **零件/实例身份语义未冻结**（审核 §3.3）：`rp01Ref` 暂用字符串关联已批准的 RP-01 身份，不是正式外键。
4. **轮端接口数值全 OPEN**：RP-04 已于 21:17 复审 **APPROVED**，ISO 273 M14 已修正为 fine 15.0 / medium 15.5 / coarse 16.5（与本人 RP-01 核实一致），隔离复测 6/6 PASS；但该复审明确**未验证**真实配合公差、预紧、轴承构造与整车动力学，零件几何仍为演示假设、生产 Schema 未冻结。故 FH-04 与 IC-* 数值保持 OPEN，待 RP-07 冻结。
5. **首发基型与 AWD/4WD 范围未决**（审核 §3.4）：本家族只是演示候选。
6. **所有阈值都是演示假设**：100 mm 最小悬伸、560 mm 摆臂上限、600 mm 拉杆上限、1050 mm 翼子板包络均非厂商/法规数值，真实上限需 RP-04 取得几何来源后重定。
7. **整体桥桥壳、半轴/CV 角度、前束外倾曲线**只列为传播边，未实现未验证。
8. **R-01 归属矛盾已解决（不再是未决项）**：旧任务书第 3 行曾写"建议给 Gemini Flash"，与任务卡 `owner: qwen4` 冲突；任务书已于 2026-11-14 21:06 更新为"负责模型以任务卡为准（当前为 Qwen4）"，AGENTS.md §6 亦明确指派 Qwen4 续做 R-01。样例 JSON 中 O07 已标 RESOLVED 并保留追溯记录。
9. **脚本与结果 JSON 路径超出任务书字面清单**：任务书未开放 evidence 目录也未给脚本位置，故放本人工作区 `tools/` 与 `reports/`，已在报告 §1 作边界声明，待确认。
10. **本轮未跑任何 CAD/浏览器/物理**：所有代码结论是只读实测 + 可复算算术，不是运行验证。

## 无法验证的证据

1. **S5 Toyota USA Trucks（TNGA-F / body-on-frame）**：本轮抓取为 JavaScript 空壳，未取得正文，`usedForClaim=false`。既有研究文档中该条结论本轮未复核。
2. **S6 VW Group Annual Report 2025（任务书列为资料起点）**：本轮请求超时，未取得原文。MQB 结论改由 S1（2018 年报）本轮实际抓取支持。
3. **S2 e-TNGA 的"电池宽度固定"与"前中后三段模块"**：本轮抓取文本未逐字出现完整原句，已降级为 OPEN，不作为已核实事实使用。
4. **L1 Frank et al. 2022（Procedia CIRP）/ L2 SAE 2000-01-1618**：仅登记为文献线索，本轮未取全文，`usedForClaim=false`，不引用其具体结论或数值。
5. **ISO/SAE 标准条款**：与 RP-01 相同的普遍限制，官方站点大面积 403、PDF 不可解析，本轮没有任何标准条款原文；涉及配合/公差/法规的判断一律 OPEN 或 UNVERIFIED。
6. **S4 的局限**：只证明存在独立 frame structure 且为刚度重新设计，**未出现 ladder frame / body-on-frame 字样**，未列同平台车型清单，无断面或悬置点规格。§3.5 中碰撞传力与模态的具体论述属 ENGINEERING_INFERENCE，非已验证事实。

## 验证情况（实际执行）

```bash
cd F:/project/cyq/AI_Coding/car
./.venv/Scripts/python.exe agent-workspace/agents/qwen4/tools/r01_platform_tool.py derive
./.venv/Scripts/python.exe agent-workspace/agents/qwen4/tools/r01_platform_tool.py validate --out agent-workspace/agents/qwen4/reports/R-01-validation-result.json
./.venv/Scripts/python.exe agent-workspace/agents/qwen4/tools/r01_platform_tool.py selftest --out agent-workspace/agents/qwen4/reports/R-01-selftest-result.json
```

- `validate` → **PASS**：结构违规 0、非法变体上的期望拒绝 13 条、夹具失配 0；VV-A LEGAL / VV-B LEGAL / VV-C ILLEGAL（7 类失败类型与 `expected` 完全一致）。
- `selftest` → **PASS**：**21 caught / 0 missed / 21 total，16/16 规则都有反例**。
- 成功标准说明：样例**故意**含一个非法变体，故"0 违规"是错误标准；正确标准是结构规则 0 违规 + 每个变体实际判定/失败类型/派生尺寸与预期夹具一致。此逻辑已在校验器中显式编码。
- 环境：项目 `.venv`，Python 3.13.0，零第三方依赖；反例全部在内存深拷贝中构造，**未创建临时文件、未写 C 盘、未改 `src/` 与共享 Schema**。