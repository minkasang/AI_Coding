# 轮端同源参考输入校验（R-39）

只读校验 C-02 基准表、C-03 球心包、R-27 快照和 R-28 参考运动，给 R-38 返回可直接消费的静态配准输入；不生成新位姿、不播放旧运动、不接收 C-04 轮心。

```text
node src-experiments/wheel-end-reference-input-v1/run-checks.mjs
node --test src-experiments/wheel-end-reference-input-v1/tests/validation.test.mjs
```

## 输入

| 输入 | 路径 | 已批准值 |
|---|---|---|
| R-27 快照 | `src-experiments/vehicle-snapshot-v1/fixtures/vehicle-snapshot.json` | `f60d977e...507c4` |
| C-02 基准 | `cad/experiments/wheel-end-datum-interface-v1/datums.json` | `071eb301...e5f146` |
| C-03 清单 | `cad/experiments/wheel-end-ball-joint-demo-v1/out/c03-3f4bf8c599df28679b86/manifest.json` | `bfe27ea9...7e91` |
| C-03 两个 STEP | 同包 `upper-ball-stud.step` / `lower-ball-stud.step` | `4ef7a17...b88b` / `23242a0...18dd` |
| R-28 参考运动 | `src-experiments/mechanism-pose-adapter-v1/canonical-motion.json` | `44a58318...265d` |
| 运动夹具 | `src-experiments/kinematics/fixture-demo.json` | `9cdc6e82...b6ed1` |

C-02 还引用 C-01 manifest `80e7e060...22d6a`、assembly `14758e71...6eab`、wheel-end STEP `e44ea54e...df7d`、GLB `c11da517...10c3`；这些实际文件也会重新哈希。

## 校验结果

- 7 个真实 C-02 基准、4 个转向节基准、3 个非共线见证点；
- 上/下球心 `workholdingYUpM` 分别为 `[-0.021, 0.134, -0.009]`、`[-0.021, -0.127, 0.008]` m；
- 球心相对锥口偏移 24 mm / 27 mm，球心跨度 261.553 mm；
- C-03 两颗样件保持 `partInstanceId=null`、`BALL_STUD_ONLY`、`CANDIDATE_PARTIAL_GEOMETRY`，候选总成仍为 `NO_GEOMETRY`；
- R-28 只是参考：源自身 `CURRENT/playbackAllowed=true`，但新演示 `acceptedForNewDemo=false`、`playbackAllowed=false`；
- `REGISTRATION_BLOCKED`，6 项缺失显式列出；
- C-04 输出即使存在也只列为 `C04_OUTPUT_PRESENT_PENDING_REVIEW`，`accepted=false`、`value=null`；
- 若 R-27 工作区快照字节变了但修订号仍是 1，结果为 `ACCEPTED_STATIC_INPUTS_PINNED_BYTES_WORKING_TREE_BLOCKED`，`blockers` 含 `R27_WORKING_TREE_SNAPSHOT_DRIFT`，不会把两套输入拼起来。

## R-38 消费

```js
import { validateWheelEndReferenceInputsFromDisk } from './node-loader.mjs';
const result = validateWheelEndReferenceInputsFromDisk(root);
const input = result.r38Input;
// input.datums: 7
// input.ballCenters.upper/lower
// input.witnessFeatures: bearingSeatFront + upper/lower seats
// input.referenceMotion: reference only
// input.wheelCenter: null, accepted false
// input.playbackAllowed: false
```

R-38 可用 `datums + ballCenters + witnessFeatures + workholding/display/spindle frames` 做静态配准；不得：

- 使用 R-28 帧位姿作为新配准；
- 读取 C-04 的轮心值；
- 把 C-03 球柄样件当生产零件；
- 打开运动播放；
- 把 `INST-*` 当选择键。

## 错误码

`E_INPUT_MISSING`、`E_DATUMS_HASH_MISMATCH`、`E_C03_MANIFEST_HASH_MISMATCH`、`E_C03_STEP_HASH_MISMATCH`、`E_SNAPSHOT_MISMATCH`、`E_VARIANT_MISMATCH`、`E_REFERENCE_MOTION_HASH_MISMATCH`、`E_REFERENCE_FIXTURE_HASH_MISMATCH`、`E_REFERENCE_RUN_MISMATCH`、`E_R28_POSE_NOT_ACCEPTED`、`E_C04_NOT_RELEASED`、`E_DATUM_SET_MISMATCH`、`E_DATUM_PART_MISMATCH`、`E_DATUM_MATRIX`、`E_DATUM_UNIT`、`E_CORNER_MISMATCH`、`E_ROLE_SWAP`、`E_UNIT_MISMATCH`、`E_BALL_CENTER_OFFSET`、`E_BALL_CENTER_INVALID`、`E_CANDIDATE_AS_PRODUCTION`、`E_CANDIDATE_PI_MISMATCH`、`E_REGISTRATION_NOT_BLOCKED`、`E_NEW_DEMO_PLAYBACK_FORBIDDEN`、`E_PROJECTION_MISMATCH`、`E_PINNED_SNAPSHOT_MISSING`。

## 边界

- 只读；不写 C-02/C-03/R-27/R-28/主工作台。
- 不创建新位姿、不做静态配准；配准由 R-38 实现。
- 不接 C-04 轮心；等总控发布后再开新校验版本。
- 不修改 `workbench-v2/`，不新增端口。
