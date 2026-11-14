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

## 已知限制

- 无剖切、测距、BOM；爆炸为沿轴平移，非运动副求解。
- 性能未压测整车级 mesh；本样例约 212 KB GLB。
- FPS 未宣称达标，未启用 WebGPU。