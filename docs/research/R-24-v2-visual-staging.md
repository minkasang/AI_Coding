# R-24｜V2 真实轮端 PBR 的小步可验证优化

> 版本：v1.0 / 2026-11-15 · 负责人：HY4（画质研究 · 独立缺口审计）
> 任务书：`docs/tasks/R-24-v2-pbr-visual-staging.md`
> 上游依据：`docs/command/reviews/AUDIT_2026-11-15_BATCH5.md` 判 R-19 `APPROVED（离线视觉对照实验）`，但**不批准整包无条件改生产渲染**，并派发 R-24「V2 真实轮端 PBR 逐步优化」。
> 状态：**SUBMITTED，等待 GPT-6 审核**；所有补丁候选均为 `PROPOSAL_NOT_APPLIED`。

---

## 1. 任务与边界

R-19 发现两件事：V2 把 GLB 自带的 PBR 分层统一覆盖成 `0.70 / 0.34`；地面比 GLB 最低点低约 54 mm。R-19 给出的 8 参数组合包虽然加深了阴影、提高了反差，但 `nearWhiteRatio` 反而上升，因此总控只批准了研究、没有批准合入。

R-24 的任务不是「再找一组更好看的参数」，而是回答一个工程问题：

> **在严守一轮一个变量的前提下，哪些改动值得单独进入生产候选？整包合入的代价到底由谁造成？**

任务书规定的边界，本轮全部遵守：

- 实现独立参数适配 `viewer/experiments/render-staging-v1/`，按配置在**同一 5173 模型**上做 A/B 预览和截图；
- **不修改 `workbench-v2/viewport.js`**，不覆盖 Composer 对 inspect 的改动，不新开常驻端口或永久大导航；
- 优先 M 单变量，之后独立尝试地面高度（**基于 GLB bounds，不写死 `-0.043`**）、环境填光、主光；
- 必须有材料颜色一致性、选中高亮 / 剖切 / 拆解场景无异常、亮度分布 / 接地阴影指标及截图，记录纹理 / 几何 / GPU 成本；
- 至少两种场景、1 组负面处理，参数标 `VISUAL_ASSUMPTION`；SwiftShader 不得冒充真实 RTX FPS。

---

## 2. 开工前基线冻结与并行写入核查

按 `AGENTS.md`、`START_HERE.md`、`PROFILE.md`、`CARLAB_RUNTIME.md` 的顺序读取，并于 `2026-11-15 22:34:23 +0800` 做实时复核（摘要里的 `ready` 不能盲信）：

| 检查项 | 结果 |
|---|---|
| `R-24.md` 状态 | 仍为 `ready`；`render-staging-v1/` 不存在 |
| 最新审核 | 仍是 `AUDIT_2026-11-15_BATCH5.md`（19:01），**无 BATCH6** |
| 22:26–22:28 三条新公共留言 | Composer→DeepSeek（R-20/R-17 对齐）、Grok→DeepSeek（R-23 运动流）、Grok→Qwen4（R-23 绑定），均不改变 R-24 边界 |
| 5173 / 5174 | 均返回 `200`；5175 / 5181 未启用 |
| `git status` | `workbench-v2/` 主文件**无未提交改动**；Composer R-20 的测距/剖切辅助字段（`measureGroup`、`intersectPointer`、`_updateClipBounds`、`getClipBounds`）已在当前基线中 |
| `viewport.js` 参数 | 与 R-19 `patch-candidate.json` 的 baseline 逐项吻合：`exposure=1.18`、hemi `0.9`、sun `2.0`、fill `0.9`、grid `-0.095`、ground `-0.096`、材质 `0.70/0.34/1.05` |

**结论：基线未漂移**，可以沿用 R-19 的负面信号结论；也不必把 Composer 的成果当作「未提交」而回避——本轮全程只读生产文件。

**收尾复核（22:55）**：工作期间 `22:40–22:43` 新增 4 条 DeepSeek 的 R-22 消息（→Qwen4 / Grok / Composer / GPT-6），内容均为身份命名空间 `PI-*` / `INST-*`、`qtyPerCorner` 数量口径、37 个无锚点 Frame、位姿绑定与 10 项待裁决，不涉及材质、光照、接地或 5173 渲染参数，**不改变 R-24 边界**。给 Composer 的那条还重申「按 V2 feature-flag / 隔离 demo 方式接入，不要无条件替换现有工程数据」，与本轮建议一致。审核记录仍只有 BATCH5，无针对 HY4 的新裁决。收尾时 `git diff -- workbench-v2/viewport.js` 为空；5173 / 5174 为 200，5175 / 5181 未监听。

---

## 3. 方法决策：为什么不复刻场景，而是实例化生产类

R-19 的实验页是**逐参数手写复刻** `viewport.js` 的场景搭建。这种做法能控制变量，但有两个隐患：复刻代码会随生产代码漂移；复刻出来的 `sync()` 不是真实工程状态，无法证明「选中高亮 / 剖切 / 拆解时不异常」。

R-24 改为：

```js
import { EngineeringViewport } from '/workbench-v2/viewport.js';
import { createDemoProject } from '/workbench-v2/project-store.mjs';
import { syncAxialClip } from '/workbench-v2/experiments/inspection-bridge/clip-sync.mjs';

const view = new EngineeringViewport(stage, canvas, () => {});
view.renderer.setAnimationLoop(null);   // 停掉生产循环，改为同步渲染
await view.load(seed);                  // 走生产 viewport.js:124 的米制门禁
view.sync(snapshot, catalog);           // 真实选中高亮 / 隔离 / 爆炸
syncAxialClip(view.renderer, view.modelLayer, plane, clipCfg, view.getClipBounds());
applyStaging(view, cfg, ctx);           // 隔离目录内的运行时参数适配
```

`staging-config.mjs` **只在运行时覆写**灯光强度、地面 y、材质 `metalness/roughness`；从未写入 `viewport.js`。好处：

1. A/B 用的是同一份 5173 生产渲染代码与同一份 GLB / fixture；
2. 状态断言来自真实 `ProjectStore` 快照和真实 `clip-sync.mjs`；
3. 反例 `unit=mm` 会命中生产 `viewport.js:124` 自身的拒绝逻辑，而不是实验页自己写的检查。

两个技术细节沿用 R-14 的经验：headless Chrome 的 `--virtual-time-budget` 不推进 `requestAnimationFrame()`，因此停止 `setAnimationLoop` 后同步 `render()` 三次并 `gl.finish()`；为了让 `canvas.toDataURL()` 读到完整帧，预先用 `preserveDrawingBuffer: true` 建立 WebGL2 context，让生产 `WebGLRenderer` 复用它。每帧取 `(5,5)` 背景像素自检（实测恒为 `[238,243,248,255]`），若缓冲区空白即报错。

---

## 4. 实验设计

### 4.1 变量（一轮一个变量）

| 配置 | 变量 | 基线 → 候选 | 证据等级 |
|---|---|---|---|
| `b` | 全基线 | — | 生产代码实测 |
| `M` | 保留 GLB 自带 PBR 分档 | 统一 `0.70 / 0.34` → 按 GLB 逐零件 | GLB 二进制 + `VISUAL_ASSUMPTION` |
| `G` | 地面 / 网格高度 | `-0.096 / -0.095` → `boundsMinY - 0.001` / `+0.001` | GLB 几何实测 |
| `H` | 环境填光 hemi | `0.9 → 0.45` | `VISUAL_ASSUMPTION` |
| `S` | 主光 sun | `2.0 → 2.4` | `VISUAL_ASSUMPTION` |
| `all` | **组合反例**（明确标记，不是候选） | 四项全开 | 仅用于负面信号 |

G 的 `groundY` 与 `gridY` 成对由同一个 bounds 推导，算作「一个接地变量」；其余全是单参数。曝光、fill、PMREM / RoomEnvironment、ACESFilmic、PCFSoft、相机、背景、几何法线全部固定。`parseConfig()` 对非法值、未标记的多变量组合、`groundPolicy=hardcoded` 一律**显式拒绝**，不静默回退基线。

### 4.2 场景与视角

三种真实 V2 检查上下文，各自职责单一，避免「剖切把拆解零件一起切没」导致截图不可读：

| 场景 | `selectedId` | `isolatedId` | `explode` | 剖切 |
|---|---|---|---|---|
| `single` | — | `inst-bearing-001` | 0 | 关 |
| `explode` | `inst-hub-001` | — | 1 | 关 |
| `clip` | `inst-hub-001` | — | 0 | `axis=y, t=0.55` |

视角 `iso`（整体亮度层次）与 `side`（接地阴影），机位与 R-19 完全相同，保证跨轮可比。共 `6 配置 × 3 场景 × 2 视角 = 36 帧`，主跑与复跑各 36 张 PNG。

### 4.3 指标

- 亮度：`meanLuma`、`lumaStdDev`、`highlightRatio`、`nearWhiteRatio`、`clippedRatio`、`edgeGradient`（口径与 R-19 完全一致，见 `metrics.js`）。
- 接地：`contact`（场景可见包围盒最低点投影的 20px 条带，R-19 同口径）与 **`contactGround`（当前实际地面高度投影的条带，本轮新增）**，后者直接观测 G 把地面移到哪里。
- 状态：逐材质记录 `color / baseColor / emissive / emissiveIntensity / visible / clippingPlanes / clipIntersection / envMapIntensity / metalness / roughness`。
- 成本：`renderer.info.render.{calls,triangles}`、`renderer.info.memory.{geometries,textures}`，以及静态 `assetCensus()`（mesh 数、三角形、unique geometry/texture、贴图槽、attribute 名）。

口径警告：`luma` 直接作用于 8-bit 显示编码值，不做 sRGB→linear 反变换；`nearWhiteRatio` 受浅色背景 `#eef3f8`（约 luma 242）污染，**不能单独当过曝判据**；`clippedRatio` 在本项目恒为 0，无区分度。

---

## 5. GLB 与 bounds 实测事实

直接由 `GLTFLoader` 解析项目自身 `wheel_hub_assembly.glb`，不是硬编码表：

| 事实 | 数值 |
|---|---|
| 包围盒 min / max (m) | `[-0.076, -0.042, -0.076]` / `[0.076, 0.045, 0.076]` |
| 尺寸 (m) | `0.152 × 0.087 × 0.152` |
| `boundsMinY` | `-0.042` |
| V2 `groundY` | `-0.096` → **悬空 `0.054 m`（54 mm）**，复现 R-19 结论 |
| G 推导结果 | `groundY = -0.043`、`gridY = -0.042`（留 1 mm 防 z-fighting） |
| GLB 原生 PBR | hub `0.85/0.25`、bearing `0.95/0.12`、studs `0.80/0.50` |
| 静态资产 | 3 mesh、`11,588` 三角形、3 unique geometry、**0 unique texture / 0 贴图槽**、attribute 仅 `position` + `normal` |

### 5.1 一个必须说清的「数值巧合」

本轮 `boundsMinY - 0.001 = -0.043`，**恰好等于 R-19 写死的 `-0.043`，差值 Δ=0**。如果只看数字，很容易误以为 R-24 只是把 R-19 的常量抄了一遍。事实是方法完全不同，且本轮用可复验反例证明：

`verify.mjs` 直接 import 实验页实际使用的同一个 `deriveGroundFromBounds()`，喂不同的虚拟 GLB 包围盒：

| 输入 `boundsMinY` | 输出 `groundY` | 与写死 `-0.043` 的差 |
|---|---|---|
| `-0.042`（本项目 GLB） | `-0.043` | `0`（巧合） |
| `-0.060`（更低的资产） | `-0.061` | `-0.018` |
| `-0.010`（更高的资产） | `-0.011` | `+0.032` |

**结论：生产合入时必须保留 `Box3` 推导逻辑，不得把 `-0.043` 或本轮实测值写成常量**；换任何 GLB 都要重算。任务书里「基于 GLB bounds，而非写死 -0.043」的要求，靠的是这个推导不变量，不是数值差异。此外，bounds 取自「全可见、无爆炸」的完整模型，刻意不用隔离或爆炸后的包围盒，否则地面会跟着场景状态漂移。

---

## 6. 实测结果

`explode/iso` 为亮度口径，`explode/side` 为接地面口径；所有数值来自 `results/run-summary.json`，两次全量重跑逐字节一致。

| case | iso 近白比 | iso 亮度标准差 | iso 边缘梯度 | side 最小亮度 | 地面接触带 min | `groundY` | calls | triangles |
|---|---|---|---|---|---|---|---|---|
| `b` | 0.433843 | 34.108 | 3.1475 | 126.58 | 215.32 | -0.096 | 5 | 11590 |
| `M` | 0.442567 | **46.362** | **4.9172** | 111.61 | 215.32 | -0.096 | 5 | 11590 |
| `G` | 0.470218 | 34.576 | 3.0957 | 126.58 | **124.66** | -0.043 | 5 | 11590 |
| `H` | 0.433464 | 35.064 | 3.2486 | 124.13 | 215.32 | -0.096 | 5 | 11590 |
| `S` | 0.436226 | 33.632 | 3.0982 | 126.80 | 215.32 | -0.096 | 5 | 11590 |
| `all` | **0.479423** | 47.028 | 4.8912 | 111.33 | **88.37** | -0.043 | 5 | 11590 |

**逐变量观察**：

- **M 是唯一显著改善画质的单变量**：亮度标准差 `34.108 → 46.362`（+12.254），边缘梯度 `3.1475 → 4.9172`（+1.7697）。截图里轴承明显变暗并出现集中高光，法兰保持浅色，零件之间的材质层次首次可辨。代价是近白比小幅上升 `+0.008724`。
- **G 确实解决接地**：地面投影接触带最小亮度 `215.32 → 124.66`（-90.66），说明阴影真正落到模型底部；`shot-g-explode-side.png` 里零件贴地、网格线穿过零件下方，与基线 `shot-b-explode-side.png` 的明显悬空形成对照。但 G 也是**近白比上升最多的单变量**（+0.036375），因为抬高的地面/网格进入 ROI。
- **H 与 S 接近噪声**：H 的近白比 `-0.000379`、标准差 `+0.956`、边缘梯度 `+0.1011`；S 的标准差 `-0.476`、边缘梯度 `-0.0493`（甚至略负）。二者不构成进入生产候选的依据。
- **all 组合的近白比升幅最大**（`+0.045580`），再次复现 R-19 的负面信号。

---

## 7. 可分离性分析（本轮相对 R-19 的核心增量）

R-19 只知道「不能整包合入」。R-24 把四个单变量各自相对基线的增量相加，与 `all` 组合的实际增量对比，差值记为交互项：

| 指标 | 四单变量增量之和 | `all` 实际增量 | 交互项 | 相对交互 |
|---|---|---|---|---|
| `isoNearWhiteRatio` | +0.047103 | +0.045580 | -0.001523 | **3.34%** |
| `isoLumaStdDev` | +13.202 | +12.920 | -0.282 | **2.18%** |
| `isoEdgeGradient` | +1.7697 | +1.7437 | -0.026 | **1.49%** |
| `sideMinLuma` | -17.20 | -15.25 | +1.95 | 12.79% |
| `sideContactGroundMinLuma` | -90.66 | -126.95 | -36.29 | **28.59%** |

**亮度类指标近似线性可加（交互项 1.5%–3.3%），四变量同时开启没有额外增益。** 更有决策价值的是两个占比：

- 组合对比度增益的 **94.8%** 来自 M 单变量（`12.254 / 12.920`）；
- M 只承担组合近白代价的 **19.1%**（`0.008724 / 0.045580`），即组合的发白风险是 M 单变量的约 **5.2 倍**。

也就是说，`all` 只是把 M 的收益和 G/H/S 的代价捆在一起卖，并没有额外收益。**接地类指标存在 28.6% 交互**，原因清楚：M 改变阴影强度、G 改变阴影位置，两者相乘，不能简单相加——这也是为什么接地读数必须单独看，不能从亮度指标外推。

---

## 8. 状态一致性与成本

`verify.mjs` 逐字段比对三场景 × 六配置的状态快照：

- `color`、`baseColor`、`emissive`、`emissiveIntensity`、`visible`、`clippingPlanes`、`clipIntersection`、`envMapIntensity` **全部与基线完全相同**；
- 只有 `M` 与 `all` 的 `metalness / roughness` 变化，且逐零件等于 GLB 原生值；`G / H / S` 不碰 PBR；
- `single` 只剩一个 visible instance、无高亮、无剖切；`explode` 有选中高亮（`emissive=#2364bd`, `0.19`）且 `explode=1`、无剖切；`clip` 的 `clippingPlanes=1`、`explode=0`。

因此**材料颜色一致性、选中高亮、剖切、拆解四类场景下均无状态异常**，不只是「看起来还行」。

成本方面：所有配置 `calls=5`、`triangles=11590`、`renderer.info.memory` 一致；静态普查 3 mesh / 11,588 三角形 / 3 unique geometry / **0 外部贴图**。M/G/H/S 都是非几何变量，不增加 draw-call、三角形、几何或纹理资源；本轮也未改几何法线（R-14 已记录 `toCreasedNormals` 的释放成本）。

**性能边界**：全部数据来自 SwiftShader 软件光栅化，只支持像素级可复验截图与 `renderer.info` 计数。本轮**不声称** RTX 5060 或任何真实 GPU 的 FPS、帧时间、显存数字。

---

## 9. 负面回归与一致性校验

6 组负面处理全部被显式拒绝，且拒绝原因命中预期：

| 反例 | 意图 | 结果 |
|---|---|---|
| `m=9` / `g=2` | 非法变量值不得静默回退基线 | 拒绝 |
| `m=1&g=1`（未标 `all`） | 违反一轮一个变量 | 拒绝 |
| `groundPolicy=hardcoded` | 禁止复用 R-19 写死的 `-0.043` | 拒绝 |
| `unit=mm` | 生产 `viewport.js:124` 米制门禁 | 拒绝 |
| 缺失 GLB 路径 | 资产缺失必须显式失败 | 拒绝 |

另有 `all=1` 组合反例作为**数据层负面信号**（近白比 +0.045580），而不是简单报错。

`node verify.mjs` 输出 **`FINAL_CHECKS_FAIL=0 / RESULT: PASS`**，共 131 项 PASS，覆盖：运行结构、单变量纪律、状态一致性、bounds 推导与换资产敏感性、M 数值与成本、截图完整性、负面回归、patch 纪律、组合反例、两次全量重跑确定性（主跑与复跑所有数值 / 状态 / 指标逐字节一致）。

---

## 10. 结论与最小 patch 建议

`viewer/experiments/render-staging-v1/patch-candidate.json` 为 **`PROPOSAL_NOT_APPLIED`**、策略 `ONE_VARIABLE_PER_STEP`，把候选拆成四步而不是一包：

| 顺序 | 变量 | 建议 |
|---|---|---|
| 1 | **M** | **优先单独在 V2 真实 UI 状态复核**：数值来自项目自身 GLB 二进制，严格单变量，几何/纹理/draw-call 成本为零，贡献了 94.8% 的对比度增益 |
| 2 | **G** | 可单独复核接地（阴影贴合有明确证据），但**必须保留 bounds 推导逻辑**，换资产重算；发白代价较大，不宜与 M 同时上 |
| 3 | H | 纯视觉假设，效果接近噪声；须真实 GPU 与 5173 工作台复测后再议，**不建议单独先上** |
| 4 | S | 同上，边缘梯度甚至略负，**不建议** |

给总控的一句话：**只做 M 就能拿到几乎全部画质收益，而发白代价只有整包的约 1/5；R-19 的「不要整包合入」在本轮被量化成了「先只合 M」。** 所有数值仍是 `VISUAL_ASSUMPTION`，不是厂商材料、OEM 尺寸或计量认证；即使 M 优先，也应在 feature flag 下小步启用，并在真实 GPU 上复测。

---

## 11. 未完成、有争议的部分与下一步建议

**明确未做 / 不能声称**：

1. 未修改 `workbench-v2/viewport.js`、5173 生产页或任何其它模型目录；未新开常驻端口（只复用既有 5173 / 5174）。
2. 未在真实 GPU 上复测；SwiftShader 数据不能外推为硬件性能。
3. 未分离 PMREM 环境强度、曝光、fill 光——本轮只测 hemi 与 sun 两个灯；曝光固定 `1.18`，这是 R-19 曾提议改动的参数，本轮刻意不动以保持单变量纪律。
4. 未做几何法线、未做 5173 生产页的 Chrome 点击回归；实验页复用生产类与 fixture，但**不等于**已在生产 UI 里跑过完整交互。
5. `nearWhiteRatio` 受浅色背景污染，`clip` 场景 ROI 因剖切不改变逻辑可见性而略大于实际可见部分；这些是固定口径，组间可比，但不能当物理亮度或质感评分。
6. 组合反例的接地交互项 28.6% 说明 M×G 有耦合；本轮只给出「不要一起上」的建议，没有进一步拆出耦合项。

**下一步建议（交总控 / Composer）**：

1. 若批准 M：只在 `workbench-v2/viewport.js:163-170` 停止覆盖 `mat.metalness / mat.roughness`，用 feature flag 控制；随后按 `CARLAB_RUNTIME.md` 跑 `project-store.test.mjs`、`camera-follow.test.mjs`、`browser-smoke.mjs` 三项回归，并在 5173 真实检查模式下目视确认选中高亮颜色未被破坏。
2. G 另起一轮：把 `deriveGroundFromBounds()` 的逻辑带过去，不要带 `-0.043` 这个数；换资产必须重算。
3. H / S 暂不进入生产候选；如需继续，先在真实 GPU 上做单变量复测。
4. 真实 GPU 复核通过前，不要把这些数值写成「默认渲染配置」或写进任何对外材料说明。

---

## 附：交付文件

| 文件 | 内容 |
|---|---|
| `docs/research/R-24-v2-visual-staging.md` | 本报告 |
| `viewer/experiments/render-staging-v1/README.md` | 实验目录说明、复现命令、口径与边界 |
| `viewer/experiments/render-staging-v1/{index.html,main.js,staging-config.mjs,metrics.js}` | 隔离实验页与参数适配层 |
| `viewer/experiments/render-staging-v1/{run-ab.mjs,verify.mjs}` | A/B 驱动与 131 项校验 |
| `viewer/experiments/render-staging-v1/patch-candidate.json` | 逐变量最小补丁候选，`PROPOSAL_NOT_APPLIED` |
| `viewer/experiments/render-staging-v1/results/run-summary.json` / `.repeat.json` | 主跑与复跑全部数值 |
| `viewer/experiments/render-staging-v1/results/negatives.json` | 6 组负面回归 |
| `viewer/experiments/render-staging-v1/results/shot-*.png`、`results/repeat/*.png` | 主跑 36 帧 + 复跑 36 帧 |
| `agent-workspace/agents/hy4/reports/R-24.md` | 个人回报 |
| `agent-workspace/shared/messages/MSG-20261115-hy4-to-gpt6-r24-handoff.md` | 给总控 / Composer 的交接 |
