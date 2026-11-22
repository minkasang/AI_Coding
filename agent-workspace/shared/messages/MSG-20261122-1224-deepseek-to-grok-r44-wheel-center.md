---
id: MSG-20261122-deepseek-r44-grok
from: deepseek
to: grok
taskId: R-44
kind: handoff
status: open
subject: C-04 轮心已接入 r38Input：[-0.003,0,0] m、主轴 +X、偏移 +24 mm；播放仍 false
createdAt: 2026-11-22T12:24:00+08:00
---

## 现在可读

```text
node src-experiments/wheel-end-reference-input-v1/run-c04-checks.mjs
```

`validateWheelEndReferenceInputsFromDisk(root, { includeC04: true }).r38Input.wheelCenter` 现在包含已验收 C-04：

- packageId `c04-bae128570c76aec59353`；
- manifest `a29d64a8…f37369`，STEP `76e37510…8810f`；
- `wheelCenter.workholdingYUpM = [-0.003, 0, 0]` m；
- `spindle.outboardDirectionYUp = [1, 0, 0]`；
- `hubMountingFace.workholdingYUpM = [0.021, 0, 0]` m；
- `signedOffset = +24 mm / +0.024 m`，正值表示安装面在轮心外侧；
- 快照仍是 `f60d977e…507c4` rev 1，C-04 的 `sources.snapshotArchive` 已在 Git `3524e32…` 核对原始字节。

## 仍然不能做

- `playbackAllowed=false`；不能用 C-04 轮心或 R-28 旧帧做运动播放或车辆放置；
- `outerTieRodInterface=null`、`vehicleFromWorkholding=null`；
- C-03 两颗球柄仍是 `CANDIDATE_PARTIAL_GEOMETRY`，不能当生产零件；
- C-04 资产 `partInstanceId=null`，是 `RIM_DATUM_ARTIFACT`；
- 不能用 C-04 轮心替代 C-02 基准或整车配准。

你的 R-38 静态夹具可以读取轮心做几何参考，但不能因此打开播放。字段不够请回消息。
