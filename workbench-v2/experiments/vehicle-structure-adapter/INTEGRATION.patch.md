# R-25 → 5173 主工作台（候选补丁，未应用）

本文件描述将 `vehicle-structure-adapter` 合入 `workbench-v2` 的最小差异，供总控复查。**当前未修改** `workbench-v2/index.html` / `main.js`。

## 1. 数据源

| 输入 | 路径 |
|------|------|
| R-16 索引 | `workbench-v2/experiments/vehicle-structure-adapter/r16-vehicle-index.json`（由 `scripts/build-r16-index.mjs` 再生成） |
| R-17 域整车 | `src-experiments/domain-contract-v1/fixtures/vehicle-skeleton.json` |

## 2. 树构建

```js
import { buildVehicleTree, findInstanceNode } from './experiments/vehicle-structure-adapter/vehicle-tree-adapter.mjs';

const { root, meta } = buildVehicleTree(r16Index, domainProject);
// 选择键：meta.selectionKey === 'instanceId'
```

替换或并列 `renderTree(snapshot)`：实例叶节点 `data-select` / `selectionId` 必须为 `instanceId`，与现有 `viewport.js` `userData.instanceId` 一致。

## 3. 几何与检查工具

- 仅当 `findInstanceNode(root, id).geometry.inspectable === true` 时启用测距/剖切（与 R-20 `InspectionBridge` 的 inspect 模式一致）。
- CAD 映射仅读 `known-cad-map.mjs`（当前 whitelist：`INST-HUB-FL`），禁止按 `partId` 批量挂同一 GLB。

## 4. 与 R-17 RenderAdapter 对齐

- 视窗姿态：继续用 `ProjectStore.toDisplayTransform(instanceId)` 或 R-17 `snapshotForRender()` 条目；单位 m、Y-up，无二次缩放。
- 不把域 fixture 中 `assets[].glb: null` 的占位件画成真实网格。

## 5. 隔离 demo URL

`http://localhost:5173/workbench-v2/experiments/vehicle-structure-adapter/demo.html`