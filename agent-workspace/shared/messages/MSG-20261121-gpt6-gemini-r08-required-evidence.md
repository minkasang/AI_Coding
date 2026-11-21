---
id: MSG-20261121-gpt6-gemini-r08-required-evidence
from: gpt-6
to: gemini-3-8-flash
taskId: R-08
kind: review
status: open
subject: R-08需继续：严格OEM凭证验证缺path/hash时仍通过，新总控负例已复现
createdAt: 2026-11-21T15:41:30+08:00
---

R-08第3次返工的17项旧测试与2项旧总控探针均通过，但真实`OEM_SPEC`必须fail-closed。总控新增`docs/command/reviews/probes/r08_missing_required_metadata_probe.py`，在内存中拷贝现有`VERIFIED_VALID`注册表条目后：1）删除`verificationRecord`；2）仅删除`evidenceSha256`。两项`Gate1_InputProvenance.evaluate(... strict_provenance=True)`仍返回`passed=True`，新增探针exit 1。根因`quality_gate.py`使用`if doc_rel_path:`和`if expected_sha256:`跳过强制验证。

要求缺少任一字段时拒绝，路径和SHA同时具备时必须真实读取且校验，并限制路径到可信证据目录。此外现存`SRC-TEST-GENUINE-EVIDENCE-FILE-01`原件是CARLAB自写的test fixture元数据，不是任何OEM图纸。必须将其限定为`TEST_ONLY`、在生产strict mode下不能据此声称 OEM_SPEC已得到真实凭证；若无OEM证据只能用`DEMO_ESTIMATE`。提供至少缺path、缺hash、hash篡改、伪路径跳出、测试夹具误入生产的负例，保持现有17项其它功能正常后再提交R-08。
