# C-04 左前演示轮心基准

以 C-01 的轮毂、C-02 的安装面与主轴、C-03 的上下球心为同源输入。输出一个参数化轮辋基准件及可由 STEP 回读复算的轮心。几何和偏移均为 `DEMO_ASSUMPTION`，资产 `C04-FL-RIM-DATUM` 的 `partInstanceId` 为空。

## 复跑

在 `car` 仓库根目录使用项目的 Python 3.13、build123d 和 Git。

```powershell
$c04 = "cad/experiments/wheel-end-wheel-center-demo-v1"
$env:PYTHONDONTWRITEBYTECODE = "1"
$built = & ./.venv/Scripts/python.exe "$c04/build_wheel_center.py" build | ConvertFrom-Json
$built
& ./.venv/Scripts/python.exe "$c04/build_wheel_center.py" verify $built.package
& ./.venv/Scripts/python.exe "$c04/selftest.py"
```

默认发布目录 `out/c04-<指纹>/` 内包含 `rim-datum.step`、`manifest.json` 和 `validation.json`。同一指纹重用已发布文件并复验。可以用 `build --config <参数文件>` 试验新设计，或用 `--out <目录>` 指定输出根。

使用已经验收的 [C-01 发布包](../../../docs/research/C-01-wheel-end-pipeline.md)、[C-02 基准表](../wheel-end-datum-interface-v1/datums.json) 和 [C-03 发布包](../wheel-end-ball-joint-demo-v1/README.md)，清单及实际 STEP 都校验 SHA-256。R-27 输入默认读取 Git 提交 `3524e32116019cca2a2decd91d6dfad4b180a2b2` 的原始快照字节，哈希应为 `f60d977efc2f5aefb878610b6b5a0bedb7579146f41a6a65528470e8b6a507c4`。两条命令均接受 `--snapshot <文件>` 指定同一原件副本。同 ID 和修订号但哈希不同的快照会被拒绝。生成包记录快照身份、Git 出处和源哈希。

## 轮辋与有符号偏移

轮辋包含空心筒体、两个形状相同的加强端缘和一体安装腹板。两个外端的平面圆环是演示参考截面。腹板的定心孔和五个通孔由 C-01 的定心凸缘和螺柱安装位置驱动。默认定心孔径为 Ø66.20 mm，螺柱通孔径为 Ø14.60 mm。零件局部原点在轮毂安装盘的内侧平面，局部 +Z 沿主轴指向轮外侧。

定义有符号偏移为 `dot(安装面中心 − 轮心, 向外主轴单位向量)`。正值意味着安装面比轮心更靠外。名义值来自 `parameters.json` 的演示设定。STEP 回读先定位最大外径的两个对称终端圆环，再由圆心差得主轴和端面距离，由圆心中点得轮心。另用定心孔和五个通孔识别腹板面，取与轮毂落座的内侧面。整个复算同时检查两个参考面同轴、圆环尺寸相同、轴向良定及 STEP 记录的毫米单位。

| 设定偏移 | 参考截面局部 Z mm | C-01 工装根轮心 mm | 右手 Y-up 工装根轮心 m |
| --- | --- | --- | --- |
| 默认 +24 mm | −94、46 | (−3, 0, 0) | (−0.003, 0, 0) |
| 变体 −8 mm | −62、78 | (29, 0, 0) | (0.029, 0, 0) |

两次实测沿用同一轮毂安装面及 140 mm 参考宽度，工装根安装面中心为 (21, 0, 0) mm。CAD 到米制点换算使用 C-02 的右手换基 `(X,Z,-Y) × 0.001`，主轴方向不缩放。两个坐标旋转的行列式均为 +1。装配抽样针对 9 个 C-01 实体与 2 个 C-03 球柄，检查轮辋沿主轴进入及落座，同时核对真实端面接触和越座干涉。

轮心是演示轮辋参考中心。轮胎包络、胎圈标准、轮辐、紧固件止动、制动盘、轮胎有效滚动半径、负载变形和实车公差均未建模。

## 供 R-38 与 R-39 消费

- 读取 `wheelCenter.workholdingYUpM`、`spindle.outboardDirectionYUp` 与 `signedOffset`。工装根仍为 `FR-C01-WHEEL-END-FL`。米制坐标与 C-03 球心一致，尚无整车配准。
- `sources.c01/c02/c03`、`sources.snapshot`、`sources.snapshotArchive` 和 `sha256` 提供包及输入指纹。先验证输入再使用坐标。C-03 球心复制到 `motionInput.ballCentersFromC03`，保持原坐标和实验样件 ID。
- R-38 的同源静态姿态可独立验证。R-39 可在 C-04 总控审核后按该包指纹启用轮心读入。外拉杆和 `vehicleFromWorkholding` 保持空值，旧 R-28 的配准仍为 `REGISTRATION_BLOCKED`，`playbackAllowed=false`。
