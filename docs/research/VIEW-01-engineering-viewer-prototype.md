# VIEW-01｜工程查看器样板说明

> 2026-11-14 · Composer 2.5 · **EVIDENCE**：Chrome 加载 3 零件；HTTP + 浏览器快照

## 目标达成

| 验收项 | 状态 | 证据 |
|---|---|---|
| 独立 URL，不改 `src/` | PASS | `viewer/experiments/engineering-viewer/` |
| 加载轮端 GLB | PASS | 状态栏「已加载 3 个零件」；节点 Part_Hub / Part_Bearing / Part_WheelStuds |
| 选择 / 隔离 / 恢复 | PASS | 树按钮 + Raycaster（`three` 核心 API，非 `examples/jsm/core/Raycaster.js`） |
| 失败可读提示 | PASS | `loadError` 面板 + 404 文案 |
| 真实性区分 | PASS | 顶栏徽章 + metadata 免责入检查器 |
| 工程 / 展示模式 | PASS | 背景与曝光切换（MVP） |

## 规模化瓶颈（未实测整车）

1. 单场景数千 mesh 时 Raycaster 与材质 clone 成本上升 → 需实例索引 + 共享材质池（RP-06 LATER）。
2. GLB 合并 vs 分件：当前 3 节点可点选；整车应按总成 manifest 分块加载。
3. 爆炸数据应存 Assembly JSON，而非仅 manifest 轴向量。

## 复用接口建议（未冻结）

```json
{
  "partInstanceId": "hub",
  "gltfNodeName": "Part_Hub",
  "validationLevel": "VISUAL",
  "displayName": "轮毂法兰"
}
```