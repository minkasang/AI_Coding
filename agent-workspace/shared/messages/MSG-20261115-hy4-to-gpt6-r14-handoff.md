---
id: MSG-20261115-hy4-gpt6-r14-handoff-01
from: hy4
to: gpt-6, composer
taskId: R-14
kind: handoff
status: open
subject: R-14 可复验 A/B 实验已提交；「真实阴影替换假 AO 会更飘」有像素级证据，未擅改 5173
createdAt: 2026-11-15T01:56:00+08:00
---

## 结论先行

`R-14`（03.16）已由 HY4 完成并置 `submitted`，等待总控审核。正式报告：`docs/research/R-14-render-prototype.md`；
可运行实验：`viewer/experiments/render-quality-v1/`（独立 5181 服务）。
**本轮没有改 `src/`、`index.html`、`src/workbench-ui.js` 或 5173 生产页面**，符合任务书「生产页面暂不擅改」。
5173 五视图「小车工程工坊」仍是唯一用户入口，未新建任何分散查看器。

## 给总控的一条可派工结论

在 `viewer/experiments/render-quality-v1/` 做了 2×2 全因子（法线 N × 接地 G），`node verify.mjs` 为 `FINAL_CHECKS_FAIL=0 / PASS`。
其中 **G 的结果反直觉，值得优先排下一轮**：

| 接地指标 | G0 假 AO 贴片 | G1 真实 PCF 软阴影 |
|---|---|---|
| 接触带最暗值 | 73.92 | **84.10（变亮）** |
| 中心/两侧亮度比 | 0.6168 | **0.7156（接触中心变亮）** |
| 左右不对称 | 5.609 | **0.418** |

即：**单纯「删掉假 AO 贴片 + 打开真实阴影」会让轮胎更飘**。截图里 G1 只剩左下一小片淡灰影。
原因是现有 `HemisphereLight 0.58 + environmentIntensity 1.0` 把主阴影填平了，而假 AO 是 `MeshBasicMaterial + toneMapped:false`、
不受光照影响，反而成了画面里唯一有效的接地线索。这首次用像素数字坐实 R-05 §0 的推断。

**建议下一轮把「降低环境填光 / 收窄阴影相机 / 提高接触遮蔽对比」作为同一组变量一起调**，
用本实验台的 `centerEdgeRatio / contactMin / asymmetry` 三个数字验收，而不是只做一个开关。
本轮刻意没有调填光，否则会引入第三个变量、破坏单变量隔离；因此 G1 偏淡是**实验条件**，不是「真实阴影无效」的定论。

## 给 Composer 的集成边界

- 实验台若要进 5173 第五视图或生产页面，请由负责该页面的工作位执行；HY4 **不擅自改生产入口**。
- `toCreasedNormals` 需要 `clone()` 几何，实验里未 dispose 旧几何，`renderer.info.memory.geometries` 从 38 增至 51（+13）。
  任何落地方案必须先释放旧几何或一次性处理共享几何；这是成本，不是收益。
- `preserveDrawingBuffer: true` 只是为读像素而开，有额外拷贝开销，不应成为生产默认配置。
- 实验跑在 headless SwiftShader 软件光栅化上，**没有、也不会给出真实 GPU FPS / 帧时间 / 显存数字**。

## 复现

```bash
cd viewer/experiments/render-quality-v1
node run-ab.mjs     # 自动启停 5181，四组指标 JSON + 四帧截图
node verify.mjs     # 退出码即结论
```

## 不做什么

不修改已批准的 `RP-05` / `R-05` 交付物；不修改 `MASTER_PLAN.md`、`GAP_REGISTER.md`、审核记录或其他模型产物；
不自行把 `R-14` 置 `approved`；不替用户传话。HY4 等待总控审核结果后再领取下一任务。
