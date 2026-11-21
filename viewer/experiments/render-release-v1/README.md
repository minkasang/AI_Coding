# render-release-v1 — M 单变量受控 feature flag 验证（R-30）

本目录是 **R-30** 的隔离实验环境。目标不是再做一次参数比较，而是把 R-24 已获批的结论
「只恢复 `metalness` / `roughness` 到 GLB 原生分档」做成一个**默认关闭、可一键回退、幂等、可 reapply**
的受控开关，并在**真实生产 `EngineeringViewport`** 上验证它不破坏工作台既有能力。

**本目录不写 `workbench-v2/` 任何文件。** `workbench-v2/viewport.js` 全程只读、零改动。
合入与否由 `gpt-6` 与 `composer-2-5` 决定；本目录只产出 `PROPOSAL_NOT_APPLIED` 候选。

---

## 1. 它解决什么问题

R-24 证明了 M 有效（单变量贡献 94.8% 对比度增益），但留下三个工程问题：

| 问题 | 后果 | 本轮处理 |
|---|---|---|
| 直接改生产 `viewport.js:166-167` | 无法回退，出问题只能改代码 | 改成 flag，默认关闭；`disable()` 无条件写回旧值 |
| 已开启状态下再 `disable()` | 若依赖「进入时快照」，会回错值 | **无条件写 `LEGACY_PBR`**，与 `viewport.js:166-167` 完全一致 |
| `viewport.sync()` 会重建/新增零件并写旧值 | 出现「部分零件新、部分零件旧」的混合态 | `sync()` 末尾调用 `reapply()` 修正 |

---

## 2. 文件职责

| 文件 | 职责 | 是否碰生产 |
|---|---|---|
| `m-pbr-flag.mjs` | 受控 adapter（纯逻辑，不 import three），Node 与浏览器共用 | 否 |
| `glb-pbr.mjs` | 从 `viewport.templates` 读 GLB 原生 PBR 分档 | 否 |
| `main.js` | 实例化**真实** `workbench-v2/viewport.js` 的 `EngineeringViewport`，驱动 3 状态 × 2 机位 × flag(off/on) | 否 |
| `index.html` | 实验页；importmap 指向仓库 `node_modules/three`；`?clean=1` 隐藏 HUD | 否 |
| `run-checks.mjs` | A/B 驱动：一次 Chrome 调用跑完 off → on → off，产出 12 帧 + 测距 + 回退证据 | 否 |
| `verify.mjs` | 9 组断言 | 否 |
| `tests/m-pbr-flag.test.mjs` | adapter 纯逻辑单测 10 项 | 否 |
| `patch-candidate.json` | 逐行最小注入候选，`PROPOSAL_NOT_APPLIED` | 否 |
| `results/` | 12 帧 PNG、`release-check.json`、`release-check.repeat.json`、复跑 PNG | 否 |

---

## 3. 复现命令

前置：5173 已在运行（**复用既有同源服务，不新开常驻端口**）。

```bash
# 1) adapter 纯逻辑单测
node viewer/experiments/render-release-v1/tests/m-pbr-flag.test.mjs

# 2) 主跑：12 帧 + 测距 + 回退证据
node viewer/experiments/render-release-v1/run-checks.mjs

# 3) 确定性复跑
node viewer/experiments/render-release-v1/run-checks.mjs --repeat

# 4) 全部断言（要求 2) 与 3) 都已产出，否则第 9 组会 SKIP）
node viewer/experiments/render-release-v1/verify.mjs

# 5) 工作台回归（证明隔离工作没碰坏既有功能）
node workbench-v2/tests/project-store.test.mjs
node tests/camera-follow.test.mjs
node workbench-v2/tests/browser-smoke.mjs
```

实验页直接访问：`http://127.0.0.1:5173/viewer/experiments/render-release-v1/`
（由 5173 同源提供，不需要额外端口。）

---

## 4. 三个设计决定与理由

### 4.1 `disable()` 必须无条件写回，不能依赖快照

```js
_writeLegacy() {
  for (const { mat } of this._materials()) {
    mat.metalness = LEGACY_PBR.metalness;        // 0.70
    mat.roughness = LEGACY_PBR.roughness;        // 0.34
    mat.envMapIntensity = LEGACY_PBR.envMapIntensity; // 1.05
  }
}
```

若写成「进入时记下原值，退出时还原」，在**已开启**状态下调用 `disable()` 会把「原生值」当成原值还原，
结果停在原生 PBR 上而不是旧值——看上去「回退了」其实没回退。无条件写常量则与
`workbench-v2/viewport.js:166-167` 语义完全等价，任何调用顺序都收敛到同一状态。

### 4.2 `reapply()` 是必须的，不是保险

`viewport.sync()` 会按 `seed` 重建实例并给每个材质重新写 `0.70 / 0.34 / 1.05`。
flag 开着时 sync 一次，新零件就是旧值，场景变成混合态（部分零件新 PBR、部分旧值）。
因此注入候选第 2 步是 `sync()` 末尾 `if (this.mPbrFlag) this.mPbrFlag.reapply();`。
单测专门覆盖此场景：sync 后新增零件确实被 `reapply()` 拉回开启态分档。

### 4.3 测距一致性必须同时固定三件事

`MeasureTool` 的命中点来自 `intersectPointer()`，它**依赖相机**。第一版对比得到
`47.68 mm vs 67.78 mm`，看起来像「M 改变了测距」，实际是两个独立缺陷叠加：

1. 第二次测距是在上一帧 `selectClip` 状态下执行的 → 场景状态不同；
2. 相机还被上一帧 `side` 机位改过 → 射线角度不同。

修法：`measureInNeutralState()` 一次性固定 **场景状态（none）+ 剖切关闭 + 机位（iso）+ flag**，
再重新 `flag.reapply()`。此后 off / on 得 `66.75 mm`，逐位相同。

> 这是「不固定变量就会得出假结论」的实例，已写进代码注释，避免后来者重踩。

另外 `findHits()` 先按 `instanceId` 去重再取点，优先返回**跨零件**命中
（`inst-studs-001` / `inst-hub-001`）。同零件两点也能测出距离，但证明不了
「链路对多个零件都有效」。

---

## 5. 本轮结果摘要

来源：`results/release-check.json`（主跑）与 `results/release-check.repeat.json`（复跑），
两者逐字节一致。

### 5.1 flag 行为

| 项 | 结果 |
|---|---|
| 默认状态 | 关闭（等于生产旧设置） |
| off 直方图 | `{"0.7/0.34": 3}`，只有 1 档 |
| on 直方图 | `{"0.8/0.5":1, "0.85/0.25":1, "0.95/0.12":1}`，3 档，与 GLB 原生一致 |
| 首次 `disable()` | `ok=true`，违规 0 条 |
| 最终 `disable()` | `ok=true`，违规 0 条 |
| 幂等（on→off→on） | `ok=true`，无差异 |
| 非 PBR 字段稳定 | `true`（6 个 state/view 组合逐字节比对） |
| 未知零件 | 退化为旧值并记入 `missingTargets`，不静默 |

### 5.2 6 组配对画质增益

| 状态 / 机位 | 对比度 | 边缘梯度 | 近白比 |
|---|---|---|---|
| none / iso | 29.054 → 33.992（+17.0%） | 2.7949 → 3.7242（+33.2%） | +0.0052 |
| none / side | 36.789 → 42.262（+14.9%） | 2.8289 → 3.7502（+32.6%） | −0.0009 |
| selectExplode / iso | 34.108 → 46.362（+35.9%） | 3.1475 → 4.9172（+56.2%） | +0.0087 |
| selectExplode / side | 37.888 → 50.694（+33.8%） | 3.3643 → 4.9766（+47.9%） | +0.0034 |
| selectClip / iso | 22.177 → 28.187（+27.1%） | 2.0423 → 2.8420（+39.2%） | +0.0053 |
| selectClip / side | 19.797 → 25.507（+28.8%） | 2.1465 → 2.7885（+29.9%） | −0.0008 |

- 平均对比度增益 **+26.3%**，平均边缘梯度增益 **+39.8%**。
- 近白比变化区间 **−0.0009 ~ +0.0087**（绝对值 < 0.9 个百分点）→ **没有发白**，
  与 R-24 判定「发白是 M 的 5.2 倍」不冲突：这是 M 单独开启，不含 G/H/S。
- `selectExplode` 增益最大，因为爆炸视图下零件分离，高光分档更容易被观察到。

### 5.3 成本与功能

| 项 | 结果 |
|---|---|
| draw calls | 12 帧全为 `5`，off/on 一致 |
| triangles | 12 帧全为 `11590`，off/on 一致 |
| clipBounds | 6 组 state/view 全部相同 |
| 测距 | off `66.75 mm` = on `66.75 mm`，命中 `inst-studs-001` / `inst-hub-001` |
| 背景像素自检 | 12 帧恒为 `[238,243,248,255]`，无空白帧 |

### 5.4 与 R-24 的跨轮可比性

`selectExplode/iso` 的 off（`0.433843 / 34.108 / 3.1475`）与 on（`0.442567 / 46.362 / 4.9172`）
与 R-24 记录**完全一致**。这说明：换了实验目录、换了驱动脚本、加了 flag 层之后，
同一场景仍复现出同一组数值——指标口径没漂。

---

## 6. 工作台回归（改动后）

| 检查 | 改动前基线 | 本轮 | 结论 |
|---|---|---|---|
| `project-store.test.mjs` | 11/11 pass | 11/11 pass | 一致 |
| `camera-follow.test.mjs` | 6/6 pass | 6/6 pass | 一致 |
| `browser-smoke.mjs` | `BROWSER_SMOKE_PASS`，异常 0 | `BROWSER_SMOKE_PASS`，异常 0 | 一致 |

注：本轮未修改 `workbench-v2/` 任何文件，回归一致性是「隔离工作未越界」的证据，
不等于「flag 已合入生产」。合入后须由 Composer 在 5173 主页重跑同一组回归。

---

## 7. 回退方式（三种，任选其一）

| 方式 | 操作 | 效果 | 已实测 |
|---|---|---|---|
| A. 运行时 | `flag.disable()` | 无条件写回 `0.70 / 0.34 / 1.05` | 是，违规 0 |
| B. 配置 | 把 `enabled` 置回 `false`，或删掉 `?mPbr=1` | 下次加载不启用 | 是（默认即关闭） |
| C. 代码 | 删除注入的 2 行 + 2 个 adapter 文件 | 行为与合入前完全一致 | 结构上等价 |

---

## 8. 边界与不得声称的事

1. **没有真实 GPU 数据**。全部来自 headless Chrome + SwiftShader 软件光栅化，
   只支持像素级可复验截图与 `renderer.info` 计数。**不声称**任何真实 GPU 的 FPS / 帧时间 / 显存。
2. **PBR 数值是 VISUAL_ASSUMPTION**。来自项目自身 GLB 的 DEMO 材质，
   不是厂商材料参数、OEM 尺寸或计量认证。
3. **未改几何法线**、未调曝光（固定 `1.18`）、未动 hemi / sun / fill、未动地面高度（`-0.096`）。
4. **未在 5173 生产页做点击回归**。实验页复用生产 `EngineeringViewport` 类与真实 fixture，
   但不等于已在生产 UI 跑完整交互链路。
5. **`snapshotOff` 与 `snapshotOn` 不是同状态采样**（前者在 `none`，后者在最后应用的 `selectClip`），
   因此二者的 `emissive` / `clippingPlanes` 字段天然不同。非 PBR 稳定性的权威证据是
   **6 个 state/view 组合上逐帧 `stateRows` 的 off vs on 比对**（`nonPbrStable: true`），
   不要拿那两张快照当同状态对照。
6. **换 GLB 资产后需重跑**。adapter 从 `templates` 实时读原生 PBR，代码不用改，
   但分档数值会变，`verify.mjs` 第 2 组断言必须重跑。
