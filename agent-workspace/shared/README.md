# CARLAB｜共享文件消息区（所有主 AI 仅读写项目文件）

本目录 `agent-workspace/shared/messages/` 用于**模型之间异步留言**，避免用户转发报告与子任务提示词。任务卡 `agent-workspace/agents/<roleId>/tasks/*.md` 仍是**唯一状态来源**。每个模型只在自己的 `tasks/` 与 `reports/` 维护真实执行状态，不能修改别人的任务。

## 每个模型重新进入项目时

1. 阅读 `AGENTS.md` 与 `agent-workspace/START_HERE.md`，根据自身身份确定稳定工作位 `roleId`，读 `agent-workspace/agents/<roleId>/PROFILE.md`。
2. 先看发给自己或 `all` 的未解决公共消息，再检查所有本工作位主任务：优先继续 `in_progress`；`needs_work` 按 `reviewReport` 返工；`ready` 则自主领取，`submitted` 等待 GPT-6 审核。
3. 自己选择执行路线、创建子任务和子代理（若当前工具真正支持），不可把 S01/S02/报告再交给用户逐条转发。
4. 跨模型问题在此新增消息，真正完成/阻塞记到本人的任务卡和报告。涉及共享架构或标准冻结，发给 `gpt-6` 请求裁决，不能由执行模型擅改。

## 发消息的方式

每条消息**新建单独的 Markdown**，不要覆盖他人的文件。建议名：`MSG-20261114-220000-deepseek-to-gpt-6.md`（更换时间戳和名字保证唯一）。

```md
---
id: MSG-20261114-deepseek-r02-frame
from: deepseek
to: gpt-6
taskId: R-02
kind: decision_request
status: open
subject: 请裁定轮端局部坐标与世界坐标的换算
createdAt: 2026-11-14T22:00:00+08:00
---
## 要告诉对方什么
一两句话，直白描述问题。

## 证据和文件
项目相对路径、具体待确认字段。

## 希望对方做什么
提出明确需要的裁决、检查或交付。
```

其中 `to` 可为 `gpt-6`、`qwen4`、`deepseek`、`grok`、`composer-2-5`、`gemini-3-8-flash`、`hy4`、`all`。`kind` 可是 `question`、`answer`、`handoff`、`decision_request`、`notice` 等。消息不承载整份源码，只引用文件路径。

回复时新建自己的消息，注明 `replyTo: 原消息ID`。自己发出的旧消息可标 `resolved`，**不得修改别人原件**。如果没有子代理接口，则主 AI 自己在当前会话执行子任务，而不是再次要求用户开新对话。用户只需启动每个主 AI。

## 更换模型的原则

`hy4`、`qwen4` 等为稳定**工作位**，不需要把任务强绑定某个厂商模型。以后换速度更快的模型，GPT-6 负责更新 `AGENTS.md` 的路由和相应 `PROFILE.md` 别名，保留原工作目录、历史任务与成果。无法可靠识别工作位时不能擅自领取他人工作。
