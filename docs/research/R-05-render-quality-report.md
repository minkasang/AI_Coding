# R-05｜汽车 3D 外观质量与 Web 渲染技术研究（HY4）

> 版本：**v1.0 / SUBMITTED（待总控 GPT-6 审核）** · 2026-11-14 · 负责人：HY4（03.05）
> **取证快照：`2026-11-14 22:32:37 +0800`** · 任务书：`docs/tasks/R-05-render-quality.md`
> 环境：three `0.170.0`（MIT）· cannon-es `^0.20.0`（MIT）· `npm start` 5173 HTTP 200 · Chrome headless + SwiftShader
> 证据分级：`EVIDENCE`（本机实测/源码原文/许可原文）、`ENGINEERING_DERIVATION`（有依据的推导）、`OPEN`（需实测或裁决）
> **边界**：任务书禁止改 `src/`、`node_modules/`、依赖配置与场景。本轮**全程只读源码**，只写任务书允许的三份文档与本人任务卡/回报；所有改进均为建议，未落地实现。

---

## 0. 给非程序员的结论

先纠正一个容易犯的判断：这个项目的渲染配置并不"低档"。它已经开了抗锯齿、电影级色调映射、基于图像的环境光照、摄影棚灯带、软阴影，轮胎甚至用了带绒毛与清漆层的物理材质。**所以"轮毂像玩具"不能归咎于"WebGL 不行"或"缺 HDRI 就行了"。**

把两帧固定镜头的实际画面和代码逐行对上之后，真正的原因集中在三处，而且都不需要换渲染引擎：

1. **边缘太"硬"**：辐条和轮辋是平薄的锐边几何，倒角只有约 2 毫米，在屏幕里几乎只有一两个像素，光线扫过时没有真实金属那种连续滚动的高光边。（`wheelRim.js:6-18, 104-111`）
2. **金属里反射的东西是"白盒子"**：环境光照用的是程序化的白色房间，金属表面反射不出车间、天空或邻近零件；为了让它亮，又把反射强度人为推高，结果是"亮但空"，看起来像镀铬塑料。（`main.js:54-55` + `tire.js:349-365`）
3. **车没有"落地"**：轮胎与展台之间只有一张画着渐变的贴片假阴影，整车模式连这张贴片都没有；真正的阴影又被环境光填平，于是物体像浮在背景上。（`main.js:69, 101-111, 144-149`）

量化后的另一条线索：单个轮胎有 **57–84 个对象、约 4.5–5.6 万三角面**，四个轮胎的展台合计约 **20 万三角、279 次绘制调用下界**；而 57 个对象其实只用了 25 份几何体。这说明更值得先做的是**合并小零件 / 实例化**，而不是迁移到 WebGPU——后者改变的是 GPU 提交方式，不会自动长出倒角、真实反射和接触阴影。

本任务的产出不是"一堆精美参考图"，而是一套能直接派工的东西：**12 条带代码行号的质量审计项及改进顺序、7 类材料的视觉标准、一次只动一类变量的三阶段 A/B 方案、六类性能指标的测量方法、15 项可勾选的视觉验收清单、以及素材许可与渲染后端的决策依据**。所有"看起来更好"的判断都明确标注为待真实 GPU 实测，本轮没有伪造任何 FPS 或显存数字。

---

## 1. 本轮实际做了什么（可复现）

| 步骤 | 命令 / 方法 | 结果 |
|---|---|---|
| 渲染配置逐项取证 | `grep -nE` + `Read` `src/main.js:1-185`、`src/tire.js:240-380`、`src/parts/wheelRim.js:1-140,305-430`、`src/specs.js` | 见 §2 配置表（`EVIDENCE`） |
| 真实几何探针 | `node F:\tmp\r05_geometry_probe.mjs`（只读调用真实 `createTire()`，最小 DOM canvas shim） | 四规格三角数 / mesh 数 / 材质数 / 贴图数 / draw-call 下界（§5，`EVIDENCE`） |
| 固定镜头基线 | Chrome headless `--headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --window-size=1600,1000 --virtual-time-budget=12000 --screenshot=<out>` | `F:\tmp\r05_current_5173.png`（358,810 B）、`F:\tmp\r05_tire_5173.png`（380,230 B，`#mode=tire&tire=0`） |
| 后端能力核实 | `Read` `node_modules/three/src/renderers/webgpu/WebGPURenderer.js:21-46` | `forceWebGL` + WebGL2 回退（§6，`EVIDENCE`） |
| 许可原文核实 | `WebFetch` Poly Haven / ambientCG / Khronos 许可页（2026-11-14） | 见 §8（`EVIDENCE`） |
| 项目治理现状 | `grep '"license"' package.json`、`ls LICENSE* ASSET_PROVENANCE*`、目录存在性 | 见 §8.2（`EVIDENCE`） |

**截图基线的使用限制（必须保留）**：headless SwiftShader 是**软件渲染**，其阴影精度、抗锯齿与各向异性过滤表现与真实 GPU 不同。两帧只用于**构图、缺陷定位与 A/B 流程设计**，不得作为最终画质结论或 FPS 依据。PNG 保存在项目外 `F:\tmp\`，未写入项目资产目录；任何人可用上表命令重新生成，因此不引入未授权二进制资产。

---

## 2. 当前渲染链路的真实盘点（回答"不得泛称 WebGL 质量低"）

| 层 | 现状（源码位置） | 评价 |
|---|---|---|
| 渲染器 | `WebGLRenderer{antialias:true, powerPreference:'high-performance'}`、`setPixelRatio(min(dpr,2))`、`ACESFilmicToneMapping` exp `1.08`、`SRGBColorSpace`、`PCFSoftShadowMap`（`main.js:39-47`） | 基础链路**已到位**，无颜色管理错误 |
| 环境光 | `PMREMGenerator.fromScene(new RoomEnvironment(), 0.04)` → `scene.environment`，`environmentIntensity 1.0`（`:52-56`） | 有 IBL，但内容是程序化白盒，缺高频反射细节 |
| 灯光 | `HemisphereLight 0.58`、`DirectionalLight 2.15`（castShadow，2048²，shadow camera ±9、`bias -0.00035`、`normalBias 0.018`、`radius 3`）、`DirectionalLight 0.85`、`RectAreaLight 3.2 (1.3×3.8)`、`RectAreaLight 2.0 (1.0×3.0)`（`:68-98`） | 摄影棚布光齐备；但 `RectAreaLight` 不投影，主阴影仅一盏方向光 |
| 材质 | `MeshPhysicalMaterial`（casing/tread 有 `sheen / clearcoat`）、`MeshStandardMaterial`（rimLight/bolt/brake/rotor 等）（`tire.js:323-377`） | PBR 参数齐全，但**全部为常数参数**：全库 `normalMap / roughnessMap / aoMap` 零命中 |
| 贴图 | 4 张程序化 `CanvasTexture`：胎侧 1024²（`anisotropy 8`）、刹车盘 512²（`anisotropy 4`）、中心盖 256²、展台 AO 256² | 有细节，但覆盖面积小；金属主表面无贴图 |
| 几何 | 轮辋桶 `LatheGeometry(31 点, 96)`、安装盘 `ExtrudeGeometry(bevel 0.002, 2 段, curveSegments 48)`、辐条 `TriSoup` 非索引三角汤、胎面 `LatheGeometry(pts, 160)`（`wheelRim.js:24-74,104-140,6-18`；`tire.js:64`） | 分段数充足，**但法线是硬边、倒角过小** |
| 阴影 / 接触 | `ground.receiveShadow`、多数零件 `castShadow`；`aoGeo + aoMat` 径向渐变贴片仅用于 `tireStage`（`:101-111, 144-149, 173-175`） | 有阴影，**无真实接触遮蔽**；整车模式无 AO 贴片 |
| 相机 / 构图 | `PerspectiveCamera(36,1,0.05,140)`、`OrbitControls` 距离 0.9–26；背景 `0xf2f0ec`、`Fog(18,52)`；纯色地面 `0xeae7e1` + `GridHelper`（`:50-51,58-65,101-111`） | 常用距离下雾几乎不生效；主体占比小，四周大片留白 |
| 后处理 | 无 EffectComposer / SSAO / GTAO / bloom / DOF；仅全局 `exposure 0.78–1.40` 与 `environmentIntensity 0.55–1.60` 滑块（`:748-751`） | 无后处理链，也无局部调光手段 |
| 可观测性 | `src/main.js` 无 `renderer.info`、无 FPS 计数、无 draw-call 输出 | **无法做量化 A/B**，是本任务最关键的工程缺口 |

**结论（`ENGINEERING_DERIVATION`）**：配置层已完整，短板在**资产内容（倒角/贴图/反射源）、接触关系与构图**，以及**缺少可观测性**。这四类都不需要先换渲染后端。

---

## 3. 核心问题 1：原轮毂为何像"玩具"——质量审计表

> 每行都关联「代码位置 → 可观察表现 → 归因 → 推荐改进顺序」。观察来自固定镜头基线（软件渲染），标注 `OBS`；源码事实标注 `EVIDENCE`；机理解释标注 `DERIVATION`。

| # | 问题 | 源码位置 / 可观察表现 | 归因（DERIVATION） | 顺序 |
|---|---|---|---|---|
| Q01 | **辐条是平薄锐边，无高光滚边** | `wheelRim.js:6-18` `TriSoup` 非索引三角汤 + `computeVertexNormals()` 得面法线；`:104-111` `bevelSize/Thickness = 0.002`、`bevelSegments = 2`。特写帧中辐条呈深色平片，边缘一条硬线 | 0.68 m 外径轮毂上 2 mm 倒角在 1600 px 帧内约 1–2 px，低于产生连续高光的尺度；硬法线使相邻面明暗突变，读作"剪纸" | **P0-3** |
| Q02 | **金属反射内容为空** | `main.js:54-55` `RoomEnvironment`；`tire.js:349-365` `envMapIntensity` 1.3–2.1。特写帧内桶是均匀亮银，看不到环境结构 | 程序化白盒只提供低频亮度；靠推高强度补亮，进一步压掉对比与细节，形成"镀铬塑料" | **P0-2** |
| Q03 | **轮胎未落地 / 假 AO** | `main.js:144-149` `aoGeo(0.68×0.48)` + 径向渐变 `CanvasTexture`、`MeshBasicMaterial{toneMapped:false}`，仅在 `:173-175` 加入 `tireStage`；整车模式无。两帧中轮下只见模糊灰影 | 贴片是 2D 渐变，不随几何/视角/光照变化；真实接触遮蔽应由几何遮蔽或 SSAO 产生 | **P0-1** |
| Q04 | **主阴影被填平且精度不足** | `main.js:71-84` 单方向光 2048² / shadow camera ±9 m ⇒ 约 8.8 mm/texel，`radius 3`；`HemisphereLight 0.58` + `environmentIntensity 1.0` | 大范围阴影贴图分配到 2 m 级物体时分辨率偏低，再被环境光与软半径抹平 | P0-1 |
| Q05 | **材质无空间变化** | 全库 `normalMap/roughnessMap/aoMap` 零命中；金属仅常数 `color/metalness/roughness` | 真实锻铝有车削纹、铸造有砂眼、刹车盘有磨痕方向；常数粗糙度在大面积上必然"平" | P1-4 |
| Q06 | **`rimLight` 过镜面** | `tire.js:351-353` `metalness:1, roughness:0.14, envMapIntensity:2.1`；`wheelRim.js:390` 唇边 `Torus(rr+0.011, 0.0042, 8, 96)` | 近乎镜面的亮边 + 白盒环境，是"玩具镀铬圈"的直接来源；真实轮辋唇多为拉丝/喷粉，粗糙度更高 | P1-4 |
| Q07 | **构图主体偏小、背景无层次** | `main.js:50-51,58,101-111`；整车帧主体约占中部一半，四周大片浅灰留白，UI 面板压四角 | 背景色 `0xf2f0ec` 与地面 `0xeae7e1` 过近，`Fog(18,52)` 在常用距离 <18 时几乎无作用，缺少明暗/景深层次 | P1-5 |
| Q08 | **玩具化配色** | `chassis.js:106-108` 卡钳 `0xc84b31` + `coilSpring.js:165-166` 橙红弹簧，是画面唯一高饱和色 | 高饱和点缀 + 灰黑结构 + 纯白背景，接近模型玩具的视觉语言，而非工业摄影 | P1-5 |
| Q09 | **无后处理接触/环境遮蔽** | `main.js` 无 `EffectComposer`；three r170 已带 `GTAONode` 等（docs 目录） | 缺 SSAO/GTAO/contact shadow，缝隙、螺栓座、辐条根部没有暗部层次 | P2-7 |
| Q10 | **全局调光只有两个滑块** | `main.js:748-751` `toneMappingExposure = 0.78+v*0.62`、`environmentIntensity = 0.55+v*1.05` | 曝光与环境强度被绑在同一滑块上，**A/B 时无法单变量隔离**，这正是必须先补可观测性的原因 | P0-0 |
| Q11 | **字标与徽章放大后糊** | `tire.js:165-223` 胎侧 1024²、`tire.js:259-275` 中心盖 256²（画单个首字母）；`tire.js:405-411` 字标 `transparent:true, depthWrite:false` | 256² 徽章在局部放大帧里分辨率不足；透明贴花无 depthWrite 易与刹车盘穿插 | P2 |
| Q12 | **小件逐件建 mesh** | 探针：单胎 57 mesh / 25 唯一几何；`wheelRim.js:461-484` 螺栓、锥座、六角逐颗 `new Mesh`；`:398` beadlock 24 颗 | 已有几何复用，但实例数仍高；四胎展台 draw-call 静态下界 279，与后续 493 件规模不相称 | P2-6 |

### 3.1 七个维度的归因小结（任务书要求逐项说明）

- **造型 / 拓扑 / 倒角**：Q01、Q06、Q12 —— 主因，**真实几何**才能解决（倒角、圆角、厚度渐变）。
- **材料参数**：Q05、Q06 —— PBR 数值已在合理区间，但缺**空间变化**；加 `roughnessMap/normalMap` 即可，无需换材质模型。
- **尺度 / 比例**：探针给出四种规格外径 631.9–802.8 mm（`EVIDENCE`），尺寸本身自洽；问题是**倒角尺度相对屏幕像素过小**（Q01），不是尺寸错。
- **灯光**：Q04、Q10 —— 布光齐全但主阴影单一、环境光填平、且两个参数耦合无法单变量 A/B。
- **环境反射**：Q02 —— 反射**内容**问题，不是有没有 IBL 的问题。
- **阴影 / 接触关系**：Q03、Q04、Q09 —— 视觉上最"假"的一环，改进成本最低、收益最高。
- **构图说明**：Q07、Q08、Q11 —— 主体占比、背景层次、局部放大可读性。

### 3.2 推荐改进顺序（投入产出比优先，全部为**建议**，本轮未实现）

| 顺序 | 动作 | 为什么排这里 | 可派发的实现任务包 |
|---|---|---|---|
| **P0-0** | 先补可观测性：输出 `renderer.info.render.{calls,triangles}`、FPS 滑窗、固定镜头截图脚本、参数快照 | 没有它，后面每一步都无法判定"是否变好" | 输入 §5 表；输出只读调试面板 + 截图 CLI；验收：同镜头两次运行数值可复现 |
| **P0-1** | 接触阴影：整车模式补接地 AO、缩小 shadow camera 到物体包围盒、评估 contact shadow / SSAO | 无需换渲染器、无需外部资产，观感收益最大 | 输出对照截图 + §5 指标；验收清单 V03/V04 |
| **P0-2** | 反射内容：换真实 HDRI / 自定义摄影棚环境，回调 `envMapIntensity` 到物理合理区间 | 解决"亮但空"；需总控批准引入 CC0 资产 | 输出资产来源登记 + A/B 帧；验收 V09/V10 |
| **P0-3** | 几何倒角：辐条边缘圆角、`bevelSegments` 与尺寸重设、法线策略（平滑组 / 加权法线） | 唯一需要动几何生成的一层，改动面较大 | 输出新旧三角数与特写帧；验收 V01/V02 |
| **P1-4** | 材质空间变化：roughness/normal 贴图、按 §4 分材料 | 依赖 P0-2 的反射内容才能被正确评估 | 输出贴图集 + 许可登记；验收 V07/V08 |
| **P1-5** | 构图：相机预设、背景渐变/地面反射、降低 UI 遮挡 | 不改渲染技术，但影响所有验收截图的可比性 | 输出固定镜头预设表；验收 V13/V14 |
| **P2-6** | 实例化：螺栓 / 散热孔 / beadlock 螺栓改 `InstancedMesh` | 为后续 493 件规模铺路，属性能而非画质 | 输出 draw-call 前后实测；验收 V15 |
| **P2-7** | 后处理 / WebGPU 评估 | 前置全部完成、有真实 GPU 基线后再谈（§6） | 需总控单独立项 |

---

## 4. 核心问题 2：机械零件的可操作视觉标准

> 下列数值为**建议起点（`ENGINEERING_DERIVATION`，待 A/B 实测）**，不是已验证参数，也不是任何真实车型的工程规格。现有代码值取自 `src/tire.js` / `src/specs.js`（`EVIDENCE`）。

| 材料 | 现有实现 | 建议起点 | 必须真实几何 | 可交给贴图 | 验收关注 |
|---|---|---|---|---|---|
| **锻造铝轮辋** | `rim` metalness 0.85–0.96 / roughness 0.20–0.38 / clearcoat 0.42 / envMapIntensity 1.9 | metalness 1.0、roughness 0.25–0.40、去掉或大幅降低 clearcoat（涂漆才用清漆层） | 辐条圆角与厚度渐变、轮唇卷边、螺栓孔倒角、中心孔台阶 | 拉丝方向（anisotropy / normal）、微划痕 | 高光是否随视角连续滚动；反射是否有内容 |
| **铸铝 / 砂铸件** | 无专门材质 | metalness 0.8–1.0、roughness 0.45–0.65 | 分型线、浇冒口残留、加强筋圆角 | 砂眼、橘皮（normal + roughness） | 局部放大是否看得出铸造纹理 |
| **钢制刹车盘** | `rotor` map=512² 程序化车削纹、metalness 0.86 / roughness 0.38；`brake` metalness 0.85 / roughness 0.58 | metalness 1.0、roughness 0.35–0.55，摩擦面与帽区分材质 | 通风槽断面、打孔倒角、盘帽连接、与卡钳的真实间隙 | 同心车削纹、热斑/磨痕方向 | 盘面与卡钳间隙、内侧可见性 |
| **橡胶** | casing/tread `MeshPhysicalMaterial` + `sheen 0.35` / clearcoat 0.06、roughness ≥0.68 | metalness 0、roughness 0.75–0.95、sheen 保留但降低 | 胎纹块、沟槽深度、胎肩圆角、胎侧字标浮雕 | 微纹理、脱模剂不均、轻微色差 | 胎侧不发亮、胎纹有自阴影 |
| **塑料 / 未喷漆件** | `liner`（黑）、`valveCap` 等 Standard | metalness 0、roughness 0.5–0.8 | 卡扣、分型线、加强筋 | 细磨砂 normal | 不出现金属式镜面高光 |
| **镀铬 / 抛光件** | `rimLight` metalness 1 / roughness 0.14 / envMapIntensity 2.1（过镜面） | 收窄使用范围，roughness 0.08–0.20 但**必须配真实反射源** | 边缘圆角 | 无需 | 反射内容是否可辨；不能只靠提亮 |
| **油液 / 润滑表面** | 无 | 薄层 `clearcoat` 或透射，roughness 极低且局部 | 液面边界 | 油污/指纹 roughness | 不得在全车大面积出现 |

**分工原则**：决定**轮廓高光**的（倒角、圆角、孔、槽、胎纹块）必须做进几何；决定**微表面**的（车削纹、砂眼、橡胶微纹、油膜）交给 normal/roughness 贴图。把倒角画进 normal map 在掠射角与轮廓处会立刻穿帮——这正是 Q01 不能靠贴图绕过的原因。

---

## 5. 核心问题 3/4/5：A/B 矩阵、性能预算与可观测性

### 5.1 固定镜头基线（A/B 的前提）

- URL：`http://127.0.0.1:5173/#mode=tire&tire=0`（`main.js:1073-1080` 支持 `mode` / `tire` / `view` hash 参数）。
- 窗口 **1600×1000**、`--virtual-time-budget=12000`、同一 Chrome 版本与同一渲染后端，截图命名带参数快照。
- **必须关闭「轮辋自转」**（`index.html:74`，tire 模式默认 `state.spin=true`），或固定旋转相位；否则两帧不可比。
- 记录每帧：`toneMappingExposure`、`environmentIntensity`、各灯强度、相机 `position/target`、`devicePixelRatio`、GPU 型号、是否 SwiftShader。

### 5.2 三阶段单变量 A/B（任务书要求：先光照、再几何、最后材质）

| 阶段 | 冻结 | 唯一变量 | 建议档位 | 每格记录 |
|---|---|---|---|---|
| **A 摄影棚光照** | 几何、材质、环境贴图 | 主/辅光强度比、曝光、环境强度（**拆开 `main.js:748-751` 的耦合**） | A0 现状 / A1 低环境+硬主光 / A2 高环境+柔主光 | PNG + 参数 + FPS + 15 项清单打分 |
| **B 几何** | A 的最优光照 | 倒角尺寸与段数、辐条圆角、轮辋分段（96 / 64 / 48） | B0 现状 / B1 倒角×2 / B2 圆角辐条 / B3 降分段 | 同上 + 三角数变化 |
| **C 材质与环境** | A+B 冻结 | `RoomEnvironment` → CC0 HDRI；常数材质 → +roughnessMap/normalMap | C0 现状 / C1 换 HDRI / C2 加贴图 / C3 两者 | 同上 + 贴图内存 |

**判定规则**：① 每格只改一类变量；② 用 §6 清单逐项打分 + 同一像素位置的差分图辅助；③ "我觉得更好看"**不算结论**，必须有至少两项可观察指标支持；④ 任一改动若使 draw call / 三角数显著上升，需同时记录性能代价再裁决。

### 5.3 GLB 性能预算：**测量方案**（不预设硬指标）

| 指标 | 采集方法 | 本项目静态基线（探针实测 / 推导） |
|---|---|---|
| 三角数量 | 遍历 `geometry.index.count/3`；运行时用 `renderer.info.render.triangles` | 单胎 **44,944 / 48,468 / 50,964 / 55,844**；四胎展台 **200,220**（推导） |
| 对象数 | `scene.traverse` 计 `isMesh` | 单胎 **57 / 57 / 57 / 84**；四胎展台 **255**（推导） |
| draw calls | `renderer.info.render.calls`（**含阴影 pass**，需分帧记录） | 静态下界 **63 / 63 / 63 / 90**；四胎展台 **279**。口径：单材质 mesh 记 1 次，多材质按 `geometry.groups` 数；仅 3 个多材质 mesh。**非实测值** |
| 加载时间 | `performance.now()` 包围 `GLTFLoader.load` + `LoadingManager.onLoad`，区分下载/解析/上传 | 当前为程序化几何生成，**暂无 GLB 加载路径，不适用** |
| 显存 / 纹理内存 | `renderer.info.memory.{geometries,textures}` + `w×h×4×(4/3)`（mipmap）估算；Chrome `performance.memory` 仅旁证 | 4 张 CanvasTexture：1024² / 512² / 256² / 256²；**未实测** |
| LOD | 近/中/远三档切换并画「距离—三角数—FPS」曲线 | 当前**无 LOD 实现** |

> 探针口径修正记录：初版把单材质 mesh 的 `geometry.groups`（共 172–250 个）也计入 draw call，得到虚高的 229–334；Three.js 仅对材质数组按 group 拆分绘制，修正后为 63–90。**主动记录这次修正，是为了避免把"看起来精确的错误数字"写进下游验收。**

**FPS 采集方案（`PLAN_ONLY`，本轮未实测）**：真实 GPU 上用 `requestAnimationFrame` 滑窗（≥120 帧）统计 p50/p95 帧时，配合 `EXT_disjoint_timer_query_webgl2`（若驱动可用），用 Chrome DevTools Performance 交叉核对；必须记录分辨率、DPR、GPU 型号、是否 SwiftShader、是否开阴影。headless 软件渲染的 FPS 无代表性，故本报告**不给出任何 FPS 数字**。

### 5.4 两个性能档位（明确：**建议待测试**，不是已实测）

| 档位 | 几何 | 贴图 | 阴影 / 环境 | 预期代价 |
|---|---|---|---|---|
| **高画质档** | 保留 96 段轮辋 / 160 段胎面 / 完整倒角；小件 `InstancedMesh` | 1024² 胎侧 + 512² 盘面 + 新增 1K normal/roughness | 2048² 阴影 + 真实 HDRI + 接触遮蔽 | 三角数基本不变，纹理内存与后处理开销上升（`OPEN`） |
| **轻量档** | 轮辋 48–64 段、胎面 96 段、合并小件、无 LOD→加 2 级 LOD | 全部 ≤512²，合并贴图通道 | 1024² 阴影、`RoomEnvironment` 保留 | 三角数与 draw call 下降（`OPEN`，需实测） |

两档均需先有 P0-0 的可观测性才能评估；不得把这两张表当成已验收的配置。

---

## 6. 核心问题 3（续）：WebGL / WebGPU+TSL / Blender 的边界与成本

### 6.1 本地一手证据（three r170 源码）

`node_modules/three/src/renderers/webgpu/WebGPURenderer.js:21-46`（`EVIDENCE`）：

```js
if ( parameters.forceWebGL ) {
    BackendClass = WebGLBackend;
} else {
    BackendClass = WebGPUBackend;
    parameters.getFallback = () => {
        console.warn( 'THREE.WebGPURenderer: WebGPU is not available, running under WebGL2 backend.' );
        return new WebGLBackend( parameters );
    };
}
...
this.library = new StandardNodeLibrary();
```

即 r170 的 `WebGPURenderer` 是**「WebGPU 优先 + WebGL2 自动回退」的双后端**，并绑定 node material / TSL 体系。three 官方文档目录已列出 `TSL`、`GTAONode`、`PostProcessing`、`WebGPU Post-Processing` 等条目；但本轮 `WebFetch` 该 manual 页只取回导航框架，**未取回正文**，因此关于功能对等性的细节一律以本地源码为准，不做超出源码的断言。

### 6.2 为什么不能说"WebGPU 自动等于更好画质"（`ENGINEERING_DERIVATION`）

- WebGPU 改变的主要是 **GPU 提交路径与计算能力**（更低 CPU 提交开销、compute shader / TSL 后处理），不改变**几何倒角、材质微表面、反射源内容、接触遮蔽**——而 §3 的前四项主因恰好全在这些层面。
- 现有瓶颈线索是 **57–84 mesh/胎、279 次 draw-call 下界**（尚未含阴影 pass）。这类 CPU 侧对象数问题，先用 `InstancedMesh` / 几何合并更直接，且两种后端都受益。
- 迁移到 node material / TSL 意味着现有 `MeshStandardMaterial` / `MeshPhysicalMaterial` 参数体系需要重新映射与验证，属于**跨模块架构变更**，须总控裁决。

### 6.3 本项目为何先保留既有 WebGL（建议，交总控）

1. `index.html` 用 importmap 直引 `node_modules/three`，**无打包器**；`package.json` 锁 `three ^0.170.0`。
2. `AGENTS.md:69`：非必要不改动已有可运行的 `src/` 演示模式。
3. `RESEARCH_BASELINE.md:56`：R-05 在前置研究验收前**不启动渲染引擎重构**；`BATCH2 §21` 亦要求继续隔离研究、架构冻结需下一阶段独立验证。
4. A-00 旧车四种演示模式截图/回归门禁尚未完成（`BATCH2 §20`），此时替换渲染器无安全基线。
5. 本项目尚无真实 GPU 的画质/性能 A/B 基线（§5.3），无法证明迁移收益。

**升级触发条件（四条全满足才评估）**：① 有真实 GPU 的固定镜头 A/B 与 FPS/draw-call 基线；② 出现 WebGL 确实无法满足的明确需求（compute、TSL 后处理、大规模实例）；③ 目标浏览器 WebGPU 可用率与 WebGL2 回退路径经实测；④ 独立分支 + 可回滚 Git 提交 + 四种演示模式回归通过。

### 6.4 Blender 离线渲染的位置（`ENGINEERING_DERIVATION`）

项目已装 Blender 5.2.2（`AGENTS.md:64`，R-03 用它做 STL→GLB）。Cycles/Eevee 适合生成**参考级材质/布光对照图**与烘焙贴图，用于给实时渲染定目标；成本是单帧渲染时间、离线管线与资产同步，**不能替代实时 FPS**，也不是浏览器画质的一部分。本轮**未运行 Blender**，不声称已产出离线渲染图。

---

## 7. 核心问题 6：素材来源、许可与治理

### 7.1 已核实来源（2026-11-14 抓取许可原文，`EVIDENCE`）

| 来源 / URL | 许可 | 商用 | 署名 | 关键限制 |
|---|---|---|---|---|
| **Poly Haven** HDRI / PBR / 模型 · https://polyhaven.com/license | **CC0 1.0**（公有领域等效） | 允许 | 不要求 | 站点 ToS 另有限制：logo、用户头像、**示例渲染图**、用户提交渲染、文字等非资产内容仍受版权保护；禁止未经授权的抓取/数据挖掘；API 另有条款 |
| **ambientCG** · https://docs.ambientcg.com/license/ | **CC0 1.0 Universal** | 允许 | 不要求（建议） | 可把原始文件直接放进项目（含游戏）；官方给出署名模板 |
| **Khronos glTF-Sample-Assets** · https://github.com/KhronosGroup/glTF-Sample-Assets | **逐模型不同**；仓库页脚 © 2026 Khronos **CC-BY-4.0** | 视模型而定 | 多数要求 | 官方原文："A summary of the model license is shown in each display, but see the `README.md` in each model's directory for detailed license information." **必须逐个模型核对目录 README** |
| three.js `0.170.0` / cannon-es `^0.20.0`（`package.json`） | **MIT** | 允许 | 需保留许可声明 | 本地实测 |

任务书给定的官方参考（本轮**未逐条复核规范条款**，如实标注）：`https://threejs.org/manual/pages/loading-3d-models.html`、`https://threejs.org/manual/pages/webgpurenderer.html`、`https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html`。

### 7.2 项目治理缺口（`EVIDENCE`）

根目录 `LICENSE`、`LICENSE.md`、`ASSET_PROVENANCE.md`、`docs/ASSET_PROVENANCE.md` **全部 MISSING**；`assets/`、`textures/`、`src/viewer/`、`tests/` 目录不存在。这与 `RP-05 v1.3` 审计中的 `BASE` 项一致。

**本轮做法**：只登记来源、URL、许可与核实日期，**未下载、未复制、未引入任何外部 HDRI / PBR 贴图 / 模型**，符合任务书"不自行复制未知版权模型"。若总控批准引入，建议顺序：① 先补 `ASSET_PROVENANCE.md` 模板（来源 URL / 许可 / 获取日期 / 文件哈希 / 用途）；② 只从 CC0 源取 HDRI 与贴图；③ Khronos 模型仅在逐目录 README 核实后使用；④ 每个引入文件登记哈希，进入 Git。

---

## 8. 15 项视觉验收清单

完整清单见 `docs/research/R-05-visual-qa-checklist.md`：15 项，覆盖不同视角、局部放大、刹车盘与卡钳间隙、内侧细节、金属反射、轮胎色彩，每项含「镜头 / 通过标准 / 失败示例 / 关联代码 / 优先级」。该文件可直接作为后续渲染优化任务的验收附件。

---

## 9. 事实 / 推导 / 未知（明确分级）

**已证实（`EVIDENCE`）**：`src/main.js` / `tire.js` / `wheelRim.js` / `specs.js` 的全部引用行与参数；three `0.170.0` 的 `WebGPURenderer` 回退实现；四规格几何探针数字；两帧截图的文件大小与软件渲染后端；Poly Haven / ambientCG / Khronos 许可原文；three 与 cannon-es 为 MIT；项目无 `LICENSE` / `ASSET_PROVENANCE` / `assets` / `tests`；5173 HTTP 200。

**工程推导（`ENGINEERING_DERIVATION`）**：12 条质量问题的机理解释；"WebGPU 不自动改善画质"的判断；保留 WebGL 的理由与四条升级触发条件；几何探针数字的四胎合计；七类材料的建议参数区间；倒角在 1600 px 帧内的像素量级估算。

**仍未知 / 待实测（`OPEN`，不推测）**：真实 GPU 下的 FPS、draw call（含阴影 pass）、显存/纹理内存、LOD 曲线；倒角与 HDRI 的实际观感收益；`RectAreaLight` 与环境的能量平衡是否需要重新标定；CC0 HDRI 引入后的色调映射是否需调整；WebGPU 在目标浏览器的可用率；Blender 参考图与实时画面的偏差量。

**明确不声称**：未实现任何渲染改进；未修改 `src/` 或依赖；未实测 FPS；未产出离线渲染图；未把软件渲染截图当作最终用户画质；未把 `RP-04` 的 `60 FPS / DrawCall ≤150`（本身是未实测目标，见 RP-05 v1.3）抄成本项目硬指标。

---

## 10. 验证记录

```text
date '+%Y-%m-%d %H:%M:%S %z'                       # 2026-11-14 22:32:37 +0800
grep -nE 'WebGLRenderer|toneMapping|RoomEnvironment|RectAreaLight|...' src/*.js   # 见 §2
node F:\tmp\r05_geometry_probe.mjs                   # 四规格 JSON；口径修正一次（229→63）
Chrome headless --use-angle=swiftshader ... --screenshot=F:\tmp\r05_current_5173.png  # 358810 bytes
Chrome headless ... "http://127.0.0.1:5173/#mode=tire&tire=0"                        # 380230 bytes
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:5173/                      # 200
grep -m1 '"license"' node_modules/three/package.json                                # MIT
ls LICENSE* ASSET_PROVENANCE*                          # 全部 MISSING
WebFetch polyhaven.com/license / docs.ambientcg.com/license / KhronosGroup/glTF-Sample-Assets  # 已核实
```

**一致性自检**：报告中的三角数、mesh 数、draw-call 下界与 `F:\tmp\r05_geometry_probe.mjs` 输出逐项一致；四胎合计 200,220 / 255 / 279 由四个规格相加得出并标注为推导；所有外部许可均附 URL 与核实日期；所有建议性能数字均标 `PLAN_ONLY` 或 `OPEN`。

---

## 11. 给总控的下一步（不超过三项）

1. **先派一个"可观测性 + 接地关系"的小型实现任务**（P0-0 + P0-1）：加 `renderer.info`/FPS 输出与固定镜头截图 CLI、整车模式补接触遮蔽、阴影相机按物体包围盒收紧。它不碰架构、不引外部资产，却能立刻让后续所有 A/B 可判定。验收用本报告 §5.3 与 15 项清单。
2. **裁决是否允许引入 CC0 外部资产**（P0-2）：若批准，先补 `ASSET_PROVENANCE.md` 与 `LICENSE`，再按 §7 只从 Poly Haven / ambientCG 取 HDRI 与贴图，逐文件登记哈希；Khronos 模型须逐目录核对许可。
3. **暂不启动 WebGPU 迁移与渲染引擎重构**：按 §6.3，待真实 GPU A/B 基线、A-00 回归门禁与明确需求三者具备，再由总控单独立项。本报告只给触发条件，不自行决定架构。

---

*报告结束 — R-05 v1.0，`submitted`，等待 GPT-6 审核。不自行标 `approved`；未修改任务书禁止的路径。*
