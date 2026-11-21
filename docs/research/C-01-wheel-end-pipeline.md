# C-01 左前轮端 CAD 生产流水线

主目录为 `cad/experiments/vehicle-cad-pipeline-v1/`。这是 CARLAB 左前轮端的可重建工程样板，资产尺寸、配合、方案与材料类别均为 `DEMO_ASSUMPTION`。

## 复跑

在仓库根目录使用项目已有的 Python 3.13、build123d 0.13.0、Blender 5.2.2、Node 和 `three` 依赖。

```powershell
$cad = "cad/experiments/vehicle-cad-pipeline-v1"
$py = ".\.venv\Scripts\python.exe"
$env:PYTHONDONTWRITEBYTECODE = "1"
$build = (& $py "$cad/pipeline.py" build | ConvertFrom-Json)
$build
& $py "$cad/pipeline.py" verify $build.package
& $py "$cad/selftest.py"
```

当默认 5173 服务运行且使用默认输出目录时，可以单独验证同源资产与 Three.js 加载。

```powershell
node "$cad/check-glb.mjs" "http://localhost:5173/$cad/out/$($build.packageId)/manifest.json"
```

`build` 接受 `--config <参数文件>`、`--out <发布目录>`、`--blender <程序路径>` 和 `--node <程序路径>`。默认参数、装配定义和工具位置取自项目。先将新修订写入发布目录内的暂存区，校验成功后再发布至 `out/c01-<指纹>/`。相同指纹复用并复验已有包。Blender 缓存配置与 STL 中间文件随暂存区移除。生成件由仓库现有 ignore 规则管理。

```text
out/c01-<指纹>/
  parts/PART-*.step   各定义的独立毫米 B-rep
  wheel-end.step     带 AI-* 分组、PI-* 实例名的毫米装配 STEP
  wheel-end.glb      米制、Y 向上的装配网格与节点 extras
  manifest.json      生成参数、配合、身份、坐标和资产 SHA-256
  validation.json    本包的实际几何与 Three.js 检查结果
```

单件独立生成可用 `& $py "$cad/pipeline.py" part PART-30-006 --out "$cad/out/single/PART-30-006.step"`。STEP 是 B-rep 交换格式，参数编辑入口是 `parameters.json` 与 `model.py`。试验另一组尺寸时复制参数文件，以 `--config` 运行整套链路。

## 几何和证据

| 定义 | R-27 样板实例 | CAD 特征 |
| --- | --- | --- |
| `PART-20-016` | `PI-20-016-FL` | 带内肩的阶梯座孔、过渡腹板、上下连接凸台及独立锥孔 |
| `PART-30-001` | `PI-30-001-FL` | 轴承外圈、止挡端面与两道凹形滚道 |
| `PART-30-002` | `PI-30-002-FL` | 单实体表达配对内圈的安装包络，保留轴孔及两道滚道 |
| `PART-30-006` | `PI-30-006-FL` | 轮毂安装面、定心凸缘、五孔法兰、让位缺口和带倒角的空心轴颈 |
| `PART-30-009` | `PI-30-009-FL-01` 至 `-05` | 独立带头车轮螺柱，包含头部座面、简化杆身和端部倒角 |

轴承内外圈间保留滚动体空间，滚动体、保持架、密封和轴向保持件留待后续样板。车轮、制动件、完整摆臂和球头同样待建。本轮球铰项交付的是转向节锥孔及其锥口 Frame，对应球头以 `COUNTERPART_NOT_MODELED` 显示。螺柱及轴承座用正间隙测试静态装配，压装花键、螺纹、载荷、强度、寿命、预紧、密度、质量与整车运动未获验证。

工程拓扑参考项目 RP-04 与 R-08 的独立零件、STEP/STL、Blender 层级和质量门。R-27 提供实例与零件定义，R-11 的资料分级用于界定轴承证据边界。参数文件使用 C-01 演示设计尺寸，材料只记录类别假设。外部格式说明见 [build123d STEP/STL 接口](https://build123d.readthedocs.io/en/stable/import_export.html) 和 [Khronos glTF 2.0](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html)。

## 基准、配合与接续接口

`assembly.json` 独立声明根 Frame、父子安装基准、约束和重复件顺序。每件的局部 B-rep 与局部安装 Frame 从同一组参数生成。用 `rootFromParent × parentFromMount × inverse(childFromMount)` 放置零件。配合分别表达轴线同向、端面落座和内圈中性轴向位置。转向节根原点位于外侧轴承端面与主轴交点。CAD 根坐标轴为 X 向左前轮外侧、Y 向车后、Z 向上，GLB 坐标取 `(X, Z, -Y) × 0.001`。文档中的方向属于样板自身根 Frame。

`manifest.json` 记录 R-27 快照 ID、修订、SHA-256 和规范零件身份。GLB 节点名和 `extras.partInstanceId` 都可定位零件，`AI-*` 节点只用于产品树分组。装配求解关系在 `instances[].parent`，和产品树分组属不同数据字段。独立 STEP 的产品名为 `PART-*`，装配 STEP 的叶节点为 `PI-*`。本轮 build123d STEP 回读以产品名为标签，因此装配 STEP 为螺柱保留独立产品名称。GLB 用五个独立实例共享一份螺柱网格。

Composer 可在现有工程视窗的演示模式从同源 5173 加载 `wheel-end.glb`，通过清单中的 R-27 快照绑定和 GLB 节点的 `partInstanceId` 提供选中与检查。若克隆 GLB 节点到现有视窗，应用清单求解出的相对变换或保留 GLB 既有层级变换。当前可编辑视窗会覆写位置偏移，直接塞入旧资产白名单会丢失 C-01 位置。快照消费最终合入由 DeepSeek 与 Composer 审查，绑定级别为 `DEMO_SUBSTITUTE`。

Grok 可读取局部基准做后续配准。当前 `root.vehiclePlacement` 和 `root.motionBinding` 均为 `null`。在有经审核的刚性配准和一致修订之前，零件资产不能驱动 R-28 运动播放，轮毂角色标记仍按 R-28 输出。相关依赖与交接在公共消息目录。

## 验证定义

- STEP 逐件回读并验证毫米单位、B-rep 有效性、形状体积、边界、质心、实例及父组。用独立 STEP 和清单的局部配合变换复装，对照装配 STEP。
- B-rep 读取轴颈、轴承外径、轴承座、螺柱及法兰孔的圆柱特征，测量名义径向间隙，同时复核上下锥孔的轴线与锥度。所有静态零件对均做实体相交检查。沿预设装入方向抽样检查轴承、台架螺柱及装好螺柱的轮毂；这是离散位置检查，适用范围为该工装装配次序。
- Three.js 的实际 GLTFLoader 从 GLB 二进制中取出网格，检查实例树、共享网格、变换和顶点包围盒，CAD/GLB 的误差上限为 0.10 mm。
- 回归运行一个参数变体，确认轴承宽度和孔径、轮毂 PCD 和轴向垫高、上球铰安装偏移联动；检查不可能的 PCD、负间隙、实体相交、文件篡改和过期快照被拒绝。机器证据见 `agent-workspace/agents/codex-cad/reports/C-01-checks.json`。
