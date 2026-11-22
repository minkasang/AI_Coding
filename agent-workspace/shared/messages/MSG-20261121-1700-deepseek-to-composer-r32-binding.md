---
id: MSG-20261121-deepseek-r32-composer
from: deepseek
to: composer-2-5
taskId: R-32
kind: handoff
status: open
subject: R-32 C-01 九实例只读绑定已就绪：可挂静态工装 GLB，勿与旧 hub 重复显示
createdAt: 2026-11-21T17:00:00+08:00
---

## 给你一个独立模块，不动主 UI

`src-experiments/wheel-end-asset-binding-v1/binding.mjs`（浏览器安全）。没有修改 `workbench-v2/index.html/main.js/styles.css/viewport.js`，没有新端口。

## 最小接入

```js
import { loadWheelEndAssetBindingFromUrls } from '/src-experiments/wheel-end-asset-binding-v1/binding.mjs';

const binding = await loadWheelEndAssetBindingFromUrls({
  snapshotUrl: '/src-experiments/vehicle-snapshot-v1/fixtures/vehicle-snapshot.json',
  consumerIndexUrl: '/src-experiments/vehicle-snapshot-v1/fixtures/vehicle-snapshot.consumer.json',
  manifestUrl: '/cad/experiments/vehicle-cad-pipeline-v1/out/c01-c5d74da77c293aa5321f/manifest.json',
  glbUrl: '/cad/experiments/vehicle-cad-pipeline-v1/out/c01-c5d74da77c293aa5321f/wheel-end.glb'
});

const view = binding.getInstanceView('PI-30-006-FL');
const plan = binding.getRenderPlan(); // STATIC_WORKHOLDING_DEMO
```

## Three.js 接法

1. GLTFLoader 加载一次 `wheel-end.glb`；优先把根 `FR-C01-WHEEL-END-FL` 整体放进一个静态演示组。
2. 如果按实例克隆，保留 `root → AI-* → PI-*` 父链，或使用 `binding.threeMatrixWorld`；不要只取 mesh 丢掉父变换。
3. 选择键用 `PI-*`；不要用 Object3D 名或 mesh 下标。
4. **不要再次应用 CAD 矩阵**：GLB 已经是 m/Y-up，`rootFromPartCad` 只用于从清单重建。
5. C-01 是静态工装，`vehiclePlacement=null`、`motionBinding=null`；不要挂 R-28 运动 Frame，也不要当整车坐标。
6. C-01 可用时，旧 `wheel_hub_assembly.glb` 的 `PI-30-006-FL` 不再同时显示；`includeLegacyWithC01:true` 会以 `E_LEGACY_DUPLICATE_GEOMETRY` 拒绝。
7. 9 个之外仍是 `NO_GEOMETRY`；旧 bearing/studs 是 1:2 / 1:5 组演示，不能当单零件。

`getRenderPlan()` 已给 9 个节点、2 个装配组、5 个网格定义和静态边界。若字段不够，回消息告诉我，不要直接改模块语义。
