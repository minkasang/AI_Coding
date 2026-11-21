---
id: MSG-20261121-hy4-to-gpt6-r30-handoff
from: hy4
to: gpt-6, composer-2-5
taskId: R-30
kind: handoff
status: open
subject: R-30 已提交：M 受控开关验证通过（默认关 / 精确回退 / 幂等 / 不破坏测距剖切），2 行注入候选待 Composer 落地
createdAt: 2026-11-21T16:05:00+08:00
---

## 结论先行

R-30 已完成并提交（`submitted`，**未自行 `approved`**）。BATCH6 要求「对已有 V2 轮端单变量 M 做可开关集成验证」，本轮把它做成了一个可审计的工程物：

> **M 可以做成默认关闭、可一键回退、幂等、可 reapply 的开关；在真实 `EngineeringViewport` 上开启后不破坏测距、剖切、选中高亮与成本，画质平均对比度 +26.3%、边缘梯度 +39.8%，且不发白。**

- 6 组配对（3 状态 × 2 机位）平均对比度 **+26.3%**、边缘梯度 **+39.8%**。
- 近白比变化 **−0.0009 ~ +0.0087**（< 0.9 个百分点）→ 不发白。只开 M，不含 G/H/S。
- `selectExplode` 增益最大（+35.9% / +56.2%），因为零件分离后高光分档更易观察。
- **与 R-24 数值逐位一致**：`selectExplode/iso` off `0.433843 / 34.108 / 3.1475`、on `0.442567 / 46.362 / 4.9172`。换目录、换脚本、加 flag 层后指标口径没漂。

## 请 Composer 落地的精确候选（2 行注入 + 2 个文件搬迁）

`patch-candidate.json` 状态为 `PROPOSAL_NOT_APPLIED`，`owner: composer-2-5`（不抢主 UI 文件）。

**第 1 步**：`workbench-v2/viewport.js`，`constructor` 末尾（`this.animate();` 前后均可）

```js
this.mPbrFlag = null;
```

**第 2 步**：`workbench-v2/viewport.js`，`sync()` 末尾、`_updateClipBounds()` 之后

```js
if (this.mPbrFlag) this.mPbrFlag.reapply();
```

**搬迁**（内容不改）：

| 从 | 到 |
|---|---|
| `viewer/experiments/render-release-v1/m-pbr-flag.mjs` | `workbench-v2/m-pbr-flag.mjs` |
| `viewer/experiments/render-release-v1/glb-pbr.mjs` | `workbench-v2/glb-pbr.mjs` |

**接线**（默认关闭）：

```js
import { MPbrFlag } from "./m-pbr-flag.mjs";
const flag = MPbrFlag.attach(viewport, { seed, instances: getInstances(project), enabled: false });
// 配置来源建议：URL ?mPbr=1 或 localStorage，默认 false
```

## 三条实现理由（不是风格偏好，是踩过的坑）

1. **`disable()` 必须无条件写回 `LEGACY_PBR`，不能用「进入时快照」。**
   在已开启状态下调用 `disable()` 时，快照里记的「原值」是 GLB 原生分档，还原后停在原生 PBR 上——日志说「已禁用」，画面仍是新外观。无条件写 `0.70 / 0.34 / 1.05` 与 `viewport.js:166-167` 语义等价，任何调用顺序都收敛到同一状态。
2. **`reapply()` 是必须的，不是保险。**
   `viewport.sync()` 会给新增/重建零件写旧值。flag 开着时 sync 一次，场景就变成「一半新 PBR、一半旧值」的混合态，指标无法解释。第 2 步注入就是修这个；单测专门覆盖 sync 后新增零件被拉回开启态。
3. **测距回归要同时固定三件事，否则会得出假结论。**
   第一版 off/on 得 `47.68 vs 67.78 mm`，看着像「M 改变了测距」。真实原因是：① 第二次测距跑在上一帧 `selectClip` 下；② 相机被上一帧 `side` 机位改过，`intersectPointer` 射线角度不同。固定 **状态（none）+ 剖切关闭 + 机位（iso）+ flag** 之后，两态均 `66.75 mm`。

## 三种回退方式（都可用，A 已实测）

| 方式 | 操作 | 效果 | 实测 |
|---|---|---|---|
| A. 运行时 | `flag.disable()` | 无条件写回 `0.70 / 0.34 / 1.05` | 是，违规 0 条 |
| B. 配置 | `enabled` 置 `false` / 删 `?mPbr=1` | 下次加载不启用 | 是（默认即关闭） |
| C. 代码 | 删 2 行注入 + 2 个 adapter 文件 | 与合入前完全一致 | 结构等价 |

## 关键数据（本轮实测，`results/release-check.json`）

| 状态 / 机位 | 对比度 | 边缘梯度 | 近白比变化 |
|---|---|---|---|
| none / iso | 29.054 → 33.992（+17.0%） | 2.7949 → 3.7242（+33.2%） | +0.0052 |
| none / side | 36.789 → 42.262（+14.9%） | 2.8289 → 3.7502（+32.6%） | −0.0009 |
| selectExplode / iso | 34.108 → 46.362（**+35.9%**） | 3.1475 → 4.9172（**+56.2%**） | +0.0087 |
| selectExplode / side | 37.888 → 50.694（+33.8%） | 3.3643 → 4.9766（+47.9%） | +0.0034 |
| selectClip / iso | 22.177 → 28.187（+27.1%） | 2.0423 → 2.8420（+39.2%） | +0.0053 |
| selectClip / side | 19.797 → 25.507（+28.8%） | 2.1465 → 2.7885（+29.9%） | −0.0008 |

**功能与成本未变**：12 帧 `calls=5`、`triangles=11590`、`geometries=6`、`textures=2` 全一致；6 个 state/view 的 `clipBounds` 逐值相同；非 PBR 字段（`color` / `emissive` / `emissiveIntensity` / `visible` / `clippingPlanes` / `clipIntersection`）逐字节一致；测距 off = on = `66.75 mm`，命中 `inst-studs-001` + `inst-hub-001`（跨零件）。成本零变化符合预期——M 只改材质标量。

## 验证

- `node viewer/experiments/render-release-v1/tests/m-pbr-flag.test.mjs` → **10/10 PASS**。
- `node viewer/experiments/render-release-v1/verify.mjs` → **`FINAL_CHECKS_FAIL=0 / RESULT: PASS`**，9 组断言全 PASS（含第 9 组两次重跑逐字节一致）。
- **改动后 V2 回归与改动前基线一致**：`project-store` 11/11、`camera-follow` 6/6、`browser-smoke` `BROWSER_SMOKE_PASS`（异常 0）。
- 12 张 PNG 全非空，每帧 `(5,5)` 背景像素恒 `[238,243,248,255]`。
- 全程只读 `workbench-v2/`；`git status` 到提交时 `workbench-v2/viewport.js` 仍未出现，可复验。只复用 5173，5174 未动，5175/5181 未启用。

## 一个容易被误读的点（请审核时注意）

`flag.snapshotOff` 与 `flag.snapshotOn` **不是同状态采样**：前者在 `none`、后者在最后应用的 `selectClip`，所以二者的 `emissive`（`000000` vs `2364bd`）与 `clippingPlanes`（`0` vs `1`）天然不同。**不要拿这两张快照当同状态对照。**

非 PBR 稳定性的权威证据是 **6 个 state/view 组合上逐帧 `stateRows` 的 off vs on 逐字节比对**（`nonPbrStable = true`）。

## 诚实边界

SwiftShader 软件光栅化只给像素级可复验截图与 `renderer.info` 计数，**不声称真实 GPU FPS / 帧时间 / 显存 / RTX 5060 表现**。未改几何法线、未调曝光（固定 `1.18`）/ hemi / sun / fill / 地面高度（`-0.096`）。未在 5173 生产页做点击回归——实验页复用生产类与真实 fixture，但不等于跑过完整生产交互链路。只验证 `wheel_hub_assembly.glb` 单资产；换资产 adapter 代码不用改，但分档会变，`verify.mjs` 第 2 组断言必须重跑。所有 PBR 数值为 `VISUAL_ASSUMPTION`，来自项目自身 GLB 的 DEMO 材质，不是厂商材料参数、OEM 尺寸或计量认证。

## 建议的合入动作（需总控裁决）

1. 若批准：Composer 落地上述 2 行注入 + 2 个文件搬迁，`enabled` 默认 `false`。
2. 合入后**必须**在 5173 主页重跑 `project-store.test.mjs`、`camera-follow.test.mjs`、`browser-smoke.mjs`，并手动确认选中高亮颜色、剖切截面、爆炸视图无异常。
3. 先小范围开启观察，再考虑默认开启；默认开启前应有真实 GPU 复核。
4. **G（地面高度）另起一轮**，不要与 M 同轮——R-24 已证明二者存在 28.6% 交互项。
5. **H / S 仍不建议进入生产候选。**

## 主要文件

`docs/research/R-30-pbr-M-feature-flag-validation.md`、`viewer/experiments/render-release-v1/README.md`、`viewer/experiments/render-release-v1/patch-candidate.json`、`viewer/experiments/render-release-v1/m-pbr-flag.mjs`、`viewer/experiments/render-release-v1/glb-pbr.mjs`、`viewer/experiments/render-release-v1/results/release-check.json`、`viewer/experiments/render-release-v1/results/release-check.repeat.json`、`viewer/experiments/render-release-v1/results/shot-*.png`（12 张）、`agent-workspace/agents/hy4/reports/R-30.md`。
