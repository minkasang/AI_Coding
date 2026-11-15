# R-24 · V2 轮端 PBR 小步可验证试验（隔离实验）

> 目录：`viewer/experiments/render-staging-v1/`
> 正式报告：`docs/research/R-24-v2-visual-staging.md`
> 任务书：`docs/tasks/R-24-v2-pbr-visual-staging.md`
> 状态：`PROPOSAL_NOT_APPLIED` —— 本目录只做离线对照，**没有修改 `workbench-v2/viewport.js` 或任何 5173 生产页**。

## 1. 这个实验和 R-19 有什么不同

| | R-19（`render-quality-v2/`） | R-24（本目录） |
|---|---|---|
| 场景来源 | 逐参数**手写复刻** `viewport.js` | **直接 import 并实例化生产 `EngineeringViewport`** |
| 状态验证 | 模拟材质克隆，无真实工程状态 | 真实 `load()` / `sync()` / `clip-sync.mjs`，覆盖选中高亮、隔离、爆炸、剖切 |
| 变量 | M 单变量 + L 八参数配置包 | b / M / G / H / S 各为严格单变量 + `all` 组合反例 |
| 地面高度 | 写死 `-0.043` | 由 `Box3` 实测 GLB bounds 推导，换资产自动变化 |
| 结论粒度 | 「不能整包无条件合入」 | 量化出「收益 94.8% 来自 M，代价主要来自 G/H/S」 |

实验页经既有 **5173 同源服务**访问，不新开常驻端口：

```
http://localhost:5173/viewer/experiments/render-staging-v1/index.html?m=1
```

`index.html` 顶部有 b / M / G / H / S / all 六个快捷链接，可直接人工 A/B 预览。

## 2. 复现

```powershell
Set-Location F:\project\cyq\AI_Coding\car
& E:\ARUANJIAN\node\node.exe viewer\experiments\render-staging-v1\run-ab.mjs            # 主跑
$env:R24_TAG='repeat'; & E:\ARUANJIAN\node\node.exe viewer\experiments\render-staging-v1\run-ab.mjs  # 确定性复跑
& E:\ARUANJIAN\node\node.exe viewer\experiments\render-staging-v1\verify.mjs          # 131 项校验
```

其它开关：

- `R24_ONLY=m`：只跑一个配置的冒烟
- `R24_PATCH_ONLY=1`：由已保存的 `results/run-summary.json` 重建 `patch-candidate.json`，不重跑 Chrome
- `CARLAB_PORT`：默认 5173；若 5173 未运行，脚本会临时启动根 `server.mjs` 并在结束时自动关闭，**不留常驻端口**

实测环境：headless Chrome + SwiftShader 软件光栅化，Node v24.15.0，1280×800 / pixelRatio 1 / `--force-device-scale-factor=1`。

## 3. 文件

| 文件 | 作用 |
|---|---|
| `index.html` | importmap、HUD、人工 A/B 快捷链接、指标输出节点 |
| `main.js` | 实例化真实 `EngineeringViewport`；停掉生产 `setAnimationLoop` 后同步渲染 + `gl.finish()`；三场景 × 两视角指标与 PNG |
| `staging-config.mjs` | 变量定义与校验、bounds 推导、GLB 原生 PBR 读取、运行时参数应用、状态/成本普查 |
| `metrics.js` | 与 R-19 同口径的 `PixelBuffer` / `regionStats` / `contactStats` |
| `run-ab.mjs` | Chrome 驱动、PNG 落盘、负面回归、对照表、可分离性分析、patch 生成 |
| `verify.mjs` | 10 组共 131 项一致性校验（含换资产敏感性与两次重跑确定性） |
| `patch-candidate.json` | 逐变量最小补丁候选，`PROPOSAL_NOT_APPLIED` |
| `results/run-summary.json` | 主跑全部数值（PNG 以 base64 剥离，路径另存） |
| `results/run-summary.repeat.json` | 第二次全量重跑，用于确定性比对 |
| `results/negatives.json` | 6 组负面回归结果 |
| `results/shot-*.png` | 主跑 36 帧（6 配置 × 3 场景 × 2 视角） |
| `results/repeat/shot-*.png` | 复跑 36 帧 |
| `results/superseded/` | 2 张 **22:42 冒烟阶段**的废弃截图（当时还是「单部件 + 高亮/爆炸/剖切」两场景设计），已归档，**不属于本轮 36 帧数据，不得用于对照** |

## 4. 变量与场景

**变量（一轮一个变量，`all=1` 是明确的组合反例）**

| 开关 | 变量 | 基线 | 候选 | 证据等级 |
|---|---|---|---|---|
| `m` | M · 保留 GLB 自带 PBR 分档 | 强制 `0.70 / 0.34` | hub `0.85/0.25`、bearing `0.95/0.12`、studs `0.80/0.50` | GLB 二进制 + `VISUAL_ASSUMPTION` |
| `g` | G · 地面/网格高度 | `-0.096 / -0.095` | 由 bounds 推导 `boundsMinY - 0.001` | GLB 几何实测 |
| `h` | H · 环境填光 hemi | `0.9` | `0.45` | `VISUAL_ASSUMPTION` |
| `s` | S · 主光 sun | `2.0` | `2.4` | `VISUAL_ASSUMPTION` |

曝光 `1.18`、fill `0.9`、PMREM / RoomEnvironment、ACESFilmic、PCFSoft、相机、背景全部固定不变。

**场景（真实 V2 检查上下文，各自职责单一）**

| 场景 | 状态 |
|---|---|
| `single` | `isolatedId=inst-bearing-001`，无高亮、无爆炸、无剖切 |
| `explode` | `selectedId=inst-hub-001`、`explode=1`，无剖切 |
| `clip` | `selectedId=inst-hub-001`、剖切 `axis=y, t=0.55`，无爆炸 |

视角：`iso`（整体亮度层次）、`side`（接地阴影），机位与 R-19 一致，保证跨轮可比。

## 5. 指标口径

- `luma = 0.2126R + 0.7152G + 0.0722B`，直接作用于 8-bit 显示编码值，**不做 sRGB→linear 反变换**，只用于组间相对比较。
- `nearWhiteRatio`（luma ≥235）受浅色背景 `#eef3f8`（约 luma 242）污染，**不能单独当过曝判据**；`clippedRatio`（三通道均 ≥250）在本项目恒为 0。
- `lumaStdDev` / `edgeGradient` 是明暗层次代理，不是质感评分。
- `contact`：以场景可见包围盒最低点投影的 20px 条带（与 R-19 同口径）；`contactGround`：以**当前实际地面高度**投影的条带（本轮新增，直接观测 G）。
- ROI 由固定相机 + 同场景包围盒投影算出，组间完全一致；`clip` 场景的剖切不改变逻辑可见性，ROI 会略大于实际可见部分，属固定口径。

## 6. 实测数据摘要（explode/iso 亮度口径，explode/side 接地面口径）

| case | iso近白 | iso亮度标准差 | iso边缘梯度 | side最小亮度 | 地面接触带min | groundY | calls | triangles |
|---|---|---|---|---|---|---|---|---|
| b | 0.433843 | 34.108 | 3.1475 | 126.58 | 215.32 | -0.096 | 5 | 11590 |
| M | 0.442567 | 46.362 | 4.9172 | 111.61 | 215.32 | -0.096 | 5 | 11590 |
| G | 0.470218 | 34.576 | 3.0957 | 126.58 | 124.66 | -0.043 | 5 | 11590 |
| H | 0.433464 | 35.064 | 3.2486 | 124.13 | 215.32 | -0.096 | 5 | 11590 |
| S | 0.436226 | 33.632 | 3.0982 | 126.80 | 215.32 | -0.096 | 5 | 11590 |
| all | 0.479423 | 47.028 | 4.8912 | 111.33 | 88.37 | -0.043 | 5 | 11590 |

`verify.mjs` 结果：`FINAL_CHECKS_FAIL=0 / RESULT: PASS`（131 项），两次全量重跑所有数值逐字节一致。

## 7. 三个必须记住的事实

1. **数值巧合不等于复用常量**：本轮 `boundsMinY=-0.042 → groundY=-0.043`，恰好等于 R-19 写死的 `-0.043`（Δ=0）。`verify.mjs` 直接调用同一推导函数做换资产反例：`-0.060 → -0.061`、`-0.010 → -0.011`，证明它会随 GLB 变化。生产合入时**必须保留推导逻辑**，不得把 `-0.043` 写成常量。
2. **组合没有额外增益**：亮度类指标交互项仅 1.5%–3.3%，四变量近似线性可加；组合对比度增益的 94.8% 来自 M 单变量，而组合的近白上升是 M 单变量的 5.2 倍。
3. **状态无异常**：三场景 × 六配置的 `color / baseColor / emissive / emissiveIntensity / visible / clippingPlanes / clipIntersection / envMapIntensity` 逐字段完全相同；只有 M / all 的 `metalness / roughness` 变化。所有配置 `calls=5`、`triangles=11590`、静态 `uniqueTextures=0`，无几何或纹理成本。

## 8. 边界

- **未改生产**：`workbench-v2/viewport.js`、5173 生产页、其它模型目录均未写入。
- **端口**：只复用既有 5173 / 5174 两个常驻入口；5175 / 5181 未启用。
- **性能**：SwiftShader 只提供像素级可复验截图与 `renderer.info` 计数，**不声称真实 GPU FPS / 帧时间 / 显存 / RTX 5060 表现**。
- **真实性**：所有候选参数标 `VISUAL_ASSUMPTION`；GLB 的 PBR 数值是项目自身 DEMO 材质，不是厂商认证材料，也不是 OEM 尺寸或计量认证。
- **未覆盖**：真实 GPU 复测、PMREM 环境强度 / 曝光 / fill 光分离、几何法线（R-14 已记录成本）、5173 生产页 Chrome 点击回归。
