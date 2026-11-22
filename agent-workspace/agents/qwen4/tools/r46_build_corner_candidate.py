#!/usr/bin/env python3
"""R-46 转向左右子总成候选生成器（stdlib only，输入只读）。

总控已定方向（AUDIT_2026-11-22_R36_R38_R41_R42_R43_C05 §R-42）：
保留一个中央转向器总成（VEH 级），在其下提议左右两个子总成候选，
给内外拉杆、锁紧件与保护件独立角位与 Frame。

本文件只产出**候选**：不修改 R-16、不重建 R-27 快照、不新增正式 PI。
"""
import hashlib
import json
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
OUT = os.path.join(ROOT, "docs", "research", "R-46-steering-corner-assembly-candidate.fixture.json")

R16 = "docs/research/R-16-vehicle-skeleton.fixture.json"
SNAP = "src-experiments/vehicle-snapshot-v1/fixtures/vehicle-snapshot.json"
INPUTS = [(R16, "REQUIRED"), (SNAP, "ADVISORY")]

CENTRAL = "ASSY-20-014"
CENTRAL_AI = "AI-20-014-VEH"
PER_CORNER_PARTS = ["PART-20-074", "PART-20-075", "PART-20-076", "PART-20-077", "PART-20-078"]
SIDES = [("FL", "左"), ("FR", "右")]


def load(rel):
    with open(os.path.join(ROOT, rel), encoding="utf-8") as fh:
        return json.load(fh)


def sha256(rel):
    h = hashlib.sha256()
    with open(os.path.join(ROOT, rel), "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def build():
    a = load(R16)
    snap = load(SNAP)
    defs = {d["id"]: d for d in a["partDefinitions"]}
    asm = {x["id"]: x for x in a["assemblies"]}
    ai = {x["instanceId"]: x for x in a["assemblyInstances"]}
    fr = {x["frameId"]: x for x in a["mountFrames"]}

    inputs = [{"path": p, "readOnly": True, "hashPolicy": hp, "sha256": sha256(p)} for p, hp in INPUTS]

    central_ai = ai[CENTRAL_AI]
    central_instances = [p for p in a["partInstances"] if p["assemblyInstanceId"] == CENTRAL_AI]
    central = {
        "assemblyDefinitionId": CENTRAL,
        "name": asm[CENTRAL]["name"],
        "parentId": asm[CENTRAL]["parentId"],
        "instanceId": CENTRAL_AI,
        "corner": central_ai["corner"],
        "mountFrameId": central_ai["mountFrameId"],
        "instanceCount": 1,
        "worldFrame": fr[central_ai["mountFrameId"]]["worldFrame"],
        "childPartInstances": sorted(p["instanceId"] for p in central_instances),
        "childPartInstanceCount": len(central_instances),
        "unchanged": True,
    }

    # ---- 结构先例：嵌套总成在本树已存在 ----
    precedent = {
        "caseA": {
            "parent": "ASSY-30-004", "parentName": asm["ASSY-30-004"]["name"],
            "parentInstances": sorted(x["instanceId"] for x in a["assemblyInstances"]
                                      if x["assemblyId"] == "ASSY-30-004"),
            "child": "ASSY-30-005", "childName": asm["ASSY-30-005"]["name"],
            "childInstances": sorted(x["instanceId"] for x in a["assemblyInstances"]
                                     if x["assemblyId"] == "ASSY-30-005"),
            "pattern": "父总成有每角实例，子总成同样有每角实例",
        },
        "caseB": {
            "parent": "ASSY-20-001", "parentName": asm["ASSY-20-001"]["name"],
            "parentInstances": sorted(x["instanceId"] for x in a["assemblyInstances"]
                                      if x["assemblyId"] == "ASSY-20-001"),
            "child": "ASSY-20-002", "childName": asm["ASSY-20-002"]["name"],
            "childInstances": sorted(x["instanceId"] for x in a["assemblyInstances"]
                                     if x["assemblyId"] == "ASSY-20-002"),
            "pattern": "容器总成可以没有实例，只有子总成有实例",
        },
        "conclusion": "总成嵌套本身在 R-16 已存在。本轮新增的只有一种组合："
                      "**每角子总成实例挂在 VEH 级父总成实例下**。",
    }

    new_relation = {
        "id": "R46-REL-01",
        "rule": "允许每角子总成实例（corner=FL|FR）挂在 VEH 级父总成实例下，"
                "条件是：子总成显式声明其角位、其全部子件的角位与子总成实例角位一致、"
                "且每个子件在整车数量上只被这两侧各计一次。",
        "whyNeeded": "中央转向器必须保持一个 VEH 级实例（总控已定），"
                     "而内外拉杆/锁紧件/保护件天然是左右各一件。现有对角规则只约束"
                     "『零件角位 == 直接父总成实例角位』，不约束『总成实例角位 == 其父总成实例角位』。",
        "doesNotBreakExistingGuards": {
            "checked": ["tools/r16_skeleton_tool.py", "tools/r21_mapping_tool.py", "tools/r42_identity_tool.py"],
            "finding": "三个校验器均未断言『总成实例角位 == 父总成实例角位』；"
                       "对角规则只作用于零件实例与其直接父总成实例。",
            "newRelationIsAdditive": True,
        },
        "alternativeRejected": "放宽『零件角位可以细于父总成实例』（R-42 的 OPT-42-B）会直接改动对角规则、"
                               "影响全部 278 个零件实例的校验；本候选不动那条规则。",
    }

    # ---- 候选：左右两个子总成 ----
    sub_assemblies = []
    for corner, zh in SIDES:
        subs = {
            "candidateAssemblyDefinitionId": "CAND-ASSY-20-014-%s" % corner,
            "name": "转向拉杆子总成（%s）" % zh,
            "parentAssemblyDefinitionId": CENTRAL,
            "corner": corner,
            "cornerScopeStatus": "CANDIDATE_DECLARED",
            "candidateAssemblyInstanceId": "CAND-AI-20-014-%s" % corner,
            "candidateMountFrameId": "CAND-FR-20-014-%s" % corner,
            "worldFrame": "UNFROZEN_PENDING_RP07",
            "parts": [],
        }
        for pid in PER_CORNER_PARTS:
            d = defs[pid]
            subs["parts"].append({
                "partId": pid, "name": d["name"],
                "qtyVehicleTotal": d["qtyVehicleTotal"],
                "qtyPerCornerInCandidate": 1,
                "candidateInstanceId": "CAND-PI-%s-%s" % (pid.split("-", 1)[1], corner),
                "parentCandidateAssemblyInstanceId": subs["candidateAssemblyInstanceId"],
                "corner": corner,
                "evidenceInherited": d["evidenceInherited"],
                "geometryBasis": d["geometryBasis"],
                "geometryStatus": d["geometryStatus"],
                "handednessKind": d["handednessPolicy"]["kind"],
            })
        sub_assemblies.append(subs)

    # ---- 数量核对：无重复计数 ----
    totals = []
    for pid in PER_CORNER_PARTS:
        d = defs[pid]
        cand = sum(1 for s in sub_assemblies for p in s["parts"] if p["partId"] == pid)
        cent = sum(1 for p in central_instances if p["definitionId"] == pid)
        totals.append({
            "partId": pid, "name": d["name"],
            "qtyVehicleTotal": d["qtyVehicleTotal"],
            "candidateInstances": cand, "instancesInCentral": cent,
            "sum": cand + cent,
            "doubleCounted": cent != 0,
            "balanced": (cand + cent) == d["qtyVehicleTotal"],
        })

    compatibility = {
        "r16SourceModified": False,
        "snapshotModified": False,
        "snapshotRevision": snap["revision"],
        "snapshotStatus": snap["status"],
        "globalCornerRuleUnchanged": True,
        "formalPiChanged": False,
        "candidateIdsAreCanonical": False,
        "promotionPath": "总控批准后，由 R-16 维护方在 SUB-20-03 下新增两个 ASSY 定义与 FL/FR 实例，"
                         "并把 5 个零件定义改挂到对应子总成；本轮只交候选，不执行。",
        "versionNote": "候选建立在 R-16 候选树与 R-27 rev1 快照的只读副本之上；"
                       "不改变任何已发布 ID、数量或 Frame。R-27 快照的 r26 块仍为旧值（R-26 已 approved），"
                       "本候选不依赖该块。",
    }

    positive_cases = [
        {"id": "P-46-01", "claim": "中央转向器仍是唯一 VEH 级实例", "evidence": central["instanceId"]},
        {"id": "P-46-02", "claim": "左右子总成各一个，角位分别为 FL/FR", "evidence": ["CAND-AI-20-014-FL", "CAND-AI-20-014-FR"]},
        {"id": "P-46-03", "claim": "每侧 5 个每角零件，整车合计等于 qtyVehicleTotal",
         "evidence": {t["partId"]: t["sum"] for t in totals}},
        {"id": "P-46-04", "claim": "零件角位 == 直接父总成实例角位（对角规则保持）", "evidence": "10 个候选零件实例全部同侧"},
        {"id": "P-46-05", "claim": "中央 13 个 VEH 级子件未改动", "evidence": central["childPartInstances"]},
        {"id": "P-46-06", "claim": "每个候选子总成有独立 Frame", "evidence": [s["candidateMountFrameId"] for s in sub_assemblies]},
    ]
    negative_cases = [
        {"id": "N-46-01", "error": "中央总成被复制成两个实例", "mustFailWith": "CENTRAL_INSTANCE_COUNT_CHANGED"},
        {"id": "N-46-02", "error": "左侧零件挂到右侧子总成（左右错配）", "mustFailWith": "CORNER_PARENT_MISMATCH"},
        {"id": "N-46-03", "error": "把 UNKNOWN 几何升格为已建模", "mustFailWith": "GEOMETRY_UPGRADED"},
        {"id": "N-46-04", "error": "同一零件同时在中央与子总成计数（重复计数）", "mustFailWith": "DOUBLE_COUNTED"},
        {"id": "N-46-05", "error": "候选 ID 当成正式 PI", "mustFailWith": "CANDIDATE_CLAIMED_CANONICAL"},
        {"id": "N-46-06", "error": "子总成缺 Frame", "mustFailWith": "SUB_ASSEMBLY_FRAME_MISSING"},
        {"id": "N-46-07", "error": "每角零件数量多一件或少一件", "mustFailWith": "PART_QTY_UNBALANCED"},
        {"id": "N-46-08", "error": "把候选写回 R-16 或重建快照", "mustFailWith": "SOURCE_CLAIMED_MODIFIED"},
        {"id": "N-46-09", "error": "只放左侧子总成，右侧缺失", "mustFailWith": "SIDE_SET_INCOMPLETE"},
        {"id": "N-46-10", "error": "子总成实例角位与声明角位不一致", "mustFailWith": "SUB_INSTANCE_CORNER_MISMATCH"},
    ]
    unknowns = [
        {"item": "总控是否批准该候选进入 R-16", "status": "PENDING", "why": "候选只提交，不执行"},
        {"item": "两个新 ASSY 的编号", "status": "UNKNOWN", "why": "需 RP-01 编号分配，不得自行占用"},
        {"item": "子总成 Frame 的局部原点与朝向", "status": "UNKNOWN", "why": "世界 Frame 仍 UNFROZEN_PENDING_RP07"},
        {"item": "外拉杆端锥柄几何", "status": "UNKNOWN", "why": "R-42 已确认锥柄尺寸无来源"},
        {"item": "左右镜像几何", "status": "UNKNOWN", "why": "PART-20-075 为 MIRROR_REGENERATE，尚无实体"},
        {"item": "运动配准与播放", "status": "BLOCKED", "why": "REGISTRATION_BLOCKED，playbackAllowed=false"},
        {"item": "变型同一性", "status": "BLOCKED", "why": "R-26 CF-09 未对齐"},
    ]

    return {
        "schemaVersion": "1.0", "artifact": "R-46 steering left/right sub-assembly candidate",
        "owner": "qwen4", "taskId": "R-46", "date": "2026-11-22", "status": "submitted",
        "purpose": "验证 R-42 的局部层级方案：中央转向器保持一个 VEH 级总成，"
                   "在其下提议左右子总成，让内外拉杆、锁紧件与保护件获得独立角位与 Frame。"
                   "只交候选，不改 R-16、不重建快照、不新增正式 PI。",
        "inputs": inputs,
        "baseline": {
            "r16Counts": {"assemblyDefinitions": len(a["assemblies"]),
                          "assemblyInstances": len(a["assemblyInstances"]),
                          "partDefinitions": len(a["partDefinitions"]),
                          "partInstances": len(a["partInstances"]),
                          "mountFrames": len(a["mountFrames"])},
            "snapshot": {"snapshotId": snap["snapshotId"], "revision": snap["revision"],
                         "status": snap["status"], "readOnly": True},
            "central": central,
        },
        "structurePrecedent": precedent,
        "newRelation": new_relation,
        "candidateTree": {"central": {"instanceId": CENTRAL_AI, "unchanged": True},
                          "subAssemblies": sub_assemblies},
        "totalsCheck": totals,
        "compatibility": compatibility,
        "positiveCases": positive_cases,
        "negativeCases": negative_cases,
        "unknowns": unknowns,
        "invariants": {
            "r16Modified": False,
            "snapshotModified": False,
            "formalInstancesCreated": 0,
            "candidateEnvelopeComplete": True,
            "geometryUpgraded": False,
            "canonicalIdsClaimed": False,
            "playbackAuthorised": False,
        },
        "summary": {
            "subAssemblies": len(sub_assemblies),
            "candidatePartInstances": sum(len(s["parts"]) for s in sub_assemblies),
            "centralPartInstances": central["childPartInstanceCount"],
            "partsBalanced": sum(1 for t in totals if t["balanced"]),
            "partsTotal": len(totals),
            "positiveCases": len(positive_cases),
            "negativeCases": len(negative_cases),
            "unknowns": len(unknowns),
        },
    }


def main():
    out = build()
    with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=2)
    s = out["summary"]
    print("R-46 fixture written:", os.path.relpath(OUT, ROOT))
    print("  subAssemblies=%d candidatePartInstances=%d centralPartInstances=%d"
          % (s["subAssemblies"], s["candidatePartInstances"], s["centralPartInstances"]))
    print("  partsBalanced=%d/%d positive=%d negative=%d unknowns=%d"
          % (s["partsBalanced"], s["partsTotal"], s["positiveCases"], s["negativeCases"], s["unknowns"]))


if __name__ == "__main__":
    main()
