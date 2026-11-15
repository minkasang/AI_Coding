# R-25 整车对象树 × 统一工作台（隔离 adapter）

## 目标

在**不覆盖** 5173 主 `workbench-v2/index.html` 的前提下，把 **R-16 工程骨架**（体量摘要）与 **R-17 域 fixture**（可导航实例）合并为同一棵树：`整车 → 系统 → 总成 → 零件实例`，选择键为 **`instanceId`**，并区分有几何 / 占位 / 无几何。

## 实现位置

```
workbench-v2/experiments/vehicle-structure-adapter/
  vehicle-tree-adapter.mjs   # buildVehicleTree / findInstanceNode
  geometry-status.mjs        # 几何与 inspectable 判定
  known-cad-map.mjs          # 按 instanceId 白名单挂 CAD（非 partId）
  r16-vehicle-index.json     # R-16 蒸馏索引（13 系统 + 每系统计数）
  scripts/build-r16-index.mjs
  demo.html + demo.mjs       # Chrome 可点选交互
  INTEGRATION.patch.md       # 合入 5173 的候选 diff 说明
```

## 数据契约

| 层级 | R-16 | R-17 域 |
|------|------|---------|
| 整车 / 13 系统 | 索引 + `r16Counts` | 10 系统有展开总成；其余系统显示「R-16 覆盖」叶 |
| 总成 | 仅计数 | `assemblies[]` + `parentAssemblyId` 嵌套 |
| 实例 | 278（摘要） | 14 可见 `partInstances` |

## 几何纪律

- **禁止**用轮毂演示 GLB 填充四轮或整车；`KNOWN_CAD_BY_INSTANCE` 当前仅 `INST-HUB-FL`。
- `DEMO_SUBSTITUTE` / `PLACEHOLDER` / `NO_GEOMETRY` 在树上有徽章；`inspectable` 为 false 时不得启用 R-20 测距/剖切。
- 不把 `assets[].glb: null` 渲染为真实模型。

## 验证

```bash
node workbench-v2/experiments/vehicle-structure-adapter/scripts/build-r16-index.mjs
node workbench-v2/experiments/vehicle-structure-adapter/tests/vehicle-tree-adapter.test.mjs
```

浏览器（`npm start` 后）：

`http://localhost:5173/workbench-v2/experiments/vehicle-structure-adapter/demo.html`

## 反例（测试覆盖）

| 场景 | 期望 |
|------|------|
| `INST-WHEEL-FR` 等角位 | `NO_GEOMETRY`，无 `cadUrl` |
| 仅有 `INST-HUB-FL` 带 CAD | 白名单长度 = 1 |
| `SYS-100` 等无域总成 | `coverage` 节点说明 R-16 计数 |

## 下一步（总控 / R-22）

- 用 `buildVehicleTree` 替换或增强 V2 左侧树；属性面板读 `findInstanceNode` 几何块。
- R-21 映射 fixture 到位后，把 R-16 `partInstances` 逐步挂到叶节点，仍保持 `instanceId` 选择键。