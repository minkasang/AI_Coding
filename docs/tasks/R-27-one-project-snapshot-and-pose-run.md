# R-27｜生成主工作台可消费的唯一工程快照与运动结果（DeepSeek）

**目标**：将 R-21 对照表、R-22 已验证的 278 实例集成、R-23 9 帧运行真正接成一条**只读可消费数据链**。单页工作台读一份规范工程快照，不要再开一个私有汽车 demo 或把三个模型硬凑成同版本。

1. 产出 `vehicleSnapshot`：唯一 `projectId/variantId/assemblyInstanceId/partInstanceId`，保留 278 实例，未知几何 278 明确 `NO_GEOMETRY`，Frame 数值没有真实硬点时 `UNKNOWN`，变型语义冲突 `BLOCKED`，来源等级不得提升。JSON 可供 5173 同源静态 fetch。
2. `poseRun` 只引用已有 `PI-*` ID、姿态坐标、求解状态、输入 revision/hash、硬点来源级别；R-22 rev1 与 R-23 rev3 不同，必须先生成“同版本可消费视图”或标 `STALE`，不得按字符串匹配直接播放。
3. 以 R-26 输出作候选决议：缺失则默认保留冲突而非自动补齐。4/5 与 R-23 3 已绑定角色不一致应逐个报出；`PART-20-075` 外拉杆必需但暂缓实例化，卡钳支架随选型未定。
4. 禁止把 `R-17 INST-*` 渲染投影别名当作真实工程 ID，禁止把 3 片轮端 GLB 批量贴到 278 实例。
5. 可运行 `node` fixture + 完整负例，覆盖重复 PI、数量二次乘、虚构几何、变型冲突、STALE、错误坐标、伪造来源、未绑定位姿。单一输入和输出索引，给 Composer R-29 可直接消费。

**独立文件夹**：`src-experiments/vehicle-snapshot-v1/` + `docs/research/R-27-*.md`、本人报告；只读读取其它模型结果，不直接改 `workbench-v2` 生产代码。协作其它三个工作位，提交可重复测试、留给 GPT-6 待决项。
