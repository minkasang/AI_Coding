# R-31 整车快照只读消费适配器

浏览器安全的只读模块，给 5173 主工作台读取 R-27 的 `vehicle-snapshot.json`。它不生成页面、不启动端口，也不修改 `workbench-v2/`。

```text
node src-experiments/vehicle-consumer-v1/run-checks.mjs
node --test src-experiments/vehicle-consumer-v1/tests/consumer.test.mjs
```

## 入口

```js
import { fetchVehicleConsumer } from '/src-experiments/vehicle-consumer-v1/consumer.mjs';

const consumer = await fetchVehicleConsumer({
  snapshotUrl: '/src-experiments/vehicle-snapshot-v1/fixtures/vehicle-snapshot.json',
  indexUrl: '/src-experiments/vehicle-snapshot-v1/fixtures/vehicle-snapshot.consumer.json'
});
```

Node 环境可用：

```js
import { loadVehicleConsumer } from './node-loader.mjs';
const consumer = loadVehicleConsumer(root);
```

创建时强制比对 `consumerIndex.snapshotSha256`；没有哈希或哈希不符会直接抛 `E_SNAPSHOT_UNVERIFIED` / `E_SNAPSHOT_HASH_MISMATCH`。

## 最小用法

```js
const root = consumer.getTreePage({ limit: 50 });
// root.nodes: 13 个系统节点

const assemblies = consumer.getTreePage({ parentId: 'system:SYS-20', limit: 50 });
const parts = consumer.getTreePage({ parentId: 'assembly:AI-20-002-FL', limit: 50 });

const selection = consumer.selectVehiclePart('PI-20-001-FL');
const detail = consumer.getObjectDetail('PI-20-001-FL');
const status = consumer.getDisplayStatus();
const workspace = consumer.getWorkspaceState({ mode: 'inspect' });
```

所有 `selectionId` 都是 `PI-*`。`INST-*` / `ASM-*` 只在 `resolveAlias()` 或显式 `allowProjectionAlias:true` 下作为条件别名使用，不会变成规范身份。

## 显示与播放

- 278 个实例全部 `geometryStatus:"NO_GEOMETRY"`、`inspectable:false`。
- 只有 `PI-30-006-FL` 有 `DEMO_SUBSTITUTE` 轮毂 GLB，必须单独标徽标，不能复制。
- 严格 `poseRun` 当前是 `STALE`：`consumePoseRun()` 抛 `E_STALE_RUN`，默认禁止播放。
- 演示运动只能用 `getDemoPoseFrame({ frameIndex, demoMode:true, acknowledgeBadge:true, sourceRevision:3 })`，返回 `DEMO_ONLY`、`notCurrent:true`。
- `getWorkspaceState({ mode:'model' | 'inspect' })` 明确说明快照只读、不可保存为工程；保存仍归 V2 `ProjectStore`。

## API

| 方法 | 作用 | 失败码示例 |
|---|---|---|
| `getTreePage({parentId?, offset?, limit?, query?})` | 13 系统 → 37 总成实例 → 278 零件实例的分页树 | `E_PAGINATION`, `E_UNKNOWN_PARENT` |
| `selectVehiclePart(instanceId, {allowProjectionAlias?})` | 选择规范 `PI-*`；别名需显式允许 | `E_ALIAS_NOT_CANONICAL`, `E_NOT_A_PART`, `E_UNKNOWN_ID` |
| `getObjectDetail(id, {allowProjectionAlias?})` | 零件实例 / 总成实例 / 系统 / 零件定义 / 总成定义详情 | `E_UNKNOWN_ID`, `E_ALIAS_NOT_CANONICAL` |
| `getDisplayStatus()` | 快照、几何、变型、位姿、冲突总状态 | — |
| `getWorkspaceState({mode, demoMode?})` | 模型/检查模式的能力边界 | `E_MODE` |
| `consumePoseRun({revision, frameId?})` | 严格位姿播放；当前数据 fail-closed | `E_STALE_RUN`, `E_REVISION_MISMATCH`, `E_FRAME_MISMATCH` |
| `getDemoPoseFrame({frameIndex, demoMode, acknowledgeBadge, sourceRevision})` | 9 帧 DEMO 运动 | `E_DEMO_MODE_REQUIRED`, `E_BADGE_NOT_ACKNOWLEDGED`, `E_SOURCE_REVISION_MISMATCH` |
| `resolveAlias(aliasId)` | 条件别名 → 规范 PI/ASM | `E_ALIAS_UNBOUND`, `E_UNKNOWN_ALIAS` |
| `restoreSelection(selection)` | 恢复保存的 PI 选择 | `E_SELECTION_STALE`, `E_ALIAS_NOT_CANONICAL` |
| `clearSelection()` / `getSelection()` | 清空/读取当前选择 | — |
| `verifyIntegrity()` | 再次核对计数与快照哈希 | `E_SNAPSHOT_INVALID` |

`VehicleConsumerError` 带 `code`、`message`、`details`；调用方应按 `code` 显示可解释状态，而不是吞掉。

## 边界

- 只读：不写快照、不写工程、不改 `workbench-v2/`。
- 无新端口、无新一级导航。
- 不把 `NO_GEOMETRY` 画成实体；不把 `DEMO_SUBSTITUTE` 当真实 CAD。
- 不把 `INST-*` 当主键；不把 STALE 运行当当前。
- R-26 仍无输出：24 项冲突保留，不自动裁决。
