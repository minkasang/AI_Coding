# C-03 左前轮端上下球头演示基准

本目录以已批准的 C-01 轮端 STEP、C-02 安装基准和 R-27 快照为只读输入，生成两件可独立回读的球柄。产品身份、装配接口和物理范围按 `DEMO_ASSUMPTION`。

## 从仓库根目录运行

```powershell
$c03 = "cad/experiments/wheel-end-ball-joint-demo-v1"
$env:PYTHONDONTWRITEBYTECODE = "1"
$build = & ./.venv/Scripts/python.exe "$c03/build_ball_joints.py" build | ConvertFrom-Json
$build
& ./.venv/Scripts/python.exe "$c03/build_ball_joints.py" verify $build.package
& ./.venv/Scripts/python.exe "$c03/selftest.py"
```

需要项目现有 Python 3.13 和 build123d。默认生成 `out/c03-<指纹>/`。包内含 `upper-ball-stud.step`、`lower-ball-stud.step`、`manifest.json` 和 `validation.json`。首次构建在暂存区验证之后发布，已存在的同一指纹包走完整回读复验。另给 `build --config <文件>` 可测试演示参数变体，`--out <目录>` 可改变输出根目录。C-01 缺失时需先取得 [C-01 文档](../../../docs/research/C-01-wheel-end-pipeline.md) 所述的已批准发布包；C-02 用 [基准表](../wheel-end-datum-interface-v1/datums.json) 的文件哈希固定版本。

## 可调设计和轴向落座

`parameters.json` 收录本轮演示设计值。大端锥口定义每颗球柄的局部原点，局部 +Z 指向大端外侧，装入沿 −Z。在 C-01 根坐标中，上球柄向下装入，下球柄向上装入。柄部锥度从 C-02 记录的实际 STEP 锥面大小端及裁切深度计算。锥柄相对于同轴孔在每一轴向位置缩小同样的半径量，保留正径向间隙。

| 设计或验证量 | 上球柄 | 下球柄 |
| --- | ---: | ---: |
| 球径 mm | 26 | 30 |
| 球心离锥口 mm | 24 | 27 |
| 锥柄径向间隙 mm | 0.08 | 0.10 |
| 锥柄装入深度 mm | 20.3 | 22.1 |
| 柄端离锥孔小端 mm | 0.8 | 1.0 |
| STEP 复装后的止挡环接触面积 mm² | 301.593 | 374.635 |

止挡由球柄外肩与转向节凸台环面构成。落座检查要求体积重叠低于 0.01 mm³ 且环面接触面积与实际大小径相符。距座 0.05 mm 的探针要求保持 0.05 mm 分离量，越座 0.1 mm 需出现交叠。每颗球柄沿同轴装入路径取五个位置，对 C-01 的九个实例逐对做 B-rep 干涉检查。最终两颗球柄也做互查。锥度和球心从回读的锥面、球面提取。

模型表达单件锥柄、止挡、颈和球头。球座外壳、轴瓦、密封、防尘、螺纹、锁止件、倒角、公差谱、承载、寿命及角度行程均未建模或验证。这里的间隙和止挡是离散轴向装配练习所用的演示设计。

## 运动消费

| 基准 | 球柄局部 mm | C-01 工装根 mm | 右手 Y 向上工装根 m |
| --- | --- | --- | --- |
| 上球心 | (0, 0, 24) | (−21, 9, 134) | (−0.021, 0.134, −0.009) |
| 下球心 | (0, 0, 27) | (−21, −8, −127) | (−0.021, −0.127, 0.008) |

`studs.upper` 和 `studs.lower` 的 `ballCenter` 同时记录三种表示；`seat.rootFromStudCad` 是行存储、乘列向量的局部到工装根矩阵，位移为 mm。米制表示从工装根取坐标 `(X,Z,-Y) × 0.001`。它仍描述 C-01 局部工装。工装到整车的变换为空。

Grok 可为新的同源演示运行读取两个显式球心，中位姿态的主轴、实体第三基准和定向见证点从同一版 C-02/C-03 CAD 获得。请记录输入包、源哈希、方向和修订。动态夹具还需运动侧定义车身枢轴与行程，CAD 或夹具侧给出轮毂安装面到轮心的关系和转向臂外端连接定义。两颗新球心在主轴上的跨度投影仍为 0 mm，现有 R-28 的相同量约 −79.38 mm。现有真实配对继续阻断播放。

两件 STEP 的资产 ID 为 `C03-UPPER-BALL-STUD`、`C03-LOWER-BALL-STUD`。R-27 的 `PI-20-003-FL`、`PI-20-010-FL` 均表示完整球铰总成 1 件。C-03 以 `candidateAssembly` 保留各自关联，样件自身的 `partInstanceId` 为空，待千问 R-37 独立核对。现有 C-01 静态资产消费维持原版本。
