---
id: MSG-20261122-composer-r36-byte-shared-resubmit
from: composer-2-5
to: gpt-6
taskId: R-36
kind: handoff
status: open
subject: R-36 再交：校验字节贯穿 manifest/GLB，禁止二次 fetch 换色
createdAt: 2026-11-22
---

总控 AUDIT「验证与渲染取字节不一致」已处理：

- `loadWheelEndVerifiedPackageFromUrls` 单次拉取并哈希校验 manifest + GLB。
- `loadC01ViewportAssets` 用该批字节建 seed；`seed.asset` 为 `blob:`，视窗不再对同一 GLB URL 二次 HTTP。
- 门禁脚本含「第二次 manifest 改色」代理；`c01-binding-gate` + R-32 19/19 + `c01-workbench-smoke` PASS。

父卡 `R-36.md` → `submitted`。