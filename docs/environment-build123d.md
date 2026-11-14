# build123d 参数化 CAD 环境记录（F 盘隔离）

> 对应任务：`docs/GEMINI_BUILDD123D_TASK.md`（关联总体规划：`MASTER_PLAN.md`）
> 记录日期：2026-11-12

---

## 1. 环境路径与版本

| 组件 | 路径 / 标识 | 实测版本 |
| :--- | :--- | :--- |
| **项目根目录** | `F:\project\cyq\AI_Coding\car` | — |
| **项目虚拟环境（独立）** | `F:\project\cyq\AI_Coding\car\.venv` | — |
| **虚拟环境 Python 解释器** | `F:\project\cyq\AI_Coding\car\.venv\Scripts\python.exe` | `CPython 3.13.0` |
| **基础 Python 源** | `F:\software\PYTHON\PYTHON3.13\python.exe` | `CPython 3.13.0` |
| **包管理器** | `F:\software\uv\uv.exe` | `uv 0.11.28` |
| **build123d** | `.venv\Lib\site-packages\build123d` | `0.13.0`（要求 Python `>=3.11, <3.15`） |
| **OCCT 内核** | `.venv\Lib\site-packages` | `cadquery-ocp-novtk==8.0.1.1.0`、`cadquery-ocp-proxy==8.0.1.1.0` |
| **glTF / 数学库** | `.venv\Lib\site-packages` | `pygltflib==1.16.5`、`numpy==2.5.4`、`scipy==1.18.1`、`threejs-materials==1.2.5` |
| **Blender（已有，未重装）** | `F:\software\blender\blender.exe` | `Blender 5.2.2 LTS` |
| **uv 下载缓存目录** | `F:\uv-cache` | — |
| **临时文件目录** | `F:\tmp` | — |

> **说明**：系统默认 `python` 指向 `F:\software\PYTHON\python-3.10.4\python.exe`（`3.10.4`），而 `build123d 0.13.0` 要求 `>=3.11, <3.15`，因此虚拟环境显式绑定了 F 盘的 `Python 3.13.0`，未污染原有 `3.10.4` 与系统环境。

---

## 2. 安装命令（仅会话级环境变量，不改 Windows 全局变量）

```powershell
$env:UV_CACHE_DIR = "F:\uv-cache"
$env:PIP_CACHE_DIR = "F:\pip-cache"
$env:TMP = "F:\tmp"
$env:TEMP = "F:\tmp"

New-Item -ItemType Directory -Force -Path "F:\uv-cache","F:\tmp" | Out-Null
Set-Location "F:\project\cyq\AI_Coding\car"

& "F:\software\uv\uv.exe" venv .venv --python "F:\software\PYTHON\PYTHON3.13\python.exe"
& "F:\software\uv\uv.exe" pip install --python .\.venv\Scripts\python.exe build123d
```

导入验证命令：

```powershell
F:\project\cyq\AI_Coding\car\.venv\Scripts\python.exe -c "import build123d as bd; print('build123d OK:', bd.__version__)"
```

---

## 3. 磁盘前后占用对比

- **C 盘（安装前）**：可用 `7.93 GB`（`141.11 GB` 已用）
- **C 盘（安装 `build123d` 后）**：可用 `8.40 GB`（未向 C 盘写入虚拟环境或包缓存；后续验证结束时可用 `18.04 GB`）
- **F 盘（安装前）**：可用 `242.08 GB`（`3288.61 GB` 已用）
- **F 盘（安装并运行全部导出后）**：可用 `241.52 GB`（`3289.17 GB` 已用）
  - `F:\project\cyq\AI_Coding\car\.venv` 实测占用：**`562.27 MB`**（57 个包）
  - `F:\uv-cache` 实测占用：**`545.56 MB`**

---

## 4. 最小测试零件与验证结果（`cad/experiments/hello_flange/`）

### 已创建脚本与说明
- `F:\project\cyq\AI_Coding\car\cad\experiments\hello_flange\params.json`
- `F:\project\cyq\AI_Coding\car\cad\experiments\hello_flange\model.py`
- `F:\project\cyq\AI_Coding\car\cad\experiments\hello_flange\verify.py`
- `F:\project\cyq\AI_Coding\car\cad\experiments\hello_flange\blender_stl_to_glb.py`
- `F:\project\cyq\AI_Coding\car\cad\experiments\hello_flange\README.md`

### 成功生成的实测产物
- 基准 STEP：`F:\project\cyq\AI_Coding\car\cad\experiments\hello_flange\out\hello_flange.step`（`28,713 bytes`）
- 基准 STL：`F:\project\cyq\AI_Coding\car\cad\experiments\hello_flange\out\hello_flange.stl`（`177,484 bytes`，`3,548` 三角面）
- 基准元数据：`F:\project\cyq\AI_Coding\car\cad\experiments\hello_flange\out\hello_flange_metadata.json`
- 变体 STEP（参数回归）：`F:\project\cyq\AI_Coding\car\cad\experiments\hello_flange\out\variant_check\hello_flange_variant.step`（`28,691 bytes`）
- 变体 STL（参数回归）：`F:\project\cyq\AI_Coding\car\cad\experiments\hello_flange\out\variant_check\hello_flange_variant.stl`（`177,484 bytes`）
- 选做 Blender GLB：`F:\project\cyq\AI_Coding\car\cad\experiments\hello_flange\out\hello_flange.glb`（`151,940 bytes`，头部魔数 `b'glTF'`，单位已按 `0.001` 从 mm 缩放到 m）

### 复现与校验命令

```powershell
$env:TMP="F:\tmp"; $env:TEMP="F:\tmp"
Set-Location "F:\project\cyq\AI_Coding\car"

# 1. 生成默认参数件
.\.venv\Scripts\python.exe .\cad\experiments\hello_flange\model.py

# 2. 运行几何拓扑 + 体积 + 参数变更验证（包含 148->162mm 外径、16->20mm 厚度、114.3->120mm PCD、67.1->72.6mm 中心孔）
.\.venv\Scripts\python.exe .\cad\experiments\hello_flange\verify.py

# 3. 选做：Blender 5.2.2 无头模式 STL -> GLB
& "F:\software\blender\blender.exe" --background --factory-startup --python .\cad\experiments\hello_flange\blender_stl_to_glb.py -- .\cad\experiments\hello_flange\out\hello_flange.stl .\cad\experiments\hello_flange\out\hello_flange.glb
```

### 实测校验结果（`verify.py`）
- **基准件**（外径 `148.0 mm`、厚度 `16.0 mm`、PCD `114.3 mm`、中心孔 `67.1 mm`、5×Ø`14.5 mm` 螺栓孔）：
  - B-rep 体积：`205464.4321 mm³`（理论解析体积 `205464.4321 mm³`，相对误差 `1.54e-14`）
  - STEP 包围盒：`[148.0, 148.0, 16.0] mm`
  - STL 包围盒：`[148.0, 147.954, 16.0] mm`（`3548` 三角面）
  - 拓扑面检查：外圆柱面 `1` 个、中心通孔 `1` 个、螺栓通孔 `5` 个，实测 PCD `114.3 mm`
- **参数变更件**（外径 `162.0 mm`、厚度 `20.0 mm`、PCD `120.0 mm`、中心孔 `72.6 mm`、5×Ø`15.0 mm` 螺栓孔）：
  - B-rep 体积：`311775.4249 mm³`（理论解析体积 `311775.4249 mm³`，相对误差 `1.77e-14`）
  - STEP 包围盒：`[162.0, 162.0, 20.0] mm`，实测 PCD `120.0 mm`

---

## 5. 注意事项与清理方式

1. **首次导入提示（非报错）**：首次导入 `build123d` 时，`fonttools` 可能打印 `cannot open font 'C:\WINDOWS\Fonts\mstmc.ttf'`，不影响实体建模或导出。
2. **Blender 5.2 API 差异**：Blender 5.2 使用 `bpy.ops.wm.stl_import(...)`（旧版 `import_mesh.stl` 已移除），且 `Material.use_nodes` 已默认启用并将在 Blender 6.0 废弃；`blender_stl_to_glb.py` 已按 Blender 5.2 规范适配，无警告退出。
3. **清理缓存（随时安全删除，不影响运行）**：
   ```powershell
   Remove-Item -Recurse -Force "F:\uv-cache", "F:\tmp"
   ```
4. **完全移除本环境**：直接删除 `F:\project\cyq\AI_Coding\car\.venv`（以及 `F:\uv-cache`）即可，未对 Windows 注册表、系统环境变量或现有 `src/` 前端代码做任何修改。
