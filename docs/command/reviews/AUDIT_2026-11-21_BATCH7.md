# CARLAB 总控审核｜第七批（2026-11-21 16:10–16:20）

审核者 GPT-6；针对六个 `submitted` 工作位和新增 Codex C-01，重新读取实际文件、实跑单测、访问现有 5173/5174、查看 Chrome 浏览器回归截图。**阶段原型验收不代表 OEM 实车参数/整车 CAD 完成或生产级性能认证。**

## 逐项结论

| 工作位 | 任务 | 结论 | 独立复查 |
|---|---|---|---|
| Qwen4 | R-26 | **APPROVED（冲突决议候选）** | `r26_decision_tool.py validate` PASS；`selftest` 37/37 caught、20/20 规则。4 项 P0 逐项保留裁决边界、12 项数量冲突保持 blocker；候选 ID `PI-*` 不等于已核验 OEM 实例。 |
| DeepSeek | R-31 | **APPROVED（只读消费模块）** | `node src-experiments/vehicle-consumer-v1/run-checks.mjs` PASS；`node --test .../tests/consumer.test.mjs` 19/19。13 系统/37 总成实例/278 零件实例可按 ID 查阅、严禁把演示几何升级真实 CAD、严格运动 STA​LE。R-31 是独立消费库；主页面接入由 R-29 承担。 |
| Grok | R-28 | **APPROVED（演示运动绑定）** | `node src-experiments/mechanism-pose-adapter-v1/run-checks.mjs` 10/10。运行绑定工程修订 1，旧版本不能用；轮毂仍是角色标记，没有外拉杆实例，硬点为 DEMO、受力未知。不得宣称 OEM 运动学闭环。 |
| HY4 | R-30 | **APPROVED（离线视觉 A/B + 候选补丁）** | `node viewer/experiments/render-release-v1/verify.mjs` 9 组核验 PASS；`node --test viewer/experiments/render-release-v1/tests/m-pbr-flag.test.mjs` 10/10。默认禁用、可回退，项目主 `viewport.js` 未修改，明确 `PROPOSAL_NOT_APPLIED`。不能声称已经上线或真实 GPU FPS。 |
| Gemini | R-08 | **APPROVED（质量门禁研发范围，未认证 OEM）** | 独立复核 `r08_missing_required_metadata_probe.py` 对缺 path/hash 由之前错误 passed=True 改为现在严格拒绝；`r08_forged_source_probe.py`、`r08_missing_evidence_probe.py` 均 PASS；增加的生产模式 TEST_ONLY 样板拒绝、仅显式实验模式可用以及哈希错误拒绝也经独立 Python 检查。代理汇报 22 项全套通过，本批**未再次运行其需要 Blender 的全套端到端**，此前独立运行过旧 17 项 PASS。项目自身的 TEST_FIXTURE_VERIFIED_OEM.meta.json 仅是自制测试样本，**不是实际厂商 CAD/OEM 图纸**，当前绝不能声称生产项目有 VERIFIED OEM 零件。 |
| Composer | R-29 | **NEEDS_WORK（视觉布局质量未达标）** | `node --test workbench-v2/experiments/vehicle-snapshot-adapter/tests/vehicle-snapshot-client.test.mjs` 1/1；`node --test workbench-v2/tests/project-store.test.mjs` 11/11；`node workbench-v2/tests/browser-smoke.mjs` 全 PASS、无 JS 异常。实际截图 `F:\tmp\carlab_v2_test_images\01-project-loaded.png`、`02b-inspection-workspace.png` 显示 1500x920 的**左栏整车工程骨架树项溢出，与 PROJECT EXPLORER / 可编辑装配 / COMPONENT LIBRARY 文本明显叠加**；这会造成产品不可读。功能测试未覆盖视觉叠压。必须修布局、分区滚动/折叠、长树高限制与尺寸适配，并增加对 element bounding rectangles 的**不重叠自动断言**与新截图。用户明确要求整洁的单工作台，不能以仅功能 PASS 验收页面。 |
| 新 Codex | C-01 | **IN_PROGRESS / 未交付** | `cad/experiments/vehicle-cad-pipeline-v1/` 已有 `model.py/assembly.py/pipeline.py/blender_export.py/verify.py/check-glb.mjs` 等实际实现源代码与参数、装配 JSON；**目前没有可验收的 STEP、GLB 或流水线结果报告**。独立工作位目录已存在。指挥中心唯一解析错误来自 C-01 的 `brief: docs/research/C-01-wheel-end-pipeline.md` 指向尚不存在的文件；由 Codex 在完成任务书时补齐，不应假装 C-01 已完成。 |

## 下一步执行边界

1. **Composer R-29 原地返工**：修好主 5173 左栏长树排版和清晰滚动布局、不得抹去 13 系统/37 总成/278 PI 的功能，也不新开长期网站端口；至少 1500x920 和更窄 1280x800 两种桌面宽度 Chrome 截图检查/自动元素不重叠断言。勿覆盖 DeepSeek 或其它 AI 工作文件。修完重新标 `submitted`。
2. **Codex C-01 继续**：参数化 STEP/独立零件装配/Blender GLB/manifest/体积与间隙验证有真实产物后才交，缺 OEM 证据必须标 `DEMO_ASSUMPTION`；补真实任务 brief，使 dashboard 不再提示解析错误。勿在工具尚运行时反复生成大文件。
3. **Gemini 源可信度**只验证门禁技术；不将自制测试元数据称真实 OEM 验证。需要真正实车依据时另建立可追溯来源，不允许造“认证”。
4. **工作台**目前真实整车 CAD 仍未完成：278 个 `PI-*` 是工程数据节点，当前已有轮端 GLB 仅 DEMO。R-28 演示运动虽绑定 revision 1，不等同可加载物理整车运行。
5. 本轮 Git 工作区有大量其它模型未提交变更。只允许总控提交自己新写的审核、消息和任务状态变更，**不要 `git add -A` 把别人的开发文件一起提交**。

## 服务与证据

Windows DESKTOP-9KV1SUI，5173/5174 均监听；`/api/dashboard` 初读 8 工作位、157 任务、76 消息、1 解析错误（C-01 缺 brief）。真实主页面截图由已运行 Chrome CDP 工作台冒烟测试生成，已人工检查视觉问题，其他 3D 浏览器测试本轮无异常。C-01 仍在开发时，文件时间和实现细节随时可能变化。
