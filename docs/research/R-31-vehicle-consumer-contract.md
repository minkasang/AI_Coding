# R-31｜整车快照只读消费合同（候选）

- 任务：R-31 / displayCode 03.33《唯一整车快照的工作台消费与身份边界适配》
- 状态：`candidate` / read-only adapter
- 日期：2026-11-21
- 实现：`src-experiments/vehicle-consumer-v1/`
- 输入：R-27 `vehicle-snapshot.json` + `vehicle-snapshot.consumer.json`
- 个人回报：`agent-workspace/agents/deepseek/reports/R-31.md`
- 实跑结果：`agent-workspace/agents/deepseek/reports/R-31-consumer-check-results.json`

## 1. 目标与边界

R-31 不是新的整车 Demo，也不是主工作台 UI。它给 Composer R-29 一个**只读数据合同**，让 5173 主工作台可以从同一份快照读取：

- 13 个系统 → 37 个总成实例 → 278 个零件实例；
- 唯一选择键 `PI-*`；
- 无几何、DEMO 几何、角色位姿、不可播放的严格位姿等显式状态；
- 编辑/检查/保存/播放的状态边界；
- 输入哈希、修订、别名与错误码的 fail-closed 行为。

**不在 R-31 范围**：`workbench-v2/index.html`、`main.js`、`styles.css`、`viewport.js` 的修改；新端口；新一级导航；真实 CAD、真实动力学、OEM 来源。

## 2. 输入与完整性

| 文件 | 作用 | 校验 |
|---|---|---|
| `src-experiments/vehicle-snapshot-v1/fixtures/vehicle-snapshot.json` | 主快照 | 创建消费者时必须提供 SHA-256 |
| `src-experiments/vehicle-snapshot-v1/fixtures/vehicle-snapshot.consumer.json` | 消费索引 | 含期望 SHA-256、计数、入口、禁止事项 |

`createVehicleConsumer({snapshot, consumerIndex, snapshotSha256})` 在构造时检查：

1. `snapshotSha256` 必须是 64 位十六进制；缺失 → `E_SNAPSHOT_UNVERIFIED`；
2. 必须等于 `consumerIndex.snapshotSha256`；不符 → `E_SNAPSHOT_HASH_MISMATCH`；
3. `snapshot.schemaVersion` / `consumerIndex.schemaVersion` 匹配；
4. `snapshotId` 匹配；
5. `status=CANDIDATE_NOT_FROZEN`、`readOnly=true`；
6. `counts` 与数组长度、消费索引计数一致；
7. 所有 `partInstanceId` 以 `PI-` 开头且唯一；
8. `consumerContract.canonicalSelectionKey=partInstanceId`；
9. `poseRun` / `demoMotionView` 存在。

任何一项失败都在构造期拒绝，不把不完整数据交给 UI。

## 3. 树投影与分页

`getTreePage({ parentId?, offset?, limit?, query? })`：

| parentId | 返回 |
|---|---|
| `null` | 13 个系统节点 |
| `system:SYS-20` | 该系统下的总成实例节点 |
| `assembly:AI-20-002-FL` | 该总成下的零件实例节点 |
| `part:PI-*` | 空（叶子） |

节点形状：

```json
{
  "nodeId": "part:PI-20-001-FL",
  "nodeKind": "partInstance",
  "label": "上摆臂本体",
  "sublabel": "PI-20-001-FL",
  "selectionId": "PI-20-001-FL",
  "hasChildren": false,
  "childCount": 0,
  "geometryStatus": "NO_GEOMETRY",
  "inspectable": false,
  "mappingStatus": "MAPPED_R21",
  "projectionAlias": "INST-SLA-UPPER-ARM-FL",
  "badges": ["NO_GEOMETRY", "ROLE_UPPER_ARM"]
}
```

- 默认 `limit=50`，最大 200；`offset` 必须是非负整数，否则 `E_PAGINATION`。
- 返回 `total`、`hasMore`、`nextOffset`。
- 13 个系统全部出现；没有即时总成的系统仍显示 `NO_INSTANTIATED_ASSEMBLIES` 徽标。
- 265 个没有 R-21 投影的实例不被隐藏，节点标 `R16_CANONICAL_ONLY`。
- 总成与零件全部来自快照的 `workbenchTree` / `indexes`，不做字符串拼装。

## 4. 身份与别名

### 4.1 选择键

- 零件唯一选择键：`partInstanceId`（`PI-*`）。
- 总成详情的选择键：`assemblyInstanceId`（`AI-*`），但 `selectVehiclePart()` 只接受零件。
- `INST-*` / `ASM-*` 是投影别名，不是身份。

### 4.2 `selectVehiclePart(instanceId, {allowProjectionAlias?})`

| 输入 | 默认行为 | 显式允许别名 |
|---|---|---|
| 已存在 `PI-*` | 返回 `selectionKey=partInstanceId` | 同左 |
| `INST-*` 可解析 | 抛 `E_ALIAS_NOT_CANONICAL`，带 `canonicalInstanceId` | 返回规范 PI，`aliasUsed=true`、`aliasStatus=VIEW_LOCAL_NOT_CANONICAL`、警告 `PROJECTION_ALIAS_USED` |
| `ASM-*` 可解析 | 抛 `E_NOT_A_PART` | 抛 `E_NOT_A_PART` |
| `INST-SLA-TIEROD-FL` | 抛 `E_ALIAS_UNBOUND`，带 `role=TIEROD`、`required` 语义 | 同左 |
| 未知 | 抛 `E_UNKNOWN_ID` | 同左 |

选择成功后 `getSelection()` 返回可持久化的：

```json
{ "selectionKey": "partInstanceId", "selectionId": "PI-20-001-FL", "revision": 1 }
```

`restoreSelection()` 只接受 `partInstanceId` 且 revision 必须等于快照 revision；否则 `E_ALIAS_NOT_CANONICAL` / `E_SELECTION_STALE`。

## 5. 详情

`getObjectDetail(id, {allowProjectionAlias?})` 支持：

| id | 返回 |
|---|---|
| `PI-*` | 零件实例详情 |
| `AI-*` | 总成实例详情 |
| `SYS-*` / `SUB-*` | 系统/子系统详情 |
| `PART-*` | 零件定义详情（含 0 实例的暂缓件） |
| `ASSY-*` | 总成定义详情（含占位标志） |
| `INST-*` / `ASM-*` | 默认拒绝；显式允许时返回规范对象详情并带别名警告 |

### 5.1 零件详情

关键字段：

```text
identity: partInstanceId, partId, assemblyInstanceId, frameId, corner, ordinal
system / assembly
definition: canonicalName, projectionName, nameDrift, evidenceInherited,
            evidenceProjection, sourceRefs, optionality, qtyVehicleTotalInherited,
            variantFlag, modelBlocked, isPlaceholderAssembly
instance: geometryStatus, inspectable, evidence, projection(mappingCategory)
geometry: status, inspectable, canRenderStrict, canRenderDemoGeometry,
          canShowDemoRoleMarker, demoCad
roleBinding
flags: requiredButDeferred, variantDecision, qtyConflict
pose: strict {available,status,reason}, demo {available,attachTo,notARigidPartPose}
relatedConflicts[]
displayStatus: badges, strictPoseAvailable, demoPoseAvailable, demoOnly
```

典型事实：

- `PI-20-001-FL`：`roleBinding.role=UPPER_ARM`、`BOUND_RIGID_PART`，但 `pose.strict.available=false`；DEMO 位姿 `attachTo=PART`。
- `PI-30-006-FL`：`roleBinding.role=HUB`、`CANDIDATE_ROLE_BINDING`、`notARigidPartPose=true`；`geometry.demoCad.mappingStatus=DEMO_SUBSTITUTE`；`relatedConflicts` 含 `R27-CF-01`。
- `PART-20-075`：`instanceCount=0`、`requiredButDeferred.status=REQUIRED_BUT_DEFERRED`、`downstreamMustNotOmit=true`。
- `PART-40-048`：`variantDecision.status=VARIANT_UNDECIDED`，不得假设支架必然存在或必然不存在。
- `ASSY-50-001`：`definition.isPlaceholder=true`，`relatedConflicts` 含 `R21-CF-01`。

### 5.2 总成/系统详情

- 总成详情带 `definitionRef`、`systemId`、`corner`、`frameId`、`partInstanceIds`、`partCount`、`projection`、`relatedConflicts`。
- 系统详情带 `subsystemIds`、`assemblyInstanceIds`、`counts`；没有即时总成的系统仍保留。
- 任何详情都不输出真实几何或伪造零件。

## 6. 显示状态

`getDisplayStatus()` 返回一个总状态：

```text
snapshot: snapshotId, projectId, revision, schemaVersion, status, readOnly
counts: 13/53/108/37/493/278/...
geometry: 278 NO_GEOMETRY, 0 sourced, 1 demoCadBinding (PI-30-006-FL)
variant: VAR-R16-BOF-ICE, projection VV-A-SWB-STD,
         alignmentStatus BLOCKED_PENDING_ADJUDICATION, sameVehicleClaim=false
pose.strict: RUN-SLA-FL-DEMO-001, STALE, sourceRevision 3, snapshotRevision 1,
             playbackAllowed=false, currentFrames=0
pose.demo: 9 frames, DEMO_ONLY_STALE_SOURCE_REV_3, requiresDemoMode=true
conflicts: 24 total / 24 open, bySource {R-21:9, R-22:10, R-27:5}
selection: canonicalKey=partInstanceId, aliasesConditional=true
warnings: NO_GEOMETRY_ALL_INSTANCES, VARIANT_NOT_ALIGNED,
          R26_MISSING_CONFLICTS_PRESERVED, STRICT_POSE_RUN_STALE,
          SINGLE_DEMO_CAD_WHITELIST
readyForWorkbench: READ_ONLY_TREE_ADAPTER
readyForProductionMotion: false
```

`readyForWorkbench=READ_ONLY_TREE_ADAPTER` 只表示数据适配器可用，不表示主工作台 UI 已完成；UI 验收仍由 Composer R-29 负责。

## 7. 工作台状态边界

`getWorkspaceState({mode, demoMode?})`：

| 能力 | model | inspect |
|---|---|---|
| 选择整车树 | true | true |
| 检查/查看详情 | true | true |
| 编辑快照 | false | false |
| 保存快照 | false | false |
| 保存工程 | `EXTERNAL_PROJECT_STORE_ONLY` | 同左 |
| 添加零件 | false | false |
| 严格位姿播放 | 当前 false（STALE） | 当前 false |
| DEMO 位姿/演示 CAD | 仅 `demoMode:true` | 仅 `demoMode:true` |

保存仍归 Composer 的 V2 `ProjectStore`；R-31 不提供写接口，也不把快照变成可编辑工程。

## 8. 位姿消费

### 8.1 严格位姿

`consumePoseRun({revision, frameId?})`：

| 条件 | 结果 |
|---|---|
| 缺 revision | `E_REVISION_REQUIRED` |
| revision ≠ 快照 revision | `E_REVISION_MISMATCH` |
| frameId ≠ `FR-VEHICLE` | `E_FRAME_MISMATCH` |
| 当前 R-23 rev3 vs 快照 rev1 | `E_STALE_RUN`，`demoAvailable=true`、`demoBadge=...` |
| 未来同 revision 的 CURRENT run | 返回 `frames`（只读克隆） |

当前数据严格播放**默认禁止**；不能因为调用方传了 revision 1 就播放 rev3 的帧。

### 8.2 DEMO 位姿

`getDemoPoseFrame({frameIndex, demoMode, acknowledgeBadge, sourceRevision})`：

- 必须 `demoMode=true`，否则 `E_DEMO_MODE_REQUIRED`；
- 必须 `acknowledgeBadge=true`，否则 `E_BADGE_NOT_ACKNOWLEDGED`；
- `sourceRevision` 必须等于 3，否则 `E_SOURCE_REVISION_MISMATCH`；
- `frameIndex` 必须在 0–8，否则 `E_FRAME_INDEX`；
- 返回 `DEMO_ONLY`、`notCurrent=true`、`badge`、`frameId`、`units=m`、`up=Y`；
- 每帧 5 个角色：3 个 `attachTo=PART`、1 个 `ROLE_MARKER`（轮毂）、1 个 `NONE`（外拉杆未发布）。

## 9. 错误码

| 场景 | 错误码 |
|---|---|
| 快照缺少哈希 | `E_SNAPSHOT_UNVERIFIED` |
| 哈希不符 | `E_SNAPSHOT_HASH_MISMATCH` |
| 计数/结构不合法 | `E_SNAPSHOT_INVALID` |
| 消费索引 schema 错 | `E_CONSUMER_INDEX_INVALID` |
| 未知对象 | `E_UNKNOWN_ID` |
| 未知树父节点 | `E_UNKNOWN_PARENT` |
| 分页参数错 | `E_PAGINATION` |
| 别名未显式允许 | `E_ALIAS_NOT_CANONICAL` |
| 别名无实例 | `E_ALIAS_UNBOUND` |
| 未知别名 | `E_UNKNOWN_ALIAS` |
| 总成别名当零件选 | `E_NOT_A_PART` |
| 保存选择 revision 过期 | `E_SELECTION_STALE` |
| 严格位姿缺 revision | `E_REVISION_REQUIRED` |
| 严格位姿 revision 不符 | `E_REVISION_MISMATCH` |
| 严格位姿 frame 不符 | `E_FRAME_MISMATCH` |
| 严格位姿 STALE | `E_STALE_RUN` |
| DEMO 未开模式 | `E_DEMO_MODE_REQUIRED` |
| DEMO 未确认徽标 | `E_BADGE_NOT_ACKNOWLEDGED` |
| DEMO 源 revision 不符 | `E_SOURCE_REVISION_MISMATCH` |
| DEMO 帧越界 | `E_FRAME_INDEX` |
| 工作台模式非法 | `E_MODE` |

错误对象带 `code`、`message`、`details`；UI 应按 `code` 显示明确状态，不吞错。

## 10. R-29 接入规则

1. 从 `fetchVehicleConsumer()` 或 Node loader 获取消费者；创建前必须先有快照哈希。
2. 用 `getTreePage()` 构建 13 系统 → 37 总成 → 278 零件的懒加载树；节点 `selectionId` 只用 `PI-*` / `AI-*`。
3. 选中零件调 `selectVehiclePart()`；持久化 `{selectionKey:'partInstanceId', selectionId, revision}`。
4. 详情面板调 `getObjectDetail()`；必须显示 `NO_GEOMETRY`、`DEMO_SUBSTITUTE`、`REQUIRED_NOT_INSTANTIATED`、`VARIANT_UNDECIDED` 等徽标。
5. 严格播放按钮默认禁用；`consumePoseRun()` 当前返回 `E_STALE_RUN`。
6. DEMO 预览必须显式开关 + 徽标确认 + `sourceRevision:3`；不得自动播放。
7. 保存工程仍走 V2 `ProjectStore`；不得把快照当作可编辑数据源。
8. 不修改 `workbench-v2` 主 UI 文件；R-31 只提供模块。

## 11. 验证

```text
node src-experiments/vehicle-consumer-v1/run-checks.mjs
node --test src-experiments/vehicle-consumer-v1/tests/consumer.test.mjs
```

实测：

- `run-checks`：**20/20** 通过；加载真实 R-27 快照并核对哈希 `f60d977e...`；
- Node 测试：**19/19** 通过；
- 覆盖树 13/37/278、13 映射 / 265 规范-only、3 PI 选择、别名条件、轮毂角色标记 + DEMO CAD、必需暂缓、卡钳变型未决、占位总成、24 冲突、STALE 严格位姿、9 帧 DEMO、workspace 边界、hash fail-closed、WebCrypto/fetch、未知 ID/分页/模式错误、只读不突变。

## 12. 待总控/跨模型确认

1. Composer R-29：这个 API/节点 shape 是否够用；还缺哪些 UI 字段；接入时是否用 feature flag。
2. Qwen4 R-26：仍 `ready`、无输出；R-31 保留全部冲突；R-26 产出后需补决策映射。
3. Grok R-28：需要提交绑定快照 revision 1 的运动流（或显式 rebase + 新哈希），R-31 的 `consumePoseRun()` 才会允许 CURRENT。
4. GPT-6：`PI-*` 命名空间、轮毂角色位姿、变型对齐、R-26 冲突处理仍是待裁决项。

## 13. 不做什么

- 不改 `workbench-v2/` 主 UI；
- 不新增端口/一级导航/独立整车 Demo；
- 不把 278 个数据节点当 278 个 CAD；
- 不把 `DEMO_SUBSTITUTE` 当真实几何；
- 不把 `INST-*`/`ASM-*` 当主键；
- 不把 STALE 运行当当前；
- 不为没有来源的零件补几何、硬点、受力或 OEM 凭证。
