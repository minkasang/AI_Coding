# RP-02｜整车跨系统关系和变更影响研究（DeepSeek）

> 状态：**SUBMITTED**（待 GPT-6 审核；未自行 approved）
> 任务卡：`agent-workspace/agents/deepseek/tasks/RP-02.md`
> 交付日期：2026-11-14
> 适用范围：CARLAB 示意参考车（承载式、前置前驱 ICE、EPS、液压制动、液冷），**不是任何量产车型**。
> 证据分级：`EVIDENCE`（公开标准/技术资料支持接口存在或失效模式）、`ENGINEERING_DERIVATION`（第一性原理/常规工程推导）、`ASSUMPTION`（本项目显式假设）、`OPEN`（未知，不编造）。
> **本报告中的所有接口字段、枚举、错误码和示例图 Schema 都是 CARLAB 项目提案，不是汽车行业统一标准。**

---

## 0. 一句话结论

这辆车不是“把零件摆在一起”，而是由六类可检查的接口连起来：**机械力/运动、电能、信息/控制、流体/液压、热交换、接触/环境**。每个连接必须写成有端口、有工程 Frame、有量纲、有方向、有额定值、有失效条件、有证据等级的边；**网格贴合不是连接，网格贴合也不能推断可以传力**。

本报告交付了一个可解析的示例接口图（42 个节点、86 条边、27 个公开来源、8 个显式未知项）和 24 个自动测试。基础图 0 个结构错误；24/24 用例通过，覆盖断开、单位错误、能力不兼容、循环/端口冲突、传播遗漏和“仅渲染对象被当成传力路径”。

---

## 1. 研究对象、边界与已有状态

### 1.1 研究对象

- 一套**示意型参考车**：承载式车身、前置前驱 ICE、电动助力转向（EPS）、真空助力液压制动、机械水泵液冷。
- 系统编号沿用 `docs/planning/VEHICLE_SYSTEM_TREE_SEED.md` 的 `SYS-xx`，不另造一套顶层编号。
- 本报告回答的是“系统之间怎样连接和相互影响”，不回答“某个零件具体长什么样、用什么材料、尺寸是多少”。零件身份和几何由 RP-01 / R-02 负责。

### 1.2 明确不做

- 不生成任何 CAD、GLB 或 `src/` 代码；未修改共享 schema、`MASTER_PLAN.md`、其他模型任务卡。
- 不声称任何尺寸、质量、助力比、散热能力、CAN 报文来自真实车型。
- 不编造 CAN 报文 ID、波特率、信号布局、DBC/ARXML；这些在图中是 `OPEN`，验证状态是 `BLOCKED`。
- 不做碰撞、结构强度、耐久、法规认证、EMC 实测；这些是后续独立任务。
- 不把“接口图能解析”当作“整车工程正确”。图能通过结构校验，只证明连接关系自洽，不证明物理性能。

### 1.3 与现有成果的关系

- RP-01（Qwen4）尚未提交产品树报告；本报告先给出 `pbsRef: "RP-01:SYS-xx"` 占位，并在第 10 节列出待对齐点。
- 原 R-02（DeepSeek 的零件/装配数据契约）仍在 `backlog`；本报告不冻结 PartSpec/Assembly Schema，只提出接口图与它的映射需求。
- RP-03（Grok）尚未给出真实性等级；本报告建议每条边增加 `fidelityLevel`（GEOMETRY/KINEMATIC/DYNAMIC），但不擅自定值。
- 现有 Three.js 演示使用 `+Y` 上、`+Z` 前（见 `src/specs.js` 与 `MASTER_PLAN.md`）；本报告示例图采用 `x 前 / y 左 / z 上` 的提案坐标，**两者必须显式变换，未统一前不得进入生产**。

---

## 2. 六类接口：连接对象、输入输出、单位、方向性、失效条件

### 2.1 总表

| 类别（枚举） | 介质 / 连接对象 | 典型输入 → 输出 | 单位（SI） | 方向性 | 典型失效条件 | 主要证据 |
|---|---|---|---|---|---|---|
| `MECH_FORCE_MOTION` 机械力/运动 | 固体：螺栓、花键、球铰、衬套、齿轮、皮带、摩擦面 | 力/力矩 → 位移/转角/速度；或反过来 | N, N·m, m, rad, rad/s, N/m, N·s/m | 力/反力本质双向；**功率流**可单向 | 过载、疲劳、预紧丢失、关节脱开、超行程、错位、干涉、打滑 | SAE J670、ISO 8855、常规机构学；具体值多为 ASSUMPTION |
| `ELEC_POWER` 电能 | 铜导体、接插件、保险丝、接触器、高压互锁 | 电压/电流 → 功率/热；可反向（回馈/充电） | V, A, W, Ω, F, C, Ah, kWh | 单向或双向；双向必须有反向额定 | 欠压/过压、过流、反接、绝缘失效、接地不良、接插件过热、电弧、接触器粘连 | ISO 6469-3、UN R100、ISO 16750-2、ISO 7637-2 |
| `INFO_CONTROL` 信息/控制 | 模拟线、PWM、数字 IO、CAN/LIN/100BASE-T1、诊断链路 | 传感器量/请求 → 执行器指令/状态 | V, mA, bit/s, ms, %, N·m（语义量）, rad/s（语义量）, 1 | 单向（传感器→控制器）或双向（总线/闭环） | 开路/短路、丢帧、超时、校验错、总线关闭、终端缺失、协议版本不符、信号超范围、EMC | ISO 11898-1、ISO 17987、IEEE 802.3bw、ISO 14229、ISO 26262 |
| `FLUID_HYDRAULIC` 流体/液压 | 制动液、冷却液、机油、燃油、制冷剂、空气（气动/真空） | 压力/流量/温度 → 压力/流量/温度、夹紧力、热 | Pa, m³/s, kg/s, K, kg/m³, Pa·s | 通常单向；封闭容积内压力可双向传递 | 泄漏、气锁、爆管、弯折、堵塞、污染、错误介质、密封不相容、冻结、沸腾、气蚀 | FMVSS 106、ISO 4925、ASTM D3306、SAE J20、SAE J639 |
| `THERMAL` 热交换 | 传导/对流/辐射/相变；金属→流体、流体→空气 | 热流/温差 → 热流/温差 | W, W/m², K, J/(kg·K), W/(m·K), W/(m²·K) | 自然方向热→冷；可双向 | 散热不足、流量不足、气锁、风扇失效、节温器卡滞、沸腾、热衰退、热失控、隔热失效 | 常规传热学；ASTM D3306、SAE J639、UN R100 |
| `CONTACT_ENVIRONMENT` 接触/环境 | 轮胎-路面、离地间隙、水/尘/盐雾、振动、温度、EMC | 法向/切向力、附着、间隙、环境载荷 → 车辆响应 | N, 1（摩擦系数）, m, m/s, K, m/s², IP 等级 | 双向（作用/反作用）；环境→车为主 | 附着饱和、水滑、托底、进水、腐蚀、热浸、振动疲劳、EMC 干扰、轮胎脱圈 | SAE J670、ETRTO、UN R117、ISO 20653、ISO 11452 |

### 2.2 机械力/运动接口

**子类型（提案）**：`EXTERNAL_INPUT`、`FIXED_JOINT`、`BOLTED`、`WELDED`、`PRESS_FIT`、`SPLINE_FIXED`、`ROTATING_SHAFT`、`CLUTCH`、`CV_JOINT_SHAFT`、`LINKAGE`、`BALL_JOINT`、`SPRING_DAMPER`、`TORSION_BAR`、`ELASTOMERIC_MOUNT`、`GEAR_MESH`、`BELT_DRIVE`、`FRICTION_CONTACT`、`TIRE_CONTACT`。

**必须记录**：两边端口、Frame（原点/轴/单位/公差）、自由度、力或力矩方向、额定值、刚度/阻尼/预紧、行程/转角限位、摩擦/效率、失效模式。

**方向性**：机械力/反力按牛顿第三定律是双向的；但**功率流**可以从发动机流向车轮，也可以在制动/回馈时反向。图中用 `direction: BIDIRECTIONAL` 表示力/运动约束，用 `graphRole: POWER_FLOW` + `flowDirection` 表示名义功率方向。这样既不会把反力误当单向，也不会让功率流图出现虚假循环。

**关键判定**：
- 刚性连接（`FIXED_JOINT`/`BOLTED`/`WELDED`/`PRESS_FIT`）要求两侧 Frame 在公差内重合；5 mm 错位就是失败，即使网格看起来贴在一起。
- 柔性连接（软管、线束、带万向节的轴、拉杆）允许两侧 Frame 不重合，但必须给出 `spanM` 和 `maxAngleDeg`；没有长度/角度上限就是不可验证的连接。
- 摩擦接触不是固定连接；它传递切向力，但允许相对滑动/磨损/热衰退。

### 2.3 电能接口

**必须记录**：电压等级（`LV_12`、`LV_48`、`HV_400` 等，提案枚举）、交流/直流、额定/峰值功率、电流、连接器/端子、保险丝/接触器、隔离/接地、反向额定、环境温度、防护等级。

**方向性**：单向（蓄电池→负载）或双向（回馈、充电、V2G）。双向边必须有 `reverseRating`；没有反向额定的“双向”是假双向。测试 `TC-19` 专门验证这一点。

**失效条件**：欠压/过压、过流、反接、绝缘失效、接地压降、接插件过热、电弧、接触器粘连、高压互锁断开、EMC 瞬态。参考 ISO 6469-3、UN R100、ISO 16750-2、ISO 7637-2。

### 2.4 信息/控制接口

**必须记录**：物理层（模拟/PWM/数字/CAN/LIN/100BASE-T1）、协议版本、方向、主从/仲裁、周期/事件、延迟、校验（CRC/计数器）、信号语义与量纲、量程、失效安全值、诊断服务、完整性等级（如适用）。

**方向性**：传感器→控制器通常是单向；总线是双向共享介质；闭环控制允许环，但必须显式标记 `feedbackLoop: true`，不能与功率流环混为一谈。

**关键限制**：本项目没有该示意车型的 DBC/ARXML，因此**不写报文 ID、波特率、信号布局**。图中 4 条 CAN 边的 `evidence.level = OPEN`、`validation.status = BLOCKED`，并列入 `U-CAN-PROTOCOL`。这是“已知的未知”，不是失败；测试 `TC-24` 验证它只产生警告，不伪造数据。

### 2.5 流体/液压接口

**介质枚举（提案）**：`brake_fluid_DOT4`、`coolant_50_50`、`engine_oil`、`fuel_gasoline`、`refrigerant_R1234yf`、`air`、`washer_fluid`、`hydraulic_oil`。

**必须记录**：介质、压力（绝压/表压要写清）、流量（体积/质量）、温度、黏度、密度、过滤精度、端口规格/密封、排空/排气、容积/柔度、最高温度、介质相容性。

**方向性**：通常单向（泵→阀→执行器→回油箱/储液罐）；封闭容积内压力可双向传递。冷却回路是**允许的环**，但必须 `loop: true`，并显式包含泵/节温器/散热器；没有泵的“环”是错误。

**失效条件**：泄漏、气锁（制动踏板变软/冷却液不循环）、爆管、弯折节流、堵塞、污染、错误介质、密封不相容、冻结、沸腾、气蚀。参考 FMVSS 106（制动软管）、ISO 4925（制动液）、ASTM D3306（冷却液）、SAE J20（冷却软管）、SAE J639（空调制冷剂）。

### 2.6 热交换接口

**必须记录**：传热方式（传导/对流/辐射/相变）、热流、热端/冷端温度、换热面积/系数、热容、流量、环境温度、最高允许温度、热路径的介质。

**与流体回路的边界**：流体边携带质量流和焓（对流输运）；`THERMAL` 边表示**不伴随质量流的跨边界传热**（制动盘→空气、散热器芯体→空气、发动机表面→空气）。这样不会把同一份热量在“流体边”和“热边”里重复计算。这个约定是项目提案，需 RP-03 确认。

**失效条件**：散热不足、流量不足、气锁、风扇失效、节温器卡在开/关、散热器堵塞、压力盖失效、沸腾、热衰退、电池热失控、隔热失效。参考 ASTM D3306、SAE J639、UN R100（电池热安全）。

### 2.7 接触/环境接口

**子类型（提案）**：`TIRE_CONTACT`、`CLEARANCE_CONSTRAINT`、`WADING`、`VIBRATION`、`THERMAL_SOAK`、`CORROSION`、`EMC`、`IP_PROTECTION`。

**关键区别**：
- 轮胎-路面是**真实的物理接触界面**，有法向力、切向力、滑移率和附着极限；它不是固定关节。
- 离地间隙是**约束**（最小距离），不是力流；可以建模为 `edgeRole: CONSTRAINT`。
- 网格 AABB 重叠/贴合**不是**接触接口；它只是渲染检查，见第 6 节。

**失效条件**：附着饱和、水滑、托底、进水、腐蚀、热浸、振动疲劳、EMC 干扰、轮胎脱圈。参考 SAE J670、ETRTO、UN R117、ISO 20653、ISO 11452。

### 2.8 分类边界：一个物理现象可以跨类，但一条边只能属于一类

制动卡钳同时涉及液压→机械→热：`FLUID` 边把压力送进卡钳，卡钳内部把压力转成夹紧力，`MECH` 边把摩擦力矩传给制动盘，`THERMAL` 边把热传给空气。**转换发生在零件/总成内部，不在一根边里混合多种介质**。如果一个节点需要两种介质，就给两个端口；不要用一条“万能边”同时传压力、力和热。

---

## 3. 最小接口字段表与错误码

### 3.1 端口 Port（最小必填）

| 字段 | 类型 | 单位/枚举 | 说明 |
|---|---|---|---|
| `portId` | string | 唯一 | 端口稳定 ID |
| `interfaceClass` | enum | 六类之一 | 接口类别 |
| `subtype` | enum | 见第 2 节 | 语义子类型；不单独承担兼容性判定 |
| `medium` | enum | solid/copper/air/brake_fluid_DOT4/... | 介质 |
| `provides` | string[] | capability 枚举 | 该端口能提供的接口能力 |
| `accepts` | string[] | capability 枚举 | 该端口能接受的接口能力 |
| `required` | bool | 默认 false | 是否必须连接；未连接报 E011 |
| `maxConnections` | int | 默认 1 | 最大边数；总线/路面可设大值 |
| `frame` | object/null | m, rad | 工程 Frame：`originM`、`axes`、`toleranceM`、`angularToleranceDeg` |
| `rating` | array | kind/max/unit | 该类接口的额定上限 |
| `limits` | object | 如 `maxTemperatureK` | 环境/热/电压等限制 |
| `voltageClass` | enum | LV_12/LV_48/HV_400/... | 仅电能端口 |
| `evidence` | object | level/refs/note | 证据等级与来源 |
| `unknowns` | string[] | U-xx | 该端口的未知项 |

### 3.2 边 Edge（最小必填）

| 字段 | 类型 | 单位/枚举 | 说明 |
|---|---|---|---|
| `edgeId` | string | 唯一 | 边稳定 ID |
| `interfaceClass` | enum | 六类之一 | 与两端端口一致 |
| `subtype` | enum | 见第 2 节 | 语义子类型 |
| `capability` | enum | 如 `MECH_TORQUE` | **正式兼容性键**；两端必须 provide/accept |
| `from` / `to` | object | `{nodeId, portId}` | 只能连端口，不能连网格 |
| `direction` | enum | FROM_TO/TO_FROM/BIDIRECTIONAL | 力/运动双向；能量/信号可单向或双向 |
| `edgeRole` | enum | PHYSICAL_CONNECTION/FLUID_CIRCUIT/ELEC_POWER/SIGNAL_LINK/THERMAL_PATH/CONTACT/CONSTRAINT/INTERNAL/EXTERNAL_INPUT | 边的工程角色 |
| `graphRole` | enum | POWER_FLOW/FLUID_LOOP/FLUID_FLOW/SIGNAL_LINK/THERMAL_PATH/CONTACT/STATIC_LOAD_PATH | 图算法角色；功率流要求无环 |
| `flowDirection` | enum | FROM_TO/TO_FROM | 双向功率流的名义方向；无它则功率流环判定不明确 |
| `quantity` | object | kind/nominal/min/max/unit/unknown | 被传输的物理量；`unknown:true` 时不伪造额定 |
| `reverseRating` | object | kind/max/unit | 双向非机械边的反向额定 |
| `voltageClass` | enum | 同上 | 电能边 |
| `medium` | enum | 同上 | 流体/热/接触边 |
| `spanM` / `maxAngleDeg` | number | m / deg | 柔性连接的跨度与最大偏角 |
| `allowRelativeMotion` | bool | — | 是否允许相对运动 |
| `loop` | bool | — | 流体环必须显式声明 |
| `temperatureMaxK` / `toTemperatureMaxK` | number | K | 热端/冷端温度上限 |
| `failureModes` | string[] | — | 该边的失效条件 |
| `evidence` | object | level/refs/note | 证据等级 |
| `validation` | object | requiredLevel/checks/status | 验证要求与状态 |
| `render` | object | visible/visualOnly/meshRefs | 渲染关系；`visualOnly` 不得进入工程边 |
| `unknowns` | string[] | U-xx | 该边的未知项 |

### 3.3 节点 Node（最小必填）

`nodeId`、`kind`（ASSEMBLY/PART/CONTROLLER/NETWORK/SENSOR/ACTUATOR/ENVIRONMENT/HUMAN_INPUT）、`systemRef`（SYS-xx）、`pbsRef`（RP-01 占位）、`name`、`renderOnly`、`frame`、`ports`、`unknowns`。

### 3.4 三条硬规则

1. **边只能连端口**：没有 `portId` 的连接不存在；网格名称、Mesh UUID、材质名都不能代替工程端口。
2. **量纲 + 语义双重匹配**：`quantity.kind` 必须与额定值 kind 一致；`unit` 必须能解析到同一量纲；非 SI 单位必须显式声明换算（`unitConversion`），不能静默把 mm 当 m。
3. **渲染对象不能成为工程传力路径**：`renderOnly: true` 的节点不得出现在 `PHYSICAL_CONNECTION`/`FLUID_CIRCUIT`/`ELEC_POWER`/`THERMAL_PATH`/`CONTACT`/`CONSTRAINT` 边里；网格贴合只记录在 `visualContacts`。

### 3.5 错误码（项目提案）

| 错误码 | 含义 | 触发示例 | 自动测试 |
|---|---|---|---|
| `INTF-E001` | 边端点/端口不存在 | 引用了不存在的 node/port | TC-21 |
| `INTF-E002` | 重复 ID | 重复 edgeId/nodeId/portId | TC-20 |
| `INTF-E003` | 量纲/数量语义不匹配 | 压力边写成 `N`；扭矩边写成 `N` | TC-04 |
| `INTF-E004` | 类别/能力/子类型不兼容 | CAN 边接到液压口；液压口只接受 12V | TC-06、TC-07 |
| `INTF-E005` | 方向/反向额定无效 | 双向 HV 边没有 reverseRating；双向功率流没有 flowDirection | TC-19 |
| `INTF-E006` | 超过端口额定 | 500 N·m 扭矩接到 350 N·m 端口 | TC-15 |
| `INTF-E007` | 缺少 Frame 或柔性连接参数 | 工程边无 Frame；柔性边无 span/角度 | TC-14 附带命中 |
| `INTF-E008` | 刚性连接 Frame 超差 | 制动盘/轮毂错位 5 mm | TC-13 |
| `INTF-E009` | 禁止的环 / 环未声明 | 功率流闭环；冷却环未标 loop | TC-10、TC-11 |
| `INTF-E010` | 端口连接冲突 | 同一卡钳液压口接两条边 | TC-12 |
| `INTF-E011` | 必连端口未连接 | 拔掉主缸压力口 | TC-03 同一改动运行 validate 时（该用例本身只验证路径） |
| `INTF-E012` | 变更影响闭包遗漏 | 轴距变化漏掉后轮速线束长度 | TC-18 |
| `INTF-E013` | 仅渲染对象被当作工程连接 | 车标网格被当成传力件 | TC-14 |
| `INTF-E014` | 单位/quantity kind 缺失或未知 | `banana` 单位 | TC-17 |
| `INTF-E015` | 证据等级不足 | ASSUMPTION 边被要求 EVIDENCE | TC-16 |
| `INTF-E016` | 流体介质不匹配 | 卡钳接冷却液 | TC-09 |
| `INTF-E017` | 电压等级不匹配 | 12V 端口标成 400V | TC-08 |
| `INTF-E018` | 热限值超限 | 制动盘 1200K > 1000K | TC-22 |
| `INTF-E019` | 非 SI 比例单位未声明换算 | mm 额定值没有换算 | TC-05 |
| `INTF-E020` | 必需的路径不存在 | 主缸到卡钳断开 | TC-03 |
| `INTF-W001` | OPEN/未知接口（不是结构失败） | CAN 协议未定义 | TC-01、TC-24 |
| `INTF-W002` | ASSUMPTION 级接口汇总 | 示例图中的假设值 | TC-01 |
| `INTF-W003` | 缺少额定值 | 某物理边没有 rating | TC-14 附带命中 |

---

## 4. 四个关键场景的因果链

> 以下数值用于说明数量级和跨系统耦合，**不是任何真实车型的实测或标定结果**。链路结构是 `EVIDENCE/ENGINEERING_DERIVATION`；具体数值是 `ASSUMPTION`。

### 4.1 场景 A：制动一次（service brake）

#### 因果链

| 步 | 从 → 到 | 接口类别 | 物理量（示例） | 跨系统影响 | 失效条件 |
|---|---|---|---|---|---|
| A1 | 驾驶员 → 制动踏板 | MECH（外部输入） | 踏板力 200 N | 驾驶员输入 | 未施加/踏板卡滞 |
| A2 | 踏板 → 真空助力器 | MECH（连杆） | 推杆力 800 N（踏板比 4:1） | 车身/踏板机构 | 推杆脱开、踏板比错误 |
| A3 | 发动机进气 → 助力器 | FLUID（真空/空气） | 绝压约 50 kPa | 发动机进气/真空泵 | 真空泄漏、单向阀失效 |
| A4 | 助力器 → 主缸 | MECH + FLUID | 推杆力约 4.8 kN；主缸压力 p=F/A | 制动总成 | 助力失效、膜片破裂 |
| A5 | 主缸 → HCU → 卡钳 | FLUID（制动液） | 示例 p≈7 MPa，额定 12 MPa | ABS/ESC 液压单元 | 渗漏、爆管、气锁、弯折 |
| A6 | 卡钳 → 制动盘 | MECH（摩擦接触） | 夹紧力→摩擦力矩 T≈1 kN·m（示例） | 轮端、热 | 热衰退、磨损、卡滞 |
| A7 | 制动盘 → 轮毂/车轮 | MECH（固定连接） | 制动力矩 | 轮端、轴承 | 螺栓松动、中心孔配合错误 |
| A8 | 轮胎 → 路面 | CONTACT | 纵向力 F_x ≤ μ·F_z | 悬架、车身、ESC | 附着饱和、水滑、锁死 |
| A9 | 车轮 → 悬架/车身 | MECH | 载荷转移、点头 | 悬架、车身姿态 | 行程触底、衬套撕裂 |
| A10 | 制动盘 → 空气 | THERMAL | 单次制动约数百 kJ；盘温升 | 热管理、制动液 | 热衰退、制动液沸腾 |
| A11 | 轮速/IMU → HCU；HCU ↔ CAN | INFO | 轮速、横摆角速度、压力指令 | ABS/ESC/整车 | 传感器失效、总线关闭 |

#### 关键方程（示意）

- 主缸压力：`p = F_rod / A_mc`
- 卡钳夹紧力：`F_clamp = p × A_caliper`
- 制动力矩（两片摩擦面，简化）：`T_b = 2 × μ_pad × F_clamp × r_eff`
- 轮胎纵向力上限：`F_x = T_b / r_dyn ≤ μ_tire × F_z`
- 车辆减速度：`a = ΣF_x / m`
- 载荷转移（简化）：`ΔF_z ≈ m·a·h_cg / L`
- 制动能量：`E = ½·m·(v1² − v2²)`
- 单次温升（绝热估算）：`ΔT = η·E / (m_disc·c_p)`

#### 一个自洽的示意算例

`m = 1500 kg`，`v = 100 km/h = 27.78 m/s`，`a = 0.8 g = 7.85 m/s²`：
- 总制动力 `F = 11.77 kN`；四轮平均 `2.94 kN/轮`。
- 轮胎半径 `0.33 m` → 每轮制动力矩 `T = 971 N·m`。
- 有效半径 `0.12 m`，摩擦系数 `0.40`，两片摩擦面 → `F_clamp = 971/(2×0.4×0.12) = 10.1 kN`。
- 卡钳两活塞 54 mm：`A = 2×π/4×0.054² = 4.58×10⁻³ m²` → `p = 2.21 MPa`。
- 主缸 25.4 mm：`A = 5.07×10⁻⁴ m²` → 推杆力 `1.12 kN`；若踏板比 4、助力比 6，则踏板力约 `47 N`。
- 单次制动能量 `½×1500×27.78² = 579 kJ`；前轴 70% = 405 kJ；两个 12 kg 铸铁盘、`c_p≈500 J/(kg·K)` → `ΔT≈33.8 K`（单次、绝热；连续制动会高得多）。

**重要工程判断**：制动系统在较高踏板力下的液压能力通常**大于**轮胎附着极限；真正限制减速度的是 `μ_tire·F_z` 和 ABS 调压，而不是“卡钳越大越好”。因此接口图必须同时有液压额定和轮胎附着边界，不能只看一端。

#### 参与总成

`SYS-40` 制动（踏板/助力/主缸/HCU/卡钳/盘）、`SYS-30` 轮端（轮毂/轴承/车轮）、`SYS-20` 悬架与转向（载荷转移、点头）、`SYS-90/140` 电气与控制在（轮速/IMU/CAN/ABS）、`SYS-70` 12V 供电、`SYS-80` 热管理（制动散热/制动液温度）、`SYS-120` 轮胎-路面、`SYS-10` 车身（载荷路径）。

#### 异常边界

空气进入（踏板变软、压力传递失效）、泄漏/爆管、制动液沸腾（气锁）、热衰退、卡钳卡滞、助力失效（踏板力骤增）、ABS 轮速传感器失效（进入默认模式）、错误制动液、软管弯折/节流、摩擦片磨损到极限、制动盘厚度/裂纹超限。

---

### 4.2 场景 B：方向盘转向 + 悬架跳动

#### 因果链

| 步 | 从 → 到 | 接口类别 | 物理量（示例） | 跨系统影响 | 失效条件 |
|---|---|---|---|---|---|
| B1 | 驾驶员 → 转向柱 | MECH（外部输入） | 手力矩 5 N·m | 转向系统 | 转向柱锁止、输入超限 |
| B2 | 转向柱 → 齿条 | MECH（旋转/万向节） | 转角/扭矩 | EPS、转向器 | 万向节卡滞、花键滑脱 |
| B3 | EPS 电机 → 齿条 | MECH（齿轮啮合）+ ELEC + INFO | 助力扭矩 30 N·m；12V 供电；扭矩/车速信号 | EPS 控制 | 助力失效、传感器故障、过温 |
| B4 | 齿条 → 转向拉杆 → 转向节 | MECH（拉杆/球头） | 拉杆力 2 kN | 轮端、悬架 | 球头脱开、拉杆弯曲、螺纹啮合不足 |
| B5 | 转向节 → 车轮 | MECH（固定连接） | 转向角 δ | 轮胎 | 干涉、轴承失效 |
| B6 | 轮胎 → 路面 | CONTACT | 侧偏角 α → 侧向力 F_y | 车身、ESC | 附着饱和、水滑 |
| B7 | 悬架跳动：路面 → 轮胎 → 悬架 | MECH + CONTACT | 轮跳 z_w、速度 | 弹簧/阻尼/稳定杆 | 行程触底、顶胶失效 |
| B8 | 车身 → 弹簧/减振器 → 悬架 | MECH（弹簧/阻尼） | F_s=k(z_w−z_b)+F_pre；F_d=c·v_rel | 车身姿态 | 弹簧断裂、减振器漏油 |
| B9 | 左/右悬架 | MECH（横向稳定杆） | 扭转力矩 | 侧倾刚度 | 连杆断裂、衬套间隙 |
| B10 | 悬架 → 车轮 | MECH（导向机构） | 外倾/前束/轮心轨迹 | 轮胎磨损、操控 | 硬点错误、bump steer、轮胎干涉 |
| B11 | 半轴 → 车轮（驱动轴） | MECH（CV 节） | 驱动力矩、CV 角 | 传动系统 | CV 超角、防尘套破裂 |
| B12 | 转向/悬架 → 传感器 | INFO | 转角、扭矩、轮速、横摆 | EPS/ESC | 信号丢失、零点漂移 |

#### 关键几何/动力学关系

- 阿克曼（理想、无侧偏）：`cot δ_o − cot δ_i = w / L`
  - 示例 `w=1.6 m`、`L=2.6 m`、内轮 `δ_i=30°` → 外轮约 `23.1°`。
- 车轮处刚度/频率：`f ≈ (1/2π)·√(k_w/m_corner)`
  - 示例 `k_w=30 N/mm=30,000 N/m`、`m_corner=375 kg` → `f≈1.42 Hz`。
- 阻尼比：`ζ = c / (2·√(k_w·m_corner))`
  - 示例 `c=3000 N·s/m` → `ζ≈0.45`。
- 侧倾刚度由弹簧、稳定杆、衬套共同决定；稳定杆把左右悬架耦合起来，不能按单角独立计算。

#### 转向与悬架的耦合点

- 转向拉杆内点/外点与悬架硬点共享空间；**改变车身高度会改变拉杆角度，从而改变 bump steer**。
- 改变轮距会改变转向节力臂、主销偏移距（scrub radius）和转向拉杆长度。
- 改变悬架拓扑（麦弗逊→双叉臂）会改变上球头、弹簧/减振器安装点和轮心轨迹；转向拉杆的布置必须重新计算。
- 网格上“轮胎没有碰到摆臂”不等于运动过程中不会碰；必须用运动学扫掠/包络检查，而不是单帧网格。

#### 参与总成

`SYS-20` 悬架/转向（转向器、拉杆、转向节、摆臂、球头、衬套、弹簧、减振器、稳定杆）、`SYS-30` 轮端、`SYS-90/140` EPS 控制/传感器/CAN、`SYS-60` 半轴/CV 节（驱动轴）、`SYS-10` 车身/塔座、`SYS-120` 路面/轮胎。

#### 异常边界

拉杆球头脱开、球头磨损/间隙、bump steer 过大、弹簧并圈、减振器气蚀/热衰退、EPS 扭矩传感器失效（保留机械转向但无助力）、转向锁止、满转角+满跳动时轮胎与摆臂/车身干涉、制动软管/线束被拉断、CV 节超角、半轴花键滑脱。

---

### 4.3 场景 C：发动机冷却

#### 因果链

| 步 | 从 → 到 | 接口类别 | 物理量（示例） | 跨系统影响 | 失效条件 |
|---|---|---|---|---|---|
| C1 | 燃烧 → 缸体/缸盖 | THERMAL | 燃料能量约 30% 进入冷却液（示例） | 发动机、热管理 | 局部过热、爆震 |
| C2 | 缸体/缸盖 → 冷却液 | THERMAL/FLUID | 对流换热；冷却液吸热 | 冷却回路 | 流量不足、气锁 |
| C3 | 水泵 → 发动机水套 | FLUID | 流量约 1 kg/s；ΔT 约 8 K（示例） | 冷却回路 | 泵失效、皮带打滑 |
| C4 | 节温器 → 散热器/旁通 | FLUID | 开度/分流 | 暖机、散热 | 卡在开/关 |
| C5 | 散热器 → 空气 | THERMAL | 约 30 kW（示例）；UA/LMTD | 前舱 airflow、风扇 | 散热不足、堵塞 |
| C6 | 风扇 → 散热器 | FLUID（空气）+ ELEC + INFO | 风量 1 m³/s；12V；ECM 占空比 | 电气/控制 | 风扇失效、保险丝熔断 |
| C7 | 冷却液温度传感器 → ECM | INFO | 363 K（90°C） | 控制 | 传感器漂移/开路 |
| C8 | ECM → 风扇/节温器 | INFO | 占空比/目标温度 | 控制 | 信号丢失、策略冲突 |
| C9 | 膨胀罐/压力盖 → 环境 | FLUID | 压力释放 | 冷却回路 | 盖失效、沸腾 |
| C10 | 机油/变速器 → 冷却液/空气 | THERMAL | 油冷器热负荷 | 润滑/传动 | 油温过高、换热器堵塞 |
| C11 | HVAC 暖风芯体 | THERMAL/FLUID | 乘员舱采暖 | 空调/热管理 | 暖风不足、泄漏 |

#### 关键方程

- 冷却液吸热：`Q̇ = ṁ·c_p·(T_out − T_in)`
- 散热器换热：`Q̇ = U·A·LMTD`，`LMTD = (ΔT1 − ΔT2)/ln(ΔT1/ΔT2)`
- 示例：`Q̇=30 kW`、`ṁ=1 kg/s`、`c_p≈3.8 kJ/(kg·K)` → `ΔT≈7.9 K`。
- 压力盖提高沸点：具体数值取决于乙二醇比例和压力，标为 `ASSUMPTION/OPEN`，不写死。

#### 参与总成

`SYS-50` 发动机（缸体/缸盖/水套/水泵驱动）、`SYS-80` 热管理（散热器/风扇/节温器/膨胀罐/管路/油冷器）、`SYS-90/140` ECM/传感器/CAN、`SYS-70` 12V 供电、`SYS-100` HVAC 暖风、`SYS-10` 前舱/车身、`SYS-120` 环境空气。

#### 异常边界

泄漏、气锁、节温器卡滞、水泵/皮带失效、风扇/保险丝失效、散热器堵塞、压力盖失效、缸垫窜气（燃烧气体进入冷却液）、冷却液冻结（错误配比）、电化学腐蚀、软管塌陷、热浸（熄火后局部沸腾）。

---

### 4.4 场景 D：电驱加速 / 回收制动

#### 因果链：加速

| 步 | 从 → 到 | 接口类别 | 物理量（示例） | 跨系统影响 | 失效条件 |
|---|---|---|---|---|---|
| D1 | 加速踏板 → VCU/MCU | INFO | 踏板位置/扭矩请求 | 整车控制 | 双路信号不一致、卡滞 |
| D2 | HV 电池 → 接触器 → 逆变器 | ELEC | 400V DC；功率 80–150 kW | 高压安全 | 绝缘失效、接触器粘连、过流 |
| D3 | 逆变器 → 电机 | ELEC（三相 AC） | 电流/频率；扭矩 `T≈k_t·i_q` | 电机控制 | 过流、过热、相间短路 |
| D4 | 电机 → 减速器 → 半轴 → 车轮 | MECH（旋转/CV） | 扭矩×速比×效率 | 传动/轮端 | 花键磨损、CV 超角、超扭 |
| D5 | 车轮 → 路面 | CONTACT | `F_x = T·i·η/r` | 车辆加速 | 附着饱和、扭矩转向 |
| D6 | 电池/逆变器/电机 → 冷却液 | THERMAL/FLUID | `I²R`/开关损耗/铁损 | 热管理 | 冷却不足→降功率 |
| D7 | VCU/ESP ↔ CAN | INFO | 扭矩请求/实际扭矩/转速/SOC/温度/限值 | 整车协调 | 报文丢失、超时、校验错 |
| D8 | 12V → 控制器 | ELEC | 12V 供电 | 低压系统 | 欠压、接地不良 |

#### 因果链：回收制动

| 步 | 从 → 到 | 接口类别 | 物理量（示例） | 跨系统影响 | 失效条件 |
|---|---|---|---|---|---|
| R1 | 制动踏板/松油门 → VCU | INFO | 减速度/回馈请求 | 能量管理 | 信号丢失、策略冲突 |
| R2 | 车轮 → 电机（反拖） | MECH | 负扭矩 | 传动 | 超速、超扭 |
| R3 | 电机 → 逆变器 → HV 电池 | ELEC（反向） | 回馈功率/电流 | 电池充电 | 电池不接受、过压、过温 |
| R4 | VCU/ESP → 液压制动 | INFO + FLUID | 摩擦制动补足 | 制动混合 | 扭矩空洞、制动感不一致 |
| R5 | ABS/ESC | INFO + FLUID | 滑移控制/压力调节 | 稳定性 | 轮速/IMU 失效 |
| R6 | 电池/电机 → 冷却液 | THERMAL/FLUID | 回馈损耗热 | 热管理 | 过热降额 |
| R7 | 碰撞信号 → 接触器 | INFO + ELEC | 断开高压 | 高压安全 | 接触器未断开、绝缘故障 |

#### 关键方程

- 车轮驱动力：`F_x = T_motor · i_gear · η / r_wheel`
- 机械功率：`P_mech = T·ω`
- 电功率：`P_elec = V·I`
- 效率：`η = P_mech / P_elec`（驱动）；回馈时取倒数/反向定义
- 示例：`P=150 kW`、`i=9`、`η=0.95`、`r=0.33 m`、车速 `50 km/h` → 电机转速约 `379 rad/s`，电机扭矩约 `396 N·m`，轮上驱动力约 `10.3 kN`，减速度约 `5.7 m/s²`（`m=1800 kg`）。
- 回馈限制：电池 SOC/温度/单体电压/充电接受能力、电机反电动势/转速、逆变器电流、ABS 介入。**回馈不是“有电机就能无限回收”**。

#### 参与总成

`SYS-50` 电机/逆变器、`SYS-60` 减速器/半轴、`SYS-70` HV 电池/BMS/接触器/充电口、`SYS-80` 电池/电机/逆变器冷却、`SYS-40` 液压制动与混合、`SYS-90/140` VCU/MCU/ESP/CAN、`SYS-30/120` 轮端/轮胎、`SYS-10` 电池包安装/碰撞结构。

#### 异常边界

HV 绝缘失效、接触器粘连/无法闭合、逆变器/电机过温、电池过充/过放、 resolver/位置传感器失效、扭矩请求通信丢失、回馈在高 SOC/低温下不可用、回馈与液压制动切换产生扭矩空洞/点头、冷却液丢失导致降功率、碰撞信号未断开高压。

---

## 5. 配置变更的依赖传播

### 5.1 方法

```text
changedParam
  → direct dependencies（直接零件/装配点/管路/线束/算法/质量属性）
  → transitive closure（沿依赖边求闭包）
  → declared impact set（变更单声称要改的集合）
  → validation gates（几何/运动/流体/电气/热/质量）
```

如果 `closure − declared ≠ ∅`，报 `INTF-E012`（传播遗漏）。测试 `TC-18` 故意漏掉“后轮速线束长度”，校验器给出 `missing: ["rear_harness_length"]`。

示例图的 `variantDependencies` 有 45 条依赖边，覆盖 `wheelbase`、`track`、`ride_height`、`powertrain_type`、`suspension_topology` 五个参数。**这是项目提案，不是 OEM 平台规则。**

### 5.2 轴距变化（示例 +100 mm）

| 类别 | 需要重算/重查 | 失败条件 |
|---|---|---|
| 直接零件 | 车身地板/门槛/后地板、纵梁、传动轴（RWD/AWD）、排气管、燃油/制动管路、电池包（BEV）、后排座椅、后轮拱、后副车架、后保险杠、车顶 | 传动轴超出滑移量；后排空间/座椅位置不满足；后轮进入车身 |
| 装配点/Frame | 前/后副车架安装点、后悬架硬点、减振器塔座、座椅安装点、油箱/电池包安装点、排气吊耳、加油口/充电口 | 硬点公差超差；安装点与新的车身模块不匹配 |
| 管路/线束 | 制动管路、燃油管、HV 线束、轮速/ABS 线束、洗涤液管、暖风/空调风道、排气 | 软管/线束超过最大长度；电压降/延迟超限；管路弯折 |
| 算法/参数 | 质量/质心/横摆惯量、轴荷分配、制动分配、ESC/ABS 标定、转弯半径、传动轴角度、后排腿部空间 | 轴荷/制动分配超限；ESC 标定不匹配（仿真层面） |
| 质量属性 | 质心纵向位置、横摆惯量、前后轴荷 | 单轴负荷/轮胎负荷超限 |
| 必须重算 | 后悬架运动学、传动轴长度/角度、制动管路容积/柔度、线束长度/电压降、车身结构模态（OPEN）、碰撞（OUT_OF_SCOPE） | 任一接口超限即失败 |
| 证据级别 | 几何传播 `EVIDENCE`；具体限值 `ASSUMPTION/OPEN` | 不能把“能装上”当“工程正确” |

### 5.3 轮距变化（示例 +50 mm）

| 类别 | 需要重算/重查 | 失败条件 |
|---|---|---|
| 直接零件 | 上/下摆臂、转向拉杆、半轴、转向器齿条宽度、转向节、轮毂轴承、翼子板/轮拱、车轮/轮胎、制动软管、稳定杆 | CV 节超角；轮胎蹭翼子板/摆臂；拉杆螺纹啮合不足；齿条行程不够 |
| 装配点/Frame | 副车架安装点、减振器塔座、转向器安装点、轴承座、翼子板安装点 | 硬点/安装点不匹配；轴承座偏载 |
| 管路/线束 | 制动软管、轮速线束、EPS 线束、空气悬架管路（若有） | 软管/线束长度不足；弯折/拉伸 |
| 算法/参数 | 侧倾中心、外倾曲线、bump steer、阿克曼、主销偏移距、轮端刚度、轴承负荷、弹簧/阻尼、ESC | 侧倾中心/外倾曲线恶化；转向手感/回正异常 |
| 质量属性 | 簧下质量、侧倾惯量、轮距 | 轴承/轮胎负荷超限 |
| 必须重算 | 悬架运动学、轴承负荷、轮胎包络、齿条行程、软管/线束长度、翼子板覆盖 | 任一超限即失败 |
| 证据级别 | 几何 `EVIDENCE`；具体限值 `ASSUMPTION/OPEN` | 轮距不是“把轮子往外推” |

### 5.4 离地间隙变化（示例 +30 mm）

| 类别 | 需要重算/重查 | 失败条件 |
|---|---|---|
| 直接零件 | 弹簧自由长度/预紧、减振器长度、缓冲块、顶胶、摆臂、拉杆、CV 节、半轴、副车架垫块、车身悬置、下护板、排气、油箱/电池包、大灯安装 | CV 超角；弹簧并圈/减振器触底；半轴振动；护板/排气干涉 |
| 装配点/Frame | 减振器塔座、副车架安装点、转向器安装点、稳定杆安装点、悬架硬点 | 硬点角度变化导致 bump steer；安装点强度（OPEN） |
| 管路/线束 | 制动软管、线束、燃油管、冷却软管、空气悬架管路 | 软管/线束过紧或过松；磨蹭 |
| 算法/参数 | 质心高度、侧倾中心、抗点头/抗蹲、外倾/前束曲线、bump steer、轮端刚度、载荷转移、大灯照射角、接近/离去/纵向通过角、涉水深度 | 操稳/照射/通过性不满足 |
| 质量属性 | 质心高度、侧倾惯量 | 侧倾/翻覆风险指标恶化 |
| 必须重算 | 悬架行程、弹簧预紧、减振器长度、CV 角、四轮定位、软管余量、大灯标定、底部间隙 | 任一超限即失败 |
| 证据级别 | 几何 `EVIDENCE`；限值/法规 `OPEN` | 升高不等于“越野更好” |

### 5.5 发动机 → 电驱（ICE → BEV）

| 类别 | 需要重算/重查 | 失败条件 |
|---|---|---|
| 直接零件 | 拆除：发动机、燃油箱/管路、排气、进气、点火、变速箱（可能）、散热器/风扇（可能缩小）、12V 电池（可能）、真空助力源；新增：HV 电池包、电机、逆变器、减速器、充电口、HV 线束、DC-DC、电池冷却回路、电动空调压缩机/加热器、电动真空泵/电助力器、仪表、服务断开 | 电池包侵入/离地不足；HV 间隙/隔离不够；充电口位置不合理；12V 保持电源缺失；制动助力真空缺失 |
| 装配点/Frame | 发动机悬置→电机悬置；电池包安装点；副车架；充电口；HV 部件安装；碰撞结构 | 安装点强度/刚度不足（OPEN）；碰撞路径改变（OUT_OF_SCOPE） |
| 管路/线束 | 燃油管路拆除；HV 橙色线束；电池/电机/逆变器冷却软管；充电口；12V 线束；空调管路 | HV 线束走向/屏蔽/接地不满足；冷却能力不足；EMC |
| 算法/参数 | 质量/质心/惯量、轴荷、制动助力、回馈混合、热管理、续航/能量、12V 负载、EMC、绝缘监测、碰撞断高压 | 轴荷/轮胎负荷超限；制动感不一致；热管理不足；续航模型失真 |
| 质量属性 | 电池质量（低质心）、前后轴分配、横摆/侧倾惯量 | 单轴负荷/轮胎评级超限；悬架频率/阻尼不匹配 |
| 必须重算 | 结构安装、冷却、制动真空、HVAC、12V 负载、线束拓扑、服务断开、隔离、EMC、轮胎负荷、悬架 rates | 任一接口不匹配即失败 |
| 证据级别 | 系统替换 `EVIDENCE`；具体布置/质量 `ASSUMPTION/OPEN` | 不能“换个壳”就声称 BEV 等价 |

### 5.6 悬架拓扑变化（麦弗逊 → 双叉臂）

| 类别 | 需要重算/重查 | 失败条件 |
|---|---|---|
| 直接零件 | 上摆臂、上球头、转向节、弹簧/减振器（塔座或下摆臂）、顶胶、下摆臂、稳定杆连杆、转向拉杆、副车架、轮拱、发动机罩 | 上球头/轮胎间隙不足；弹簧并圈；减振器储油罐布置不下；拉杆干涉；罩盖/轮拱干涉 |
| 装配点/Frame | 上摆臂硬点、下摆臂硬点、减振器安装点、拉杆内/外点、稳定杆安装点、轮心 | 硬点错误导致外倾/侧倾中心/bump steer 恶化 |
| 管路/线束 | 制动软管、轮速线束、EPS/转向、空气悬架管路（若有） | 软管/线束走向不足；运动包络干涉 |
| 算法/参数 | 外倾曲线、侧倾中心、主销偏移距、bump steer、阿克曼、轮端刚度、运动比、载荷路径、转向手力、ESC | 操控/转向手感/轮胎磨损不满足 |
| 质量属性 | 簧下质量、簧上质量、质心、惯量 | 频率/阻尼/侧倾刚度不匹配 |
| 必须重算 | 运动学、车身载荷路径、弹簧/阻尼 rates、四轮定位、轮胎磨损、转向手力、ESP 标定、塔座强度（OPEN） | 任一超限即失败 |
| 证据级别 | 拓扑/几何 `EVIDENCE`；强度/耐久 `OPEN/OUT_OF_SCOPE` | 拓扑不是“换几根杆” |

### 5.7 传播表的使用规则

- 表中“必须重算”是**最低要求**；不是自动完成。每一项都要有输入数据、求解器/脚本、验证用例和证据等级。
- “失败条件”不是“建议”，是接口检查的硬门；未通过不得把变型标为可装配。
- 结构强度、碰撞、耐久、NVH、EMC 的定量验证超出本任务；它们是 `OPEN`，不能因为接口图通过就宣称整车工程正确。
- 质量属性必须来自 CAD 材料属性/称重/CG 测量；没有就写 `null/OPEN`，不能编造。参考 `MASTER_PLAN.md` 4.2 的 `mechanical: unknown → null` 原则。

---

## 6. 工程连接 Frame 与渲染可见接触

### 6.1 定义

- **工程 Frame**：端口上的 `{originM, axes, toleranceM, angularToleranceDeg}`，单位 m/rad；它属于工程接口，是装配、运动学、载荷和验证的基准。
- **渲染可见接触**：两个 Mesh 的 AABB 重叠、最小距离小于阈值、或者视觉上看不到缝隙；它只是渲染/QA 信号，记录在 `visualContacts`，**不生成边**。

### 6.2 五条判定规则

1. Mesh 贴合 **不** 产生工程边。车标、饰板、贴纸、灯罩可能完全贴合，但不传力。
2. Mesh 不贴合 **不** 代表没有力路径。螺栓杆在 clearance hole 里可能看不见接触，但夹紧力通过被连接件端面传递。
3. 刚性连接要求 Frame 在公差内重合；5 mm 错位必须报 `INTF-E008`，即使渲染看起来“装进去了”。
4. 柔性连接（软管/线束/带万向节的轴）允许 Frame 不重合，但必须有 `spanM` 和 `maxAngleDeg`；没有长度/角度上限的连接不可验证。
5. 轮胎-路面是合法的 `CONTACT` 接口，不是固定关节；它允许滑移，靠摩擦传递力。

### 6.3 四个反例

| 反例 | 错误推断 | 正确处理 | 错误码 |
|---|---|---|---|
| 车标 Mesh 与发动机罩完全贴合 | “车标是结构件” | 记录 `visualContacts`；车标是 `renderOnly` | TC-14 → `E013` |
| 卡钳 Mesh 与轮辐看起来接触 | “卡钳把力传给轮辐” | 真实路径是卡钳支架→转向节；轮辐不承受卡钳反力 | 不应建边 |
| 螺栓杆在光孔内看不见接触 | “没有传力路径” | 夹紧力通过被连接件端面/法兰传递；需要预紧和摩擦 | 不应因视觉缺失而删边 |
| 轮胎与地面接触 | “轮胎和地面是固定连接” | `CONTACT`/`TIRE_CONTACT`，有滑移、附着极限 | 用 `CONTACT` 边，不用 `FIXED_JOINT` |

### 6.4 `visualContacts` 示例

```json
{
  "contactId": "VC-BADGE-BODY",
  "from": { "nodeId": "N-BADGE-RENDER", "portId": "P-VISUAL" },
  "to": { "nodeId": "N-BODY", "portId": "P-VISUAL" },
  "meshDistanceM": 0.0,
  "note": "网格贴合，仅用于渲染检查；不得生成工程边。"
}
```

### 6.5 网格/工程公差的边界

- 渲染 LOD 的偏差可能是毫米级；不能用 LOD 判断孔轴配合、预紧、干涉。
- 工程配合必须来自 CAD B-rep 尺寸、公差链或测量报告；网格只能做视觉检查。
- 如果只有 GLB 没有 STEP/尺寸来源，则只能标 `VISUAL`，不能标 `GEOMETRY`（沿用 `MASTER_PLAN.md` 4.4 的验证等级）。

---

## 7. 示例接口图 JSON

### 7.1 文件与规模

- 图：`docs/planning/evidence/RP-02-interface-graph.example.json`
- 测试用例：`docs/planning/evidence/RP-02-test-cases.json`
- 验证结果：`docs/planning/evidence/RP-02-validation-results.json`
- 规模：**42 个节点、86 条边、27 个来源、8 个显式未知项、45 条变型依赖边**。
- 状态：`carlab.interface-graph/0.1.0-proposal`，`status: PROPOSAL`，**不是生产 Schema**。

### 7.2 构成

| 维度 | 数量/分布 |
|---|---|
| 接口类别 | MECH 34、INFO 17、FLUID 18、THERMAL 6、ELEC 6、CONTACT 5 |
| 边角色 | PHYSICAL_CONNECTION 32、SIGNAL_LINK 17、FLUID_CIRCUIT 14、ELEC_POWER 6、THERMAL_PATH 6、CONTACT 4、INTERNAL 4、EXTERNAL_INPUT 2、CONSTRAINT 1 |
| 节点类型 | ASSEMBLY 26、PART 8、CONTROLLER 1、CONTROLLER_WITH_HYDRAULICS 1、ACTUATOR 1、SENSOR 1、NETWORK 1、ENVIRONMENT 2、HUMAN_INPUT 1 |
| 证据等级 | ENGINEERING_DERIVATION 58、ASSUMPTION 24、OPEN 4、EVIDENCE 0 |

**关于 `EVIDENCE 0`**：这不是“没有来源”，而是**没有任何一条边声称自己的具体数值/拓扑已达到实测或法规符合**。来源支持的是接口类别、标准存在性和一般失效模式；具体值仍是工程推导或假设。这样的分级是刻意的，避免把“有标准可引”误写成“这辆车已合规”。

### 7.3 关键摘录

制动液压边（主缸→HCU）：

```json
{
  "edgeId": "E-MASTER-HCU",
  "interfaceClass": "FLUID_HYDRAULIC",
  "subtype": "HYDRAULIC_HOSE",
  "capability": "FLUID_PRESSURE_SEALED",
  "from": { "nodeId": "N-BRAKE-MASTER", "portId": "P-PRESSURE" },
  "to": { "nodeId": "N-BRAKE-HCU", "portId": "P-IN" },
  "direction": "FROM_TO",
  "edgeRole": "FLUID_CIRCUIT",
  "graphRole": "FLUID_FLOW",
  "medium": "brake_fluid_DOT4",
  "quantity": { "kind": "pressure", "nominal": 7000000, "max": 12000000, "unit": "Pa" },
  "spanM": 0.2,
  "maxAngleDeg": 10,
  "allowRelativeMotion": true,
  "failureModes": ["软管破裂/渗漏", "弯折节流", "空气进入导致踏板变软", "接头拔脱"],
  "evidence": { "level": "ENGINEERING_DERIVATION", "refs": ["SRC-10", "SRC-12"], "note": "压力为示例工况，不是实测值。" },
  "validation": { "requiredLevel": "ENGINEERING_DERIVATION", "checks": ["structural"], "status": "UNTESTED" }
}
```

卡钳→制动盘（摩擦接触）：

```json
{
  "edgeId": "E-CAL-DISC-FL",
  "interfaceClass": "MECH_FORCE_MOTION",
  "subtype": "FRICTION_CONTACT",
  "capability": "MECH_TORQUE",
  "direction": "BIDIRECTIONAL",
  "quantity": { "kind": "torque", "nominal": 1000, "max": 3000, "unit": "N*m" },
  "spanM": 0.032,
  "maxAngleDeg": 2,
  "allowRelativeMotion": true,
  "failureModes": ["热衰退", "摩擦片磨损", "卡钳卡滞", "制动盘裂纹"],
  "evidence": { "level": "ENGINEERING_DERIVATION", "refs": ["SRC-11"], "note": "摩擦力矩为示例数量级；未给定摩擦系数曲线。" }
}
```

轮胎→路面（接触）：

```json
{
  "edgeId": "E-WHEEL-ROAD-FL",
  "interfaceClass": "CONTACT_ENVIRONMENT",
  "subtype": "TIRE_CONTACT",
  "capability": "CONTACT_FORCE",
  "direction": "BIDIRECTIONAL",
  "quantity": { "kind": "force", "nominal": 4000, "max": 8000, "unit": "N" },
  "evidence": { "level": "ENGINEERING_DERIVATION", "refs": ["SRC-02", "SRC-22", "SRC-24"], "note": "接触力为静载示例；轮胎模型未标定。" }
}
```

CAN 边（未知协议，明确标注）：

```json
{
  "edgeId": "E-HCU-CAN",
  "interfaceClass": "INFO_CONTROL",
  "subtype": "BUS_LINK",
  "capability": "INFO_CAN_FRAME",
  "direction": "BIDIRECTIONAL",
  "quantity": { "kind": "signal", "nominal": null, "max": null, "unit": "1", "unknown": true, "semantic": "CAN frames (IDs/baud/layout OPEN)" },
  "evidence": { "level": "OPEN", "refs": ["SRC-03"], "note": "明确不编造报文 ID、波特率、信号布局。" },
  "validation": { "requiredLevel": "OPEN", "checks": ["evidence"], "status": "BLOCKED" },
  "unknowns": ["U-CAN-PROTOCOL"]
}
```

变型依赖（节选）：

```json
{
  "parameters": ["wheelbase", "track", "ride_height", "powertrain_type", "suspension_topology"],
  "edges": [
    { "from": "wheelbase", "to": "rear_harness_length" },
    { "from": "wheelbase", "to": "mass_cg" },
    { "from": "mass_cg", "to": "brake_bias" },
    { "from": "track", "to": "halfshaft_length" },
    { "from": "ride_height", "to": "driveshaft_cv_angle" },
    { "from": "powertrain_type", "to": "hv_harness" },
    { "from": "suspension_topology", "to": "bump_steer" }
  ]
}
```

### 7.4 显式未知项

| ID | 未知 | 为什么不能编 | 影响 | 需要什么证据 |
|---|---|---|---|---|
| `U-CAN-PROTOCOL` | CAN 报文 ID/波特率/信号布局 | 没有该示意车型的 DBC/ARXML | 只能验证拓扑与语义量，不能验证报文兼容 | 真实 DBC/ARXML（若有授权） |
| `U-HARDWARE-HARDPOINTS` | 悬架/转向硬点坐标 | 没有 CAD 硬点或测量 | 无法算真实运动学/bump steer/阿克曼 | 硬点表/CAD 基准/测量报告 |
| `U-MASS-PROPERTIES` | 质量/质心/惯量 | 未给部件质量 | 无法算载荷转移/制动分配/动力学 | 质量清单/称重/CG 测量/CAD 材料属性 |
| `U-BRAKE-BOOST` | 助力比/主缸/卡钳参数 | 只给示意数量级 | 制动链不能验证踏板力/减速度 | 部件规格/台架实测 |
| `U-COOLING-CAL` | 冷却液流量/散热器 UA/风扇曲线 | 未做热平衡标定 | 冷却链不能验证温升 | 热平衡试验/供应商数据 |
| `U-TIRE-MODEL` | 轮胎纵/横向力模型 | 未选模型/参数 | 接触链不能验证附着极限 | 轮胎测试数据/公开模型 |
| `U-EMC-HARNESS` | 线束走向/屏蔽/接地/EMC | 图中把接地简化为单一车身地 | EMC/地偏移风险未覆盖 | 线束图/接地策略/EMC 试验计划 |
| `U-RENDER-ONLY-OBJECTS` | 仅渲染对象边界 | 尚未建立 render→partId 映射 | 视觉贴合可能被误当传力 | 渲染资产清单/instance 映射 |

---

## 8. 自动测试

### 8.1 运行方式

实际执行的命令（临时校验器，源码同时保存在个人报告目录）：

```bash
node agent-workspace/agents/deepseek/reports/RP-02-validator.mjs \
  docs/planning/evidence/RP-02-interface-graph.example.json \
  docs/planning/evidence/RP-02-test-cases.json
```

实际结果：

```text
EXIT=0
基础图: ok=true, errors=0
用例: 24 / 24 PASS
```

完整结果已保存到 `docs/planning/evidence/RP-02-validation-results.json`。

### 8.2 测试覆盖矩阵

| 用例 | 注入的故障/正常 | 期望 | 实际 | 结果 |
|---|---|---|---|---|
| TC-01 | 基础图 | 0 错误；OPEN 只警告 | `ok=true`；W001/W002 | PASS |
| TC-02 | 主缸→FL 卡钳液压路径 | 连通 | 路径 4 个端口 | PASS |
| TC-03 | 拔掉主缸→HCU 液压管 | 断开 | `E020` | PASS |
| TC-04 | 压力边单位写成 `N` | 量纲错误 | `E003` | PASS |
| TC-05 | 端口额定值用 `mm` 未声明换算 | 比例单位错误 | `E019` | PASS |
| TC-06 | 卡钳液压口只接受 12V | 能力不兼容 | `E004` | PASS |
| TC-07 | CAN 边直接接卡钳液压口 | 类别不兼容 | `E004`（并命中端口冲突） | PASS |
| TC-08 | EPS 12V 端口标成 400V | 电压等级不匹配 | `E017` | PASS |
| TC-09 | 卡钳接冷却液 | 介质不匹配 | `E016` | PASS |
| TC-10 | 构造动力流闭环 | 禁止的环 | `E009` | PASS |
| TC-11 | 冷却环未声明 `loop` | 环未声明 | `E009` | PASS |
| TC-12 | 同一卡钳口接两条边 | 端口冲突 | `E010` | PASS |
| TC-13 | 制动盘/轮毂错位 5 mm | 刚性 Frame 超差 | `E008` | PASS |
| TC-14 | 仅渲染车标当传力路径 | 渲染对象误用 | `E013`（并命中 E004/E007） | PASS |
| TC-15 | 扭矩 500 > 端口 350 N·m | 超额定 | `E006` | PASS |
| TC-16 | ASSUMPTION 边要求 EVIDENCE | 证据不足 | `E015` | PASS |
| TC-17 | 单位 `banana` | 未知单位 | `E014` | PASS |
| TC-18 | 轴距变化漏掉后轮速线束长度 | 传播遗漏 | `E012`，`missing=["rear_harness_length"]` | PASS |
| TC-19 | 双向 HV 边缺反向额定 | 假双向 | `E005` | PASS |
| TC-20 | 重复 edgeId | 重复 ID | `E002`（并命中端点缺失） | PASS |
| TC-21 | 引用不存在节点 | 端点缺失 | `E001` | PASS |
| TC-22 | 制动盘 1200K > 1000K | 热限值超限 | `E018` | PASS |
| TC-23 | 完整 EV 高压片段（含反向额定） | 正常 | `ok=true` | PASS |
| TC-24 | 未知 CAN 协议只报警告 | 不伪造 | `ok=true`；W001 | PASS |

### 8.3 这些测试证明了什么、没证明什么

**证明**：
- 接口图 JSON 可解析，六类接口、端口、Frame、能力、量纲、方向、额定、证据、验证字段能被独立脚本消费。
- 断开、单位错误、类别/能力不兼容、循环/端口冲突、传播遗漏、渲染对象误用、超额定、证据不足、介质/电压/热限值错误都能被自动定位到稳定错误码。
- 基础图本身没有结构错误；异常用例的错误是由注入故障引起的（基础图 0 错误，因此不是“基线本来就坏”）。

**没证明**：
- 不证明制动距离、转向手感、冷却能力、回电/续航、操控稳定性。
- 不证明 CAN 报文兼容、EMC、碰撞、结构强度、耐久。
- 不证明所有真实接口都被覆盖；未知项仍是未知。
- 不证明这些字段就是行业标准；它们只是 CARLAB 提案。

---

## 9. 公开来源与证据强度

> 检索日期：2026-11-14。ISO/SAE 标准正文多为付费；下表只声明“官方摘要/目录页确认了标准的存在与范围”，不复制具体条款数值。UNECE/eCFR 全文可读，但本报告不复制其试验限值。**来源支持的是接口类别与失效模式，不是示意车型的具体参数。**

| ID | 来源 | 类型 | 支持的论断 | 限制 |
|---|---|---|---|---|
| SRC-01 | ISO 8855:2011 Road vehicles — Vehicle dynamics and road-holding ability — Vocabulary, https://www.iso.org/standard/51180.html | 标准 | 车辆动力学坐标/运动变量/术语需要共同定义 | 正文付费；仅核对官方摘要 |
| SRC-02 | SAE J670 Vehicle Dynamics Terminology, https://saemobilus.sae.org/standards/j670_202206-vehicle-dynamics-terminology | 标准 | 轴系、车身、悬架/转向/轮胎术语 | 正文付费；仅核对官方摘要 |
| SRC-03 | ISO 11898-1:2015 CAN data link layer and physical signalling, https://www.iso.org/ru/standard/63648.html | 标准 | CAN 数据链路层/物理信令标准存在 | 不编造报文 ID/波特率/布局 |
| SRC-04 | ISO 17987-1:2016 Local Interconnect Network (LIN), https://www.iso.org/standard/61222.html | 标准 | LIN 总线体系结构标准存在 | 仅用于信息接口子类型枚举 |
| SRC-05 | IEEE 802.3bw-2015 100BASE-T1, https://standards.ieee.org/ieee/802.3bw/5969/ | 标准 | 车载单对以太网物理层标准存在 | 仅用于信息接口子类型枚举 |
| SRC-06 | ISO 14229-1:2020 Unified diagnostic services (UDS), https://www.iso.org/standard/72439.html | 标准 | 诊断服务的数据链路无关要求 | 不定义具体 DID/报文 |
| SRC-07 | ISO 26262-1:2011 Road vehicles — Functional safety, https://www.iso.org/standard/43464.html | 标准 | E/E 安全相关系统失效危害的功能安全框架 | 不声称本项目达到任何 ASIL |
| SRC-08 | ISO 6469-3:2018 Electrical safety, https://www.iso.org/standard/68667.html | 标准 | 电压等级 B 电路电气安全要求 | 正文付费；仅核对摘要 |
| SRC-09 | UN Regulation No. 100, Rev.3, https://unece.org/sites/default/files/2024-01/R0100r3e.pdf | 法规 | 电动动力总成安全/触电防护/RESS | 不复制测试限值 |
| SRC-10 | FMVSS No. 106 Brake hoses, 49 CFR 571.106, https://www.ecfr.gov/current/title-49/subtitle-B/chapter-V/part-571/subpart-B/section-571.106 | 法规 | 制动软管/接头/总成性能要求 | 美国法规；不覆盖所有市场 |
| SRC-11 | UN Regulation No. 13-H Braking of passenger cars, https://unece.org/sites/default/files/2022-07/R013Hr4a3e.pdf | 法规 | 服务制动/再生制动/混合制动定义与要求 | 不声称满足法规 |
| SRC-12 | ISO 4925:2020 Brake fluids, https://www.iso.org/standard/79370.html | 标准 | 非石油基制动液规格与试验 | 正文付费；仅核对摘要 |
| SRC-13 | ASTM D3306 Glycol Base Engine Coolant, https://store.astm.org/d3306-11.html | 标准 | 乙二醇/丙二醇冷却液要求 | 正文付费；仅核对摘要 |
| SRC-14 | SAE J20 Coolant System Hoses, https://www.sae.org/standards/j20_202202-coolant-system-hoses | 标准 | 水/乙二醇冷却软管要求 | 正文付费；仅核对摘要 |
| SRC-15 | SAE J639 Refrigerant Vapor Compression Systems, https://www.sae.org/standards/j639_202011-safety-design-standards-motor-vehicle-refrigerant-vapor-compression-systems | 标准 | 汽车空调制冷剂系统安全/设计 | 本图 HVAC 回路仍为 OUT_OF_SCOPE |
| SRC-16 | ISO 16750-2:2023 Electrical loads, https://www.iso.org/standard/76119.html | 标准 | 电气/电子设备电气负载环境应力 | 正文付费；仅核对摘要 |
| SRC-17 | ISO 20653:2013 Degrees of protection (IP code), https://www.iso.org/ru/standard/58048.html | 标准 | 道路车辆电气设备外壳防护 | 不绑定具体版本；2023 版存在 |
| SRC-18 | ISO 7637-2:2011 Electrical transient conduction, https://www.iso.org/standard/50925.html | 标准 | 传导电气瞬态试验方法 | 正文付费；仅核对摘要 |
| SRC-19 | SAE J1772_202401 Conductive Charge Coupler, https://www.sae.org/standards/j1772_202401-sae-electric-vehicle-plug-hybrid-electric-vehicle-conductive-charge-coupler | 标准 | 导电充电连接器物理/电气/功能要求 | 正文付费；仅核对摘要 |
| SRC-20 | ISO 15118-2:2014 Vehicle-to-Grid Communication Interface, https://www.iso.org/standard/55366.html | 标准 | 车辆与充电设备通信接口 | 本图充电信息接口为 OPEN |
| SRC-21 | AUTOSAR Classic Platform, https://www.autosar.org/standards/classic-platform | 技术参考 | 车载软件架构/总线接口分层 | 不是物理接口标准；不假设具体配置 |
| SRC-22 | ETRTO Standards Manual — Passenger Car Tyres, https://www.etrto.org/publications/available/standards-manual/ | 标准 | 轮胎尺寸/负荷标准体系 | 手册需购买；仅核对目录页 |
| SRC-23 | UN Regulation No. 79 Steering equipment, https://unece.org/sites/default/files/2024-04/R079r5e.pdf | 法规 | 转向设备定义与要求 | 不声称满足法规 |
| SRC-24 | UN Regulation No. 117 Tyre rolling noise and wet grip, https://unece.org/sites/default/files/2025-09/R117r5e.pdf | 法规 | 轮胎湿地附着/滚动噪声 | 不复制测试限值 |
| SRC-25 | ISO 11452-4:2011 Harness excitation methods, https://www.iso.org/obp/ui/#!iso:std:54500:en | 标准 | 线束受扰试验方法 | 正文付费；仅核对摘要 |
| SRC-26 | NHTSA interpretation nht76-1.9, https://www.nhtsa.gov/interpretations/nht76-19 | 政府技术参考 | 液压制动主缸/踏板/助力失效基本行为 | 解释性文件，不是设计手册 |
| SRC-27 | The Contact Patch — Ackermann geometry, https://www.thecontactpatch.com/road/c0504-ackermann-geometry | 技术参考 | 阿克曼内外轮角关系 | 教学资料；不据此宣称已标定 |

### 9.1 证据强度说明

- **标准/法规（SRC-01—25）**：证明“这类接口在汽车行业有标准/法规语境”，支持分类和失效模式；不证明示意车型的具体参数或合规。
- **技术参考（SRC-26/27）**：帮助解释制动液压放大和阿克曼几何；属于教学/解释性资料，不替代实测。
- **工程推导**：第 4 节的方程是第一性原理/常规工程关系；数值是示例。
- **假设**：踏板比、助力比、质量、硬点、冷却流量、轮胎模型等均为示意；在图中标 `ASSUMPTION` 或 `OPEN`。
- **未知**：CAN 协议、硬点、质量、热标定、轮胎模型、EMC/线束、render-only 映射；不编造。

---

## 10. 与 RP-01、原 R-02 及其他任务的待对齐点

### 10.1 与 RP-01（产品树）

| 待对齐 | 本报告的占位/提案 | 需要 RP-01 决定 |
|---|---|---|
| 节点 ID | `N-xxx`，`pbsRef: "RP-01:SYS-xx"` | 产品树是否用同一套 nodeId；是否需要全局唯一前缀 |
| 节点粒度 | 总成级（如“制动卡钳 FL”） | 是否拆到零件/紧固件；接口图如何引用子零件 |
| 跨系统共享总成 | 轮端同时属于 SYS-30 和 SYS-40 | 共享件在 PBS 中挂在哪；接口图如何多归属 |
| 功能节点 | `N-DRIVER`（HUMAN_INPUT）、`N-ECM`/`N-BRAKE-HCU`（控制器） | 功能树/控制视图是否允许出现在物理接口图；如何编号 |
| 变型条件 | `wheelbase/track/ride_height/powertrain_type/suspension_topology` | 与 `VehicleConfig/PlatformFamily` 的字段名和枚举对齐 |
| 网络/环境节点 | `N-CAN-BUS`、`N-ENV-AIR`、`N-ENV-ROAD` | 是否作为正式 PBS 节点，还是接口图专用抽象 |

### 10.2 与原 R-02（零件/装配数据契约）

| R-02 问题 | 本报告的接口 | 需要 R-02 冻结/对齐 |
|---|---|---|
| PartDefinition/PartVariant/PartInstance/Assembly 身份 | 节点 `kind` + `pbsRef`；边引用 node/port | `nodeId` 与 `instanceId/partId@revision` 的映射；一个装配实例一个节点还是多个 |
| Mount hardpoint 表示 | 端口 `frame: originM/axes/toleranceM/angularToleranceDeg` | 与 R-02 的 `MountFrame` 合并为**唯一** Frame 类型；不要两套坐标表示 |
| CAD mm / 运行时 m | 图统一 SI（m/kg/s/N）；非 SI 必须显式换算 | R-02 的 `sourceUnits` 与转换规则；接口图只接受 SI 或显式 conversion |
| Joint 抽象 | 描述性 `subtype`（FIXED_JOINT/ROTATING_SHAFT/BALL_JOINT/...） | 与 R-02 的固定/转动/球面/滑动/万向 joint 枚举做映射表；不要让两套分类竞争 |
| STEP/STL/GLB 映射 | `render.meshRefs`、`renderOnly` | R-02 资产 manifest/hash；接口图只引用，不保存资产细节 |
| 零件复用/实例 | 装配级节点；共享轮端 | R-02 的实例身份；避免“一个节点被多处共享后错误地一起运动” |
| 未知/估计/实测/仿真 | `EVIDENCE/ENGINEERING_DERIVATION/ASSUMPTION/OPEN` | 与 R-02 的来源分类、MASTER_PLAN 的 `VISUAL/GEOMETRY/KINEMATIC/DYNAMIC` 做映射 |

**建议的映射**（待 R-02 确认）：

| 本报告 | R-02/总计划 | 含义 |
|---|---|---|
| `EVIDENCE` | 有来源的尺寸/标准/实测 | 可作为工程依据 |
| `ENGINEERING_DERIVATION` | 推导/常规工程 | 可做演示/初版，不能声称量产 |
| `ASSUMPTION` | 显式假设 | 必须标注，不得混入实测 |
| `OPEN` | 未知 | 不得编造；验证状态 `BLOCKED` |
| `renderOnly` | `VISUAL` | 只能看，不能作为工程连接 |
| `frame/rating` 完整 | `GEOMETRY` | 尺寸/接口有依据并通过几何检查 |
| MECH 边通过运动学校验 | `KINEMATIC` | 运动链/限位通过 |
| FLUID/THERMAL/ELEC/CONTACT 通过工况校验 | `DYNAMIC` | 力学/热/电模型通过 |

### 10.3 与 RP-03（真实性等级）

- 建议每条边增加 `fidelityLevel: GEOMETRY | KINEMATIC | DYNAMIC`，由 RP-03 定义判定标准；本报告暂不擅自填。
- 当前 JSON 的 `validation.requiredLevel` 使用证据等级（EVIDENCE/...），**不是**运动/动力学等级；这是两套维度，必须区分。
- 轮胎模型、悬架运动学、冷却热平衡、回馈混合的验收，应由 RP-03 给出可复现实验。

### 10.4 与 RP-04（CAD/资产）

- `renderOnly` 对象必须有明确清单；否则“看起来贴在一起”的装饰件可能被误当结构件。
- CAD/GLB 的 LOD/网格公差不能替代工程 Frame 公差；接口图只引用 `partId/revision/hash` 和 `meshRefs`。
- 建议 RP-04 在资产 manifest 中增加 `engineeringPorts` 引用，确保每个接口端口能追溯到 CAD 基准。

### 10.5 与 RP-06（浏览器查看）

- 查看器不应只显示 Mesh；应能显示端口、Frame、能力、额定、证据等级和失效模式。
- “拆解/爆炸”应沿接口边断开，而不是按 Mesh 随机移动；断开后应显示哪些下游功能失效。
- 变型对比应显示影响闭包和未满足的验证门，而不是只换模型。

---

## 11. 缺口、风险与需要总控裁定的事项

### 11.1 已覆盖/部分覆盖的 GAP

- `GAP-003`（装配接口/基准轴/左右镜像/单位变换）：本报告给出端口 Frame、单位换算和错误码；但坐标约定仍需与 R-02 冻结。
- `GAP-005`（液压/流体回路数据链路）：本报告给出介质、压力/流量/温度、失效模式和测试；但缺少真实流量/热标定。
- `GAP-007`（线束/连接器/配电/信号拓扑）：本报告给出电能/信息接口类别、电压等级、端接/反接/总线失效；但**没有**真实 DBC/ARXML/线束图。
- `GAP-013`（需求→系统→接口→模型→测试追溯）：本报告给出 `systemRef`、`pbsRef`、`evidence.refs`、`validation` 和测试用例；但尚未接入正式需求库。

### 11.2 新发现的缺口

| 新缺口 | 说明 | 建议 |
|---|---|---|
| `GAP-RP02-01` | 接口图 Schema 尚未成为 ADR/共享 schema | 由 GPT-6 审核后决定是否冻结 `interface-graph/0.1.0` |
| `GAP-RP02-02` | 缺少 `fidelityLevel`（GEOMETRY/KINEMATIC/DYNAMIC） | 与 RP-03 对齐后加入 |
| `GAP-RP02-03` | 缺少真实 CAN DB/线束图/接地策略 | 只有拿到授权数据后才填；否则保持 OPEN |
| `GAP-RP02-04` | 缺少硬点/质量/热标定/轮胎模型 | 作为后续 CAD/实验任务的输入，不得编造 |
| `GAP-RP02-05` | 结构强度/碰撞/耐久/NVH/EMC 不在本图范围 | 单独立项；接口图只保留接口，不冒充结构验证 |
| `GAP-RP02-06` | `renderOnly` 清单和 render→partId 映射缺失 | RP-04/RP-06 建立资产清单 |
| `GAP-RP02-07` | 内部通道/内部边的建模规则未定 | 本图用 `edgeRole: INTERNAL` 显式表示 HCU 内部通道；需 R-02 确认是否与装配内部结构合并 |

### 11.3 风险

- **把提案当标准**：所有枚举/错误码都是 CARLAB 提案；不能对外宣称“行业标准”。
- **把结构校验当物理验证**：24/24 通过只证明接口图自洽，不证明制动/转向/冷却/电驱性能。
- **把网格当工程**：视觉贴合/穿插不能推断传力、配合、密封、运动间隙。
- **过度自动传播**：变型闭包能提示“要重算什么”，但不能自动完成强度/热/动力学验证；不能因为闭包通过就放行。
- **未知被静默忽略**：`OPEN` 必须显示在 UI/报告中；不能把 `BLOCKED` 当成 `PASS`。
- **坐标混用**：现有 Three.js `+Y` 上/`+Z` 前与提案 `x` 前/`y` 左/`z` 上必须显式变换；未统一前不得用于生产。

### 11.4 需要总控裁定

1. 是否接受 `interface-graph/0.1.0-proposal` 作为下一轮接口引擎的输入草案。
2. 坐标/Frame 由 R-02 统一，还是由本报告提案先行冻结。
3. 节点粒度（总成级 vs 零件级）和跨系统共享件（轮端）的归属。
4. `capability` 枚举的所有权与版本管理。
5. `OPEN`/`BLOCKED` 在下游是“允许继续但降级”，还是“硬阻断”。
6. 是否将 `fidelityLevel` 纳入下一版 Schema（与 RP-03 对齐）。

---

## 12. 给下游 AI 的最小字段表与失败条件

### 12.1 最小可实现字段（第一版接口引擎）

**边（12 个必填）**：

```text
edgeId
interfaceClass
capability
from { nodeId, portId }
to { nodeId, portId }
direction
quantity.kind
quantity.unit
quantity.max
evidence.level
validation.requiredLevel
render.visualOnly
```

**端口（8 个必填）**：

```text
portId
interfaceClass
medium
provides[]
accepts[]
frame { originM, axes, toleranceM, angularToleranceDeg }  // 逻辑信号可为 null
rating[{ kind, max, unit }]
required
```

**节点（5 个必填）**：

```text
nodeId
kind
systemRef
pbsRef
renderOnly
```

### 12.2 六条“必须失败”

1. 边端点/端口不存在 → `E001`。
2. 量纲/quantity kind 不匹配，或非 SI 单位未声明换算 → `E003/E019/E014`。
3. 类别/能力不兼容（CAN 接液压、12V 接 400V、介质不符） → `E004/E016/E017`。
4. 超过端口额定、刚性 Frame 超差、热限值超限 → `E006/E008/E018`。
5. 禁止的环/端口冲突/必连端口未连接/必需路径断开 → `E009/E010/E011/E020`。
6. 渲染对象进入工程边，或证据等级不足 → `E013/E015`。

### 12.3 六条“不得推断”

1. 不得因为 Mesh 贴合就建工程边。
2. 不得因为 Mesh 不贴合就删力路径。
3. 不得把 `renderOnly` 对象当结构件/传力件。
4. 不得把 LOD/网格公差当工程配合公差。
5. 不得把 `ASSUMPTION` 当实测，把 `OPEN` 当已解决。
6. 不得把“接口图通过”当“整车性能通过”。

### 12.4 建议实现顺序

1. 把本报告的端口/边/节点字段做成 JSON Schema（只读、带版本号）。
2. 把第 3.5 节错误码做成校验器（可参考个人报告目录的 `RP-02-validator.mjs`）。
3. 用示例图 + 24 个用例做回归；基础图必须 0 错误。
4. 接 RP-01 的 PBS ID 和 R-02 的 Frame/instanceId；只做映射，不复制两套数据。
5. 接变型闭包（`variantDependencies`），先做“提示要重算什么”，不做自动改几何。
6. 在 Viewer 中显示端口/Frame/证据/失效；不要只显示 Mesh。

---

## 13. 结论与下一步建议

### 13.1 完成了什么

- 把整车连接拆成六类接口，并给出每类的连接对象、输入输出、单位、方向性、失效条件和公开来源。
- 用制动、转向+悬架、发动机冷却、电驱加速/回馈四条因果链，说明“输入→跨系统→响应”是怎样发生的。
- 给出轴距、轮距、离地间隙、ICE→BEV、悬架拓扑五张依赖传播表，列出要重算的零件/装配点/管路/线束/算法/质量属性和会失败的条件。
- 把“工程连接 Frame”和“渲染可见接触”严格分开，给出反例和自动测试。
- 交付可解析的 42 节点/86 边接口图、24 个测试用例和可运行校验器；基础图 0 错误，24/24 通过。
- 明确列出 8 个未知项和与 RP-01/R-02/RP-03 的待对齐点，没有编造 CAN 报文、硬点、质量或热标定数据。

### 13.2 未完成/有争议

- 没有真实车型数据；所有数值是示例/推导/假设。
- 没有 RP-01 产品树和 R-02 数据契约的最终版本，节点粒度/Frame 类型/capability 枚举仍需对齐。
- 没有 `fidelityLevel`（GEOMETRY/KINEMATIC/DYNAMIC）的正式定义；本报告只提出建议。
- 没有结构强度、碰撞、耐久、NVH、EMC、HVAC 制冷剂回路、燃油系统、详细线束的验证。
- 坐标约定（Three.js +Y 上/+Z 前 vs 提案 x 前/y 左/z 上）未冻结；这是进入生产前的硬门槛。

### 13.3 下一步建议（只列两项）

1. **总控组织 RP-01/R-02 对齐会**：冻结 `Frame`、`nodeId/instanceId` 映射、`capability` 枚举和坐标变换；把本报告的 `interface-graph/0.1.0-proposal` 决定为“接受/修改/驳回”。
2. **只做一个纵切样板**：选“前轮端 + 制动卡钳 + 悬架角 + 轮速/制动管路”这一小段，用真实硬点/质量（或明确假设）把接口图、CAD、运动学、制动液压和 Viewer 串起来；通过后再扩展整车。

---

## 附录 A：校验器源码

> 该源码也保存在 `agent-workspace/agents/deepseek/reports/RP-02-validator.mjs`。它是研究验证脚本，不是生产代码，不属于共享 schema。

```js
import fs from 'node:fs';
import path from 'node:path';

const root = 'F:/project/cyq/AI_Coding/car/docs/planning/evidence';
const graphPath = process.argv[2] || path.join(root, 'RP-02-interface-graph.example.json');
const casesPath = process.argv[3] || path.join(root, 'RP-02-test-cases.json');

const UNIT_TABLE = {
  'N': { dim: { M: 1, L: 1, T: -2 }, canon: 'N', scale: 1 },
  'N*m': { dim: { M: 1, L: 2, T: -2 }, canon: 'N*m', scale: 1 },
  'm': { dim: { L: 1 }, canon: 'm', scale: 1 },
  'mm': { dim: { L: 1 }, canon: 'm', scale: 0.001 },
  'cm': { dim: { L: 1 }, canon: 'm', scale: 0.01 },
  'm/s': { dim: { L: 1, T: -1 }, canon: 'm/s', scale: 1 },
  'm/s^2': { dim: { L: 1, T: -2 }, canon: 'm/s^2', scale: 1 },
  'kg': { dim: { M: 1 }, canon: 'kg', scale: 1 },
  'kg*m^2': { dim: { M: 1, L: 2 }, canon: 'kg*m^2', scale: 1 },
  'N/m': { dim: { M: 1, T: -2 }, canon: 'N/m', scale: 1 },
  'N*s/m': { dim: { M: 1, T: -1 }, canon: 'N*s/m', scale: 1 },
  'V': { dim: { M: 1, L: 2, T: -3, I: -1 }, canon: 'V', scale: 1 },
  'A': { dim: { I: 1 }, canon: 'A', scale: 1 },
  'W': { dim: { M: 1, L: 2, T: -3 }, canon: 'W', scale: 1 },
  'J': { dim: { M: 1, L: 2, T: -2 }, canon: 'J', scale: 1 },
  'ohm': { dim: { M: 1, L: 2, T: -3, I: -2 }, canon: 'ohm', scale: 1 },
  'F': { dim: { M: -1, L: -2, T: 4, I: 2 }, canon: 'F', scale: 1 },
  'C': { dim: { I: 1, T: 1 }, canon: 'C', scale: 1 },
  'Hz': { dim: { T: -1 }, canon: 'Hz', scale: 1 },
  'Pa': { dim: { M: 1, L: -1, T: -2 }, canon: 'Pa', scale: 1 },
  'bar': { dim: { M: 1, L: -1, T: -2 }, canon: 'Pa', scale: 1e5 },
  'MPa': { dim: { M: 1, L: -1, T: -2 }, canon: 'Pa', scale: 1e6 },
  'kPa': { dim: { M: 1, L: -1, T: -2 }, canon: 'Pa', scale: 1e3 },
  'm^3/s': { dim: { L: 3, T: -1 }, canon: 'm^3/s', scale: 1 },
  'L/min': { dim: { L: 3, T: -1 }, canon: 'm^3/s', scale: 1 / 60000 },
  'kg/s': { dim: { M: 1, T: -1 }, canon: 'kg/s', scale: 1 },
  'K': { dim: { K: 1 }, canon: 'K', scale: 1 },
  '°C': { dim: { K: 1 }, canon: 'K', scale: 1, offset: 273.15 },
  'kg/m^3': { dim: { M: 1, L: -3 }, canon: 'kg/m^3', scale: 1 },
  'Pa*s': { dim: { M: 1, L: -1, T: -1 }, canon: 'Pa*s', scale: 1 },
  'W/m^2': { dim: { M: 1, T: -3 }, canon: 'W/m^2', scale: 1 },
  'W/(m^2*K)': { dim: { M: 1, T: -3, K: -1 }, canon: 'W/(m^2*K)', scale: 1 },
  'J/(kg*K)': { dim: { L: 2, T: -2, K: -1 }, canon: 'J/(kg*K)', scale: 1 },
  'bit/s': { dim: { T: -1 }, canon: 'bit/s', scale: 1 },
  'kbit/s': { dim: { T: -1 }, canon: 'bit/s', scale: 1e3 },
  'Mbit/s': { dim: { T: -1 }, canon: 'bit/s', scale: 1e6 },
  's': { dim: { T: 1 }, canon: 's', scale: 1 },
  'rad': { dim: {}, canon: 'rad', scale: 1 },
  'rad/s': { dim: { T: -1 }, canon: 'rad/s', scale: 1 },
  'rad/s^2': { dim: { T: -2 }, canon: 'rad/s^2', scale: 1 },
  'deg': { dim: {}, canon: 'rad', scale: Math.PI / 180 },
  'rpm': { dim: { T: -1 }, canon: 'rad/s', scale: (2 * Math.PI) / 60 },
  'km/h': { dim: { L: 1, T: -1 }, canon: 'm/s', scale: 1 / 3.6 },
  'mA': { dim: { I: 1 }, canon: 'A', scale: 1e-3 },
  'kW': { dim: { M: 1, L: 2, T: -3 }, canon: 'W', scale: 1e3 },
  'kJ': { dim: { M: 1, L: 2, T: -2 }, canon: 'J', scale: 1e3 },
  'Ah': { dim: { I: 1, T: 1 }, canon: 'C', scale: 3600 },
  'kWh': { dim: { M: 1, L: 2, T: -2 }, canon: 'J', scale: 3.6e6 },
  '1': { dim: {}, canon: '1', scale: 1 },
  '%': { dim: {}, canon: '1', scale: 0.01 }
};

const KIND_CANON = {
  force: 'N', torque: 'N*m', displacement: 'm', velocity: 'm/s', acceleration: 'm/s^2',
  mass: 'kg', inertia: 'kg*m^2', stiffness: 'N/m', damping: 'N*s/m',
  voltage: 'V', current: 'A', power: 'W', energy: 'J', resistance: 'ohm', capacitance: 'F', charge: 'C', frequency: 'Hz',
  pressure: 'Pa', volumetric_flow: 'm^3/s', mass_flow: 'kg/s', temperature: 'K', density: 'kg/m^3', viscosity: 'Pa*s',
  thermal_power: 'W', heat_flux: 'W/m^2', heat_transfer_coefficient: 'W/(m^2*K)', specific_heat: 'J/(kg*K)',
  friction_coefficient: '1', slip_ratio: '1', signal: '1', data_rate: 'bit/s', latency: 's',
  angle: 'rad', angular_velocity: 'rad/s', angular_acceleration: 'rad/s^2', ratio: '1'
};

const RIGID = new Set(['FIXED_JOINT', 'BOLTED', 'WELDED', 'PRESS_FIT', 'SPLINE_FIXED']);
const FRAME_ROLES = new Set(['PHYSICAL_CONNECTION', 'FLUID_CIRCUIT', 'ELEC_POWER', 'THERMAL_PATH', 'CONTACT', 'CONSTRAINT']);
const ENGINEERING_ROLES = new Set(['PHYSICAL_CONNECTION', 'FLUID_CIRCUIT', 'ELEC_POWER', 'THERMAL_PATH', 'CONTACT', 'CONSTRAINT']);
const LEVEL_ORDER = { OPEN: 0, ASSUMPTION: 1, ENGINEERING_DERIVATION: 2, EVIDENCE: 3 };

function normUnit(u) {
  if (typeof u !== 'string' || u.length === 0) return null;
  return u.replace(/·/g, '*').replace(/\s+/g, '');
}
function unitInfo(u) {
  const n = normUnit(u);
  if (!n) return null;
  return UNIT_TABLE[n] || null;
}
function sameDim(a, b) {
  const ka = Object.keys(a).filter(k => a[k] !== 0).sort();
  const kb = Object.keys(b).filter(k => b[k] !== 0).sort();
  if (ka.length !== kb.length) return false;
  return ka.every((k, i) => k === kb[i] && a[k] === b[k]);
}
function dist(a, b) {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}
function angleBetween(a, b) {
  const na = Math.sqrt(a[0] ** 2 + a[1] ** 2 + a[2] ** 2);
  const nb = Math.sqrt(b[0] ** 2 + b[1] ** 2 + b[2] ** 2);
  if (na === 0 || nb === 0) return 180;
  const dot = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (na * nb);
  return (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
}
function clone(x) { return JSON.parse(JSON.stringify(x)); }
function getByPath(obj, p) {
  const parts = p.split('.');
  let cur = obj;
  for (const part of parts) {
    if (cur == null) return undefined;
    if (/^\d+$/.test(part)) cur = cur[Number(part)];
    else cur = cur[part];
  }
  return cur;
}
function setByPath(obj, p, value) {
  const parts = p.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (/^\d+$/.test(part)) cur = cur[Number(part)];
    else {
      if (cur[part] == null || typeof cur[part] !== 'object') cur[part] = /^\d+$/.test(parts[i + 1]) ? [] : {};
      cur = cur[part];
    }
  }
  const last = parts[parts.length - 1];
  if (/^\d+$/.test(last)) cur[Number(last)] = value;
  else cur[last] = value;
}

function applyPatch(graph, patch) {
  for (const op of patch || []) {
    if (op.op === 'removeEdge') {
      graph.edges = graph.edges.filter(e => e.edgeId !== op.edgeId);
    } else if (op.op === 'addEdge') {
      graph.edges.push(clone(op.edge));
    } else if (op.op === 'addNode') {
      graph.nodes.push(clone(op.node));
    } else if (op.op === 'setEdge') {
      const e = graph.edges.find(x => x.edgeId === op.edgeId);
      if (!e) throw new Error(`patch setEdge: edge ${op.edgeId} not found`);
      setByPath(e, op.path, clone(op.value));
    } else if (op.op === 'setPort') {
      const n = graph.nodes.find(x => x.nodeId === op.nodeId);
      if (!n) throw new Error(`patch setPort: node ${op.nodeId} not found`);
      const p = n.ports.find(x => x.portId === op.portId);
      if (!p) throw new Error(`patch setPort: port ${op.nodeId}/${op.portId} not found`);
      setByPath(p, op.path, clone(op.value));
    } else if (op.op === 'setNode') {
      const n = graph.nodes.find(x => x.nodeId === op.nodeId);
      if (!n) throw new Error(`patch setNode: node ${op.nodeId} not found`);
      setByPath(n, op.path, clone(op.value));
    } else if (op.op === 'setGraph') {
      setByPath(graph, op.path, clone(op.value));
    } else {
      throw new Error(`unknown patch op ${op.op}`);
    }
  }
}

function buildIndex(graph) {
  const nodes = new Map();
  const ports = new Map();
  const portKey = (nodeId, portId) => `${nodeId}/${portId}`;
  for (const n of graph.nodes) {
    if (!nodes.has(n.nodeId)) nodes.set(n.nodeId, n);
    for (const p of n.ports || []) {
      const k = portKey(n.nodeId, p.portId);
      if (!ports.has(k)) ports.set(k, { node: n, port: p });
    }
  }
  return { nodes, ports, portKey };
}

function validate(graph) {
  const errors = [];
  const warnings = [];
  const addError = (code, message, ref) => errors.push({ code, message, ref });
  const idx = buildIndex(graph);
  const { nodes, ports, portKey } = idx;

  // duplicate IDs
  const nodeIds = new Set();
  for (const n of graph.nodes) {
    if (nodeIds.has(n.nodeId)) addError('INTF-E002', `duplicate nodeId ${n.nodeId}`, n.nodeId);
    nodeIds.add(n.nodeId);
    const pids = new Set();
    for (const p of n.ports || []) {
      if (pids.has(p.portId)) addError('INTF-E002', `duplicate portId ${n.nodeId}/${p.portId}`, `${n.nodeId}/${p.portId}`);
      pids.add(p.portId);
    }
  }
  const edgeIds = new Set();
  for (const e of graph.edges) {
    if (edgeIds.has(e.edgeId)) addError('INTF-E002', `duplicate edgeId ${e.edgeId}`, e.edgeId);
    edgeIds.add(e.edgeId);
  }

  const edgeCount = new Map();
  const renderOnly = new Set(graph.nodes.filter(n => n.renderOnly).map(n => n.nodeId));
  const assumptionEdges = [];
  const openEdges = [];
  const missingRating = [];

  for (const e of graph.edges) {
    const from = ports.get(portKey(e.from?.nodeId, e.from?.portId));
    const to = ports.get(portKey(e.to?.nodeId, e.to?.portId));
    if (!from || !to) {
      addError('INTF-E001', `edge ${e.edgeId} endpoint missing`, e.edgeId);
      continue;
    }
    const fromK = portKey(e.from.nodeId, e.from.portId);
    const toK = portKey(e.to.nodeId, e.to.portId);
    edgeCount.set(fromK, (edgeCount.get(fromK) || 0) + 1);
    edgeCount.set(toK, (edgeCount.get(toK) || 0) + 1);

    // render-only
    if (ENGINEERING_ROLES.has(e.edgeRole) && (renderOnly.has(e.from.nodeId) || renderOnly.has(e.to.nodeId))) {
      addError('INTF-E013', `edge ${e.edgeId} uses render-only node as engineering connection`, e.edgeId);
    }

    // class + capability
    if (from.port.interfaceClass !== e.interfaceClass) addError('INTF-E004', `edge ${e.edgeId} class vs from port ${from.port.interfaceClass}`, e.edgeId);
    if (to.port.interfaceClass !== e.interfaceClass) addError('INTF-E004', `edge ${e.edgeId} class vs to port ${to.port.interfaceClass}`, e.edgeId);
    const fProv = from.port.provides || [];
    const tAcc = to.port.accepts || [];
    if (!fProv.includes(e.capability)) addError('INTF-E004', `edge ${e.edgeId} capability ${e.capability} not provided by from port`, e.edgeId);
    if (!tAcc.includes(e.capability)) addError('INTF-E004', `edge ${e.edgeId} capability ${e.capability} not accepted by to port`, e.edgeId);
    if (e.direction === 'BIDIRECTIONAL') {
      if (!(to.port.provides || []).includes(e.capability)) addError('INTF-E004', `edge ${e.edgeId} reverse capability not provided by to port`, e.edgeId);
      if (!(from.port.accepts || []).includes(e.capability)) addError('INTF-E004', `edge ${e.edgeId} reverse capability not accepted by from port`, e.edgeId);
    }

    // direction / reverse rating
    if (e.graphRole === 'POWER_FLOW' && e.direction === 'BIDIRECTIONAL' && !e.flowDirection) {
      addError('INTF-E005', `edge ${e.edgeId} bidirectional POWER_FLOW lacks nominal flowDirection`, e.edgeId);
    }
    const needsReverse = e.direction === 'BIDIRECTIONAL' &&
      !['MECH_FORCE_MOTION', 'CONTACT_ENVIRONMENT'].includes(e.interfaceClass) &&
      !(e.interfaceClass === 'INFO_CONTROL' && e.edgeRole === 'SIGNAL_LINK');
    if (needsReverse) {
      if (!e.reverseRating) addError('INTF-E005', `edge ${e.edgeId} bidirectional ${e.interfaceClass} lacks reverseRating`, e.edgeId);
      else {
        const ri = unitInfo(e.reverseRating.unit);
        if (!ri) addError('INTF-E014', `edge ${e.edgeId} reverseRating unknown unit`, e.edgeId);
        else if (ri.canon !== KIND_CANON[e.reverseRating.kind]) addError('INTF-E003', `edge ${e.edgeId} reverseRating kind/unit mismatch`, e.edgeId);
      }
    }

    // quantity
    const q = e.quantity || {};
    const unknownQ = q.unknown === true;
    let qUnit = null;
    if (!unknownQ) {
      if (!q.kind || !KIND_CANON[q.kind]) addError('INTF-E014', `edge ${e.edgeId} missing/unknown quantity kind`, e.edgeId);
      qUnit = unitInfo(q.unit);
      if (!qUnit) addError('INTF-E014', `edge ${e.edgeId} missing/unknown unit ${JSON.stringify(q.unit)}`, e.edgeId);
      else if (q.kind && KIND_CANON[q.kind]) {
        const canonInfo = unitInfo(KIND_CANON[q.kind]);
        if (!sameDim(qUnit.dim, canonInfo.dim) || qUnit.canon !== canonInfo.canon) {
          addError('INTF-E003', `edge ${e.edgeId} unit ${q.unit} does not match quantity ${q.kind}`, e.edgeId);
        } else if (qUnit.scale !== 1 && q.conversion == null) {
          addError('INTF-E019', `edge ${e.edgeId} non-SI scale ${q.unit} lacks explicit conversion`, e.edgeId);
        }
      }
      if (q.nominal == null) warnings.push({ code: 'INTF-W003', edgeId: e.edgeId, message: 'nominal value not specified' });
    } else {
      openEdges.push(e.edgeId);
    }

    // ratings
    if (!unknownQ && q.kind) {
      for (const [side, port] of [['from', from], ['to', to]]) {
        const ratings = port.port.rating || [];
        const rt = ratings.find(x => x.kind === q.kind);
        if (!rt) { missingRating.push({ edgeId: e.edgeId, side, kind: q.kind }); continue; }
        const rUnit = unitInfo(rt.unit);
        if (!rUnit) addError('INTF-E014', `edge ${e.edgeId} ${side} rating unknown unit`, e.edgeId);
        else if (qUnit) {
          if (rUnit.canon !== qUnit.canon) addError('INTF-E003', `edge ${e.edgeId} ${side} rating unit dimension mismatch`, e.edgeId);
          else if (rUnit.scale !== qUnit.scale && rt.unitConversion == null) {
            addError('INTF-E019', `edge ${e.edgeId} ${side} rating unit scale ${rt.unit} lacks conversion`, e.edgeId);
          } else if (rt.max != null && q.max != null && q.max > rt.max) {
            addError('INTF-E006', `edge ${e.edgeId} max ${q.max} ${q.unit} exceeds ${side} rating ${rt.max} ${rt.unit}`, e.edgeId);
          }
        }
      }
    }

    // voltage class
    if (e.interfaceClass === 'ELEC_POWER' && e.voltageClass) {
      for (const side of ['from', 'to']) {
        const p = side === 'from' ? from.port : to.port;
        if (p.voltageClass !== e.voltageClass) addError('INTF-E017', `edge ${e.edgeId} voltageClass ${e.voltageClass} vs ${side} ${p.voltageClass}`, e.edgeId);
      }
    }

    // fluid medium
    if (e.interfaceClass === 'FLUID_HYDRAULIC' && e.medium) {
      for (const side of ['from', 'to']) {
        const p = side === 'from' ? from.port : to.port;
        if (p.medium !== e.medium) addError('INTF-E016', `edge ${e.edgeId} medium ${e.medium} vs ${side} ${p.medium}`, e.edgeId);
      }
    }

    // thermal limits
    if (e.temperatureMaxK != null && from.port.limits?.maxTemperatureK != null && e.temperatureMaxK > from.port.limits.maxTemperatureK) {
      addError('INTF-E018', `edge ${e.edgeId} temperature ${e.temperatureMaxK}K exceeds from limit ${from.port.limits.maxTemperatureK}K`, e.edgeId);
    }
    if (e.toTemperatureMaxK != null && to.port.limits?.maxTemperatureK != null && e.toTemperatureMaxK > to.port.limits.maxTemperatureK) {
      addError('INTF-E018', `edge ${e.edgeId} toTemperature ${e.toTemperatureMaxK}K exceeds to limit ${to.port.limits.maxTemperatureK}K`, e.edgeId);
    }

    // frames
    if (FRAME_ROLES.has(e.edgeRole)) {
      if (!from.port.frame || !to.port.frame) {
        addError('INTF-E007', `edge ${e.edgeId} requires both frames`, e.edgeId);
      } else if (RIGID.has(e.subtype)) {
        const tol = Math.max(from.port.frame.toleranceM ?? 0, to.port.frame.toleranceM ?? 0);
        const d = dist(from.port.frame.originM, to.port.frame.originM);
        if (d > tol + 1e-12) addError('INTF-E008', `edge ${e.edgeId} rigid frame distance ${d.toFixed(6)}m > tolerance ${tol}m`, e.edgeId);
        const ang = angleBetween(from.port.frame.axes?.x ?? [1, 0, 0], to.port.frame.axes?.x ?? [1, 0, 0]);
        const angTol = Math.max(from.port.frame.angularToleranceDeg ?? 0, to.port.frame.angularToleranceDeg ?? 0);
        if (ang > angTol + 1e-9) addError('INTF-E008', `edge ${e.edgeId} rigid frame angle ${ang.toFixed(3)}deg > tolerance ${angTol}deg`, e.edgeId);
      } else {
        if (e.spanM == null || e.maxAngleDeg == null) addError('INTF-E007', `edge ${e.edgeId} compliant link lacks spanM/maxAngleDeg`, e.edgeId);
      }
    }

    // evidence
    const actual = e.evidence?.level ?? 'OPEN';
    const required = e.validation?.requiredLevel ?? actual;
    if ((LEVEL_ORDER[actual] ?? 0) < (LEVEL_ORDER[required] ?? 0)) {
      addError('INTF-E015', `edge ${e.edgeId} evidence ${actual} below required ${required}`, e.edgeId);
    }
    if (actual === 'OPEN' || unknownQ || (e.unknowns || []).length > 0) openEdges.push(e.edgeId);
    if (actual === 'ASSUMPTION') assumptionEdges.push(e.edgeId);
  }

  // port degree
  for (const [k, count] of edgeCount.entries()) {
    const { port } = ports.get(k);
    const max = port.maxConnections ?? 1;
    if (count > max) addError('INTF-E010', `port ${k} has ${count} edges > maxConnections ${max}`, k);
  }

  // required ports
  for (const [k, { port }] of ports.entries()) {
    if (port.required && !edgeCount.has(k)) addError('INTF-E011', `required port ${k} is unconnected`, k);
  }

  // cycles
  const powerEdges = graph.edges.filter(e => e.graphRole === 'POWER_FLOW');
  const powerAdj = new Map();
  for (const e of powerEdges) {
    const dirs = [];
    if (e.flowDirection === 'TO_FROM' || e.direction === 'TO_FROM') dirs.push([e.to.nodeId, e.from.nodeId]);
    else if (e.flowDirection === 'FROM_TO' || e.direction === 'FROM_TO') dirs.push([e.from.nodeId, e.to.nodeId]);
    else { dirs.push([e.from.nodeId, e.to.nodeId], [e.to.nodeId, e.from.nodeId]); }
    for (const [a, b] of dirs) {
      if (!powerAdj.has(a)) powerAdj.set(a, []);
      powerAdj.get(a).push(b);
    }
  }
  const pVisiting = new Set(); const pDone = new Set();
  let powerCycle = false;
  function dfsPower(n) {
    if (pVisiting.has(n)) { powerCycle = true; return; }
    if (pDone.has(n)) return;
    pVisiting.add(n);
    for (const m of powerAdj.get(n) || []) dfsPower(m);
    pVisiting.delete(n); pDone.add(n);
  }
  for (const n of powerAdj.keys()) dfsPower(n);
  if (powerCycle) addError('INTF-E009', 'POWER_FLOW graph contains a directed cycle', 'graphRole:POWER_FLOW');

  const fluidEdges = graph.edges.filter(e => e.graphRole === 'FLUID_LOOP');
  const fluidAdj = new Map();
  const edgeByPair = new Map();
  for (const e of fluidEdges) {
    const a = e.direction === 'TO_FROM' ? e.to.nodeId : e.from.nodeId;
    const b = e.direction === 'TO_FROM' ? e.from.nodeId : e.to.nodeId;
    if (!fluidAdj.has(a)) fluidAdj.set(a, []);
    fluidAdj.get(a).push({ node: b, edge: e });
    edgeByPair.set(`${a}->${b}`, e);
  }
  const fVisiting = new Set(); const fDone = new Set(); const fStack = [];
  let badLoop = false;
  function dfsFluid(n) {
    if (fVisiting.has(n)) {
      const i = fStack.findIndex(x => x.node === n);
      if (i >= 0) {
        const cycleEdges = fStack.slice(i).map(x => x.edge);
        if (cycleEdges.some(e => e.loop !== true)) badLoop = true;
      }
      return;
    }
    if (fDone.has(n)) return;
    fVisiting.add(n);
    for (const { node: m, edge: e } of fluidAdj.get(n) || []) {
      fStack.push({ node: n, edge: e });
      dfsFluid(m);
      fStack.pop();
    }
    fVisiting.delete(n); fDone.add(n);
  }
  for (const n of fluidAdj.keys()) dfsFluid(n);
  if (badLoop) addError('INTF-E009', 'FLUID_LOOP cycle contains edge without loop:true', 'graphRole:FLUID_LOOP');

  // aggregate warnings
  if (openEdges.length) warnings.push({ code: 'INTF-W001', message: 'OPEN/unknown interfaces (not a structural failure)', edgeIds: [...new Set(openEdges)] });
  if (assumptionEdges.length) warnings.push({ code: 'INTF-W002', message: 'ASSUMPTION-level interfaces', edgeIds: assumptionEdges });
  if (missingRating.length) warnings.push({ code: 'INTF-W003', message: 'missing port rating for transmitted quantity', details: missingRating });

  const uniqErrors = [];
  const seen = new Set();
  for (const e of errors) {
    const k = `${e.code}|${e.ref}|${e.message}`;
    if (!seen.has(k)) { seen.add(k); uniqErrors.push(e); }
  }
  return { ok: uniqErrors.length === 0, errors: uniqErrors, warnings, summary: { nodes: graph.nodes.length, edges: graph.edges.length } };
}

function edgeAllows(e, fromKey, toKey) {
  if (e.direction === 'FROM_TO') return fromKey === `${e.from.nodeId}/${e.from.portId}` && toKey === `${e.to.nodeId}/${e.to.portId}`;
  if (e.direction === 'TO_FROM') return fromKey === `${e.to.nodeId}/${e.to.portId}` && toKey === `${e.from.nodeId}/${e.from.portId}`;
  return (fromKey === `${e.from.nodeId}/${e.from.portId}` && toKey === `${e.to.nodeId}/${e.to.portId}`) ||
         (fromKey === `${e.to.nodeId}/${e.to.portId}` && toKey === `${e.from.nodeId}/${e.from.portId}`);
}

function pathCheck(graph, from, to, classes) {
  const start = `${from.nodeId}/${from.portId}`;
  const goal = `${to.nodeId}/${to.portId}`;
  const allowed = new Set(classes || []);
  const adj = new Map();
  for (const e of graph.edges) {
    if (allowed.size && !allowed.has(e.interfaceClass)) continue;
    const a = `${e.from.nodeId}/${e.from.portId}`;
    const b = `${e.to.nodeId}/${e.to.portId}`;
    if (edgeAllows(e, a, b)) {
      if (!adj.has(a)) adj.set(a, []);
      adj.get(a).push(b);
    }
    if (edgeAllows(e, b, a)) {
      if (!adj.has(b)) adj.set(b, []);
      adj.get(b).push(a);
    }
  }
  const q = [start]; const seen = new Set([start]); const prev = new Map();
  while (q.length) {
    const cur = q.shift();
    if (cur === goal) break;
    for (const nxt of adj.get(cur) || []) {
      if (!seen.has(nxt)) { seen.add(nxt); prev.set(nxt, cur); q.push(nxt); }
    }
  }
  if (!seen.has(goal)) return { ok: false, code: 'INTF-E020', message: `no ${classes?.join('/') || 'any'} path from ${start} to ${goal}`, path: [] };
  const p = []; let cur = goal;
  while (cur && cur !== start) { p.push(cur); cur = prev.get(cur); }
  p.push(start); p.reverse();
  return { ok: true, path: p };
}

function impactCheck(graph, changed, declared) {
  const dep = graph.variantDependencies || { edges: [] };
  const closure = new Set(changed);
  let changedFlag = true;
  while (changedFlag) {
    changedFlag = false;
    for (const e of dep.edges) {
      if (closure.has(e.from) && !closure.has(e.to)) { closure.add(e.to); changedFlag = true; }
    }
  }
  const declaredSet = new Set(declared);
  const roots = new Set(changed);
  const missing = [...closure].filter(x => !declaredSet.has(x) && !roots.has(x)).sort();
  if (missing.length) return { ok: false, code: 'INTF-E012', message: 'impact closure missing declared nodes', missing, closure: [...closure].sort() };
  return { ok: true, missing: [], closure: [...closure].sort() };
}

function checkExpect(actual, expect) {
  const codes = (actual.errors || []).map(e => e.code);
  if (actual.code) codes.push(actual.code);
  const warnings = (actual.warnings || []).map(w => w.code);
  const problems = [];
  if (expect.ok !== undefined && actual.ok !== expect.ok) problems.push(`ok expected ${expect.ok} got ${actual.ok}`);
  for (const c of expect.codesInclude || []) if (!codes.includes(c)) problems.push(`missing code ${c}`);
  for (const c of expect.codesExclude || []) if (codes.includes(c)) problems.push(`unexpected code ${c}`);
  for (const c of expect.warningsInclude || []) if (!warnings.includes(c)) problems.push(`missing warning ${c}`);
  if (expect.missingInclude) {
    for (const m of expect.missingInclude) if (!(actual.missing || []).includes(m)) problems.push(`missing impact node ${m}`);
  }
  return problems;
}

const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
const testDoc = JSON.parse(fs.readFileSync(casesPath, 'utf8'));
const results = [];

for (const tc of testDoc.cases) {
  const g = clone(graph);
  applyPatch(g, tc.patch);
  let actual;
  if (tc.op === 'validate') actual = validate(g);
  else if (tc.op === 'path') actual = pathCheck(g, tc.from, tc.to, tc.classes);
  else if (tc.op === 'impact') actual = impactCheck(g, tc.changed, tc.declared);
  else throw new Error(`unknown op ${tc.op}`);
  const problems = checkExpect(actual, tc.expect);
  results.push({
    caseId: tc.caseId,
    title: tc.title,
    pass: problems.length === 0,
    problems,
    expected: tc.expect,
    actual: {
      ok: actual.ok,
      code: actual.code,
      errorCodes: [...new Set((actual.errors || []).map(e => e.code))],
      warningCodes: [...new Set((actual.warnings || []).map(w => w.code))],
      missing: actual.missing,
      path: actual.path
    }
  });
}

const passed = results.filter(r => r.pass).length;
const out = {
  graph: graphPath,
  cases: casesPath,
  baseGraph: (() => { const v = validate(graph); return { ok: v.ok, errors: v.errors.length, warnings: v.warnings.map(w => w.code), summary: v.summary }; })(),
  totals: { cases: results.length, passed, failed: results.length - passed },
  results
};
console.log(JSON.stringify(out, null, 2));
process.exit(passed === results.length ? 0 : 1);
```

---

## 附录 B：测试用例索引

| ID | 操作 | 注入/场景 | 期望码 |
|---|---|---|---|
| TC-01 | validate | 基础图 | 0 错误；W001/W002 |
| TC-02 | path | 主缸→FL 卡钳 | 连通 |
| TC-03 | path | 拔掉主缸→HCU | E020 |
| TC-04 | validate | 压力单位写成 N | E003 |
| TC-05 | validate | 额定值 mm 未换算 | E019 |
| TC-06 | validate | 卡钳口只接受 12V | E004 |
| TC-07 | validate | CAN 接液压口 | E004 |
| TC-08 | validate | 12V 端口标成 400V | E017 |
| TC-09 | validate | 卡钳接冷却液 | E016 |
| TC-10 | validate | 动力流闭环 | E009 |
| TC-11 | validate | 冷却环未声明 loop | E009 |
| TC-12 | validate | 同一端口两条边 | E010 |
| TC-13 | validate | 刚性 Frame 错位 5 mm | E008 |
| TC-14 | validate | 渲染车标当传力路径 | E013 |
| TC-15 | validate | 扭矩超额定 | E006 |
| TC-16 | validate | 证据等级不足 | E015 |
| TC-17 | validate | 未知单位 | E014 |
| TC-18 | impact | 轴距影响集漏项 | E012 |
| TC-19 | validate | 双向 HV 缺反向额定 | E005 |
| TC-20 | validate | 重复 edgeId | E002 |
| TC-21 | validate | 端点不存在 | E001 |
| TC-22 | validate | 热限值超限 | E018 |
| TC-23 | validate | 完整 EV 片段 | 正常 |
| TC-24 | validate | 未知 CAN 协议 | 正常 + W001 |

---

## 附录 C：如何复现

1. 读取图与用例：
   - `docs/planning/evidence/RP-02-interface-graph.example.json`
   - `docs/planning/evidence/RP-02-test-cases.json`
2. 运行校验器：
   ```bash
   node agent-workspace/agents/deepseek/reports/RP-02-validator.mjs \
     docs/planning/evidence/RP-02-interface-graph.example.json \
     docs/planning/evidence/RP-02-test-cases.json
   ```
3. 期望：`EXIT=0`，`totals.passed=24`，`baseGraph.ok=true`。
4. 保存输出：
   ```bash
   node agent-workspace/agents/deepseek/reports/RP-02-validator.mjs \
     docs/planning/evidence/RP-02-interface-graph.example.json \
     docs/planning/evidence/RP-02-test-cases.json \
     > docs/planning/evidence/RP-02-validation-results.json
   ```
5. 注意：校验器是研究脚本，不是生产代码；它不会修改图或共享 schema。

---

> **最终判断**：本报告可以支撑“接口依赖引擎”的第一版设计与测试，但**不能**支撑“整车工程正确”的结论。下一步必须由总控把坐标/Frame/节点 ID 与 RP-01/R-02 对齐，并选择一个轮端纵切样板做真实硬点、质量、运动学和液压的闭环验证。
