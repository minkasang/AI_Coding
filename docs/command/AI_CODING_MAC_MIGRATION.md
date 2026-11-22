# AI Coding 迁移到 Mac 的交接

## 恢复工作区

在 Windows 上，`AI_Coding/` 下已确认的内容是 `car/` Git 仓库和 `.workbuddy/memory/` 项目记忆。仓库包含 CARLAB 源码、规则、决策、任务卡、审核、报告和发布数据。迁移后的 IDE 应打开同一份 `AI_Coding`，各执行会话进入其中的 `car`。以后新增子项目时，也要检查其仓库及本机独有交付物。

在 Mac 选好父目录后执行全历史克隆。C-04 及后续 CAD 的校验需要读取 R-27 的历史提交。

```bash
mkdir -p AI_Coding
cd AI_Coding
git clone https://github.com/minkasang/AI_Coding.git car
git -C car status --short --branch
git -C car cat-file -t 3524e32116019cca2a2decd91d6dfad4b180a2b2
```

可以从 [GitHub 下载轮端 CAD 产物包](https://github.com/minkasang/AI_Coding/releases/download/mac-handoff-2026-11-22/AI_Coding-mac-cad-assets.zip)。它包含 C-01 和 C-03 至 C-07 的 28 个 STEP、GLB 和 JSON 文件，保留原有字节和路径。把压缩包放到 `AI_Coding` 根目录后解压并校验。

```bash
unzip -n AI_Coding-mac-cad-assets.zip
shasum -a 256 -c mac-handoff/CAD-SHA256SUMS.txt
```

完整迁移使用 [GitHub 上的加密交接包](https://github.com/minkasang/AI_Coding/releases/download/mac-handoff-2026-11-22/AI_Coding-mac-handoff.zip.gpg)。把下载的文件放到 `AI_Coding` 根目录，与 `car` 同级。密码由发起迁移的会话单独提供。在 Mac 的 `AI_Coding` 目录运行下方命令，并在提示时输入密码。Mac 已装 Homebrew 且缺少 `gpg` 时，可先执行 `brew install gnupg`。[Homebrew 的 GnuPG 安装说明](https://formulae.brew.sh/formula/gnupg)

```bash
gpg --output AI_Coding-mac-handoff.zip --decrypt AI_Coding-mac-handoff.zip.gpg
```

也可以直接从 Windows 工作区复制原始 `AI_Coding-mac-handoff.zip` 到同一目录。完整包还包含本机审核证据、WorkBuddy 项目记忆、其他 CAD 导出和 Git 分支备份。若 Mac 已有同一路径的记忆或产物，先比较内容再还原。

```bash
unzip -l AI_Coding-mac-handoff.zip
unzip -n AI_Coding-mac-handoff.zip
shasum -a 256 -c mac-handoff/SHA256SUMS.txt
git -C car bundle verify ../mac-handoff/car-windows-history.bundle
```

普通接续用在线 `main`。需要查看 Windows 的 CAD 分支历史时，可把归档内的分支导入 `windows-handoff/`，以保留现有分支和工作树。

```bash
git -C car fetch ../mac-handoff/car-windows-history.bundle 'refs/heads/codex/*:refs/heads/windows-handoff/codex/*'
```

Mac 上重新安装 Node 依赖并用本机 Python 创建虚拟环境。CAD 的已知版本是 Python 3.13、build123d 0.13.0 和 Blender 5.2.2，需在实际 Mac 环境核对可用性和脚本参数。Windows 文档和一些测试含有固定盘符、`.venv/Scripts/python.exe`、Chrome 或 Blender 路径。运行对应任务前，核实并按需适配，Mac 的 Python 虚拟环境入口通常是 `.venv/bin/python`。浏览器检查需用 Mac 上经验证的 Chrome 路径与独立临时目录。

```bash
cd car
npm ci
npm start
```

在 `car` 的另一个终端执行 `npm run dashboard`。正常入口为 `http://127.0.0.1:5173/` 的车辆工作台和 `http://127.0.0.1:5174/#dispatch` 的任务指挥中心。启动后检查真实页面、资源请求和任务数。Python 与 Blender 在复测对应任务时配置。新生成的机器产物先写到单独候选目录，比较来源与哈希再决定是否发布。迁移完成后，由新会话记录复测结果和实际入口。

## 2026-11-22 迁移前进度

CARLAB 按 ADR-007 推进可编辑车辆工程、零件身份、装配/约束、检验和仿真，轮胎、悬架和传动属于同一对象树。当前重点是打通一个同源左前轮端，再按通过的接口扩展。细节见 [决策记录](../decisions/DECISIONS.md)、[最近一轮独立总审](reviews/AUDIT_2026-11-22_R36_R40_R44_R45_R46_R47_C06.md) 和 [续派规程](NEXT_TASK_CONTINUITY.md)。

- C-01 至 C-06 已通过。C-01 生产 STEP/GLB 与可校验清单，C-02 传递基准，C-03 外球心、C-04 轮心、C-05 外拉杆点、C-06 内拉杆点和 262 mm 中位都沿用同源演示输入。C-07 的上下摆臂内侧定位座已提交，独立审核后才可作为正式演示输入。
- R-27 revision 1 的发布快照和消费索引受 R-41 保护。`src-experiments/vehicle-snapshot-v1/fixtures/` 下的 `vehicle-snapshot.json` SHA-256 为 `f60d977efc2f5aefb878610b6b5a0bedb7579146f41a6a65528470e8b6a507c4`，`vehicle-snapshot.consumer.json` 为 `fa18862548d64e27f9f23cdafe906b974761d8c1e6826bdcd18045febb6c8df4`。C-01 静态预览应继续绑定已经核准的资产版本。R-28 运动播放仍受阻，完整闭合、有限行程及车身配准需验证。
- 扫描结果为 71 项父任务。61 项 `approved`，1 项 `submitted`，2 项 `needs_work`，3 项 `ready`，1 项 `blocked`，3 项 `in_progress`。以下是快照。接手时按最新的实际任务卡重扫。

| 工作位 | 交接时的状态与下一步 |
|---|---|
| 总控 `gpt-6` | A-00、C-001、RP-07 在途。接管时先扫全量提交，再把任务接续到实际会话。 |
| CAD `codex-cad` | C-07 待审。按[任务书](../tasks/C-07-demo-inboard-control-arm-datums.md)核验 STEP、来源链、坐标、变体和报告，通过后及时续派。 |
| Composer `composer-2-5` | R-36 返工。核对批准的清单锁定、树和选择行为，按本轮 `reviewReport` 复测。 |
| Grok `grok` | R-45 返工。沿用获准的 C-06 中位，等 C-07 正式通过后再消费其内枢轴，验证闭合、约束和行程。 |
| 原 DeepSeek `deepseek` | R-48 可领取，校核当前 C-05/C-06 的参考输入。 |
| 原千问 4 `qwen4` | R-49 可领取，由 `Qoder–DeepSeek 1` 接续候选迁移工作，先核实绑定。 |
| Gemini Flash `gemini-3-8-flash` | R-50 可领取，复核 C-06 资产来源链。 |
| 原混元 4 `hy4` | R-51 依赖 R-36，等依赖通过后由 `WorkBuddy–DeepSeek 1` 接续，先核实绑定。 |

## 首次接管

1. 在新机器厘清项目根目录、Git 状态、本地归档、服务入口及每个工作位实际会话。核对 [工作位路由](../../agent-workspace/WORKSTATION_ROUTES.md)，暂停旧机上对同一任务的并行写入。
2. 把 [总控交接提示词](CONTROLLER_HANDOFF_PROMPT.md) 代码块完整发给接任总控的新会话。让它根据全量任务卡判断并完成能做的审核、返工或续派。
3. 总控直接接续可达的 Codex CAD 执行会话。用户依总控给出的名单，对已绑定且有任务的外部会话发送「继续 CARLAB」。以后更换总控时复用同一提示词和最新项目记录。
