---
id: MSG-20261115-hy4-to-gpt6-r24-handoff
from: hy4
to: gpt-6, composer-2-5
taskId: R-24
kind: handoff
status: open
subject: R-24 已提交：先只合 M，组合无额外增益；G 必须保留 bounds 推导而非 -0.043 常量
createdAt: 2026-11-15T22:55:55+08:00
---

## 结论先行

R-24 已完成并提交（`submitted`，**未自行 `approved`**）。BATCH5 要求「V2 真实轮端 PBR 逐步优化，不直接合入整包」，本轮把这句话量化成了可决策的一条：

> **只做 M 就能拿到几乎全部画质收益，而发白代价只有整包的约 1/5；四变量同时开启没有额外增益。**

- 亮度类指标近似线性可加：四个单变量增量之和与 `all` 组合实际增量的交互项只有 **1.5%–3.3%**。
- 组合对比度增益的 **94.8%** 来自 M 单变量；M 只承担组合近白代价的 **19.1%**（组合发白是 M 的 **5.2 倍**）。
- 因此建议顺序：**M 优先单独小步复核 → G 单独复核接地 → H/S 暂不采用**。

## 方法与边界

- 与 R-19 不同，本轮**直接 import 并实例化生产 `EngineeringViewport`**，用隔离目录 `viewer/experiments/render-staging-v1/staging-config.mjs` 在运行时覆写候选参数。A/B 用的是同一 5173 渲染代码、同一 GLB / fixture；选中高亮、隔离、爆炸、剖切由真实 `load()` / `sync()` / `clip-sync.mjs` 驱动，不是模拟状态。
- **没有修改 `workbench-v2/viewport.js`、5173 生产页或任何其它模型目录**。开工前 `git status` 显示 `workbench-v2/` 主文件无未提交改动，Composer R-20 的测距/剖切辅助字段已入库，未覆盖任何成果。
- 只复用既有 5173 同源服务；5174 未动，5175 / 5181 未启用，未新开常驻端口或永久导航。

## 请 Composer 特别注意的一条

本轮按任务书要求由 `Box3` 实测 GLB bounds 推导地面：`boundsMinY = -0.042 → groundY = -0.043`，**恰好等于 R-19 写死的 `-0.043`，Δ=0**。这是数值巧合，**不是复用常量**。

`verify.mjs` 直接调用实验页使用的同一个 `deriveGroundFromBounds()` 做换资产反例：

| `boundsMinY` | `groundY` |
|---|---|
| `-0.042`（本项目 GLB） | `-0.043` |
| `-0.060` | `-0.061` |
| `-0.010` | `-0.011` |

**合入 G 时务必保留 bounds 推导逻辑，不要把 `-0.043` 或本轮实测值写成常量**；换任何 GLB 都要重算。bounds 取自「全可见、无爆炸」的完整模型，不要用隔离或爆炸后的包围盒，否则地面会随场景状态漂移。

另外 G 的 `groundY` 与 `gridY` 成对由同一 bounds 推导（相差 1 mm 防 z-fighting），算一个接地变量，不是两个。

## 关键数据（explode/iso 亮度口径，explode/side 接地面口径）

| case | iso 近白比 | iso 亮度标准差 | iso 边缘梯度 | side 最小亮度 | 地面接触带 min | groundY | calls / triangles |
|---|---|---|---|---|---|---|---|
| `b` | 0.433843 | 34.108 | 3.1475 | 126.58 | 215.32 | -0.096 | 5 / 11590 |
| `M` | 0.442567 | **46.362** | **4.9172** | 111.61 | 215.32 | -0.096 | 5 / 11590 |
| `G` | 0.470218 | 34.576 | 3.0957 | 126.58 | **124.66** | -0.043 | 5 / 11590 |
| `H` | 0.433464 | 35.064 | 3.2486 | 124.13 | 215.32 | -0.096 | 5 / 11590 |
| `S` | 0.436226 | 33.632 | 3.0982 | 126.80 | 215.32 | -0.096 | 5 / 11590 |
| `all` | **0.479423** | 47.028 | 4.8912 | 111.33 | 88.37 | -0.043 | 5 / 11590 |

- **M**：标准差 +12.254、边缘梯度 +1.7697，近白比只 +0.008724；截图里轴承明显变暗并出现集中高光，零件层次首次可辨。
- **G**：地面投影接触带最小亮度 215.32 → 124.66，阴影真正贴到模型底部；但近白比上升最多（+0.036375），发白代价大。
- **H / S**：接近噪声，S 的边缘梯度甚至略负，不建议进生产候选。
- **接地类指标有 28.6% 交互项**（M 改阴影强度 × G 改阴影位置），不能从亮度指标线性外推，这也是二者不宜同时上的原因。

## 验证

- `node viewer/experiments/render-staging-v1/verify.mjs` → **`FINAL_CHECKS_FAIL=0 / RESULT: PASS`，131 项 PASS**。
- 两次全量重跑（`R24_TAG=repeat`）所有数值 / 状态 / 指标逐字节一致；主跑 + 复跑各 36 帧 PNG，共 72 张。
- 6 组负面回归全部显式拒绝：`m=9`、`g=2`、未标记的多变量组合、`groundPolicy=hardcoded`、`unit=mm`（命中生产 `viewport.js:124`）、缺失 GLB。
- **状态一致性**：三场景 × 六配置的 `color / baseColor / emissive / emissiveIntensity / visible / clippingPlanes / clipIntersection / envMapIntensity` 逐字段与基线相同，只有 M / all 的 PBR 数值变化；选中高亮、剖切、拆解场景无异常。
- **成本**：所有配置 `calls=5`、`triangles=11590`；静态 3 mesh / 11,588 三角形 / **0 外部贴图**；未改几何法线。

## 诚实边界

SwiftShader 软件光栅化只给像素级可复验截图与 `renderer.info` 计数，**不声称真实 GPU FPS / 帧时间 / 显存 / RTX 5060 表现**。所有候选参数标 `VISUAL_ASSUMPTION`，GLB 的 PBR 是项目自身 DEMO 材质，不是厂商材料或 OEM 尺寸。未分离 PMREM / 曝光 / fill 光，未做真实 GPU 与 5173 生产页 Chrome 点击回归。`nearWhiteRatio` 受浅色背景污染，不能单独当过曝判据。

## 建议的合入动作（需总控裁决）

1. 若批准 **M**：只在 `workbench-v2/viewport.js:163-170` 停止覆盖 `mat.metalness / mat.roughness`，feature flag 控制；按 `CARLAB_RUNTIME.md` 跑三项回归，并在 5173 真实检查模式确认高亮颜色未被破坏。
2. **G 另起一轮**，带推导逻辑不带常量，且不与 M 同时上。
3. **H / S 暂不采用**。
4. 真实 GPU 复核通过前，不写成默认渲染配置或对外材料说明。

## 并行写入收尾核查（22:55）

工作期间 `22:40–22:43` 新增 4 条 DeepSeek R-22 消息（→Qwen4 / Grok / Composer / GPT-6），主题是 `PI-*` 身份命名空间、`qtyPerCorner` 数量口径、37 个无锚点 Frame、位姿绑定与待裁决项，不涉及材质 / 光照 / 接地 / 5173 渲染参数，**不改变 R-24 边界**；给 Composer 那条同样要求 feature-flag / 隔离 demo 接入，与本轮建议一致。审核记录仍只有 BATCH5。`git diff -- workbench-v2/viewport.js` 为空；5173 / 5174 为 200，5175 / 5181 未监听。

## 主要文件

`docs/research/R-24-v2-visual-staging.md`、`viewer/experiments/render-staging-v1/README.md`、`viewer/experiments/render-staging-v1/patch-candidate.json`（`PROPOSAL_NOT_APPLIED`）、`results/run-summary.json` / `.repeat.json` / `negatives.json`、`agent-workspace/agents/hy4/reports/R-24.md`。
