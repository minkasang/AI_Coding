# AGENTS.md — `car` 项目协作精简约定

> 总体架构见 `MASTER_PLAN.md`，协作与验收见 `docs/command/COMMAND_CENTER.md`，任务入口见 `agent-workspace/MASTER_TASKS.md`。**最重要的原则：总控负责提出高质量任务目标与验收要求，执行 AI 自主规划实现路线和子任务。** 本文件仅存放跨 Agent 硬约束，不写执行流水账。

## 0. 最高优先级：高质量任务提示词与自主任务规划（所有模型必读）

**必须遵守：给 AI 的任务提示词必须经过认真设计，质量比预填大量步骤更重要。总控 GPT-6 的责任是“明确想得到什么、为什么重要、工作边界、可靠依据、必须交付什么、如何独立验收”；不是替每个执行模型写死全部操作步骤。**

**总控派工时必须做到：**
- 提示词包含**目标与背景、任务边界、所需信息/参考、最终成果与质量标准、验证方式、风险/禁止事项、协作方式与回报格式**；内容足够让独立模型理解问题，不依赖用户口头补充。
- 给出必要的工程要求和可靠来源，明确哪些是硬约束、哪些是可以调整的建议。不得把“我随手列出的步骤”伪装成唯一正确路线。
- **先写好任务目标，再由执行 AI 自己研究、选择方案、分解子任务、排序和执行。** 弱模型可以在指定接口下执行窄任务，强模型可以自己探索、提出更合理的任务树；发现更好技术路线时应解释理由并在约束内调整。
- 对工程真实性、数据接口、源代码安全、证据与验收标准保持严格；对研究路径、工具实现、步骤数量及局部细节保持开放。
- 不能把创建任务卡、预写计划或复制提示词算作实际工作进度；也不能在领取前填入看起来已经开始执行的步骤或虚假百分比。

**各执行 AI 领到总任务后必须做到：**
1. 阅读总目标和质量标准，检查项目现状、已有成果与依赖；必要时查证外部技术资料，不得重复已验证工作。
2. **自己制定执行计划**：先判断需要哪些子任务，按真实工作需要创建、合并、调整或取消子任务，注明每项预期成果与可验证结果。可按实际复杂度分层；不为凑数量而拆分。
3. 在本人目录 `agent-workspace/agents/<modelId>/tasks/` 下新增子任务 Markdown，使用 `parentId: <总任务内部ID>`、唯一 `id`、`displayCode`、`status`、`summary` 和自定义的 `## 执行步骤`；不得修改其他模型的任务卡。规范见 `docs/command/PROMPT_AND_DELEGATION_STANDARD.md`。
4. 自己执行并维护**真实**状态、完成复选框和一句话 `lastNote`。子任务列表要能让看板自动读取。执行中发现遗漏可增加任务并说明原因。
5. 只在实际产生源文件、实验、引文、测试结果后报告完成；提交 `submitted` 等待审查，不能自行 `approved`。
6. 若需要改变跨模型接口、整体范围、依赖或影响旧项目，向总控提出建议与理由，不得擅自改共享架构。

**看板约定：** 总任务在尚未领取时显示“待自主规划”，**空步骤≠0% 已完成**；模型领取后自己创建具体步骤和子任务，看板才显示可追溯的进度。任务目标的文档与子任务的执行进度应分开保存。

## 0.1 默认使用共享文件闭环，不再要求用户转发每个结果

**本条比旧的 V1.1 人工复制/粘贴说明优先。** 详细协议：`docs/command/FILE_HANDOFF_PROTOCOL.md`。

- 项目所有者仅负责在有实际项目目录访问权限的 AI Coding 工具中启动各**主模型**；主任务领取之后，执行模型应自主规划、创建/执行/跟踪所属子任务，不需要用户逐项点击、再复制提示词。
- 具备真实子代理 / 会话 / 任务工具的模型，可在允许的目录和资源范围内自行委派并收集子代理结果；**没有这些工具时就在主会话执行子任务**，绝不宣称不存在的代理已启动，也不能凭提示词获得后台权限。
- **所有进度和结果直接写 F 盘**：本人 `tasks/*.md`（唯一状态源）、`reports/<taskId>.md`（主任务回报）、详细任务指定的研究/代码/图/JSON/测试证据目录。研究产物以任务 ID 开头，便于看板自动归集。
- 主任务执行者负责把子任务成果汇总到主报告并将主任务设为 `submitted`；子任务单独被提交不代表主任务已交付。用户无需手动把这些文件内容贴给 GPT-6。
- GPT-6 只在用户再次调用时，**直接读取实际文件**、复测和审核，然后更新 `approved / needs_work / blocked` 和下游任务。不会在无人调用时自动监控、无工具不后台执行。
- 如果该模型是无法访问项目文件的普通网页聊天，才使用“复制提示词/粘贴回报”**备用流程**；不得谎称保存文件或更新进度。
- 如需跨模型权限、全局依赖、付费 API 或不同桌面工具操作，明确标 `blocked`，交总控判断；不得私自修改其他 Agent 的文件。

## 1. 磁盘与缓存约束（严禁写 C 盘）
- C 盘空间紧张，所有虚拟环境、依赖包、缓存与临时文件必须放 **F 盘**，禁止修改 Windows 全局环境变量。
- **Node 装包**：`npm install <pkg> --cache F:\npm-cache`
- **Python 装包**（先在当前会话设定目录）：
  ```powershell
  $env:UV_CACHE_DIR="F:\uv-cache"; $env:PIP_CACHE_DIR="F:\pip-cache"; $env:TMP="F:\tmp"; $env:TEMP="F:\tmp"
  & "F:\software\uv\uv.exe" pip install --python .\.venv\Scripts\python.exe <pkg>
  ```

## 2. 工具链入口
- **Web 演示服务**：`npm start`（`node server.mjs` → `http://localhost:5173`，原生 ES Module + `importmap`，无打包器）。
- **CAD（build123d 0.13.0）**：`.\.venv\Scripts\python.exe <script.py>`（`Python 3.13.0`，勿用默认 `python 3.10`）。
- **Blender 5.2.2 无头处理**：`F:\software\blender\blender.exe --background --factory-startup --python <script.py>`（STL 导入请用 `bpy.ops.wm.stl_import`）。

## 3. 工程与代码边界
- **单位显式隔离**：CAD 统一 `mm`；Three.js 与物理引擎统一 `m / kg / s / N`，转 GLB 时显式缩放 `0.001`。
- **资产链路**：`build123d (STEP/STL) -> Blender (GLB) -> Three.js`，禁止 STEP 直接进浏览器。
- **兼容性**：非必要不改动已有可运行的 `src/` 演示模式与 `MASTER_PLAN.md`；任务报告、设计文档与环境说明写入 `docs/`，不要堆到本文件。

## 4. 多模型入口（任务看板的唯一状态源）

**进入本项目的任何 AI，都应首先阅读本节。** 不要仅根据文件夹名字推测自己是谁：根据当前运行环境明确提供的模型名称匹配，无法确认就让用户指定 `modelId`。普通网页聊天环境并非一定能自动读取本地文件。

| 当前模型 | modelId | 主要工作方向 | 个人目录 |
|---|---|---|---|
| GPT-6 / ChatGPT GPT-6 | `gpt-6` | 总控、架构和验收 | `agent-workspace/agents/gpt-6/` |
| Qwen4 / Qwen 4 | `qwen4` | 平台家族与车型变型 | `agent-workspace/agents/qwen4/` |
| DeepSeek | `deepseek` | 零件与装配数据协议 | `agent-workspace/agents/deepseek/` |
| Grok | `grok` | 悬架运动学与动力学研究 | `agent-workspace/agents/grok/` |
| Composer 2.5 | `composer-2-5` | 前端 UI 与看板交互审查 | `agent-workspace/agents/composer-2-5/` |
| Gemini 3.8 Flash / Gemini Flash | `gemini-3-8-flash` | build123d、Blender 资产链路 | `agent-workspace/agents/gemini-3-8-flash/` |
| HY4 | `hy4` | 材质、渲染和视觉质量 | `agent-workspace/agents/hy4/` |

**每个 AI 的固定开始动作**：
1. 阅读 `MASTER_PLAN.md` → `docs/command/COMMAND_CENTER.md` → `agent-workspace/MASTER_TASKS.md`。
2. 打开 `agent-workspace/agents/<modelId>/PROFILE.md` 和 `tasks/*.md`，优先执行自己已领取的 `in_progress`，否则领取最高优先级的 `ready`。
3. 读取任务卡 `brief:` 指向的完整任务说明，仅更改允许路径，按步骤产出真实文件与测试。
4. 有真实可验证进展时，更新自己的任务卡复选框、`status` 和 `lastNote`（一句话），其他 Agent 无权代签完成/验收。
5. 完成后设置 `status: submitted`，等待总控审核。只能由总控/独立验收环节改成 `approved`。
6. 如果工作区未分配任务，不擅自抢其他人的任务。任务所有权变化由总控修改原文件位置和任务 `owner`。

**网页可视化**：项目根目录执行 `npm run dashboard`，Chrome 打开 `http://127.0.0.1:5174`；独立于旧汽车演示的 `npm start` / 5173。任务状态统一来自各模型 `tasks/*.md`，每 8 秒刷新。网页可作为**无文件访问权限时**的备用回报入口；有文件权限的 AI 应直接保存报告。文件状态不代表外部 AI 实时在线，也不意味着模型会自动启动。

**扩展模型**：新增/停用模型时，通过 `agent-workspace/MASTER_TASKS.md` 规范维护独立工作区。更新模型路由表；不能删除历史任务或重复维护两份状态。

## 5. 备用方式：没有项目文件访问权限时的人工中转（早期 V1.1）

- 项目所有者打开 `http://localhost:5174/#dispatch`，在每个任务下点击“复制完整任务提示词”，**手动粘贴**给相应模型。复制动作不会自动启动或连接外部模型。
- 执行代理应优先使用本项目文件，按 `tasks/<taskId>.md` 步骤研究/开发并更新真实进度；最终回报原文写在本模型 `reports/<taskId>.md`，不得伪称实验结果。
- 如果运行环境无法访问本机项目，请直接回复完整任务成果、实际执行证据及局限，用户会在看板点击“粘贴 AI 回报”将其保存到专属 `reports/`。
- 看板保存回报时只会把对应任务卡标记为 `submitted`，不会自动 `approved`；总控审核文件、测试和证据后再决定是否返工或通过。不可仅凭对话摘要宣称完成。
- 细则与总计划成熟度审查见 `docs/command/PLAN_READINESS_REVIEW.md`，页面说明见 `command-center/README.md`。

## 6. 当前优先级：整车系统蓝图规划深化（RP 工作包）

- 正式规划工作包见 `docs/planning/PLANNING_PROGRAM.md`，顶层系统分解种子见 `docs/planning/VEHICLE_SYSTEM_TREE_SEED.md`；缺口候选见 `docs/planning/GAP_REGISTER.md`。
- 每个 AI **先看自己 `tasks/` 下的任务状态**：新 `RP-XX` 任务与旧 `R-XX` 的顺序以状态和依赖为准。旧 R-01/R-02/R-03/R-04/UX-01 暂列 `backlog`，不是被删除；RP-01/02/03/04/06 为第一波 `ready`，RP-05（独立审计）及 RP-07（蓝图汇总）等待前置结果。
- 当前允许并行的研究以不同报告路径隔离：研究者只写自己任务书允许的 `docs/planning/reports/RP-XX-...` 和自己任务卡；共享规划、缺口登记簿、架构决策由 GPT-6 审核后统一修改。
- 所有主任务都能从 `http://localhost:5174/#dispatch` 复制启动提示词；**有项目文件权限的 AI 应直接更新文件并由看板读取，不需要粘贴回报**。网页本身不会自动唤醒模型。
- Gemini 已验证的法兰、CAD/Blender 环境不需要重复安装或重新生成；本轮默认只做研究、分层目录和必要的隔离小实验，不批量改已有汽车源码。

## 7. 人类易读的任务编号

看板统一显示 `01.02`、`02.03` 这样的 **工作组.组内序号**；具体规则见 `docs/command/TASK_NUMBERING.md`。旧 `R-01`、`RP-01`、`C-001` 等仅保留为内部稳定标识，不应擅自重命名文件或让编号承担执行依赖。新任务卡必须有 `displayCode`、`workstream`，状态仍只以该任务卡的 `status` 和步骤为准。

## 8. 返工与总控审核如何自动通过文件传递（2026-11-14）

GPT-6 审核只修改任务卡的 `status` 和 `lastNote`，并写入 `reviewReport: docs/command/reviews/AUDIT_2026-11-14.md` 以引用真实审核记录。各执行模型在进入项目后，**如果自己的父任务状态为 `needs_work`，必须先读取其 `reviewReport`，按文件内的返工要求自主安排工作、更新成果，再重新设置为 `submitted`；不需要用户替双方复制提示词和回报。**
总控只审核父任务作为正式交接关口；子任务由所属主模型自行管理，已批准的父任务所包含的已验证子任务可以随父任务同步通过。发现成果文件 ≠ 证明已测试或已验收。
