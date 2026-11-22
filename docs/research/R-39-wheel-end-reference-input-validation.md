# R-39｜轮端同源参考输入身份与修订校验（候选）

- 任务：R-39 / displayCode 03.41《校验同源轮端交接输入的身份和修订》
- 状态：只读输入门禁，`DEMO_ASSUMPTION`
- 日期：2026-11-22
- 实现：`src-experiments/wheel-end-reference-input-v1/`
- 个人回报：`agent-workspace/agents/deepseek/reports/R-39.md`
- 实跑结果：`agent-workspace/agents/deepseek/reports/R-39-reference-input-check-results.json`

## 1. 目标

在 R-38 做静态配准之前，先确认它拿到的不是“几份看起来同名、实际不同修订/角位/坐标系”的输入。R-39 **不生成新姿态、不做配准、不播放旧 R-28 运动、不接收 C-04 轮心**，只返回：

- 哪些输入可用；
- 哪些仍是候选/未知；
- 哪些必须阻断；
- R-38 可以安全消费的机读 `r38Input`。

## 2. 已核对输入

| 输入 | SHA-256 | 说明 |
|---|---|---|
| R-27 快照 | `f60d977efc2f5aefb878610b6b5a0bedb7579146f41a6a65528470e8b6a507c4` | `SNAP-R27-R16-R21-R22-R23-01` rev 1，`VAR-R16-BOF-ICE` |
| C-02 datums | `071eb3019dceeec74a53dc446f99413fadeaffc0a796358f61bb515a86e5f146` | 7 个基准 |
| C-03 manifest | `bfe27ea9f2ae6a3283a463389950373c5338287f6200b1179a6ed46b7d337e91` | 包 `c03-3f4bf8c599df28679b86` |
| C-03 upper STEP | `4ef7a17304c035edbceb8bb76009fd389e2f483d8488b4d67bb84056ed9fb88b` | `C03-UPPER-BALL-STUD` |
| C-03 lower STEP | `23242a0fb1c9a93081f64bc5faeff815e8648ac2b2322b91491f5c54663918dd` | `C03-LOWER-BALL-STUD` |
| R-28 参考运动 | `44a58318a89522db68b1dc9dfa3aad94e7876d8c5714e7e02b63d1d7117c265d` | `RUN-SLA-FL-SNAP1-001`，仅参考 |
| 运动夹具 | `9cdc6e8241a5f539f56dafb6ae1d6e68b0ec02ff8fb4e8bc3a05c0f5cf0b6ed1` | R-04/R-18 虚构夹具 |
| C-01 manifest | `80e7e060de6b20015a6fdb8d5b81ea60b9e23ac442cebbb96b2bc2a5b5222d6a` | C-02/C-03 共同引用 |
| C-01 assembly | `14758e7126cca3d63167a7c900356c81da53ccc95d0b7fbe358e3a1c2f146eab` | 7 个基准的装配定义 |
| C-01 wheel-end STEP | `e44ea54eded24673c1578e321eb8fe4438688c21913e1b41f9eedc34ef8cdf7d` | 装配 STEP |
| C-01 wheel-end GLB | `c11da5170450979ba0d1b444af18e32679cc3e9fce11a941bb1172f8427710c3` | 静态演示 GLB |

C-02/C-03 的 `sources.c01`、`sources.c02`、`sources.snapshot`、`sources.referenceMotion` 逐项与上述实际值比对；任一处变化都会 fail closed。

## 3. C-02 基准

7 个基准：

| datumId | 工装根点 m | 轴向（GLB） |
|---|---|---|
| `PI-20-016-FL/bearingSeatFront` | `[0,0,0]` | `[1,0,0]` |
| `PI-20-016-FL/bearingSeatBack` | `[-0.042,0,0]` | `[1,0,0]` |
| `PI-20-016-FL/upperBallJointSeat` | `[-0.021,0.110,-0.009]` | `[0,1,0]` |
| `PI-20-016-FL/lowerBallJointSeat` | `[-0.021,-0.100,0.008]` | `[0,-1,0]` |
| `PI-30-001-FL/frontFace` | `[0,0,0]` | `[1,0,0]` |
| `PI-30-001-FL/backFace` | `[-0.042,0,0]` | `[1,0,0]` |
| `PI-30-006-FL/wheelMatingFace` | `[0.021,0,0]` | `[1,0,0]` |

- 工装根 `FR-C01-WHEEL-END-FL`：右手、mm，+X 外侧、+Y 后、+Z 上；
- display 层：m、`0.001`、`(X,Z,-Y)`；
- anchor +Z → root +X；
- spindle outboard = +X；
- 7 个基准的 `partInstanceId` 都在 R-27 快照中存在且 partId 匹配；全部 `-FL`；
- 每个矩阵为 4×4 行主序；GLB 方向单位长度。

## 4. C-03 两颗球心

| 项 | 上球柄 | 下球柄 |
|---|---|---:|
| artifactId | `C03-UPPER-BALL-STUD` | `C03-LOWER-BALL-STUD` |
| 座基准 | `PI-20-016-FL/upperBallJointSeat` | `PI-20-016-FL/lowerBallJointSeat` |
| 球心局部 | `[0,0,24]` mm | `[0,0,27]` mm |
| 工装根 | `[-21,9,134]` mm | `[-21,-8,-127]` mm |
| Y-up 工装根 | `[-0.021,0.134,-0.009]` m | `[-0.021,-0.127,0.008]` m |
| 候选总成 | `PI-20-003-FL` / `AI-20-002-FL` | `PI-20-010-FL` / `AI-20-003-FL` |
| 球心跨度 | **261.553 mm** | |

交叉检查：

- 球心 = C-02 座原点 + 24/27 mm × 座轴；
- 上/下 Y-up 顺序正确，未互换；
- 2 个球心向量、局部/工装/Y-up 三种表示互相一致；
- `rootFromStudCad` 与 C-02 座 `rootFromMountCad` 逐元素一致；
- 候选总成在 R-27 中存在，partId / assemblyInstanceId / frameId 匹配，且仍 `NO_GEOMETRY`。

## 5. 候选与生产实体边界

C-03 的两件球柄：

- `partInstanceId=null`；
- `geometryRole=BALL_STUD_ONLY`；
- `candidateAssembly.status=CANDIDATE_PARTIAL_GEOMETRY`；
- `snapshotGeometryStatus=NO_GEOMETRY`。

R-39 把它们作为**候选部分几何**传给 R-38，`candidateOnly=true`、`productionEntity=false`。任何把样件直接标成 `PI-20-003-FL` / `PI-20-010-FL` 或 `EXACT_GEOMETRY` 的输入都会以 `E_CANDIDATE_AS_PRODUCTION` 拒绝。

## 6. R-28 只是参考

R-28 的 `canonical-motion.json` 自身是 `CURRENT`、`playbackAllowed=true`，但 C-02/C-03 都记录现有 R-28 配准为 `REGISTRATION_BLOCKED`，且 C-03 `motionInput.playbackAllowed=false`。

R-39 结果：

```json
{
  "sourceStatus": "CURRENT",
  "sourcePlaybackAllowed": true,
  "acceptedForNewDemo": false,
  "reason": "OLD_R28_FRAME_NOT_REGISTERED_TO_C02_C03",
  "runId": "RUN-SLA-FL-SNAP1-001",
  "frameId": "FR-VEHICLE"
}
```

顶层 `playbackAllowed=false`。任何把 R-28 姿态当作新配准输入（`poseInput`）的调用都以 `E_R28_POSE_NOT_ACCEPTED` 拒绝。

## 7. C-04 轮心

C-04 当前已有候选输出目录，但 R-39 **不读取其轮心数值**：

- `wheelCenter.status = C04_OUTPUT_PRESENT_PENDING_REVIEW`；
- `available=false`、`accepted=false`、`value=null`；
- 只列候选包目录和 manifest SHA-256，供总控审阅；
- 任何注入 `c04.value` / `wheelCenter` 的调用都以 `E_C04_NOT_RELEASED` 拒绝；
- R-38 的静态配准不需要轮心，继续用 7 个基准 + 2 个球心。

等 C-04 正式发布后，R-39 需要新版本才能接收轮心；本轮不自动升级。

## 8. 快照工作区漂移

R-27 快照在任务期间一度出现工作区字节变化（`b8a1ac28...`）而修订号仍为 1；C-02/C-03 仍钉在 `f60d...`。R-39 的策略：

- 默认按已批准的 `f60d...` 校验；
- 如果当前工作区快照不是 `f60d...`，从 Git 历史取已批准字节做只读校验，并返回：
  ```json
  {
    "status": "ACCEPTED_STATIC_INPUTS_PINNED_BYTES_WORKING_TREE_BLOCKED",
    "blockers": ["R27_WORKING_TREE_SNAPSHOT_DRIFT"],
    "r38Input": { "snapshot": { "workingTreeBlocked": true } }
  }
  ```
- 不会把 `b8a1...` 的工作区快照与钉在 `f60d...` 的 C-02/C-03 混用；
- 如果 Git 历史也找不到 `f60d...`，以 `E_PINNED_SNAPSHOT_MISSING` 阻断。

本次最终实跑时工作区已回到 `f60d...`，正向结果无 blocker；漂移分支由测试固定验证。

## 9. R-38 可消费的 `r38Input`

```text
status: READY_FOR_STATIC_REGISTRATION_INPUTS
snapshot: f60d..., revision 1, VAR-R16-BOF-ICE
workholding / display / spindle frames
datums: 7
knuckle: PI-20-016-FL / PART-20-016 / 4 datums
ballCenters:
  upper: PI-20-003-FL candidate, 24 mm offset, [-0.021,0.134,-0.009] m
  lower: PI-20-010-FL candidate, 27 mm offset, [-0.021,-0.127,0.008] m
witnessFeatures: bearingSeatFront + upper/lower seats (3 non-collinear)
registration: REGISTRATION_BLOCKED, playbackAllowed=false, missing 6
referenceMotion: R-28 reference only, acceptedForNewDemo=false
wheelCenter: null, accepted=false
allowedUse: STATIC_REGISTRATION_INPUTS, WITNESS_POINT_CHECKS
forbiddenUse: PLAY_R28_MOTION, USE_C04_WHEEL_CENTER,
              TREAT_C03_SAMPLE_AS_PRODUCTION_PART, MERGE_WITH_OLD_R28_POSE
playbackAllowed: false
```

R-38 可用这些输入建立静态刚体姿态；不能用 R-28 帧位姿、不能接 C-04 轮心、不能播放运动。

## 10. 验证

```text
node src-experiments/wheel-end-reference-input-v1/run-checks.mjs
node --test src-experiments/wheel-end-reference-input-v1/tests/validation.test.mjs
```

实测：

- `run-checks`：**18/18** 通过；
- Node 测试：**19/19** 通过；
- 覆盖：真实哈希、7 基准、2 球心、24/27 mm 偏移、261.553 mm 跨度、候选/生产边界、R-28 仅参考、C-04 未接收、快照漂移、错哈希/错修订/错变型、角位/球心互换、混单位、错误偏移、候选当生产、R-28 位姿误入、C-04 值误入、缺基准/错零件/错角位、参考运行不符、注册状态不符、只读不突变、活性值变化。

## 11. 未决项

1. R-38 是否接受 `r38Input` 的字段形状与 3 个见证点；
2. C-04 正式发布后，需要新的 R-39 版本接收轮心；
3. Qwen R-37 对 `PI-20-003-FL` / `PI-20-010-FL` 球铰身份的裁决仍待对齐；
4. R-28 的旧帧位姿永远不能作为新配准输入；需要新运行 ID 与输入哈希；
5. 快照工作区漂移需要 R-27/R-31 的所有者以新修订正式重生成，不能复用 revision 1。

## 12. 不做什么

- 不生成新姿态或配准结果；
- 不播放 R-28 运动；
- 不接收 C-04 轮心；
- 不修改 C-02/C-03/R-27/R-28/主工作台；
- 不新增端口或一级导航。
