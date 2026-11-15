---
id: MSG-20261115-hy4-gpt6-r19-handoff-01
from: hy4
to: gpt-6, composer-2-5
taskId: R-19
kind: handoff
status: open
subject: R-19 已提交；GLB 材质分层被 V2 覆盖、地面悬空 54mm，附带负面信号的最小补丁候选
createdAt: 2026-11-15T16:58:00+08:00
---

## 结论先行

`R-19`（03.21）已完成并置 `submitted`，等待总控审核。报告：`docs/research/R-19-wheel-end-render-ab.md`；
实验：`viewer/experiments/render-quality-v2/`；补丁候选：`patch-candidate.json`（`PROPOSAL_NOT_APPLIED`）。
**HY4 未改 `workbench-v2/`、`viewer/experiments/engineering-viewer/`、`index.html`、`src/` 任何一行**，
全程复用 **5173 同源 GLB**，**未新开常驻端口**，符合 `AGENTS.md §10` 与 `CARLAB_RUNTIME.md`。

**基线漂移已核查**：`workbench-v2/` 的未提交改动是其他工作位 16:37:25–16:37:30 写入的剖切/测距辅助功能
（`localClippingEnabled`、`measureGroup`、`_clipBounds()`、`intersectPointer()`），早于 HY4 16:38 盘点；
`git diff` 未触及本实验引用的任何渲染参数行，HY4 读到的是改后版本，`:26/:33/:34/:42/:46/:53/:56/:166-167`
与实验常量逐项一致。因此 `patch-candidate.json` 的行号与数值对当前文件有效，无需返工。

## 两条一手发现（建议优先处理第 1 条）

1. **GLB 自带材质分层被 V2 抹平**。项目自身 `wheel_hub_assembly.glb` 内
   `Mat_Part_Bearing = 0.95/0.12`、`Mat_Part_Hub = 0.85/0.25`、`Mat_Part_WheelStuds = 0.80/0.50`
   （metalness/roughness），但 `workbench-v2/viewport.js:163-170` 在 `sync()` 里把每个 mesh
   强制覆盖为统一 `0.70/0.34/1.05`。三个零件只剩 DEMO 颜色差异 → 视觉层次差。
   **最小补丁**：不再覆盖 `mat.metalness / mat.roughness`，恢复资产已有分档。
   这是严格单变量、依据来自 GLB 二进制、零绘制成本，建议**先只做这一项**。
2. **零件悬在地面上方 54 mm**。GLB `POSITION` 包围盒 `y ∈ [-0.042, 0.045] m`，
   而 V2 的 grid / ShadowMaterial 地面在 `-0.095 / -0.096 m`；叠加 `exposure 1.18` +
   `HemisphereLight 0.9` + `fill 0.9`，接触阴影又淡又离体。

## 实跑证据

2×2 全因子（M 材质 × L 光/接地配置包）× 3 视角（iso/top/side）= 12 帧固定机位截图。
`node verify.mjs` = `FINAL_CHECKS_FAIL=0 / PASS`；**两次独立全量重跑 108 个数值零差异**。
四条反例（非法 l、非法 m、`unit=mm`、缺失 GLB）4/4 显式拒绝，不静默回退。

基线 `l0m0` → 组合 `l1m1`（iso）：亮度标准差 `29.05 → 40.10 (+38%)`、边缘梯度
`2.79 → 4.11 (+47%)`、高光比 `0.730 → 0.625 (−14%)`；侧视接触带最暗 `118.83 → 105.68`。
四组三视角 `calls=5 / triangles=11,590` 完全一致，shadow map 仍 1024，**未增加几何/纹理/绘制负担**。
两变量近似可加（标准差 `6.19+4.94≈11.05`），可分别派工验收；M 对边缘可辨度贡献更大（+33.3%）。

## 两条负面信号（请一并看，别只挑好看的数字）

1. **`nearWhiteRatio`（luma≥235）反而 0.506 → 0.549（+8.6%）**，**不能声称过曝被消除**。
   同期高光比降 14.3%、标准差升 38%，是亮度分布两极化；且模型 ROI 含大面积浅色背景
   （`#eef3f8` 约 luma 242 ≥235），近白像素有相当部分来自背景，该指标不可单独当过曝判据。
2. **接地机器指标改善很小**：side `centerEdgeRatio` 仅 `0.5663 → 0.5632`。固定 20 px 条带按
   模型最低点投影推导，在 iso/top 视角不一定覆盖阴影核心；**top 视角的 `113.0 → 37.3` 主要反映
   零件暗部，不能当接地证据**。目视阴影确实更深更贴近零件，但口径下轮需改为阴影区 ROI。

其余限制：`clippedRatio`（三通道≥250）实测恒为 0、无区分度；L 是 8 参数**配置包不是单变量**；
材质数值全是 `DEMO_ASSUMPTION`，不是厂商材料证据；SwiftShader 软件光栅化，**没有真实 GPU FPS**；
`preserveDrawingBuffer` 仅实验用途，不应进生产默认；`groundY/gridY` 按当前 GLB 推导，换资产须重算。

## 给 Composer 的集成边界

- `patch-candidate.json` 逐项给出 `viewport.js` 行号、`baseline → proposed`、证据等级与指标依据，
  并明确写 **「不建议无条件全量合入」**：先单独复核 M，再把 L 的 8 项拆小步。
- 若要接入 V2 工作台，请由负责生产页面的工作位执行并补真实 Chrome 点击回归
  （`CARLAB_RUNTIME.md §五`）；HY4 不擅自改生产入口，也不新增顶层导航或第三个常驻端口。
- 实验台 `node run-ab.mjs && node verify.mjs` 可直接当后续单变量验收工具。

## 复现

```bash
cd viewer/experiments/render-quality-v2
node run-ab.mjs     # 复用 5173 同源；未运行时临时启停根 server.mjs 并自动关闭
node verify.mjs
```

## 不做什么

不修改已批准的 `R-14` / `RP-05` / `R-05` 交付物；不修改 `MASTER_PLAN.md`、`VEHICLE_BLUEPRINT_V1.md`、
审核记录或其他模型产物；不自行把 `R-19` 置 `approved`；不替用户传话。HY4 等待总控审核结果。
