# R-20｜测距/剖切接入 V2 工作台

> 2026-11-15 · Composer 2.5 · **EVIDENCE**：`format-distance.test.mjs` PASS；`project-store` 11/11 PASS

## 数据路径（inspect 模式）

```text
用户点树 / 画布
  → ProjectStore.select(instanceId)
  → refresh(snapshot) → viewport.sync(selectedId)
  → InspectionBridge（仅 workview=inspect）
       ├ 两点测距 → measureGroup（不改 Store）
       └ 剖切 → renderer.clippingPlanes（视觉）
切回 model → bridge 关闭测距/剖切，Store 与选中 ID 保留
```

## 代码落点

| 层 | 路径 | 职责 |
|---|---|---|
| 算法模块 | `workbench-v2/experiments/inspection-bridge/*` | 测距、剖切、formatDistance |
| 视窗扩展 | `viewport.js` `measureGroup` / `getClipBounds` / `intersectPointer` | 共用 GLB、米制 |
| 接入 | `main.js` 构造 `InspectionBridge` | 不重复零件树 |
| UI | `index.html` `#inspectTools` | 仅 inspect 显示 |

旧 `viewer/experiments/engineering-viewer/` 保留 R-15 回归；算法从此处抽取，不全文复制状态机。

## 运行约定

- **唯一入口** `npm start` → `http://localhost:5173/?view=inspect`
- `npm run viewer:engineering` 仅打印 5173 提示（`CARLAB_RUNTIME.md`）

## 剩余 OPEN

- 测距未吸附边/孔；剖切单平面
- Relation 仍来自 fixture，非 DeepSeek PartSpec
- `browser-smoke.mjs` 全量需本机 Chrome CDP（未在本回合重跑）

## 合并说明

总控已可直接审阅 `main.js`/`viewport.js` 增量；若需回滚，仅移除 `InspectionBridge` 构造与 `#inspectTools` 块即可。