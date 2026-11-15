#!/usr/bin/env python3
"""R-21 对照表校验器（stdlib only，全部输入只读）。

成功判据 = 0 条结构违规 + 汇总自洽 + 每个命名反例都被对应规则捕获。
本工具校验对照表的可核验性与证据纪律，不证明任何几何/装配/动力学真实性。
"""
import argparse
import copy
import json
import os
import sys
from collections import Counter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
MAP = os.path.join(ROOT, "docs", "research", "R-21-vehicle-tree-mapping.fixture.json")
R16 = os.path.join(ROOT, "docs", "research", "R-16-vehicle-skeleton.fixture.json")
R17V = os.path.join(ROOT, "src-experiments", "domain-contract-v1", "fixtures", "vehicle-skeleton.json")
R17F = os.path.join(ROOT, "src-experiments", "domain-contract-v1", "fixtures", "fl-wheel-end.json")

TRUST = ["SOURCED", "SOURCED_SECONDARY", "ENGINEERING_INFERENCE",
         "DEMO_ASSUMPTION", "ASSUMPTION", "UNKNOWN", "OUT_OF_SCOPE"]


def load(p):
    with open(p, encoding="utf-8") as fh:
        return json.load(fh)


def rank(g):
    return TRUST.index(g) if g in TRUST else len(TRUST)


class Check:
    def __init__(self):
        self.v = []

    def bad(self, rule, code, msg):
        self.v.append({"rule": rule, "code": code, "msg": msg})

    def by_rule(self):
        o = {}
        for x in self.v:
            o.setdefault(x["rule"], []).append(x)
        return o


def ctx(d):
    a = load(R16)
    v = load(R17V)
    f = load(R17F)
    rp = {}
    import glob
    for p in sorted(glob.glob(os.path.join(ROOT, "docs", "planning", "evidence", "RP-01-tree-*.json"))):
        for n in load(p)["nodes"]:
            rp[n["id"]] = n
    return {
        "a": a, "v": v, "f": f, "rp": rp,
        "r16pi": {x["instanceId"]: x for x in a["partInstances"]},
        "r16ai": {x["instanceId"]: x for x in a["assemblyInstances"]},
        "r16def": {x["id"]: x for x in a["partDefinitions"]},
        "r17pi": {p["instanceId"]: p for s in (v, f) for p in s["partInstances"]},
        "r17asm": {x["assemblyId"]: x for s in (v, f) for x in s["assemblies"]},
        "cf": {c["id"]: c for c in d["conflicts"]},
    }


def w01_refs(c, d, I):
    for x in d["partInstanceMapping"]:
        if x["r16InstanceId"] and x["r16InstanceId"] not in I["r16pi"]:
            c.bad("W01", "R16_INSTANCE_NOT_FOUND", x["r16InstanceId"])
        if x["r17InstanceId"] not in I["r17pi"]:
            c.bad("W01", "R17_INSTANCE_NOT_FOUND", x["r17InstanceId"])
    for x in d["assemblyInstanceMapping"]:
        if x["r16AssemblyInstanceId"] and x["r16AssemblyInstanceId"] not in I["r16ai"]:
            c.bad("W01", "R16_ASSEMBLY_INSTANCE_NOT_FOUND", x["r16AssemblyInstanceId"])
        if x["r17AssemblyInstanceId"] not in I["r17asm"]:
            c.bad("W01", "R17_ASSEMBLY_INSTANCE_NOT_FOUND", x["r17AssemblyInstanceId"])


def w02_no_forced_identity(c, d, I):
    for x in d["partInstanceMapping"]:
        if x["status"] != "MAPPED":
            continue
        r16 = I["r16pi"].get(x["r16InstanceId"])
        r17 = I["r17pi"].get(x["r17InstanceId"])
        if r16 and r17 and r16["definitionId"] != r17["partId"]:
            c.bad("W02", "MAPPED_PAIR_DIFFERENT_PART",
                  f"{x['r17InstanceId']} -> {x['r16InstanceId']}: {r17['partId']} != {r16['definitionId']}")
        if r16 and x["corner"] != r16["corner"]:
            c.bad("W02", "MAPPED_PAIR_DIFFERENT_CORNER", x["r17InstanceId"])
    for x in d["assemblyDefinitionMapping"]:
        if x["semanticBroadening"] and x["status"] == "MAPPED":
            c.bad("W02", "SEMANTIC_BROADENING_CLAIMED_IDENTICAL",
                  f"{x['assemblyId']}: 占位名与 RP-01 具体总成同值异义，不得标 MAPPED")


def w03_canonical_name(c, d, I):
    for x in d["assemblyDefinitionMapping"]:
        n = I["rp"].get(x["assemblyId"])
        if n and x["rp01Name"] != n["name"]:
            c.bad("W03", "RP01_NAME_FABRICATED", f"{x['assemblyId']}: {x['rp01Name']} != {n['name']}")
        if not n and x["existsInRP01"]:
            c.bad("W03", "RP01_NODE_CLAIMED_BUT_ABSENT", x["assemblyId"])
    for x in d["partDefinitionMapping"]:
        n = I["rp"].get(x["partId"])
        if n and x["rp01Name"] != n["name"]:
            c.bad("W03", "RP01_PART_NAME_FABRICATED", f"{x['partId']}")
        if n and (n.get("familyRef") or None) != (x["rp01FamilyRef"] or None):
            c.bad("W03", "RP01_FAMILYREF_FABRICATED", f"{x['partId']}")


def w04_unmapped_preserved(c, d, I):
    u, a = d["unmapped"], I["a"]
    mapped_pdef = {x["partId"] for x in d["partDefinitionMapping"] if x["existsInR16"]}
    mapped_pi = {x["r16InstanceId"] for x in d["partInstanceMapping"] if x["r16InstanceId"]}
    mapped_ai = {x["r16AssemblyInstanceId"] for x in d["assemblyInstanceMapping"] if x["r16AssemblyInstanceId"]}
    exp = {
        "r16OnlyPartDefinitionsCount": len(a["partDefinitions"]) - len(mapped_pdef),
        "r16OnlyPartInstancesCount": len(a["partInstances"]) - len(mapped_pi),
        "r16OnlyAssemblyInstancesCount": len(a["assemblyInstances"]) - len(mapped_ai),
    }
    for k, n in exp.items():
        if u.get(k) != n:
            c.bad("W04", "R16_ONLY_COUNT_WRONG", f"{k}={u.get(k)} actual={n}")
    if not u.get("policy"):
        c.bad("W04", "UNMAPPED_POLICY_MISSING", "must state nodes are preserved not dropped")
    r17only = {x["r17InstanceId"] for x in d["partInstanceMapping"] if x["status"] != "MAPPED"}
    if set(u.get("r17OnlyPartInstances", [])) != r17only:
        c.bad("W04", "R17_ONLY_LIST_INCOMPLETE", "unmapped.r17OnlyPartInstances mismatch")


def w05_no_geometry(c, d, I):
    for x in d["partInstanceMapping"]:
        if x["status"] != "MAPPED":
            continue
        if x.get("r16GeometryStatus") != "GEOMETRY_PENDING":
            c.bad("W05", "GEOMETRY_STATUS_LOST", f"{x['r17InstanceId']}: {x.get('r16GeometryStatus')}")
        if x.get("r16ValueBasis") == "SOURCED":
            c.bad("W05", "SOURCED_GEOMETRY_INTRODUCED", x["r17InstanceId"])
    for x in d["partDefinitionMapping"]:
        if x.get("r16GeometryBasis") == "SOURCED":
            c.bad("W05", "DEFINITION_SOURCED_GEOMETRY", x["partId"])


def w06_no_upgrade(c, d, I):
    """比较必须同范畴：evidenceInherited 映射到 identityBasis，不是总体 valueBasis。

    R-16 的 valueBasis 是身份/几何/质量/安装四者最弱（本轮全 UNKNOWN），
    拿身份级等级去比总体最弱值是范畴错误，会把合法映射误判为升级。
    """
    em = d["enumMapping"]["evidenceInherited"]["map"]
    for x in d["partInstanceMapping"]:
        if x["status"] != "MAPPED":
            continue
        mapped = em.get(x["r17EvidenceInherited"])
        base = x.get("r16IdentityBasis")
        if mapped and base and rank(mapped) < rank(base):
            c.bad("W06", "EVIDENCE_UPGRADED_IN_MAPPING",
                  f"{x['r17InstanceId']}: {x['r17EvidenceInherited']}->{mapped} stronger than identity {base}")
        if mapped and x.get("r16ValueBasis") and rank(x["r16ValueBasis"]) < rank(base or "UNKNOWN"):
            c.bad("W06", "VALUE_BASIS_STRONGER_THAN_IDENTITY", x["r17InstanceId"])
    for x in d["partDefinitionMapping"]:
        if not x["existsInR16"]:
            continue
        mapped = em.get(x["r17EvidenceInherited"])
        if mapped and x["r16ValueBasis"] and rank(mapped) < rank(x["r16ValueBasis"]):
            c.bad("W06", "DEFINITION_EVIDENCE_UPGRADED", x["partId"])
        # 规范权威校验：R-17 不得比 RP-01 原始 evidence 更乐观
        canon = I["rp"].get(x["partId"], {})
        cmap = em.get(canon.get("evidence"))
        if mapped and cmap and rank(mapped) < rank(cmap):
            c.bad("W06", "R17_UPGRADED_ABOVE_CANONICAL",
                  f"{x['partId']}: R-17 {x['r17EvidenceInherited']} stronger than RP-01 {canon.get('evidence')}")
    cf4 = I["cf"].get("CF-04")
    if cf4 and cf4.get("upgradeCount", 0) != 0:
        c.bad("W06", "UPGRADE_DIRECTION_RECORDED_BUT_NOT_REJECTED", "CF-04 upgradeCount must be 0")


def w07_qty_conflicts(c, d, I):
    src = I["a"].get("qtyConflicts", [])
    kept = d.get("r16QtyConflictsPreserved", [])
    if len(kept) != len(src):
        c.bad("W07", "QTY_CONFLICT_COUNT_DROPPED", f"kept {len(kept)} of {len(src)}")
    sk = {q["definitionId"]: q for q in src}
    for q in kept:
        o = sk.get(q["definitionId"])
        if o is None:
            c.bad("W07", "QTY_CONFLICT_FABRICATED", q["definitionId"])
        elif q != o:
            c.bad("W07", "QTY_CONFLICT_ALTERED", q["definitionId"])
    if d["summary"].get("r16QtyConflictsPreserved") != len(src):
        c.bad("W07", "QTY_CONFLICT_SUMMARY_WRONG", "summary mismatch")


def w08_qty_per_parent(c, d, I):
    for x in d["qtyReconciliation"]:
        if x["r17BomQtyPerAssembly"] is not None and not x["perParentSemanticsAgree"]:
            # 只有该零件本身已登记 qty 冲突才可豁免；无关冲突的存在不得抑制本检查
            if not x.get("r16ConflictRecorded"):
                c.bad("W08", "BOM_QTY_MISMATCH_UNRECORDED", x["partId"])
    for s in (I["v"], I["f"]):
        for b in s["bomLines"]:
            if b["qtyPerAssembly"] != len(b["instanceIds"]):
                c.bad("W08", "R17_BOM_INSTANCE_COUNT_MISMATCH", b["bomLineId"])


def w09_dorman(c, d, I):
    blob = json.dumps(d, ensure_ascii=False)
    for token in ("610-460",):
        for x in d["partInstanceMapping"]:
            if token in json.dumps(x, ensure_ascii=False) and x["status"] == "MAPPED":
                c.bad("W09", "DORMAN_MAPPED_AS_VEHICLE_PART", x["r17InstanceId"])
    for x in d["partInstanceMapping"]:
        if x["status"] == "MAPPED" and x["partId"] not in I["r16def"]:
            c.bad("W09", "MAPPED_PART_NOT_IN_R16", x["partId"])
    if d["invariants"].get("dormanNotInstalled") is not True:
        c.bad("W09", "DORMAN_INVARIANT_WRONG", "dormanNotInstalled must be true")


def w10_r18_non_canonical(c, d, I):
    for x in d["r18RoleMapping"]:
        if x.get("canonicalIdentity") is not False:
            c.bad("W10", "R18_ID_CLAIMED_CANONICAL", x["r18InstanceId"])
        if x.get("mappingKind") != "ROLE_BASED_NOT_IDENTITY":
            c.bad("W10", "R18_MAPPING_KIND_WRONG", x["r18InstanceId"])
        if x.get("r18Provenance") != "FICTIONAL_FIXTURE":
            c.bad("W10", "R18_PROVENANCE_LOST", x["r18InstanceId"])
        if x.get("r18InstanceIdStatus") != "CANDIDATE_NOT_FROZEN":
            c.bad("W10", "R18_STATUS_LOST", x["r18InstanceId"])
        if x.get("mappedPartDefinitionId") and x["mappedPartDefinitionId"] not in I["r16def"]:
            c.bad("W10", "R18_ROLE_TARGET_NOT_IN_R16", x["mappedPartDefinitionId"])


def w11_frame_basis(c, d, I):
    flagged = {x["r17FrameId"] for x in d["frameMapping"]
               if x["hasNonZeroNumericOrigin"] and not x["r17ValueBasis"]}
    if flagged and "CF-07" not in I["cf"]:
        c.bad("W11", "NUMERIC_ORIGIN_CONFLICT_MISSING", f"{len(flagged)} frames ungraded")
    for x in d["frameMapping"]:
        if x["hasNonZeroNumericOrigin"] and x["r17ValueBasis"] in ("SOURCED", "SOURCED_SECONDARY"):
            c.bad("W11", "DEMO_ORIGIN_CLAIMED_SOURCED", x["r17FrameId"])
        if x["r16FrameId"] and x["r16FrameId"] not in {f["frameId"] for f in I["a"]["mountFrames"]}:
            c.bad("W11", "R16_FRAME_NOT_FOUND", x["r16FrameId"])


def w12_parent_drift(c, d, I):
    drift = {x["r17InstanceId"] for x in d["partInstanceMapping"]
             if x["rp01ParentAssemblyId"] and x["r17ParentDefinitionRef"] != x["rp01ParentAssemblyId"]}
    cf = I["cf"].get("CF-06")
    if drift and not cf:
        c.bad("W12", "PARENT_DRIFT_CONFLICT_MISSING", f"{len(drift)} instances")
    elif cf:
        listed = {x["r17InstanceId"] for x in cf["detail"]}
        for x in sorted(drift - listed):
            c.bad("W12", "PARENT_DRIFT_NOT_LISTED", x)
    for x in d["partInstanceMapping"]:
        n = I["rp"].get(x["partId"])
        if n and x["rp01ParentAssemblyId"] != n.get("parent"):
            c.bad("W12", "RP01_PARENT_FABRICATED", x["partId"])


def w13_no_duplicate_mapping(c, d, I):
    for k, n in Counter(x["r17InstanceId"] for x in d["partInstanceMapping"]).items():
        if n > 1:
            c.bad("W13", "R17_INSTANCE_MAPPED_TWICE", k)
    for k, n in Counter(x["r16InstanceId"] for x in d["partInstanceMapping"] if x["r16InstanceId"]).items():
        if n > 1:
            c.bad("W13", "R16_INSTANCE_REUSED", k)
    for k, n in Counter(x["r17AssemblyInstanceId"] for x in d["assemblyInstanceMapping"]).items():
        if n > 1:
            c.bad("W13", "R17_ASSEMBLY_MAPPED_TWICE", k)


def w14_enum_complete(c, d, I):
    em = d["enumMapping"]["evidenceInherited"]["map"]
    gm = d["enumMapping"]["geometryBasis"]["map"]
    for s in (I["v"], I["f"]):
        for p in s["partDefinitions"]:
            if p.get("evidenceInherited") and p["evidenceInherited"] not in em:
                c.bad("W14", "EVIDENCE_VALUE_UNMAPPED", p["evidenceInherited"])
            if p.get("geometryBasis") and p["geometryBasis"] not in gm:
                c.bad("W14", "GEOMETRY_VALUE_UNMAPPED", p["geometryBasis"])
    cg = d["enumMapping"]["choiceGroupValue"]["map"]
    for s in (I["v"], I["f"]):
        for val in (s.get("variant", {}).get("moduleSelections") or {}).values():
            if val not in cg and val not in cg.values():
                c.bad("W14", "CHOICE_GROUP_VALUE_UNMAPPED", str(val))


def w15_candidate(c, d, I):
    if d["status"] != "CANDIDATE_NOT_FROZEN":
        c.bad("W15", "MAPPING_CLAIMED_FROZEN", d["status"])
    for p in d["patchProposals"]:
        if p.get("executed") is not False:
            c.bad("W15", "PATCH_CLAIMED_EXECUTED", p["id"])
    if d["summary"].get("patchProposalsExecuted") != 0:
        c.bad("W15", "PATCH_EXEC_COUNT_WRONG", "must be 0")
    for k, v in d["invariants"].items():
        if v is not True:
            c.bad("W15", "INVARIANT_FALSE", k)


def w16_summary(c, d, I):
    s, cov = d["summary"], d["coverage"]
    actual = {
        "systemsMapped": sum(1 for x in d["systemMapping"] if x["status"] == "MAPPED"),
        "systemsR16Only": sum(1 for x in d["systemMapping"] if x["status"] == "R16_ONLY_UNMAPPED"),
        "assemblyDefinitionsMapped": sum(1 for x in d["assemblyDefinitionMapping"] if x["existsInRP01"]),
        "assemblyDefinitionsWithDrift": sum(1 for x in d["assemblyDefinitionMapping"] if x["nameDrift"]),
        "assemblyInstancesMapped": sum(1 for x in d["assemblyInstanceMapping"] if x["status"] == "MAPPED"),
        "partDefinitionsMapped": sum(1 for x in d["partDefinitionMapping"] if x["status"] == "MAPPED"),
        "partInstancesMapped": sum(1 for x in d["partInstanceMapping"] if x["status"] == "MAPPED"),
        "partInstancesUnmapped": sum(1 for x in d["partInstanceMapping"] if x["status"] != "MAPPED"),
        "framesMappedAssemblyLevel": sum(1 for x in d["frameMapping"] if x["status"] == "MAPPED_ASSEMBLY_LEVEL"),
        "r18RoleMappings": len(d["r18RoleMapping"]),
        "conflicts": len(d["conflicts"]),
        "conflictsP0": sum(1 for x in d["conflicts"] if x["severity"] == "P0"),
        "patchProposals": len(d["patchProposals"]),
        "preservedDifferences": len(d["preservedDifferences"]),
        "qtyRowsReconciled": sum(1 for x in d["qtyReconciliation"] if x["status"] == "RECONCILED"),
    }
    for k, n in actual.items():
        if k in cov and cov[k] != n:
            c.bad("W16", "COVERAGE_COUNT_MISMATCH", f"coverage.{k}={cov[k]} actual={n}")
        if k in s and s[k] != n:
            c.bad("W16", "SUMMARY_COUNT_MISMATCH", f"summary.{k}={s[k]} actual={n}")


def w17_conflict_quality(c, d, I):
    for x in d["conflicts"]:
        for k in ("resolution", "severity", "status", "detail", "title"):
            if not x.get(k):
                c.bad("W17", "CONFLICT_FIELD_MISSING", f"{x['id']}.{k}")
        if x["severity"] not in ("P0", "P1", "P2"):
            c.bad("W17", "CONFLICT_SEVERITY_INVALID", x["id"])
        if x["status"] not in ("OPEN", "RESOLVED", "PRESERVED"):
            c.bad("W17", "CONFLICT_STATUS_INVALID", x["id"])
    ids = [x["id"] for x in d["conflicts"]]
    for k, n in Counter(ids).items():
        if n > 1:
            c.bad("W17", "CONFLICT_ID_DUPLICATE", k)


def w18_inputs_readonly(c, d, I):
    for x in d["inputs"]:
        if x.get("readOnly") is not True:
            c.bad("W18", "INPUT_NOT_READONLY", x["path"])
        if not os.path.exists(os.path.join(ROOT, x["path"])) and "*" not in x["path"]:
            c.bad("W18", "INPUT_PATH_MISSING", x["path"])
    if d["authorityPolicy"].get("canonical") is None:
        c.bad("W18", "CANONICAL_AUTHORITY_MISSING", "must name RP-01")


def w19_variant_alignment(c, d, I):
    va = d.get("variantAlignment")
    if not va:
        c.bad("W19", "VARIANT_ALIGNMENT_MISSING", "Project/VehicleVariant 层未对照")
        return
    for k in ("r16VariantId", "r17VariantId", "variantIdsEqual", "alignmentStatus", "generationAgrees"):
        if k not in va:
            c.bad("W19", "VARIANT_FIELD_MISSING", k)
    if va.get("variantIdsEqual") != (va.get("r16VariantId") == va.get("r17VariantId")):
        c.bad("W19", "VARIANT_EQUALITY_FABRICATED", "variantIdsEqual 与实际 ID 比较不符")
    if not va.get("variantIdsEqual"):
        if "CF-09" not in I["cf"]:
            c.bad("W19", "VARIANT_MISMATCH_UNRECORDED", "变型 ID 不同却未登记冲突")
        if va.get("alignmentStatus") == "ALIGNED":
            c.bad("W19", "VARIANT_CLAIMED_ALIGNED", "ID 不同不得声称已对齐")
    cg = d["enumMapping"]["choiceGroupValue"]["map"]
    r16hub = I["a"]["variant"]["choiceGroups"].get("CG-HUB")
    r17hub = I["v"]["variant"]["moduleSelections"].get("CG-HUB")
    if va.get("generationAgrees") != (cg.get(r17hub) == r16hub):
        c.bad("W19", "GENERATION_AGREEMENT_FABRICATED", "代际一致性须由枚举映射推出")
    for layer in ("projectId", "vehicleVariantId"):
        if layer not in d["fieldMapping"]:
            c.bad("W19", "PROJECT_VARIANT_LAYER_UNMAPPED", layer)


RULES = [
    ("W01", w01_refs), ("W02", w02_no_forced_identity), ("W03", w03_canonical_name),
    ("W04", w04_unmapped_preserved), ("W05", w05_no_geometry), ("W06", w06_no_upgrade),
    ("W07", w07_qty_conflicts), ("W08", w08_qty_per_parent), ("W09", w09_dorman),
    ("W10", w10_r18_non_canonical), ("W11", w11_frame_basis), ("W12", w12_parent_drift),
    ("W13", w13_no_duplicate_mapping), ("W14", w14_enum_complete), ("W15", w15_candidate),
    ("W16", w16_summary), ("W17", w17_conflict_quality), ("W18", w18_inputs_readonly),
    ("W19", w19_variant_alignment),
]


def run(d):
    c = Check()
    I = ctx(d)
    for _, fn in RULES:
        fn(c, d, I)
    return c


def mutations(d):
    out = []

    def add(rule, name, fn):
        m = copy.deepcopy(d)
        fn(m)
        out.append((rule, name, m))

    def pim(m, pred=None):
        return next(x for x in m["partInstanceMapping"] if pred is None or pred(x))

    def _w08_cross(m):
        rows = [x for x in m["qtyReconciliation"] if x["r17BomQtyPerAssembly"] is not None]
        rows[0]["perParentSemanticsAgree"] = False
        rows[1]["r16ConflictRecorded"] = True

    add("W01", "mapped R-16 instance id does not exist",
        lambda m: pim(m, lambda x: x["status"] == "MAPPED").__setitem__("r16InstanceId", "PI-99-999-FL"))
    add("W01", "mapped R-17 instance id does not exist",
        lambda m: pim(m).__setitem__("r17InstanceId", "INST-NOPE"))
    add("W02", "force-map two different parts as identical",
        lambda m: pim(m, lambda x: x["status"] == "MAPPED").__setitem__("r16InstanceId", "PI-30-019-FL"))
    add("W02", "semantic broadening claimed as identical mapping",
        lambda m: next(x for x in m["assemblyDefinitionMapping"] if x["semanticBroadening"]).__setitem__("status", "MAPPED"))
    add("W03", "RP-01 canonical name fabricated",
        lambda m: m["assemblyDefinitionMapping"][0].__setitem__("rp01Name", "随便写的名字"))
    add("W03", "RP-01 familyRef fabricated",
        lambda m: next(x for x in m["partDefinitionMapping"] if x["rp01FamilyRef"]).__setitem__("rp01FamilyRef", "FAM-999"))
    add("W04", "R-16 only count understated to hide dropped nodes",
        lambda m: m["unmapped"].__setitem__("r16OnlyPartInstancesCount", 0))
    add("W04", "unmapped R-17 instance removed from list",
        lambda m: m["unmapped"].__setitem__("r17OnlyPartInstances", []))
    add("W05", "GEOMETRY_PENDING turned into real geometry",
        lambda m: pim(m, lambda x: x["status"] == "MAPPED").__setitem__("r16GeometryStatus", "GEOMETRY_READY"))
    add("W05", "SOURCED geometry introduced by mapping",
        lambda m: pim(m, lambda x: x["status"] == "MAPPED").__setitem__("r16ValueBasis", "SOURCED"))
    add("W06", "ASSUMPTION upgraded through evidence mapping",
        lambda m: m["enumMapping"]["evidenceInherited"]["map"].__setitem__("ASSUMPTION", "SOURCED"))
    add("W06", "R-17 evidence upgraded above RP-01 canonical",
        lambda m: next(x for x in m["partDefinitionMapping"]
                       if x["partId"] == "PART-30-009").__setitem__("r17EvidenceInherited", "EVIDENCE"))
    add("W07", "one of the 12 qty conflicts silently dropped",
        lambda m: m.__setitem__("r16QtyConflictsPreserved", m["r16QtyConflictsPreserved"][:-1]))
    add("W07", "qty conflict value altered",
        lambda m: m["r16QtyConflictsPreserved"][0].__setitem__("qtyVehicleTotalInherited", 999))
    add("W08", "BOM qty per assembly detached from instance count",
        lambda m: next(x for x in m["qtyReconciliation"]
                       if x["r17BomQtyPerAssembly"] is not None).__setitem__("perParentSemanticsAgree", False))
    add("W08", "another part's recorded conflict must not excuse this mismatch", _w08_cross)
    add("W09", "Dorman specimen mapped as a vehicle part",
        lambda m: pim(m, lambda x: x["status"] == "MAPPED").__setitem__("r17InstanceId", "INST-610-460-FL"))
    add("W09", "dorman invariant flipped",
        lambda m: m["invariants"].__setitem__("dormanNotInstalled", False))
    add("W10", "R-18 INST-SLA id claimed canonical",
        lambda m: m["r18RoleMapping"][0].__setitem__("canonicalIdentity", True))
    add("W10", "R-18 fictional provenance lost",
        lambda m: m["r18RoleMapping"][0].__setitem__("r18Provenance", "SOURCED"))
    add("W11", "numeric demo frame origin claimed SOURCED",
        lambda m: next(x for x in m["frameMapping"] if x["hasNonZeroNumericOrigin"]).__setitem__("r17ValueBasis", "SOURCED"))
    add("W11", "ungraded numeric origin conflict deleted",
        lambda m: m.__setitem__("conflicts", [x for x in m["conflicts"] if x["id"] != "CF-07"]))
    add("W12", "parent drift conflict deleted",
        lambda m: m.__setitem__("conflicts", [x for x in m["conflicts"] if x["id"] != "CF-06"]))
    def _hide_parent(m):
        x = next(y for y in m["partInstanceMapping"] if not y["parentLevelMatch"])
        x["rp01ParentAssemblyId"] = x["r17ParentDefinitionRef"]

    add("W12", "RP-01 parent fabricated to hide flattening", _hide_parent)
    add("W13", "same R-17 instance mapped twice",
        lambda m: m["partInstanceMapping"].append(copy.deepcopy(m["partInstanceMapping"][0])))
    add("W13", "same R-16 instance reused for two R-17 instances",
        lambda m: m["partInstanceMapping"][1].__setitem__(
            "r16InstanceId", m["partInstanceMapping"][0]["r16InstanceId"]))
    add("W14", "evidence enum value left unmapped",
        lambda m: m["enumMapping"]["evidenceInherited"]["map"].pop("ASSUMPTION"))
    add("W14", "choice group value left unmapped",
        lambda m: m["enumMapping"]["choiceGroupValue"]["map"].pop("GEN1"))
    add("W15", "mapping claimed frozen",
        lambda m: m.__setitem__("status", "PRODUCTION_FROZEN"))
    add("W15", "patch claimed executed without authority",
        lambda m: m["patchProposals"][0].__setitem__("executed", True))
    add("W16", "coverage count falsified",
        lambda m: m["coverage"].__setitem__("partInstancesMapped", 999))
    add("W16", "summary conflict count falsified",
        lambda m: m["summary"].__setitem__("conflicts", 0))
    add("W17", "conflict resolution removed",
        lambda m: m["conflicts"][0].__setitem__("resolution", ""))
    add("W17", "conflict severity invalid",
        lambda m: m["conflicts"][0].__setitem__("severity", "P9"))
    add("W17", "variant-conditional conflict stripped of its resolution",
        lambda m: next(x for x in m["conflicts"]
                       if x["kind"] == "VARIANT_CONDITIONAL_PART_INSTANTIATED").__setitem__("resolution", ""))
    add("W18", "input marked writable",
        lambda m: m["inputs"][0].__setitem__("readOnly", False))
    add("W18", "canonical authority removed",
        lambda m: m["authorityPolicy"].__setitem__("canonical", None))
    add("W19", "different variant ids claimed equal",
        lambda m: m["variantAlignment"].__setitem__("variantIdsEqual", True))
    add("W19", "variant mismatch conflict silently dropped",
        lambda m: m.__setitem__("conflicts", [x for x in m["conflicts"] if x["id"] != "CF-09"]))
    add("W19", "unaligned variants claimed ALIGNED",
        lambda m: m["variantAlignment"].__setitem__("alignmentStatus", "ALIGNED"))
    add("W19", "generation agreement fabricated",
        lambda m: m["variantAlignment"].__setitem__("generationAgrees", False))
    add("W19", "Project/VehicleVariant layer dropped from field mapping",
        lambda m: m["fieldMapping"].pop("vehicleVariantId"))
    return out


def cmd_validate(d, out):
    c = run(d)
    ok = not c.v
    print("R-21 TREE-DOMAIN MAPPING VALIDATION:", "PASS" if ok else "FAIL")
    for x in c.v[:40]:
        print(f"  [{x['rule']}] {x['code']}: {x['msg']}")
    if len(c.v) > 40:
        print(f"  ... {len(c.v) - 40} more")
    res = {"taskId": "R-21", "verdict": "PASS" if ok else "FAIL", "violationCount": len(c.v),
           "violations": c.v, "rulesChecked": [r for r, _ in RULES], "summary": d["summary"]}
    if out:
        with open(out, "w", encoding="utf-8") as fh:
            json.dump(res, fh, ensure_ascii=False, indent=2)
        print("  written:", out)
    return 0 if ok else 1


def cmd_selftest(d, out):
    caught, missed, details = 0, 0, []
    for rule, name, m in mutations(d):
        c = run(m)
        hit = rule in c.by_rule()
        details.append({"rule": rule, "mutation": name, "caught": hit,
                        "codes": [x["code"] for x in c.by_rule().get(rule, [])]})
        if hit:
            caught += 1
        else:
            missed += 1
            print(f"  MISSED [{rule}] {name}")
    covered = sorted({r for r, _, _ in mutations(d)})
    allr = [r for r, _ in RULES]
    unc = [r for r in allr if r not in covered]
    ok = missed == 0 and not unc
    print(f"R-21 SELFTEST: {'PASS' if ok else 'FAIL'} — {caught} caught / {missed} missed / {caught + missed} total")
    print(f"  rule coverage: {len(covered)}/{len(allr)}" + (f" uncovered={unc}" if unc else ""))
    res = {"taskId": "R-21", "verdict": "PASS" if ok else "FAIL", "caught": caught, "missed": missed,
           "total": caught + missed, "rulesCovered": covered, "rulesUncovered": unc, "cases": details}
    if out:
        with open(out, "w", encoding="utf-8") as fh:
            json.dump(res, fh, ensure_ascii=False, indent=2)
        print("  written:", out)
    return 0 if ok else 1


def cmd_summary(d):
    print("R-21 MAPPING SUMMARY")
    for k, v in d["summary"].items():
        print(f"  {k}: {v}")
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("command", choices=["summary", "validate", "selftest"])
    ap.add_argument("--out")
    a = ap.parse_args()
    d = load(MAP)
    if a.command == "summary":
        return cmd_summary(d)
    if a.command == "validate":
        return cmd_validate(d, a.out)
    return cmd_selftest(d, a.out)


if __name__ == "__main__":
    sys.exit(main())