# R-28｜按快照修订输出运动位姿

> 版本：2026-11-21 · Grok · 待总控审核
> 目录：`src-experiments/mechanism-pose-adapter-v1/`。没有修改 R-23 运动流、R-27 快照或 `workbench-v2/`。
> 运动仍是 `DEMO_ASSUMPTION`。几何来源仍是 `UNKNOWN`。力是 `N/A`。

## 0. 结论

三个刚性零件继续用 `PI-20-001-FL`、`PI-20-008-FL`、`PI-20-016-FL`。运行编号改成 `RUN-SLA-FL-SNAP1-001`，`sourceRevision` 和 `inputRevision` 都是 1，对齐 R-27 快照。旧运行 `RUN-SLA-FL-DEMO-001` 的修订 3 和旧哈希只留在 `rebase` 里，不再当作当前结果。

外拉杆端仍然没有实例，但每一帧都保留为必需且延期。轮毂不把 `PI-30-006-FL` 写成可播放位姿；它只是角色标记，因为轮心加旋转轴还不能证明就是独立轮毂法兰的局部坐标。这和 R-22 把轮毂绑到该编号的做法不一致，冲突记为 `R28-DISC-HUB`，没有改 R-22 的文件。

## 1. 工作台怎么取一帧

`applyPose(snapshot, frame, stream)` 返回新对象。修订、变型或坐标系不一致时 `playbackAllowed` 为 false，位姿表为空。坐标系仍是 `FR-VEHICLE`，不与 `FR-WHEEL-END-FL` 合并。R-22 已记录两套原点相差约 1.277 m。

只读样例：`/src-experiments/mechanism-pose-adapter-v1/canonical-motion.json`。本次没有启动 5173，也没有改生产页面。

## 2. 检查

命令：

```text
node src-experiments/mechanism-pose-adapter-v1/run-checks.mjs
```

2026-11-21 结果：10 项通过，0 项失败。新哈希 `ea07924e32613ccb4500ac737d4f6c08a6f531bba0afa0e6219f45bd4784ddc3`。

| 编号 | 结果 |
|---|---|
| C01 | 修订 1，9 帧，三个编号始终在 |
| C02 | 外拉杆 `instanceId` 为空且标成必需延期；轮毂 `roleOnly` |
| C03 | 四元数长度为 1，往返回到同一行程 |
| C04 | 上摆臂铰点原点位移小于 `1e-9` m |
| C05 | 力是 `N/A`，碰撞未标成 CAD 已验证 |
| C06 | `applyPose` 读到快照修订 1，不输出法兰编号 |
| C07 | 修订 4 为 STALE，且没有可播放位姿 |
| C08 | 变型不一致为 BLOCKED |
| C09 | 声明拉杆 0.5 m 时没有帧 |
| C10 | 快照修订确实是 1，重定基线写明来自修订 3 |

## 3. 未解决

演示硬点没有变成实车数据。球体间隙仍不是 CAD 碰撞。摆臂转动副仍未写入他人的夹具。
