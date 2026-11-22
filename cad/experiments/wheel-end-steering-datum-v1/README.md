# C-05 左前转向外端演示基准

用 C-01 转向节原形和 C-02 工装基准生成带一体转向臂的独立衍生件，再用实测锥孔生成配套外球柄。C-03 球心、C-04 轮心及已验收的 R-27 快照作为只读输入。几何与配合采用 `DEMO_ASSUMPTION`。

## 复跑

在 `car` 仓库根目录使用项目已有 Python 3.13、build123d 和 Git。

```powershell
$c05 = "cad/experiments/wheel-end-steering-datum-v1"
$env:PYTHONDONTWRITEBYTECODE = "1"
$built = & ./.venv/Scripts/python.exe "$c05/build_steering.py" build | ConvertFrom-Json
$built
& ./.venv/Scripts/python.exe "$c05/build_steering.py" verify $built.package
& ./.venv/Scripts/python.exe "$c05/selftest.py"
```

默认 `out/c05-<指纹>/` 包含 `knuckle-steering-demo.step`、`steering-outer-ball-stud.step`、`manifest.json` 与 `validation.json`。用 `build --config <参数文件>` 可改变设计参数，`--out <目录>` 可指定输出根。构建对照已验收的 C-01/C-02/C-03/C-04 来源与实际 STEP 摘要。R-27 使用 C-04 已绑定的 Git 原件。包源坐标的几何和静态验算由复跑产生，中间测试变体自动清理。

## 转向臂、锥孔配合与变体

新增腹板与锥孔凸台和 C-01 转向节并成一个有效实体。衍生件沿用原零件局部坐标。复读 STEP 后，与原转向节取实体交集，校验原几何体积被保留。衍生件参加验证时占用原转向节的装配位置，与轮端其余部件逐对检查。外球柄也单独与原转向节检查干涉。

默认锥口中心在衍生件局部 `(112,4,-27)` mm。锥孔沿局部 +Y 朝大端，直径大端 Ø16、小端 Ø12，轴向深 24 mm。按这两条实际 STEP 圆边计算等斜率球柄，间隙 0.08 mm，柄尖保留 0.8 mm，插入沿锥口 Frame 的 −Z，折算成 C-01 工装根则沿 −Z。止挡由球柄 Ø24 肩部压到凸台大端环面。检查实际接触面积、离座 0.05 mm 的间距和越座 0.1 mm 的相交。

| 基准 | 默认 | 臂长变体 |
| --- | --- | --- |
| 配置 `reachMm` | 112 mm | 124 mm |
| 球柄局部球心 | (0, 0, 20) mm | (0, 0, 20) mm |
| 转向节局部球心 | (112, 24, −27) mm | (124, 24, −27) mm |
| C-01 工装根球心 | (−27, 112, 24) mm | (−27, 124, 24) mm |
| 右手 Y-up 工装根球心 | (−0.027, 0.024, −0.112) m | (−0.027, 0.024, −0.124) m |

球心取自回读球面，右手变换按行存储并乘列向量。方向不缩放，点用 `(X,Z,-Y) × 0.001` 转米。本变体验证外端基准随臂长变化，C-03 球心、C-04 轮心、原工装基底与球柄 STEP 字节保持一致。两组各核对 11 对衍生件静态干涉、60 对球柄的五个同轴装入位置及止挡。

## 身份和后续用途

衍生件与球柄使用实验 ID `C05-FL-KNUCKLE-STEERING-DEMO`、`C05-FL-STEERING-OUTER-BALL-STUD`。原转向节 `PI-20-016-FL` 仅是衍生来源。R-27 的所需外拉杆端 `PART-20-075` 属于 `ASSY-20-014`，保持 `REQUIRED_BUT_DEFERRED`、零实例。外球心是运动参考点。两个样件的 `partInstanceId` 均为空。

交接者按 `sources`、`sha256`、`seat.rootFromSeatCad` 和 `outerBallCenter.workholdingYUpM` 核对同一配置。C-03/C-04 的基准已继承至 `motionInput`。内端接口、拉杆长度和整车放置保持空值。球座外壳、紧固与锁止、实际锥度来源、载荷、耐久、运动包络和关节闭合未验证。现有 R-28 保持阻断，C-05 输出 `playbackAllowed=false`。
