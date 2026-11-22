# R-29 整车对象树 × 5173 主工作台

## 可见成果

在 `http://localhost:5173/` 工程模型左栏：

1. **整车工程骨架（R-27）**：13 系统懒加载树 → 总成实例 → `PI-*` 零件实例。
2. **工程顶栏徽标**：快照 REV、变型 `VAR-R16-BOF-ICE`、`BLOCKED_PENDING_ADJUDICATION`、278×无几何提示。
3. **可编辑装配**（原轮端 DEMO）保留在下方，业务 Tab 仍为 3 个。

## 选择模型

| 来源 | 键 | 检查器 | 测距/剖切 |
|------|-----|--------|-----------|
| 整车树 | `partInstanceId` | 工程字段 + NO_GEOMETRY | 仅 `PI-30-006-FL`（演示 CAD） |
| 当前工程 | `instanceId` | 原 V2 逻辑 | 有 GLB 即可 |

`PI-30-006-FL` 视窗桥接至 `inst-hub-001`，属性仍显示 PI 身份与 `DEMO_SUBSTITUTE`。

## 代码路径

```
workbench-v2/experiments/vehicle-snapshot-adapter/
  vehicle-snapshot-client.mjs
  vehicle-tree-ui.mjs
  tests/vehicle-snapshot-client.test.mjs
workbench-v2/main.js, index.html, styles.css  # 挂载
workbench-v2/experiments/inspection-bridge/   # canInspectGeometry 门禁
```

数据源：`src-experiments/vehicle-snapshot-v1/fixtures/*.json`

## 验证

```bash
node workbench-v2/experiments/vehicle-snapshot-adapter/tests/vehicle-snapshot-client.test.mjs
node workbench-v2/tests/project-store.test.mjs
node workbench-v2/tests/browser-smoke.mjs   # 需 npm start + Chrome
```

## 布局（返工）

左栏三区块 `<details>` 可折叠，各自 `pane-scroll` 独立滚动；`#paneVehicle` / `#paneProject` / `#paneCatalog` 在 CDP 中做 boundingClientRect 不交叠断言（1600×1000、1500×920、1280×800）。

截图：`F:\tmp\carlab_v2_test_images\08-layout-1500x920-expanded-tree.png`、`09-layout-1280x800-expanded-tree.png`

## 未做

- 未播放 `demoMotionView` / 未填 R-16 Frame 世界位姿。
- `conflictRegister` 完整列表 UI 待迭代。