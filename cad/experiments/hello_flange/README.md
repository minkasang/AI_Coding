# hello_flange — build123d 最小测试零件验证

基于 `build123d 0.13.0` 生成的简化轮毂法兰测试件，用于验证 **参数化建模 -> STEP（B-rep）-> STL（网格中间件）-> Blender 无头转 GLB** 链路。

> 说明：本零件仅用于环境与几何接口验证，不代表任何量产车型或强度标准。

## 默认参数（`params.json`，单位：mm）

- `outer_diameter_mm`: `148.0`（外径）
- `thickness_mm`: `16.0`（厚度）
- `pcd_mm`: `114.3`（螺栓节圆直径）
- `center_bore_mm`: `67.1`（中心孔直径）
- `bolt_count`: `5`
- `bolt_hole_mm`: `14.5`（螺栓通孔直径）

## 运行命令（在 `F:\project\cyq\AI_Coding\car` 下执行）

1. 生成默认零件（STEP + STL + 元数据）：
   ```powershell
   .\.venv\Scripts\python.exe .\cad\experiments\hello_flange\model.py
   ```
2. 覆盖参数生成（示例）：
   ```powershell
   .\.venv\Scripts\python.exe .\cad\experiments\hello_flange\model.py --outer-diameter 162 --thickness 20 --pcd 120 --center-bore 72.6 --prefix custom_flange
   ```
3. 运行自动化几何与参数回归校验：
   ```powershell
   .\.venv\Scripts\python.exe .\cad\experiments\hello_flange\verify.py
   ```
4. 选做：Blender 5.2.2 无头模式将 STL（mm）转成 GLB（m）：
   ```powershell
   $env:TMP="F:\tmp"; $env:TEMP="F:\tmp"
   & "F:\software\blender\blender.exe" --background --factory-startup --python .\cad\experiments\hello_flange\blender_stl_to_glb.py -- .\cad\experiments\hello_flange\out\hello_flange.stl .\cad\experiments\hello_flange\out\hello_flange.glb
   ```
