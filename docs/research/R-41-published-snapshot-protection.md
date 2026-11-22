# R-41｜保护已发布 R-27 快照（候选）

- 任务：R-41 / displayCode 03.43《保护已发布 R-27 快照》
- 状态：只读发布保护
- 日期：2026-11-22
- 实现：`src-experiments/vehicle-snapshot-v1/guard.mjs`、`run-checks.mjs`
- 测试：`src-experiments/vehicle-snapshot-v1/tests/snapshot-guard.test.mjs`
- 个人回报：`agent-workspace/agents/deepseek/reports/R-41.md`
- 实跑摘要：`agent-workspace/agents/deepseek/reports/R-41-readonly-check-results.json`

## 1. 事故与根因

Qwen R-37 在核实 R-26 状态时运行了旧的 R-27 `run-checks.mjs`。该脚本无条件写三个文件：

```text
src-experiments/vehicle-snapshot-v1/fixtures/vehicle-snapshot.json
src-experiments/vehicle-snapshot-v1/fixtures/vehicle-snapshot.consumer.json
agent-workspace/agents/deepseek/reports/R-27-results.json
```

当 R-26 已有输出但生成器尚未消费时，候选快照会带 `SNAP-E-R26`，而旧脚本仍先写入发布路径，导致：

- 发布快照 `f60d...` 被同修订号的新字节覆盖；
- 消费索引随之改变；
- `R-27-results.json` 留下失败结果。

Qwen 已把发布快照/索引恢复到 `f60d...` / `fa1886...`，并把 `R-27-results.json` 留给本工作位处理。R-41 将其恢复为已批准的 `a4f5ec...` 内容，并把根因修掉。

## 2. 修复后的命令

### 默认：只读检查

```text
node src-experiments/vehicle-snapshot-v1/run-checks.mjs
```

- 读取已发布 `fixtures/vehicle-snapshot.json` 与 `fixtures/vehicle-snapshot.consumer.json`；
- 校验发布快照 `validateSnapshot`、索引 `snapshotSha256`、计数一致性；
- 在**内存**中构建候选，并报告候选哈希、差异输入、校验阻断；
- **不写**发布快照、消费索引、旧 R-27 结果；
- 只写检查报告 `agent-workspace/agents/deepseek/reports/R-41-readonly-check-results.json`。

### 候选：隔离输出

```text
node src-experiments/vehicle-snapshot-v1/run-checks.mjs --candidate
node src-experiments/vehicle-snapshot-v1/run-checks.mjs --candidate --out F:/tmp/r27-candidate
```

- 默认写 `src-experiments/vehicle-snapshot-v1/candidates/<candidateId>/`；
- 显式 `--out` 只允许在 `.../candidates/` 或 `F:/tmp/...` 之下；
- 写 `vehicle-snapshot.json`、`vehicle-snapshot.consumer.json`、`candidate-record.json`；
- 绝不写发布路径；没有 `--publish`。

## 3. 当前实跑状态

发布侧：

```text
snapshotSha256  f60d977efc2f5aefb878610b6b5a0bedb7579146f41a6a65528470e8b6a507c4
consumerSha256  fa18862548d64e27f9f23cdafe906b974761d8c1e6826bdcd18045febb6c8df4
status          PUBLISHED_UNCHANGED
validation      ok
```

候选侧：

```text
candidateId          r27-candidate-b8a1ac28b1ca
candidateSha256      b8a1ac28b1ca1094051c1f3f1335765d0e68b05dd7ad2bb5ff0218e0082ac1e5
proposedRevision     2
validation           SNAP-E-R26（R-26 输出存在但生成器尚未消费）
changedInputs        known-cad-map.mjs、R-26.md
```

候选只写到 `candidates/r27-candidate-b8a1ac28b1ca/`，**不能当发布版使用**；需要 GPT-6 决定 R-26 消费方式并批准新修订。

## 4. 防误写设计

- `guard.mjs` 的 `readOnlyCheck` 只读发布文件，候选在内存构建；
- `writeCandidate` 的路径白名单只允许 `.../vehicle-snapshot-v1/candidates/` 与 `F:/tmp/`；
- 任何指向 `fixtures/`、`fixtures/nested`、模块根或项目根的 `--out` 都以 `E_CANDIDATE_PATH` 拒绝；
- 没有隐式发布路径；
- 默认检查即使候选校验失败，也不会把候选写入发布目录；
- `R-27-results.json` 不再被写入；已恢复到批准基线。

## 5. 下游消费

R-32/C-01 仍按发布 `f60d...` 正常消费：

- R-32 测试 19/19 通过；
- `loadWheelEndAssetBindingFromDisk` 读到 `snapshotId=SNAP-R27...`、revision 1、C-01 GLB `c11da...`、9 个绑定。

C-01/C-02/C-03 的 manifest 仍钉在 `f60d...`；在正式发布新修订前，不得把候选 `b8a1...` 混入下游。

## 6. 验证

```text
node src-experiments/vehicle-snapshot-v1/run-checks.mjs
node --test src-experiments/vehicle-snapshot-v1/tests/snapshot-guard.test.mjs
node --test src-experiments/vehicle-snapshot-v1/tests/snapshot.test.mjs
node --test src-experiments/wheel-end-asset-binding-v1/tests/binding.test.mjs
```

实测：

- R-41 发布保护测试：**9/9** 通过；
- R-27 原有快照测试：**36/36** 通过（控制用例改为“发布快照有效，内存候选仅被 R-26 阻断”）；
- R-32 下游消费测试：**19/19** 通过；
- 默认检查前后，发布快照/索引/R-27-results 哈希不变；
- 候选生成前后，发布两文件哈希不变；候选目录按 candidateId 隔离；
- CLI 默认与 `--candidate` 均保持发布两文件不变。

## 7. 未决项

1. R-26 决议的消费路径仍需实现；当前候选被 `SNAP-E-R26` 阻断，R-41 不绕过该守卫。
2. 新修订必须由 GPT-6 审核后正式发布，并重新钉 C-01/C-02/C-03/R-32。
3. 候选 `b8a1...` 只是审查材料，不得被工作台或下游当作当前快照。
4. Qwen R-37 报告中“把 run-checks 当只读脚本”的教训已通过默认只读命令解决。

## 8. 不做什么

- 不发布新快照、不改发布 `f60d...`/`fa1886...`；
- 不修改 C-01/C-02/C-03/R-32/主工作台；
- 不绕过 R-26 守卫；
- 不新增端口或一级导航。
