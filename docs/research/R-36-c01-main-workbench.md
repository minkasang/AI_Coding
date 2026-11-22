# R-36 C-01 左前轮端静态样板 × 5173 主工作台

## 行为

- 从**整车工程树**点选 C-01 九实例之一（`PI-20-016-FL`、`PI-30-00x-FL`、`PI-30-009-FL-0n`）→ 进入 **C-01 静态工装**视窗（9 个 `PI-*` 节点，同一 `wheel-end.glb`）。
- 不再与旧 `wheel_hub_assembly.glb` 双显；`DEMO_SUBSTITUTE` + `STATIC_WORKHOLDING_DEMO` 文案在标题/检查器体现。
- **载入轮端示例** 或点选非 C-01 整车实例 → 恢复原三件 DEMO 工程。

## 代码

| 路径 | 作用 |
|------|------|
| `workbench-v2/c01-viewport-mode.mjs` | `loadWheelEndVerifiedPackageFromUrls` 一次取字节 + `blob:` GLB |
| `wheel-end-asset-binding-v1/binding.mjs` | `loadWheelEndVerifiedPackageFromUrls`（原 URL 加载器复用） |
| `workbench-v2/main.js` | `ensureC01Assets` / `blockC01Load`、`swapEngineeringStore`、C-01 进/出 |
| `workbench-v2/viewport.js` | `load()` 切换 GLB 时清空旧实例 |

## 验证

```bash
node workbench-v2/tests/c01-binding-gate.mjs
node workbench-v2/tests/c01-workbench-smoke.mjs
node workbench-v2/tests/browser-smoke.mjs
```

失败时：`__CARLAB_C01_BLOCKED__` 有错误码，视窗保持三件 DEMO，左栏 help 说明原因。

## 已知限制

- 未挂 R-28 运动；未做整车 Frame 放置。