# 任务 R-04 / Grok — SUBMITTED

完成了什么：
用一套标明虚构的双叉臂硬点说明了轮心要动时，哪些距离必须同时保持不变。上下摆臂的球铰留在各自圆弧上，转向节和拉杆长度不变；减振器长度和半轴长度是算出来的结果。±60 mm 行程里外倾和前束都会变，而现有演示摆臂会伸缩，所以画面联动仍是动画。麦弗逊换成滑柱直线后，同一跳动量的外倾和双叉臂不同，轮距也不能靠整体拉伸来改。

交付文件：
- `F:\project\cyq\AI_Coding\car\docs\research\R-04-suspension-physics-report.md`
- `F:\project\cyq\AI_Coding\car\docs\research\R-04-kinematics-fixture.json`
- `F:\project\cyq\AI_Coding\car\docs\tasks\reports\R-04-report.md`
- `F:\project\cyq\AI_Coding\car\agent-workspace\agents\grok\reports\R-04.md`

验证情况：
- 命令：`node F:\tmp\r04-kinematics.mjs`
- 工作目录：`F:\project\cyq\AI_Coding\car`
- 结果：PASS，21 项通过，0 项失败。
- 设计位置约束残差约 `4e-17` m。13 个行程点全部收敛，重复求解的轮心差小于 `1e-12` m。
- 外倾变化 3.07°，前束变化 1.59°。上跳 40 mm 时，双叉臂外倾 -3.13°，麦弗逊 +0.16°。
- 半轴长度变化 9.68 mm，减振器长度变化 80.6 mm，摆臂半径变化约 `1e-11` m。
- 现有演示上叉臂公式复算缩短 82.12 mm。拉杆缩短 80 mm 时求解失败。
- 未修改 `src/`，未运行浏览器演示。

未完成/有争议的部分：
- 硬点是虚构夹具。真实车的硬点、衬套刚度和半轴许用伸缩量仍然未知。
- 没有做五连杆的数值求解，只给出了约束数量和必须更换的关节。
- 没有 CAD 干涉检查。姿态可以交给后续几何检查，但本次不能说已经无穿模。
- 冰面、湿地、砂石和涉水缺少对应的测量或流体输入。运动学曲线不能代替这些力。
- Chrono 只作为公开能力对照，没有安装，也不在本次接入。

下一步建议：
1. 总控确定运动学模块的存放位置，保持它和 `vehicleWorld.js` 分离。
2. 取得可引用硬点后，用同一组杆长、外倾和轮距失败条件重跑，并继续把来源标清楚。
