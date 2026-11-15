# R-19 · 真实轮端 GLB 的可验证画质 A/B（隔离实验）

> 归属：HY4 / `R-19`（03.21）· 正式报告见 `docs/research/R-19-wheel-end-render-ab.md`
> **本目录不是产品页面。** 用户入口仍只有 `http://localhost:5173/`（车辆工程工作台）与
> `http://localhost:5174/#dispatch`（AI 指挥中心）。本实验**复用 5173 同源路径**，不新开常驻端口，
> 不覆盖 `workbench-v2/`、`viewer/experiments/engineering-viewer/`、`index.html` 或 `src/`。

## 1. 这个实验回答什么

R-14 研究的是程序化轮胎与假 AO 贴片；R-19 换成**项目自身由 CAD→Blender→GLB 生成的轮端装配**
（`/viewer/experiments/engineering-viewer/assets/wheel_hub_assembly.glb`），
针对 V2 工作台里的「过曝、边缘难读、接地太浅、视觉层次差」，给出**可以合入 `workbench-v2/viewport.js` 的具体参数补丁候选**。

### 两条一手发现（决定了变量选择）

1. **GLB 自带的材质分层被 V2 抹平**：GLB 内 `Mat_Part_Bearing = 0.95/0.12`、
   `Mat_Part_Hub = 0.85/0.25`、`Mat_Part_WheelStuds = 0.80/0.50`（metalness/roughness），
   但 `viewport.js:163-170` 把每个 mesh 强制覆盖为统一的 `0.70/0.34`。
   → 恢复资产已有事实，比凭空编造材质数值依据更强、补丁更小。
2. **模型悬在地面上方 54 mm**：GLB `POSITION` 包围盒 y ∈ `[-0.042, 0.045] m`，
   而 `viewport.js` 的 grid 在 `-0.095 m`、ShadowMaterial 地面在 `-0.096 m`。
   叠加 `exposure 1.18` + `HemisphereLight 0.9` + `fill 0.9`，阴影既淡又离体。

## 2. 变量（2×2 全因子）

| 变量 | 0 | 1 | 性质 |
|---|---|---|---|
| **M** 材质层次 | 逐参数复刻 V2：所有 mesh 统一 `metalness 0.70 / roughness 0.34 / envMapIntensity 1.05` | 按 partKey 恢复 GLB 自带 pbrMetallicRoughness；颜色仍用 fixture 的 DEMO 色 | **严格单变量**：只改材质数值 |
| **L** 光/接地 | 逐参数复刻 `viewport.js` | 下表 8 项参数补丁 | **配置包（多参数，非单变量）**，内部各参数贡献本轮不分离 |

L1 参数（全部 `VISUAL_ASSUMPTION`，非厂商光照/材料标准）：

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

`sun.shadow.mapSize` 保持 1024 **不改**（避免显存成本翻 4 倍）；相机 fov、位置方向、GLB、几何法线、材质颜色均不变。

### 三个固定视角

| 视角 | 方向 | 距离 | 观察目的 |
|---|---|---|---|
| `iso` | `(0.92,0.78,1.12)` | 0.485 m | 复刻 V2 `focus()` 的等轴测机位 |
| `top` | `(0.12,1.00,0.18)` | 0.380 m | 法兰盘面、PCD 孔与螺柱的材质层次 |
| `side` | `(0.18,0.30,1.00)` | 0.420 m | 零件厚度、与地面之间的空隙/接触阴影 |

4 组 × 3 视角 = **12 帧固定机位截图**，全部来自同一次页面加载内的不同相机切换。

## 3. 复现

前置：项目根目录 `npm start`（5173 同源服务）；Node ≥ 18；本机 Chrome。

```bash
cd viewer/experiments/render-quality-v2

node run-ab.mjs     # 4 组 × 3 视角 + 4 条反例；自动写指标/截图/补丁
node verify.mjs     # 一致性校验，退出码即结论

# 手动看一组
# http://127.0.0.1:5173/viewer/experiments/render-quality-v2/index.html?l=1&m=1
# 单组重跑：R19_ONLY=l0m0 node run-ab.mjs
```

`run-ab.mjs` 先探测 5173；**若未运行**，会临时启动根 `server.mjs` 并在结束时自动关闭，不留下新的常驻端口。
`CHROME_PATH` 可指定 Chrome；user-data-dir 与缓存显式放 `F:/tmp/r19-chrome/`，**不写 C 盘、不下载素材**。

## 4. 目录

| 文件 | 作用 |
|---|---|
| `index.html` | importmap + 1280×800 固定画布 + 指标输出 `<pre>` |
| `main.js` | 复刻 V2 场景、M/L 开关、3 视角、指标与 PNG 输出、非法输入拒绝 |
| `metrics.js` | ROI 亮度/过曝/标准差/梯度、接地剖面纯计算 |
| `run-ab.mjs` | Chrome headless 驱动、PNG 解码写盘、反例回归、生成 patch |
| `verify.mjs` | 四组三视角、单变量约束、固定机位、反例与补丁一致性校验 |
| `patch-candidate.json` | **可合入 V2 的参数补丁候选**（`PROPOSAL_NOT_APPLIED`） |
| `results/ab-metrics.json` | 四组原始指标（机器生成，不含图片 base64） |
| `results/ab-summary.md` | 12 行对照表（机器生成） |
| `results/negative-cases.json` | 四条反例回归结果 |
| `results/shot-l*m*-{iso,top,side}.png` | 12 帧固定机位截图 |

## 5. 指标口径（`metrics.js` 顶部有同一份说明）

- **luma** = `0.2126R + 0.7152G + 0.0722B`，直接作用于 8-bit 显示编码值，**不做 sRGB→linear 反变换**；
  仅用于组间相对比较，不是物理亮度。
- **模型 ROI**：GLB 包围盒 8 角投影矩形居中缩放 0.85；四组同视角完全一致。
- `clippedRatio`：R/G/B 三通道均 ≥250 的像素比例 → **严格纯白裁切**代理（本项目实测多为 0）。
- `nearWhiteRatio`：luma ≥235 的像素比例 → **发白/高光面积过大**的更敏感代理，对照表采用此列。
- `highlightRatio`：luma ≥205 的像素比例；`edgeGradient`：相邻像素亮度差均值 → 边缘可辨度。
- `lumaStdDev`：ROI 内亮度标准差 → **明暗层次**的代理（不是质感评分）。
- `partRois`：三个零件各自包围盒投影 ROI 的统计量，用于看零件间是否糊成一片。
- **接地接触带**：模型最低点投影下方 20 px 横条，分 32 列；`centerEdgeRatio` <1 表示接触中心更暗。
- **绘制统计**：`renderer.info.render.{calls,triangles}`、`memory.{geometries,textures}`。**不是 FPS。**

## 6. 反例回归

| URL 参数 | 预期 |
|---|---|
| `?l=9` | 显式拒绝「非法 l」，不静默回退基线 |
| `?m=2` | 显式拒绝「非法 m」 |
| `?unit=mm` | 与 `viewport.js:124` 一致，拒绝非米制 GLB |
| `?asset=.../__missing__.glb` | 加载失败必须报错，不得输出伪造指标 |

## 7. 已知限制（不要越过这些边界下结论）

1. **SwiftShader 软件光栅化**：像素结果可复验，但**不是真实显卡**。不产出、不声称任何硬件 FPS、帧时间或显存数字；真实 GPU 表现仍 `OPEN`。
2. **L 是配置包不是单变量**：8 个参数同时改，本轮只能给出「整包效果」，**不能**把改善归因到其中某一个参数。M 是严格单变量。
3. **材质均为演示假设**：GLB 的 pbrMetallicRoughness 数值是资产内的演示材质，**不是厂商材料证据**；
   颜色来自 `wheel-end-demo.json` 的 `DEMO_ASSUMPTION`。不得据此反推真实金属材质、强度或 OEM 尺寸。
4. **groundY/gridY 是按当前 GLB 包围盒推导**：换资产后必须重新计算，不能把 `-0.043` 写死进生产代码。
5. **`preserveDrawingBuffer: true`** 为读像素/导出截图而开，有额外开销，不应成为生产默认配置。
6. **未改几何法线**：R-14 已记录 `toCreasedNormals` 的 1 cm 顶点哈希量化风险与几何释放成本，本轮不触碰。
7. **G0/G1 式极端对照不适用**：本轮是「V2 原样 vs 候选补丁」，不是隔离单一光源；真实工作台还有 UI、选中高亮与拆解状态，未纳入。
8. **无外部素材**：仅项目自身 GLB + 程序化 `RoomEnvironment`，因此无 CC0 许可/文件哈希义务。
9. **未验证**：真实 GPU、多车型、OEM 尺寸、装配干涉、动力学；GLB 本身是 `DEMONSTRATION_PROTOTYPE`。
10. **视觉优劣仍需人工验收**：过曝比、标准差、梯度是**差异指标**，不是「质感评分」。

## 8. 与生产的关系

`patch-candidate.json` 是**候选，不是已合入**。HY4 不修改 `workbench-v2/viewport.js`；
是否采用由总控 GPT-6 与 Composer 2.5 决定，跨模型交接走 `agent-workspace/shared/messages/`。
任何合入都应保留 5173/5174 两常驻入口约定，并补真实 Chrome 点击回归。
