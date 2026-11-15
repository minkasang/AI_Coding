# R-19｜真实轮端 CAD 零件的可验证画质对照（HY4）

> 版本：**v1.0 / SUBMITTED（待总控 GPT-6 审核）** · 2026-11-15 · 负责人：HY4（03.21）
> 任务书：`docs/tasks/R-19-wheel-end-quality-production-proposal.md` · 前置：`R-14`（BATCH4 已 `APPROVED`）
> 实跑取证：`2026-11-15 16:49–16:53 +0800` · 实验代码：`viewer/experiments/render-quality-v2/`
> 环境：three `0.170.0` · **5173 同源资产**（未新增常驻端口）· Chrome headless `--use-angle=swiftshader` · 1280×800
> 证据分级：`EVIDENCE`（GLB 二进制/源码原文/本机实跑）、`ENGINEERING_DERIVATION`（有依据的推导）、`OPEN`（需真实 GPU 或人工裁决）
> **边界**：全程只读 `workbench-v2/`、`viewer/experiments/engineering-viewer/`、`index.html`、`src/`；**未改任何生产文件**。
> 不下载外部素材、不写 C 盘用户目录、**不产出任何真实 GPU FPS / 帧时间 / 显存数字**。

---

## 0. 给非程序员的结论

R-14 研究的是程序化轮胎；这次换成**项目自己用 CAD→Blender 生成的真实轮端装配 GLB**，
并逐参数复刻 V2 工作台 `viewport.js` 的渲染配置，做了 2×2 全因子 × 3 视角的可复验对照。

查代码和 GLB 时发现两个很具体的问题，比"画得不够真实"这种说法有用得多：

1. **GLB 里本来就有材质分层，被 V2 抹平了**。轴承 `metalness 0.95 / roughness 0.12`、
   法兰 `0.85 / 0.25`、螺柱 `0.80 / 0.50`，但 `viewport.js:163-170` 把每个零件强行覆盖成
   统一的 `0.70 / 0.34`。三个零件于是糊成同一片浅蓝白。
2. **零件悬在地面上方 54 mm**。GLB 最低点 `y = -0.042 m`，而 V2 的网格/阴影地面在 `-0.095/-0.096 m`；
   再叠加 `exposure 1.18 + 半球光 0.9 + 补光 0.9`，阴影又淡又离体。

实跑结果（基线 `l0m0` → 组合 `l1m1`，iso 视角）：明暗层次（亮度标准差）**29.05 → 40.10（+38%）**、
边缘可辨度（梯度）**2.79 → 4.11（+47%）**、高光面积（≥205）**0.730 → 0.625（−14%）**；
侧视接触带最暗值 **118.83 → 105.68**，目视阴影明显更深、更贴近零件。
四组三视角的 `calls=5 / triangles=11,590` **完全一致**，没有增加几何、纹理或 shadow map 负担。

**但有一条必须如实说的负面结果**：`nearWhiteRatio`（luma≥235）从 **0.506 升到 0.549**，
不能声称「过曝被消除」。同时高光比下降、标准差上升，说明是**亮度分布两极化**（高光更集中、中间调变暗），
而不是整片更白；且模型 ROI 含大面积浅色背景（`#eef3f8` 约 luma 242），近白像素有相当部分来自背景，
该指标不能单独当过曝判据。

**因此本轮给的不是一个"直接合入"的补丁，而是带风险提示的候选**：
建议**先只合入材质那一项**（严格单变量、依据来自 GLB 二进制、改动最小），
光照/接地那 8 项作为配置包小步复核，不要一次全上。所有数值仍是 `VISUAL_ASSUMPTION`。

---

## 1. 一手发现（`EVIDENCE`）

### 1.1 GLB 自带材质分层被 V2 覆盖

解析 `viewer/experiments/engineering-viewer/assets/wheel_hub_assembly.glb` 的 JSON chunk：

| 节点 | GLB 材质 | metalness | roughness |
|---|---|---|---|
| `Part_Bearing` | `Mat_Part_Bearing` | 0.95 | 0.12 |
| `Part_Hub` | `Mat_Part_Hub` | 0.85 | 0.25 |
| `Part_WheelStuds` | `Mat_Part_WheelStuds` | 0.80 | 0.50 |

`workbench-v2/viewport.js:163-170` 在 `sync()` 里克隆材质后执行
`mat.metalness = 0.70; mat.roughness = 0.34; mat.envMapIntensity = 1.05;`，
三个零件只剩 fixture 里的 DEMO 颜色差异。

> 这些数值是 **GLB 内的演示材质**（`DEMONSTRATION_PROTOTYPE` / `DEMO_ASSUMPTION`），
> **不是厂商材料证据**；本轮只主张「恢复资产已有分档比统一覆盖更有层次」，不主张材料真实性。

### 1.2 地面与模型相差 54 mm

GLB `POSITION` 包围盒 `y ∈ [-0.042, 0.045] m`，整体尺寸 `0.152 × 0.087 × 0.152 m`
（与 `wheel_hub_assembly_metadata.json` 的 152×152×87 mm 一致，Blender 导出已 apply 0.001）。
`viewport.js` 的 `GridHelper` 在 `-0.095 m`、`ShadowMaterial` 地面在 `-0.096 m` → 空隙 `0.054 m`。
配合 `scene.environmentIntensity` 默认 1.0、`HemisphereLight 0.9`、`fill 0.9`，接触阴影被填得很淡。

### 1.3 其余事实

- GLB：4 节点 / 3 mesh / 约 11,588 三角；实验渲染统计 `11,590 triangles`（+2 来自 ground 平面）、`5 calls`。
- V2 seed：`workbench-v2/fixtures/wheel-end-demo.json`，`glbUnit: "m"`，`assetBasis: DEMONSTRATION_PROTOTYPE`。
- 5173 同源可取 GLB（200 / 212,460 B）、three.module.js（200）、fixture（200）→ **无需新端口**。

### 1.4 并行写入核查（防止基线漂移）

开工盘点时 `git status` 显示 `workbench-v2/` 存在未提交改动。复核结果：这些是其他工作位在
`16:37:25–16:37:30` 写入的剖切/测距辅助功能（`localClippingEnabled`、`measureGroup`、
`_clipBounds()`、`intersectPointer()`），**早于** HY4 的 `16:38:05` 盘点与随后对 `viewport.js` 的读取；
HY4 读到的正是**改后版本**（已含上述字段）。`git diff` 未触及本实验引用的任何渲染参数：
`:26 exposure 1.18`、`:33 hemi 0.9`、`:34 sun 2.0`、`:42 fill 0.9`、`:46 grid -0.095`、
`:53 ShadowMaterial #1b3f68 / 0.14`、`:56 ground -0.096`、`:166-167 材质 0.70 / 0.34 / 1.05`
均与实验 `main.js` 的 `V2` 常量逐项一致。

**结论：本轮基线没有因并行写入而过期**，`patch-candidate.json` 的行号按当前文件核对过。
（RP-05 曾因快照过期被判返工，故本轮显式记录这一核查。）

## 2. 实验设计

| 变量 | 0（基线） | 1（改进） | 性质 |
|---|---|---|---|
| **M** 材质层次 | 复刻 V2：统一 `0.70/0.34/1.05` | 按 partKey 恢复 GLB 自带 PBR；颜色仍用 fixture DEMO 色 | **严格单变量**，只改材质数值 |
| **L** 光/接地 | 逐参数复刻 `viewport.js` | 8 项参数补丁（见 §6） | **配置包（多参数，非单变量）**，内部贡献本轮不分离 |

- 四组 `l0m0 / l1m0 / l0m1 / l1m1`，共用同一 GLB、同一物理尺寸、同一组固定机位。
- 三视角：`iso`（V2 `focus()` 方向）、`top`（法兰盘面/PCD 孔）、`side`（厚度与接地空隙）→ **12 帧截图**。
- 固定不变：相机 fov 38 与三机位方向/距离、背景色、ACES + sRGB、PMREM `RoomEnvironment(0.03)`、
  shadow map 1024 与视锥 ±0.6、材质颜色、几何法线、自转（关闭）。
- **未改几何法线**：R-14 已记录 `toCreasedNormals` 的 1 cm 顶点哈希量化风险与几何释放成本，本轮不触碰。
- 反例回归：非法 `l`/`m`、非米制单位、缺失 GLB 必须**显式报错**，不得静默回退基线或输出伪造指标。

## 3. 复现与验证（`EVIDENCE`）

```bash
cd viewer/experiments/render-quality-v2
node run-ab.mjs     # 复用 5173 同源；未运行时临时启停根 server.mjs
node verify.mjs     # 退出码即结论
```

| 项 | 结果 |
|---|---|
| `node --check` 四份脚本 | 全部通过 |
| `node run-ab.mjs` | 4 组 × 3 视角 = 12 帧截图 + 4 条反例，无页面错误 |
| `node verify.mjs` | **`FINAL_CHECKS_FAIL=0 / RESULT: PASS`** |
| **两次独立全量重跑** | 108 个数值逐位比对，**`diffs=0 / REPRODUCIBILITY: PASS`** |
| 单变量约束 | 四组三视角 `calls / triangles / geometries / textures` 全部相同 |
| 固定机位 | 同视角下四组相机与模型 ROI 完全一致（`verify.mjs` 校验） |
| 反例 | `bad-l` / `bad-m` / `bad-unit` / `missing-glb` **4/4 显式拒绝** |
| 人工目视 | 查看 iso/side 基线与改进组截图，无破面、无黑斑、无异常过曝 |

**一次修复**：R-14 已知 headless `--virtual-time-budget` 不推进 `requestAnimationFrame`，
本实验从一开始就采用同步渲染 + `renderer.getContext().finish()`，
并让 GLB 的 `fetch`/`GLTFLoader` 在 20 s 虚拟预算内完成，未再出现首轮卡住的问题。
另补了一个指标：初版 `clippedRatio`（三通道均 ≥250）实测恒为 0、无区分度，
因此新增 `nearWhiteRatio`（luma≥235）作为更敏感的「发白」代理，并在 §5 如实讨论其局限。

## 4. 四组三视角实测结果

完整机器生成表见 `viewer/experiments/render-quality-v2/results/ab-summary.md`，原始数据在 `ab-metrics.json`。

| case | 视角 | 发白比 ≥235 | 高光比 ≥205 | 均亮 | 亮度标准差 | 边缘梯度 | 接地中心/两侧 | 接触带最暗 |
|---|---|---|---|---|---|---|---|---|
| `l0m0` | iso | 0.50579 | 0.73005 | 219.0 | 29.05 | 2.79 | 0.6814 | 143.8 |
| `l0m0` | top | 0.45784 | 0.62638 | 211.0 | 35.18 | 2.59 | 0.7028 | 113.0 |
| `l0m0` | side | 0.30110 | 0.62029 | 205.2 | 36.79 | 2.83 | 0.5663 | 118.8 |
| `l1m0` | iso | 0.54558 | 0.66270 | 214.8 | 35.24 | 3.10 | 0.6256 | 130.0 |
| `l1m0` | top | 0.46377 | 0.53346 | 202.3 | 42.90 | 2.98 | 0.6436 | 95.5 |
| `l1m0` | side | 0.31479 | 0.43703 | 195.3 | 42.64 | 3.39 | 0.5427 | 104.8 |
| `l0m1` | iso | 0.51096 | 0.68115 | 215.1 | 33.99 | 3.72 | 0.6989 | 145.3 |
| `l0m1` | top | 0.45768 | 0.59338 | 198.8 | 51.37 | 4.39 | 0.5262 | 45.8 |
| `l0m1` | side | 0.30018 | 0.57156 | 199.7 | 42.26 | 3.75 | 0.5777 | 117.8 |
| `l1m1` | iso | 0.54932 | 0.62543 | 210.9 | 40.10 | 4.11 | 0.6498 | 132.9 |
| `l1m1` | top | 0.46415 | 0.51328 | 190.4 | 57.28 | 4.77 | 0.4860 | 37.3 |
| `l1m1` | side | 0.32114 | 0.40035 | 189.8 | 47.13 | 4.34 | 0.5632 | 105.7 |

### 4.1 主效应（iso 视角，`ENGINEERING_DERIVATION`）

| 对比 | 亮度标准差 | 边缘梯度 | 高光比 ≥205 | 均亮 |
|---|---|---|---|---|
| 基线 `l0m0` | 29.05 | 2.79 | 0.73005 | 219.0 |
| 仅 L `l1m0` | 35.24 (+21.3%) | 3.10 (+11.1%) | 0.66270 (−9.2%) | 214.8 |
| 仅 M `l0m1` | 33.99 (+17.0%) | 3.72 (+33.3%) | 0.68115 (−6.7%) | 215.1 |
| L+M `l1m1` | 40.10 (+38.0%) | 4.11 (+47.0%) | 0.62543 (−14.3%) | 210.9 |

- **两个变量近似可加、无明显交互**：标准差 `6.19 + 4.94 = 11.13` vs 实测 `11.05`；
  梯度 `0.31 + 0.93 = 1.24` vs 实测 `1.31`。这为「分别派工、分别验收」提供了依据。
- **M 对边缘可辨度的贡献更大**（+33.3% vs L 的 +11.1%），
  与「恢复材质分层使零件不再糊成一片」的归因一致；L 对明暗标准差贡献略大。
- top 视角改善最显著：标准差 `35.18 → 57.28 (+63%)`、梯度 `2.59 → 4.77 (+84%)`，
  因为俯视法兰盘面能同时看到三类材质的反射差异。

### 4.2 接地（侧视，`EVIDENCE` + 口径说明）

| case | side 接触带最暗 | side 中心/两侧 |
|---|---|---|
| `l0m0` | 118.83 | 0.5663 |
| `l1m0` | 104.80 | 0.5427 |
| `l0m1` | 117.80 | 0.5777 |
| `l1m1` | 105.68 | 0.5632 |

**阴影加深几乎全部来自 L**（−14.03），M 几乎不影响接地（−1.03）；目视 `side` 截图也显示
阴影由淡蓝椭圆变成更深、更贴近零件的深灰影（`ShadowMaterial` 颜色由 `#1b3f68` 改中性 `#2b3644`）。

**但必须说明口径局限**：固定 20 px 条带是按「模型最低点投影」推导的，
在 iso/top 视角不一定覆盖阴影核心，因此 `centerEdgeRatio` 改善很小（side 仅 0.5663→0.5632），
`top` 视角的 `113.0 → 37.3` 主要反映零件暗部而非地面阴影，**不应**当作接地证据。
接地结论应以 side 视角的 `minLuma` 与目视截图为主。

### 4.3 绘制成本

四组三视角 `calls=5`、`triangles=11,590`、`geometries` / `textures` 全部相同；
`sun.shadow.mapSize` 保持 1024 **未提高**，以避免 shadow map 显存翻 4 倍。
→ 在**绘制统计层面**没有引入额外几何/纹理/绘制次数负担。
但这**不是** FPS 或显存结论（SwiftShader，未测真实 GPU）。

## 5. 负面与有争议的结果（如实报告）

1. **`nearWhiteRatio` 上升 0.50579 → 0.54932（+8.6%）**，不能声称「过曝被消除」。
   同期 `highlightRatio(≥205)` 下降 14.3%、`lumaStdDev` 上升 38%，说明亮度分布**两极化**
   （高光更集中更亮、中间调变暗），而非整片更白；模型 ROI 含大面积浅色背景
   （`#eef3f8` 约 luma 242 ≥235），近白像素基线 0.5 有相当部分来自背景。
   **该指标不可单独作为过曝判据**，已写入 `patch-candidate.json` 的 `adverseFindings`。
2. **`clippedRatio`（三通道均 ≥250）实测恒为 0**，说明画面没有纯白裁切，
   但也说明这个阈值对本场景无区分度，故改用 `nearWhiteRatio`；两者口径都写进 README。
3. **L 是 8 参数配置包，不是单变量**：只能给出整包效果，**不能**把改善归因到其中某一个参数。
   只有 M 是严格单变量。
4. **接地机器指标改善幅度小**：`centerEdgeRatio` 在 side 仅 −0.5%，
   与目视「阴影明显加深」不完全一致，说明当前条带口径不够敏感，下轮应改用阴影区 ROI 重新测量。
5. **top 视角接地读数不可用**，见 §4.2。

## 6. 可合入 V2 的参数补丁候选（`PROPOSAL_NOT_APPLIED`）

机器可读版本：`viewer/experiments/render-quality-v2/patch-candidate.json`（含 `metricBasis`、
`adverseFindings`、`recommendation`、`caveats`）。**HY4 没有修改 `viewport.js` 任何一行。**

### 6.1 优先建议：只先做材质这一项（最小、最有依据）

`workbench-v2/viewport.js:163-170`：把
```js
mat.metalness = 0.70; mat.roughness = 0.34;
```
改为不再覆盖（或改为按 GLB 原值/配置读取），保留 `mat.color.set(...)` 与 `envMapIntensity`。
恢复后的分档：`hub 0.85/0.25`、`bearing 0.95/0.12`、`studs 0.80/0.50`（取自 GLB 二进制）。
这是**严格单变量**，iso 标准差 +17.0%、梯度 +33.3%，且不增加任何绘制成本。

### 6.2 次步建议：光照/接地配置包小步复核

| 参数 | viewport.js 行 | baseline | proposed |
|---|---|---|---|
| `toneMappingExposure` | :26 | 1.18 | 1.00 |
| `HemisphereLight` intensity | :33 | 0.9 | 0.45 |
| `sun` intensity | :34 | 2.0 | 2.4 |
| `fill` intensity | :42 | 0.9 | 0.55 |
| `ShadowMaterial.color` | :53 | `#1b3f68` | `#2b3644` |
| `ShadowMaterial.opacity` | :53 | 0.14 | 0.34 |
| `ground.position.y` | :56 | -0.096 | -0.043 |
| `grid.position.y` | :46 | -0.095 | -0.042 |

`groundY/gridY` 是**按当前 GLB 包围盒最低点 -0.042 m 推导**的，换资产必须重新计算，不能写死。
`sun.shadow.mapSize` 保持 1024 不改。**全部为 `VISUAL_ASSUMPTION`**，不是厂商光照/材料标准。

### 6.3 明确的合入建议

> **不建议无条件全量合入。** 先在 V2 真实工作台 UI 状态下单独复核 M，
> 再把 L 的 8 项拆成小步复核；所有数值须在真实 GPU 与真实交互状态下重测。
> 是否采用由总控 GPT-6 与 Composer 2.5 决定；任何合入应补真实 Chrome 点击回归，
> 并保留 5173/5174 两常驻入口约定。

## 7. 真实限制与未验证项（`OPEN`）

1. **SwiftShader 软件光栅化**：像素结果可复验，**不是真实显卡**。不产出、不声称任何硬件 FPS / 帧时间 / 显存数字。
2. **`preserveDrawingBuffer: true`** 为读像素/导出截图而开，有额外拷贝开销，不应成为生产默认配置。
3. **材质均为演示假设**：GLB 的 PBR 数值与 fixture 颜色是 `DEMO_ASSUMPTION`，
   不反推真实金属材质、材料强度或 OEM 尺寸；`wheel_hub_assembly_metadata.json` 明确为几何包络/示意。
4. **L 是配置包**，内部各参数贡献未分离；**接地条带口径不敏感**，下轮需阴影区 ROI。
5. **未改几何法线**：R-14 的 `toCreasedNormals` 1 cm 量化与几何释放成本仍是未解决项。
6. **未纳入 V2 真实状态**：UI、选中高亮、爆炸拆解、剖切、ProjectStore 交互均未参与 A/B；
   实验只复刻 `viewport.js` 的场景/光照/材质路径。
7. **未验证**：真实 GPU、多车型、OEM 尺寸、装配干涉、动力学；GLB 是 `DEMONSTRATION_PROTOTYPE`，
   且 `CARLAB_RUNTIME.md` 明确旧四轮演示与 CAD 零件尚未共享真实装配事实源。
8. **视觉优劣仍需人工验收**：标准差、梯度、高光比是**差异指标**，不是质感评分；
   需按 R-05 的 15 项视觉 QA 清单在真实显卡上判定。
9. **无外部素材**：仅项目自身 GLB + 程序化 `RoomEnvironment`，无 CC0 许可/文件哈希义务；
   Chrome 用户数据与缓存显式放 `F:/tmp/r19-chrome/`。

## 8. 给总控 / Composer 的三条建议（不超过三项）

1. **先只合入材质项**（§6.1）：依据来自 GLB 二进制、严格单变量、零绘制成本、改动最小；
   在 V2 真实 UI 下按 R-05 QA 清单 V02/V03 复核。
2. **L 配置包拆小步**，每次只动一两个参数并用本实验台 `node run-ab.mjs && node verify.mjs` 复跑；
   注意 `nearWhiteRatio` 上升与接地条带口径不敏感两条负面信号，不要只挑好看的数字汇报。
3. **若要把实验台接入 V2**，请由负责生产页面的工作位执行，并补真实 Chrome 点击回归；
   HY4 不擅自改 `workbench-v2/`，跨模型交接已写公共消息。

## 9. 交付文件

| 路径 | 内容 |
|---|---|
| `docs/research/R-19-wheel-end-render-ab.md` | 本报告 |
| `viewer/experiments/render-quality-v2/README.md` | 复现、变量表、指标口径、10 条限制 |
| `viewer/experiments/render-quality-v2/{index.html,main.js,metrics.js,run-ab.mjs,verify.mjs}` | 可运行实验与观测/回归工具 |
| `viewer/experiments/render-quality-v2/patch-candidate.json` | **可合入 V2 的参数补丁候选**（含负面信号与建议） |
| `viewer/experiments/render-quality-v2/results/ab-metrics.json` | 4 组 × 3 视角原始指标（机器生成） |
| `viewer/experiments/render-quality-v2/results/ab-summary.md` | 12 行对照表（机器生成） |
| `viewer/experiments/render-quality-v2/results/negative-cases.json` | 4 条反例回归结果 |
| `viewer/experiments/render-quality-v2/results/shot-l*m*-{iso,top,side}.png` | 12 帧固定机位截图 |
| `agent-workspace/agents/hy4/reports/R-19.md` | 本人提交回报 |
| `agent-workspace/agents/hy4/tasks/R-19.md`、`R-19-S01..S04.md` | 状态源（父任务 `submitted`，未自行 `approved`） |
| `agent-workspace/shared/messages/MSG-20261115-hy4-to-gpt6-r19-handoff.md` | 给总控 / Composer 的跨模型交接 |

---

*状态：SUBMITTED，等待总控审核。本轮未实现任何生产渲染改动、未改 5173、未新开常驻端口、未虚构硬件性能数据。*
