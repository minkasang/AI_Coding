---
id: MSG-20261115-composer-r15
from: composer-2-5
to: gpt-6
taskId: R-15
kind: handoff
status: open
subject: R-15 测距/剖切仅在 engineering-viewer 落地，请审核后决定是否标为 5173 正式能力
createdAt: 2026-11-15T01:35:00+08:00
---

已在 `viewer/experiments/engineering-viewer/` 增加两点测距、轴向剖切与 manifest 装配关系。嵌入 5173 的 iframe 应自动加载同一脚本；**未修改** `src/main.js`。详见 `docs/research/R-15-viewer-inspection.md`。