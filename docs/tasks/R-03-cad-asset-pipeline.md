# R-03｜CAD 关节/装配、网格化和 GLB 资产链路研究

- 类型：RESEARCH（允许在 `cad/experiments` 内做隔离最小实验，不许改现有前端），优先级 P0。
- 只读参考：`docs/environment-build123d.md`、`cad/experiments/hello_flange`、`docs/research/RESEARCH_BASELINE.md`。
- 可写：`docs/research/R-03-cad-pipeline-report.md`、`cad/experiments/research_assembly/**`、`docs/tasks/reports/R-03-report.md`；不得覆盖 hello_flange 结果或新增生产零件库。
- 目标：把“单法兰可导出”提升为“两个及以上零件能稳定保留身份和装配关系”的技术路线。

## 调查/实验
1. 使用**已安装 build123d 0.13.0**，验证 Compound、RigidJoint、RevoluteJoint/连接 API（注意当前文档与新版 API 差异），记录可执行版本验证。
2. 最小实验：法兰 + 螺栓（或法兰 + 制动盘），不同 `partId` 的两个实体、至少 2 个安装 Frame、一组固定装配关系。
3. STEP 多实体导出/回读及 STL 网格化时，确认哪个层级的 name/ID/坐标/材质会丢失；以外部 manifest 解决不可保留的工程元信息。
4. Blender 批处理验证：单位从 mm 转成 m、不同部件作为不同对象、法线/面朝向、GLB 后各自包围盒、轴向和相对位置。
5. 资产链路的重跑/缓存策略：同一输入参数同一版本的确定性构建、文件哈希；源文件与临时缓存的保留/删除规则。
6. 提出浏览器最小 GLB Viewer 的需求：每 PartInstance 可选择、隐藏、单独着色、替换、爆炸/还原。

## 交付
- 可运行的小实验 `.py`、`.json`、`.step`、`.stl`、`.glb` 和在 F 盘执行的复现命令。
- CAD 与 GLB 元素计数/包围盒/米制转换对照；失败或信息丢失清单；生成不具备工程真实性的结构时标明演示性质。
- 对最终流水线给出输入输出契约/失败处理/生成日志格式；列出需要总控决策的 API 依赖。
- **不得安装新的大型软件，不得默认重新创建大体积 UV 缓存，不得写 C 盘**。

## 验收
两个部件在浏览器格式中仍然能被单独识别/定位，装配相对距离可校验；同样的脚本可重新执行；没有破坏原 hello_flange 的文件和测试。

## 参考
- build123d v0.13 关节：https://build123d.readthedocs.io/en/v0.13.0/direct_api_reference.html
- 最新装配文档仅用来作对照：https://build123d.readthedocs.io/en/latest/assemblies.html
- Three.js GLTFLoader：https://threejs.org/docs/pages/GLTFLoader.html

## 提交
`R-03 SUBMITTED；实验路径；命令与结果；已识别的丢失数据；建议方案和风险`。
