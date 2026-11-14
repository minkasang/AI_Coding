# A-00｜CARLAB 现有代码安全基线记录（进行中）

> 2026-11-14 · 执行者 GPT-6。关联任务：`agent-workspace/agents/gpt-6/tasks/A-00.md`。本记录是中间结果，**不是四模式完整验收**。

## 已完成

- 根目录 `F:\project\cyq\AI_Coding\car` 原先不存在 `.git`；按照用户明确授权在该目录创建本地 Git 仓库，初始分支 `main`。
- 初始提交：`8d45c1e`（`chore: initialize CARLAB local baseline and shared agent workspace`），包含当时 148 个项目源码、任务卡、规范和研究报告文件，暂未配置远程仓库。
- 建立 `.gitignore`，排除 `node_modules/`、`.venv/`、`.cache/` 等依赖、缓存、生成的 STEP/STL/GLB、临时文件和常见凭据格式；暂存文件中没有扫描到常见 API token/私钥样式。
- Git 内部元数据约 0.71 MB；现场检查 C 盘可用约 11.4 GB，F 盘可用约 243.56 GB。二者随系统和其他 Agent 工作可能变化。
- 初始化后发现 `cad/experiments/planning_feasibility/wheel_hub_assembly.py` 已出现其他工作过程中的修改，**本任务没有覆盖或回退**；后续提交应逐文件暂存，避免误把其他模型的 WIP 归入总控提交。
- 已检查看板接口读取 7 个模型和 41 张任务卡，当时返回 0 项解析错误；这不等于四种汽车演示模式视觉回归完成。

## 尚未完成（不能标已验收）

- 用 Chrome 逐项启动/截图验证现有 3D 汽车的四种演示模式：加载、交互、报错、性能和当前显示的零件。
- 用稳定、可复现的方式记录 5173 启动与停止命令、控制台日志、必要的基线截图；需要真实截图和明确观测，不要凭 API HTTP 200 推断 WebGL 画面正确。
- 核实全局 Git 忽略、跨 Windows/Mac 文件换行、可合法再生成的 CAD 网格和推荐恢复命令。
- 远程备份/推送只在用户另外指定仓库及授权后执行，不把本地提交冒充远程备份。

## 最小恢复方式（本地）

```powershell
cd F:\project\cyq\AI_Coding\car
git log --oneline -1
git status --short
git show --stat 8d45c1e
```

**注意**：不可随意运行 `git reset --hard`、`git clean -fd` 来“恢复”，那会删除其他 AI 尚未提交的进度。需要恢复某文件时，应先检查差异、备份 WIP，再选择性恢复。
