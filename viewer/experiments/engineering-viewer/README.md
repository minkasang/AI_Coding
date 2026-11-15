# 工程查看器样板（VIEW-01）

独立于 `src/` 的轮端总成实验页，验证 RP-06 提出的选择 / 隔离 / 爆炸 / 双模式 / 真实性标注。

## 运行

```powershell
cd F:\project\cyq\AI_Coding\car
npm run viewer:engineering
```

Chrome：**http://127.0.0.1:5175/**（端口 5175，不影响 5173 演示与 5174 看板）

## 缺少 GLB 时

```powershell
.\.venv\Scripts\python.exe .\cad\experiments\planning_feasibility\verify_assembly.py
```

产出：`cad/experiments/planning_feasibility/out/wheel_hub_assembly.glb`

## 模块划分（供正式 Viewer）

| 模块 | 文件 | 职责 |
|---|---|---|
| 壳层 | `index.html` + `styles.css` | 三区布局、真实性徽章 |
| 运行时 | `main.js` | 加载、拾取、隔离、爆炸、模式 |
| 数据 | `assembly.manifest.json` + 侧车 metadata | 零件映射与来源标注 |
| 服务 | `server.mjs` | 只读静态；允许 `/cad/`、`/node_modules/` |

## 单位自检

```powershell
node viewer/experiments/engineering-viewer/verify-bounds.mjs
```

GLB 已为米制；浏览器**不得**再 `scale.setScalar(0.001)`。

## R-15 增强（测距 / 剖切）

- **两点测距**：工具栏开启后在表面点两下；检查器显示 mm 与 m（非计量认证）。
- **剖切**：轴向 Y/X/Z + 位置滑杆；视觉截面 only。
- **装配关系**：来自 `assembly.manifest.json` 的 `relations`，检查器标「待验证」。

## 已知限制

- 爆炸为沿轴平移，非运动副求解；无正式 BOM/PartSpec 绑定。
- 性能未压测整车级 mesh；本样例约 212 KB GLB。
- FPS 未宣称达标，未启用 WebGPU。