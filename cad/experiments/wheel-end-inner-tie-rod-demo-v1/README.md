# C-06 左前演示拉杆中位基准

以已验收的 C-05 外球柄及 C-01 至 C-04 为同源输入。在 C-01 工装上设置独立的内侧定位座和内球销，给出该中位姿态的内外球心距。所有尺寸和固定工装的位置取自本实验 `parameters.json`，归类为 `DEMO_ASSUMPTION`。

## 复跑

在 `car` 仓库根目录使用项目的 Python 3.13、build123d 和 Git。

```powershell
$c06 = "cad/experiments/wheel-end-inner-tie-rod-demo-v1"
$env:PYTHONDONTWRITEBYTECODE = "1"
$env:OPENBLAS_NUM_THREADS = "1"
$env:OMP_NUM_THREADS = "1"
$built = & ./.venv/Scripts/python.exe "$c06/build_inner_datum.py" build | ConvertFrom-Json
$built
& ./.venv/Scripts/python.exe "$c06/build_inner_datum.py" verify $built.package
& ./.venv/Scripts/python.exe "$c06/selftest.py"
```

`out/c06-<指纹>/` 包含 `inner-pivot-fixture.step`、`inner-ball-datum-pin.step`、`manifest.json` 和 `validation.json`。构建检查所有上游有效输入后才发布。相同指纹复用成品并完整复验。可以用 `build --config <参数文件>` 试验新几何或工装位置，`--out <目录>` 指定输出根。两条生产命令接受 `--steering-package <目录>` 指定 C-05 批准包的同字节副本。C-05 清单及两份 STEP 校验实际 SHA-256，R-27 读取 C-04 已验收的 Git 字节原件。

## 固定方式与复算

定位座用两孔平板表示固定工装，默认两孔 Ø8、孔距 54 mm。定位座的局部原点在盲孔口与球销止挡面的交点，局部 +Z 朝盲孔外，在 C-01 工装根中指向 +X。球销沿局部 −Z 装入。Ø14.2×19 mm 盲孔容纳带导入倒角的 Ø14×18 mm 柄端，径向间隙 0.1 mm，底隙 1 mm。Ø26 止挡环面接触定位座，球面中心位于球销局部 `[0,0,22]` mm。

装入检查逐位置核对定位座、球销及其与同源轮端的实体关系。C-05 转向节衍生件占用原转向节位置，加上外球柄、C-03 两球柄及 C-04 轮辋。工装固定位置和转向器侧的支撑边界为演示假设。定位座里的安装孔表达固定方式，螺栓与车身结构留空。

从实际球销和 C-05 外球柄两个 STEP 球面提取局部球心，再通过工作矩阵转到同一工装根。名义长度为两点的欧氏距离，外到内投影沿 C-02 朝外主轴为负。既有轮辋安装偏移仍由 C-04 提供。

| 设计 | 外球心工装根 mm | 内球心工装根 mm | 内球心工装 Y-up m | 外到内沿主轴 mm | 名义球心距 mm |
| --- | --- | --- | --- | ---: | ---: |
| 默认 | (−27, 112, 24) | (−287, 142, 36) | (−0.287, 0.036, −0.142) | −260 | 262 |
| 向内再移 20 mm | (−27, 112, 24) | (−307, 142, 36) | (−0.307, 0.036, −0.142) | −280 | 281.858120 |

两版共用相同的本地 STEP 几何，由定位座的工装矩阵改变位置。默认定位座原点为 `[-309,142,36]` mm。C-01 工装根右手 +X 向外、+Y 向后、+Z 向上。米制点换基为 `(X,Z,-Y) × 0.001`，单位方向不缩放。矩阵按行存储并乘列向量。C-04 的 +24 mm 轮辋有符号偏移和轮心原样继承。

## R-45 闭合夹具输入

`fixtureId=FIX-C06-FL-TIE-ROD-NEUTRAL`，同一夹具的不同参数版由 `packageId` 及清单哈希标识。Grok 和 DeepSeek 可读取 `neutral.{innerBallCenter,outerBallCenter}.workholdingYUpM`、`nominalCenterDistanceM`、`innerToOuterDirectionYUp`，将其与实际 `sources.c05`、上游 C-01 至 C-04 及 R-27 原件摘要对照。该发布只定义一个 CAD 中位。R-45 的车身硬点、转向驱动和有限行程约束仍需独立验算。

两件实验资产各自使用实验 ID。R-27 的 `PART-20-074`、`PART-20-075` 均为所需、零实例。清单保留内端原始 `DEFERRED`，外端保留专用的 `REQUIRED_BUT_DEFERRED`。R-46 左右子总成候选继续独立。完整拉杆总成、转向器本体、拉杆接合与锁紧、防尘、受载形变及整车配准尚未建模。旧 R-28 继续阻断，`playbackAllowed=false`。
