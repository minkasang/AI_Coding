#!/usr/bin/env python3
"""R-26 裁决候选校验器：20 条规则 + 负例自检（stdlib only）。

每条规则都必须能被至少一个负例命中；负例在内存深拷贝上制造违规，
断言命中的是正确的规则 ID —— 只断言"校验失败"会让一条规则替另一条背锅。
"""
import copy
import hashlib
import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
FIXTURE = "docs/research/R-26-decision-candidates.fixture.json"
R16 = "docs/research/R-16-vehicle-skeleton.fixture.json"
R21 = "docs/research/R-21-vehicle-tree-mapping.fixture.json"
R17V = "src-experiments/domain-contract-v1/fixtures/vehicle-skeleton.json"
R17F = "src-experiments/domain-contract-v1/fixtures/fl-wheel-end.json"

VERDICTS = {"ACCEPT_CANDIDATE", "BLOCKED_NEEDS_SOURCE", "NEEDS_RP07"}


def load(rel):
    with open(os.path.join(ROOT, rel), encoding="utf-8") as fh:
        return json.load(fh)


def sha256(rel):
    h = hashlib.sha256()
    with open(os.path.join(ROOT, rel), "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


class Check:
    def __init__(self):
        self.violations = []

    def bad(self, rule, code, message):
        self.violations.append({"rule": rule, "code": code, "message": message})


def ctx(d):
    return {
        "a": load(R16), "d21": load(R21),
        "v": load(R17V), "f": load(R17F),
        "r16pi": {x["instanceId"]: x for x in load(R16)["partInstances"]},
        "r16def": {x["id"]: x for x in load(R16)["partDefinitions"]},
        "cf21": {x["id"] for x in load(R21)["conflicts"]},
    }


def t01_refs(c, d, I):
    for dec in d["decisions"]:
        if dec["conflictRef"] not in I["cf21"]:
            c.bad("T01", "CONFLICT_REF_MISSING", dec["conflictRef"])
    for m in d["instMapping"]:
        if m["canonicalPartInstanceId"] and m["canonicalPartInstanceId"] not in I["r16pi"]:
            c.bad("T01", "PI_NOT_IN_R16", m["canonicalPartInstanceId"])
        if m["partId"] not in I["r16def"]:
            c.bad("T01", "PART_NOT_IN_R16", m["partId"])


def t02_verdict_domain(c, d, I):
    for dec in d["decisions"]:
        if dec["verdict"] not in VERDICTS:
            c.bad("T02", "DECISION_VERDICT_INVALID", dec["id"])
        for it in dec["itemVerdicts"]:
            if it["itemVerdict"] not in VERDICTS:
                c.bad("T02", "ITEM_VERDICT_INVALID", dec["id"])


def t03_variant_not_asserted(c, d, I):
    cp = d["canonicalPolicy"]
    if cp.get("variantIdentityAsserted") is not False:
        c.bad("T03", "VARIANT_IDENTITY_ASSERTED", "不得断言两套变型是同一实车")
    if cp.get("variantIdentityNote") is None:
        c.bad("T03", "VARIANT_NOTE_MISSING", "必须说明未对齐")
    dec = next(x for x in d["decisions"] if x["id"] == "D-26-04")
    if dec["verdict"] == "ACCEPT_CANDIDATE":
        c.bad("T03", "CF09_ACCEPTED_WITHOUT_SOURCE", "变型未对齐不得仅作为可接受候选")


def t04_qty_not_multiplied(c, d, I):
    qs = d["qtySemantics"]
    ce = qs["counterexample"]
    if ce["wrongSum"] != ce["instances"] * ce["qtyPerCorner"]:
        c.bad("T04", "COUNTEREXAMPLE_ARITHMETIC_WRONG", str(ce))
    if ce["correctTotal"] != ce["instances"]:
        c.bad("T04", "TOTAL_IS_NOT_INSTANCE_COUNT", str(ce))
    if ce["wrongSum"] == ce["correctTotal"]:
        c.bad("T04", "COUNTEREXAMPLE_NOT_DISTINGUISHING", "反例必须能区分正确与错误算法")
    for q in d["qtyBlockers"]:
        if q["delta"] != q["qtyVehicleTotalInherited"] - q["instantiatedTotalInThisVariant"]:
            c.bad("T04", "DELTA_INCONSISTENT", q["definitionId"])


def t05_qty_blockers_complete(c, d, I):
    src = {q["definitionId"]: q for q in I["a"]["qtyConflicts"]}
    got = {q["definitionId"]: q for q in d["qtyBlockers"]}
    if len(src) != len(d["qtyBlockers"]):
        c.bad("T05", "BLOCKER_COUNT_CHANGED", f"{len(got)} != {len(src)}")
    for pid, q in src.items():
        g = got.get(pid)
        if g is None:
            c.bad("T05", "BLOCKER_DROPPED", pid)
        elif (g["qtyVehicleTotalInherited"] != q["qtyVehicleTotalInherited"]
              or g["instantiatedTotalInThisVariant"] != q["instantiatedTotalInThisVariant"]):
            c.bad("T05", "BLOCKER_ALTERED", pid)
    if d["summary"]["qtyBlockers"] != len(d["qtyBlockers"]):
        c.bad("T05", "BLOCKER_SUMMARY_WRONG", "summary mismatch")


def t06_no_duplicate_identity(c, d, I):
    seen_r17, seen_pi = set(), {}
    for m in d["instMapping"]:
        if m["r17InstanceId"] in seen_r17:
            c.bad("T06", "R17_ID_DUPLICATED", m["r17InstanceId"])
        seen_r17.add(m["r17InstanceId"])
        pid = m["canonicalPartInstanceId"]
        if not pid:
            continue
        key = (m["partId"], m["corner"], m["ordinal"])
        if pid in seen_pi and seen_pi[pid] != key:
            c.bad("T06", "PI_REUSED_FOR_DIFFERENT_PART", pid)
        seen_pi[pid] = key


def t07_reject_without_evidence(c, d, I):
    for m in d["instMapping"]:
        if m["mappingStatus"] == "REJECTED" and m["canonicalPartInstanceId"]:
            c.bad("T07", "REJECTED_BUT_BOUND", m["r17InstanceId"])
        if m["mappingStatus"] == "CONDITIONAL" and not m["canonicalPartInstanceId"]:
            c.bad("T07", "CONDITIONAL_WITHOUT_PI", m["r17InstanceId"])
        if m["mappingStatus"] == "CONDITIONAL" and not m["conditions"]:
            c.bad("T07", "CONDITIONAL_WITHOUT_CONDITION", m["r17InstanceId"])
        if m["mappingStatus"] not in ("CONDITIONAL", "REJECTED"):
            c.bad("T07", "MAPPING_STATUS_INVALID", m["r17InstanceId"])


def t08_layer_separation(c, d, I):
    ls = d["layerSemantics"]
    for k in ("PartDefinition", "PartInstance", "AssemblyDefinition", "AssemblyInstance"):
        if k not in ls:
            c.bad("T08", "LAYER_MISSING", k)
    if ls["PartInstance"]["isPhysicalPiece"] is not True:
        c.bad("T08", "PART_INSTANCE_NOT_PHYSICAL", "PI 必须是一件实物")
    for k in ("PartDefinition", "AssemblyDefinition", "AssemblyInstance"):
        if ls[k]["isPhysicalPiece"] is not False:
            c.bad("T08", "NON_PHYSICAL_LAYER_ESCALATED", k)
    if ls["AssemblyDefinition"]["countR16"] == ls["AssemblyInstance"]["countR16"]:
        c.bad("T08", "ASSEMBLY_LAYERS_COLLAPSED", "定义与实例数量相同，疑似混为一层")


def t09_frame_provenance(c, d, I):
    for f in d["frameProvenance"]:
        if f["hasNonZeroNumericOrigin"] and not f["originValueBasis"]:
            if f["requiredLabel"] != "DEMO_ASSUMPTION":
                c.bad("T09", "UNGRADED_ORIGIN_NOT_DEMO", f["frameId"])
            if f["provenanceStatus"] != "DEMO_UNLABELED":
                c.bad("T09", "PROVENANCE_STATUS_WRONG", f["frameId"])
        if f["originValueBasis"] in ("SOURCED", "SOURCED_SECONDARY"):
            c.bad("T09", "DEMO_ORIGIN_CLAIMED_SOURCED", f["frameId"])


def t10_frame_scope(c, d, I):
    v_ids = {x["frameId"] for x in I["v"]["frames"]}
    f_ids = {x["frameId"] for x in I["f"]["frames"]}
    fs = d["frameScopeReconciliation"]
    if fs["r17VehicleFixtureFrames"] != len(v_ids):
        c.bad("T10", "VEHICLE_FRAME_COUNT_WRONG", str(fs["r17VehicleFixtureFrames"]))
    if fs["r17FlFixtureFrames"] != len(f_ids):
        c.bad("T10", "FL_FRAME_COUNT_WRONG", str(fs["r17FlFixtureFrames"]))
    if fs["flFixtureIsStrictSubsetOfVehicle"] != (f_ids <= v_ids):
        c.bad("T10", "SUBSET_CLAIM_WRONG", "FL 是否子集与原件不符")
    if fs["vehicleOnlyFrames"] != sorted(v_ids - f_ids):
        c.bad("T10", "VEHICLE_ONLY_LIST_WRONG", str(fs["vehicleOnlyFrames"]))
    present = {f["frameId"] for f in d["frameProvenance"]}
    if present != (v_ids | f_ids):
        c.bad("T10", "PROVENANCE_SET_MISMATCH", f"{len(present)} vs {len(v_ids | f_ids)}")
    for f in d["frameProvenance"]:
        want = "BOTH" if (f["frameId"] in v_ids and f["frameId"] in f_ids) else (
            "FL_ONLY" if f["frameId"] in f_ids else "VEHICLE_ONLY")
        if f["fixturePresence"] != want:
            c.bad("T10", "PRESENCE_MISMATCH", f["frameId"])


def t11_placeholder_blocked(c, d, I):
    cf01 = next(x for x in d["decisions"] if x["id"] == "D-26-01")
    broadened = {x["assemblyId"] for x in I["d21"]["assemblyDefinitionMapping"] if x.get("semanticBroadening")}
    drifted = {x["assemblyId"] for x in I["d21"]["assemblyDefinitionMapping"] if x.get("nameDrift")}
    seen = set()
    for it in cf01["itemVerdicts"]:
        seen.add(it["assemblyId"])
        if it["assemblyId"] in broadened and it["itemVerdict"] != "BLOCKED_NEEDS_SOURCE":
            c.bad("T11", "PLACEHOLDER_ACCEPTED_AS_REAL", it["assemblyId"])
    if not broadened <= seen:
        c.bad("T11", "PLACEHOLDER_ITEM_MISSING", str(sorted(broadened - seen)))
    if not drifted <= seen:
        c.bad("T11", "DRIFT_ITEM_MISSING", str(sorted(drifted - seen)))
    if len(cf01["itemVerdicts"]) != len(drifted):
        c.bad("T11", "PLACEHOLDER_ITEM_COUNT_WRONG",
              f"{len(cf01['itemVerdicts'])} != {len(drifted)}")


def t12_parent_drift_recorded(c, d, I):
    drift = [x for x in I["d21"]["partInstanceMapping"] if not x["parentLevelMatch"]]
    cf06 = next(x for x in d["decisions"] if x["id"] == "D-26-02")
    got = {it["r17InstanceId"] for it in cf06["itemVerdicts"]}
    for x in drift:
        if x["r17InstanceId"] not in got:
            c.bad("T12", "PARENT_DRIFT_UNRECORDED", x["r17InstanceId"])
    if len(cf06["itemVerdicts"]) != len(drift):
        c.bad("T12", "PARENT_DRIFT_COUNT_WRONG", f"{len(cf06['itemVerdicts'])} != {len(drift)}")
    if "RP-01" not in cf06["whatCanProceed"]:
        c.bad("T12", "QTY_HIERARCHY_NOT_DECLARED", "必须声明按 RP-01 规范父级算 qty")


def t13_deferred_kinds_distinct(c, d, I):
    got = {p["partId"]: p for p in d["deferredParts"]}
    want = {"PART-20-075": "REQUIRED_BUT_DEFERRED", "PART-40-048": "VARIANT_UNDECIDED"}
    for pid, kind in want.items():
        p = got.get(pid)
        if p is None:
            c.bad("T13", "DEFERRED_PART_MISSING", pid)
        elif p["deferKind"] != kind:
            c.bad("T13", "DEFERRED_KIND_CONFLATED", f"{pid}={p['deferKind']}")
        elif p["hasCanonicalInstance"]:
            c.bad("T13", "DEFERRED_PART_HAS_INSTANCE", pid)


def t14_r21_correction_recorded(c, d, I):
    if not d.get("correctionsToR21"):
        c.bad("T14", "R21_CORRECTION_UNRECORDED", "R-21 fixture 字段缺陷必须登记")
    for x in d["correctionsToR21"]:
        if x.get("r21FileModified") is not False:
            c.bad("T14", "R21_FILE_MODIFIED", "已 approved 的 R-21 不得被改写")
        for k in ("defect", "correction", "impact"):
            if not x.get(k):
                c.bad("T14", "CORRECTION_FIELD_MISSING", f"{x.get('id')}.{k}")


def t15_inputs_readonly_and_intact(c, d, I):
    for x in d["inputs"]:
        if x.get("readOnly") is not True:
            c.bad("T15", "INPUT_NOT_READONLY", x["path"])
        if not os.path.exists(os.path.join(ROOT, x["path"])):
            c.bad("T15", "INPUT_PATH_MISSING", x["path"])
            continue
        actual = sha256(x["path"])
        if x.get("sha256") != actual:
            c.bad("T15", "INPUT_HASH_MISMATCH", x["path"])


def t16_summary_consistency(c, d, I):
    s = d["summary"]
    checks = [
        ("decisions", len(d["decisions"])),
        ("qtyBlockers", len(d["qtyBlockers"])),
        ("deferredParts", len(d["deferredParts"])),
        ("framesTotal", len(d["frameProvenance"])),
        ("corrections", len(d["correctionsToR21"])),
        ("blockers", len(d["blockers"])),
    ]
    for k, n in checks:
        if s.get(k) != n:
            c.bad("T16", "SUMMARY_COUNT_WRONG", f"{k}={s.get(k)} != {n}")
    cond = sum(1 for m in d["instMapping"] if m["mappingStatus"] == "CONDITIONAL")
    rej = sum(1 for m in d["instMapping"] if m["mappingStatus"] == "REJECTED")
    if s.get("instMappingsConditional") != cond:
        c.bad("T16", "SUMMARY_CONDITIONAL_WRONG", str(s.get("instMappingsConditional")))
    if s.get("instMappingsRejected") != rej:
        c.bad("T16", "SUMMARY_REJECTED_WRONG", str(s.get("instMappingsRejected")))


def t17_invariants_enforced(c, d, I):
    inv = d["invariants"]
    must_false = ("sourceFilesModified", "variantIdentityAsserted", "qtyPerCornerMultiplied",
                  "dormanInstalledInVehicle")
    must_zero = ("fakeInstancesCreated", "geometryClaimedSourced", "newPersistentPorts")
    for k in must_false:
        if inv.get(k) is not False:
            c.bad("T17", "INVARIANT_FALSE_BROKEN", k)
    for k in must_zero:
        if inv.get(k) != 0:
            c.bad("T17", "INVARIANT_ZERO_BROKEN", k)
    if inv.get("r21ApprovedFilesUntouched") is not True:
        c.bad("T17", "R21_TOUCHED", "已验收 R-21 必须保持未改")


def t18_hub_role_semantics(c, d, I):
    h = d["r18HubSemantics"]
    if h["poseKind"] != "ROLE_MARKER_NOT_RIGID_PART_POSE":
        c.bad("T18", "HUB_POSE_CLAIMED_RIGID", h["poseKind"])
    if h.get("agreeWithR27CandidateRoleBinding") is not True:
        c.bad("T18", "ROLE_BINDING_DISAGREEMENT_UNRECORDED", "必须明确表态")
    if h.get("r18InstanceIdStatus") != "CANDIDATE_NOT_FROZEN":
        c.bad("T18", "R18_STATUS_UPGRADED", str(h.get("r18InstanceIdStatus")))


def t19_blockers_traceable(c, d, I):
    for b in d["blockers"]:
        for k in ("id", "topic", "owner", "effect"):
            if not b.get(k):
                c.bad("T19", "BLOCKER_FIELD_MISSING", f"{b.get('id')}.{k}")
    ids = [b["id"] for b in d["blockers"]]
    if len(ids) != len(set(ids)):
        c.bad("T19", "BLOCKER_ID_DUPLICATE", "duplicate ids")


def t20_no_geometry_claim(c, d, I):
    if d["canonicalPolicy"].get("geometryClaim") != "NONE_ALL_INSTANCES_GEOMETRY_PENDING":
        c.bad("T20", "GEOMETRY_CLAIM_RAISED", str(d["canonicalPolicy"].get("geometryClaim")))
    for f in d["frameProvenance"]:
        if f["provenanceStatus"] == "GRADED" and f["originValueBasis"] in ("SOURCED", "SOURCED_SECONDARY"):
            c.bad("T20", "FRAME_GRADED_SOURCED", f["frameId"])


RULES = [
    ("T01", t01_refs), ("T02", t02_verdict_domain), ("T03", t03_variant_not_asserted),
    ("T04", t04_qty_not_multiplied), ("T05", t05_qty_blockers_complete), ("T06", t06_no_duplicate_identity),
    ("T07", t07_reject_without_evidence), ("T08", t08_layer_separation), ("T09", t09_frame_provenance),
    ("T10", t10_frame_scope), ("T11", t11_placeholder_blocked), ("T12", t12_parent_drift_recorded),
    ("T13", t13_deferred_kinds_distinct), ("T14", t14_r21_correction_recorded),
    ("T15", t15_inputs_readonly_and_intact), ("T16", t16_summary_consistency),
    ("T17", t17_invariants_enforced), ("T18", t18_hub_role_semantics),
    ("T19", t19_blockers_traceable), ("T20", t20_no_geometry_claim),
]


def run(d):
    c = Check()
    I = ctx(d)
    for _, fn in RULES:
        fn(c, d, I)
    return c, I


def mutations(d, I):
    out = []

    def add(rule, name, fn):
        m = copy.deepcopy(d)
        fn(m)
        out.append((rule, name, m))

    DEC_ID = {"CF-01": "D-26-01", "CF-06": "D-26-02", "CF-07": "D-26-03", "CF-09": "D-26-04"}

    def dec(m, ref):
        return next(x for x in m["decisions"] if x["id"] == DEC_ID[ref])

    def imap(m, pred=None):
        return next(x for x in m["instMapping"] if pred is None or pred(x))

    def frame(m, pred):
        return next(x for x in m["frameProvenance"] if pred(x))

    # T01
    add("T01", "conflict ref points to nonexistent conflict",
        lambda m: dec(m, "CF-01").__setitem__("conflictRef", "CF-99"))
    add("T01", "mapping claims a PI that does not exist",
        lambda m: imap(m).__setitem__("canonicalPartInstanceId", "PI-99-999-FL"))
    # T02
    add("T02", "decision verdict outside allowed domain",
        lambda m: m["decisions"][0].__setitem__("verdict", "APPROVED"))
    add("T02", "item verdict outside allowed domain",
        lambda m: m["decisions"][0]["itemVerdicts"][0].__setitem__("itemVerdict", "PASS"))
    # T03
    add("T03", "two variants asserted to be the same vehicle",
        lambda m: m["canonicalPolicy"].__setitem__("variantIdentityAsserted", True))
    add("T03", "CF-09 waved through as acceptable candidate",
        lambda m: dec(m, "CF-09").__setitem__("verdict", "ACCEPT_CANDIDATE"))
    # T04
    add("T04", "vehicle total replaced by per-instance multiplication",
        lambda m: m["qtySemantics"]["counterexample"].__setitem__("correctTotal", 100))
    add("T04", "blocker delta inconsistent with inherited minus instantiated",
        lambda m: m["qtyBlockers"][0].__setitem__("delta", 99))
    # T05
    add("T05", "one of the 12 qty blockers silently dropped",
        lambda m: m["qtyBlockers"].pop())
    add("T05", "qty blocker value altered",
        lambda m: m["qtyBlockers"][0].__setitem__("qtyVehicleTotalInherited", 999))
    # T06
    add("T06", "same R-17 instance mapped twice",
        lambda m: m["instMapping"].append(copy.deepcopy(m["instMapping"][0])))
    add("T06", "same PI reused for a different part/corner",
        lambda m: m["instMapping"][1].__setitem__("canonicalPartInstanceId",
                                                  m["instMapping"][0]["canonicalPartInstanceId"]))
    # T07
    add("T07", "rejected mapping still carries a canonical PI",
        lambda m: imap(m, lambda x: x["mappingStatus"] == "REJECTED").__setitem__(
            "canonicalPartInstanceId", "PI-30-006-FL"))
    add("T07", "conditional mapping has no conditions",
        lambda m: imap(m, lambda x: x["mappingStatus"] == "CONDITIONAL").__setitem__("conditions", []))
    # T08
    add("T08", "PartDefinition escalated to physical piece",
        lambda m: m["layerSemantics"]["PartDefinition"].__setitem__("isPhysicalPiece", True))
    add("T08", "assembly definition and instance collapsed into one count",
        lambda m: m["layerSemantics"]["AssemblyDefinition"].__setitem__(
            "countR16", m["layerSemantics"]["AssemblyInstance"]["countR16"]))
    # T09
    add("T09", "ungraded numeric origin loses its DEMO label",
        lambda m: frame(m, lambda x: x["provenanceStatus"] == "DEMO_UNLABELED").__setitem__(
            "requiredLabel", None))
    add("T09", "demo origin relabelled as sourced",
        lambda m: frame(m, lambda x: x["provenanceStatus"] == "DEMO_UNLABELED").__setitem__(
            "originValueBasis", "SOURCED"))
    # T10
    add("T10", "FL frame count inflated",
        lambda m: m["frameScopeReconciliation"].__setitem__("r17FlFixtureFrames", 27))
    add("T10", "fixture presence flipped to vehicle-only",
        lambda m: frame(m, lambda x: x["fixturePresence"] == "BOTH").__setitem__(
            "fixturePresence", "VEHICLE_ONLY"))
    # T11
    add("T11", "placeholder assembly accepted as real assembly",
        lambda m: next(it for it in dec(m, "CF-01")["itemVerdicts"]
                       if it["assemblyId"] == "ASSY-70-001").__setitem__(
            "itemVerdict", "ACCEPT_CANDIDATE"))
    add("T11", "placeholder item removed from decision",
        lambda m: dec(m, "CF-01")["itemVerdicts"].pop())
    # T12
    add("T12", "parent drift item dropped from CF-06 decision",
        lambda m: dec(m, "CF-06")["itemVerdicts"].pop())
    add("T12", "qty hierarchy no longer declares RP-01",
        lambda m: dec(m, "CF-06").__setitem__("whatCanProceed", "按任意一侧层级算即可"))
    # T13
    add("T13", "two different DEFERRED causes conflated",
        lambda m: next(p for p in m["deferredParts"] if p["partId"] == "PART-40-048").__setitem__(
            "deferKind", "REQUIRED_BUT_DEFERRED"))
    add("T13", "deferred part claims a canonical instance",
        lambda m: m["deferredParts"][0].__setitem__("hasCanonicalInstance", True))
    # T14
    add("T14", "R-21 correction silently dropped",
        lambda m: m.__setitem__("correctionsToR21", []))
    add("T14", "R-21 approved file claimed as modified",
        lambda m: m["correctionsToR21"][0].__setitem__("r21FileModified", True))
    # T15
    add("T15", "input hash falsified",
        lambda m: m["inputs"][0].__setitem__("sha256", "0" * 64))
    add("T15", "input marked writable",
        lambda m: m["inputs"][0].__setitem__("readOnly", False))
    # T16
    add("T16", "summary blocker count falsified",
        lambda m: m["summary"].__setitem__("qtyBlockers", 0))
    # T17
    add("T17", "fake instances invariant broken",
        lambda m: m["invariants"].__setitem__("fakeInstancesCreated", 3))
    add("T17", "R-21 marked as touched",
        lambda m: m["invariants"].__setitem__("r21ApprovedFilesUntouched", False))
    # T18
    add("T18", "hub role pose promoted to rigid part pose",
        lambda m: m["r18HubSemantics"].__setitem__("poseKind", "RIGID_PART_POSE"))
    add("T18", "R-18 candidate id status upgraded",
        lambda m: m["r18HubSemantics"].__setitem__("r18InstanceIdStatus", "FROZEN"))
    # T19
    add("T19", "duplicate blocker id",
        lambda m: m["blockers"].append(copy.deepcopy(m["blockers"][0])))
    # T20
    add("T20", "geometry claim raised above none",
        lambda m: m["canonicalPolicy"].__setitem__("geometryClaim", "SOME_SOURCED"))
    return out


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "validate"
    out_path = None
    if "--out" in sys.argv:
        out_path = sys.argv[sys.argv.index("--out") + 1]
    d = load(FIXTURE)

    if mode == "validate":
        c, _ = run(d)
        ok = not c.violations
        print("R-26 DECISION VALIDATION: %s" % ("PASS" if ok else "FAIL"))
        for v in c.violations[:30]:
            print("  [%s] %s: %s" % (v["rule"], v["code"], v["message"]))
        if out_path:
            with open(os.path.join(ROOT, out_path), "w", encoding="utf-8", newline="\n") as fh:
                json.dump({"taskId": "R-26", "mode": "validate", "verdict": "PASS" if ok else "FAIL",
                           "violationCount": len(c.violations), "violations": c.violations},
                          fh, ensure_ascii=False, indent=2)
            print("  written:", out_path)
        return 0 if ok else 1

    if mode == "selftest":
        I = ctx(d)
        base, _ = run(d)
        caught, missed = 0, []
        for rule, name, m in mutations(d, I):
            c, _ = run(m)
            hit = {v["rule"] for v in c.violations}
            if rule in hit:
                caught += 1
            else:
                missed.append((rule, name, sorted(hit)))
        total = caught + len(missed)
        print("R-26 SELFTEST: %s — %d caught / %d missed / %d total"
              % ("PASS" if not missed else "FAIL", caught, len(missed), total))
        for r, n, hit in missed:
            print("  MISSED [%s] %s (got: %s)" % (r, n, hit))
        covered = {r for r, _ in RULES if any(v["rule"] == r for v in base.violations)} | \
                  {r for r, _, _ in mutations(d, I)}
        print("  rule coverage: %d/%d" % (len(covered), len(RULES)))
        if out_path:
            with open(os.path.join(ROOT, out_path), "w", encoding="utf-8", newline="\n") as fh:
                json.dump({"taskId": "R-26", "mode": "selftest",
                           "verdict": "PASS" if not missed else "FAIL",
                           "caught": caught, "missed": len(missed), "total": total,
                           "missedCases": [{"rule": r, "name": n, "hit": h} for r, n, h in missed],
                           "ruleCoverage": "%d/%d" % (len(covered), len(RULES))},
                          fh, ensure_ascii=False, indent=2)
            print("  written:", out_path)
        return 0 if not missed else 1

    print("usage: r26_decision_tool.py [validate|selftest] [--out <path>]")
    return 2


if __name__ == "__main__":
    sys.exit(main())
