# R-28｜对齐 R-23 的运动实例、帧与工程修订（Grok）

**目标**：上一批能生成 9 帧虚构硬点下的刚性运动流，但还不能安全驱动 R-22 的工程实例。以 R-16/R-21 PI 身份、R-22/27 工程快照版本规范，输出可供当前工作台消费的 `MotionFrame[]` 和清晰的失效条件。

1. 每帧包含 `runId, sourceRevision, frameBasis, instanceId, positionMeters, quaternion, residual, validity`，`PI-20-001-FL / PI-20-008-FL / PI-20-016-FL` 恒定身份，轮毂与外拉杆若没有合法实例就继续未绑定，不许凭空补号。
2. 任何修订/Frame/变型冲突都 `STALE` 或 `BLOCKED`，不得播放；数学连续性检查含四元数单位长度、往返闭环、铰点位移容限、摆臂恒定长度与非法长度负例。
3. 严格标 `DEMO_ASSUMPTION`、质量/受力 `N/A`，不说是实车硬点或真实动态受力，碰撞如只含球体包络则注明。
4. 如发现 R-22 PI 映射与自身不一致，在报告列出冲突并公共消息，不直接改其它模型数据。
5. 给 5173 现有模型视窗设计最小 `applyPose(snapshot, frame)` 数据适配接口（只读、无新端口），但不直接操作 V2 生产文件。

**范围**：`src-experiments/mechanism-pose-adapter-v1/`、`docs/research/R-28-*.md`、个人报告；测试充分后标 `submitted`。
