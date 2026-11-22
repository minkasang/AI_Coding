#!/usr/bin/env python3
"""R-46 转向左右子总成候选校验器：16 条规则 + 负例自检（stdlib only）。"""
import copy
import hashlib
import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
FIXTURE = "docs/research/R-46-steering-corner-assembly-candidate.fixture.json"
R16 = "docs/research/R-16-vehicle-skeleton.fixture.json"
SNAP = "src-experiments/vehicle-snapshot-v1/fixtures/vehicle-snapshot.json"
PARTS = ("PART-20-074", "PART-20-075", "PART-20-076", "PART-20-077", "PART-20-078")


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
    a = load(R16)
    return {
        "a": a, "snap": load(SNAP),
        "asm": {x["id"]: x for x in a["assemblies"]},
        "ai": {x["instanceId"]: x for x in a["assemblyInstances"]},
        "defs": {x["id"]: x for x in a["partDefinitions"]},
        "pi": a["partInstances"],
        "fr": {x["frameId"]: x for x in a["mountFrames"]},
    }


def z01_baseline(c, d, I):
    if d["baseline"]["central"]["assemblyDefinitionId"] not in I["asm"]:
        c.bad("Z01", "CENTRAL_ASSEMBLY_MISSING", d["baseline"]["central"]["assemblyDefinitionId"])
    if d["baseline"]["central"]["instanceId"] not in I["ai"]:
        c.bad("Z01", "CENTRAL_INSTANCE_MISSING", d["baseline"]["central"]["instanceId"])
    if d["baseline"]["central"]["mountFrameId"] not in I["fr"]:
        c.bad("Z01", "CENTRAL_FRAME_MISSING", d["baseline"]["central"]["mountFrameId"])
    live = sorted(p["instanceId"] for p in I["pi"] if p["assemblyInstanceId"] == "AI-20-014-VEH")
    if d["baseline"]["central"]["childPartInstances"] != live:
        c.bad("Z01", "CENTRAL_CHILDREN_MISMATCH", "与 R-16 实际子件不一致")


def z02_central_single(c, d, I):
    ce = d["baseline"]["central"]
    live_count = sum(1 for x in I["a"]["assemblyInstances"] if x["assemblyId"] == "ASSY-20-014")
    if ce["instanceCount"] != 1:
        c.bad("Z02", "CENTRAL_INSTANCE_COUNT_CHANGED", str(ce["instanceCount"]))
    if live_count != 1:
        c.bad("Z02", "SOURCE_CENTRAL_COUNT_NOT_ONE", str(live_count))
    if ce["corner"] != "VEH":
        c.bad("Z02", "CENTRAL_CORNER_CHANGED", ce["corner"])
    if ce["unchanged"] is not True:
        c.bad("Z02", "CENTRAL_CLAIMED_MODIFIED", "中央总成必须保持原状")
    if d["candidateTree"]["central"]["instanceId"] != ce["instanceId"]:
        c.bad("Z02", "CENTRAL_INSTANCE_INCONSISTENT", "两处不一致")


def z03_sides(c, d, I):
    subs = d["candidateTree"]["subAssemblies"]
    if len(subs) != 2:
        c.bad("Z03", "SIDE_SET_INCOMPLETE", str(len(subs)))
    corners = [s["corner"] for s in subs]
    if sorted(corners) != ["FL", "FR"]:
        c.bad("Z03", "SIDE_CORNERS_WRONG", str(corners))
    ids = [s["candidateAssemblyDefinitionId"] for s in subs]
    if len(set(ids)) != len(ids):
        c.bad("Z03", "SUB_ASSEMBLY_ID_DUPLICATE", "duplicate")
    for s in subs:
        if s["parentAssemblyDefinitionId"] != "ASSY-20-014":
            c.bad("Z03", "SUB_ASSEMBLY_PARENT_WRONG", s["candidateAssemblyDefinitionId"])


def z04_sub_instance(c, d, I):
    for s in d["candidateTree"]["subAssemblies"]:
        sid = s["candidateAssemblyInstanceId"]
        if not sid:
            c.bad("Z04", "SUB_ASSEMBLY_INSTANCE_MISSING", s["candidateAssemblyDefinitionId"])
            continue
        if not sid.endswith("-" + s["corner"]):
            c.bad("Z04", "SUB_INSTANCE_CORNER_MISMATCH", sid)
        if s["cornerScopeStatus"] != "CANDIDATE_DECLARED":
            c.bad("Z04", "SUB_CORNER_SCOPE_UNDECLARED", sid)


def z05_frames(c, d, I):
    frames = []
    for s in d["candidateTree"]["subAssemblies"]:
        f = s["candidateMountFrameId"]
        if not f:
            c.bad("Z05", "SUB_ASSEMBLY_FRAME_MISSING", s["corner"])
            continue
        frames.append(f)
        if not f.endswith("-" + s["corner"]):
            c.bad("Z05", "FRAME_CORNER_MISMATCH", f)
        if s["worldFrame"] != "UNFROZEN_PENDING_RP07":
            c.bad("Z05", "WORLD_FRAME_CLAIMED_FROZEN", s["worldFrame"])
    if len(set(frames)) != len(frames):
        c.bad("Z05", "FRAMES_SHARED_BETWEEN_SIDES", str(frames))


def z06_part_coverage(c, d, I):
    seen = {}
    for s in d["candidateTree"]["subAssemblies"]:
        for p in s["parts"]:
            key = (p["partId"], s["corner"])
            seen[key] = seen.get(key, 0) + 1
    for pid in PARTS:
        for corner in ("FL", "FR"):
            if seen.get((pid, corner), 0) != 1:
                c.bad("Z06", "PART_PER_SIDE_NOT_ONE", f"{pid}@{corner}={seen.get((pid, corner), 0)}")


def z07_parent_link(c, d, I):
    for s in d["candidateTree"]["subAssemblies"]:
        for p in s["parts"]:
            if p["parentCandidateAssemblyInstanceId"] != s["candidateAssemblyInstanceId"]:
                c.bad("Z07", "CORNER_PARENT_MISMATCH", p["candidateInstanceId"])
            if p["corner"] != s["corner"]:
                c.bad("Z07", "PART_CORNER_MISMATCH", p["candidateInstanceId"])


def z08_diagonal(c, d, I):
    for s in d["candidateTree"]["subAssemblies"]:
        for p in s["parts"]:
            if p["parentCandidateAssemblyInstanceId"].rsplit("-", 1)[-1] != p["corner"]:
                c.bad("Z08", "DIAGONAL_RULE_BROKEN", p["candidateInstanceId"])


def z09_totals(c, d, I):
    got = {t["partId"]: t for t in d["totalsCheck"]}
    for pid in PARTS:
        t = got.get(pid)
        if not t:
            c.bad("Z09", "TOTAL_ROW_MISSING", pid)
            continue
        live_qty = I["defs"][pid]["qtyVehicleTotal"]
        if t["qtyVehicleTotal"] != live_qty:
            c.bad("Z09", "QTY_BASELINE_MISMATCH", pid)
        cand = sum(1 for s in d["candidateTree"]["subAssemblies"]
                   for p in s["parts"] if p["partId"] == pid)
        cent = sum(1 for p in I["pi"]
                   if p["assemblyInstanceId"] == "AI-20-014-VEH" and p["definitionId"] == pid)
        if t["candidateInstances"] != cand or t["instancesInCentral"] != cent:
            c.bad("Z09", "TOTAL_ROW_FALSIFIED", pid)
        if cand + cent != live_qty:
            c.bad("Z09", "PART_QTY_UNBALANCED", f"{pid}: {cand}+{cent} != {live_qty}")
        if cent != 0:
            c.bad("Z09", "DOUBLE_COUNTED", pid)
        if t["doubleCounted"] != (cent != 0):
            c.bad("Z09", "DOUBLE_COUNT_FLAG_WRONG", pid)


def z10_central_children(c, d, I):
    live = sorted(p["instanceId"] for p in I["pi"] if p["assemblyInstanceId"] == "AI-20-014-VEH")
    if d["baseline"]["central"]["childPartInstances"] != live:
        c.bad("Z10", "CENTRAL_CHILDREN_CHANGED", "中央 VEH 子件被改动")
    if d["baseline"]["central"]["childPartInstanceCount"] != len(live):
        c.bad("Z10", "CENTRAL_CHILD_COUNT_WRONG", str(d["baseline"]["central"]["childPartInstanceCount"]))
    for pid in PARTS:
        if any(p["instanceId"] in live for p in I["pi"] if p["definitionId"] == pid):
            c.bad("Z10", "PER_CORNER_PART_ALREADY_CENTRAL", pid)


def z11_candidate_ids(c, d, I):
    for s in d["candidateTree"]["subAssemblies"]:
        ids = [s["candidateAssemblyDefinitionId"], s["candidateAssemblyInstanceId"], s["candidateMountFrameId"]]
        ids += [p["candidateInstanceId"] for p in s["parts"]]
        for i in ids:
            if not i or not i.startswith("CAND-"):
                c.bad("Z11", "CANDIDATE_ID_NOT_NAMESPACED", str(i))
    if d["compatibility"]["candidateIdsAreCanonical"] is not False:
        c.bad("Z11", "CANDIDATE_CLAIMED_CANONICAL", "候选 ID 不是正式身份")


def z12_geometry(c, d, I):
    for s in d["candidateTree"]["subAssemblies"]:
        for p in s["parts"]:
            live = I["defs"][p["partId"]]
            if p["geometryBasis"] != live["geometryBasis"]:
                c.bad("Z12", "GEOMETRY_BASIS_ALTERED", p["partId"])
            if p["geometryStatus"] != live["geometryStatus"]:
                c.bad("Z12", "GEOMETRY_STATUS_ALTERED", p["partId"])
            if p["geometryBasis"] in ("SOURCED", "SOURCED_SECONDARY"):
                c.bad("Z12", "GEOMETRY_UPGRADED", p["partId"])


def z13_relation(c, d, I):
    nr = d["newRelation"]
    if not nr.get("rule") or not nr.get("whyNeeded"):
        c.bad("Z13", "NEW_RELATION_UNDOCUMENTED", "必须写清规则与理由")
    dnb = nr.get("doesNotBreakExistingGuards") or {}
    if dnb.get("newRelationIsAdditive") is not True or not dnb.get("checked"):
        c.bad("Z13", "GUARD_IMPACT_UNDOCUMENTED", "必须记录对现有校验的影响")
    if not nr.get("alternativeRejected"):
        c.bad("Z13", "ALTERNATIVE_NOT_RECORDED", "被否掉的方案要写原因")
    prec = d["structurePrecedent"]
    if not prec.get("caseA") or not prec.get("caseB"):
        c.bad("Z13", "PRECEDENT_INCOMPLETE", "需给两类结构先例")


def z14_snapshot(c, d, I):
    comp = d["compatibility"]
    if comp["snapshotModified"] is not False:
        c.bad("Z14", "SNAPSHOT_MODIFIED", "快照必须只读")
    if comp["r16SourceModified"] is not False:
        c.bad("Z14", "SOURCE_CLAIMED_MODIFIED", "R-16 不得被改写")
    live = I["snap"]
    if comp["snapshotRevision"] != live["revision"] or comp["snapshotStatus"] != live["status"]:
        c.bad("Z14", "SNAPSHOT_VERSION_MISMATCH", f"{comp['snapshotRevision']}/{comp['snapshotStatus']}")
    if d["baseline"]["snapshot"]["snapshotId"] != live["snapshotId"]:
        c.bad("Z14", "SNAPSHOT_ID_MISMATCH", d["baseline"]["snapshot"]["snapshotId"])
    if d["invariants"]["snapshotModified"] is not False:
        c.bad("Z14", "SNAPSHOT_INVARIANT_BROKEN", "invariants")


def z15_negatives(c, d, I):
    ids = {n["id"] for n in d["negativeCases"]}
    must = {"N-46-01", "N-46-02", "N-46-03"}
    if not must <= ids:
        c.bad("Z15", "REQUIRED_NEGATIVE_CASE_MISSING", str(sorted(must - ids)))
    if len(d["negativeCases"]) < 10:
        c.bad("Z15", "NEGATIVE_CASE_SET_TOO_SMALL", str(len(d["negativeCases"])))
    if not d["positiveCases"]:
        c.bad("Z15", "POSITIVE_CASES_MISSING", "empty")


def z16_inputs(c, d, I):
    for x in d["inputs"]:
        if x.get("readOnly") is not True:
            c.bad("Z16", "INPUT_NOT_READONLY", x["path"])
        if not os.path.exists(os.path.join(ROOT, x["path"])):
            c.bad("Z16", "INPUT_PATH_MISSING", x["path"])
            continue
        if x["hashPolicy"] == "REQUIRED" and x.get("sha256") != sha256(x["path"]):
            c.bad("Z16", "INPUT_HASH_MISMATCH", x["path"])
    inv = d["invariants"]
    for k in ("r16Modified", "snapshotModified", "geometryUpgraded", "canonicalIdsClaimed", "playbackAuthorised"):
        if inv.get(k) is not False:
            c.bad("Z16", "INVARIANT_FALSE_BROKEN", k)
    if inv.get("formalInstancesCreated") != 0:
        c.bad("Z16", "INVARIANT_ZERO_BROKEN", "formalInstancesCreated")


RULES = [
    ("Z01", z01_baseline), ("Z02", z02_central_single), ("Z03", z03_sides),
    ("Z04", z04_sub_instance), ("Z05", z05_frames), ("Z06", z06_part_coverage),
    ("Z07", z07_parent_link), ("Z08", z08_diagonal), ("Z09", z09_totals),
    ("Z10", z10_central_children), ("Z11", z11_candidate_ids), ("Z12", z12_geometry),
    ("Z13", z13_relation), ("Z14", z14_snapshot), ("Z15", z15_negatives),
    ("Z16", z16_inputs),
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

    def sub(m, corner="FL"):
        return next(s for s in m["candidateTree"]["subAssemblies"] if s["corner"] == corner)

    # Z01
    add("Z01", "central child list falsified", lambda m: m["baseline"]["central"].__setitem__(
        "childPartInstances", ["PI-20-066-VEH"]))
    # Z02
    add("Z02", "central assembly duplicated", lambda m: m["baseline"]["central"].__setitem__(
        "instanceCount", 2))
    add("Z02", "central corner changed to FL", lambda m: m["baseline"]["central"].__setitem__(
        "corner", "FL"))
    add("Z02", "central claimed modified", lambda m: m["baseline"]["central"].__setitem__(
        "unchanged", False))
    # Z03
    add("Z03", "right side sub-assembly removed", lambda m: m["candidateTree"]["subAssemblies"].pop())
    add("Z03", "both sides declared FL", lambda m: sub(m, "FR").__setitem__("corner", "FL"))
    # Z04
    add("Z04", "sub-assembly instance corner mismatch", lambda m: sub(m, "FL").__setitem__(
        "candidateAssemblyInstanceId", "CAND-AI-20-014-FR"))
    add("Z04", "sub-assembly corner scope undeclared", lambda m: sub(m, "FL").__setitem__(
        "cornerScopeStatus", "ASSUMED"))
    # Z05
    add("Z05", "sub-assembly frame missing", lambda m: sub(m, "FR").__setitem__(
        "candidateMountFrameId", None))
    add("Z05", "world frame claimed frozen", lambda m: sub(m, "FL").__setitem__(
        "worldFrame", "FROZEN"))
    # Z06
    add("Z06", "left part duplicated on same side", lambda m: sub(m, "FL")["parts"].append(
        copy.deepcopy(sub(m, "FL")["parts"][0])))
    # Z07
    add("Z07", "left part linked to right sub-assembly (LR mismatch)",
        lambda m: sub(m, "FL")["parts"][0].__setitem__(
            "parentCandidateAssemblyInstanceId", "CAND-AI-20-014-FR"))
    add("Z07", "part corner disagrees with side", lambda m: sub(m, "FL")["parts"][0].__setitem__(
        "corner", "FR"))
    # Z08
    def _break_diagonal(m):
        s = sub(m, "FL")
        s["parts"][0]["parentCandidateAssemblyInstanceId"] = "CAND-AI-20-014-VEH"
    add("Z08", "diagonal rule broken by parent id", _break_diagonal)
    # Z09
    add("Z09", "total row falsified", lambda m: m["totalsCheck"][0].__setitem__(
        "instancesInCentral", 1))
    add("Z09", "part qty unbalanced", lambda m: sub(m, "FR")["parts"].pop())
    # Z10
    add("Z10", "central child list dropped an entry", lambda m: m["baseline"]["central"].__setitem__(
        "childPartInstanceCount", 12))
    # Z11
    add("Z11", "candidate id claims canonical prefix", lambda m: sub(m, "FL").__setitem__(
        "candidateAssemblyDefinitionId", "ASSY-20-017"))
    add("Z11", "candidate ids claimed canonical", lambda m: m["compatibility"].__setitem__(
        "candidateIdsAreCanonical", True))
    # Z12
    add("Z12", "unknown geometry upgraded to sourced", lambda m: sub(m, "FL")["parts"][0].__setitem__(
        "geometryBasis", "SOURCED"))
    add("Z12", "geometry status upgraded to ready", lambda m: sub(m, "FR")["parts"][0].__setitem__(
        "geometryStatus", "GEOMETRY_READY"))
    # Z13
    add("Z13", "new relation rule undocumented", lambda m: m["newRelation"].__setitem__("rule", ""))
    add("Z13", "guard impact undocumented", lambda m: m["newRelation"].__setitem__(
        "doesNotBreakExistingGuards", {}))
    # Z14
    add("Z14", "snapshot claimed modified", lambda m: m["compatibility"].__setitem__(
        "snapshotModified", True))
    add("Z14", "r16 claimed modified", lambda m: m["compatibility"].__setitem__(
        "r16SourceModified", True))
    # Z15
    add("Z15", "geometry-upgrade negative case removed", lambda m: m.__setitem__(
        "negativeCases", [n for n in m["negativeCases"] if n["id"] != "N-46-03"]))
    # Z16
    add("Z16", "input hash falsified", lambda m: m["inputs"][0].__setitem__("sha256", "0" * 64))
    add("Z16", "formal instances claimed created", lambda m: m["invariants"].__setitem__(
        "formalInstancesCreated", 10))
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
        print("R-46 CORNER CANDIDATE VALIDATION: %s" % ("PASS" if ok else "FAIL"))
        for v in c.violations[:30]:
            print("  [%s] %s: %s" % (v["rule"], v["code"], v["message"]))
        if out_path:
            with open(os.path.join(ROOT, out_path), "w", encoding="utf-8", newline="\n") as fh:
                json.dump({"taskId": "R-46", "mode": "validate", "verdict": "PASS" if ok else "FAIL",
                           "violationCount": len(c.violations), "violations": c.violations},
                          fh, ensure_ascii=False, indent=2)
            print("  written:", out_path)
        return 0 if ok else 1

    if mode == "selftest":
        I = ctx(d)
        caught, missed = 0, []
        for rule, name, m in mutations(d, I):
            c, _ = run(m)
            hit = {v["rule"] for v in c.violations}
            if rule in hit:
                caught += 1
            else:
                missed.append((rule, name, sorted(hit)))
        total = caught + len(missed)
        print("R-46 SELFTEST: %s — %d caught / %d missed / %d total"
              % ("PASS" if not missed else "FAIL", caught, len(missed), total))
        for r, n, hit in missed:
            print("  MISSED [%s] %s (got: %s)" % (r, n, hit))
        covered = {r for r, _, _ in mutations(d, I)}
        print("  rule coverage: %d/%d" % (len(covered), len(RULES)))
        if out_path:
            with open(os.path.join(ROOT, out_path), "w", encoding="utf-8", newline="\n") as fh:
                json.dump({"taskId": "R-46", "mode": "selftest",
                           "verdict": "PASS" if not missed else "FAIL",
                           "caught": caught, "missed": len(missed), "total": total,
                           "missedCases": [{"rule": r, "name": n, "hit": h} for r, n, h in missed],
                           "ruleCoverage": "%d/%d" % (len(covered), len(RULES))},
                          fh, ensure_ascii=False, indent=2)
            print("  written:", out_path)
        return 0 if not missed else 1

    print("usage: r46_candidate_tool.py [validate|selftest] [--out <path>]")
    return 2


if __name__ == "__main__":
    sys.exit(main())
