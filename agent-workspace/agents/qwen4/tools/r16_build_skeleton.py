#!/usr/bin/env python3
"""R-16 整车工程骨架生成器（stdlib only，只读 RP-01/R-06/R-11）。

从已验收的 RP-01 研究树派生候选工程骨架，不重新发明身份、不预填任何未核实数值。
输出：docs/research/R-16-vehicle-skeleton.fixture.json
"""
import json
import os
import glob

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
OUT = os.path.join(ROOT, "docs", "research", "R-16-vehicle-skeleton.fixture.json")

CORNERS = ["FL", "FR", "RL", "RR"]
FRONT = ["FL", "FR"]
REAR = ["RL", "RR"]

# RP-01 evidence/geomBasis → R-16 valueBasis。RP-01 的 geomBasis=SOURCED 计数为 0，
# 因此本骨架不可能产出 SOURCED 几何；这是继承事实，不是本轮遗漏。
TRUST_ORDER = ["SOURCED", "SOURCED_SECONDARY", "ENGINEERING_INFERENCE",
               "DEMO_ASSUMPTION", "ASSUMPTION", "UNKNOWN", "OUT_OF_SCOPE"]


def load(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def load_rp01():
    nodes, meta = {}, {}
    for f in sorted(glob.glob(os.path.join(ROOT, "docs", "planning", "evidence", "RP-01-tree-*.json"))):
        d = load(f)
        meta[os.path.basename(f)] = {k: d[k] for k in d if k != "nodes"}
        for n in d["nodes"]:
            nodes[n["id"]] = n
    return nodes, meta


def value_basis(n):
    """身份/结构可信度：只由 evidence 与是否有来源决定，不与几何混取。

    几何可信度单独由 geomBasis 表达（见 geometry_basis），实例的总体 valueBasis
    再取身份/几何/质量/安装四者最弱。这样不会把「结构已核实但几何未测」误报为全未知。
    """
    ev = n.get("evidence")
    if ev == "EVIDENCE":
        return "SOURCED_SECONDARY" if n.get("sources") else "UNKNOWN"
    if ev == "ASSUMPTION":
        return "ASSUMPTION"
    return "UNKNOWN"


def geometry_basis(n):
    gb = n.get("geomBasis")
    return {"SOURCED": "SOURCED", "NEEDS_MEASUREMENT": "UNKNOWN",
            "DEMO_ASSUMPTION": "DEMO_ASSUMPTION", "DEFERRED": "UNKNOWN",
            "NOT_APPLICABLE": "OUT_OF_SCOPE"}.get(gb, "UNKNOWN")


def weaker(a, b):
    return max([a, b], key=TRUST_ORDER.index)


# 显式实例化计划：scope 决定实例数与角位。RP-01 未声明 per-corner 分配，
# 因此 distribution 一律标 ENGINEERING_INFERENCE，并保留整车级原值。
PLAN = [
    # (assemblyId, scope, corners, note)
    ("ASSY-30-001", "PER_CORNER", CORNERS, "轮端总成身份四角齐全；RP-01 note 声明轮毂轴承+车轮+制动接口可跨拓扑复用，转向节不可复用"),
    ("ASSY-30-002", "PER_CORNER", CORNERS, "Gen1 轮毂轴承，条件 CG-HUB=GEN1"),
    ("ASSY-30-003", "PER_CORNER", CORNERS, "Gen3 轮毂轴承单元，条件 CG-HUB=GEN3；与 Gen1 互斥"),
    ("ASSY-30-004", "PER_CORNER", CORNERS, "车轮总成四角"),
    ("ASSY-30-005", "PER_CORNER", CORNERS, "轮胎总成，外购不可拆，分层仅示意不展开为独立采购件"),
    ("ASSY-20-002", "PER_CORNER", FRONT, "上摆臂总成，仅前轴（双叉臂）"),
    ("ASSY-20-003", "PER_CORNER", FRONT, "下摆臂总成，仅前轴"),
    ("ASSY-20-004", "PER_CORNER", FRONT, "前转向节，仅前轴；后轴为整体桥无转向节"),
    ("ASSY-20-005", "PER_CORNER", FRONT, "前弹簧与减振器"),
    ("ASSY-40-008", "PER_CORNER", FRONT, "卡钳总成，前盘式"),
    ("ASSY-40-009", "PER_CORNER", FRONT, "制动盘总成，前盘式"),
    ("ASSY-40-010", "PER_CORNER", REAR, "后鼓式制动器模块，条件 CG-RBRK=ASSY-40-010"),
    ("ASSY-20-007", "PER_AXLE", ["FRONT_AXLE"], "前横向稳定杆跨左右两角，不是每角一件"),
    ("ASSY-20-011", "PER_AXLE", ["REAR_AXLE"], "整体桥后悬架，桥壳为轴级单件"),
    ("ASSY-20-014", "VEHICLE_UNIQUE", ["VEH"], "转向操纵与齿轮齿条转向器，整车单件"),
]

# 每个零件的整车数量如何分配到角位。RP-01 只给整车级 qty，分配是工程推断。
# 条目 = (实例化角位, 除数)。两者刻意分开：卡钳类 qty=4 是「四轮盘式」假设下的整车总数，
# 但本变型后轴为鼓式，只在前两角实例化；除数仍为 4 才能得到每角 1 件。
# 这类「继承总数与变型不一致」必须显式记为冲突，不得静默改数。
DIST = {}


def _d(ids, corners, divisor):
    for pid in ids:
        DIST[pid] = (corners, divisor)


# 轮端 Gen1 / Gen3 / 车轮：四角，每角一套
_d(["PART-30-00%d" % i for i in range(1, 10)], "ALL4", 4)
_d(["PART-30-01%d" % i for i in range(0, 9)], "ALL4", 4)
_d(["PART-30-019", "PART-30-027", "PART-30-028", "PART-30-029", "PART-30-030",
    "PART-30-031", "PART-30-032"], "ALL4", 4)
_d(["PART-30-02%d" % i for i in range(1, 7)], "ALL4", 4)
# 前悬架：整车 qty 已是前两角合计，除数 2
_d(["PART-20-001", "PART-20-003", "PART-20-004", "PART-20-005",
    "PART-20-008", "PART-20-010", "PART-20-011", "PART-20-012",
    "PART-20-014", "PART-20-015", "PART-20-016", "PART-20-018",
    "PART-20-019", "PART-20-020", "PART-20-021"], "FRONT2", 2)
_d(["PART-20-002", "PART-20-006", "PART-20-007", "PART-20-009",
    "PART-20-013", "PART-20-017"], "FRONT2", 2)
# 前盘式制动：继承 qty 按四轮盘式标注，除数 4，只实例化前两角 → 冲突需记录
_d(["PART-40-034", "PART-40-035", "PART-40-036", "PART-40-037",
    "PART-40-040", "PART-40-046"], "FRONT2", 4)
_d(["PART-40-038", "PART-40-039", "PART-40-041", "PART-40-042",
    "PART-40-043", "PART-40-044"], "FRONT2", 4)
_d(["PART-40-045"], "FRONT2", 2)
# 后鼓式：整车 qty 已是后两角合计，除数 2
_d(["PART-40-050", "PART-40-053", "PART-40-055", "PART-40-056"], "REAR2", 2)
_d(["PART-40-051", "PART-40-052", "PART-40-054"], "REAR2", 2)
# 前稳定杆：轴级单总成，不除
_d(["PART-20-031", "PART-20-032", "PART-20-033", "PART-20-034",
    "PART-20-035", "PART-20-036"], "AXLE_FRONT", 1)
# 整体桥：轴级
_d(["PART-20-057", "PART-20-058", "PART-20-059", "PART-20-060", "PART-20-061"], "AXLE_REAR", 1)
# 转向器：整车单件；拉杆端类按前两角
_d(["PART-20-066", "PART-20-067", "PART-20-068", "PART-20-069", "PART-20-070",
    "PART-20-071", "PART-20-072", "PART-20-073", "PART-20-088"], "VEH1", 1)
_d(["PART-20-074", "PART-20-075", "PART-20-076", "PART-20-077", "PART-20-078"], "FRONT2", 2)

DIST_CORNERS = {"ALL4": CORNERS, "FRONT2": FRONT, "REAR2": REAR,
                "AXLE_FRONT": ["FRONT_AXLE"], "AXLE_REAR": ["REAR_AXLE"], "VEH1": ["VEH"]}

# 左右敏感性：RP-01 的 mirrored=True 表示几何必须镜像再生成，不得用负缩放。
MIRROR_REQUIRED_CLASS = {"linkage", "structure", "housing"}


def handedness_policy(n, mirrored_ids):
    pid = n["id"]
    if pid in mirrored_ids:
        return {"kind": "MIRROR_REGENERATE",
                "reason": "RP-01 标 mirrored=True：左右几何不同，必须再生成镜像几何",
                "globalScaleForbidden": True,
                "requiresDistinctMountFrame": True}
    pc = n.get("partClass")
    if pc in ("fastener", "bearing", "seal", "friction", "rotating", "spring", "damper"):
        return {"kind": "SYMMETRIC_PART_DISTINCT_MOUNT",
                "reason": "零件本体左右对称，但安装 Frame 随角位不同",
                "globalScaleForbidden": True,
                "requiresDistinctMountFrame": True}
    return {"kind": "SYMMETRIC_SHARED",
            "reason": "本体与安装语义左右一致",
            "globalScaleForbidden": True,
            "requiresDistinctMountFrame": False}


def build(hub="ASSY-30-002", fastener="STUD_AND_NUT", out=None):
    nodes, meta = load_rp01()
    r06 = load(os.path.join(ROOT, "docs", "research", "R-06-minimal-assembly-bom.json"))
    r11 = load(os.path.join(ROOT, "docs", "research", "R-11-geometry-evidence.example.json"))
    core = meta["RP-01-tree-core.json"]

    kids = {}
    for i, n in nodes.items():
        kids.setdefault(n.get("parent"), []).append(i)
    mirrored_ids = {i for i, n in nodes.items() if n.get("mirrored") is True}

    pr_by_id = {p["id"]: p for p in r06["parameterRequirements"]}

    # ---- 结构层：忠实继承 RP-01，不新增身份 ----
    systems, subsystems, assemblies, definitions, families, datums, refs = [], [], [], [], [], [], []
    for i, n in sorted(nodes.items()):
        base = {"id": i, "name": n["name"], "nameEn": n.get("nameEn"),
                "parentId": n.get("parent"), "rp01Kind": n["kind"],
                "body": n.get("body"), "power": n.get("power"),
                "optionality": n.get("optionality"),
                "choiceGroup": n.get("choiceGroup"),
                "evidenceInherited": n.get("evidence"),
                "valueBasis": value_basis(n),
                "sources": n.get("sources", []),
                "note": n.get("note")}
        k = n["kind"]
        if k == "system":
            systems.append(base)
        elif k == "subsystem":
            subsystems.append(base)
        elif k == "assembly":
            base["purchaseBoundary"] = "PURCHASED_NON_SERVICEABLE" if i in ("ASSY-30-002", "ASSY-30-003", "ASSY-30-005") else "ASSEMBLED"
            base["targetLevel"] = n.get("targetLevel")
            assemblies.append(base)
        elif k == "part":
            base["partClass"] = n.get("partClass")
            base["geomBasisInherited"] = n.get("geomBasis")
            base["geometryBasis"] = geometry_basis(n)
            base["geomNote"] = n.get("geomNote")
            base["familyRef"] = n.get("familyRef")
            base["qtyVehicleTotal"] = n.get("qty")
            base["qtyBasis"] = "VEHICLE_LEVEL_FLAT_ANNOTATION"
            base["mirroredInRP01"] = i in mirrored_ids
            base["variantFlag"] = n.get("variantFlag")
            base["deferReason"] = n.get("deferReason")
            base["demoSimplification"] = n.get("demoSimplification")
            base["handednessPolicy"] = handedness_policy(n, mirrored_ids)
            base["geometryStatus"] = "GEOMETRY_PENDING"
            base["massStatus"] = "UNKNOWN"
            base["mountStatus"] = "UNKNOWN"
            base["instancePolicy"] = "DEFERRED"
            definitions.append(base)
        elif k == "family":
            families.append(base)
        elif k == "datum":
            datums.append(base)
        elif k == "ref":
            base["refId"] = n.get("refId")
            base["countedInBom"] = False
            refs.append(base)

    def_by_id = {d["id"]: d for d in definitions}

    # ---- 变型：继承 CFG-BOF-ICE，状态不得升级 ----
    cfg = next(c for c in core["configurations"] if c["id"] == "CFG-BOF-ICE")
    variant = {
        "id": "VAR-R16-BOF-ICE",
        "basedOn": cfg["id"],
        "name": cfg["name"],
        "status": cfg["status"],
        "statusInherited": True,
        "bodyStructure": cfg["body"],
        "powertrain": cfg["power"],
        "assemblySelections": list(cfg["selections"]),
        "choiceGroups": {
            "CG-FSUSP": "ASSY-20-001", "CG-RSUSP": "ASSY-20-011",
            "CG-STEER": "ASSY-20-015", "CG-BOOST": "ASSY-40-002",
            "CG-PARK": "ASSY-40-011", "CG-HUB": "ASSY-30-002",
            "CG-RBRK": "ASSY-40-010", "CG-POWER": "ASSY-50-001",
            "CG-TRANS": "ASSY-60-001",
            "CG-FASTENER": fastener,
        },
        "note": "继承 RP-01 未批准候选配置，本轮不批准、不改型为任何真实车型。",
    }
    variant["choiceGroups"]["CG-HUB"] = hub

    # ---- 互斥架构规则 ----
    arch_rules = {
        "CG-HUB": {
            "status": "INHERITED_FROM_RP01",
            "exactlyOne": True,
            "options": {
                "ASSY-30-002": {"generation": "GEN1",
                                "requiresParts": ["PART-30-006"],
                                "forbidsParts": ["PART-30-010", "PART-30-011", "PART-30-012", "PART-30-017"]},
                "ASSY-30-003": {"generation": "GEN3",
                                "requiresParts": ["PART-30-010", "PART-30-011", "PART-30-012"],
                                "forbidsParts": ["PART-30-006", "PART-30-009"]},
            },
        },
        "CG-FASTENER": {
            "status": "PROPOSED_NEW_NOT_IN_RP01",
            "proposedBy": "R-11 CF-04 / DEC-07",
            "exactlyOne": True,
            "reason": "RP-01 三个车轮紧固节点全部 required，9 个选择组无一覆盖紧固架构；真实公开证据显示存在纯螺栓式车型（无螺柱）。",
            "options": {
                "STUD_AND_NUT": {
                    "studPartByGeneration": {"GEN1": "PART-30-009", "GEN3": "PART-30-017"},
                    "wheelFastenerPart": "PART-30-029",
                    "wheelFastenerRole": "WHEEL_NUT",
                    "studRequired": True,
                },
                "LUG_BOLT": {
                    "studPartByGeneration": {},
                    "wheelFastenerPart": "PART-30-029",
                    "wheelFastenerRole": "LUG_BOLT",
                    "studRequired": False,
                    "forbidsParts": ["PART-30-009", "PART-30-017"],
                },
            },
            "composability": "与 CG-HUB 正交可组合：Gen1×螺柱螺母、Gen1×轮螺栓、Gen3×螺柱螺母、Gen3×轮螺栓四种组合均合法，但每轴只能选其一。",
        },
    }

    # ---- 角位站 ----
    stations = []
    for c in CORNERS:
        axle = "FRONT" if c in FRONT else "REAR"
        side = "LEFT" if c in ("FL", "RL") else "RIGHT"
        stations.append({
            "corner": c, "axle": axle, "side": side,
            "steered": axle == "FRONT",
            "driven": "CONDITIONAL_UNKNOWN",
            "drivenNote": "驱动形式属 R-01 变体决策，本轮不擅自定案（继承 R-06 scope.drivenWheel=CONDITIONAL）",
            "brakeType": "DISC_FLOATING_CALIPER" if axle == "FRONT" else "DRUM",
            "suspensionTopology": "DOUBLE_WISHBONE" if axle == "FRONT" else "SOLID_AXLE",
            "hasSteeringKnuckle": axle == "FRONT",
            "depth": "DEEP_SLICE" if c == "FL" else ("MIRROR_OF_DEEP_SLICE" if c == "FR" else "IDENTITY_ONLY_PARTIAL"),
            "geometryStatus": "GEOMETRY_PENDING",
            "mountFrameId": "FR-CORNER-%s" % c,
            "rearLimitation": None if axle == "FRONT" else
                "RP-01 的 ASSY-30-001 是前轮端深钻样例；后轴为整体桥+鼓式，转向节/制动接口不同，本轮只建轮端与车轮身份，不擅自复用前悬架件",
        })

    # ---- 实例生成 ----
    asm_instances, part_instances, frames, qty_conflicts = [], [], [], []
    for aid, scope, corners, note in PLAN:
        an = nodes[aid]
        for c in corners:
            aiid = "AI-%s-%s" % (aid.split("-", 1)[1], c)
            fid = "FR-%s-%s" % (aid.split("-", 1)[1], c)
            sel = variant["choiceGroups"].get(an.get("choiceGroup"))
            active = (an.get("choiceGroup") is None) or (sel == aid)
            asm_instances.append({
                "instanceId": aiid, "assemblyId": aid, "corner": c,
                "scope": scope, "mountFrameId": fid,
                "activeInVariant": active,
                "conditionedBy": an.get("choiceGroup"),
                "valueBasis": value_basis(an),
                "evidenceInherited": an.get("evidence"),
                "geometryStatus": "GEOMETRY_PENDING",
                "note": note,
            })
            frames.append({
                "frameId": fid, "instanceId": aiid, "corner": c,
                "kind": "LOCAL_MOUNT_FRAME",
                "worldFrame": "UNFROZEN_PENDING_RP07",
                "originSemantics": "相对基准，未给世界绝对坐标",
                "handedness": "LEFT" if c in ("FL", "RL") else ("RIGHT" if c in ("FR", "RR") else "AXLE"),
                "mirrorPolicy": "REGENERATE_MIRRORED_GEOMETRY",
                "globalScaleForbidden": True,
                "r17Status": "CANDIDATE_MAPPING_ONLY",
            })
            if not active:
                continue
            for pid in sorted(kids.get(aid, [])):
                pn = nodes[pid]
                if pn["kind"] == "ref":
                    continue  # REF 不计入 BOM，不生成实例
                if pn["kind"] == "assembly":
                    continue  # 子总成由 PLAN 单独处理
                if pn["kind"] != "part":
                    continue
                spec_dist = DIST.get(pid)
                if spec_dist is None:
                    continue
                dist, divisor = spec_dist
                allowed = DIST_CORNERS[dist]
                if c not in allowed:
                    continue
                # 紧固架构互斥
                fa = variant["choiceGroups"]["CG-FASTENER"]
                opt = arch_rules["CG-FASTENER"]["options"][fa]
                gen = "GEN1" if variant["choiceGroups"]["CG-HUB"] == "ASSY-30-002" else "GEN3"
                if pid in ("PART-30-009", "PART-30-017"):
                    if not opt["studRequired"]:
                        continue
                    if opt["studPartByGeneration"].get(gen) != pid:
                        continue
                if pid in opt.get("forbidsParts", []):
                    continue
                hubopt = arch_rules["CG-HUB"]["options"][variant["choiceGroups"]["CG-HUB"]]
                if pid in hubopt["forbidsParts"]:
                    continue

                d = def_by_id[pid]
                total = pn.get("qty")
                per = (total / divisor) if isinstance(total, (int, float)) else None
                if per is not None and abs(per - round(per)) > 1e-9:
                    per = None  # 不整除则不擅自取整，标 UNKNOWN
                n_inst = int(round(per)) if per is not None else 1
                # 继承的整车总数 vs 本变型实际实例化总数：不一致必须显式记录，不得静默改数
                instantiated_total = n_inst * len(allowed)
                mismatch = (isinstance(total, (int, float)) and instantiated_total != total)
                if mismatch:
                    qty_conflicts.append({
                        "definitionId": pid, "name": pn["name"],
                        "qtyVehicleTotalInherited": total,
                        "instantiatedTotalInThisVariant": instantiated_total,
                        "distribution": dist, "divisor": divisor,
                        "reason": "RP-01 的整车级 qty 按另一种配置标注（如四轮盘式），与本变型选择（后轴鼓式）不一致",
                        "resolution": "保留继承原值可见，按每角物理件数实例化；差额记为冲突，交总控在 qty 口径迁移时裁决",
                        "status": "OPEN",
                    })
                role = opt["wheelFastenerRole"] if pid == "PART-30-029" else None
                for k in range(n_inst):
                    seq = "" if n_inst == 1 else "-%02d" % (k + 1)
                    piid = "PI-%s-%s%s" % (pid.split("-", 1)[1], c, seq)
                    identity = d["valueBasis"]
                    gb = d["geometryBasis"]
                    pi = {
                        "instanceId": piid, "definitionId": pid,
                        "assemblyInstanceId": aiid, "corner": c,
                        "ordinal": k + 1, "qtyPerCorner": n_inst,
                        "qtyVehicleTotalInherited": total,
                        "distribution": dist, "distributionDivisor": divisor,
                        "distributionBasis": "ENGINEERING_INFERENCE",
                        "distributionNote": "RP-01 只给整车级 qty，未声明每角分配；本分配为工程推断，不得当已核实数量",
                        "qtyVariantMismatch": mismatch,
                        "mountFrameId": fid,
                        "handednessPolicy": d["handednessPolicy"],
                        "identityBasis": identity,
                        "geometryBasis": gb,
                        "massBasis": "UNKNOWN",
                        "mountBasis": "UNKNOWN",
                        "valueBasis": weaker(weaker(identity, gb), "UNKNOWN"),
                        "valueBasisDefinition": d["valueBasis"],
                        "evidenceInherited": pn.get("evidence"),
                        "geometryStatus": "GEOMETRY_PENDING",
                        "massStatus": "UNKNOWN",
                        "mountStatus": "UNKNOWN",
                        "fastenerRole": role,
                        "countedInBom": True,
                        "isDeepSlice": c == "FL",
                    }
                    part_instances.append(pi)
                d["instancePolicy"] = "INSTANTIATED"

    # ---- MODEL_BLOCKED：证据缺失导致无法建模的项 ----
    blocked = [
        {"item": "轮毂法兰几何", "definitionIds": ["PART-30-006"], "r06ParamIds": ["PR-16"],
         "reason": "PCD/安装凸台/螺栓外径/厚全 UNKNOWN；R-11 未取得任何真实法兰几何", "status": "MODEL_BLOCKED"},
        {"item": "轮毂轴承内部几何", "definitionIds": ["PART-30-001", "PART-30-002", "PART-30-003", "PART-30-004"],
         "r06ParamIds": ["PR-14"], "reason": "滚道/接触角/球数/保持架 UNKNOWN；官方 HTML 无数值、PDF 正文不可解析", "status": "MODEL_BLOCKED"},
        {"item": "轴承配合公差", "definitionIds": ["PART-30-001", "PART-30-006"], "r06ParamIds": ["PR-15"],
         "reason": "转向节孔/轮毂颈配合等级 UNKNOWN；R-11 实证连制造商产品页也不给配合等级", "status": "MODEL_BLOCKED"},
        {"item": "摆臂本体与硬点", "definitionIds": ["PART-20-001", "PART-20-008"], "r06ParamIds": ["PR-18", "PR-19"],
         "reason": "摆臂跨度/枢轴硬点 UNKNOWN；R-01 已指出现有代码靠 scale 静默拉伸", "status": "MODEL_BLOCKED"},
        {"item": "球铰锥度与安装高度", "definitionIds": ["PART-20-003", "PART-20-010"], "r06ParamIds": ["PR-17"],
         "reason": "锥度/螺纹/安装高度 UNKNOWN；R-11 只取得接口语义（锥面或圆柱定位端），无数值", "status": "MODEL_BLOCKED"},
        {"item": "弹簧与减振器参数", "definitionIds": [], "r06ParamIds": ["PR-20", "PR-21"],
         "reason": "刚度/阻尼/自由长/安装点 UNKNOWN", "status": "MODEL_BLOCKED"},
        {"item": "转向节本体", "definitionIds": ["PART-20-016"], "r06ParamIds": ["PR-17", "PR-18"],
         "reason": "主销轴线/球铰座/轴承座孔 UNKNOWN", "status": "MODEL_BLOCKED"},
        {"item": "车架硬点", "definitionIds": ["PART-10-001"], "r06ParamIds": [],
         "reason": "R-01 固定硬点为演示假设；真实车架硬点无来源", "status": "MODEL_BLOCKED"},
        {"item": "轮辋接口 PCD/CB/ET", "definitionIds": ["PART-30-019"], "r06ParamIds": ["PR-06", "PR-07", "PR-08"],
         "reason": "R-11 证明代码 (5孔,114.3,67.1) 组合在真实车上不存在；ET 二手来源冲突", "status": "MODEL_BLOCKED"},
        {"item": "车轮紧固件座型", "definitionIds": ["PART-30-029"], "r06ParamIds": ["PR-10"],
         "reason": "R-11 取得螺纹 M12×1.5 但座型 ABSENT；且该螺纹属参考件不属本车", "status": "MODEL_BLOCKED"},
    ]
    for b in blocked:
        for pid in b["definitionIds"]:
            if pid in def_by_id:
                def_by_id[pid]["modelBlocked"] = True
                def_by_id[pid]["modelBlockedReason"] = b["reason"]

    # ---- 参考件隔离：Dorman 不得成为本车选型 ----
    spec = r11["referenceSpecimens"][0]
    ref_specimens = [{
        "id": spec["id"], "name": spec["name"], "manufacturer": spec["manufacturer"],
        "partNumber": spec["partNumber"], "sourceId": spec["sourceId"],
        "isVehicleSelection": False,
        "isDemoSamplePart": False,
        "installedInThisSkeleton": False,
        "reason": "R-11 已判定它是 Volvo S40/V40 的真实售后件，不是本演示样板零件；总控第四批审核明确『Dorman 螺柱不能偷偷变成当前车型 BOM 正式选型』。",
        "allowedUse": "FID-V 视觉参考与单位/换算方法校验，不进入本车 BOM 实例",
        "vehicleApplication": spec["vehicleApplication"],
        "parametersSourced": sum(1 for p in spec["parameters"] if p["grade"] == "SOURCED"),
    }]

    # ---- R-17 / R-18 映射（候选，不冻结）----
    r17 = {
        "status": "CANDIDATE_NOT_FROZEN",
        "instanceId": {"scheme": "PI-<系统号>-<三位序号>-<角位>[-<两位序>]",
                       "example": "PI-30-009-FL-01",
                       "uniqueness": "全局唯一；同一 definitionId 可有多实例，禁止按 familyRef 去重",
                       "mapsTo": "R-17 PartInstance.instanceId"},
        "assemblyInstanceId": {"scheme": "AI-<系统号>-<三位序号>-<角位>", "mapsTo": "R-17 AssemblyInstance.instanceId"},
        "frameId": {"scheme": "FR-<系统号>-<三位序号>-<角位>", "mapsTo": "R-17 MountFrame.frameId",
                    "worldFrame": "UNFROZEN_PENDING_RP07"},
        "definitionId": {"scheme": "沿用 RP-01 PART-*", "mapsTo": "R-17 PartDefinition.definitionId"},
        "evidenceFields": ["valueBasis", "valueBasisDefinition", "evidenceInherited",
                           "geometryStatus", "massStatus", "mountStatus", "distributionBasis"],
        "inheritanceRule": "instance.valueBasis 不得高于 definition.valueBasis；实例化不得升级 ASSUMPTION/UNKNOWN",
        "openForR17": ["instanceId 是否需含变型/版本段", "frameId 与世界 Frame 冻结后的换算", "qty 口径迁移到每父实例制"],
    }
    r18 = {
        "status": "CANDIDATE_NOT_FROZEN",
        "deepSlice": "FL 前轮端—双叉臂纵切",
        "movableChainCandidates": ["ASSY-20-002 上摆臂", "ASSY-20-003 下摆臂", "ASSY-20-004 转向节", "ASSY-20-005 弹簧减振器"],
        "hardpointStatus": "全部 UNKNOWN / DEMO，R-18 若求解必须显式标 DEMO 硬点",
        "jointSemantics": "球铰接口有 CONICAL_TAPER 与 CYLINDRICAL_DOG_POINT 两种（R-11 T04），单一锥度字段不足",
        "forbidden": ["用全局 scale 或拉伸 Mesh 假装运动", "把 KIN-E-CONVERGE 硬映射到静态 P09（总控已裁定不必虚构 P17）"],
        "instanceIdContract": "R-18 求解输入输出必须复用本骨架 instanceId，不得另建零件编号",
    }

    geom_pending = [d["id"] for d in definitions if d["geometryStatus"] == "GEOMETRY_PENDING"]
    seen_qc, uniq_qc = set(), []
    for q in qty_conflicts:
        if q["definitionId"] not in seen_qc:
            seen_qc.add(q["definitionId"])
            uniq_qc.append(q)
    qty_conflicts = uniq_qc

    fixture = {
        "schemaVersion": "R16-VEHICLE-SKELETON-0.1",
        "artifact": "vehicle-engineering-skeleton",
        "owner": "qwen4", "taskId": "R-16", "date": "2026-11-15",
        "status": "CANDIDATE_NOT_FROZEN",
        "purpose": "把 RP-01 研究树转为可供工程编辑/展示/仿真共同引用的车辆对象骨架样例；区分 System/Assembly/PartDefinition/PartInstance；不伪造未知 CAD 与 OEM 来源。",
        "sourceArtifacts": [
            {"path": "docs/planning/evidence/RP-01-tree-*.json", "readOnly": True, "role": "身份与关系唯一来源"},
            {"path": "docs/research/R-06-minimal-assembly-bom.json", "readOnly": True, "role": "参数缺口与阻塞界面"},
            {"path": "docs/research/R-11-geometry-evidence.example.json", "readOnly": True, "role": "参考件与来源纪律"},
        ],
        "idPolicy": {
            "inherited": core["idPolicy"],
            "newCandidatePrefixes": {"AI": "总成实例", "PI": "零件实例", "FR": "局部安装 Frame"},
            "status": "CANDIDATE_NOT_FROZEN",
        },
        "unitPolicy": {"cad": "mm", "simulation": "m / kg / s / N",
                       "note": "本骨架不记录任何几何数值；数值由后续 PartSpec 承载并须带来源。"},
        "framePolicy": {
            "worldFrame": "UNFROZEN_PENDING_RP07",
            "rule": "只用局部 Frame + 方向语义；禁止世界绝对坐标；禁止单方面冻结",
            "mirrorRule": "左右件必须再生成镜像几何，禁止全局负缩放",
        },
        "evidencePolicy": {
            "gradeEnum": TRUST_ORDER,
            "trustOrderStrongToWeak": TRUST_ORDER,
            "inheritanceRule": "instance.identityBasis 不得高于 definition.valueBasis；instance.valueBasis = weaker(identity, geometry, mass, mount)；实例化永不升级",
            "mappingFromRP01": {
                "evidence=EVIDENCE 且有 sources": "identityBasis=SOURCED_SECONDARY（结构存在已核实，非 OEM 图纸）",
                "evidence=EVIDENCE 但无 sources": "identityBasis=UNKNOWN（不得无来源声称已核实）",
                "evidence=ASSUMPTION": "identityBasis=ASSUMPTION",
                "evidence=OPEN": "identityBasis=UNKNOWN",
                "geomBasis=NEEDS_MEASUREMENT": "geometryBasis=UNKNOWN",
                "geomBasis=DEMO_ASSUMPTION": "geometryBasis=DEMO_ASSUMPTION",
                "geomBasis=DEFERRED": "geometryBasis=UNKNOWN",
                "geomBasis=NOT_APPLICABLE": "geometryBasis=OUT_OF_SCOPE",
            },
            "rp01SourcedGeometryCount": 0,
            "consequence": "RP-01 几何 SOURCED 计数为 0，故本骨架不可能产出 SOURCED 几何实例；这是继承事实。",
        },
        "variant": variant,
        "choiceGroupsInherited": core["choiceGroups"],
        "architectureRules": arch_rules,
        "cornerStations": stations,
        "systems": systems,
        "subsystems": subsystems,
        "assemblies": assemblies,
        "partFamilies": families,
        "partDefinitions": definitions,
        "datums": datums,
        "references": refs,
        "assemblyInstances": asm_instances,
        "partInstances": part_instances,
        "mountFrames": frames,
        "modelBlocked": blocked,
        "qtyConflicts": qty_conflicts,
        "referenceSpecimens": ref_specimens,
        "r17Mapping": r17,
        "r18Mapping": r18,
        "knownGaps": [
            "CG-FASTENER 是本轮新增候选，RP-01 未包含；需总控批准后才可回写根树（本轮只提补丁方案）",
            "每角数量分配为工程推断，RP-01 只给整车级 qty；采纳 D-04 需一次口径迁移",
            "后轴轮端只建身份，未复用前悬架件；整体桥+鼓式的后轮端深钻属后续任务",
            "驱动形式 CONDITIONAL_UNKNOWN，未定案",
            "所有几何 GEOMETRY_PENDING、质量与安装 UNKNOWN；无一 SOURCED",
            "世界 Frame 未冻结，instanceId/frameId 方案为候选",
        ],
        "summary": {
            "systems": len(systems), "subsystems": subsystems and len(subsystems),
            "assemblies": len(assemblies), "partDefinitions": len(definitions),
            "partFamilies": len(families), "datums": len(datums), "references": len(refs),
            "assemblyInstances": len(asm_instances), "partInstances": len(part_instances),
            "mountFrames": len(frames),
            "cornerStations": len(stations),
            "deepSliceCorners": sum(1 for s in stations if s["depth"] == "DEEP_SLICE"),
            "definitionsInstantiated": sum(1 for d in definitions if d["instancePolicy"] == "INSTANTIATED"),
            "definitionsDeferred": sum(1 for d in definitions if d["instancePolicy"] == "DEFERRED"),
            "geometryPending": len(geom_pending),
            "modelBlockedItems": len(blocked),
            "qtyConflicts": len(qty_conflicts),
            "instancesSourced": sum(1 for p in part_instances if p["valueBasis"] == "SOURCED"),
            "instancesIdentitySourcedSecondary": sum(1 for p in part_instances if p["identityBasis"] == "SOURCED_SECONDARY"),
            "instancesValueBasis": {},
            "instancesIdentityBasis": {},
            "referenceSpecimensInstalled": sum(1 for s in ref_specimens if s["installedInThisSkeleton"]),
            "rp01FilesModified": False, "r06Modified": False, "r11Modified": False, "srcModified": False,
        },
    }
    from collections import Counter
    fixture["summary"]["instancesValueBasis"] = dict(Counter(p["valueBasis"] for p in part_instances))
    fixture["summary"]["instancesIdentityBasis"] = dict(Counter(p["identityBasis"] for p in part_instances))
    fixture["summary"]["subsystems"] = len(subsystems)
    return fixture


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--hub", default="ASSY-30-002", choices=["ASSY-30-002", "ASSY-30-003"])
    ap.add_argument("--fastener", default="STUD_AND_NUT", choices=["STUD_AND_NUT", "LUG_BOLT"])
    ap.add_argument("--out", default=OUT)
    a = ap.parse_args()
    fx = build(a.hub, a.fastener)
    with open(a.out, "w", encoding="utf-8") as fh:
        json.dump(fx, fh, ensure_ascii=False, indent=2)
    s = fx["summary"]
    print("R-16 SKELETON BUILT ->", os.path.relpath(a.out, ROOT))
    print("  variant: CG-HUB=%s CG-FASTENER=%s" % (a.hub, a.fastener))
    for k, v in s.items():
        print("  %-28s %s" % (k, v))


if __name__ == "__main__":
    main()