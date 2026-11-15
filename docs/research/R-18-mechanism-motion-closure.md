# R-18｜悬架解算驱动刚性零件位姿

> 版本：2026-11-15 · Grok · 待总控审核
> 目录：`src-experiments/mechanism-vertical-slice-v1/`。没有修改 `src/`、`workbench-v2/`，也没有新的网页端口。
> 硬点：`DEMO_ASSUMPTION` / `FICTIONAL_FIXTURE`。轮端受力没有证据，输出保持 `UNKNOWN`。
> 实例编号是候选，留给 DeepSeek R-17，本次不冻结。

## 0. 结论

轮心按行程移动时，上下摆臂绕固定衬套轴线转动，转向节和拉杆用刚体四元数跟上球铰。摆臂长度在 ±40 mm 行程里保持不变，球铰闭合误差约 `6.7e-11` m。没有使用 `scale` 把零件拉长。

求解失败、约束被拿掉、变型跨度超限时，都不发布合法装配。声明的包围球如果相交，只记为代理体干涉，不是已经完成的 CAD 碰撞。

## 1. 位姿怎么来

命令：

```text
node src-experiments/mechanism-vertical-slice-v1/run-checks.mjs
```

2026-11-15 结果：11 项通过，0 项失败。记录在同目录的 `R-18-results.json`。

每个成功样本包含上摆臂、下摆臂、转向节、拉杆和轮毂的位置与四元数，坐标是 `FR-VEHICLE`，四元数顺序是 xyzw。轮毂绕自身旋转轴的滚动角没有解，写成 `UNKNOWN`。减振器长度和半轴长度仍是输出，不是把它们锁成刚性杆。

行程从 -40 mm 到 +40 mm，每 10 mm 一个样本，其中 -40、0、+40 mm 是点名的三个姿态。

## 2. 检查结果

| 编号 | 检查 | 结果 |
|---|---|---|
| M01 | 三个点名姿态都在连续样本里 | 通过，共 9 个样本 |
| M02 | 上下摆臂和拉杆长度不变 | 变化都小于 0.1 mm |
| M03 | 球铰闭合 | 最大误差 `6.69e-11` m |
| M04 | 缩放全是 1，力是空的 | 通过 |
| M05 | 右轮显式镜像 | 轮心 X 与左轮相反，外倾一致 |
| M06 | 工程坐标毫米输入 | 轮毂位置与米制车辆坐标一致 |
| N01 | 去掉拉杆约束 | `UNDERCONSTRAINED`，没有位姿 |
| N02 | 声明拉杆 0.5 m | `KIN-E-LENGTH`，没有合法装配 |
| N03 | 拉杆缩短到不可解 | `SOLVER_NUMERICAL` / `KIN-E-CONVERGE` |
| N04 | 沿用 R-01 的 0.7356 m 对 0.560 m | `VARIANT_ILLEGAL`，求解器未调用 |
| N05 | 两个半径 1 m 的代理球 | 干涉，且标明不是 CAD 碰撞 |

N04 继续遵守 R-13：静态跨度超限不是迭代失败。N03 的未收敛也不改写成 P09。

## 3. 给其他工作位

DeepSeek 可以读取样本里的 `instanceId`、`position`、`quaternion`、`frameId` 和 `valueBasis`。编号状态是 `CANDIDATE_NOT_FROZEN`。Qwen 的对象树不要把这些编号当成已经冻结的零件身份。真实硬点仍是未知。

R-12 里“`KIN-E-LENGTH` 配上模块长度不足才到 P08、配上跨度超限才到 P09”可以保留为条件映射。单独的 `KIN-E-LENGTH` 不自动变成这两条。`KIN-E-CONVERGE` 不是 P09。`P17_SOLVER_CONVERGENCE_PROPOSED` 只是候选名字，本轮没有把它写成正式规则。
