# wheel-end-visual-baseline-v1 — C-01 轮端材质可读性基线（R-35）

本目录是 **R-35（03.37）** 的隔离实验，回答一个问题：

> **R-30 在旧轮端上验证的「恢复 GLB 原生 PBR」策略，能不能迁移到 C-01 这个新资产？**

结论先放：**不能，因为没有可恢复的东西。** 本资产 5 个材质在 GLB 里是**同一档** PBR
（`metalness 0.72 / roughness 0.34`），生产覆盖值是 `0.70 / 0.34`，只差 `0.02` 的 metalness。
两臂可测差异约为 **−1.2 亮度单位 / 对比度 +0.5~0.7**，属于噪声级，而 R-24 里 M 单变量是 **+12.254**。

**本目录不写 `workbench-v2/`、不写 `viewer/experiments/render-release-v1/`、不写 C-01 包。**

---

## 1. 输入

| 项 | 值 |
|---|---|
| 包 ID | `c01-c5d74da77c293aa5321f` |
| 来源等级 | `DEMO_ASSUMPTION`（**不是** OEM 实测件） |
| GLB | `cad/experiments/vehicle-cad-pipeline-v1/out/c01-c5d74da77c293aa5321f/wheel-end.glb`，733 KB |
| 实例 | 9 个（转向节 1 + 轴承外圈 1 + 轴承内圈 1 + 轮毂 1 + 螺柱 5） |
| 零件定义 | 5 个，各有 `displayColor` |
| 贴图 | 0（纯数值 PBR，没有外部贴图可用于"救"可读性） |
| 单位 | 导出即 m，Y-up（生产 `load()` 强制 `glbUnit === 'm'`，不允许自动缩放） |

GLB 原生材质（全部 `metalness 0.72 / roughness 0.34`，只有 `baseColorFactor` 不同）：

| 材质名 | baseColorFactor（线性） | 对应零件 |
|---|---|---|
| cast steel assumption | 0.24 / 0.30 / 0.36 | 转向节 |
| bearing steel assumption | 0.42 / 0.47 / 0.53 | 轴承外圈 |
| bearing steel assumption.001 | 0.65 / 0.69 / 0.74 | 轴承内圈 |
| forged steel assumption | 0.52 / 0.56 / 0.62 | 轮毂法兰 |
| fastener steel assumption | 0.28 / 0.32 / 0.38 | 螺柱 |

对比 R-30 用的旧轮端（hub `0.85/0.25`、bearing `0.95/0.12`、studs `0.80/0.50`，三档）：
**旧资产有分档可恢复，新资产没有。** 这就是本轮的核心答案。

---

## 2. 文件职责

| 文件 | 职责 |
|---|---|
| `c01-seed.mjs` | manifest + GLB 节点位移 → 生产 `load()`/`sync()` 可消费的 seed（纯逻辑，Node/浏览器共用） |
| `readability.mjs` | 分割图 + 亮度 → 逐零件统计、两两分离度、判定（纯逻辑） |
| `main.js` | 实例化**生产** `EngineeringViewport`，跑 3 机位 × 2 臂 + 分割图 |
| `index.html` | 实验页（importmap 指仓库 `node_modules/three`） |
| `run-checks.mjs` | 驱动 headless Chrome，落 9 张 PNG + 全量 JSON |
| `verify.mjs` | 56 项断言 |
| `tests/seed-and-readability.test.mjs` | 18 项纯逻辑单测 |
| `results/` | `wheel-end-check.json`、`repeat/wheel-end-check.repeat.json`、9 张 PNG |

---

## 3. 复现

前置：5173 在运行（**复用既有同源服务，不新开常驻端口**）。

```bash
# 1) 纯逻辑单测
node --test viewer/experiments/wheel-end-visual-baseline-v1/tests/seed-and-readability.test.mjs

# 2) 主跑（3 机位 × 2 臂 + 分割图 = 9 张 PNG）
node viewer/experiments/wheel-end-visual-baseline-v1/run-checks.mjs

# 3) 确定性复跑
node viewer/experiments/wheel-end-visual-baseline-v1/run-checks.mjs --repeat

# 4) 断言（要求 2) 与 3) 都跑过，否则第 7 组会 SKIP）
node viewer/experiments/wheel-end-visual-baseline-v1/verify.mjs
```

实验页：`http://127.0.0.1:5173/viewer/experiments/wheel-end-visual-baseline-v1/`

---

## 4. 三个必须解释的设计决定

### 4.1 为什么必须显式传颜色

`viewport.js:165` 执行 `mat.color.set(part.color || COLOR[inst.partKey] || '#aec1da')`，
而 `COLOR` 只有 `hub / bearing / studs` 三个键，C-01 的 5 个 `partId` **全部命中兜底色**。
若不显式把 manifest 的 `displayColor` 转成 `part.color`，5 个零件会被刷成同一个颜色，
可读性实验直接失效。

转换按 glTF 语义来：`baseColorFactor` 是**线性**值，`THREE.Color.set('#hex')` 按 **sRGB** 解释，
所以用 `linearToSrgbHex()` 编码，单测回读误差 ≤ 1/255。

### 4.2 为什么 `offset` 必须等于 GLB 节点的 translation

`viewport.js:179` 用 `object.position.set(offset...)` **覆盖**节点自身位移。
C-01 的 GLB 把每个实例的位移烘进了节点（例如 `PI-30-009-FL-01` 是 `[0.008, 0, -0.058]`）。
若传 `offset=[0,0,0]`，5 颗螺柱会全部叠到同一点。所以 seed 直接读 GLB 节点 translation 当 offset，
单测断言二者逐值相等。

### 4.3 为什么用分割图，而不是逐零件隔离渲染

隔离渲染会把其他零件隐藏，**连带去掉相互遮挡与相互投影**，测出的分离度是「上界」，
不能回答「这两个零件放在一起会不会糊」。

本轮改为：
1. 正常渲染一帧外观图；
2. 把每个实例临时换成唯一纯色 `MeshBasicMaterial`，关掉色调映射渲染一帧 → **零件分割图**；
3. 用分割图在外观图上取每个零件的像素集合，算其表观亮度。

分割图与外观图**同机位、同投影、同遮挡关系**，所以测的是真实共视条件下的可读性。
环境网格（地面 / 网格线，没有 `userData.instanceId`）在分割图中被临时隐藏，避免污染。

---

## 5. 机位与两臂

| 机位 | 可见零件 | 用途 |
|---|---|---|
| `full` | 全部 9 个 | 整体观察：转向节 / 轮毂 / 螺柱能否区分 |
| `bearingIsolated` | 轴承外圈 + 内圈 | 局部观察：同轴压装的内外圈能否区分 |
| `hubStack` | 轮毂 + 5 螺柱 | 局部观察：法兰面与螺柱能否区分 |

机位参数全部固定并记录在 JSON 里（`dir`、`dist`、`radius`、`fov 38`、视口 `1280×800`、`pixelRatio 1`）。
渲染常量全部沿用生产：`exposure 1.18`、`ACESFilmic`、`SRGB`、`PCFSoft`、hemi/sun/fill 不动、几何法线不动。

两臂：

| 臂 | metalness | roughness | envMapIntensity |
|---|---|---|---|
| A 现有覆盖 | 0.70 | 0.34 | 1.05 |
| B GLB 原生 | 0.72 | 0.34 | 1.0 |

---

## 6. 结果

### 6.1 A/B 差异：噪声级

| 机位 | 对比度 A→B | 均值亮度 A→B | 边缘梯度 A→B |
|---|---|---|---|
| full | 31.006 → 31.720（+0.714） | 208.90 → 208.15（−0.75） | 1.6313 → 1.6596（+0.028） |
| bearingIsolated | 25.288 → 25.851（+0.563） | 209.70 → 208.94（−0.75） | 0.8538 → 0.8758（+0.022） |
| hubStack | 25.174 → 25.714（+0.540） | 195.98 → 195.05（−0.93） | 1.0226 → 1.0439（+0.021） |

逐零件更直观：**每一个零件的 B 都比 A 暗约 1.2 亮度单位**，无一例外。
这是 metalness 0.70→0.72 的物理结果（漫反射略减、镜面略增），方向一致、幅度均匀，
说明两臂之间**没有结构性问题，也没有可用的收益**。

对照 R-24 的 M 单变量：对比度 **+12.254**、边缘梯度 **+1.7697**。
本轮的 +0.56~+0.71 是它的 1/20 到 1/17。

### 6.2 可读性：靠 `baseColorFactor` 与几何边缘，不靠 PBR

`full`（整体）：

| 零件 | 表观亮度 | 像素占比 |
|---|---|---|
| 转向节 | 170.30 | 30.2% |
| 轮毂 | 196.46 | 58.8% |
| 螺柱（5 颗合计） | 186.45 | 9.8% |
| 轴承外圈 / 内圈 | **0 像素** | 被完全遮挡 |

- 转向节 / 轮毂 **ΔL 26.2 → DISTINCT**
- 转向节 / 螺柱 **ΔL 15.6 → DISTINCT**
- 轮毂 / 螺柱 **ΔL 10.6 → MARGINAL**
- **轴承内外圈在整体视图里根本不可见**——它们被转向节与轮毂完全包住。任何"整体看一眼就判断内外圈"的做法都是错的。

`bearingIsolated`（局部）：

| 零件 | 表观亮度 | 像素 |
|---|---|---|
| 轴承外圈 | 192.28 | 253,076 |
| 轴承内圈 | 212.28 | 163,905 |

- **ΔL 20.0 → DISTINCT**，但判据是内圈的 `baseColor` 更亮（0.65 vs 0.42），不是 PBR 分档。
- 近白比 0.26、内圈均值 212：**两者都在高亮区**，可区分主要靠环形边缘与明暗台阶，
  而不是色相差异（两者都是中性灰蓝）。

`hubStack`（局部）：

| 零件 | 表观亮度 |
|---|---|
| 轮毂 | 184.68 |
| 螺柱（5 颗） | 169.43 |

- **ΔL 15.3 → DISTINCT**。
- 五颗螺柱彼此亮度差达 **18.3**（`160.7` ~ `179.0`）——同一批零件因朝向不同而明暗不一，
  这是正常的物理现象，但意味着"螺柱"不能当成一个均匀色块来设计对比。

### 6.3 结构与成本未变

| 项 | 结果 |
|---|---|
| 两臂世界矩阵 | 三机位全部逐值相同 |
| draw call | full 11 / bearingIsolated 4 / hubStack 8，两臂相同 |
| 三角形 | full 38,488 / bearingIsolated 27,178 / hubStack 8,012，两臂相同 |
| 几何 / 纹理 | 全机位两臂相同；纹理 0 |

---

## 7. 给 Composer 的结论

1. **R-30 的 M 策略在本资产上是 no-op**，不建议为 C-01 接入 feature flag。
   开了也只有 −1.2 亮度 / +0.6 对比，用户看不出差别，却增加一个开关面。
2. **可读性现状可以接受**：三组关键对在合适机位下都达到 `DISTINCT`。
   唯一 `MARGINAL` 的是整体视图下的"轮毂 vs 螺柱"（ΔL 10.6），且原因是螺柱在整体构图里只占 9.8% 像素，
   靠的是凸起轮廓而不是亮度差——这是**取景问题**，不是材质问题。
3. **若还想提升**，杠杆在资产侧，不在视窗侧：
   - 给螺柱更暗的 `baseColor`（现在 0.28 已偏暗，但头端朝相机时仍接近轮毂亮度）；
   - 或给内圈/外圈更强的色相区分（当前五色全在中性灰蓝带内，色相几乎相同）；
   - 降低整体 `baseColor` 亮度，缓解"轴承隔离视图近白比 0.26"的偏亮问题。
4. **不要**为了可读性去调 `metalness` / `roughness`：本资产是单档，调它等于给全部零件同时加同一个偏移，
   无法产生零件间对比。

截图位置（同目录 `results/`）：

- 整体：`shot-A-full.png` / `shot-B-full.png`
- 内外圈：`shot-A-bearingIsolated.png` / `shot-B-bearingIsolated.png`
- 轮毂+螺柱：`shot-A-hubStack.png` / `shot-B-hubStack.png`
- 分割图（证明遮挡关系）：`shot-seg-full.png`、`shot-seg-bearingIsolated.png`、`shot-seg-hubStack.png`

---

## 8. 边界（不得越界声称）

1. **没有真实 GPU 数据**：headless Chrome + SwiftShader 软件光栅化，只支持像素级可复验截图与 `renderer.info` 计数，**不声称**任何真实 GPU 的 FPS / 帧时间 / 显存。
2. **材质是 `DEMO_ASSUMPTION`**：`cast steel assumption` 等名字来自 C-01 的参数化假设，**不是厂商材料参数、OEM 尺寸或计量认证**。
3. **未接入主工作台**：本轮只在隔离页用生产 `EngineeringViewport` 类做验证，页面接入由 Composer 负责。
4. **可读性阈值是工程经验值**：`DISTINCT ≥ 12`、`MARGINAL ≥ 6`（0–255 亮度单位），未做 CIEDE2000、未标定显示器，只用于本资产内部的相对排序。
5. **只验证一个资产**：换 GLB 后原生 PBR 档位可能变化，`verify.mjs` 第 1 组断言必须重跑。
6. **分割图有边缘损失**：抗锯齿边缘像素会被判为背景（不归属任何零件），因此零件像素数略小于真实投影面积；两臂一致，不影响对比。
