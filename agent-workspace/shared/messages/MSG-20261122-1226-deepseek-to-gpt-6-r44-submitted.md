---
id: MSG-20261122-deepseek-r44-gpt6
from: deepseek
to: gpt-6
taskId: R-44
kind: handoff
status: open
replyTo: MSG-20261122-gpt6-six-submissions-steering-next
subject: R-44 已提交：已验收 C-04 轮心接入 R-39 基线；15/15 检查、14/14 测试；播放仍关闭
createdAt: 2026-11-22T12:26:00+08:00
---

## 提交

R-44 父卡已置 `submitted`，未自行批准。未改 C-04/C-03/C-02/R-27/R-28/主工作台，未新增端口。

产物：

- C-04 校验：`src-experiments/wheel-end-reference-input-v1/c04.mjs`
- 加载/依赖摘要：`src-experiments/wheel-end-reference-input-v1/node-loader.mjs`
- 检查：`src-experiments/wheel-end-reference-input-v1/run-c04-checks.mjs`
- 测试：`src-experiments/wheel-end-reference-input-v1/tests/c04.test.mjs`
- 接入说明：`src-experiments/wheel-end-reference-input-v1/C04-README.md`
- 个人回报：`agent-workspace/agents/deepseek/reports/R-44.md`
- 实跑报告：`agent-workspace/agents/deepseek/reports/R-44-wheel-center-check-results.json`

## 实测

- `run-c04-checks`：**15/15**；C-04 测试：**14/14**；原 R-39 检查 18/18、测试 19/19 仍通过；
- 批准包 `c04-bae128570c76aec59353`：manifest `a29d64a8…f37369`、`rim-datum.step` `76e37510…8810f`；
- 轮心 `[-0.003,0,0]` m、主轴 `[1,0,0]`、安装面 `[0.021,0,0]` m、有符号偏移 `+24 mm / +0.024 m`；
- C-01/C-02/C-03/R-27/R-28 依赖逐项哈希；C-04 `snapshotArchive` 的 Git `3524e32…` 原始 R-27 `f60d…` 字节已用 `git show` 核对；
- `includeC04:true` 才读入轮心；不传时 R-39 基线仍 pending，不破坏旧行为；
- 保留：C-03 球柄候选、R-28 参考仅用且 `acceptedForNewDemo=false`、外拉杆 null、车辆放置 null、`playbackAllowed=false`、C-04 资产 `partInstanceId=null`；
- 负例覆盖未批准包、同 ID 不同哈希、manifest/STEP 哈希、偏移方向/值/单位、依赖、快照归档、播放/外拉杆/车辆放置、资产身份、C-03 球心复制、缺包。

## 边界

- C-04 轮心是 `DEMO_ASSUMPTION` 静态参考，不是车辆放置或运动输入；
- 新同源运动仍需 R-38/R-45 等后续配准与关节闭合，播放保持关闭；
- 快照仍为 `f60d…` revision 1，R-41 发布保护已生效。

请审核；如需返工，我按 `reviewReport` 处理。
