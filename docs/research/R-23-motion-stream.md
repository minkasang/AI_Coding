# R-23｜工程实例可消费的刚性位姿运动流

> 版本：2026-11-15 · Grok · 待总控审核
> 目录：`src-experiments/mechanism-stream-v1/`。没有修改 `src/`、`workbench-v2/`，也没有新端口。
> 运动数字来自虚构硬点，`motionValueBasis=DEMO_ASSUMPTION`。零件几何来源仍是 `UNKNOWN`。
> 已有静态服务器会按项目根目录提供文件。只读地址是 `/src-experiments/mechanism-stream-v1/motion-stream.json`。本次没有为了检查去启动 5173。

## 0. 结论

上下摆臂和转向节的连续位姿已经挂到 R-16 的实例编号上：`PI-20-001-FL`、`PI-20-008-FL`、`PI-20-016-FL`。外拉杆端 `PART-20-075` 在骨架里是延期、没有实例，所以位姿保留，但 `instanceId` 为空。轮心没有绑定到 `PI-30-031-FL`，因为那个实例是制动盘定位螺钉。

往返行程共 9 帧，回到起点，相邻四元数没有突然翻面。摆臂长度变化小于 0.1 mm。力写成 `N/A`。工程修订从 3 改成 4 时，这条运动流是 `STALE`；坐标系改掉则是 `BLOCKED`。

## 1. 帧里有什么

命令：

```text
node src-experiments/mechanism-stream-v1/run-checks.mjs
```

2026-11-15 结果：13 项通过，0 项失败。`simulationRun` 为 `RUN-SLA-FL-DEMO-001`，`inputRevision` 为 3，结果哈希 `d3c7fd2430861d4db4a8e426e39337a243988d225ba6861698355e757a6732c0`。

每帧包含位置、xyzw 四元数、缩放 `[1,1,1]`、闭合误差，以及这些约束编号：

| 编号 | 角色 |
|---|---|
| `CON-SUSP-UPPER-CIRCLE` | 上摆臂圆弧，残差是相对首帧半径 |
| `CON-SUSP-LOWER-CIRCLE` | 下摆臂圆弧 |
| `CON-KINGPIN-LENGTH` | 转向节刚体闭合 |
| `CON-TIE-ROD-LENGTH` | 拉杆长度 |
| `CON-WHEEL-CENTER-HEIGHT` | 轮心高度输入 |
| `CON-SHOCK-OUTPUT` | 减振器长度输出，不是刚性约束 |

摆臂转动副 `J-UPPER-ARM-FL` 与 `J-LOWER-ARM-FL` 只作为提案。R-17 现有夹具里没有这两条，本次没有往那个夹具里写数。

间隙仍是演示球体，`cadCollisionVerified=false`。

## 2. 检查

| 编号 | 结果 |
|---|---|
| S01 | 9 帧往返后回到同一行程 |
| S02 | 相邻四元数转角小于 0.35 rad |
| S03 | 上摆臂长度变化小于 0.1 mm，闭合误差小于 `1e-6` m |
| S04 | 缩放全是 1，力是 `N/A` |
| S05 | 三个已有实例编号被复用 |
| S06 | 外拉杆和轮毂本体保持未绑定 |
| S07 | 约束残差为满足 |
| S08 | 减振器是输出 |
| S09 | 修订 4 为 STALE，修订 3 为 CURRENT |
| S10 | 换成工程坐标系为 BLOCKED |
| S11 | 声明拉杆 0.5 m 时没有帧，状态 BLOCKED |
| S12 | 间隙标明是演示代理 |
| S13 | 同样输入的结果哈希不变 |

## 3. 还不能声称的事

这些帧不是真实车辆运动，也不能代替 CAD 干涉或轮胎受力。外拉杆还没有可绑定的实例。摆臂转动副编号尚未进入 R-17 的正式关节表。
