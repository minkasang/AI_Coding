# R-47 (03.49)｜C-05 转向外端发布与全链路血缘独立核验报告

> **执行人**：Gemini 3.8 Flash (`gemini-3-8-flash`)  
> **任务 ID**：`R-47`（可读序号：`03.49`）  
> **任务类型**：同源 CAD 质量门禁与独立血缘核验  
> **核验对象**：C-05 左前转向外端演示发布包（`c05-ee1e461fecf00faa8151`）  
> **核验日期**：2026-11-22  
> **门禁裁决**：**PASS**（24/24 自动化门禁测试全绿，退出码 0）  
> **实测证据**：[R-47-lineage-evidence.json](file:///f:/project/cyq/AI_Coding/car/docs/planning/evidence/R-47-lineage-evidence.json)

---

## 1. 任务背景与核心核验目标

根据总控指令 [AUDIT_2026-11-22_R36_R38_R41_R42_R43_C05.md](file:///f:/project/cyq/AI_Coding/car/docs/command/reviews/AUDIT_2026-11-22_R36_R38_R41_R42_R43_C05.md) 与任务任务书 [R-47-c05-steering-release-lineage.md](file:///f:/project/cyq/AI_Coding/car/docs/tasks/R-47-c05-steering-release-lineage.md)，Codex CAD 已发布了 `C-05` 左前转向外端安装特征及匹配球头发布包（`c05-ee1e461fecf00faa8151`）。

本任务承接 `R-34` 与 `R-43` 的发布门禁核验标准，独立对 `C-05` 发布包进行实际文件、指纹哈希、全上游同源血缘（Snapshot $\rightarrow$ C-01 $\rightarrow$ C-02 $\rightarrow$ C-03 $\rightarrow$ C-04 $\rightarrow$ C-05）、身份合规性（Qwen4 `R-42` 边界）以及运动关闭状态进行全面穿透核查。

---

## 2. 真实发布包实测证据（正向基线）

### 2.1 C-05 资产指纹与实体文件校验
- **发布包目录**：`cad/experiments/wheel-end-steering-datum-v1/out/c05-ee1e461fecf00faa8151/`
- **清单版本**：`schemaVersion = "carlab.c05DemoSteeringDatum/1"`
- **发布包 ID**：`packageId = "c05-ee1e461fecf00faa8151"`
- **清单自身 SHA-256**：`e2030af04969982174baa3275b7c19507df4f64d992b65140cc044b5afd1adfc`
- **实体 STEP 资产及哈希一致性**：
  1. `knuckle-steering-demo.step` (104,301 字节):
     - 清单声明 SHA-256：`f247355d7a545c0412f0a819fe583d192992017add1b9301775033049302afef`
     - 磁盘实算 SHA-256：`f247355d7a545c0412f0a819fe583d192992017add1b9301775033049302afef` $\rightarrow$ **完全吻合**
  2. `steering-outer-ball-stud.step` (14,784 字节):
     - 清单声明 SHA-256：`0fc1268188018cff9f8e1635b85b034d55a53728f285e8b366e14c9aeed91591`
     - 磁盘实算 SHA-256：`0fc1268188018cff9f8e1635b85b034d55a53728f285e8b366e14c9aeed91591` $\rightarrow$ **完全吻合**
  3. `validation.json` (891 字节):
     - 包含 2 个独立 STEP 实体几何校验，静态重叠 $0\text{ mm}^3$。

### 2.2 全链路同源血缘（Snapshot $\rightarrow$ C-01 $\rightarrow$ C-02 $\rightarrow$ C-03 $\rightarrow$ C-04 $\rightarrow$ C-05）
C-05 在 `sources` 字典中完整互锁了整个车端演进链条，全部经受了磁盘实物哈希检验：
1. **整车快照 (Snapshot)**：
   - `snapshotId`: `"SNAP-R27-R16-R21-R22-R23-01"`，`revision`: 1
   - `snapshotSha256`: `f60d977efc2f5aefb878610b6b5a0bedb7579146f41a6a65528470e8b6a507c4`
   - 实测磁盘 `src-experiments/vehicle-snapshot-v1/fixtures/vehicle-snapshot.json` 哈希为 `f60d...` $\rightarrow$ **吻合**
   - `sameVehicleClaim: false` $\rightarrow$ **合规**
2. **C-01 轮端基座发布包**：
   - `packageId`: `"c01-c5d74da77c293aa5321f"`
   - `manifestSha256`: `80e7e060de6b20015a6fdb8d5b81ea60b9e23ac442cebbb96b2bc2a5b5222d6a`
   - 磁盘实物 `cad/experiments/vehicle-cad-pipeline-v1/out/c01-c5d74da77c293aa5321f/manifest.json` 哈希吻合。
3. **C-02 轮端接口基准**：
   - `schemaVersion`: `"carlab.c02WheelEndDatums/1"`
   - `datumsSha256`: `071eb3019dceeec74a53dc446f99413fadeaffc0a796358f61bb515a86e5f146`
   - 磁盘实物 `cad/experiments/wheel-end-datum-interface-v1/datums.json` 哈希吻合。
4. **C-03 上下球头演示包**：
   - `packageId`: `"c03-3f4bf8c599df28679b86"`
   - `manifestSha256`: `bfe27ea9f2ae6a3283a463389950373c5338287f6200b1179a6ed46b7d337e91`
   - 磁盘实物 `cad/experiments/wheel-end-ball-joint-demo-v1/out/c03-3f4bf8c599df28679b86/manifest.json` 哈希吻合。
5. **C-04 轮心与轮辋演示包**：
   - `packageId`: `"c04-bae128570c76aec59353"`
   - `manifestSha256`: `a29d64a876dbfde97e4442ecd3cf513a9109be8455fa31a2b5fb1a5fc1f37369`
   - 磁盘实物 `cad/experiments/wheel-end-wheel-center-demo-v1/out/c04-bae128570c76aec59353/manifest.json` 哈希吻合。

---

## 3. 工程边界与身份防伪门禁核验（Qwen4 R-42 对齐）

依据千问 `R-42` 身份核验结论及总控裁决，核查 C-05 边界如下：
1. **实验件严禁伪造正式 PI**：
   - `derivedKnuckle.partInstanceId`: `null`（仅作实验衍生件 `EXPERIMENTAL_DERIVATIVE`，参考来源为 `PI-20-016-FL`）$\rightarrow$ **合规**
   - `outerBallStud.partInstanceId`: `null`（仅作球柄几何 `BALL_STUD_ONLY`）$\rightarrow$ **合规**
2. **正式零件 PART-20-075 状态保持延期**：
   - `outerTieRodEndIdentity.partId`: `"PART-20-075"`
   - `outerTieRodEndIdentity.parentDefinitionId`: `"ASSY-20-014"`
   - `outerTieRodEndIdentity.partInstanceId`: `null`
   - `outerTieRodEndIdentity.status`: `"REQUIRED_BUT_DEFERRED"`
   - `outerTieRodEndIdentity.snapshotInstanceCount`: `0` $\rightarrow$ **合规**
3. **运动闭合与播放严格关闭**：
   - `playbackAllowed`: `false` $\rightarrow$ **合规**
   - `innerTieRodInterface`: `null` $\rightarrow$ **合规**
   - `tieRodLengthMm`: `null` $\rightarrow$ **合规**
   - `vehicleFromWorkholding`: `null` $\rightarrow$ **合规**
   - `outerBallCenter.role`: `"REFERENCE_POINT"`（坐标 `[-0.027, 0.024, -0.112]` m，仅作参考点而非实例）$\rightarrow$ **合规**

---

## 4. 自动化测试套件与负例注入实测结果

我们构建了专用的独立门禁验证套件 [verify_steering_release_lineage.py](file:///f:/project/cyq/AI_Coding/car/cad/experiments/steering-release-lineage-v1/verify_steering_release_lineage.py)，设计了 24 项测试用例，实测 **24/24 PASS（100% 拦截，退出码 0）**：

| 编号 | 测试用例名称 | 测试性质 | 预期结果 | 实际实测 |
|:---:|---|:---:|:---:|:---:|
| 01 | C-05 Authentic Full Release Validation | 正向全包 | PASS | **PASS** |
| 02 | C-05 Metadata-Only Mode Validation | 正向元数据 | PASS | **PASS** |
| 03 | Missing knuckle-steering-demo.step in sha256 | 负例注入 | ERR_INPUT_MISSING_ASSET_HASH | **PASS (拦截)** |
| 04 | Missing steering-outer-ball-stud.step in sha256 | 负例注入 | ERR_INPUT_MISSING_ASSET_HASH | **PASS (拦截)** |
| 05 | Empty sha256 dictionary | 负例注入 | ERR_INPUT_EMPTY_ASSET_HASHES | **PASS (拦截)** |
| 06 | Tampered knuckle-steering-demo.step hash | 负例注入 | ERR_ASSET_HASH_MISMATCH | **PASS (拦截)** |
| 07 | Tampered steering-outer-ball-stud.step hash | 负例注入 | ERR_ASSET_HASH_MISMATCH | **PASS (拦截)** |
| 08 | Wrong C-01 manifest hash | 负例注入 | ERR_DEPENDENCY_HASH_MISMATCH | **PASS (拦截)** |
| 09 | Wrong C-02 datums hash | 负例注入 | ERR_DEPENDENCY_HASH_MISMATCH | **PASS (拦截)** |
| 10 | Wrong C-03 manifest hash | 负例注入 | ERR_DEPENDENCY_HASH_MISMATCH | **PASS (拦截)** |
| 11 | Wrong C-04 manifest hash | 负例注入 | ERR_DEPENDENCY_HASH_MISMATCH | **PASS (拦截)** |
| 12 | Snapshot hash mismatch | 负例注入 | ERR_SNAPSHOT_BINDING_MISMATCH | **PASS (拦截)** |
| 13 | Omitted snapshot file in full release | 负例注入 | ERR_SNAPSHOT_FILE_REQUIRED | **PASS (拦截)** |
| 14 | Omitted package directory in full release | 负例注入 | ERR_PACKAGE_DIRECTORY_REQUIRED | **PASS (拦截)** |
| 15 | Non-existent package directory | 负例注入 | ERR_PACKAGE_DIRECTORY_NOT_FOUND | **PASS (拦截)** |
| 16 | False OEM upgrade claim (`OEM_SPEC`) | 负例注入 | ERR_UNVERIFIED_SOURCE_UPGRADE | **PASS (拦截)** |
| 17 | False `sameVehicleClaim: true` | 负例注入 | ERR_UNVERIFIED_VEHICLE_CLAIM | **PASS (拦截)** |
| 18 | Illegal `playbackAllowed: true` | 负例注入 | ERR_ILLEGAL_PLAYBACK_ENABLED | **PASS (拦截)** |
| 19 | Illegal `partInstanceId` on derivedKnuckle | 负例注入 | ERR_ILLEGAL_PART_INSTANCE_ASSIGNMENT | **PASS (拦截)** |
| 20 | Illegal `partInstanceId` on outerBallStud | 负例注入 | ERR_ILLEGAL_PART_INSTANCE_ASSIGNMENT | **PASS (拦截)** |
| 21 | Illegal status on outerTieRodEndIdentity | 负例注入 | ERR_ILLEGAL_DEFERRED_STATUS_ALTERATION | **PASS (拦截)** |
| 22 | Illegal `vehicleFromWorkholding` non-null | 负例注入 | ERR_ILLEGAL_MOTION_CLOSURE_CLAIM | **PASS (拦截)** |
| 23 | Illegal `innerTieRodInterface` non-null | 负例注入 | ERR_ILLEGAL_MOTION_CLOSURE_CLAIM | **PASS (拦截)** |
| 24 | Illegal `tieRodLengthMm` non-null | 负例注入 | ERR_ILLEGAL_MOTION_CLOSURE_CLAIM | **PASS (拦截)** |

---

## 5. 结论与交付总结

1. **门禁结论**：Codex CAD 发布的 `C-05` 左前转向外端演示包具备完整的真实文件支持、严密的上游全链路依赖互锁，并严格遵循了 `DEMO_ASSUMPTION`、实验件 `partInstanceId=null`、外拉杆端延期和运动播放关闭的工程边界。
2. **实测证据落盘**：结构化测试结果已写入 [R-47-lineage-evidence.json](file:///f:/project/cyq/AI_Coding/car/docs/planning/evidence/R-47-lineage-evidence.json)。
3. **复跑指令**：
   ```powershell
   cd f:\project\cyq\AI_Coding\car
   .\.venv\Scripts\python.exe cad/experiments/steering-release-lineage-v1/verify_steering_release_lineage.py
   ```
4. **下游协同**：核验结论直接支持 Grok `R-45`（转向闭合夹具）与千问 `R-46`（转向总成候选），Gemini `R-47` 正式交付待审。
