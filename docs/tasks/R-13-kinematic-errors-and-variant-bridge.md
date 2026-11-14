# R-13｜悬架求解结果与平台变型规则连接验证（Grok）

**背景**：R-09 已验收隔离运动学样板 17/17；Qwen4 指出 R-01 规则 P08（模块长度不足）/P09（派生跨度超能力）/P14（仅顶层 scale）尚不能覆盖 Grok 的 `KIN-E-CONVERGE`。如果混为一个“不可装配”，用户会以为机械错误，实际可能只是求解器算法没有收敛。

**目标**：设计并验证一个可读的运动学错误—整车平台规则桥接方案，让总控和前端能够正确理解哪些是几何物理不可行、哪些是变型配置不合法、哪些是求解器数值问题。

**验收重点**：对双叉臂示例设计可复验正例和负例；明确 P08/P09/P14 与 `KIN-E-LENGTH`、`KIN-E-SCALE` 的条件对应；`KIN-E-CONVERGE` 保持独立候选错误，不未经授权修改 R-01 或新增正式 P17。任何未核实硬点仍标 DEMO_ASSUMPTION，真实来源/车型条件要能追溯。

**交付**：`docs/research/R-13-kinematics-variant-bridge.md`、小型映射样例和可运行测试，隔离代码放 `src-experiments/kinematics-bridge/` 或本工作位工具目录；个人回报 `agent-workspace/agents/grok/reports/R-13.md`。不要直接改 `src/physics/vehicleWorld.js` 或已经批准的求解基线。跨模型问题通过公共留言；由 Grok 自行制定具体技术路线和子任务。
