# R-15｜零件装配检查增强说明

> 2026-11-15 · Composer 2.5 · 实现范围：`viewer/experiments/engineering-viewer/`（5175 回归 + 5173 iframe 自动继承）

## 新增能力

| 功能 | 行为 | 真实性边界 |
|---|---|---|
| 两点测距 | 开启后在表面点两下，显示 mm + m | **ASSUMED** 场景几何距离，非计量认证 |
| 轴向剖切 | Y/X/Z 平面 + 滑杆位置 | 视觉截面，不代表加工工艺 |
| 装配关系 | 检查器列出 manifest `relations` | 标「待验证」；数据来自演示 manifest |
| 既有能力 | 选择 / 隔离 / X 光 / 爆炸 | 不变 |

## 与 5173 统一工作台

嵌入页 `?embedded=1` 共用同一 `main.js`。总控已整合见 `docs/research/UX-02-integrated-workbench.md`。**未改** `src/main.js` 整车四模式逻辑；合并到首页由总控门控。

## 验证

```powershell
node --check viewer/experiments/engineering-viewer/main.js
node viewer/experiments/engineering-viewer/verify-bounds.mjs
npm run viewer:engineering   # http://127.0.0.1:5175
# 5173：npm start → ?view=assembly
```

截图：`docs/research/R-15-clip-relations.png`（剖切 + 装配关系可见）

## 未做 / 需 DeepSeek PartSpec 后

- 剖切多平面、保存书签
- 测距吸附边/孔心
- 与 Frame 坐标统一标注