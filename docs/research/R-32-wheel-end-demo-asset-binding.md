# R-32｜C-01 左前轮端静态资产绑定合同（候选）

- 任务：R-32 / displayCode 03.34《为工作台验证九个左前轮端演示零件的资产绑定》
- 状态：`candidate` / read-only static projection
- 日期：2026-11-21
- 实现：`src-experiments/wheel-end-asset-binding-v1/`
- C-01 包：`cad/experiments/vehicle-cad-pipeline-v1/out/c01-c5d74da77c293aa5321f/`
- 个人回报：`agent-workspace/agents/deepseek/reports/R-32.md`
- 实跑结果：`agent-workspace/agents/deepseek/reports/R-32-binding-check-results.json`

## 1. 目标

让工作台从选中的 R-27 `partInstanceId` 找到正确的 C-01 演示网格节点，同时保留：

- 规范的 `PI-*` 身份，不把 GLB 节点名当工程身份；
- GLB 自带的根 → 装配组 → 实例层级和局部变换；
- `DEMO_SUBSTITUTE`、`DEMO_ASSUMPTION`、无整车配准的边界；
- 旧三件演示与无几何实例的清晰回退。

R-32 不是主页面集成，也不修改 `workbench-v2/` 的 UI 文件。

## 2. 输入与校验

| 输入 | 值 |
|---|---|
| R-27 快照 | `SNAP-R27-R16-R21-R22-R23-01` rev 1 |
| 快照 SHA-256 | `f60d977efc2f5aefb878610b6b5a0bedb7579146f41a6a65528470e8b6a507c4` |
| 变型 | `VAR-R16-BOF-ICE` |
| C-01 包 | `c01-c5d74da77c293aa5321f` |
| GLB SHA-256 | `c11da5170450979ba0d1b444af18e32679cc3e9fce11a941bb1172f8427710c3` |
| Manifest SHA-256 | `80e7e060de6b20015a6fdb8d5b81ea60b9e23ac442cebbb96b2bc2a5b5222d6a` |
| GLB 单位/朝向 | `m` / `+Y`；GLB 已完成 CAD `mm/+Z` 换基和 `0.001` 缩放 |
| 根 Frame | `FR-C01-WHEEL-END-FL`，工装基准，不是车辆世界 Frame |

构造绑定时 fail-closed：

1. manifest schema / packageId / sourceGrade；
2. manifest snapshotId、revision、snapshotSha256、variantId、selectionKey；
3. manifest 声明的 GLB SHA-256 与实际 GLB SHA-256；
4. 可选的批准包 ID / manifest 哈希 / GLB 哈希；
5. `root.vehiclePlacement` 和 `root.motionBinding` 必须为空，否则拒绝。

## 3. 九个实例的绑定结果

| PI | 零件 | GLB 节点 | 网格 | 直接父级 |
|---|---|---:|---:|---|
| `PI-20-016-FL` | 转向节 | 0 | 0 | `AI-20-004-FL` |
| `PI-30-001-FL` | 轴承外圈 | 2 | 1 | `AI-30-002-FL` |
| `PI-30-002-FL` | 轴承内圈 | 3 | 2 | `AI-30-002-FL` |
| `PI-30-006-FL` | 独立轮毂法兰 | 4 | 3 | `AI-30-002-FL` |
| `PI-30-009-FL-01` | 车轮螺柱 1 | 5 | 4 | `AI-30-002-FL` |
| `PI-30-009-FL-02` | 车轮螺柱 2 | 6 | 4 | `AI-30-002-FL` |
| `PI-30-009-FL-03` | 车轮螺柱 3 | 7 | 4 | `AI-30-002-FL` |
| `PI-30-009-FL-04` | 车轮螺柱 4 | 8 | 4 | `AI-30-002-FL` |
| `PI-30-009-FL-05` | 车轮螺柱 5 | 9 | 4 | `AI-30-002-FL` |

GLB 结构：

- 根节点 11：`FR-C01-WHEEL-END-FL`，`unit=m`，`packageId=c01-...`；
- 装配组 1：`AI-20-004-FL`，子节点 0；
- 装配组 10：`AI-30-002-FL`，子节点 2–9；
- 5 个网格定义；节点 5–9 共享螺柱网格 4，但各有独立 `extras.partInstanceId`；
- 9 个实例节点各有 `extras.partId`、`assemblyInstanceId`、`sourceGrade`；
- 白盒校验：名称、extras、父组、网格索引、共享关系、根/组/实例集合均一致。

## 4. 层级与变换

每个绑定返回：

```text
parentChain: root → assemblyGroup → instance
localTransform: translation / rotation / scale（GLB 原生）
matrixLocal / threeMatrixLocal
matrixWorldGlb / threeMatrixWorld
units=m, up=Y, coordinateBasis=GLB_OWN_M_Y_UP
cadToGlbAppliedInGlb=true
cadReconstructionOnly={rootFromPartCad, rootBoundsMm, note}
```

关键规则：

- GLB 节点已含米制、Y-up、换基后的变换，**不得**再把 `rootFromPartCad` 或 `cadToGlbScale` 乘一遍。
- `PI-30-006-FL` 的 GLB 平移是 `0.008 m`，与 manifest 的 8 mm 工装位置一致；重新应用 CAD 矩阵会变成 16 mm。
- `rootFromPartCad` 只保留给从清单/STEP 重建的路径，并带“never multiply onto the GLB”的提示。
- 克隆节点时必须保留父链或应用 `threeMatrixWorld`；只取网格会丢失装配组/根变换。

## 5. 静态工装边界

C-01 manifest：

```json
{
  "root": {
    "frameId": "FR-C01-WHEEL-END-FL",
    "vehiclePlacement": null,
    "motionBinding": null
  }
}
```

因此：

- `getRenderPlan()` 只返回 `STATIC_WORKHOLDING_DEMO`；
- `vehiclePlacement=null`、`motionBinding=null`、`canPlayMotion=false`；
- `getRenderPlan({mode:'VEHICLE'})` / `assertStaticOnly('MOTION')` → `E_VEHICLE_PLACEMENT_UNAVAILABLE`；
- C-01 不能直接挂到 R-28 运动 Frame，也不能替代 R-33 的配准验证。

## 6. 旧三件演示与无几何回退

V2 旧的 `wheel_hub_assembly.glb` 三件目录是**另一个演示工程**，不是 C-01 的九实例包：

| 旧 partKey | 显示名 | 对应规范实例 | 映射 |
|---|---|---|---|
| `hub` | 轮毂法兰 | `PI-30-006-FL` | 1:1 |
| `bearing` | 轴承包络 | `PI-30-001-FL` + `PI-30-002-FL` | 1:2 |
| `studs` | 车轮螺柱（组） | 5 个 `PI-30-009-FL-*` | 1:5 |

回退策略：

- C-01 可用时：9 个实例使用 C-01；旧 `hub` 被 C-01 取代，不重复显示；
- `includeLegacyWithC01:true` 会以 `E_LEGACY_DUPLICATE_GEOMETRY` 拒绝；
- `disableC01:true` 时：hub → `LEGACY_SINGLE_PART_DEMO`；bearing/studs → `LEGACY_GROUP_DEMO_NOT_ONE_TO_ONE`，不可当作单个规范零件；
- 9 个之外、且没有 1:1 旧演示的实例 → `NO_GEOMETRY`；
- 例：`PI-30-019-FL`（车轮）、`PI-40-034-FL`（卡钳体）保持 `NO_GEOMETRY`，不能拿 C-01 网格补。

## 7. 同源 5173 复验

`run-checks` 通过 `loadWheelEndAssetBindingFromUrls` 实际读取：

- `http://localhost:5173/src-experiments/vehicle-snapshot-v1/fixtures/vehicle-snapshot.json`
- `http://localhost:5173/src-experiments/vehicle-snapshot-v1/fixtures/vehicle-snapshot.consumer.json`
- `http://localhost:5173/cad/experiments/vehicle-cad-pipeline-v1/out/c01-c5d74da77c293aa5321f/manifest.json`
- `http://localhost:5173/cad/experiments/vehicle-cad-pipeline-v1/out/c01-c5d74da77c293aa5321f/wheel-end.glb`

并重新计算 4 个 SHA-256、验证源 origin、构建同一绑定。跨源 URL 以 `E_CROSS_ORIGIN_ASSET` 拒绝。

## 8. 验证结果

```text
node src-experiments/wheel-end-asset-binding-v1/run-checks.mjs
node --test src-experiments/wheel-end-asset-binding-v1/tests/binding.test.mjs
```

实测：

- `run-checks`：**17/17** 通过，含同源 5173 读取；
- Node 测试：**19/19** 通过；
- 覆盖：
  - 9 实例 / 5 网格 / 2 装配组 / 5 螺柱共享网格；
  - 根→组→实例层级与变换；
  - 不重复应用 CAD 矩阵；
  - 静态工装拒绝车辆/运动；
  - 旧三件 1:1 / 1:2 / 1:5 回退；
  - C-01 优先、旧 hub 不重复渲染；
  - 快照/修订/变型/包 ID/GLB 哈希 fail-closed；
  - 缺失/重复实例、错误零件/总成/Frame；
  - 缺失/重复节点、错误节点零件、网格数、螺柱共享、层级；
  - 缺包、未知实例、跨源资产；
  - GLB 节点变换活性测试；
  - 输入不被修改。

错误码示例：`E_PACKAGE_MISSING`、`E_SNAPSHOT_MISMATCH`、`E_VARIANT_MISMATCH`、`E_GLB_HASH_MISMATCH`、`E_INSTANCE_SET_MISMATCH`、`E_INSTANCE_DUPLICATE`、`E_INSTANCE_NOT_IN_SNAPSHOT`、`E_PART_MISMATCH`、`E_ASSEMBLY_MISMATCH`、`E_FRAME_MISMATCH`、`E_NODE_MISSING`、`E_NODE_DUPLICATE`、`E_NODE_PART_MISMATCH`、`E_MESH_DEFINITION_MISMATCH`、`E_STUD_MESH_NOT_SHARED`、`E_HIERARCHY`、`E_VEHICLE_PLACEMENT_UNAVAILABLE`、`E_LEGACY_DUPLICATE_GEOMETRY`、`E_CROSS_ORIGIN_ASSET`。

## 9. Composer R-29 接入

最小调用：

```js
import { loadWheelEndAssetBindingFromUrls } from '/src-experiments/wheel-end-asset-binding-v1/binding.mjs';

const binding = await loadWheelEndAssetBindingFromUrls({
  snapshotUrl: '/src-experiments/vehicle-snapshot-v1/fixtures/vehicle-snapshot.json',
  consumerIndexUrl: '/src-experiments/vehicle-snapshot-v1/fixtures/vehicle-snapshot.consumer.json',
  manifestUrl: '/cad/experiments/vehicle-cad-pipeline-v1/out/c01-c5d74da77c293aa5321f/manifest.json',
  glbUrl: '/cad/experiments/vehicle-cad-pipeline-v1/out/c01-c5d74da77c293aa5321f/wheel-end.glb'
});

const view = binding.getInstanceView('PI-30-006-FL');
const plan = binding.getRenderPlan();
```

Three.js 侧：

1. 用 GLTFLoader 加载 `wheel-end.glb`；
2. 把根节点作为静态工装组，或按 `parentChain` 克隆实例并保留父变换；
3. 选中用 `PI-*`，不要用 `Object3D.name` 或网格下标；
4. 只显示 `DEMO_SUBSTITUTE` 徽标；
5. 不应用 CAD 矩阵、不挂车辆世界坐标、不播放运动；
6. 旧 `wheel_hub_assembly.glb` 的 hub 不再与 C-01 hub 同时显示；
7. 9 个之外的节点保持 `NO_GEOMETRY`。

R-32 不修改 `workbench-v2/index.html/main.js/styles.css/viewport.js`；页面布局与视觉返工仍由 R-29 负责。

## 10. 未决项

1. R-29 主页面是否接受该绑定调用与静态工装组；
2. R-33 需要把 C-01 工装 Frame 与 R-28 运动 Frame 的物理基准对齐，R-32 不提供车辆放置；
3. C-01 局限：球头本体、完整轴承内部、制动、承载与 OEM 尺寸未覆盖；
4. 5 颗螺柱共享网格但身份独立，工作台不得按网格合并选择；
5. 旧三件演示与 C-01 的共存策略最终由 Composer/GPT-6 决定；R-32 默认 C-01 优先、禁止重复。
