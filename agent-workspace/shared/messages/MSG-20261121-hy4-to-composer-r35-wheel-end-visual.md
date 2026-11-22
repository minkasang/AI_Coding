---
id: MSG-20261121-hy4-to-composer-r35-wheel-end-visual
from: hy4
to: composer-2-5, gpt-6
taskId: R-35
kind: handoff
status: open
subject: R-35 已提交：C-01 轮端材质可读性基线完成；M 策略在该资产上是 no-op，不建议接 feature flag
createdAt: 2026-11-21T22:20:00+08:00
---

## 结论先行（这条会改变你的接入方案）

R-35 已完成并提交（`submitted`，**未自行 `approved`**）。任务书预设「把 R-30 的 M 单变量策略迁到 C-01」，
但开工核资产时该预设不成立：

> **C-01 的 GLB 里 5 个材质是同一档 PBR（metalness 0.72 / roughness 0.34），只有 `baseColorFactor` 不同。
> 生产覆盖值是 0.70 / 0.34，只差 0.02 的 metalness。所以「恢复原生分档」在这个资产上没有对象可恢复。**

实测两臂差异：对比度 **+0.54 ~ +0.71**、均值亮度 **−0.75 ~ −0.93**、边缘梯度 **+0.021 ~ +0.028**。
对照 R-24 的 M 单变量（+12.254），只有 **1/17 ~ 1/20**，属噪声级。

**建议：给 C-01 接页面时不要接 M feature flag。** 开了用户看不出差别，却多一个开关面。

## 可读性现状（可以直接拿去写进验收）

三组关键对在合适机位下都达到 DISTINCT：

| 机位 | 可见零件 | 表观亮度 | 判定 |
|---|---|---|---|
| `full` 整体 | 转向节 / 轮毂 | 170.30 / 196.46 | **ΔL 26.2 → DISTINCT** |
| `full` 整体 | 转向节 / 螺柱 | 170.30 / 186.45 | **ΔL 15.6 → DISTINCT** |
| `full` 整体 | 轮毂 / 螺柱 | 196.46 / 186.45 | ΔL 10.6 → MARGINAL |
| `bearingIsolated` | 外圈 / 内圈 | 192.28 / 212.28 | **ΔL 20.0 → DISTINCT** |
| `hubStack` | 轮毂 / 螺柱 | 184.68 / 169.43 | **ΔL 15.3 → DISTINCT** |

**一个必须写进验收流程的事实**：`full` 整体视图里，轴承外圈与内圈的像素数都是 **0**——
它们被转向节与轮毂完全包住。所以「从整体视图看内外圈是否可区分」这种验收方式**测不到东西**，
必须用隔离或剖切机位。`shot-seg-full.png` 是分割图，能直接看到这一点。

`轮毂 / 螺柱` 在整体视图落到 MARGINAL，成因是尺度不是材质：螺柱合计只占 9.8% 像素，
单颗约 1,700–2,800 px，靠凸起轮廓识别。`hubStack` 正面视图下就升到 DISTINCT 15.3。

## 截图位置（三组机位 A/B 成对）

目录：`viewer/experiments/wheel-end-visual-baseline-v1/results/`

| 用途 | 文件 |
|---|---|
| 整体（现有覆盖 / GLB 原生） | `shot-A-full.png` / `shot-B-full.png` |
| 轴承内外圈 | `shot-A-bearingIsolated.png` / `shot-B-bearingIsolated.png` |
| 轮毂 + 五螺柱 | `shot-A-hubStack.png` / `shot-B-hubStack.png` |
| 分割图（看遮挡） | `shot-seg-full.png`、`shot-seg-bearingIsolated.png`、`shot-seg-hubStack.png` |

A/B 两张图肉眼几乎无法区分——这正是结论本身。

## 若要进一步提升可读性，建议走资产侧

当前五个材质色都在中性灰蓝带内（0.24/0.30/0.36 到 0.65/0.69/0.74），色相几乎相同，全靠亮度分层。
可在 C-01 参数里考虑：

1. 给螺柱更暗的 `baseColor` 或加大头端直径 → 提升整体视图辨识；
2. 给内外圈加入色相分离（现在完全靠亮度）；
3. 整体降低 `baseColor` 亮度：`bearingIsolated` 机位近白比 **0.26**、内圈均值 **212**，偏亮。

**不要**为了可读性去调 metalness / roughness：本资产是单档，调它等于给所有零件同时加同一个偏移，
产生不了零件间对比。

## 接入前你需要知道的两个坑（我踩过了）

1. **必须显式传颜色。** `viewport.js:165` 是
   `mat.color.set(part.color || COLOR[inst.partKey] || '#aec1da')`，
   而 `COLOR` 只有 `hub / bearing / studs`，C-01 的 5 个 `partId` 全部命中兜底 `#aec1da`。
   不传 `part.color`，5 个零件会变成同一个颜色。
   注意 `baseColorFactor` 是**线性**值，`THREE.Color.set('#hex')` 按 **sRGB** 解释，要先编码。

2. **必须传 offset。** `viewport.js:179` 用 `object.position.set(offset...)` 覆盖节点位移，
   而 C-01 把每个实例的位移烘进了 GLB 节点（`PI-30-009-FL-01` = `[0.008, 0, -0.058]`）。
   传 `[0,0,0]` 会让 5 颗螺柱叠到一起。

可直接复用 `viewer/experiments/wheel-end-visual-baseline-v1/c01-seed.mjs`（`buildC01Seed()`），
它已经把这两件事做对，并有单测钉住。

## 验证

- `node --test .../tests/seed-and-readability.test.mjs` → **18/18 PASS**。
- `node .../verify.mjs` → **`FINAL_CHECKS_FAIL=0 / RESULT: PASS`，56 项 PASS / 0 SKIP**。
- 主跑与 `--repeat` 复跑数值逐字节一致。
- 两臂世界矩阵逐值相同；draw call（11/4/8）与三角形（38,488/27,178/8,012）两臂相同；纹理 0。
- 纯逻辑回归 `project-store` 11/11、`camera-follow` 6/6 通过。
  **未跑 browser-smoke**：你正在改 `workbench-v2/index.html` / `styles.css`，此刻跑出来的失败不归本轮，
  等 R-29 返工完再一起验。

## 边界

SwiftShader 软件光栅化，只给像素级可复验截图与 `renderer.info` 计数，**不声称真实 GPU FPS / 帧时间 / 显存**。
C-01 材质为 `DEMO_ASSUMPTION`（`cast steel assumption` 等），不是厂商材料参数或 OEM 认证。
可读性阈值（DISTINCT ≥ 12 / MARGINAL ≥ 6，0–255 亮度单位）是内部相对排序，未做 CIEDE2000 与显示器标定。
本轮**未接入主工作台**，只在隔离页用生产 `EngineeringViewport` 类验证；全程未写 `workbench-v2/` 与 C-01 包。

## 文件

`docs/research/R-35-wheel-end-visual-baseline.md`、`viewer/experiments/wheel-end-visual-baseline-v1/README.md`、
`.../c01-seed.mjs`、`.../readability.mjs`、`.../results/wheel-end-check.json`、`agent-workspace/agents/hy4/reports/R-35.md`。
