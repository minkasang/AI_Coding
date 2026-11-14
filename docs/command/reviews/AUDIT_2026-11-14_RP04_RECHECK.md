# RP-04｜返工复审（GPT-6）

> 日期：2026-11-14，父任务：`RP-04` / 02.05，执行模型：Gemini 3.8 Flash。
> 上次审查：`docs/command/reviews/AUDIT_2026-11-14.md`。本记录为一次**新的独立复核**；研究任务的通过不等于工程级真实车辆零件已经完成。

## 本轮判定：APPROVED（研究链路与工程边界）

在提交的新版本中，ISO 273 的 M14 间隙孔系列已从错误的 Ø15.0 medium 改为：
- fine = Ø15.0 mm
- medium = Ø15.5 mm
- coarse = Ø16.5 mm

设计仍以公开工程对照表和项目内离散查表为基础，非正式购买的标准全文认证；模型没有声称轴承内部滚子、预紧力、真实配合公差或动力学已经得到验证。零件的几何尺寸仍为演示性假设。

## 本机独立复测

为了**不覆盖执行 AI 正在维护的证据与网格**，将 `cad/experiments/planning_feasibility/verify_assembly.py` 临时复制为：

`F:\tmp\carlab_rp04_isolated_verify.py`

仅修改该临时副本的源码位置和输出目录，将生成结果放入 `F:\tmp\carlab_rp04_verify_isolated\`、验证结果放入 `F:\tmp\carlab_rp04_isolated_evidence.json`，并修复临时副本的 glb 相对路径表示。实际调用相同的 build123d 建模脚本与 Blender 5.2.2 导出脚本；没有修改项目内的 CAD 源码或测试规则。

独立复测结果：**6 / 6 PASS，退出码 0**。

1. 正常 M14 medium Ø15.5 mm，径向间隙 0.75 mm：PASS。
2. M14 fine Ø15.0 mm 回归，径向间隙 0.50 mm：PASS。
3. Blender 多节点 GLB 导出、4 个 node.extras 工程属性：PASS；GLB 212460 字节，三零件 11588 三角面。
4. 过紧 Ø14.2 mm 孔自动拒绝，退出码 2：PASS。
5. PCD=75 mm 穿透中心孔自动拒绝：PASS。
6. PCD=150 mm 超出外径自动拒绝：PASS。

## 通过范围与后续门禁

本次通过：参数化轮端样例的 CAD→STEP/STL→Blender→GLB + 属性传播方法与质量验证方案，满足研究任务目标。

本次**未通过/未验证的范围**：OEM 真实零件尺寸、真实滚动轴承构造、螺柱实际三维螺纹、压装/预紧、刚体运动副及整车动力学。研究建议不代表生产 Schema 已经冻结。

新一轮工作可独立开展 `R-03`：把隔离单样例转向“多零件资产生产的可复现规范与信息损失验证”，并在 DeepSeek R-02 的数据 Schema 草案冻结前，避免将演示接口宣称为全项目最终协议。

**判定**：RP-04 父任务及已提交子任务可标 `approved`。执行模型随后可领取 R-03 继续研究，不需用户转发子任务。
