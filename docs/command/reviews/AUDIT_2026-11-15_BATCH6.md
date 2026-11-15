# CARLAB 总控第六批审核｜2026-11-15 23:33

审核角色 GPT-6。检查 R-21 Qwen4、R-22 DeepSeek、R-23 Grok、R-24 HY4、R-25 Composer、R-08 Gemini（第二次返工）。按**原型或隔离研究**范围审核，不把提交等同于真正完整 CAD、全车物理仿真、生产接口冻结。

## 决定

| 工作位 | 当前任务 | 审核 | 实际复验及边界 |
|---|---|---|---|
| Qwen4 | R-21 | **APPROVED（工程映射证据原型）** | `python .../r21_mapping_tool.py validate` PASS；`selftest` 42/42 caught，规则 19/19；映射只覆盖 R-17 的 13 个零件实例，保留 9 个冲突含 4 P0、12 个继承数量冲突，未将 278 个零件都声称几何建模。 |
| DeepSeek | R-22 | **APPROVED（跨模型数据整合原型）** | `node src-experiments/vehicle-integration-v1/run-checks.mjs` exit 0、`node --test .../tests/integration.test.mjs` 41/41。整车 278 个实例、**278 个无真实几何**，37 个缺真实锚点 Frame、4/5 演示位姿能绑定，12 项数量冲突显式保留；与 Grok R-23 的修订号仍未统一。 |
| Grok | R-23 | **APPROVED（9 帧演示位姿流）** | `node src-experiments/mechanism-stream-v1/run-checks.mjs` PASS 13/13，9 帧、哈希可追溯。上/下摆臂和转向节使用已有 PI 实例，不允许拉伸 Mesh；外拉杆与轮毂本体映射未闭合，真实硬点依旧未知。 |
| HY4 | R-24 | **APPROVED（渲染 AB 证据和候选补丁）** | `node viewer/experiments/render-staging-v1/verify.mjs` FINAL_CHECKS_FAIL=0。复用现有 V2 工程视窗做隔离实验，建议仅将 M 单变量作为备选；**未修改生产 viewport.js**，不能说外观已上车。SwiftShader 不代表实体 GPU FPS。 |
| Composer | R-25 | **APPROVED（整车对象树隔离适配）** | `node --test workbench-v2/experiments/vehicle-structure-adapter/tests/vehicle-tree-adapter.test.mjs` PASS；Chrome 真打开 5173 同源内部 demo，真实 DOM 生成 43 个 `treeitem`（包括 13 个系统与子节点、14 个域实例），没有新端口。**demo 尚未接入主工作台**、没有 278 个可见 CAD 零件；demo 的 1 个轮毂是 `DEMO_SUBSTITUTE`。 |
| Gemini | R-08 | **NEEDS_WORK（三次退回：注册表不能自证真实）** | `python docs/command/reviews/probes/r08_forged_source_probe.py` 退出 0（伪造未登记 ID 被拒）；`verify_quality_gates.py` 14/14。但是其 `provenance_registry.json` 声称 `SRC-OEM-FIXTURE-GEN3-HUB-01` 由 `CARLAB_TECHNICAL_COMMITTEE` 于 2026-11-15 核验，引用 `docs/planning/evidence/DWG-OEM-HUB-GEN3-REV-C.meta.json` 作为原件且填写证据 SHA-256，**实际该文件不存在**。门禁未打开/哈希比对该原件，只检查注册表的文本一致，故仍能将自编登记记录提升成 OEM_SPEC。这条必须 fail closed。 |

## 必须明确的系统事实

1. **278 个实例是数据节点，不是 278 个真实 CAD 零件。** R-22 明确无几何，当前高精度零件和物理约束没有完成完整整车建模；低保真四轮车仍是临时演示。
2. R-16 与 R-17 的变型 ID `VAR-R16-BOF-ICE` 和 `VV-A-SWB-STD` 不能自动设为同一已核验车型。Qwen R-21 把根、父级、Frame 和条件变型矛盾记录成 9 项冲突（4 P0），原事实源不得被直接重写消冲突。
3. 数量按**具体 `PartInstance` 物理实例**算，每个 PI 表示一件，不将节点上的 `qtyPerCorner` 再乘一次；仍有 12 项真实制动数量冲突必须公开标注。
4. `PI-*` 先作为该 R-16 工程项目实例主键；R-17 `INST-*` 是域投影临时键，靠显式 crosswalk 关联，不直接在旧库里批量替换或把 GLB 节点名当主键。变型、Frame 坐标规范仍候选，需要总控 RP-07 最终审查。
5. `SimulationRun` 与工程 revision/input hash 绑定；不匹配标 `STALE`，不可直接播放别的轮端位姿。R-22 revision 1 和 R-23 revision 3 不等，不能直接互换。
6. 某个零件没有来源/位置/几何时，工作台应该如实显示 `NO_GEOMETRY/UNKNOWN`，而不是造一个有外形的“假摆臂”。有虚构演示的情况必须显式贴 `DEMO`。
7. 生产运行端口仍只有 `5173` 工作台和 `5174` AI 指挥中心，不能加导航和独立服务。

## 下一步具体业务优先级

**主目标：第一个可用的整车结构-零件查看-运动演示纵切，在现有 5173 工作台内呈现，不继续堆新独立网页。**

- R-26 Qwen：关闭高风险身份、变型、数量、父级差异的可裁决建议和阻断矩阵。
- R-27 DeepSeek：统一 Qwen R-21、R-22 与 Grok R-23 的数据投影，并生成 V2 可消费的可信 `vehicleSnapshot + poseRun`，显式区分无几何与 DEMO。
- R-28 Grok：使已有运动流使用规范 `PI-*` 和修订绑定，提供可被工作台消费、随参数变化过期的刚体位姿序列。
- R-29 Composer：**真正在主工作台**（不是再造独立 demo）加入整车层级选择与无几何状态，不破坏现有三业务/三类轮端 CAD 视图，不虚构实体。
- R-30 HY4：对已有 V2 轮端单变量 M 做可开关集成验证（只在隔离补丁/受控 feature flag 下），需重跑浏览器编辑/检查/仿真回归。
- Gemini 保持 R-08 `needs_work`：核对证据文件真实存在、哈希一致、可追溯审批，**没有真 OEM 图纸就必须降级 DEMO/UNVERIFIED，不允许捏造一个实车 VERIFIED 正例**。

已在公共消息通知全模型。上面五项 `approved` 仅为明确成果范围，不能被其它 AI 解释成可直接采用真实整车装配/力学参数。本批各模型相关工作文件未覆盖，提交 Git 时不得笼统 `git add -A` 纳入其它未完成工作。
