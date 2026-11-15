#!/usr/bin/env python3
"""R-16 整车骨架校验器（stdlib only）。

成功判据 = 0 条结构违规 + 汇总自洽 + 每个命名反例都被对应规则捕获。
本工具只校验骨架的结构与证据纪律，不证明任何真实工程可靠性、不证明几何正确。
"""
import argparse
import copy
import json
import os
import sys
from collections import Counter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
FX = os.path.join(ROOT, "docs", "research", "R-16-vehicle-skeleton.fixture.json")

TRUST = ["SOURCED", "SOURCED_SECONDARY", "ENGINEERING_INFERENCE",
         "DEMO_ASSUMPTION", "ASSUMPTION", "UNKNOWN", "OUT_OF_SCOPE"]
CORNERS = ["FL", "FR", "RL", "RR"]
GEN1_ONLY = {"PART-30-006", "PART-30-009"}
GEN3_ONLY = {"PART-30-010", "PART-30-011", "PART-30-012", "PART-30-017"}
STUDS = {"PART-30-009", "PART-30-017"}
MOVABLE_CHAIN = {"PART-20-001", "PART-20-008", "PART-20-016", "PART-20-003",
                 "PART-20-010", "PART-20-019"}


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
        out = {}
        for x in self.v:
            out.setdefault(x["rule"], []).append(x)
        return out


def idx(d):
    return {
        "defs": {x["id"]: x for x in d["partDefinitions"]},
        "asms": {x["id"]: x for x in d["assemblies"]},
        "pi": d["partInstances"],
        "ai": {x["instanceId"]: x for x in d["assemblyInstances"]},
        "frames": {x["frameId"]: x for x in d["mountFrames"]},
        "cg": d["variant"]["choiceGroups"],
        "rules": d["architectureRules"],
        "qc": {q["definitionId"]: q for q in d.get("qtyConflicts", [])},
    }


def v01_ids(c, d, I):
    ids = [p["instanceId"] for p in I["pi"]] + list(I["ai"])
    for k, n in Counter(ids).items():
        if n > 1:
            c.bad("V01", "DUPLICATE_INSTANCE_ID", f"{k} appears {n} times")
    fids = [f["frameId"] for f in d["mountFrames"]]
    for k, n in Counter(fids).items():
        if n > 1:
            c.bad("V01", "DUPLICATE_FRAME_ID", f"{k} appears {n} times")


def v02_refs(c, d, I):
    for p in I["pi"]:
        if p["definitionId"] not in I["defs"]:
            c.bad("V02", "DEFINITION_NOT_FOUND", f"{p['instanceId']}: {p['definitionId']} absent")
        if p["assemblyInstanceId"] not in I["ai"]:
            c.bad("V02", "ASSEMBLY_INSTANCE_NOT_FOUND", f"{p['instanceId']}: {p['assemblyInstanceId']} absent")
        if p["mountFrameId"] not in I["frames"]:
            c.bad("V02", "FRAME_NOT_FOUND", f"{p['instanceId']}: {p['mountFrameId']} absent")


def v03_no_family_dedup(c, d, I):
    grp = Counter((p["definitionId"], p["corner"]) for p in I["pi"])
    for p in I["pi"]:
        k = (p["definitionId"], p["corner"])
        if grp[k] != p["qtyPerCorner"]:
            c.bad("V03", "INSTANCE_COUNT_SWALLOWED",
                  f"{k}: {grp[k]} instances but qtyPerCorner={p['qtyPerCorner']} (familyRef dedup?)")
    fam = {}
    for p in I["pi"]:
        f = I["defs"].get(p["definitionId"], {}).get("familyRef")
        if f:
            fam.setdefault(f, set()).add(p["definitionId"])
    for f, defs in fam.items():
        if len(defs) > 1:
            for dd in defs:
                if not any(p["definitionId"] == dd for p in I["pi"]):
                    c.bad("V03", "FAMILY_MEMBER_DROPPED", f"{f}: member {dd} missing")


def v04_choice_groups(c, d, I):
    for cg in d["choiceGroupsInherited"]:
        if cg.get("required") and cg["id"] not in I["cg"]:
            c.bad("V04", "REQUIRED_CHOICE_GROUP_UNSET", f"{cg['id']} not selected")
    for name in ("CG-HUB", "CG-FASTENER"):
        rule = I["rules"].get(name)
        if not rule:
            c.bad("V04", "ARCHITECTURE_RULE_MISSING", name)
            continue
        sel = I["cg"].get(name)
        if sel not in rule["options"]:
            c.bad("V04", "CHOICE_GROUP_NOT_EXACTLY_ONE", f"{name}={sel} not a valid option")
    hub = I["cg"].get("CG-HUB")
    if hub not in ("ASSY-30-002", "ASSY-30-003"):
        c.bad("V04", "HUB_GENERATION_INVALID", f"CG-HUB={hub}")


def v05_generation(c, d, I):
    hub = I["cg"].get("CG-HUB")
    present = {p["definitionId"] for p in I["pi"]}
    if hub == "ASSY-30-002":
        for x in sorted(GEN3_ONLY & present):
            c.bad("V05", "GEN3_PART_UNDER_GEN1", f"{x} instantiated while CG-HUB=Gen1")
    elif hub == "ASSY-30-003":
        for x in sorted(GEN1_ONLY & present):
            c.bad("V05", "GEN1_PART_UNDER_GEN3", f"{x} instantiated while CG-HUB=Gen3")
    opt = I["rules"]["CG-HUB"]["options"].get(hub, {})
    for x in opt.get("requiresParts", []):
        if x not in present:
            c.bad("V05", "GENERATION_REQUIRED_PART_MISSING", f"{hub} requires {x}")


def v06_fastener(c, d, I):
    fa = I["cg"].get("CG-FASTENER")
    opt = I["rules"]["CG-FASTENER"]["options"].get(fa, {})
    present = {p["definitionId"] for p in I["pi"]}
    studs = STUDS & present
    if opt.get("studRequired"):
        if not studs:
            c.bad("V06", "STUD_REQUIRED_BUT_ABSENT", f"{fa} requires studs")
        gen = "GEN1" if I["cg"].get("CG-HUB") == "ASSY-30-002" else "GEN3"
        want = opt.get("studPartByGeneration", {}).get(gen)
        if want and want not in present:
            c.bad("V06", "WRONG_STUD_FOR_GENERATION", f"{gen} requires {want}")
    else:
        if studs:
            c.bad("V06", "STUD_PRESENT_UNDER_LUG_BOLT", f"{sorted(studs)} under {fa}")
    for x in opt.get("forbidsParts", []):
        if x in present:
            c.bad("V06", "FASTENER_ARCH_MIXED", f"{x} forbidden under {fa}")
    for p in I["pi"]:
        if p["definitionId"] == "PART-30-029" and p.get("fastenerRole") != opt.get("wheelFastenerRole"):
            c.bad("V06", "WHEEL_FASTENER_ROLE_WRONG",
                  f"{p['instanceId']}: role={p.get('fastenerRole')} expected {opt.get('wheelFastenerRole')}")


def v07_qty_level(c, d, I):
    for p in I["pi"]:
        tot, per, div = p["qtyVehicleTotalInherited"], p["qtyPerCorner"], p["distributionDivisor"]
        if not isinstance(tot, (int, float)):
            continue
        if per * div != tot and not p.get("qtyVariantMismatch"):
            c.bad("V07", "QTY_LEVEL_INCONSISTENT",
                  f"{p['instanceId']}: {per}/corner x {div} != inherited {tot}, no mismatch flag")
        if p.get("qtyVariantMismatch") and p["definitionId"] not in I["qc"]:
            c.bad("V07", "QTY_MISMATCH_NOT_RECORDED", f"{p['definitionId']} flagged but no qtyConflicts entry")
        if p.get("distributionBasis") not in ("ENGINEERING_INFERENCE", "SOURCED", "SOURCED_SECONDARY"):
            c.bad("V07", "DISTRIBUTION_BASIS_INVALID", f"{p['instanceId']}: {p.get('distributionBasis')}")


def v08_no_upgrade(c, d, I):
    for p in I["pi"]:
        df = I["defs"].get(p["definitionId"])
        if not df:
            continue
        if rank(p["identityBasis"]) < rank(df["valueBasis"]):
            c.bad("V08", "IDENTITY_UPGRADED_BY_INSTANTIATION",
                  f"{p['instanceId']}: identity {p['identityBasis']} stronger than definition {df['valueBasis']}")
        if rank(p["valueBasis"]) < rank(p["identityBasis"]):
            c.bad("V08", "VALUE_BASIS_STRONGER_THAN_IDENTITY", f"{p['instanceId']}")
        for f in ("geometryBasis", "massBasis", "mountBasis"):
            if rank(p["valueBasis"]) < rank(p[f]):
                c.bad("V08", "VALUE_BASIS_IGNORES_WEAKER_FIELD", f"{p['instanceId']}: {f}={p[f]}")
        if p["valueBasisDefinition"] != df["valueBasis"]:
            c.bad("V08", "DEFINITION_BASIS_MISREPORTED", f"{p['instanceId']}")


def v09_no_sourced_geometry(c, d, I):
    for p in I["pi"]:
        if p["geometryBasis"] == "SOURCED":
            c.bad("V09", "SOURCED_GEOMETRY_FABRICATED",
                  f"{p['instanceId']}: RP-01 has 0 SOURCED geometry; cannot claim SOURCED")
        if p["geometryStatus"] == "GEOMETRY_PENDING" and p.get("cadAssetRef"):
            c.bad("V09", "PENDING_GEOMETRY_HAS_ASSET", f"{p['instanceId']}")
    for df in d["partDefinitions"]:
        if df.get("geometryBasis") == "SOURCED":
            c.bad("V09", "DEFINITION_SOURCED_GEOMETRY", f"{df['id']}")


def v10_unknown_not_filled(c, d, I):
    for p in I["pi"]:
        for st, bs in (("massStatus", "massBasis"), ("mountStatus", "mountBasis")):
            if p[st] == "UNKNOWN" and p[bs] != "UNKNOWN":
                c.bad("V10", "UNKNOWN_STATUS_WITH_VALUE", f"{p['instanceId']}: {st}=UNKNOWN but {bs}={p[bs]}")
        if p["geometryStatus"] == "GEOMETRY_PENDING" and p["geometryBasis"] == "SOURCED":
            c.bad("V10", "PENDING_GEOMETRY_CLAIMED_SOURCED", f"{p['instanceId']}")


def v11_mirror(c, d, I):
    for p in I["pi"]:
        hp = p["handednessPolicy"]
        if hp.get("globalScaleForbidden") is not True:
            c.bad("V11", "GLOBAL_SCALE_NOT_FORBIDDEN", f"{p['instanceId']}")
        for k in ("scale", "globalScale", "meshScale"):
            if k in p:
                c.bad("V11", "INSTANCE_CARRIES_SCALE", f"{p['instanceId']}: {k}={p[k]}")
        df = I["defs"].get(p["definitionId"], {})
        if df.get("mirroredInRP01"):
            if hp["kind"] != "MIRROR_REGENERATE":
                c.bad("V11", "MIRRORED_PART_NOT_REGENERATED", f"{p['instanceId']}: {hp['kind']}")
            if not hp.get("requiresDistinctMountFrame"):
                c.bad("V11", "MIRRORED_PART_SHARES_FRAME", f"{p['instanceId']}")
    for f in d["mountFrames"]:
        if f.get("mirrorPolicy") != "REGENERATE_MIRRORED_GEOMETRY":
            c.bad("V11", "FRAME_MIRROR_POLICY_WRONG", f"{f['frameId']}: {f.get('mirrorPolicy')}")
        for k in ("scale", "globalScale", "meshScale"):
            if k in f:
                c.bad("V11", "FRAME_CARRIES_SCALE", f"{f['frameId']}")


def v12_corners(c, d, I):
    have = {s["corner"] for s in d["cornerStations"]}
    for x in CORNERS:
        if x not in have:
            c.bad("V12", "CORNER_STATION_MISSING", x)
    for x in CORNERS:
        if not any(a["assemblyId"] == "ASSY-30-001" and a["corner"] == x for a in d["assemblyInstances"]):
            c.bad("V12", "WHEEL_END_IDENTITY_MISSING", f"corner {x} has no ASSY-30-001 instance")
    for s in d["cornerStations"]:
        if s["axle"] == "FRONT" and not s["hasSteeringKnuckle"]:
            c.bad("V12", "FRONT_KNUCKLE_FLAG_WRONG", s["corner"])
        if s["axle"] == "REAR" and s["hasSteeringKnuckle"]:
            c.bad("V12", "REAR_KNUCKLE_ON_SOLID_AXLE", s["corner"])


def v13_frame_local(c, d, I):
    if d["framePolicy"]["worldFrame"] != "UNFROZEN_PENDING_RP07":
        c.bad("V13", "WORLD_FRAME_FROZEN", d["framePolicy"]["worldFrame"])
    for f in d["mountFrames"]:
        if f["worldFrame"] != "UNFROZEN_PENDING_RP07":
            c.bad("V13", "FRAME_WORLD_FROZEN", f["frameId"])
        if f.get("kind") != "LOCAL_MOUNT_FRAME":
            c.bad("V13", "FRAME_NOT_LOCAL", f["frameId"])
        for k in ("worldPosition", "worldAbsolute", "position_m"):
            if k in f:
                c.bad("V13", "WORLD_ABSOLUTE_COORDINATE", f"{f['frameId']}: {k}")


def v14_ref_not_bom(c, d, I):
    for r in d["references"]:
        if r.get("countedInBom") is not False:
            c.bad("V14", "REF_COUNTED_IN_BOM", r["id"])
    for p in I["pi"]:
        if p["definitionId"].startswith("REF-"):
            c.bad("V14", "REF_INSTANTIATED_AS_PART", p["instanceId"])
        if p.get("countedInBom") is not True:
            c.bad("V14", "PART_INSTANCE_NOT_COUNTED", p["instanceId"])


def v15_specimen(c, d, I):
    for s in d["referenceSpecimens"]:
        if s.get("installedInThisSkeleton") is not False:
            c.bad("V15", "REFERENCE_SPECIMEN_INSTALLED", s["id"])
        if s.get("isVehicleSelection") is not False:
            c.bad("V15", "REFERENCE_SPECIMEN_AS_SELECTION", s["id"])
        blob = json.dumps(I["pi"], ensure_ascii=False)
        if s.get("partNumber") and s["partNumber"] in blob:
            c.bad("V15", "SPECIMEN_PART_NUMBER_IN_BOM", s["partNumber"])


def v16_model_blocked(c, d, I):
    flagged = set()
    for b in d["modelBlocked"]:
        if not b.get("reason"):
            c.bad("V16", "MODEL_BLOCKED_WITHOUT_REASON", b["item"])
        if b.get("status") != "MODEL_BLOCKED":
            c.bad("V16", "MODEL_BLOCKED_STATUS_WRONG", b["item"])
        flagged.update(b.get("definitionIds", []))
    for df in d["partDefinitions"]:
        if df.get("modelBlocked") and df["id"] not in flagged:
            c.bad("V16", "BLOCKED_FLAG_WITHOUT_ITEM", df["id"])
    need = {"轮毂法兰几何", "摆臂本体与硬点", "球铰锥度与安装高度", "转向节本体", "车架硬点"}
    have = {b["item"] for b in d["modelBlocked"]}
    for x in sorted(need - have):
        c.bad("V16", "REQUIRED_BLOCKED_ITEM_MISSING", x)


def v17_deep_slice(c, d, I):
    deep = [s for s in d["cornerStations"] if s["depth"] == "DEEP_SLICE"]
    if len(deep) != 1:
        c.bad("V17", "DEEP_SLICE_NOT_EXACTLY_ONE", f"{len(deep)} deep slices")
        return
    corner = deep[0]["corner"]
    have = {p["definitionId"] for p in I["pi"] if p["corner"] == corner}
    for x in sorted(MOVABLE_CHAIN - have):
        c.bad("V17", "MOVABLE_CHAIN_INCOMPLETE", f"deep slice {corner} missing {x}")
    if not all(p["isDeepSlice"] == (p["corner"] == corner) for p in I["pi"]):
        c.bad("V17", "DEEP_SLICE_FLAG_INCONSISTENT", "isDeepSlice mismatch")


def v18_summary(c, d, I):
    s = d["summary"]
    actual = {
        "systems": len(d["systems"]), "subsystems": len(d["subsystems"]),
        "assemblies": len(d["assemblies"]), "partDefinitions": len(d["partDefinitions"]),
        "partFamilies": len(d["partFamilies"]), "datums": len(d["datums"]),
        "references": len(d["references"]), "assemblyInstances": len(d["assemblyInstances"]),
        "partInstances": len(I["pi"]), "mountFrames": len(d["mountFrames"]),
        "cornerStations": len(d["cornerStations"]),
        "definitionsInstantiated": sum(1 for x in d["partDefinitions"] if x["instancePolicy"] == "INSTANTIATED"),
        "definitionsDeferred": sum(1 for x in d["partDefinitions"] if x["instancePolicy"] == "DEFERRED"),
        "modelBlockedItems": len(d["modelBlocked"]), "qtyConflicts": len(d.get("qtyConflicts", [])),
        "instancesSourced": sum(1 for p in I["pi"] if p["valueBasis"] == "SOURCED"),
        "referenceSpecimensInstalled": sum(1 for x in d["referenceSpecimens"] if x["installedInThisSkeleton"]),
    }
    for k, v in actual.items():
        if k in s and s[k] != v:
            c.bad("V18", "SUMMARY_COUNT_MISMATCH", f"summary.{k}={s[k]} actual={v}")
    for k in ("rp01FilesModified", "r06Modified", "r11Modified", "srcModified"):
        if s.get(k) is not False:
            c.bad("V18", "SOURCE_MODIFICATION_FLAG_WRONG", k)
    if s.get("instancesValueBasis") != dict(Counter(p["valueBasis"] for p in I["pi"])):
        c.bad("V18", "VALUE_BASIS_HISTOGRAM_MISMATCH", "instancesValueBasis")


def v19_status_candidate(c, d, I):
    if d["status"] != "CANDIDATE_NOT_FROZEN":
        c.bad("V19", "SCHEMA_CLAIMED_FROZEN", d["status"])
    if d["variant"]["status"] != "PROPOSED_NOT_APPROVED":
        c.bad("V19", "VARIANT_CLAIMED_APPROVED", d["variant"]["status"])
    for key in ("r17Mapping", "r18Mapping"):
        if d[key]["status"] != "CANDIDATE_NOT_FROZEN":
            c.bad("V19", "MAPPING_CLAIMED_FROZEN", key)
    if d["architectureRules"]["CG-FASTENER"]["status"] != "PROPOSED_NEW_NOT_IN_RP01":
        c.bad("V19", "NEW_CHOICE_GROUP_CLAIMED_INHERITED", "CG-FASTENER")


RULES = [
    ("V01", v01_ids), ("V02", v02_refs), ("V03", v03_no_family_dedup),
    ("V04", v04_choice_groups), ("V05", v05_generation), ("V06", v06_fastener),
    ("V07", v07_qty_level), ("V08", v08_no_upgrade), ("V09", v09_no_sourced_geometry),
    ("V10", v10_unknown_not_filled), ("V11", v11_mirror), ("V12", v12_corners),
    ("V13", v13_frame_local), ("V14", v14_ref_not_bom), ("V15", v15_specimen),
    ("V16", v16_model_blocked), ("V17", v17_deep_slice), ("V18", v18_summary),
    ("V19", v19_status_candidate),
]


def run(d):
    c = Check()
    I = idx(d)
    for _, fn in RULES:
        fn(c, d, I)
    return c


def mutations(d):
    out = []

    def add(rule, name, fn):
        m = copy.deepcopy(d)
        fn(m)
        out.append((rule, name, m))

    def pi(m, pred=None):
        return next(p for p in m["partInstances"] if pred is None or pred(p))

    add("V01", "duplicate part instance id",
        lambda m: m["partInstances"][1].__setitem__("instanceId", m["partInstances"][0]["instanceId"]))
    add("V01", "duplicate frame id",
        lambda m: m["mountFrames"][1].__setitem__("frameId", m["mountFrames"][0]["frameId"]))
    add("V02", "instance points at nonexistent definition",
        lambda m: pi(m).__setitem__("definitionId", "PART-99-999"))
    add("V02", "instance points at nonexistent frame",
        lambda m: pi(m).__setitem__("mountFrameId", "FR-NOPE"))
    add("V03", "familyRef dedup swallows stud instances",
        lambda m: m.__setitem__("partInstances",
                                [p for p in m["partInstances"]
                                 if not (p["definitionId"] == "PART-30-009" and p["ordinal"] > 1)]))
    add("V04", "required choice group unset",
        lambda m: m["variant"]["choiceGroups"].pop("CG-TRANS"))
    add("V04", "two hub generations selected at once",
        lambda m: m["variant"]["choiceGroups"].__setitem__("CG-HUB", "BOTH"))
    add("V05", "Gen3 flange part instantiated under Gen1",
        lambda m: m["partInstances"].append(dict(pi(m, lambda p: p["definitionId"] == "PART-30-006"),
                                                 instanceId="PI-30-010-FL-X", definitionId="PART-30-010")))
    add("V05", "switch to Gen3 but keep Gen1 separate hub flange",
        lambda m: m["variant"]["choiceGroups"].__setitem__("CG-HUB", "ASSY-30-003"))
    add("V06", "lug bolt architecture keeps studs",
        lambda m: m["variant"]["choiceGroups"].__setitem__("CG-FASTENER", "LUG_BOLT"))
    add("V06", "wheel fastener role wrong for architecture",
        lambda m: pi(m, lambda p: p["definitionId"] == "PART-30-029").__setitem__("fastenerRole", "LUG_BOLT"))
    add("V07", "vehicle total used as per-corner qty",
        lambda m: pi(m, lambda p: p["definitionId"] == "PART-30-009").__setitem__("qtyPerCorner", 20))
    add("V07", "qty mismatch flagged but not recorded",
        lambda m: m.__setitem__("qtyConflicts", []))
    add("V08", "ASSUMPTION definition upgraded to SOURCED by instantiation",
        lambda m: pi(m, lambda p: p["identityBasis"] == "ASSUMPTION").__setitem__("identityBasis", "SOURCED"))
    add("V08", "valueBasis stronger than identity",
        lambda m: pi(m).__setitem__("valueBasis", "SOURCED_SECONDARY"))
    add("V09", "UNKNOWN geometry claimed SOURCED",
        lambda m: pi(m).__setitem__("geometryBasis", "SOURCED"))
    add("V09", "pending geometry given a CAD asset",
        lambda m: pi(m).__setitem__("cadAssetRef", "assets/fake.glb"))
    add("V10", "UNKNOWN mass status with a value basis",
        lambda m: pi(m).__setitem__("massBasis", "DEMO_ASSUMPTION"))
    add("V11", "mirrored knuckle handled by global scale",
        lambda m: pi(m, lambda p: p["definitionId"] == "PART-20-016").__setitem__("scale", -1))
    add("V11", "mirrored part not regenerated",
        lambda m: pi(m, lambda p: p["definitionId"] == "PART-20-016")["handednessPolicy"].__setitem__("kind", "SYMMETRIC_SHARED"))
    add("V11", "frame mirror policy replaced by negative scale",
        lambda m: m["mountFrames"][0].__setitem__("mirrorPolicy", "GLOBAL_NEGATIVE_SCALE"))
    add("V12", "rear corner station deleted",
        lambda m: m.__setitem__("cornerStations", [s for s in m["cornerStations"] if s["corner"] != "RR"]))
    add("V12", "solid axle rear given a steering knuckle",
        lambda m: next(s for s in m["cornerStations"] if s["corner"] == "RL").__setitem__("hasSteeringKnuckle", True))
    add("V13", "world frame unilaterally frozen",
        lambda m: m["framePolicy"].__setitem__("worldFrame", "FROZEN_X_LEFT_Y_UP_Z_FWD"))
    add("V13", "frame carries world absolute position",
        lambda m: m["mountFrames"][0].__setitem__("worldPosition", [0.84, 0.08, 1.23]))
    add("V14", "cross-system REF counted in BOM",
        lambda m: m["references"][0].__setitem__("countedInBom", True))
    add("V15", "Dorman reference specimen installed into vehicle",
        lambda m: m["referenceSpecimens"][0].__setitem__("installedInThisSkeleton", True))
    add("V15", "specimen part number leaked into BOM instances",
        lambda m: pi(m).__setitem__("instanceId", "PI-610-460-FL"))
    add("V16", "MODEL_BLOCKED item without reason",
        lambda m: m["modelBlocked"][0].__setitem__("reason", ""))
    add("V16", "required blocked item removed",
        lambda m: m.__setitem__("modelBlocked", [b for b in m["modelBlocked"] if b["item"] != "转向节本体"]))
    add("V17", "second deep slice added",
        lambda m: next(s for s in m["cornerStations"] if s["corner"] == "FR").__setitem__("depth", "DEEP_SLICE"))
    add("V17", "deep slice missing lower arm",
        lambda m: m.__setitem__("partInstances",
                                [p for p in m["partInstances"]
                                 if not (p["corner"] == "FL" and p["definitionId"] == "PART-20-008")]))
    add("V18", "summary instance count falsified",
        lambda m: m["summary"].__setitem__("partInstances", 999))
    add("V18", "source modification flag flipped",
        lambda m: m["summary"].__setitem__("rp01FilesModified", True))
    add("V19", "candidate schema claimed frozen",
        lambda m: m.__setitem__("status", "PRODUCTION_FROZEN"))
    add("V19", "unapproved variant claimed approved",
        lambda m: m["variant"].__setitem__("status", "APPROVED"))
    add("V19", "new choice group claimed inherited from RP-01",
        lambda m: m["architectureRules"]["CG-FASTENER"].__setitem__("status", "INHERITED_FROM_RP01"))
    return out


def cmd_validate(d, out):
    c = run(d)
    ok = not c.v
    print("R-16 VEHICLE SKELETON VALIDATION:", "PASS" if ok else "FAIL")
    for x in c.v[:40]:
        print(f"  [{x['rule']}] {x['code']}: {x['msg']}")
    if len(c.v) > 40:
        print(f"  ... {len(c.v) - 40} more")
    res = {"taskId": "R-16", "verdict": "PASS" if ok else "FAIL", "violationCount": len(c.v),
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
    print(f"R-16 SELFTEST: {'PASS' if ok else 'FAIL'} — {caught} caught / {missed} missed / {caught + missed} total")
    print(f"  rule coverage: {len(covered)}/{len(allr)}" + (f" uncovered={unc}" if unc else ""))
    res = {"taskId": "R-16", "verdict": "PASS" if ok else "FAIL", "caught": caught, "missed": missed,
           "total": caught + missed, "rulesCovered": covered, "rulesUncovered": unc, "cases": details}
    if out:
        with open(out, "w", encoding="utf-8") as fh:
            json.dump(res, fh, ensure_ascii=False, indent=2)
        print("  written:", out)
    return 0 if ok else 1


def cmd_summary(d):
    print("R-16 VEHICLE SKELETON SUMMARY")
    for k, v in d["summary"].items():
        print(f"  {k}: {v}")
    return 0


def cmd_combos(out):
    """四种 CG-HUB × CG-FASTENER 组合都必须合法且通过；非法混用必须被拒绝。

    全程在内存中构建与校验，不写临时文件。
    """
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import r16_build_skeleton as B

    results = []
    for hub in ("ASSY-30-002", "ASSY-30-003"):
        for fa in ("STUD_AND_NUT", "LUG_BOLT"):
            fx = B.build(hub, fa)
            c = run(fx)
            gen = "GEN1" if hub == "ASSY-30-002" else "GEN3"
            present = {p["definitionId"] for p in fx["partInstances"]}
            studs = sorted(STUDS & present)
            roles = {p.get("fastenerRole") for p in fx["partInstances"] if p["definitionId"] == "PART-30-029"}
            ok = not c.v
            results.append({"combination": f"{gen} x {fa}", "verdict": "PASS" if ok else "FAIL",
                            "violations": len(c.v), "partInstances": len(fx["partInstances"]),
                            "studsPresent": studs, "wheelFastenerRoles": sorted(x for x in roles if x),
                            "gen1FlangePresent": "PART-30-006" in present,
                            "codes": [x["code"] for x in c.v]})
            print(f"  {gen} x {fa}: {'PASS' if ok else 'FAIL'} "
                  f"instances={len(fx['partInstances'])} studs={studs} roles={sorted(x for x in roles if x)}")
            for x in c.v[:5]:
                print(f"      [{x['rule']}] {x['code']}: {x['msg']}")

    # 非法混用：手工把 Gen3 零件塞进 Gen1 变型，必须被 V05 拒绝
    fx = B.build("ASSY-30-002", "STUD_AND_NUT")
    donor = B.build("ASSY-30-003", "STUD_AND_NUT")
    bad = next(p for p in donor["partInstances"] if p["definitionId"] == "PART-30-010")
    fx["partInstances"].append(dict(bad, instanceId="PI-30-010-FL-MIX"))
    c = run(fx)
    mix_ok = "V05" in c.by_rule()
    results.append({"combination": "ILLEGAL Gen1 + Gen3 flange part", "verdict": "REJECTED" if mix_ok else "NOT_REJECTED",
                    "violations": len(c.v), "codes": [x["code"] for x in c.v]})
    print(f"  ILLEGAL Gen1+Gen3 mix: {'REJECTED' if mix_ok else 'NOT_REJECTED'}")

    # 非法混用：螺栓式架构保留螺柱，必须被 V06 拒绝
    fx = B.build("ASSY-30-002", "LUG_BOLT")
    donor = B.build("ASSY-30-002", "STUD_AND_NUT")
    for p in [x for x in donor["partInstances"] if x["definitionId"] == "PART-30-009"][:1]:
        fx["partInstances"].append(dict(p, instanceId=p["instanceId"] + "-MIX"))
    c = run(fx)
    bolt_ok = "V06" in c.by_rule()
    results.append({"combination": "ILLEGAL LUG_BOLT + stud", "verdict": "REJECTED" if bolt_ok else "NOT_REJECTED",
                    "violations": len(c.v), "codes": [x["code"] for x in c.v]})
    print(f"  ILLEGAL LUG_BOLT+stud: {'REJECTED' if bolt_ok else 'NOT_REJECTED'}")

    ok = all(r["verdict"] == "PASS" for r in results[:4]) and mix_ok and bolt_ok
    print("R-16 COMBINATION TEST:", "PASS" if ok else "FAIL")
    res = {"taskId": "R-16", "verdict": "PASS" if ok else "FAIL", "cases": results}
    if out:
        with open(out, "w", encoding="utf-8") as fh:
            json.dump(res, fh, ensure_ascii=False, indent=2)
        print("  written:", out)
    return 0 if ok else 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("command", choices=["summary", "validate", "selftest", "combos"])
    ap.add_argument("--out")
    a = ap.parse_args()
    if a.command == "combos":
        return cmd_combos(a.out)
    d = load(FX)
    if a.command == "summary":
        return cmd_summary(d)
    if a.command == "validate":
        return cmd_validate(d, a.out)
    return cmd_selftest(d, a.out)


if __name__ == "__main__":
    sys.exit(main())