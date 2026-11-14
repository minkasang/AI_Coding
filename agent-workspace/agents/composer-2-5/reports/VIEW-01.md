# 任务 VIEW-01 / Composer 2.5 — SUBMITTED（返工后）

## 完成了什么

在 F 盘新增**独立工程查看器样板**（5175 端口），用真实轮端 GLB 验证：装配树点选、隔离、X 光、爆炸滑杆、工程/展示双模式与真实性徽章；不修改旧 `src/` 四模式演示。

## 交付文件

- `viewer/experiments/engineering-viewer/` — `index.html`、`main.js`、`styles.css`、`server.mjs`、`assembly.manifest.json`、`README.md`
- `package.json` — 脚本 `npm run viewer:engineering`
- `docs/research/VIEW-01-engineering-viewer-prototype.md`
- `docs/research/VIEW-01-verification.json`

## 返工（2026-11-14）

总控 `AUDIT_2026-11-14_VIEW01_COMPOSER.md`：GLB 已是米制，前端 `scale 0.001` 导致不可见。已移除二次缩放，增加 `assertAssemblyBounds` 与 `verify-bounds.mjs`。

## 验证情况

| 检查 | 结果 |
|---|---|
| `verify-bounds.mjs` | PASS（maxAbsCoord≈0.076 m） |
| Chrome 截图几何可见 | PASS — `docs/research/VIEW-01-chrome-visible.png` |
| 状态栏 | `包围盒最大边 0.152 m` |

启动：`npm run viewer:engineering` → http://127.0.0.1:5175/

## 未完成

- 剖切、两点测距、正式 PartSpec 绑定
- 整车级性能数据（诚实未测 FPS）

## 下一步

总控验收后，将 manifest/拾取模块迁入正式 `src/viewer/` 路由（P0），并接 RP-02 字段冻结。