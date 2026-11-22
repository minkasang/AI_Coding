# C-01 左前轮端静态资产绑定（R-32）

只读模块：把 R-27 快照里的 9 个左前轮端 `PI-*` 绑定到 C-01 已验收的 `wheel-end.glb` 节点，保留 GLB 自带层级和变换。不加载 Three.js、不生成页面、不修改主工作台。

```text
node src-experiments/wheel-end-asset-binding-v1/run-checks.mjs
node --test src-experiments/wheel-end-asset-binding-v1/tests/binding.test.mjs
```

## 输入

- R-27 快照：`src-experiments/vehicle-snapshot-v1/fixtures/vehicle-snapshot.json`
- C-01 包：`cad/experiments/vehicle-cad-pipeline-v1/out/c01-c5d74da77c293aa5321f/`
  - `manifest.json`：9 实例、5 零件定义、2 装配组、节点/网格/哈希/快照绑定
  - `wheel-end.glb`：SHA-256 `c11da517...7710c3`，米制、Y-up

## 最小用法

```js
import { loadWheelEndAssetBindingFromUrls } from '/src-experiments/wheel-end-asset-binding-v1/binding.mjs';

const binding = await loadWheelEndAssetBindingFromUrls({
  snapshotUrl: '/src-experiments/vehicle-snapshot-v1/fixtures/vehicle-snapshot.json',
  consumerIndexUrl: '/src-experiments/vehicle-snapshot-v1/fixtures/vehicle-snapshot.consumer.json',
  manifestUrl: '/cad/experiments/vehicle-cad-pipeline-v1/out/c01-c5d74da77c293aa5321f/manifest.json',
  glbUrl: '/cad/experiments/vehicle-cad-pipeline-v1/out/c01-c5d74da77c293aa5321f/wheel-end.glb'
});

const view = binding.getInstanceView('PI-30-006-FL');
// view.binding.nodeIndex / meshIndex / parentChain / threeMatrixWorld
// view.fallback / view.detail

const plan = binding.getRenderPlan(); // STATIC_WORKHOLDING_DEMO
```

Node/测试用：

```js
import { loadWheelEndAssetBindingFromDisk } from './node-loader.mjs';
const binding = loadWheelEndAssetBindingFromDisk(root);
```

## 接入规则

1. **保留 GLB 层级**：优先把根节点 `FR-C01-WHEEL-END-FL` 整体加入一个静态演示组；若克隆单个实例节点，保留 `root → AI-* → PI-*` 的父链或使用 `threeMatrixWorld`，不要只取网格丢掉父变换。
2. **不要再次应用 CAD 矩阵**：GLB 自带 m/Y-up 换基与 0.001 缩放。`rootFromPartCad` 只用于从清单/STEP 重建，不得乘到 GLB 节点上。
3. **静态工装**：C-01 的 `vehiclePlacement` 和 `motionBinding` 都为空，只能作为静态工装演示；不能挂到车辆世界坐标，也不能播放 R-28 运动。
4. **C-01 优先于旧轮毂演示**：`PI-30-006-FL` 在旧 `known-cad-map` 里也有一个 1:1 轮毂 GLB。C-01 可用时只显示 C-01 节点，不能同时显示两个；`getRenderPlan({includeLegacyWithC01:true})` 会以 `E_LEGACY_DUPLICATE_GEOMETRY` 拒绝。
5. **旧三件不是一一对应**：旧 V2 演示的 `hub / bearing / studs` 分别对应 1 / 2 / 5 个规范实例；只有 hub 是 1:1，轴承包络和螺柱组不能当作单个规范零件。
6. **无几何保持无几何**：9 个之外的 269 个实例仍是 `NO_GEOMETRY`；不要用 C-01 网格补齐。
7. **9 个之外不猜**：未知 `PI-*` 拒绝；已知但不在 C-01 的实例返回 `E_NOT_IN_C01_PACKAGE` 和 `NO_GEOMETRY` 回退状态。

## API

| 方法 | 作用 |
|---|---|
| `getBinding(pi)` | 返回 C-01 节点/网格/父链/局部与世界矩阵；非 C-01 返回 `E_NOT_IN_C01_PACKAGE` 状态 |
| `getFallbackStatus(pi, {disableC01?})` | C-01 / 旧 1:1 演示 / 旧组演示 / `NO_GEOMETRY` |
| `getRenderPlan({mode?, disableC01?, includeLegacyWithC01?})` | 静态工装渲染计划；拒绝车辆/运动模式 |
| `getInstanceView(pi)` | 合并 R-31 详情、C-01 绑定和回退状态 |
| `getStatus()` | 包、快照、变型、哈希、计数、静态边界 |
| `getLegacyDemoBridge()` | 旧三件到规范实例的 1:1 / 1:2 / 1:5 对照 |
| `listBindings()` | 9 个绑定 |
| `assertStaticOnly(mode)` | 只允许 `STATIC_WORKHOLDING_DEMO` |

错误类型 `WheelEndBindingError`，带 `code`、`message`、`details`。常见码：`E_PACKAGE_MISSING`、`E_SNAPSHOT_MISMATCH`、`E_VARIANT_MISMATCH`、`E_GLB_HASH_MISMATCH`、`E_INSTANCE_SET_MISMATCH`、`E_INSTANCE_DUPLICATE`、`E_INSTANCE_NOT_IN_SNAPSHOT`、`E_PART_MISMATCH`、`E_ASSEMBLY_MISMATCH`、`E_FRAME_MISMATCH`、`E_NODE_MISSING`、`E_NODE_DUPLICATE`、`E_NODE_PART_MISMATCH`、`E_MESH_DEFINITION_MISMATCH`、`E_STUD_MESH_NOT_SHARED`、`E_HIERARCHY`、`E_VEHICLE_PLACEMENT_UNAVAILABLE`、`E_LEGACY_DUPLICATE_GEOMETRY`、`E_CROSS_ORIGIN_ASSET`。

## 边界

- 9 个 `DEMO_SUBSTITUTE` 实例，不是真实 OEM 装配。
- 5 份网格、2 个装配组；五颗螺柱共享同一网格但身份独立。
- 没有整车配准、没有运动绑定、没有受力。
- 本模块不改 `workbench-v2/`，主页面接入由 Composer R-29 负责。
