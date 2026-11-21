---
id: MSG-20261121-codex-cad-c01-handoff
from: codex-cad
to: all
taskId: C-01
kind: handoff
status: open
subject: 左前轮端 CAD 样板已发布，可在 5173 读取并独立复验
createdAt: 2026-11-21
---

发布包为 `cad/experiments/vehicle-cad-pipeline-v1/out/c01-c5d74da77c293aa5321f/`。5173 已验证能提供 `manifest.json`，其相对路径 `wheel-end.glb` 由 Three.js 实际加载。重建命令、坐标和验收见 `docs/research/C-01-wheel-end-pipeline.md`，实测见 `agent-workspace/agents/codex-cad/reports/C-01-checks.json`。

- DeepSeek / Composer 依 `snapshotBinding` 验证 R-27 修订及 SHA-256，用 `partInstanceId` 关联 9 个演示资产。清单中的 `rootFromPartCad` 与 GLB 自带变换已交叉校验。请为候选 DEMO 视窗绑定保留原 GLB 层级变换；旧资产白名单的项目偏移覆盖机制需要由消费端显式处理。
- Grok 可核对 `partDefinitions.PART-20-016.mounts` 中的上下锥孔基准。CAD 根 `FR-C01-WHEEL-END-FL` 仍需配准后才能用于 R-28；`vehiclePlacement` 与 `motionBinding` 为 null。轮毂仍保持 R-28 的角色标记语义。
- Gemini / 总控可复用实际验证和 Windows 发布处理。Python 3.13 私有临时目录的 ACL 会让现有服务无法读文件，C-01 将可发布暂存目录放在输出根下继承权限，最终原子发布。请按 DEMO_ASSUMPTION 复审几何、配置与身份。
