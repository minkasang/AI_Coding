#!/usr/bin/env python3
"""R-26 裁决候选生成器（stdlib only，全部输入只读）。

把 R-21 的 9 项冲突收敛成对当前试验样板最小、明确、可机器验证的工程事实口径：
- 4 项 P0 逐项给 ACCEPT_CANDIDATE / BLOCKED_NEEDS_SOURCE / NEEDS_RP07
- PI-* 作为候选规范物理实例身份，INST-* 只作投影键，无法证明即拒绝
- 一个 PI 就是一件实物，qtyPerCorner 是聚合信息不可再乘
- 12 项盘/鼓数量矛盾保留为可追溯 blocker
不修改 RP-01 / R-16 / R-17 / R-18 / R-21 任何文件。
"""
import hashlib
import json
import os
from collections import Counter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
OUT = os.path.join(ROOT, "docs", "research", "R-26-decision-candidates.fixture.json")

R16 = "docs/research/R-16-vehicle-skeleton.fixture.json"
R21 = "docs/research/R-21-vehicle-tree-mapping.fixture.json"
R17V = "src-experiments/domain-contract-v1/fixtures/vehicle-skeleton.json"
R17F = "src-experiments/domain-contract-v1/fixtures/fl-wheel-end.json"
R18 = "src-experiments/mechanism-vertical-slice-v1/R-18-results.json"

INPUTS = [R16, R21, R17V, R17F, R18]
VERDICTS = ("ACCEPT_CANDIDATE", "BLOCKED_NEEDS_SOURCE", "NEEDS_RP07")


def load(rel):
    with open(os.path.join(ROOT, rel), encoding="utf-8") as fh:
        return json.load(fh)


def sha256(rel):
    h = hashlib.sha256()
    with open(os.path.join(ROOT, rel), "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def presence_map(v, f):
    """Frame 在两份夹具中的真实出现情况。台账不能再用“首次见到”当归属。"""
    vid = {x["frameId"] for x in v["frames"]}
    fid = {x["frameId"] for x in f["frames"]}
    out = {}
    for rid in sorted(vid | fid):
        in_v, in_f = rid in vid, rid in fid
        out[rid] = ("BOTH" if in_v and in_f else
                    "FL_ONLY" if in_f else "VEHICLE_ONLY")
    return out


def build():
    """生成裁决候选对象（纯函数，不写盘）。"""
    a = load(R16)
    d21 = load(R21)
    v = load(R17V)
    f17 = load(R17F)
    m18 = load(R18)

    r16def = {x["id"]: x for x in a["partDefinitions"]}
    presence = presence_map(v, f17)
    r17frames = {x["frameId"]: x for x in v["frames"]}
    r17frames.update({x["frameId"]: x for x in f17["frames"]})

    # ---------- 输入台账（带哈希，可核查未被替换）----------
    inputs = []
    for rel in INPUTS:
        inputs.append({"path": rel, "readOnly": True, "sha256": sha256(rel)})

    # ---------- 四层语义（PartDefinition vs PartInstance vs Assembly*）----------
    layer_semantics = {
        "PartDefinition": {
            "r16Field": "partDefinitions[].id", "r17Field": "partDefinitions[].partId",
            "meaning": "零件族/型号层：同名同型号可装多处，本身不是装车件",
            "countR16": len(a["partDefinitions"]), "countR17": len(v["partDefinitions"]),
            "isPhysicalPiece": False,
        },
        "PartInstance": {
            "r16Field": "partInstances[].instanceId", "r17Field": "partInstances[].instanceId",
            "meaning": "装车件层：一个 PI-* 就是一件实物，占一个角位/序号",
            "countR16": len(a["partInstances"]), "countR17": len(v["partInstances"]),
            "isPhysicalPiece": True,
        },
        "AssemblyDefinition": {
            "r16Field": "assemblies[].id", "r17Field": "assemblyDefinitions[].assemblyId",
            "meaning": "总成定义层：装配容器类型，不是装车实例",
            "countR16": len(a["assemblies"]), "countR17": len(v["assemblyDefinitions"]),
            "isPhysicalPiece": False,
        },
        "AssemblyInstance": {
            "r16Field": "assemblyInstances[].instanceId", "r17Field": "assemblies[].assemblyId",
            "meaning": "总成实例层：某车上的一套装车总成",
            "countR16": len(a["assemblyInstances"]), "countR17": len(v["assemblies"]),
            "isPhysicalPiece": False,
        },
        "fieldNameWarning": "R-17 用同一个 `assemblyId` 承载 AssemblyDefinition 与 AssemblyInstance 两个命名空间；"
                            "R-16 分用 assemblies / assemblyInstances。跨数组裸 join 会把定义当实例。",
    }

    # ---------- 规范身份策略 ----------
    canonical_policy = {
        "primaryPartInstanceId": "PI-*",
        "primaryPartInstanceIdBasis": "R-16 已批准候选树（GPT-6 batch6 决策：候选主实例 ID 为 PI-*）",
        "r17ProjectionKey": "INST-*",
        "r17ProjectionStatus": "VIEW_LOCAL_NOT_CANONICAL",
        "neverMultiplyQtyPerCorner": True,
        "variantIdentityAsserted": False,
        "variantIdentityNote": "两套变型 ID 不同，未声明对齐；不得断言是同一实车",
        "geometryClaim": "NONE_ALL_INSTANCES_GEOMETRY_PENDING",
        "frozen": False,
        "freezeGate": "RP-07",
    }

    # ---------- 4 项 P0 裁决 ----------
    decisions = []

    # CF-01：6 个占位总成复用真实 ID 但语义扩大；另有 3 项非占位名称漂移
    broadened = [x for x in d21["assemblyDefinitionMapping"] if x.get("semanticBroadening")]
    drifts = [x for x in d21["assemblyDefinitionMapping"] if x.get("nameDrift") and not x.get("semanticBroadening")]
    decisions.append({
        "id": "D-26-01", "conflictRef": "CF-01", "severity": "P0",
        "topic": "占位总成复用 RP-01 真实 ID 但语义被扩大",
        "verdict": "NEEDS_RP07",
        "verdictReason": "占位总成要不要另立 ID 前缀属于共享身份命名空间裁决，执行模型不得自行改；"
                         "在裁决前只能并列规范名与占位名，禁止把占位名当 RP-01 规范名使用。",
        "itemVerdicts": [
            {"assemblyId": x["assemblyId"], "r17Name": x["r17Name"], "rp01Name": x["rp01Name"],
             "itemVerdict": "BLOCKED_NEEDS_SOURCE",
             "itemReason": "R-17 占位名不能证明对应 RP-01 具体总成；无来源前不得声称是同一装配"}
            for x in broadened
        ] + [
            {"assemblyId": x["assemblyId"], "r17Name": x["r17Name"], "rp01Name": x["rp01Name"],
             "itemVerdict": "ACCEPT_CANDIDATE",
             "itemReason": "非占位性质的同名漂移：以 RP-01 规范名为准，R-17 名作 alias，不改变身份"}
            for x in drifts
        ],
        "whatCanProceed": "树上并列显示 RP-01 规范名 + R-17 占位名，标 semanticBroadening=true；qty 与实例仍按 PI-* 计",
        "whatIsBlocked": "不得把 6 个占位总成当作 RP-01 具体总成的装车实例；不得回写规范名",
        "constraints": ["不修改 RP-01/R-16 源数据", "不新建真实总成", "不按名称做裸 join"],
        "reversible": True,
        "affectedCount": len(broadened) + len(drifts),
    })

    # CF-06：父级压平
    pdrift = [x for x in d21["partInstanceMapping"] if not x["parentLevelMatch"]]
    item_verdicts_06 = []
    for x in pdrift:
        is_caliper = x["partId"] == "PART-40-048"
        item_verdicts_06.append({
            "r17InstanceId": x["r17InstanceId"], "partId": x["partId"],
            "r17Parent": x["r17ParentDefinitionRef"], "rp01Parent": x["rp01ParentAssemblyId"],
            "itemVerdict": "BLOCKED_NEEDS_SOURCE" if is_caliper else "ACCEPT_CANDIDATE",
            "itemReason": ("该零件本身变型条件未裁决（caliperFixedOrFloating），父级与去留都不能先定"
                           if is_caliper else
                           "规范父级可确定为 RP-01 侧；R-17 父级作为投影差异保留，qty 按 RP-01 父装配计算"),
        })
    decisions.append({
        "id": "D-26-02", "conflictRef": "CF-06", "severity": "P0",
        "topic": "父总成层级被压平，同一零件会算出不同 qty",
        "verdict": "NEEDS_RP07",
        "verdictReason": "规范父级层级是跨模型装配接口，需 RP-07 裁决；执行侧只能先固定“按 RP-01 规范父级计算 qty”作为候选口径。",
        "itemVerdicts": item_verdicts_06,
        "whatCanProceed": "对象树按 RP-01 规范父级渲染；qty 一律按规范父装配实例计算；R-17 父级记录为投影差异",
        "whatIsBlocked": "卡钳支架（PART-40-048）父级不能定，因为零件存在性本身未裁决",
        "constraints": ["不强行改 R-17 父级", "不把两种层级混算出平均数量"],
        "reversible": True,
        "affectedCount": len(pdrift),
    })

    # CF-07：14 处 Frame 带非零数值原点但没有 valueBasis
    numeric = [x for x in d21["frameMapping"] if x["hasNonZeroNumericOrigin"] and not x["r17ValueBasis"]]
    decisions.append({
        "id": "D-26-03", "conflictRef": "CF-07", "severity": "P0",
        "topic": "带非零数值原点的 Frame 未标可信度等级",
        "verdict": "ACCEPT_CANDIDATE",
        "verdictReason": "处置只是补标 DEMO_ASSUMPTION，属降级不属升级，不引入任何新事实；"
                         "世界 Frame 仍 UNFROZEN_PENDING_RP07，数值不得当已核实安装位置。",
        "itemVerdicts": [
            {"r17FrameId": x["r17FrameId"], "origin": x["origin"],
             "proposedLabel": "DEMO_ASSUMPTION",
             "itemVerdict": "ACCEPT_CANDIDATE",
             "itemReason": "与演示 halfTrack 0.84 / halfWB 1.23 同源，无测量来源"}
            for x in numeric
        ],
        "whatCanProceed": "所有下游把 14 个非零原点当 DEMO 值；可继续做可视化与候选运动",
        "whatIsBlocked": "不得据此声称安装位置已核实、不得做干涉/装配可行性结论",
        "constraints": ["space=VEHICLE_LOCAL 合法但仍非世界坐标", "worldFrame 保持 UNFROZEN_PENDING_RP07"],
        "reversible": True,
        "affectedCount": len(numeric),
    })

    # CF-09：两个不同变型 ID
    va = d21["variantAlignment"]
    decisions.append({
        "id": "D-26-04", "conflictRef": "CF-09", "severity": "P0",
        "topic": "两侧声明不同整车变型，跨夹具实例对应隐含未声明假设",
        "verdict": "BLOCKED_NEEDS_SOURCE",
        "verdictReason": "变型 ID 不同且无对齐来源；代际一致不能推出同一实车。"
                         "缺的是真实变型定义/总控对齐裁决，不是执行侧能补的数据。",
        "itemVerdicts": [
            {"subject": "R-16 变型", "value": va["r16VariantId"], "basedOn": va["r16VariantBasedOn"],
             "itemVerdict": "NEEDS_RP07", "itemReason": "缺 Project 层，变型基于未批准候选配置"},
            {"subject": "R-17 变型", "value": va["r17VariantId"],
             "platformFamilyRef": va["r17PlatformFamilyRef"],
             "itemVerdict": "BLOCKED_NEEDS_SOURCE", "itemReason": "缺真实变型定义，只设 1/10 选择组"},
            {"subject": "跨夹具实例对应", "count": 13,
             "itemVerdict": "BLOCKED_NEEDS_SOURCE",
             "itemReason": "变型未对齐前，13 条映射只能是候选对应，不能作为同一装车实例断言"},
        ],
        "whatCanProceed": "继续做候选对照与可视化；每条映射显式带 CONFLICT_CF-09 条件",
        "whatIsBlocked": "不得合并两棵树为“同一辆车”；不得用跨夹具数量互相校验作为结论",
        "constraints": ["不断言同一实车", "不把 generation 相同当变型相同", "不自行改 variantId"],
        "reversible": True,
        "affectedCount": 13,
    })

    # ---------- INST-* → PI-* 映射表（无法证明即拒绝）----------
    inst_mapping = []
    for x in d21["partInstanceMapping"]:
        r16id = x["r16InstanceId"]
        conditions = []
        if r16id:
            conditions.append("CF-09：变型对齐未裁决，本映射为候选对应")
            if not x["parentLevelMatch"]:
                conditions.append("CF-06：两侧父级不同，qty 按 RP-01 父级计算")
            if x.get("r16VariantFlag"):
                conditions.append(f"变型条件 {x['r16VariantFlag']} 未裁决")
            status = "CONDITIONAL"
            reason = "按 (partId, corner, ordinal) 可精确配对，但受上述条件约束"
        else:
            status = "REJECTED"
            conditions.append("R-16 无可绑定的 PI-*；不得为凑映射新增假实例")
            reason = x.get("unmappedReason") or "R-16 未实例化该零件定义"
        inst_mapping.append({
            "r17InstanceId": x["r17InstanceId"], "partId": x["partId"],
            "corner": x["corner"], "ordinal": x["ordinal"],
            "canonicalPartInstanceId": r16id,
            "mappingStatus": status,
            "conditions": conditions,
            "reason": reason,
            "fixture": x["fixture"],
        })
    inst_mapping.sort(key=lambda y: (y["mappingStatus"] != "CONDITIONAL", y["r17InstanceId"]))
    inst_counts = Counter(y["mappingStatus"] for y in inst_mapping)

    # ---------- qty 语义与 12 项 blocker ----------
    qty_semantics = {
        "rule": "一个 PI-* 就是一件实物；整车总数 = PI 实例计数",
        "qtyPerCornerMeaning": "零件族在单角位的聚合数量，属于定义/角位层级，不属于单个实例",
        "forbidden": "Σ(每个实例的 qtyPerCorner) —— 会把数量按实例数重复相乘",
        "evidence": "R-16 V03：每 (definitionId, corner) 的实例数必须等于 qtyPerCorner",
        "counterexample": {"partId": "PART-30-009", "instances": 20, "qtyPerCorner": 5,
                           "wrongSum": 20 * 5, "correctTotal": 20,
                           "note": "错误算法得 100，继承总数与正确算法都是 20"},
    }
    qty_blockers = []
    for q in a["qtyConflicts"]:
        qty_blockers.append({
            "definitionId": q["definitionId"], "name": q["name"],
            "qtyVehicleTotalInherited": q["qtyVehicleTotalInherited"],
            "instantiatedTotalInThisVariant": q["instantiatedTotalInThisVariant"],
            "delta": q["qtyVehicleTotalInherited"] - q["instantiatedTotalInThisVariant"],
            "distribution": q["distribution"], "divisor": q["divisor"],
            "status": "BLOCKED_OPEN", "blockerKind": "DISC_VS_DRUM_CONFIG_MISMATCH",
            "reason": q["reason"],
            "traceRef": f"R-16 qtyConflicts[{q['definitionId']}]",
            "resolutionOwner": "总控 RP-07（qty 口径迁移时裁决）",
        })

    # ---------- 两个 DEFERRED 零件：原因必须分开 ----------
    deferred_parts = []
    for pid, kind, rule in (
        ("PART-20-075", "REQUIRED_BUT_DEFERRED",
         "本变型必需；几何/来源未闭合，暂缓实例化；下游不得因缺实例而省略"),
        ("PART-40-048", "VARIANT_UNDECIDED",
         "变型条件未裁决（浮动式才有支架）；不得声称必有或必无"),
    ):
        dd = r16def.get(pid, {})
        deferred_parts.append({
            "partId": pid, "name": dd.get("name"),
            "deferKind": kind,
            "instancePolicy": dd.get("instancePolicy"),
            "optionality": dd.get("optionality"),
            "variantFlag": dd.get("variantFlag"),
            "qtyVehicleTotal": dd.get("qtyVehicleTotal"),
            "parentId": dd.get("parentId"),
            "hasCanonicalInstance": any(x["definitionId"] == pid for x in a["partInstances"]),
            "downstreamRule": rule,
        })

    # ---------- Frame 范围对账（21 vs 27、11 vs 14）----------
    def nz(rec):
        return isinstance(rec.get("origin"), list) and any(c != 0 for c in rec["origin"])

    vehicle_ids = {x["frameId"] for x in v["frames"]}
    fl_ids = {x["frameId"] for x in f17["frames"]}
    vehicle_nz = {x["frameId"] for x in v["frames"] if nz(x)}
    fl_nz = {x["frameId"] for x in f17["frames"] if nz(x)}
    frame_scope = {
        "r17VehicleFixtureFrames": len(vehicle_ids),
        "r17FlFixtureFrames": len(fl_ids),
        "flFixtureIsStrictSubsetOfVehicle": fl_ids <= vehicle_ids,
        "vehicleOnlyFrames": sorted(vehicle_ids - fl_ids),
        "flOnlyFrames": sorted(fl_ids - vehicle_ids),
        "r17VehicleNonzeroOriginFrames": len(vehicle_nz),
        "r17FlNonzeroOriginFrames": len(fl_nz),
        "extraNonzeroOnlyInVehicleFixture": sorted(vehicle_nz - fl_nz),
        "deepseekR27IncludedFrames": 21,
        "deepseekR27IncludedNonzero": 11,
        "reconciliation": "SCOPE_DIFFERENCE_NOT_STATISTICAL_ERROR",
        "note": "R-27 只纳入 FL 纵切夹具的 21 个 Frame（其中 11 个非零原点）；"
                "R-21 跨两份夹具取并集为 27（其中 14 个非零原点）。"
                "多出的 6 个 Frame 与 3 个非零原点全部是 vehicle 夹具独有的其他三角轮端 Frame。"
                "两者都正确，属范围不同。",
    }

    # ---------- 对 R-21 的自查更正 ----------
    corrections = [{
        "id": "CORR-26-01", "target": "R-21 frameMapping[].fixture 字段",
        "defect": "该字段实际含义是“首次在哪个夹具见到”，因去重顺序先遍历 vehicle 夹具，"
                  "27 条全部被标为 VEHICLE，看起来像是 FL 夹具没有这些 Frame。",
        "impact": "不影响 27/8/19/14 任何统计，但会让人误读夹具归属；"
                  "DeepSeek R-27 的 21/11 与我的 27/14 因此一度看似矛盾。",
        "correction": "本任务改用 presence 台账：21 个 FL Frame 全部标 BOTH，6 个标 VEHICLE_ONLY，0 个 FL_ONLY。",
        "r21FileModified": False,
        "note": "R-21 已 approved，本轮不改其源文件；以本任务的 frameProvenance 为准。",
    }]

    # ---------- Frame 来源台账 ----------
    frame_provenance = []
    for fid in sorted(r17frames):
        rec = r17frames[fid]
        frame_provenance.append({
            "frameId": fid,
            "fixturePresence": presence[fid],
            "origin": rec.get("origin"),
            "space": rec.get("space"),
            "units": rec.get("units"),
            "originValueBasis": rec.get("valueBasis"),
            "hasNonZeroNumericOrigin": nz(rec),
            "requiredLabel": "DEMO_ASSUMPTION" if nz(rec) and not rec.get("valueBasis") else None,
            "provenanceStatus": ("DEMO_UNLABELED" if nz(rec) and not rec.get("valueBasis")
                                 else "GRADED" if rec.get("valueBasis") else "ZERO_OR_ABSENT"),
        })

    # ---------- R-18 hub 语义 ----------
    hub = next((r for r in d21["r18RoleMapping"] if r["role"] == "HUB"), None)
    r18_hub = {
        "r18InstanceId": hub["r18InstanceId"] if hub else None,
        "roleMappingTarget": hub["mappedPartDefinitionId"] if hub else None,
        "candidatePartInstanceId": hub["r16InstanceId"] if hub else None,
        "poseKind": "ROLE_MARKER_NOT_RIGID_PART_POSE",
        "agreeWithR27CandidateRoleBinding": True,
        "reason": "R-18 提供的是 wheelCenter + spindleAxis 的角色位姿，"
                  "不能证明它就是轮毂法兰的局部坐标系；PI-30-006-FL 只是角色目标，不是刚性零件位姿。",
        "r18Provenance": m18.get("provenance"),
        "r18ValueBasis": m18.get("valueBasis"),
        "r18InstanceIdStatus": m18.get("instanceIdStatus"),
    }

    # ---------- 阻断汇总 ----------
    blockers = [
        {"id": "B-26-01", "topic": "变型身份未对齐（CF-09）", "owner": "总控 RP-07 / 双方",
         "effect": "13 条跨夹具映射只能是候选对应"},
        {"id": "B-26-02", "topic": "占位总成 ID 命名空间（CF-01）", "owner": "总控 RP-07",
         "effect": "6 个占位总成不能当 RP-01 具体总成"},
        {"id": "B-26-03", "topic": "规范父级层级（CF-06）", "owner": "总控 RP-07",
         "effect": "父级需先定，qty 才能跨模型比较"},
        {"id": "B-26-04", "topic": "12 项盘/鼓数量矛盾", "owner": "总控 RP-07",
         "effect": "前后制动型式配置口径未定，数量差 2 未裁决"},
        {"id": "B-26-05", "topic": "卡钳型式未裁决", "owner": "总控",
         "effect": "PART-40-048 存在性与父级未定"},
        {"id": "B-26-06", "topic": "全部实例无几何", "owner": "几何来源",
         "effect": "278 个 PI 均 GEOMETRY_PENDING，不得做装配可行性结论"},
        {"id": "B-26-07", "topic": "世界 Frame 未冻结", "owner": "RP-07",
         "effect": "framePolicy.worldFrame=UNFROZEN_PENDING_RP07"},
    ]

    out = {
        "schemaVersion": "1.0",
        "artifact": "R-26 decision candidates",
        "owner": "qwen4",
        "taskId": "R-26",
        "date": "2026-11-21",
        "status": "submitted",
        "purpose": "把 R-21 的 9 项冲突收敛为最小、明确、可机器验证的工程事实口径；"
                   "无证据处保持阻断，不新增假实例、不重写已验收源数据。",
        "inputs": inputs,
        "canonicalPolicy": canonical_policy,
        "layerSemantics": layer_semantics,
        "decisions": decisions,
        "instMapping": inst_mapping,
        "qtySemantics": qty_semantics,
        "qtyBlockers": qty_blockers,
        "deferredParts": deferred_parts,
        "frameScopeReconciliation": frame_scope,
        "frameProvenance": frame_provenance,
        "correctionsToR21": corrections,
        "r18HubSemantics": r18_hub,
        "blockers": blockers,
        "invariants": {
            "sourceFilesModified": False,
            "fakeInstancesCreated": 0,
            "geometryClaimedSourced": 0,
            "variantIdentityAsserted": False,
            "qtyPerCornerMultiplied": False,
            "dormanInstalledInVehicle": False,
            "r21ApprovedFilesUntouched": True,
            "newPersistentPorts": 0,
        },
        "summary": {
            "decisions": len(decisions),
            "verdicts": dict(Counter(x["verdict"] for x in decisions)),
            "instMappingsConditional": inst_counts.get("CONDITIONAL", 0),
            "instMappingsRejected": inst_counts.get("REJECTED", 0),
            "qtyBlockers": len(qty_blockers),
            "deferredParts": len(deferred_parts),
            "framesTotal": len(frame_provenance),
            "framesDemoUnlabeled": sum(1 for x in frame_provenance if x["provenanceStatus"] == "DEMO_UNLABELED"),
            "corrections": len(corrections),
            "blockers": len(blockers),
        },
    }
    return out


def main():
    out = build()
    with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=2)
    s = out["summary"]
    print("R-26 fixture written:", os.path.relpath(OUT, ROOT))
    print("  decisions=%d verdicts=%s" % (s["decisions"], s["verdicts"]))
    print("  instMapping conditional=%d rejected=%d" % (s["instMappingsConditional"], s["instMappingsRejected"]))
    print("  qtyBlockers=%d deferredParts=%d frames=%d(ungraded=%d) blockers=%d"
          % (s["qtyBlockers"], s["deferredParts"], s["framesTotal"], s["framesDemoUnlabeled"], s["blockers"]))


if __name__ == "__main__":
    main()
