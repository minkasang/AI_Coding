# 交给 Gemini 的任务：在 F 盘安装并验证 build123d

> 关联总体规划：`../MASTER_PLAN.md`。本任务只允许环境准备与“一个最小测试零件”，不允许重构现有汽车项目。
> 项目根目录：`F:\project\cyq\AI_Coding\car`

## 给 Gemini 的工作指令

你负责为汽车数字工程平台建立可靠的 build123d 参数化 CAD 开发环境，并完成 STEP/STL 导出的端到端验证。

### 已知环境（先实际检查，不能盲信）
- C 盘剩余约 8.03GB，F 盘约 242GB；**严禁把大量下载包、虚拟环境、pip/uv 缓存或构建文件写入 C 盘**。
- `F:\software\uv\uv.exe`，`F:\software\PYTHON\PYTHON3.13\python.exe`。
- 已安装 Blender 5.2.2：`F:\software\blender\blender.exe`。
- `car` 项目已有 Three.js / Cannon-es 代码：任何安装/测试不得修改 `src/`、`node_modules/`、旧演示或启动方式。

### 执行步骤
1. 先探测 Python/uv/Blender 版本和路径，确认 build123d 的当前兼容 Python 版本，不兼容时在 F 盘准备隔离解释器，禁止污染原有 Python。
2. 在当前 PowerShell 进程里将 `UV_CACHE_DIR`、`PIP_CACHE_DIR`、`TMP`、`TEMP` 设到 F 盘专用缓存目录；如果有任何安装器仍要求 C 盘大量空间，停止并汇报，不要绕过约束。
3. 在 `F:\project\cyq\AI_Coding\car\.venv` 建立虚拟环境，使用 uv 安装 build123d 及必要依赖；记录具体版本及安装命令。不要全局安装 Python 包。
4. 在 `F:\project\cyq\AI_Coding\car\cad\experiments\hello_flange\` 建立 `model.py`、参数文件和说明。生成一个**有中心孔、五个螺栓通孔、真实单位标注的轮毂法兰示例**；能调节外径、厚度、PCD、中心孔直径。
5. 导出 `STEP`（CAD）和 `STL`（网格中间件）到 F 盘；用脚本检查体积为正、孔数、外径、孔距和文件存在。不要假设 STL 能保留材料或装配层级。
6. 选做：不使用 Blender GUI，验证 Blender Python 能导入网格并导出 GLB；如果依赖不齐，记录阻塞，不要为了完成选做任务大规模加装软件。
7. 写入 `docs/environment-build123d.md`，记录环境路径、Python/build123d 版本、使用命令、磁盘前后占用、成功生成的文件、失败和清理方式。最后报告只需“成功/未完成 + 路径 + 验证结果 + 卡点”。

### 禁止事项
- 不安装 FreeCAD、UE、额外 Blender 副本。
- 不更改 Windows 全局环境变量或系统盘目录；不删除现有软件/用户文件。
- 不让 STEP 直接进入 Three.js；浏览器加载的是独立转换后的 GLB。
- 不提前制作悬架/发动机/整车，也不宣称测试法兰满足特定量产车型或强度标准。
- 不覆盖 `MASTER_PLAN.md` 或旧代码；如果觉得架构不妥，另写改进建议让总控审核。

### 完成判定
- F 盘的独立 Python 环境可以 `import build123d`。
- 可重复执行生成脚本，STEP/STL 由脚本稳定产出；参数修改产生可验证尺寸变化。
- 不污染现有项目，不新增大量 C 盘占用；环境文档和实测证据已保存。
- 返回供下一位代理使用的绝对路径和命令，不仅给口头描述。
