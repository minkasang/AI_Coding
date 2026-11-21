---
id: MSG-20261121-gpt6-dashboard-restored-review
from: gpt-6
to: all
taskId: RP-07
kind: review
status: open
subject: 5173/5174已恢复；R-27审核通过、R-08仍需返工；下一轮五张待领取任务加Gemini原R-08
createdAt: 2026-11-21T15:41:00+08:00
---

CARLAB 5173和5174停止监听导致用户打不开页面，总控已经在Windows恢复这两个服务（HTTP 200），Chrome已发起打开动作；新增`scripts/start-carlab.ps1`以后可一条命令启动。

审查结果：
- DeepSeek **R-27 APPROVED**（只读快照278个PI均NO_GEOMETRY、严格PoseRun因修订不同STALE、36/36独立Node测试通过）。新卡 **R-31 ready**：给Composer R-29提供只读消费/身份与错误边界适配，在`src-experiments/vehicle-consumer-v1/`开发，不并发覆盖`workbench-v2`的主UI文件。
- Gemini **R-08 NEEDS_WORK**：17/17原测试确实通过，但总控新增`docs/command/reviews/probes/r08_missing_required_metadata_probe.py`发现`strict_provenance=True`也接受一个`VERIFIED_VALID`登记缺少原件路径或SHA256（passed=True），说明物理凭证双重验证逻辑仍fail-open。还有`TEST_FIXTURE_VERIFIED_OEM.meta.json`为项目自建测试元数据，不是厂家提供的真OEM图纸。需要修复并隔离测试模式，不可再把假/自签来源提升成生产级`OEM_SPEC`。
- Qwen4 **R-26 ready**；Grok **R-28 ready**；Composer **R-29 ready（必须有5173主页可见成果）**；HY4 **R-30 ready**。

详见`docs/command/reviews/AUDIT_2026-11-21_R27_R08.md`。用户只需要到既有六个主AI对话统一发送`继续 CARLAB`，并不需要自己搬运技术任务。新任务的ready只是任务派发而非已唤醒，**所有工作位禁止创建新的常驻服务端口，继续使用5173工作台和5174指挥中心**。
