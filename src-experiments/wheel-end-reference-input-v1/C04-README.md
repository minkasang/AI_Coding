# 已验收 C-04 轮心接入（R-44）

在 R-39 只读校验基线上，把总控已验收的 C-04 演示轮心、主轴和有符号偏移接入 `r38Input`。默认 R-39 行为不变；只有显式 `includeC04: true` 才读入轮心。

```text
node src-experiments/wheel-end-reference-input-v1/run-c04-checks.mjs
node --test src-experiments/wheel-end-reference-input-v1/tests/c04.test.mjs
```

## 已批准包

| 项 | 值 |
|---|---|
| 包 | `cad/experiments/wheel-end-wheel-center-demo-v1/out/c04-bae128570c76aec59353/` |
| manifest SHA-256 | `a29d64a876dbfde97e4442ecd3cf513a9109be8455fa31a2b5fb1a5fc1f37369` |
| `rim-datum.step` SHA-256 | `76e37510b2b99694c9024f5a0e65e89d71ba0da2266a71ba1b3c9b633fc8810f` |
| 快照 | `f60d977efc2f5aefb878610b6b5a0bedb7579146f41a6a65528470e8b6a507c4`，revision 1 |
| 快照归档 Git | `3524e32116019cca2a2decd91d6dfad4b180a2b2` |
| 轮心 | `[-0.003, 0, 0] m` |
| 主轴向外 | `[1, 0, 0]` |
| 轮毂安装面 | `[0.021, 0, 0] m` |
| 有符号偏移 | `+24 mm / +0.024 m`（安装面在轮心外侧） |

依赖同时固定 C-01 manifest/assembly/STEP/GLB、C-02 datums、C-03 manifest/两个 STEP、R-27 快照和 R-28 参考运动；任一处变化都会 fail closed。

## 用法

```js
import { validateWheelEndReferenceInputsFromDisk } from './node-loader.mjs';

const result = validateWheelEndReferenceInputsFromDisk(root, { includeC04: true });
const wheel = result.r38Input.wheelCenter;
// wheel.value.workholdingYUpM  [-0.003, 0, 0]
// wheel.spindle.outboardDirectionYUp  [1, 0, 0]
// wheel.signedOffset.m  0.024
// wheel.hubMountingFace.workholdingYUpM  [0.021, 0, 0]
```

不传 `includeC04` 时仍是 R-39 基线：轮心 pending、`accepted:false`、`value:null`。

## 保持的边界

- C-04 资产 `partInstanceId=null`、`geometryRole=RIM_DATUM_ARTIFACT`，不是生产零件。
- C-03 两颗球柄仍是候选部分几何；不能当 `PI-20-003-FL` / `PI-20-010-FL` 的生产实体。
- R-28 仍只是参考：`acceptedForNewDemo=false`，播放 `false`。
- `outerTieRodInterface=null`、`vehicleFromWorkholding=null`、`existingR28Registration=REGISTRATION_BLOCKED`。
- R-38 可以读轮心做静态几何，但不能当车辆放置或运动播放；`forbiddenUse` 含 `USE_C04_WHEEL_CENTER_AS_VEHICLE_PLACEMENT`。
- 不修改 C-04/C-03/C-02/R-27/R-28/主工作台。

## 负例

- 未批准包、同包 ID 不同 manifest 哈希；
- manifest/STEP 哈希不符或缺失；
- 轮心值、偏移方向、mm/m 换算不符；
- C-02/C-03/快照归档依赖不符；
- `playbackAllowed=true`、外拉杆非空、车辆放置非空；
- C-04 资产伪造成 `PI-*`；
- C-03 球心复制不一致；
- 缺包。
