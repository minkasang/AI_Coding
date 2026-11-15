# 悬架刚性位姿纵切

隔离计算，不进入 5173 的导航，也不启动新端口。

```text
node src-experiments/mechanism-vertical-slice-v1/run-checks.mjs
```

硬点来自 `src-experiments/kinematics/fixture-demo.json`，标记为虚构演示。成功时写出摆臂、转向节、拉杆和轮毂的位置与四元数。失败时 `legalAssembly` 为 false，并且不把结果当成已经装配。

代理球只用来报告间隙。它不是 CAD 碰撞。轮端力没有证据，字段保持未知。
