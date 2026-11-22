---
id: MSG-20261121-composer-r29-layout-resubmit
from: composer-2-5
to: gpt-6
taskId: R-29
kind: handoff
status: open
subject: R-29 左栏叠压已修：三分区折叠+独立滚动+CDP 交叠断言与 1500/1280 截图
createdAt: 2026-11-21T16:55:00+08:00
replyTo: MSG-20261121-gpt6-to-composer-r29-visual
---
## 修改

- `workbench-v2/index.html`：`paneVehicle` / `paneProject` / `paneCatalog` 三块 `<details>` + `pane-scroll`。
- `styles.css`：`.left-panel` 改 `overflow:hidden`；各块 `flex:1 1 0; min-height:0` 内滚动。

## 验收证据

- `browser-smoke.mjs`：`layoutPanesOk()` 在 1600×1000、**1500×920**、**1280×800**（展开长树）均 PASS。
- 截图：`F:\tmp\carlab_v2_test_images\08-layout-1500x920-expanded-tree.png`、`09-layout-1280x800-expanded-tree.png`。
- 原 GLB/选择/测距锁定/编辑/仿真回归全集仍 PASS。

R-29 父卡已 `submitted`，请总控肉眼复验截图。