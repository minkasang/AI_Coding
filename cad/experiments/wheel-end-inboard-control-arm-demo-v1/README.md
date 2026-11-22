# C-07 左前双摆臂内侧演示枢轴

在 C-01 同一工装上放置上下两个双耳定位座。以实际 STEP 的两档圆孔中面中心定义各自的枢轴。从通过验收的 C-03 球面读外球心，从 C-06 实际中位继承转向内外球心和 262 mm 参考距离。新增几何及位置均为 `DEMO_ASSUMPTION`。

## 复跑

在 `car` 仓库根目录使用项目的 Python 3.13、build123d 和 Git。

```powershell
$c07 = "cad/experiments/wheel-end-inboard-control-arm-demo-v1"
$env:PYTHONDONTWRITEBYTECODE = "1"
$env:OPENBLAS_NUM_THREADS = "1"
$env:OMP_NUM_THREADS = "1"
$built = & ./.venv/Scripts/python.exe "$c07/build_pivot_locators.py" build | ConvertFrom-Json
$built
& ./.venv/Scripts/python.exe "$c07/build_pivot_locators.py" verify $built.package
& ./.venv/Scripts/python.exe "$c07/selftest.py"
```

`out/c07-<指纹>/` 包含 `upper-pivot-locator.step`、`lower-pivot-locator.step`、`manifest.json` 和 `validation.json`。默认使用已验收的 C-06 包，依赖链核验 C-01 至 C-06 实际摘要及 Git 中获准的 R-27 原件。可指定同字节的 C-06 副本 `--inner-package <目录>`。用 `build --config <文件>` 改条件，`--out <目录>` 定输出根。验收变体在临时目录重建，测试后清理。

## 定位方法

两个定位座各为独立单位毫米的单实体。内侧桥梁连着前后两耳，两孔从同一条本地轴加工。局部 +X 朝轮外侧，+Z 由前耳指向后耳，+Y 由右手关系决定。孔壁的实际圆柱面以及每档两端整圆从 STEP 回读；每档取两个端圆中心的中点作为支持点。工装根的方向由两个实测支持点的差向量归一化。代码核对每档的同轴、端面间距、跨两档的极性、轴线独立性和到外球心的非零径向距离。

`parameters.json` 记录从实测 C-03 外球心到内轴中心的设计偏移。上轴根中心为 (−216, 0, 120) mm，下轴为 (−251, 0, −100) mm。轴沿工装 +Y 向后，上轴每后移 100 mm 上升 8 mm，下轴每后移 100 mm 下降 5 mm。默认孔径分别为 Ø16、Ø18 mm。两根无限延伸轴线最短距离 35 mm，夹角 7.436326°。

| 轴与支持点 | 工装根 mm | 右手 Y-up 工装根 m |
| --- | --- | --- |
| 上前 | (−216, −60.805732, 115.135541) | (−0.216, 0.115135541, 0.060805732) |
| 上后 | (−216, 60.805732, 124.864459) | (−0.216, 0.124864459, −0.060805732) |
| 下前 | (−251, −78.901435, −96.054928) | (−0.251, −0.096054928, 0.078901435) |
| 下后 | (−251, 78.901435, −103.945072) | (−0.251, −0.103945072, −0.078901435) |

根坐标 +X 外、+Y 后、+Z 上。点转换为 `(X,Z,-Y) × 0.001`，方向仅作换基，矩阵按行存储并乘列向量。上、下 C-03 球心到内轴最短距离分别为 195.448809、231.622296 mm，供后续闭合核对。上轴跨度由 122 改为 136 mm 的变体仅改变上定位座和前后点，轴线、外球心、下定位座 STEP 以及 C-06 中位保持一致。

两定位座分别与同源轮端的 15 个实体核对静态距离和体积相交，再互查一次。默认上、下定位座距离同源实体的最小值分别约 82.992、98.833 mm，两定位座之间为空隙约 169.045 mm。这些量用于本次固定摆放的几何检查。摆臂杆件、衬套、轴销、定位座在车身上的实际支撑、受载和运动包络均待验证。

## 给 Grok 与 DeepSeek

查验 `sources`、`sha256`、`fixtureId=FIX-C07-FL-SLA-INBOARD` 和两个 STEP。沿上、下 `locators.<side>.supports.front/rear.workholdingYUpM` 取枢轴点，单位向量由 `axis.workholdingYUp` 给出。同一行 `sameSourceOuterBall` 绑 C-03 实测球面。转向中位和轮心继承在 `motionInput`。点和坐标为实验夹具输入，完整受限行程要由运动解算独立验证。

定位座为实验资产，`partInstanceId` 为空。R-27 上、下摆臂身份仅作为参考来源，内外拉杆的原延期状态照旧。整车配准、有限行程和播放标记保持未验收，旧 R-28 继续阻断。
