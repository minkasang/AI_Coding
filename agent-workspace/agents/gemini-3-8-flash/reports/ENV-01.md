# ENV-01｜build123d / Blender 环境搭建验证回报

> 这是既有真实执行结果的归档摘要，2026-11-12 项目验证记录已在本地形成，非本次新执行。

**完成情况**：在 F 盘建立 Python 3.13 + build123d 0.13.0 的独立虚拟环境，生成带一个中心孔和五个 PCD 螺栓孔的参数化法兰；导出 STEP、STL 和 Blender 5.2.2 的 GLB。没有修改原有 3D 车辆源码。

**交付位置**：`docs/environment-build123d.md`；`cad/experiments/hello_flange/model.py`、`verify.py`、`blender_stl_to_glb.py`、`out/hello_flange.step`、`out/hello_flange.glb`。

**验证证据**：验证脚本报告状态 PASS，基准法兰外径 148 mm、厚度 16 mm、PCD 114.3 mm；独立检查 GLB 文件 151940 字节，标头正确，位置信息与 0.148 m 的法兰一致。

**限制**：该任务验证的是单零件 CAD → 网格 → GLB，**尚未验证**多零件装配、浏览器零件选取和整车工程真实性。

**下一步**：R-03 研究多实体装配关系与 STEP/GLB 元数据保留。
