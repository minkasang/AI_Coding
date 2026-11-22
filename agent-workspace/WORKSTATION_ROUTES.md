# CARLAB 工作位与会话路由

`roleId` 是任务所有权标识。换工具、模型和对话时更新本表，沿用角色目录、历史报告和任务 ID。接管已打开但尚未绑定的会话时，先明确 `roleId` 并核实它能读写本机 `AI_Coding/car`，再使用「继续 CARLAB」。已有绑定的会话使用这一句即可。

会话名称使用 `IDE–模型 序号`。同一 IDE 内使用同一模型的对话从 1 独立编号。例如 `WorkBuddy–DeepSeek 1` 与 `Qoder–DeepSeek 1` 是两个会话，Qoder 再开同款对话叫 `Qoder–DeepSeek 2`。GLM、Flash 等也按各自 IDE 和具体模型编号，例如 `Qoder–GLM 1`。编号用于识别对话，任务由绑定的 `roleId` 决定。在界面中保留原称呼的对话，记录可识别的实际名称即可。

| 稳定工作位 | Mac 上的启动路由 | 职责 |
|---|---|---|
| `gpt-6` | 接管总控的独立会话，首轮由用户选择 | 全项目把控、验收与续派 |
| `codex-cad` | GPT / Codex 的独立 CAD 执行会话，在 Mac 上重新定位并验证连通 | CAD、工程尺寸和资产生产 |
| `deepseek` | 原 DeepSeek 工作位，Mac 上以实际可用会话绑定 | 数据协议与轮端参考校核 |
| `qwen4` | `Qoder–DeepSeek 1`，迁移时核对会话绑定 | 原千问 4 的平台、身份/BOM 和迁移工作 |
| `hy4` | `WorkBuddy–DeepSeek 1`，迁移时核对会话绑定 | 原混元 4 的材质、渲染与视觉验收工作 |
| `grok` | Cursor 的 Grok 执行会话 | 悬架运动学与动力学 |
| `composer-2-5` | Cursor 的 Composer 执行会话 | 前端集成、界面与浏览器验证 |
| `gemini-3-8-flash` | Gemini 3.8 Flash 对应会话，Mac 上以实际可用会话绑定 | build123d、Blender 及资产来源检查 |

在 Mac 上先核对上表中的会话能访问正确目录。总控和 Codex CAD 会话分开。Codex CAD 可通过真实会话工具直接接续时，由总控发送并验证。用户负责启动其余外部会话，总控给出可直接对应到界面的名单。旧会话 ID 可能随机器改变，须从新机器实际会话取得。

当新增 `Qoder–DeepSeek 2`、`WorkBuddy–GLM 1`、其他 Flash 或同名会话时，总控在此记录实际路由，沿用已有工作位或通过主任务规范新增独立工作位。若临时接替某一工作位，先明确交接和写权限，确保同一时候只有一个执行会话更新该父任务。原 `deepseek` 有自己的任务卡，须明确谁来接续。
