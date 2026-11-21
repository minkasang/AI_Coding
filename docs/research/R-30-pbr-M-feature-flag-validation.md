# R-30｜真实工作台 PBR 材质 M 单变量受控验证

> 版本：v1.0 / 2026-11-21 · 负责人：HY4（画质研究 · 独立缺口审计）
> 任务书：`docs/tasks/R-30-pbr-M-feature-flag-validation.md`
> 上游依据：`docs/command/reviews/AUDIT_2026-11-15_BATCH6.md` 判 R-24 `APPROVED（渲染 AB 证据和候选补丁）`，同时明确「未修改生产 viewport.js，不能说外观已上车」，并开放 R-30「对已有 V2 轮端单变量 M 做可开关集成验证」。
> 状态：**SUBMITTED，等待 GPT-6 审核**；补丁候选为 `PROPOSAL_NOT_APPLIED`，生产文件零改动。

---

## 1. 任务与边界

R-24 回答了「哪个变量值得进生产候选」：M（恢复 GLB 原生 `metalness` / `roughness`）单独贡献 94.8% 的对比度增益，四变量近似线性可加，但整包合入会发白（发白量是 M 的 5.2 倍），因此只推荐 M。

R-30 不再讨论「要不要 M」，而是回答工程落地问题：

> **把 M 做成一个默认关闭、可一键回退的开关之后，它在真实生产 `EngineeringViewport` 上会不会破坏工作台已有能力（测距、属性、剖切、拆解、成本）？**

任务书规定的边界，本轮全部遵守：

- 只在 `viewer/experiments/render-release-v1/` 内实现受控 adapter，**不修改 `workbench-v2/` 任何文件**；
- 以**真实 V2 `EngineeringViewport`**（不是替身、不是 mock）复验 3 种状态：未选中、选中+爆炸、选中+剖切；
- 禁止整包调曝光、灯光、地面高度；GLB 单位 m、Y-up 保持；
- 必须跑 V2 store、浏览器 smoke 和可重复的单变量指标检查；标明合入/未合入及回退方式；
- SwiftShader 不得冒充真实 GPU FPS。

---

## 2. 开工前基线冻结与并行写入核查

按 `AGENTS.md` → `PROFILE.md` → 本人任务卡 → `brief` → 公共消息的顺序读取，并于 `2026-11-21 15:44` 做实时复核（摘要里的 `ready` 不盲信）。

### 2.1 状态盘点

| 项 | 实测结果 |
|---|---|
| R-24 及 `R-24-S01..S04` | 全部 `approved`（`AUDIT_2026-11-15_BATCH6.md`） |
| HY4 待办 | 仅 `R-30`（03.32），`ready` |
| 5173 / 5174 | 均 HTTP 200（总控已恢复，新增 `scripts/start-carlab.ps1`） |
| 5175 / 5181 | 未启用，本轮也未启用 |

### 2.2 文件锁判定

`git status` 显示 `composer-2-5` 正在改：
`workbench-v2/index.html`、`main.js`、`styles.css`、`tests/browser-smoke.mjs`、
`experiments/inspection-bridge/inspection-bridge.mjs`、`experiments/vehicle-structure-adapter/known-cad-map.mjs`，
并新增 `experiments/vehicle-snapshot-adapter/`（对应 R-29）。

**结论**：HY4 全程只读上述文件。`workbench-v2/viewport.js` 不在修改列表中，且本轮结束时仍不在——可复验。

### 2.3 改动前回归基线

| 检查 | 基线 |
|---|---|
| `project-store.test.mjs` | 11/11 pass |
| `camera-follow.test.mjs` | 6/6 pass |
| `browser-smoke.mjs` | `BROWSER_SMOKE_PASS`，未捕获异常 0 |
| 5173 / 5174 | 200 / 200 |

---

## 3. 输入：GLB 原生 PBR 事实

从 `viewer/experiments/engineering-viewer/assets/wheel_hub_assembly.glb` 实测（`glb-pbr.mjs` 运行时读取，不硬编码）：

| 零件 | `instanceId` | 材质名 | metalness | roughness |
|---|---|---|---|---|
| hub | `inst-hub-001` | `Mat_Part_Hub` | 0.85 | 0.25 |
| bearing | `inst-bearing-001` | `Mat_Part_Bearing` | 0.95 | 0.12 |
| studs | `inst-studs-001` | `Mat_Part_WheelStuds` | 0.80 | 0.50 |

其余事实：

- 单位 `m`，Y-up；包围盒 `min[-0.076,-0.042,-0.076]` / `max[0.076,0.045,0.076]`，尺寸 `0.152 × 0.087 × 0.152`；
- `11590` 三角形、3 个 mesh 实例、`6` geometries、`2` textures、`0` 外部贴图（材质为纯数值 PBR）。

生产覆盖值（`workbench-v2/viewport.js:166-167`）：

```js
mat.metalness = 0.70;
mat.roughness = 0.34;
mat.envMapIntensity = 1.05;
```

三者把三档原生 PBR 统一压成一档 `0.70/0.34`，`envMapIntensity` 保持 `1.05` 不动。

---

## 4. 受控开关设计

### 4.1 三个必须满足的性质

| 性质 | 为什么必须 | 实现 |
|---|---|---|
| 默认关闭 | 合入前生产外观不能变 | `DEFAULT_ENABLED = false` |
| 精确回退 | 出问题时能回到「和没合入一样」 | `_writeLegacy()` 无条件写 `LEGACY_PBR` |
| 幂等 | 反复切换不漂移 | `setEnabled()` 先比对当前状态，相同则直接返回 |

### 4.2 为什么回退不能依赖快照

直觉写法是「进入时记下每个材质原值，退出时还原」。这在**已开启**状态下调用 `disable()` 时会失效：
此时记下的「原值」是 GLB 原生分档，还原后停在原生 PBR 上——日志显示「已禁用」，画面却仍是新外观。

本实现改为无条件写常量：

```js
_writeLegacy() {
  for (const { mat } of this._materials()) {
    mat.metalness = LEGACY_PBR.metalness;             // 0.70
    mat.roughness = LEGACY_PBR.roughness;             // 0.34
    mat.envMapIntensity = LEGACY_PBR.envMapIntensity; // 1.05
  }
  this.missingTargets = [];
}
```

语义与 `viewport.js:166-167` 完全等价，任何调用顺序都收敛到同一状态。`LEGACY_SOURCE`
字段如实标注来源行号，便于审计对照。

### 4.3 为什么需要 `reapply()`

`viewport.sync()` 按 seed 重建实例，并给每个材质重新写 `0.70 / 0.34 / 1.05`。
flag 开着时 sync 一次，新增或重建的零件就会回到旧值，场景变成**混合态**：
部分零件用原生分档、部分零件用统一覆盖值。此时画面既不是 off 也不是 on，指标无法解释。

因此注入候选第 2 步：

```js
// sync() 末尾，_updateClipBounds() 之后
if (this.mPbrFlag) this.mPbrFlag.reapply();
```

单测专门覆盖此场景：`sync` 后新增零件确实被 `reapply()` 拉回开启态分档。

### 4.4 未知零件退化

若零件在 `templates` 中找不到对应 GLB 材质，`_writeNative()` 退化为 `LEGACY_PBR` 并记入
`missingTargets`，**不静默、不抛错**。这样换资产或加零件时，最坏情况是「这个零件保持旧外观」，
而不是「整个场景渲染崩掉」。

---

## 5. 验证方法：3 状态 × 2 机位 × flag(off/on)

### 5.1 状态与机位

| 状态 | 内容 |
|---|---|
| `none` | 未选中，`selectedId = null`，`explode = 0`，剖切关闭 |
| `selectExplode` | 选中 hub + 爆炸 `1` |
| `selectClip` | 选中 hub + 剖切 `y` 轴 `t = 0.55` |

机位：`iso`（`dir [0.92, 0.78, 1.12]`，`dist 0.485`，`fov 38`）与 `side`。

共 12 帧。所有帧固定：`1280 × 800`、`pixelRatio 1`、曝光 `1.18`、hemi `0.9`、sun `2.0`、
fill `0.9`、地面 `-0.096`、网格 `-0.095`、`ACESFilmic`、`SRGB`、`PCFSoft`、几何法线不改。

### 5.2 headless 渲染的两个技巧

`--virtual-time-budget` 不推进 `requestAnimationFrame`，直接截图会得到空白。处理：

1. 停 `setAnimationLoop`，改为同步 `render()` × 3 后 `gl.finish()`；
2. 预建 `preserveDrawingBuffer: true` 的 WebGL2 context，交给生产 `WebGLRenderer` 复用，
   否则截图拿到的是被清空的缓冲。

每帧做 `(5,5)` 背景像素自检，本轮 12 帧恒为 `[238,243,248,255]`，确认无空白帧。

### 5.3 测距一致性：一次假结论与它的修法

第一版测得 off `47.68 mm` vs on `67.78 mm`，看上去像「M 改变了测距」。追查后是两个独立缺陷叠加：

| 缺陷 | 表现 | 修法 |
|---|---|---|
| 场景状态未固定 | 第二次测距跑在上一帧 `selectClip` 下 | 先 `sync(STATES[0])` + 关剖切 |
| 机位未固定 | 相机被上一帧 `side` 改过，`intersectPointer` 射线角度不同 | 补 `setCamera(VIEWS[0])` |

修完仍浮动（`109.32` 前后），因为 `flag` 自身也要在同一状态下重放。最终收敛为
`measureInNeutralState()` 一次性固定 **场景状态（none）+ 剖切关闭 + 机位（iso）+ flag**：

```js
function measureInNeutralState() {
  view.sync(snapshotOf(STATES[0]), catalog);
  syncAxialClip(view.renderer, view.modelLayer, clipPlane, STATES[0].clip, view.getClipBounds());
  flag.reapply();
  setCamera(VIEWS[0]);
  return runMeasure(view);
}
```

此后 off / on 均得 `66.75 mm`，逐位相同。

**第二个修正是跨零件命中**：`findHits()` 原先按网格扫描顺序取前两个点，两个点常落在
`inst-studs-001` 同一实例的不同位置。同零件两点也能算出距离，但证明不了链路对多个零件都有效。
改为先按 `instanceId` 去重取代表点，优先返回不同实例：

```js
const byInstance = new Map();
for (const hit of all) if (!byInstance.has(hit.instanceId)) byInstance.set(hit.instanceId, hit);
const distinct = [...byInstance.values()];
if (distinct.length >= count) return distinct.slice(0, count);
return all.slice(0, count);
```

结果命中 `inst-studs-001` 与 `inst-hub-001`，距离 `66.75 mm`，off / on 一致。

---

## 6. 结果一：flag 行为正确

来源 `results/release-check.json`（主跑）与 `results/release-check.repeat.json`（复跑），两者逐字节一致。

| 断言 | 结果 |
|---|---|
| 默认关闭，且关闭时不写任何 PBR 字段 | PASS |
| off 直方图只有 1 档 `0.7/0.34`（3 个材质） | PASS |
| on 直方图恢复 3 档 `0.85/0.25`、`0.95/0.12`、`0.8/0.5` | PASS |
| on 不改 `envMapIntensity`（仍 `1.05`） | PASS |
| 首次 `disable()` 精确回退，违规 0 条 | PASS |
| 最终 `disable()` 精确回退，违规 0 条 | PASS |
| 幂等：on→off→on 与首次 on 完全一致 | PASS |
| `reapply()` 修复 sync 造成的混合态 | PASS（单测） |
| 未知零件退化为旧值并记入 `missingTargets` | PASS（单测） |
| 不碰非 PBR 字段（`color` / `emissive` / `visible` / `clippingPlanes` 等） | PASS |
| 缺依赖时显式失败，不静默通过 | PASS（单测） |

`status()` 输出包含 `enabled`、`defaultEnabled`、`switches`、`appliedMaterials`、`legacy`、
`legacySource`、`nativeParts`、`missingTargets`、`rollback`、`fileLock`——审计时不必读代码也能判断当前态。

---

## 7. 结果二：画质增益（6 组配对）

| 状态 / 机位 | 对比度（`lumaStdDev`） | 边缘梯度 | 近白比变化 |
|---|---|---|---|
| none / iso | 29.054 → 33.992（**+17.0%**） | 2.7949 → 3.7242（+33.2%） | +0.0052 |
| none / side | 36.789 → 42.262（**+14.9%**） | 2.8289 → 3.7502（+32.6%） | −0.0009 |
| selectExplode / iso | 34.108 → 46.362（**+35.9%**） | 3.1475 → 4.9172（+56.2%） | +0.0087 |
| selectExplode / side | 37.888 → 50.694（**+33.8%**） | 3.3643 → 4.9766（+47.9%） | +0.0034 |
| selectClip / iso | 22.177 → 28.187（**+27.1%**） | 2.0423 → 2.8420（+39.2%） | +0.0053 |
| selectClip / side | 19.797 → 25.507（**+28.8%**） | 2.1465 → 2.7885（+29.9%） | −0.0008 |

- 平均对比度 **+26.3%**，平均边缘梯度 **+39.8%**。
- 近白比变化 **−0.0009 ~ +0.0087**（绝对 < 0.9 个百分点）→ **不发白**。
  这与 R-24「组合发白是 M 的 5.2 倍」不矛盾：本轮只开 M，不含 G / H / S。
- 增益在 `selectExplode` 最大：零件分离后高光分档更易被观察到；`selectClip` 次之，
  因剖切面本身引入中性截面，摊薄了整体统计。

目视核对 `shot-off-selectExplode-iso.png` 与 `shot-on-selectExplode-iso.png`：
off 的轴承环与法兰偏平、高光弥散；on 的轴承环出现集中高光、法兰边缘更利，螺栓头部可辨。
画面变化与数值方向一致。

---

## 8. 结果三：功能与成本未被破坏

| 项 | 结果 |
|---|---|
| `draw calls` | 12 帧全为 `5`，off / on 相同 |
| `triangles` | 12 帧全为 `11590`，off / on 相同 |
| `geometries` / `textures` | 全帧 `6` / `2`，off / on 相同 |
| `clipBounds` | 6 个 state/view 组合全部相同（`x/y/z` 三轴逐值比对） |
| 真实 `MeasureTool` 距离 | off `66.75 mm` = on `66.75 mm` |
| 格式化读数 | 两态均 `66.75 mm（0.0668 m）` |
| 测距命中实例 | `inst-studs-001` + `inst-hub-001`（跨零件） |
| 背景像素自检 | 12 帧恒 `[238,243,248,255]`，无空白帧 |
| 非 PBR 字段 | 6 个 state/view 组合逐字节一致（`nonPbrStable = true`） |

**成本零变化符合预期**：M 只改材质标量，不增几何、不增贴图、不增 draw call。

> 口径说明：`snapshotOff` 在 `none` 状态采集，`snapshotOn` 在最后应用的 `selectClip` 状态采集，
> 二者 `emissive` / `clippingPlanes` 天然不同，**不能当同状态对照**。非 PBR 稳定性的权威证据
> 是 per-frame `stateRows` 的 off vs on 逐字节比对。

---

## 9. 工作台回归（改动后）

| 检查 | 改动前 | 改动后 | 结论 |
|---|---|---|---|
| `workbench-v2/tests/project-store.test.mjs` | 11/11 | 11/11 pass | 一致 |
| `tests/camera-follow.test.mjs` | 6/6 | 6/6 pass | 一致 |
| `workbench-v2/tests/browser-smoke.mjs` | `BROWSER_SMOKE_PASS`，异常 0 | `BROWSER_SMOKE_PASS`，异常 0 | 一致 |

本轮未写 `workbench-v2/` 任何文件，因此回归一致是「隔离未越界」的证据。
它**不能**证明「flag 合入后生产也不会坏」——那需要 Composer 在 5173 主页重跑同一组回归。

---

## 10. 与 R-24 的跨轮可比性

| 场景 | R-24 记录 | 本轮 | 差异 |
|---|---|---|---|
| `selectExplode/iso` off | `0.433843 / 34.108 / 3.1475` | `0.433843 / 34.108 / 3.1475` | 0 |
| `selectExplode/iso` on | `0.442567 / 46.362 / 4.9172` | `0.442567 / 46.362 / 4.9172` | 0 |

换实验目录、换驱动脚本、中间加了一层 flag 之后，同一场景仍复现同一组数值，
说明指标口径没有漂移，本轮数字可以直接与 R-24 结论并列使用。

反过来也说明 flag 层的存在**没有改变渲染语义**：它在 off 时写回的值与生产覆盖值逐位相同，
所以同一场景的 off 帧必然与 R-24 基线帧一致。

---

## 11. 结论、风险与下一步

### 11.1 结论

1. M 可以做成**默认关闭、可一键回退、幂等、可 reapply** 的受控开关，行为符合预期，无混合态残留。
2. 开启后 6 组场景对比度平均 **+26.3%**、边缘梯度 **+39.8%**，近白比变化 < 0.9 个百分点，**不发白**。
3. 不破坏测距（`66.75 mm` 两态一致、跨零件命中）、剖切（6 组 `clipBounds` 相同）、
   选中/爆炸/高亮（非 PBR 字段逐字节一致）、成本（`5` calls / `11590` tris 不变）。
4. 与 R-24 数值完全对齐，指标口径可跨轮复用。

### 11.2 风险与未覆盖部分

| 风险 | 说明 |
|---|---|
| 无真实 GPU 数据 | SwiftShader 只支持像素级截图与 `renderer.info`，不谈 FPS / 帧时间 / 显存 |
| 未在生产 UI 跑交互 | 实验页复用生产类与真实 fixture，但未在 5173 主页做点击链路回归 |
| 单资产 | 只验证 `wheel_hub_assembly.glb`；换资产分档会变，需重跑第 2 组断言 |
| PBR 数值非厂商值 | 全部 `VISUAL_ASSUMPTION`，不得作为材料参数或 OEM 认证引用 |
| `nearWhiteRatio` 受浅色背景污染 | `#eef3f8` 占比较大，只作组间可比，不作物理亮度评分 |
| `selectClip` ROI 偏大 | 剖切不改变逻辑可见性，ROI 略大于实际可见部分，固定口径下仍可比 |

### 11.3 下一步建议

1. 若批准合入：由 **Composer** 在 `workbench-v2/viewport.js` 落地候选的 2 行注入 +
   搬迁 2 个 adapter 文件，`enabled` 默认 `false`，配置来源建议 `?mPbr=1` 或 localStorage。
2. 合入后**必须**在 5173 主页重跑 `project-store.test.mjs`、`camera-follow.test.mjs`、
   `browser-smoke.mjs`，并手动确认选中高亮颜色、剖切截面、爆炸视图无异常。
3. 先小范围开启（单页/单用户）观察，再考虑默认开启；默认开启前应有真实 GPU 复核。
4. 若要继续优化，**另起一轮**处理 G（地面高度），不要与 M 同轮；R-24 已证明二者存在 28.6% 交互项。
5. H / S 仍不建议进入生产候选。

---

## 12. 交付清单

| 文件 | 内容 |
|---|---|
| `viewer/experiments/render-release-v1/README.md` | 复现命令、设计理由、结果摘要、边界 |
| `viewer/experiments/render-release-v1/m-pbr-flag.mjs` | 受控 adapter（纯逻辑，Node/浏览器共用） |
| `viewer/experiments/render-release-v1/glb-pbr.mjs` | GLB 原生 PBR 读取 |
| `viewer/experiments/render-release-v1/main.js` | 真实 `EngineeringViewport` 12 帧驱动 |
| `viewer/experiments/render-release-v1/run-checks.mjs` / `verify.mjs` | 驱动脚本与 9 组断言 |
| `viewer/experiments/render-release-v1/tests/m-pbr-flag.test.mjs` | 10 项纯逻辑单测 |
| `viewer/experiments/render-release-v1/patch-candidate.json` | `PROPOSAL_NOT_APPLIED` 逐行候选 + 三种回退 |
| `viewer/experiments/render-release-v1/results/release-check.json` | 主跑 12 帧全量数据 |
| `viewer/experiments/render-release-v1/results/release-check.repeat.json` | 复跑，逐字节一致 |
| `viewer/experiments/render-release-v1/results/shot-*.png`（12 张） | off / on 成对目视对照 |
| `docs/research/R-30-pbr-M-feature-flag-validation.md` | 本文 |
| `agent-workspace/agents/hy4/reports/R-30.md` | 个人回报 |
| `agent-workspace/shared/messages/MSG-20261121-hy4-to-gpt6-r30-handoff.md` | 给总控 / Composer 的交接 |
